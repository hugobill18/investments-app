// investment-tax.js — Fiscalité des placements financiers à la sortie.
//
// Chaque enveloppe a ses règles françaises (2024) :
//   - Livrets réglementés (A, LDDS, LEP)      : exonérés d'impôt et de PS.
//   - Livret bancaire, CTO, PEL/CEL récents,
//     épargne, crypto                          : PFU 30% (12,8% IR + 17,2% PS)
//     sur les GAINS uniquement.
//   - PEA : avant 5 ans → PFU 30% ; après 5 ans → 17,2% de PS seulement.
//   - Assurance-vie : avant 8 ans → PFU 30% ; après 8 ans → abattement annuel
//     de 4 600 € (9 200 € pour un couple) sur les gains, puis 7,5% + 17,2%
//     (hypothèse : encours < 150 000 €).
//   - PER : sortie en capital → gains imposés à TMI + 17,2% (approximation,
//     versements supposés déduits à l'entrée).
//
// Les frais du contrat (entrée / gestion / sortie) sont gérés par projection.js ;
// ici on ne calcule que l'impôt sur le gain à un horizon donné.

const PS_RATE       = 0.172;   // prélèvements sociaux
const PFU_IR_RATE   = 0.128;   // part IR du PFU
const PFU_RATE      = PS_RATE + PFU_IR_RATE;      // 30%
const AV_IR_REDUIT  = 0.075;   // AV > 8 ans (encours < 150 k€)
const AV_ABATTEMENT_SEUL   = 4600;
const AV_ABATTEMENT_COUPLE = 9200;

// Calcule l'impôt dû sur `gain` (plus-value + intérêts) pour un type de compte.
//   holdingYears : ancienneté de l'enveloppe au moment de la sortie.
//   isCouple     : imposition commune (abattement AV doublé).
//   tmi          : taux marginal (décimal, ex. 0.30) — utilisé pour le PER.
function taxOnGain(accountType, gain, { holdingYears = 0, isCouple = false, tmi = 0.30 } = {}) {
  const g = Math.max(0, Number(gain) || 0);
  if (g === 0) return { tax: 0, rate: 0, label: 'Aucun gain imposable' };

  switch (accountType) {
    case 'livret':
      return { tax: 0, rate: 0, label: 'Exonéré (livret réglementé)' };

    case 'pea':
      if (holdingYears >= 5) {
        return { tax: g * PS_RATE, rate: PS_RATE, label: 'PEA > 5 ans : PS 17,2% seulement' };
      }
      return { tax: g * PFU_RATE, rate: PFU_RATE, label: 'PEA < 5 ans : PFU 30%' };

    case 'assurance_vie_euro':
    case 'assurance_vie_uc': {
      if (holdingYears >= 8) {
        const abatt = isCouple ? AV_ABATTEMENT_COUPLE : AV_ABATTEMENT_SEUL;
        const taxableIR = Math.max(0, g - abatt);
        const tax = taxableIR * AV_IR_REDUIT + g * PS_RATE;
        return {
          tax, rate: g > 0 ? tax / g : 0,
          label: `AV > 8 ans : abattement ${abatt.toLocaleString('fr-FR')} € puis 7,5% + PS 17,2%`
        };
      }
      return { tax: g * PFU_RATE, rate: PFU_RATE, label: 'AV < 8 ans : PFU 30%' };
    }

    case 'per': {
      const rate = Math.min(0.45, Math.max(0, tmi)) + PS_RATE;
      return { tax: g * rate, rate, label: `PER (sortie capital) : TMI ${(tmi * 100).toFixed(0)}% + PS 17,2% sur les gains` };
    }

    // PFU par défaut : CTO, livret bancaire, PEL/CEL récents, crypto, épargne, autre
    default:
      return { tax: g * PFU_RATE, rate: PFU_RATE, label: 'PFU 30% (12,8% IR + 17,2% PS)' };
  }
}

// Frais par défaut proposés à l'utilisateur selon le type d'enveloppe
// (moyennes de marché, modifiables placement par placement).
const DEFAULT_FEES = {
  assurance_vie_euro: { entry: 1.0, mgmt: 0.80, exit: 0 },
  assurance_vie_uc:   { entry: 1.0, mgmt: 0.90, exit: 0 },
  per:                { entry: 1.5, mgmt: 0.90, exit: 0 },
  pea:                { entry: 0,   mgmt: 0,    exit: 0 },
  compte_titres:      { entry: 0,   mgmt: 0,    exit: 0 },
  crypto:             { entry: 1.0, mgmt: 0,    exit: 1.0 },
};

function defaultFeesFor(accountType) {
  return DEFAULT_FEES[accountType] || { entry: 0, mgmt: 0, exit: 0 };
}

module.exports = { taxOnGain, defaultFeesFor, PS_RATE, PFU_RATE };
