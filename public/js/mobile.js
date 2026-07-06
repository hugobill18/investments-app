// mobile.js — Interface iPhone. Consomme exactement les mêmes API locales
// que le dashboard : /api/summary, /api/financial-accounts, /api/properties,
// /api/projection, /api/opportunities/*, /api/subscriptions/*.

(() => {
  'use strict';

  // ==================== Helpers ====================

  const $ = id => document.getElementById(id);

  const fmtEur = (n, opts = {}) => {
    const sign = opts.signed && n > 0 ? '+' : '';
    return sign + Math.round(n).toLocaleString('fr-FR') + ' €';
  };
  const fmtPct = n => (n >= 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + ' %';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { window.location.href = '/'; throw new Error('Session expirée'); }
    if (!res.ok) throw new Error(data.error || 'Erreur serveur (' + res.status + ')');
    return data;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
  const chartText = () => isDark() ? '#98989f' : '#6e6e73';
  const TINT = '#5856d6';
  const PALETTE = ['#5856d6', '#0ea5e9', '#34c759', '#ff9f0a', '#ff2d55', '#af52de', '#64d2ff', '#ffd60a'];

  const charts = {};
  function makeChart(key, canvasId, config) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart($(canvasId), config);
  }

  const ACCOUNT_TYPE_LABELS = {
    livret: 'Livret réglementé', livret_banque: 'Livret bancaire',
    assurance_vie_euro: 'AV fonds €', pel: 'PEL', cel: 'CEL',
    epargne_simple: 'Épargne', compte_titres: 'CTO', pea: 'PEA',
    assurance_vie_uc: 'AV (UC)', per: 'PER', crypto: 'Crypto', autre: 'Autre'
  };
  const PROPERTY_TYPE_LABELS = {
    principale: 'Rés. principale', secondaire: 'Rés. secondaire',
    locative_nue: 'Location nue', locative_meublee: 'Location meublée',
    nue_propriete: 'Nue-propriété'
  };
  const CATEGORY_LABELS = {
    streaming: 'Streaming', telecom: 'Télécom', energie: 'Énergie',
    assurance: 'Assurance', sport: 'Sport', logiciel: 'Logiciel',
    presse: 'Presse', transport: 'Transport', banque: 'Banque', autre: 'Autre'
  };

  // ==================== Navigation par onglets ====================

  const TAB_TITLES = {
    home: 'Patrimoine', assets: 'Mes actifs', projection: 'Projection',
    opportunities: 'Opportunités', subs: 'Abonnements'
  };
  const loadedTabs = new Set();

  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  function showTab(name) {
    document.querySelectorAll('.tab-view').forEach(v => { v.hidden = v.id !== 'tab-' + name; });
    document.querySelectorAll('.tab-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $('headerTitle').textContent = TAB_TITLES[name] || 'Patrimoine';
    window.scrollTo({ top: 0 });
    if (!loadedTabs.has(name)) {
      loadedTabs.add(name);
      ({ home: loadHome, assets: loadAssets, projection: loadProjection,
         opportunities: loadOpportunities, subs: loadSubs }[name])?.();
    }
  }

  $('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  // ==================== Accueil ====================

  async function loadHome() {
    try {
      const s = await api('/api/summary');
      const { immobilier: im, financier: fi, patrimoine: pa } = s;

      $('h-total').textContent = fmtEur(pa.total);
      $('h-total-sub').textContent = `Immobilier ${fmtEur(pa.immobilier)} · Financier ${fmtEur(pa.financier)}`;

      const cf = im.monthlyNetCashflow;
      $('h-immo-cf').textContent = fmtEur(cf, { signed: true });
      $('h-immo-cf').className = 'stat-value ' + (cf >= 0 ? 'positive' : 'negative');
      $('h-fin-flow').textContent = fmtEur(fi.monthlyNet, { signed: true });
      $('h-fin-flow').className = 'stat-value ' + (fi.monthlyNet >= 0 ? 'positive' : 'negative');

      $('home-empty').hidden = !(im.propertyCount === 0 && fi.accountCount === 0);

      makeChart('homeSplit', 'chartHomeSplit', {
        type: 'doughnut',
        data: {
          labels: ['Immobilier', 'Financier'],
          datasets: [{ data: [pa.immobilier, pa.financier], backgroundColor: [PALETTE[0], PALETTE[1]], borderWidth: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { color: chartText(), boxWidth: 14 } },
            tooltip: { callbacks: { label: c => c.label + ' : ' + fmtEur(c.parsed) } }
          }
        }
      });

      const types = Object.entries(fi.byType).filter(([, v]) => v > 0);
      makeChart('homeFin', 'chartHomeFin', {
        type: 'doughnut',
        data: {
          labels: types.map(([k]) => ACCOUNT_TYPE_LABELS[k] || k),
          datasets: [{ data: types.map(([, v]) => v), backgroundColor: PALETTE.slice(0, types.length), borderWidth: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { color: chartText(), boxWidth: 14 } },
            tooltip: { callbacks: { label: c => c.label + ' : ' + fmtEur(c.parsed) } }
          }
        }
      });
    } catch (e) {
      toast(e.message);
    }
  }

  // ==================== Patrimoine (actifs) ====================

  let accountsCache = [], propertiesCache = [];
  const openRows = new Set();

  document.querySelectorAll('#assetsSegment .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#assetsSegment .seg-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
      $('assets-fin').hidden = btn.dataset.seg !== 'fin';
      $('assets-immo').hidden = btn.dataset.seg !== 'immo';
    });
  });

  async function loadAssets() {
    try {
      [accountsCache, propertiesCache] = await Promise.all([
        api('/api/financial-accounts'), api('/api/properties')
      ]);
      renderAccounts();
      renderProperties();
      $('assets-empty').hidden = !(accountsCache.length === 0 && propertiesCache.length === 0);
    } catch (e) { toast(e.message); }
  }

  function accountRowHTML(a) {
    const m = a.metrics;
    const open = openRows.has('a' + a.id);
    const sub = m.isPortfolio
      ? `${m.typeLabel} · ${m.positionCount} position(s)`
      : `${m.typeLabel}${m.annualRate ? ' · ' + m.annualRate.toFixed(2).replace('.', ',') + ' %/an' : ''}`;
    const gainLine = m.isPortfolio
      ? `<div class="small ${m.unrealizedGain >= 0 ? 'positive' : 'negative'}">${fmtEur(m.unrealizedGain, { signed: true })} (${fmtPct(m.unrealizedGainPct)})</div>`
      : (m.monthlyNet ? `<div class="small ${m.monthlyNet >= 0 ? 'positive' : 'negative'}">${fmtEur(m.monthlyNet, { signed: true })} / mois</div>` : '');

    let detail = '';
    if (open && m.isPortfolio) {
      detail = `<div class="row-detail"><table>` + a.positions.map(p => {
        const val = p.quantity * p.current_price;
        const gain = p.quantity * (p.current_price - p.buy_price);
        return `<tr>
          <td>${escapeHtml(p.name)}${p.ticker ? ` <span style="color:var(--text-2);font-size:.7rem">${escapeHtml(p.ticker)}</span>` : ''}</td>
          <td class="num">${fmtEur(val)}<br><span class="${gain >= 0 ? 'positive' : 'negative'}" style="font-size:.7rem">${fmtEur(gain, { signed: true })}</span></td>
        </tr>`;
      }).join('') + `</table></div>`;
    } else if (open) {
      detail = `<div class="row-detail"><table>
        <tr><td>Versement mensuel</td><td class="num positive">+${fmtEur(m.monthlyIn)}</td></tr>
        <tr><td>Retrait mensuel</td><td class="num negative">-${fmtEur(m.monthlyOut)}</td></tr>
        ${m.estimatedAnnualReturn ? `<tr><td>Intérêts estimés / an</td><td class="num positive">+${fmtEur(m.estimatedAnnualReturn)}</td></tr>` : ''}
      </table></div>`;
    }

    return `<div class="row-card ${open ? 'open' : ''}" data-acc="${a.id}">
      <div class="row-head">
        <span class="chevron">▸</span>
        <div class="row-main">
          <div class="row-title">${escapeHtml(a.label)}</div>
          <div class="row-sub">${sub}</div>
        </div>
        <div class="row-value">
          <div class="big">${fmtEur(m.currentValue)}</div>
          ${gainLine}
        </div>
      </div>
      ${detail}
    </div>`;
  }

  function renderAccounts() {
    $('accountsList').innerHTML = accountsCache.map(accountRowHTML).join('');
  }

  $('accountsList').addEventListener('click', e => {
    const card = e.target.closest('[data-acc]');
    if (!card) return;
    const key = 'a' + card.dataset.acc;
    openRows.has(key) ? openRows.delete(key) : openRows.add(key);
    renderAccounts();
  });

  function propertyRowHTML(p) {
    const c = p.cashflow;
    const open = openRows.has('p' + p.id);
    const cls = c.netCashflow >= 0 ? 'positive' : 'negative';
    const detail = open ? `<div class="row-detail"><table>
      <tr><td>Loyers / an</td><td class="num positive">+${fmtEur(c.annualRevenue)}</td></tr>
      <tr><td>Crédit / an</td><td class="num negative">-${fmtEur(c.annualCredit)}</td></tr>
      <tr><td>Taxe foncière + charges</td><td class="num negative">-${fmtEur(c.annualPropertyTax + c.annualCondoCharges)}</td></tr>
      <tr><td>Impôt estimé</td><td class="num negative">-${fmtEur(c.estimatedTax)}</td></tr>
      <tr><td><strong>Cashflow net / an</strong></td><td class="num ${cls}"><strong>${fmtEur(c.netCashflow, { signed: true })}</strong></td></tr>
    </table></div>` : '';

    return `<div class="row-card ${open ? 'open' : ''}" data-prop="${p.id}">
      <div class="row-head">
        <span class="chevron">▸</span>
        <div class="row-main">
          <div class="row-title">${escapeHtml(p.label)}</div>
          <div class="row-sub">${PROPERTY_TYPE_LABELS[p.property_type] || p.property_type}${p.current_value ? ' · ' + fmtEur(p.current_value) : ''}</div>
        </div>
        <div class="row-value">
          <div class="big ${cls}">${fmtEur(c.monthlyNetCashflow, { signed: true })}</div>
          <div class="small">/ mois</div>
        </div>
      </div>
      ${detail}
    </div>`;
  }

  function renderProperties() {
    $('propertiesList').innerHTML = propertiesCache.map(propertyRowHTML).join('');
  }

  $('propertiesList').addEventListener('click', e => {
    const card = e.target.closest('[data-prop]');
    if (!card) return;
    const key = 'p' + card.dataset.prop;
    openRows.has(key) ? openRows.delete(key) : openRows.add(key);
    renderProperties();
  });

  $('refreshQuotesBtn').addEventListener('click', async () => {
    const btn = $('refreshQuotesBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Mise à jour…';
    try {
      const r = await api('/api/refresh-quotes', { method: 'POST' });
      toast(r.refreshed > 0 ? `${r.refreshed} cours mis à jour` : 'Aucun cours à mettre à jour');
      await loadAssets();
    } catch (e) { toast(e.message); }
    btn.disabled = false;
    btn.textContent = '🔄 Actualiser les cours';
  });

  // ==================== Projection ====================

  let projYears = 20;

  document.querySelectorAll('#projHorizon .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#projHorizon .chip').forEach(c =>
        c.classList.toggle('active', c === chip));
      projYears = Number(chip.dataset.years);
      loadProjection();
    });
  });

  async function loadProjection() {
    try {
      const d = await api(`/api/projection?years=${projYears}&immoRate=1`);
      if (d.totals.length === 0) return;
      const last = d.totals[d.totals.length - 1];

      $('p-horizon-label').textContent = `Patrimoine dans ${d.years} ans`;
      $('p-total').textContent = fmtEur(last.total);
      $('p-total-sub').textContent = `net de frais et fiscalité · TMI ${d.tmiPct} %`;
      $('p-tax').textContent = '-' + fmtEur(last.impots);
      $('p-fees').textContent = '-' + fmtEur(last.frais);

      makeChart('proj', 'chartProj', {
        type: 'line',
        data: {
          labels: d.totals.map(t => t.year),
          datasets: [
            { label: 'Total', data: d.totals.map(t => t.total),
              borderColor: TINT, backgroundColor: TINT + '26', fill: true, tension: .3, pointRadius: 0, borderWidth: 2.5 },
            { label: 'Financier', data: d.totals.map(t => t.financierNet),
              borderColor: PALETTE[1], tension: .3, pointRadius: 0, borderWidth: 1.5 },
            { label: 'Immobilier', data: d.totals.map(t => t.immobilier),
              borderColor: PALETTE[3], tension: .3, pointRadius: 0, borderWidth: 1.5 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { color: chartText(), boxWidth: 14 } },
            tooltip: { callbacks: {
              title: items => 'Année ' + items[0].label,
              label: c => c.dataset.label + ' : ' + fmtEur(c.parsed.y)
            } }
          },
          scales: {
            x: { ticks: { color: chartText(), maxTicksLimit: 7 }, grid: { display: false } },
            y: { ticks: { color: chartText(), maxTicksLimit: 5, callback: v => (v >= 1000 ? Math.round(v / 1000) + ' k€' : v + ' €') } }
          }
        }
      });

      const rows = d.accounts.map(a => {
        const s = a.series[a.series.length - 1];
        return `<div class="detected-m">
          <div>
            <strong>${escapeHtml(a.label)}</strong>
            <div style="font-size:.72rem;color:var(--text-2)">${a.ratePct.toFixed(1).replace('.', ',')} %/an · ${escapeHtml(a.rateSource)}</div>
          </div>
          <div style="text-align:right">
            <strong>${fmtEur(s.net)}</strong>
            ${s.tax || s.fees ? `<div style="font-size:.7rem;color:var(--text-2)">impôts+frais ${fmtEur(s.tax + s.fees)}</div>` : ''}
          </div>
        </div>`;
      });
      for (const p of d.properties) {
        const s = p.series[p.series.length - 1];
        rows.push(`<div class="detected-m">
          <div><strong>🏘️ ${escapeHtml(p.label)}</strong>
            <div style="font-size:.72rem;color:var(--text-2)">valeur + cashflows cumulés</div></div>
          <strong>${fmtEur(s.total)}</strong>
        </div>`);
      }
      $('projDetailList').innerHTML = rows.join('') ||
        '<div class="empty-note">Rien à projeter pour l’instant.</div>';
    } catch (e) { toast(e.message); }
  }

  // ==================== Opportunités ====================

  let lastOppInputs = null;

  async function loadOpportunities() {
    try {
      const def = await api('/api/opportunities/loan-defaults');
      if (def.borrowerAge && !$('mo-age').value) $('mo-age').value = def.borrowerAge;
    } catch { /* non bloquant */ }
    refreshOppList();
  }

  $('mOppForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('mo-alert').innerHTML = '';
    const inputs = {
      price: $('mo-price').value || 0,
      isNew: $('mo-new').value === '1',
      works: $('mo-works').value || 0,
      rentMonthly: $('mo-rent').value || 0,
      propertyTaxAnnual: $('mo-tf').value || 0,
      condoChargesAnnual: $('mo-condo').value || 0,
      apport: $('mo-apport').value || 0,
      borrowerAge: $('mo-age').value || null,
      loanRatePct: $('mo-loan-rate').value,
      regime: $('mo-regime').value
    };
    try {
      const sim = await api('/api/opportunities/simulate', { method: 'POST', body: inputs });
      lastOppInputs = inputs;
      renderOppSim(sim);
    } catch (err) {
      $('mo-result').hidden = true;
      $('mo-alert').innerHTML = `<div class="alert-m">${escapeHtml(err.message)}</div>`;
    }
  });

  function renderOppSim(sim) {
    $('mo-result').hidden = false;

    const cf = sim.performance.monthlyCashflow;
    $('mo-cf').textContent = fmtEur(cf, { signed: true }) + ' / mois';
    $('mo-cf-card').style.background = cf >= 0
      ? 'linear-gradient(135deg,#059669,#34c759)'
      : 'linear-gradient(135deg,#dc2626,#ff9f0a)';
    $('mo-cf-sub').textContent =
      `${fmtEur(sim.performance.annualCashflow, { signed: true })} / an · TMI ${sim.fiscal.tmiPct} % · notaire ${fmtEur(sim.acquisition.notaryFees)}`;

    $('mo-yield').textContent = sim.performance.netNetYieldPct.toFixed(2).replace('.', ',') + ' %';
    $('mo-yield-sub').textContent = `brut ${sim.performance.grossYieldPct.toFixed(1).replace('.', ',')} %`;
    $('mo-loan').textContent = fmtEur(sim.financing.totalMonthly);
    $('mo-loan-sub').textContent = `${sim.financing.loanYears} ans · fin à ${sim.financing.endAge} ans`;

    makeChart('moEquity', 'chartMoEquity', {
      type: 'line',
      data: {
        labels: sim.series.map(s => s.year),
        datasets: [
          { label: 'Valeur du bien', data: sim.series.map(s => s.propertyValue),
            borderColor: PALETTE[1], backgroundColor: PALETTE[1] + '22', fill: true, tension: .3, pointRadius: 0, borderWidth: 2 },
          { label: 'Capital restant dû', data: sim.series.map(s => s.remainingDebt),
            borderColor: PALETTE[4], tension: .3, pointRadius: 0, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: chartText(), boxWidth: 14 } },
          tooltip: { callbacks: {
            title: items => 'Année ' + items[0].label,
            label: c => c.dataset.label + ' : ' + fmtEur(c.parsed.y)
          } }
        },
        scales: {
          x: { ticks: { color: chartText(), maxTicksLimit: 6 }, grid: { display: false } },
          y: { ticks: { color: chartText(), maxTicksLimit: 5, callback: v => Math.round(v / 1000) + ' k€' } }
        }
      }
    });
    $('mo-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('mo-save').addEventListener('click', async () => {
    if (!lastOppInputs) return;
    const label = $('mo-label').value.trim() || `Bien à ${fmtEur(Number(lastOppInputs.price))}`;
    try {
      await api('/api/opportunities', {
        method: 'POST',
        body: { label, url: $('mo-url').value.trim(), inputs: lastOppInputs }
      });
      toast('Opportunité sauvegardée');
      refreshOppList();
    } catch (e) { toast(e.message); }
  });

  async function refreshOppList() {
    try {
      const rows = await api('/api/opportunities');
      $('mo-empty').hidden = rows.length > 0;
      $('mo-list').innerHTML = rows.map(o => {
        const s = o.summary || {};
        const cls = (s.monthlyCashflow || 0) >= 0 ? 'positive' : 'negative';
        return `<div class="row-card" data-opp="${o.id}">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(o.label)}</div>
              <div class="row-sub">${s.error ? escapeHtml(s.error)
                : `${fmtEur(s.totalCost)} · ${(s.netNetYieldPct ?? 0).toFixed(2).replace('.', ',')} % net-net · ${s.loanYears} ans`}
                ${o.url ? ` · <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--tint)">annonce ↗</a>` : ''}</div>
            </div>
            <div class="row-value">
              <div class="big ${cls}">${fmtEur(s.monthlyCashflow || 0, { signed: true })}</div>
              <div class="small">/ mois</div>
            </div>
            <button class="icon-btn-m" data-action="del-opp">🗑️</button>
          </div>
        </div>`;
      }).join('');
    } catch (e) { toast(e.message); }
  }

  $('mo-list').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action="del-opp"]');
    if (!btn) return;
    const id = e.target.closest('[data-opp]').dataset.opp;
    if (!confirm('Supprimer cette opportunité ?')) return;
    try {
      await api(`/api/opportunities/${id}`, { method: 'DELETE' });
      refreshOppList();
    } catch (err) { toast(err.message); }
  });

  // ==================== Abonnements ====================

  let subsCache = [];

  async function loadSubs() {
    try {
      const d = await api('/api/subscriptions');
      subsCache = d.subscriptions;
      $('ms-monthly').textContent = '-' + fmtEur(d.totalMonthly);
      $('ms-count').textContent = `${subsCache.length} abonnement${subsCache.length > 1 ? 's' : ''} · ${fmtEur(d.totalAnnual)}/an`;
      $('ms-savings').textContent = fmtEur(d.potentialSavingsAnnual);
      $('ms-empty').hidden = subsCache.length > 0;
      $('ms-list').innerHTML = subsCache.map(s => `
        <div class="row-card" data-sub="${s.id}">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(s.label)}${!s.essential ? '<span class="badge-m">dispensable</span>' : ''}</div>
              <div class="row-sub">${CATEGORY_LABELS[s.category] || s.category} · ${s.periodicity} · -${fmtEur(s.monthly_cost * 12)}/an</div>
            </div>
            <div class="row-value"><div class="big negative">-${fmtEur(s.monthly_cost)}</div><div class="small">/ mois</div></div>
            <label class="switch" title="Essentiel ?">
              <input type="checkbox" data-action="toggle-ess" ${s.essential ? 'checked' : ''}>
              <span class="knob"></span>
            </label>
          </div>
        </div>`).join('');
    } catch (e) { toast(e.message); }
  }

  $('ms-list').addEventListener('change', async e => {
    const input = e.target.closest('[data-action="toggle-ess"]');
    if (!input) return;
    const sub = subsCache.find(s => s.id === Number(e.target.closest('[data-sub]').dataset.sub));
    if (!sub) return;
    try {
      await api(`/api/subscriptions/${sub.id}`, { method: 'PUT', body: { ...sub, essential: input.checked } });
      loadSubs();
    } catch (err) { toast(err.message); }
  });

  $('ms-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const box = $('ms-analyze');
    box.innerHTML = '<p class="foot-note">Analyse en cours…</p>';
    try {
      const csv = await file.text();
      const d = await api('/api/subscriptions/analyze', { method: 'POST', body: { csv } });
      if (d.subscriptions.length === 0) {
        box.innerHTML = `<p class="foot-note">Aucune récurrence détectée (${d.transactionCount} transactions).</p>`;
        return;
      }
      const existing = new Set(subsCache.map(s => s.label.toUpperCase()));
      box.innerHTML = d.subscriptions.map((s, i) => `
        <div class="detected-m" data-idx="${i}">
          <div>
            <strong>${escapeHtml(s.label)}</strong>
            <div style="font-size:.7rem;color:var(--text-2)">${s.periodicity} · ${s.occurrences}× · -${fmtEur(s.monthlyCost)}/mois</div>
          </div>
          ${existing.has(s.label.toUpperCase())
            ? '<span style="font-size:.72rem;color:var(--text-2)">déjà suivi</span>'
            : '<button class="mini-btn" data-action="add-det">+ Suivre</button>'}
        </div>`).join('');
      box._detected = d.subscriptions;
    } catch (err) {
      box.innerHTML = `<div class="alert-m">${escapeHtml(err.message)}</div>`;
    } finally {
      e.target.value = '';
    }
  });

  $('ms-analyze').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action="add-det"]');
    if (!btn) return;
    const s = ($('ms-analyze')._detected || [])[Number(e.target.closest('[data-idx]').dataset.idx)];
    if (!s) return;
    btn.disabled = true;
    try {
      await api('/api/subscriptions', {
        method: 'POST',
        body: { label: s.label, amount: s.amount, periodicity: s.periodicity, category: s.category, essential: true }
      });
      btn.replaceWith(Object.assign(document.createElement('span'),
        { textContent: '✓', className: 'positive', style: 'font-weight:700' }));
      loadSubs();
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
    }
  });

  // ==================== Démarrage ====================

  (async () => {
    try {
      const res = await fetch('/api/me');
      if (res.status === 401) { window.location.href = '/'; return; }
    } catch {
      toast('Serveur injoignable');
      return;
    }
    showTab('home');
  })();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    loadedTabs.clear();
    const active = document.querySelector('.tab-item.active')?.dataset.tab || 'home';
    loadedTabs.add(active);
    ({ home: loadHome, assets: loadAssets, projection: loadProjection,
       opportunities: loadOpportunities, subs: loadSubs }[active])?.();
  });
})();
