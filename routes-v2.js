// routes-v2.js — Routes des évolutions : projection patrimoniale, analyse de
// positions (historique 3 ans + actualités), abonnements récurrents et
// opportunités immobilières.
//
// Montées depuis server.js :
//   const setupV2Routes = require('./routes-v2');
//   setupV2Routes(app, db, requireAuth);

const { projectAccount, projectProperty, aggregateTotals } = require('./projection');
const { computeCashflow } = require('./cashflow');
const { isPortfolio } = require('./financial');
const { fetchHistory3y, fetchNews, expectedRateFromHistory } = require('./api-providers/history');
const { analyzeBankCsv } = require('./subscriptions');
const { simulateOpportunity, maxLoanYears } = require('./real-estate');
const { calculerIR } = require('./tax');
const { defaultFeesFor } = require('./investment-tax');

module.exports = function setupV2Routes(app, db, requireAuth) {

  // --- Helpers ---------------------------------------------------------------

  function getFoyer(userId) {
    return db.prepare('SELECT * FROM foyer_fiscal WHERE user_id = ?').get(userId) || null;
  }

  function getUserTaxContext(userId) {
    const foyer = getFoyer(userId) || { situation_maritale: 'celibataire' };
    const revenus = db.prepare('SELECT * FROM revenus WHERE user_id = ?').all(userId);
    const ir = calculerIR({ foyer, revenus });
    const situation = String(foyer.situation_maritale || '').toLowerCase();
    return {
      tmi: ir.tmi,
      isCouple: situation === 'marie' || situation === 'pacse',
      birthYear: Number(foyer.birth_year) || null
    };
  }

  function getPositionOwned(positionId, userId) {
    return db.prepare(`
      SELECT p.* FROM positions p
      JOIN financial_accounts a ON a.id = p.account_id
      WHERE p.id = ? AND a.user_id = ?
    `).get(positionId, userId);
  }

  // Taux attendu d'un portefeuille : moyenne pondérée (par valeur) des CAGR
  // 3 ans des positions dont on a pu récupérer l'historique.
  async function portfolioExpectedRate(positions) {
    let weighted = 0, totalValue = 0, covered = 0;
    const perPosition = [];
    for (const p of positions) {
      const value = (Number(p.quantity) || 0) * (Number(p.current_price) || 0);
      if (!p.ticker || !p.ticker.trim() || value <= 0) continue;
      try {
        const h = await fetchHistory3y(p.ticker.trim());
        const rate = expectedRateFromHistory(h);
        weighted += rate * value;
        covered += value;
        perPosition.push({ ticker: p.ticker, cagrPct: h.cagrPct, usedRatePct: rate });
      } catch { /* position sans historique : ignorée dans la moyenne */ }
      totalValue += value;
    }
    if (covered <= 0 || totalValue <= 0) return { ratePct: null, perPosition };
    // Les positions sans historique héritent de la moyenne des autres
    return { ratePct: weighted / covered, perPosition };
  }

  // --- Projection patrimoniale -------------------------------------------------

  // GET /api/projection?years=20&immoRate=1
  // Projette tous les placements (frais + fiscalité de sortie) et tous les
  // biens sur N années. Les portefeuilles utilisent le CAGR 3 ans des positions.
  app.get('/api/projection', requireAuth, async (req, res) => {
    try {
      const years = Math.max(1, Math.min(40, parseInt(req.query.years) || 20));
      const parsedImmoRate = parseFloat(req.query.immoRate);
      const immoRate = Math.max(-5, Math.min(10, Number.isFinite(parsedImmoRate) ? parsedImmoRate : 1));
      const ctx = getUserTaxContext(req.session.userId);

      const accounts = db.prepare('SELECT * FROM financial_accounts WHERE user_id = ? ORDER BY id')
                         .all(req.session.userId);
      const accountProjections = [];
      for (const a of accounts) {
        const positions = isPortfolio(a.account_type)
          ? db.prepare('SELECT * FROM positions WHERE account_id = ?').all(a.id)
          : [];
        let expectedRatePct = null;
        let marketData = null;
        if (isPortfolio(a.account_type) && positions.length > 0) {
          const r = await portfolioExpectedRate(positions);
          expectedRatePct = r.ratePct;
          marketData = r.perPosition.length ? r.perPosition : null;
        }
        const proj = projectAccount(a, positions, years, {
          expectedRatePct, isCouple: ctx.isCouple, tmi: ctx.tmi
        });
        accountProjections.push({
          id: a.id, label: a.label, accountType: a.account_type,
          ratePct: Math.round(proj.ratePct * 100) / 100,
          rateSource: expectedRatePct != null ? 'historique 3 ans' : 'taux saisi / défaut',
          marketData,
          series: proj.series
        });
      }

      const properties = db.prepare('SELECT * FROM properties WHERE user_id = ? ORDER BY id')
                           .all(req.session.userId);
      const propertyProjections = properties.map(p => ({
        id: p.id, label: p.label,
        series: projectProperty(p, computeCashflow(p, ctx.tmi), years,
                                { appreciationPct: immoRate }).series
      }));

      const totals = aggregateTotals(accountProjections, propertyProjections, years);

      res.json({
        years, immoAppreciationPct: immoRate,
        tmiPct: Math.round(ctx.tmi * 100), isCouple: ctx.isCouple,
        accounts: accountProjections,
        properties: propertyProjections,
        totals,
        horizons: [1, 5, 10, 20].filter(h => h <= years)
          .map(h => ({ year: h, ...totals[h - 1] }))
      });
    } catch (err) {
      console.error('projection error:', err);
      res.status(500).json({ error: 'Erreur lors du calcul de la projection.' });
    }
  });

  // Frais par défaut proposés pour un type d'enveloppe (pré-remplissage)
  app.get('/api/default-fees/:type', requireAuth, (req, res) => {
    res.json(defaultFeesFor(String(req.params.type || '')));
  });

  // --- Analyse d'une position : historique 3 ans + actualités -----------------

  // GET /api/positions/:id/insights — perf 3 ans (CAGR, volatilité, série)
  app.get('/api/positions/:id/insights', requireAuth, async (req, res) => {
    const pos = getPositionOwned(req.params.id, req.session.userId);
    if (!pos) return res.status(404).json({ error: 'Position introuvable.' });
    if (!pos.ticker || !pos.ticker.trim())
      return res.status(400).json({ error: 'Aucun ticker pour cette position.' });
    try {
      const history = await fetchHistory3y(pos.ticker.trim());
      res.json({ ...history, expectedRatePct: expectedRateFromHistory(history) });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // GET /api/positions/:id/news — dernières actualités de la société
  app.get('/api/positions/:id/news', requireAuth, async (req, res) => {
    const pos = getPositionOwned(req.params.id, req.session.userId);
    if (!pos) return res.status(404).json({ error: 'Position introuvable.' });
    if (!pos.ticker || !pos.ticker.trim())
      return res.status(400).json({ error: 'Aucun ticker pour cette position.' });
    try {
      const news = await fetchNews(pos.ticker.trim());
      res.json({ ticker: pos.ticker, news });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // --- Abonnements récurrents ---------------------------------------------------

  const ALLOWED_PERIODICITIES = ['mensuel', 'trimestriel', 'annuel'];
  const MONTHLY_DIVIDER = { mensuel: 1, trimestriel: 3, annuel: 12 };

  // POST /api/subscriptions/analyze — analyse un relevé CSV SANS rien stocker.
  // Body : { csv: "..." }
  app.post('/api/subscriptions/analyze', requireAuth, (req, res) => {
    const csv = String(req.body.csv || '');
    if (!csv.trim()) return res.status(400).json({ error: 'Relevé CSV vide.' });
    if (csv.length > 2_000_000)
      return res.status(400).json({ error: 'Fichier trop volumineux (max ~2 Mo).' });
    try {
      const result = analyzeBankCsv(csv);
      res.json(result);
    } catch (e) {
      console.error('analyze csv error:', e);
      res.status(400).json({ error: 'Impossible d’analyser ce relevé. Format attendu : CSV avec date, libellé et montant.' });
    }
  });

  function validateSubscription(body) {
    const errors = [];
    const label = String(body.label || '').trim().slice(0, 120);
    if (!label) errors.push('Libellé obligatoire.');
    const periodicity = ALLOWED_PERIODICITIES.includes(body.periodicity) ? body.periodicity : 'mensuel';
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) errors.push('Montant invalide.');
    const category = String(body.category || 'autre').trim().slice(0, 40);
    return {
      errors,
      data: {
        label, periodicity, category,
        amount: Number.isFinite(amount) ? amount : 0,
        monthly_cost: Number.isFinite(amount) ? amount / MONTHLY_DIVIDER[periodicity] : 0,
        essential: body.essential === false || body.essential === 0 ? 0 : 1,
        notes: String(body.notes || '').slice(0, 500)
      }
    };
  }

  app.get('/api/subscriptions', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY monthly_cost DESC')
                   .all(req.session.userId);
    const totalMonthly = rows.reduce((s, r) => s + r.monthly_cost, 0);
    const savings = rows.filter(r => !r.essential).reduce((s, r) => s + r.monthly_cost, 0);
    res.json({
      subscriptions: rows,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      totalAnnual: Math.round(totalMonthly * 12 * 100) / 100,
      potentialSavingsAnnual: Math.round(savings * 12 * 100) / 100
    });
  });

  app.post('/api/subscriptions', requireAuth, (req, res) => {
    const { errors, data } = validateSubscription(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const info = db.prepare(`
      INSERT INTO subscriptions (user_id, label, category, periodicity, amount, monthly_cost, essential, notes)
      VALUES (@user_id, @label, @category, @periodicity, @amount, @monthly_cost, @essential, @notes)
    `).run({ user_id: req.session.userId, ...data });
    res.status(201).json(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(info.lastInsertRowid));
  });

  app.put('/api/subscriptions/:id', requireAuth, (req, res) => {
    const existing = db.prepare('SELECT id FROM subscriptions WHERE id = ? AND user_id = ?')
                       .get(req.params.id, req.session.userId);
    if (!existing) return res.status(404).json({ error: 'Abonnement introuvable.' });
    const { errors, data } = validateSubscription(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    db.prepare(`
      UPDATE subscriptions SET label=@label, category=@category, periodicity=@periodicity,
        amount=@amount, monthly_cost=@monthly_cost, essential=@essential, notes=@notes,
        updated_at=datetime('now')
      WHERE id=@id
    `).run({ id: Number(req.params.id), ...data });
    res.json(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id));
  });

  app.delete('/api/subscriptions/:id', requireAuth, (req, res) => {
    const info = db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?')
                   .run(req.params.id, req.session.userId);
    if (info.changes === 0) return res.status(404).json({ error: 'Abonnement introuvable.' });
    res.json({ ok: true });
  });

  // --- Opportunités immobilières -------------------------------------------------

  // POST /api/opportunities/simulate — simulation sans sauvegarde.
  // L'âge de l'emprunteur est pré-rempli depuis l'année de naissance du foyer.
  app.post('/api/opportunities/simulate', requireAuth, (req, res) => {
    try {
      const ctx = getUserTaxContext(req.session.userId);
      const input = { ...req.body };
      if ((input.borrowerAge == null || input.borrowerAge === '') && ctx.birthYear) {
        input.borrowerAge = new Date().getFullYear() - ctx.birthYear;
      }
      const result = simulateOpportunity(input, { tmi: ctx.tmi });
      if (result.error) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (e) {
      console.error('simulate opportunity error:', e);
      res.status(500).json({ error: 'Erreur lors de la simulation.' });
    }
  });

  // GET /api/opportunities/loan-defaults — durée max & âge pré-rempli
  app.get('/api/opportunities/loan-defaults', requireAuth, (req, res) => {
    const ctx = getUserTaxContext(req.session.userId);
    const age = ctx.birthYear ? new Date().getFullYear() - ctx.birthYear : null;
    res.json({
      borrowerAge: age,
      maxLoanYears: maxLoanYears(age ?? 35),
      tmiPct: Math.round(ctx.tmi * 100)
    });
  });

  app.get('/api/opportunities', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM property_opportunities WHERE user_id = ? ORDER BY id DESC')
                   .all(req.session.userId);
    const ctx = getUserTaxContext(req.session.userId);
    res.json(rows.map(r => {
      let inputs = {};
      try { inputs = JSON.parse(r.inputs); } catch { /* JSON corrompu : simulation vide */ }
      const sim = simulateOpportunity(inputs, { tmi: ctx.tmi });
      return {
        id: r.id, label: r.label, url: r.url, inputs, created_at: r.created_at,
        summary: sim.error ? { error: sim.error } : {
          totalCost: sim.acquisition.totalCost,
          monthlyCashflow: sim.performance.monthlyCashflow,
          netNetYieldPct: sim.performance.netNetYieldPct,
          loanYears: sim.financing.loanYears
        }
      };
    }));
  });

  app.post('/api/opportunities', requireAuth, (req, res) => {
    const label = String(req.body.label || '').trim().slice(0, 120);
    if (!label) return res.status(400).json({ error: 'Libellé obligatoire.' });
    const url = String(req.body.url || '').trim().slice(0, 500);
    // Seules les URLs http(s) des sites d'annonces sont acceptées
    if (url && !/^https?:\/\//i.test(url))
      return res.status(400).json({ error: 'URL d’annonce invalide (http/https attendu).' });
    const inputs = req.body.inputs && typeof req.body.inputs === 'object' ? req.body.inputs : {};
    const info = db.prepare(`
      INSERT INTO property_opportunities (user_id, label, url, inputs)
      VALUES (?, ?, ?, ?)
    `).run(req.session.userId, label, url, JSON.stringify(inputs));
    res.status(201).json(db.prepare('SELECT * FROM property_opportunities WHERE id = ?').get(info.lastInsertRowid));
  });

  app.delete('/api/opportunities/:id', requireAuth, (req, res) => {
    const info = db.prepare('DELETE FROM property_opportunities WHERE id = ? AND user_id = ?')
                   .run(req.params.id, req.session.userId);
    if (info.changes === 0) return res.status(404).json({ error: 'Opportunité introuvable.' });
    res.json({ ok: true });
  });
};
