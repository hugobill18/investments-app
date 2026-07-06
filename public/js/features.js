// features.js — Évolutions du dashboard : projection patrimoniale,
// opportunités immobilières, abonnements récurrents et analyse de positions
// (performance 3 ans + actualités).
//
// Chargé APRÈS le script inline de dashboard.html : réutilise ses helpers
// globaux (api, fmtEur, fmtPct, escapeHtml, showToast, openModalById…),
// l'objet `charts` et la palette COLORS.

(() => {
  'use strict';

  const CATEGORY_LABELS = {
    streaming: 'Streaming', telecom: 'Télécom', energie: 'Énergie',
    assurance: 'Assurance', sport: 'Sport', logiciel: 'Logiciel',
    presse: 'Presse', transport: 'Transport', banque: 'Banque', autre: 'Autre'
  };

  // ==================== Hook de navigation ====================
  // On enveloppe showSection pour charger chaque nouvelle vue à la demande.
  const loadedViews = new Set();
  const origShowSection = window.showSection;
  window.showSection = function (name) {
    origShowSection(name);
    if (name === 'projection' && !loadedViews.has('projection')) {
      loadedViews.add('projection');
      loadProjection();
    }
    if (name === 'opportunites' && !loadedViews.has('opportunites')) {
      loadedViews.add('opportunites');
      initOpportunites();
    }
    if (name === 'depenses' && !loadedViews.has('depenses')) {
      loadedViews.add('depenses');
      loadSubscriptions();
    }
  };

  // ==================== PROJECTION PATRIMONIALE ====================

  async function loadProjection() {
    const years = document.getElementById('proj-years').value;
    const immoRate = document.getElementById('proj-immo-rate').value || 1;
    const loading = document.getElementById('proj-loading');
    const result = document.getElementById('proj-result');
    const empty = document.getElementById('proj-empty');
    loading.style.display = 'block';
    result.style.display = 'none';
    empty.style.display = 'none';

    try {
      const d = await api(`/api/projection?years=${encodeURIComponent(years)}&immoRate=${encodeURIComponent(immoRate)}`);
      loading.style.display = 'none';
      if (d.accounts.length === 0 && d.properties.length === 0) {
        empty.style.display = 'block';
        return;
      }
      result.style.display = 'block';
      renderProjection(d);
    } catch (e) {
      loading.style.display = 'none';
      showToast('Projection impossible : ' + e.message, 'error');
    }
  }

  document.getElementById('proj-refresh').addEventListener('click', loadProjection);

  function renderProjection(d) {
    const last = d.totals[d.totals.length - 1];
    const first = { financierNet: 0, immobilier: 0 };
    // Patrimoine actuel : approximé par l'année 0 = valeurs de départ.
    // On reconstruit depuis les séries : year 1 - croissance ≈ départ ; plus
    // simple et juste : total actuel = somme investie année 1 + valeur immo actuelle.
    const currentTotal = d.accounts.reduce((s, a) => s + (a.series[0] ? a.series[0].invested : 0), 0)
      + d.properties.reduce((s, p) => s + (p.series[0] ? Math.round(p.series[0].value / (1 + d.immoAppreciationPct / 100)) : 0), 0);

    document.getElementById('proj-total-net').textContent = fmtEur(last.total);
    document.getElementById('proj-total-sub').textContent =
      `dans ${d.years} ans · TMI ${d.tmiPct}% · immobilier +${d.immoAppreciationPct}%/an`;
    document.getElementById('proj-gain').textContent = fmtEur(last.total - currentTotal, { signed: true });
    document.getElementById('proj-tax').textContent = '-' + fmtEur(last.impots);
    document.getElementById('proj-fees').textContent = '-' + fmtEur(last.frais);

    // Graphique : évolution année par année
    const txt = chartTextColor();
    const labels = d.totals.map(t => 'Année ' + t.year);
    if (charts.projection) { charts.projection.destroy(); delete charts.projection; }
    charts.projection = new Chart(document.getElementById('chartProjection'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Patrimoine total (net)', data: d.totals.map(t => t.total),
            borderColor: COLORS[0], backgroundColor: COLORS[0] + '22', fill: true, tension: 0.25 },
          { label: 'Financier (net d’impôts/frais)', data: d.totals.map(t => t.financierNet),
            borderColor: COLORS[1], tension: 0.25 },
          { label: 'Immobilier (valeur + cashflows)', data: d.totals.map(t => t.immobilier),
            borderColor: COLORS[2], tension: 0.25 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: txt } },
          tooltip: { callbacks: { label: c => c.dataset.label + ' : ' + fmtEur(c.parsed.y) } }
        },
        scales: {
          x: { ticks: { color: txt, maxTicksLimit: 12 } },
          y: { ticks: { color: txt, callback: v => fmtEur(v) } }
        }
      }
    });

    // Tableau de détail par placement à l'horizon
    const tbody = document.getElementById('proj-detail-body');
    const rows = d.accounts.map(a => {
      const s = a.series[a.series.length - 1];
      return `<tr>
        <td>${escapeHtml(a.label)}</td>
        <td class="num">${a.ratePct.toFixed(1).replace('.', ',')} %</td>
        <td class="muted" style="font-size:.8rem">${escapeHtml(a.rateSource)}</td>
        <td class="num">${fmtEur(s.gross)}</td>
        <td class="num negative">-${fmtEur(s.tax)}</td>
        <td class="num negative">-${fmtEur(s.fees)}</td>
        <td class="num" style="font-weight:600">${fmtEur(s.net)}</td>
      </tr>`;
    });
    for (const p of d.properties) {
      const s = p.series[p.series.length - 1];
      rows.push(`<tr>
        <td>🏘️ ${escapeHtml(p.label)}</td>
        <td class="num">–</td>
        <td class="muted" style="font-size:.8rem">valeur + cashflows nets cumulés</td>
        <td class="num">${fmtEur(s.total)}</td>
        <td class="num muted">incl.</td>
        <td class="num muted">–</td>
        <td class="num" style="font-weight:600">${fmtEur(s.total)}</td>
      </tr>`);
    }
    tbody.innerHTML = rows.join('');
  }

  // ==================== OPPORTUNITÉS IMMOBILIÈRES ====================

  let lastSimInputs = null;   // hypothèses de la dernière simulation réussie

  function collectOppInputs() {
    return {
      price: document.getElementById('opp-price').value || 0,
      isNew: document.getElementById('opp-new').value === '1',
      works: document.getElementById('opp-works').value || 0,
      rentMonthly: document.getElementById('opp-rent').value || 0,
      propertyTaxAnnual: document.getElementById('opp-tf').value || 0,
      condoChargesAnnual: document.getElementById('opp-condo').value || 0,
      vacancyPct: document.getElementById('opp-vacancy').value,
      apport: document.getElementById('opp-apport').value || 0,
      borrowerAge: document.getElementById('opp-age').value || null,
      loanRatePct: document.getElementById('opp-loan-rate').value,
      regime: document.getElementById('opp-regime').value
    };
  }

  async function initOpportunites() {
    try {
      const def = await api('/api/opportunities/loan-defaults');
      if (def.borrowerAge && !document.getElementById('opp-age').value) {
        document.getElementById('opp-age').value = def.borrowerAge;
        document.getElementById('opp-age-hint').textContent =
          `Depuis votre foyer fiscal · durée max ${def.maxLoanYears} ans (fin ≤ 70 ans)`;
      }
    } catch { /* pas bloquant */ }
    loadOpportunities();
  }

  document.getElementById('oppForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('oppAlert');
    alertBox.innerHTML = '';
    try {
      const inputs = collectOppInputs();
      const sim = await api('/api/opportunities/simulate', { method: 'POST', body: inputs });
      lastSimInputs = inputs;
      document.getElementById('oppSaveBtn').style.display = 'inline-block';
      renderOppSim(sim);
    } catch (err) {
      document.getElementById('opp-result').style.display = 'none';
      alertBox.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  function renderOppSim(sim) {
    document.getElementById('opp-result').style.display = 'block';

    const cf = sim.performance.monthlyCashflow;
    const cfEl = document.getElementById('opp-cashflow');
    cfEl.textContent = fmtEur(cf, { signed: true }) + ' / mois';
    cfEl.className = 'summary-value ' + (cf >= 0 ? 'positive' : 'negative');
    document.getElementById('opp-cashflow-sub').textContent =
      `${fmtEur(sim.performance.annualCashflow, { signed: true })} / an · ${escapeHtml(sim.fiscal.regime)} · TMI ${sim.fiscal.tmiPct}%`;

    document.getElementById('opp-yield').textContent =
      sim.performance.netNetYieldPct.toFixed(2).replace('.', ',') + ' %';
    document.getElementById('opp-yield-sub').textContent =
      `brut : ${sim.performance.grossYieldPct.toFixed(2).replace('.', ',')} % · net : ${sim.performance.netYieldPct.toFixed(2).replace('.', ',')} %`;

    document.getElementById('opp-loan').textContent =
      fmtEur(sim.financing.totalMonthly) + ' / mois';
    document.getElementById('opp-loan-sub').textContent =
      `${fmtEur(sim.financing.borrowed)} sur ${sim.financing.loanYears} ans (fin à ${sim.financing.endAge} ans) · intérêts ${fmtEur(sim.financing.totalInterest)}`;

    document.getElementById('opp-cost').textContent = fmtEur(sim.acquisition.totalCost);
    document.getElementById('opp-cost-sub').textContent =
      `dont notaire ${fmtEur(sim.acquisition.notaryFees)} (${sim.acquisition.notaryRatePct.toFixed(1).replace('.', ',')} %)`;

    // Graphiques
    const txt = chartTextColor();
    const labels = sim.series.map(s => 'An ' + s.year);

    if (charts.oppEquity) { charts.oppEquity.destroy(); delete charts.oppEquity; }
    charts.oppEquity = new Chart(document.getElementById('chartOppEquity'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Valeur du bien', data: sim.series.map(s => s.propertyValue),
            borderColor: COLORS[0], backgroundColor: COLORS[0] + '22', fill: true, tension: 0.25 },
          { label: 'Capital restant dû', data: sim.series.map(s => s.remainingDebt),
            borderColor: COLORS[3], tension: 0.25 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: txt } },
          tooltip: { callbacks: { label: c => c.dataset.label + ' : ' + fmtEur(c.parsed.y) } }
        },
        scales: {
          x: { ticks: { color: txt, maxTicksLimit: 10 } },
          y: { ticks: { color: txt, callback: v => fmtEur(v) } }
        }
      }
    });

    if (charts.oppEnrich) { charts.oppEnrich.destroy(); delete charts.oppEnrich; }
    const enrich = sim.series.map(s => s.netEnrichment);
    charts.oppEnrich = new Chart(document.getElementById('chartOppEnrichment'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Enrichissement net', data: enrich,
          backgroundColor: enrich.map(v => v >= 0 ? '#10b981' : '#ef4444') }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => fmtEur(c.parsed.y, { signed: true }) } }
        },
        scales: {
          x: { ticks: { color: txt, maxTicksLimit: 10 } },
          y: { ticks: { color: txt, callback: v => fmtEur(v, { signed: true }) } }
        }
      }
    });
  }

  // Sauvegarde d'une opportunité simulée
  document.getElementById('oppSaveBtn').addEventListener('click', async () => {
    if (!lastSimInputs) return;
    const label = document.getElementById('opp-label').value.trim()
      || `Bien à ${fmtEur(Number(lastSimInputs.price))}`;
    try {
      await api('/api/opportunities', {
        method: 'POST',
        body: { label, url: document.getElementById('opp-url').value.trim(), inputs: lastSimInputs }
      });
      showToast('Opportunité sauvegardée', 'success');
      loadOpportunities();
    } catch (e) {
      showToast('Sauvegarde impossible : ' + e.message, 'error');
    }
  });

  async function loadOpportunities() {
    try {
      const rows = await api('/api/opportunities');
      const list = document.getElementById('oppList');
      document.getElementById('opp-empty').style.display = rows.length === 0 ? 'block' : 'none';
      list.innerHTML = rows.map(o => {
        const s = o.summary || {};
        const cfCls = (s.monthlyCashflow || 0) >= 0 ? 'positive' : 'negative';
        return `
          <div class="property-card" data-opp-id="${o.id}" style="margin-bottom:.5rem">
            <div class="property-header" style="cursor:default">
              <div>
                <div class="property-title">${escapeHtml(o.label)}</div>
                <div class="property-sub">
                  ${s.error ? escapeHtml(s.error) :
                    `Coût total ${fmtEur(s.totalCost)} · rendement net-net ${(s.netNetYieldPct ?? 0).toFixed(2).replace('.', ',')} % · prêt ${s.loanYears} ans`}
                  ${o.url ? ` · <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener noreferrer">annonce ↗</a>` : ''}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:.75rem">
                <div class="property-cashflow ${cfCls}">
                  <div class="big">${fmtEur(s.monthlyCashflow || 0, { signed: true })} / mois</div>
                  <div class="small muted">cashflow net</div>
                </div>
                <button class="icon-btn" data-action="reload-opp" title="Recharger dans le simulateur">🔄</button>
                <button class="icon-btn" data-action="delete-opp" title="Supprimer">🗑️</button>
              </div>
            </div>
          </div>`;
      }).join('');
      list.dataset.loaded = '1';
      list._rows = rows;
    } catch (e) {
      showToast('Opportunités non chargées : ' + e.message, 'error');
    }
  }

  document.getElementById('oppList').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-opp-id]');
    if (!card) return;
    const id = Number(card.dataset.oppId);
    const rows = document.getElementById('oppList')._rows || [];
    const opp = rows.find(o => o.id === id);

    if (e.target.closest('[data-action="delete-opp"]')) {
      if (!confirm('Supprimer cette opportunité ?')) return;
      try {
        await api(`/api/opportunities/${id}`, { method: 'DELETE' });
        loadOpportunities();
      } catch (err) { showToast(err.message, 'error'); }
    } else if (e.target.closest('[data-action="reload-opp"]') && opp) {
      const i = opp.inputs || {};
      document.getElementById('opp-label').value = opp.label || '';
      document.getElementById('opp-url').value = opp.url || '';
      document.getElementById('opp-price').value = i.price || '';
      document.getElementById('opp-new').value = i.isNew ? '1' : '0';
      document.getElementById('opp-works').value = i.works || '';
      document.getElementById('opp-rent').value = i.rentMonthly || '';
      document.getElementById('opp-tf').value = i.propertyTaxAnnual || '';
      document.getElementById('opp-condo').value = i.condoChargesAnnual || '';
      document.getElementById('opp-vacancy').value = i.vacancyPct ?? 5;
      document.getElementById('opp-apport').value = i.apport || '';
      if (i.borrowerAge) document.getElementById('opp-age').value = i.borrowerAge;
      document.getElementById('opp-loan-rate').value = i.loanRatePct ?? 3.5;
      document.getElementById('opp-regime').value = i.regime || 'micro_bic';
      document.getElementById('oppForm').requestSubmit();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // ==================== ABONNEMENTS ====================

  let subsCache = [];

  async function loadSubscriptions() {
    try {
      const d = await api('/api/subscriptions');
      subsCache = d.subscriptions;
      document.getElementById('sub-monthly').textContent = fmtEur(d.totalMonthly) + ' / mois';
      document.getElementById('sub-annual').textContent = fmtEur(d.totalAnnual) + ' / an';
      document.getElementById('sub-savings').textContent = fmtEur(d.potentialSavingsAnnual) + ' / an';
      document.getElementById('sub-count').textContent =
        d.subscriptions.length + ' abonnement' + (d.subscriptions.length > 1 ? 's' : '');
      renderSubList();
      renderSubChart();
    } catch (e) {
      showToast('Abonnements non chargés : ' + e.message, 'error');
    }
  }

  function renderSubList() {
    const list = document.getElementById('subList');
    document.getElementById('sub-empty').style.display = subsCache.length === 0 ? 'block' : 'none';
    list.innerHTML = subsCache.map(s => `
      <div class="property-card" data-sub-id="${s.id}" style="margin-bottom:.5rem">
        <div class="property-header" style="cursor:default">
          <div>
            <div class="property-title">${escapeHtml(s.label)}
              ${!s.essential ? '<span class="badge-dispensable">💡 dispensable</span>' : ''}
            </div>
            <div class="property-sub">${CATEGORY_LABELS[s.category] || s.category} · ${s.periodicity}
              · ${fmtEur(s.amount)} / échéance</div>
          </div>
          <div style="display:flex;align-items:center;gap:.75rem">
            <div class="property-cashflow">
              <div class="big negative">-${fmtEur(s.monthly_cost)} / mois</div>
              <div class="small muted">-${fmtEur(s.monthly_cost * 12)} / an</div>
            </div>
            <label class="checkbox-label" style="font-size:.75rem" title="Décochez si cet abonnement est dispensable">
              <input type="checkbox" data-action="toggle-essential" ${s.essential ? 'checked' : ''}> essentiel
            </label>
            <button class="icon-btn" data-action="edit-sub" title="Modifier">✏️</button>
          </div>
        </div>
      </div>`).join('');
  }

  function renderSubChart() {
    const byCat = {};
    for (const s of subsCache) byCat[s.category] = (byCat[s.category] || 0) + s.monthly_cost;
    const entries = Object.entries(byCat).filter(([, v]) => v > 0);
    const txt = chartTextColor();
    if (charts.subs) { charts.subs.destroy(); delete charts.subs; }
    charts.subs = new Chart(document.getElementById('chartSubs'), {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => CATEGORY_LABELS[k] || k),
        datasets: [{ data: entries.map(([, v]) => v), backgroundColor: COLORS.slice(0, entries.length) }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: txt } },
          tooltip: { callbacks: { label: c => c.label + ' : ' + fmtEur(c.parsed) + ' / mois' } }
        }
      }
    });
  }

  document.getElementById('subList').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-sub-id]');
    if (!card) return;
    const sub = subsCache.find(s => s.id === Number(card.dataset.subId));
    if (!sub) return;

    if (e.target.closest('[data-action="toggle-essential"]')) {
      const checked = e.target.checked;
      try {
        await api(`/api/subscriptions/${sub.id}`, {
          method: 'PUT',
          body: { ...sub, essential: checked }
        });
        loadSubscriptions();
      } catch (err) { showToast(err.message, 'error'); }
    } else if (e.target.closest('[data-action="edit-sub"]')) {
      openSubModal(sub);
    }
  });

  // Import CSV : analyse locale, rien n'est stocké côté serveur
  document.getElementById('sub-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const box = document.getElementById('sub-analyze-result');
    box.innerHTML = '<p class="muted">Analyse en cours…</p>';
    try {
      const csv = await file.text();
      const d = await api('/api/subscriptions/analyze', { method: 'POST', body: { csv } });
      if (d.subscriptions.length === 0) {
        box.innerHTML = `<div class="alert info">Aucun abonnement récurrent détecté
          (${d.transactionCount} transactions analysées).</div>`;
        return;
      }
      const existing = new Set(subsCache.map(s => s.label.toUpperCase()));
      box.innerHTML = `
        <div class="alert info" style="margin-bottom:.5rem">
          ${d.subscriptions.length} abonnement(s) détecté(s) sur ${d.transactionCount} transactions
          — total ≈ ${fmtEur(d.totalMonthly)} / mois. Sélectionnez ceux à conserver :
        </div>
        ${d.subscriptions.map((s, i) => `
          <div class="detected-sub" data-idx="${i}">
            <div>
              <strong>${escapeHtml(s.label)}</strong>
              <span class="muted" style="font-size:.8rem"> · ${CATEGORY_LABELS[s.category] || s.category}
                · ${s.periodicity} · ${s.occurrences} occurrences</span>
            </div>
            <div style="display:flex;align-items:center;gap:.6rem">
              <span class="negative" style="font-weight:600">-${fmtEur(s.monthlyCost)} / mois</span>
              ${existing.has(s.label.toUpperCase())
                ? '<span class="muted" style="font-size:.8rem">déjà suivi</span>'
                : `<button class="secondary btn-small" data-action="add-detected">+ Suivre</button>`}
            </div>
          </div>`).join('')}`;
      box._detected = d.subscriptions;
    } catch (err) {
      box.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    } finally {
      e.target.value = '';   // permet de réimporter le même fichier
    }
  });

  document.getElementById('sub-analyze-result').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="add-detected"]');
    if (!btn) return;
    const box = document.getElementById('sub-analyze-result');
    const item = e.target.closest('[data-idx]');
    const s = (box._detected || [])[Number(item.dataset.idx)];
    if (!s) return;
    btn.disabled = true;
    try {
      await api('/api/subscriptions', {
        method: 'POST',
        body: { label: s.label, amount: s.amount, periodicity: s.periodicity, category: s.category, essential: true }
      });
      btn.replaceWith(Object.assign(document.createElement('span'),
        { textContent: '✓ suivi', className: 'positive', style: 'font-size:.8rem;font-weight:600' }));
      loadSubscriptions();
    } catch (err) {
      btn.disabled = false;
      showToast(err.message, 'error');
    }
  });

  // Modale abonnement (ajout manuel / édition)
  document.getElementById('addSubBtn').addEventListener('click', () => openSubModal(null));

  function openSubModal(s) {
    const edit = !!s;
    document.getElementById('modalSubTitle').textContent = edit ? 'Modifier l’abonnement' : 'Ajouter un abonnement';
    document.getElementById('deleteSubBtn').style.display = edit ? 'inline-block' : 'none';
    document.getElementById('subAlert').innerHTML = '';
    document.getElementById('sub-id').value = s?.id ?? '';
    document.getElementById('sub-label').value = s?.label ?? '';
    document.getElementById('sub-amount').value = s?.amount ?? '';
    document.getElementById('sub-periodicity').value = s?.periodicity ?? 'mensuel';
    document.getElementById('sub-category').value = s?.category ?? 'autre';
    document.getElementById('sub-essential').checked = s ? !!s.essential : true;
    openModalById('modalSub');
    setTimeout(() => document.getElementById('sub-label').focus(), 50);
  }

  document.getElementById('subForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('sub-id').value;
    const payload = {
      label: document.getElementById('sub-label').value,
      amount: parseFloat(document.getElementById('sub-amount').value) || 0,
      periodicity: document.getElementById('sub-periodicity').value,
      category: document.getElementById('sub-category').value,
      essential: document.getElementById('sub-essential').checked
    };
    try {
      if (id) await api(`/api/subscriptions/${id}`, { method: 'PUT', body: payload });
      else await api('/api/subscriptions', { method: 'POST', body: payload });
      closeModalById('modalSub');
      loadSubscriptions();
    } catch (err) {
      document.getElementById('subAlert').innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById('deleteSubBtn').addEventListener('click', async () => {
    const id = document.getElementById('sub-id').value;
    if (!id || !confirm('Supprimer cet abonnement ?')) return;
    try {
      await api(`/api/subscriptions/${id}`, { method: 'DELETE' });
      closeModalById('modalSub');
      loadSubscriptions();
    } catch (err) {
      document.getElementById('subAlert').innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  // ==================== INSIGHTS POSITIONS (perf 3 ans + news) ====================

  const insightCharts = {};   // { posId: Chart } pour les sparklines

  document.getElementById('accountList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="pos-insights"]');
    if (!btn) return;
    const tr = btn.closest('tr[data-pos-id]');
    if (!tr) return;
    const posId = Number(tr.dataset.posId);
    const row = tr.parentElement.querySelector(`tr[data-insights-for="${posId}"]`);
    if (!row) return;

    if (row.style.display !== 'none') {   // déjà ouvert → refermer
      row.style.display = 'none';
      return;
    }
    row.style.display = 'table-row';
    const panel = document.getElementById(`insights-${posId}`);
    if (panel.dataset.loaded) return;     // déjà chargé
    panel.innerHTML = '<p class="muted" style="margin:.5rem 0">Chargement de l’historique et des actualités…</p>';

    const [insights, news] = await Promise.allSettled([
      api(`/api/positions/${posId}/insights`),
      api(`/api/positions/${posId}/news`)
    ]);

    let html = '<div class="insights-grid">';

    if (insights.status === 'fulfilled') {
      const h = insights.value;
      const cls = h.cagrPct >= 0 ? 'positive' : 'negative';
      html += `
        <div class="insights-block">
          <div class="insights-title">📈 Performance ${h.yearsSpan} ans</div>
          <div class="insights-stats">
            <div><span class="label">Perf. annualisée</span>
                 <span class="value ${cls}">${fmtPct(h.cagrPct)}/an</span></div>
            <div><span class="label">Volatilité</span>
                 <span class="value">${h.volatilityPct.toFixed(1).replace('.', ',')} %</span></div>
            <div><span class="label">Taux retenu en projection</span>
                 <span class="value">${fmtPct(h.expectedRatePct)}/an</span></div>
          </div>
          <div style="height:110px"><canvas id="spark-${posId}"></canvas></div>
        </div>`;
    } else {
      html += `<div class="insights-block"><div class="insights-title">📈 Performance 3 ans</div>
        <p class="muted" style="font-size:.8rem">${escapeHtml(insights.reason.message)}</p></div>`;
    }

    if (news.status === 'fulfilled' && news.value.news.length > 0) {
      html += `
        <div class="insights-block">
          <div class="insights-title">📰 Dernières actualités</div>
          <ul class="news-list">
            ${news.value.news.slice(0, 5).map(n => `
              <li>
                <a href="${escapeHtml(n.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(n.title)}</a>
                <span class="muted">${escapeHtml(n.publisher || '')}${n.publishedAt ? ' · ' + new Date(n.publishedAt).toLocaleDateString('fr-FR') : ''}</span>
              </li>`).join('')}
          </ul>
        </div>`;
    } else {
      html += `<div class="insights-block"><div class="insights-title">📰 Actualités</div>
        <p class="muted" style="font-size:.8rem">Aucune actualité disponible pour ce ticker.</p></div>`;
    }

    html += '</div>';
    panel.innerHTML = html;
    panel.dataset.loaded = '1';

    // Sparkline de l'historique 3 ans
    if (insights.status === 'fulfilled') {
      const h = insights.value;
      const txt = chartTextColor();
      if (insightCharts[posId]) insightCharts[posId].destroy();
      insightCharts[posId] = new Chart(document.getElementById(`spark-${posId}`), {
        type: 'line',
        data: {
          labels: h.series.map(p => p.date),
          datasets: [{ data: h.series.map(p => p.close), borderColor: COLORS[0],
            backgroundColor: COLORS[0] + '18', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: c => c.parsed.y.toLocaleString('fr-FR') + ' ' + (h.currency || '') } } },
          scales: {
            x: { display: false },
            y: { ticks: { color: txt, maxTicksLimit: 4, font: { size: 10 } } }
          }
        }
      });
    }
  });
})();
