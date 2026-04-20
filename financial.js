// financial.js — Calculs pour les placements financiers.

// Types "simples" : un montant + flux mensuels + rendement annuel.
// Types "portefeuille" : une liste de positions (titres).
const PORTFOLIO_TYPES = new Set(['compte_titres', 'pea', 'assurance_vie_uc', 'per', 'crypto']);

function isPortfolio(type) {
  return PORTFOLIO_TYPES.has(type);
}

const TYPE_LABELS = {
  livret:               'Livret réglementé',
  livret_banque:        'Livret bancaire',
  assurance_vie_euro:   'Assurance-vie (fonds €)',
  pel:                  'PEL',
  cel:                  'CEL',
  epargne_simple:       'Épargne / compte courant',
  compte_titres:        'Compte-titres (CTO)',
  pea:                  'PEA',
  assurance_vie_uc:     'Assurance-vie (UC)',
  per:                  'PER',
  crypto:               'Crypto',
  autre:                'Autre'
};

// Calcule la valeur d'un compte financier.
//   - Types simples : montant placé.
//   - Portefeuilles : somme (quantité × prix actuel).
// Renvoie aussi les flux mensuels/annuels et la +/- value pour les portefeuilles.
function computeAccount(account, positions = []) {
  const type = account.account_type;
  const portfolio = isPortfolio(type);

  let currentValue, investedValue, unrealizedGain;
  if (portfolio) {
    currentValue  = positions.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.current_price) || 0), 0);
    investedValue = positions.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.buy_price)     || 0), 0);
    unrealizedGain = currentValue - investedValue;
  } else {
    currentValue   = Number(account.amount) || 0;
    investedValue  = currentValue;
    unrealizedGain = 0;
  }

  const monthlyIn   = Number(account.monthly_in)  || 0;
  const monthlyOut  = Number(account.monthly_out) || 0;
  const monthlyNet  = monthlyIn - monthlyOut;
  const annualNet   = monthlyNet * 12;
  const annualRate  = Number(account.annual_rate) || 0;
  // Rendement estimé annuel (approximation simple : taux × montant actuel)
  const estimatedAnnualReturn = portfolio ? 0 : currentValue * (annualRate / 100);

  return {
    accountType: type,
    typeLabel: TYPE_LABELS[type] || type,
    isPortfolio: portfolio,
    currentValue,
    investedValue,
    unrealizedGain,
    unrealizedGainPct: investedValue > 0 ? (unrealizedGain / investedValue) * 100 : 0,
    monthlyIn,
    monthlyOut,
    monthlyNet,
    annualNet,
    annualRate,
    estimatedAnnualReturn,
    positionCount: positions.length
  };
}

module.exports = { computeAccount, isPortfolio, TYPE_LABELS, PORTFOLIO_TYPES };
