// projection.js — Projection du patrimoine sur plusieurs années.
//
// Pour chaque placement financier, on simule mois par mois :
//   - capitalisation au taux attendu (net de frais de gestion annuels),
//   - versements mensuels nets de frais d'entrée, retraits mensuels,
//   - à chaque fin d'année : valeur brute, valeur de sortie (après frais de
//     sortie) et valeur NETTE après fiscalité de l'enveloppe (investment-tax).
//
// Le taux attendu :
//   - types "simples" : le taux annuel saisi (livret, fonds €, PEL…),
//   - portefeuilles   : moyenne pondérée des CAGR 3 ans des positions
//     (fournis par l'appelant via `expectedRates`), sinon taux par défaut.
//
// Pour l'immobilier : valeur du bien revalorisée à `immoAppreciationPct`/an
// + cumul du cashflow net annuel (déjà net d'impôt via cashflow.js).

const { taxOnGain } = require('./investment-tax');
const { isPortfolio } = require('./financial');

// Taux annuels par défaut si aucune donnée de marché n'est disponible (%)
const DEFAULT_PORTFOLIO_RATES = {
  compte_titres: 5.0, pea: 5.0, assurance_vie_uc: 4.0, per: 4.0, crypto: 4.0
};

// Ancienneté actuelle d'une enveloppe (années), à partir de opened_year.
function holdingYearsNow(account) {
  const y = Number(account.opened_year);
  if (!Number.isFinite(y) || y < 1950) return 0;
  return Math.max(0, new Date().getFullYear() - y);
}

// Projette un compte financier sur `years` années.
//   expectedRatePct : taux annuel brut attendu (%) ; si null, déduit du compte.
// Renvoie { series: [{year, gross, invested, net, tax, fees}], ratePct }
function projectAccount(account, positions, years, {
  expectedRatePct = null, isCouple = false, tmi = 0.30
} = {}) {
  const portfolio = isPortfolio(account.account_type);

  let initialValue;
  if (portfolio) {
    initialValue = positions.reduce(
      (s, p) => s + (Number(p.quantity) || 0) * (Number(p.current_price) || 0), 0);
  } else {
    initialValue = Number(account.amount) || 0;
  }

  let ratePct = expectedRatePct;
  if (ratePct == null) {
    ratePct = portfolio
      ? (DEFAULT_PORTFOLIO_RATES[account.account_type] ?? 4.0)
      : (Number(account.annual_rate) || 0);
  }

  const feesEntry = (Number(account.fees_entry_pct) || 0) / 100;
  const feesMgmt  = (Number(account.fees_mgmt_pct)  || 0) / 100;
  const feesExit  = (Number(account.fees_exit_pct)  || 0) / 100;

  const monthlyIn  = Number(account.monthly_in)  || 0;
  const monthlyOut = Number(account.monthly_out) || 0;
  // Taux mensuel net de frais de gestion
  const monthlyRate = (ratePct / 100 - feesMgmt) / 12;

  const baseHolding = holdingYearsNow(account);
  let value = initialValue;
  let invested = initialValue;
  let feesPaid = 0;

  const series = [];
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      const before = value;
      value = value * (1 + monthlyRate);
      // Frais de gestion comptabilisés pour information
      feesPaid += before * feesMgmt / 12;
      const inNet = monthlyIn * (1 - feesEntry);
      feesPaid += monthlyIn * feesEntry;
      value += inNet - monthlyOut;
      invested += monthlyIn - monthlyOut;
      if (value < 0) value = 0;
    }
    const exitValue = value * (1 - feesExit);
    const gain = Math.max(0, exitValue - invested);
    const { tax } = taxOnGain(account.account_type, gain, {
      holdingYears: baseHolding + y, isCouple, tmi
    });
    series.push({
      year: y,
      gross: Math.round(value),
      invested: Math.round(invested),
      net: Math.round(exitValue - tax),
      tax: Math.round(tax),
      fees: Math.round(feesPaid + value * feesExit)
    });
  }

  return { series, ratePct };
}

// Projette un bien immobilier : valeur revalorisée + cumul du cashflow net.
// `cashflow` = résultat de computeCashflow(bien).
function projectProperty(property, cashflow, years, { appreciationPct = 1.0 } = {}) {
  const series = [];
  let value = Number(property.current_value) || 0;
  let cumulativeCashflow = 0;
  for (let y = 1; y <= years; y++) {
    value *= 1 + appreciationPct / 100;
    cumulativeCashflow += cashflow.netCashflow;
    series.push({
      year: y,
      value: Math.round(value),
      cumulativeCashflow: Math.round(cumulativeCashflow),
      total: Math.round(value + cumulativeCashflow)
    });
  }
  return { series };
}

// Agrège les projections de tous les comptes + biens en une série globale.
function aggregateTotals(accountProjections, propertyProjections, years) {
  const totals = [];
  for (let y = 1; y <= years; y++) {
    let finNet = 0, finGross = 0, finTax = 0, finFees = 0, immo = 0;
    for (const ap of accountProjections) {
      const pt = ap.series[y - 1];
      finNet += pt.net; finGross += pt.gross; finTax += pt.tax; finFees += pt.fees;
    }
    for (const pp of propertyProjections) {
      immo += pp.series[y - 1].total;
    }
    totals.push({
      year: y,
      financierNet: Math.round(finNet),
      financierBrut: Math.round(finGross),
      impots: Math.round(finTax),
      frais: Math.round(finFees),
      immobilier: Math.round(immo),
      total: Math.round(finNet + immo)
    });
  }
  return totals;
}

module.exports = { projectAccount, projectProperty, aggregateTotals, DEFAULT_PORTFOLIO_RATES };
