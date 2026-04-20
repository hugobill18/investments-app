// cashflow.js — Calcul du cashflow annuel et net pour un bien immobilier.
//
// Convention : tous les flux sont du point de vue du propriétaire.
//   - Les loyers perçus sont positifs.
//   - Toutes les autres lignes (crédit, taxe foncière, charges copro, impôt)
//     sont exprimées en valeurs positives représentant des sorties d'argent.
//   - Le cashflow renvoyé est la DIFFÉRENCE (positif = vous gagnez, négatif = ça vous coûte).
//
// La TMI est maintenant calculée automatiquement depuis le foyer fiscal
// (via tax.js) et peut être passée en paramètre optionnel `tmiOverride`.
// Si non fournie, on utilise une valeur par défaut de 30% (tranche médiane).

const SOCIAL_CHARGES_RATE = 0.172; // Prélèvements sociaux France = 17.2%
const DEFAULT_TMI = 0.30;          // Valeur par défaut si foyer non configuré

// Abattements "micro" (forfaitaire)
const ABATTEMENT = {
  micro_foncier: 0.30,   // location nue
  micro_bic:     0.50    // location meublée (LMNP)
};

// tmiOverride : TMI calculée par le foyer fiscal (nombre décimal, ex: 0.30)
// Si null/undefined, utilise DEFAULT_TMI (30%)
function computeCashflow(p, tmiOverride = null) {
  // Coerce les nombres (SQLite renvoie déjà des REAL mais au cas où)
  const rent            = Number(p.rent_monthly)           || 0;
  const creditM         = Number(p.credit_monthly_payment) || 0;
  const propertyTax     = Number(p.property_tax_annual)    || 0;
  const condo           = Number(p.condo_charges_annual)   || 0;
  // TMI : priorité au foyer fiscal, sinon champ legacy du bien, sinon défaut 30%
  const tmi             = tmiOverride !== null
    ? tmiOverride * 100
    : (Number(p.marginal_tax_rate) || DEFAULT_TMI * 100);
  const deductibleReel  = Number(p.deductible_charges_annual) || 0;

  const annualRevenue   = rent * 12;
  const annualCredit    = creditM * 12;
  const annualExpenses  = annualCredit + propertyTax + condo;

  // --- Base imposable selon le régime -----------------------------------
  let taxableBase = 0;
  let regimeLabel = '';

  switch (p.tax_regime) {
    case 'micro_foncier':
      taxableBase = Math.max(0, annualRevenue * (1 - ABATTEMENT.micro_foncier));
      regimeLabel = 'Micro-foncier (abattement 30%)';
      break;
    case 'micro_bic':
      taxableBase = Math.max(0, annualRevenue * (1 - ABATTEMENT.micro_bic));
      regimeLabel = 'Micro-BIC (abattement 50%)';
      break;
    case 'reel_foncier':
      // Simplifié : revenus - charges déductibles (taxe foncière, copro, intérêts, travaux…).
      // L'utilisateur saisit ces charges déductibles annuelles.
      // Par défaut on inclut taxe foncière et charges copro qui sont réputées déductibles.
      taxableBase = Math.max(0, annualRevenue - propertyTax - condo - deductibleReel);
      regimeLabel = 'Réel foncier';
      break;
    case 'reel_bic':
      // Idem, avec en plus le principe d'amortissement qu'on ne calcule pas ici.
      taxableBase = Math.max(0, annualRevenue - propertyTax - condo - deductibleReel);
      regimeLabel = 'Réel BIC';
      break;
    case 'aucune':
    default:
      taxableBase = 0;
      regimeLabel = 'Aucune fiscalité sur les revenus';
  }

  const totalRate      = (tmi / 100) + SOCIAL_CHARGES_RATE;
  const estimatedTax   = taxableBase * totalRate;

  const grossCashflow  = annualRevenue - annualExpenses;             // avant impôt
  const netCashflow    = grossCashflow - estimatedTax;               // après impôt

  return {
    annualRevenue,
    annualCredit,
    annualPropertyTax: propertyTax,
    annualCondoCharges: condo,
    annualExpenses,
    taxRegime: p.tax_regime,
    taxRegimeLabel: regimeLabel,
    taxableBase,
    marginalTaxRate: tmi,
    socialChargesRate: SOCIAL_CHARGES_RATE,
    estimatedTax,
    grossCashflow,
    netCashflow,
    monthlyNetCashflow: netCashflow / 12
  };
}

module.exports = { computeCashflow };
