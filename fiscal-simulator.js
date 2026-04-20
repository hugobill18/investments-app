// fiscal-simulator.js — Simulateur d'impact fiscal pour un bien immobilier
//
// Calcule et compare 3 régimes fiscaux côte à côte :
//   1. Micro-foncier    : abattement 30%, plafonné 15 000 €/an de revenus fonciers
//   2. Régime réel      : charges déductibles, déficit foncier plafonné 10 700 €/an
//   3. LMNP micro-BIC   : abattement 50% (71% si meublé tourisme classé),
//                         plafonné 77 700 € de recettes
//
// La TMI est récupérée automatiquement depuis le foyer fiscal / revenus de l'utilisateur.
// Les prélèvements sociaux sont de 17,2 % dans tous les cas.

'use strict';

const { calculerIR, calculerNbParts } = require('./tax');

const SOCIAL_CHARGES_RATE = 0.172; // Prélèvements sociaux France

// Plafonds légaux
const PLAFOND_RECETTES_MICRO_FONCIER = 15_000;   // Au-delà : régime réel obligatoire
const PLAFOND_RECETTES_MICRO_BIC     = 77_700;   // Au-delà : régime réel BIC obligatoire
const PLAFOND_DEFICIT_FONCIER        = 10_700;   // Imputable sur revenu global / an

// Abattements micro
const ABATTEMENT_MICRO_FONCIER            = 0.30;
const ABATTEMENT_MICRO_BIC_STANDARD       = 0.50;
const ABATTEMENT_MICRO_BIC_TOURISME_CLASS = 0.71;

// ─── Utilitaire : tranche marginale pour un revenu imposable ─────────────────
const { BAREME_2024 } = require('./tax');

function tmiPourRevenuParPart(revenuParPart) {
  for (const { max, rate } of BAREME_2024) {
    if (revenuParPart <= max) return rate;
  }
  return 0.45;
}

/**
 * Récupère la TMI du foyer en incluant un revenu foncier/BIC additionnel.
 *
 * @param {object} foyer     - Ligne de la table foyer_fiscal
 * @param {Array}  revenus   - Lignes de la table revenus
 * @param {number} revenusSupplementaires - Revenus fonciers/BIC à ajouter au calcul IR
 * @returns {number} tmi (ex: 0.30)
 */
function getTMIAvecRevenuSupp(foyer, revenus, revenusSupplementaires) {
  const result = calculerIR({
    foyer,
    revenus,
    revenusFonciers: revenusSupplementaires,
  });
  return result.tmi;
}

// ─── Simulation Micro-Foncier ─────────────────────────────────────────────────
//
// Conditions : louer nu, revenus fonciers bruts ≤ 15 000 €/an.
// Base imposable = revenus × (1 - 30%)
// Si revenus > 15 000 € → micro-foncier non accessible.
//
function simulerMicroFoncier({ recettesAnnuelles, cashflowAvantImpot, foyer, revenus }) {
  const eligible = recettesAnnuelles <= PLAFOND_RECETTES_MICRO_FONCIER;
  const warning  = !eligible ? `Micro-foncier inaccessible : recettes (${Math.round(recettesAnnuelles)} €) > plafond ${PLAFOND_RECETTES_MICRO_FONCIER.toLocaleString('fr-FR')} €/an` : null;

  const baseImposable = recettesAnnuelles * (1 - ABATTEMENT_MICRO_FONCIER);
  const tmi = getTMIAvecRevenuSupp(foyer, revenus, baseImposable);

  const ir = Math.round(baseImposable * tmi);
  const ps = Math.round(baseImposable * SOCIAL_CHARGES_RATE);
  const impotTotal = ir + ps;
  const cashflowNet = Math.round(cashflowAvantImpot - impotTotal);

  return {
    regime: 'micro_foncier',
    label: 'Micro-foncier',
    eligible,
    warning,
    recettes: Math.round(recettesAnnuelles),
    abattement: Math.round(recettesAnnuelles * ABATTEMENT_MICRO_FONCIER),
    abattementPct: 30,
    baseImposable: Math.round(baseImposable),
    tmi: Math.round(tmi * 100),
    ir,
    ps,
    impotTotal,
    cashflowAvantImpot: Math.round(cashflowAvantImpot),
    cashflowNet,
    cashflowNetMensuel: Math.round(cashflowNet / 12),
  };
}

// ─── Simulation Régime Réel Foncier ──────────────────────────────────────────
//
// Charges déductibles : intérêts crédit + travaux + assurances + frais gestion
//                     + taxe foncière (hors parts locatives à la charge du locataire)
// Déficit foncier imputable sur revenu global : plafonné 10 700 €/an.
// Surplus de déficit reportable sur revenus fonciers des 10 années suivantes.
//
function simulerReelFoncier({
  recettesAnnuelles,
  interetsCredit,
  travaux,
  assurances,
  fraisGestion,
  taxeFonciere,
  cashflowAvantImpot,
  foyer,
  revenus,
}) {
  const chargesDeductibles = interetsCredit + travaux + assurances + fraisGestion + taxeFonciere;
  const resultatFoncier    = recettesAnnuelles - chargesDeductibles;

  let baseImposable    = 0;
  let deficitFoncier   = 0;
  let deficitImputable = 0;  // Sur revenu global (plafonné 10 700 €)
  let deficitReporte   = 0;  // Report sur revenus fonciers futures

  if (resultatFoncier >= 0) {
    baseImposable = resultatFoncier;
  } else {
    deficitFoncier   = -resultatFoncier;
    deficitImputable = Math.min(deficitFoncier, PLAFOND_DEFICIT_FONCIER);
    deficitReporte   = Math.max(0, deficitFoncier - PLAFOND_DEFICIT_FONCIER);
  }

  // Pour les PS : le déficit n'est pas imputable sur les PS (base ≥ 0)
  const basePS = Math.max(0, resultatFoncier);
  const tmi    = getTMIAvecRevenuSupp(foyer, revenus, baseImposable);

  const ir = baseImposable > 0
    ? Math.round(baseImposable * tmi)
    : Math.round(-deficitImputable * tmi);  // économie d'IR grâce au déficit

  const ps           = Math.round(basePS * SOCIAL_CHARGES_RATE);
  const impotTotal   = Math.max(0, ir) + ps;
  const economieIR   = deficitFoncier > 0 ? Math.abs(Math.min(0, ir)) : 0;
  const cashflowNet  = Math.round(cashflowAvantImpot - impotTotal + economieIR);

  return {
    regime: 'reel_foncier',
    label: 'Régime réel',
    eligible: true,
    warning: null,
    recettes: Math.round(recettesAnnuelles),
    chargesDeductibles: Math.round(chargesDeductibles),
    detail: {
      interetsCredit:  Math.round(interetsCredit),
      travaux:         Math.round(travaux),
      assurances:      Math.round(assurances),
      fraisGestion:    Math.round(fraisGestion),
      taxeFonciere:    Math.round(taxeFonciere),
    },
    resultatFoncier:  Math.round(resultatFoncier),
    baseImposable:    Math.round(baseImposable),
    deficitFoncier:   Math.round(deficitFoncier),
    deficitImputable: Math.round(deficitImputable),
    deficitReporte:   Math.round(deficitReporte),
    tmi: Math.round(tmi * 100),
    ir:       Math.round(ir),
    ps,
    impotTotal,
    economieIR,
    cashflowAvantImpot: Math.round(cashflowAvantImpot),
    cashflowNet,
    cashflowNetMensuel: Math.round(cashflowNet / 12),
  };
}

// ─── Simulation LMNP Micro-BIC ────────────────────────────────────────────────
//
// Conditions : location meublée, recettes ≤ 77 700 €/an.
//   - Abattement standard   : 50%
//   - Abattement tourisme classé : 71% (si isTourismeClasse = true)
//
function simulerLMNPMicroBIC({
  recettesAnnuelles,
  cashflowAvantImpot,
  foyer,
  revenus,
  isTourismeClasse = false,
}) {
  const eligible = recettesAnnuelles <= PLAFOND_RECETTES_MICRO_BIC;
  const warning  = !eligible
    ? `LMNP micro-BIC inaccessible : recettes (${Math.round(recettesAnnuelles)} €) > plafond ${PLAFOND_RECETTES_MICRO_BIC.toLocaleString('fr-FR')} €/an`
    : null;

  const abattementPct  = isTourismeClasse ? 71 : 50;
  const abattementRate = isTourismeClasse
    ? ABATTEMENT_MICRO_BIC_TOURISME_CLASS
    : ABATTEMENT_MICRO_BIC_STANDARD;

  const baseImposable = recettesAnnuelles * (1 - abattementRate);
  const tmi = getTMIAvecRevenuSupp(foyer, revenus, baseImposable);

  const ir = Math.round(baseImposable * tmi);
  const ps = Math.round(baseImposable * SOCIAL_CHARGES_RATE);
  const impotTotal  = ir + ps;
  const cashflowNet = Math.round(cashflowAvantImpot - impotTotal);

  return {
    regime: 'lmnp_micro_bic',
    label: isTourismeClasse ? 'LMNP micro-BIC (tourisme classé)' : 'LMNP micro-BIC',
    eligible,
    warning,
    recettes: Math.round(recettesAnnuelles),
    abattement: Math.round(recettesAnnuelles * abattementRate),
    abattementPct,
    isTourismeClasse,
    baseImposable: Math.round(baseImposable),
    tmi: Math.round(tmi * 100),
    ir,
    ps,
    impotTotal,
    cashflowAvantImpot: Math.round(cashflowAvantImpot),
    cashflowNet,
    cashflowNetMensuel: Math.round(cashflowNet / 12),
  };
}

// ─── Simulateur principal ─────────────────────────────────────────────────────
//
// Entrée :
//   bien    : ligne de la table properties
//   foyer   : ligne de la table foyer_fiscal (ou null → célibataire sans enfants)
//   revenus : lignes de la table revenus (pour calcul TMI réel)
//
// Sortie :
//   { micro_foncier, reel_foncier, lmnp_micro_bic, meta }
//
function simulerImpactFiscal({ bien, foyer, revenus = [] }) {
  // Normalisation du foyer par défaut
  const foyerNorm = foyer || {
    situation_maritale: 'celibataire',
    nb_enfants: 0,
    nb_enfants_altgarde: 0,
    parent_isole: 0,
  };

  // Flux bruts du bien
  const recettesAnnuelles = (Number(bien.rent_monthly) || 0) * 12;
  const creditAnnuel      = (Number(bien.credit_monthly_payment) || 0) * 12;
  const taxeFonciere      = Number(bien.property_tax_annual) || 0;
  const chargesCopro      = Number(bien.condo_charges_annual) || 0;

  // Charges déductibles saisies (réel) = le champ deductible_charges_annual
  // Convention : ce champ contient intérêts + travaux + assurances + frais gestion
  //              (taxe foncière et charges copro sont ajoutées séparément car déjà connues)
  const chargesDeductiblesSaisies = Number(bien.deductible_charges_annual) || 0;

  // Cashflow avant impôt = loyers - crédit - taxe foncière - charges copro
  const cashflowAvantImpot = recettesAnnuelles - creditAnnuel - taxeFonciere - chargesCopro;

  // Simulation des 3 régimes
  const microFoncier = simulerMicroFoncier({
    recettesAnnuelles,
    cashflowAvantImpot,
    foyer: foyerNorm,
    revenus,
  });

  const reelFoncier = simulerReelFoncier({
    recettesAnnuelles,
    // On ventile les charges déductibles saisies comme "intérêts + autres"
    // On ajoute taxe foncière et copro qui sont systématiquement déductibles au réel
    interetsCredit:  chargesDeductiblesSaisies,
    travaux:         0,
    assurances:      0,
    fraisGestion:    0,
    taxeFonciere,
    cashflowAvantImpot,
    foyer: foyerNorm,
    revenus,
  });

  const lmnpMicroBic = simulerLMNPMicroBIC({
    recettesAnnuelles,
    cashflowAvantImpot,
    foyer: foyerNorm,
    revenus,
    isTourismeClasse: bien.property_type === 'locative_tourisme_classe',
  });

  // TMI de base (sans revenus fonciers) pour affichage
  const irBase  = calculerIR({ foyer: foyerNorm, revenus });
  const tmiBase = irBase.tmi;

  return {
    meta: {
      bienId:             bien.id,
      bienLabel:          bien.label,
      recettesAnnuelles:  Math.round(recettesAnnuelles),
      cashflowAvantImpot: Math.round(cashflowAvantImpot),
      tmiBase:            Math.round(tmiBase * 100),
      nbParts:            irBase.nbParts,
    },
    micro_foncier: microFoncier,
    reel_foncier:  reelFoncier,
    lmnp_micro_bic: lmnpMicroBic,
  };
}

module.exports = {
  simulerImpactFiscal,
  simulerMicroFoncier,
  simulerReelFoncier,
  simulerLMNPMicroBIC,
  PLAFOND_RECETTES_MICRO_FONCIER,
  PLAFOND_RECETTES_MICRO_BIC,
  PLAFOND_DEFICIT_FONCIER,
};
