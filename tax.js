// tax.js — Calcul de l'impôt sur le revenu français (barème 2024)
//
// Sources :
//   - Barème IR 2024 (revenus 2023) : https://www.impots.gouv.fr/
//   - Quotient familial : https://www.service-public.fr/particuliers/vosdroits/F2705
//   - Plafonnement QF : https://www.impots.gouv.fr/particuliers/quotient-familial
//
// Fonctionnement :
//   1. On calcule le nombre de parts (N) selon la situation du foyer.
//   2. On divise le revenu net imposable par N → quotient familial.
//   3. On applique le barème progressif au quotient.
//   4. On multiplie l'impôt ainsi calculé par N.
//   5. On vérifie le plafonnement du QF : l'avantage fiscal par demi-part
//      ne peut pas dépasser 1 759 € (plafond 2024).
//
// Abattement salarié :
//   - 10% des salaires bruts, min 495 €, max 14 171 € (2024)

// ─── Barème progressif 2024 (revenus 2023) ────────────────────────────────
// Tranches : [limite_supérieure, taux]
// La dernière tranche n'a pas de limite (Infinity)
const BAREME_2024 = [
  { max:  11_294, rate: 0.00 },
  { max:  28_797, rate: 0.11 },
  { max:  82_341, rate: 0.30 },
  { max: 177_106, rate: 0.41 },
  { max: Infinity, rate: 0.45 },
];

// Plafonnement de l'avantage fiscal par demi-part supplémentaire (2024)
const PLAFOND_DEMI_PART = 1759;   // € par demi-part au-delà de la part de base

// Abattement forfaitaire salarié 10%
const ABATTEMENT_SALARIE_RATE  = 0.10;
const ABATTEMENT_SALARIE_MIN   = 495;
const ABATTEMENT_SALARIE_MAX   = 14_171;

// Décote (2024) : réduit l'impôt des contribuables modestes
const DECOTE_SEUIL_CELIBATAIRE = 1929;
const DECOTE_SEUIL_COUPLE      = 3191;
const DECOTE_TAUX              = 0.4525;

// ─── Calcul du nombre de parts ─────────────────────────────────────────────
//
// Règles simplifiées (hors cas spéciaux comme anciens combattants, invalides) :
//
//   Célibataire, divorcé, séparé   → 1 part
//   Marié, pacsé                   → 2 parts
//   Veuf avec enfant(s) à charge   → 2 parts (maintien de la part)
//   Veuf sans enfant               → 1 part
//
//   1er et 2e enfant à charge      → +0,5 part chacun
//   À partir du 3e enfant          → +1 part par enfant
//   Enfant en garde alternée       → +0,25 part (moitié de la demi-part)
//   Parent isolé (célibataire + ≥1 enfant) → +0,5 part supplémentaire
//   Invalide déclarant             → +0,5 part par déclarant invalide
//
function calculerNbParts(foyer) {
  const {
    situation_maritale = 'celibataire',
    nb_enfants = 0,
    nb_enfants_altgarde = 0,
    parent_isole = false,
    nb_invalides_declarants = 0,  // nb de déclarants invalides (0, 1 ou 2)
  } = foyer;

  const nbEnfants    = Math.max(0, Math.floor(Number(nb_enfants) || 0));
  const nbAltGarde   = Math.max(0, Math.floor(Number(nb_enfants_altgarde) || 0));
  const isoleBonus   = !!parent_isole;
  const nbInvalides  = Math.min(2, Math.max(0, Math.floor(Number(nb_invalides_declarants) || 0)));
  const situation    = String(situation_maritale).toLowerCase().trim();

  // Parts de base
  let parts = 0;
  if (situation === 'marie' || situation === 'pacse') {
    parts = 2;
  } else if (situation === 'veuf') {
    // Veuf avec enfant(s) : 2 parts (maintien de la demi-part du conjoint)
    parts = nbEnfants > 0 ? 2 : 1;
  } else {
    // celibataire, divorce, separe
    parts = 1;
  }

  // Parts pour les enfants à charge pleine
  let partsEnfants = 0;
  if (nbEnfants >= 1) partsEnfants += 0.5;
  if (nbEnfants >= 2) partsEnfants += 0.5;
  if (nbEnfants >= 3) partsEnfants += (nbEnfants - 2) * 1.0;

  // Enfants en garde alternée (+0.25 par enfant)
  partsEnfants += nbAltGarde * 0.25;

  parts += partsEnfants;

  // Bonus parent isolé (célibataire/veuf/divorcé avec enfant charge)
  const estIsole = ['celibataire', 'divorce', 'separe'].includes(situation)
    || (situation === 'veuf' && nbEnfants === 0);
  if (isoleBonus && estIsole && (nbEnfants > 0 || nbAltGarde > 0)) {
    parts += 0.5;
  }

  // Parts pour invalides déclarants
  parts += nbInvalides * 0.5;

  // Arrondi au 0.25 le plus proche (les règles fiscales utilisent des demi ou quart de parts)
  return Math.round(parts * 4) / 4;
}

// ─── Application du barème ─────────────────────────────────────────────────
// Calcule l'impôt brut pour un revenu imposable donné (1 part)
function impotBruteParPart(revenuParPart) {
  let impot = 0;
  let tranchePrecedente = 0;
  for (const { max, rate } of BAREME_2024) {
    const base = Math.min(revenuParPart, max) - tranchePrecedente;
    if (base <= 0) break;
    impot += base * rate;
    tranchePrecedente = max;
    if (revenuParPart <= max) break;
  }
  return impot;
}

// Retourne la tranche marginale d'imposition (taux de la dernière tranche)
function tmiPourRevenu(revenuParPart) {
  for (const { max, rate } of BAREME_2024) {
    if (revenuParPart <= max) return rate;
  }
  return 0.45;
}

// ─── Abattement salarié ────────────────────────────────────────────────────
// Appliqué sur les salaires bruts (10%, min 495 €, max 14 171 € par foyer fiscal)
function calculerAbattementSalarie(salaireBrut) {
  if (!salaireBrut || salaireBrut <= 0) return 0;
  const abattement = salaireBrut * ABATTEMENT_SALARIE_RATE;
  return Math.max(ABATTEMENT_SALARIE_MIN, Math.min(ABATTEMENT_SALARIE_MAX, abattement));
}

// ─── Décote ────────────────────────────────────────────────────────────────
function calculerDecote(impotBrut, nbParts) {
  const seuil = nbParts >= 2 ? DECOTE_SEUIL_COUPLE : DECOTE_SEUIL_CELIBATAIRE;
  if (impotBrut >= seuil) return 0;
  const decote = seuil - DECOTE_TAUX * impotBrut;
  return Math.max(0, Math.min(impotBrut, decote));
}

// ─── Plafonnement du quotient familial ─────────────────────────────────────
// L'avantage fiscal total dû au QF (demi-parts supplémentaires)
// est limité à 1 759 € par demi-part supplémentaire (2024).
function plafonnementQF(impotSansEnfants, impotAvecEnfants, nbPartsBase, nbPartsTotal) {
  const demiPartsSup = (nbPartsTotal - nbPartsBase) * 2; // nombre de demi-parts
  if (demiPartsSup <= 0) return impotAvecEnfants;
  const avantageMaximum = demiPartsSup * PLAFOND_DEMI_PART;
  const avantageReel = impotSansEnfants - impotAvecEnfants;
  if (avantageReel > avantageMaximum) {
    // L'avantage est plafonné : on ajoute la différence à l'impôt
    return impotSansEnfants - avantageMaximum;
  }
  return impotAvecEnfants;
}

// ─── Calcul principal ──────────────────────────────────────────────────────
//
// Entrées :
//   foyer  : { situation_maritale, nb_enfants, nb_enfants_altgarde, parent_isole, ... }
//   revenus: [{ type_revenu, membre, montant_annuel }]
//   revenusFonciers : nombre (revenus fonciers nets annuels, calculés depuis properties)
//   revenusBIC      : nombre (revenus BIC nets annuels)
//
// Sortie :
//   {
//     nbParts, revenuBrut, abattementSalarie, revenuImposable,
//     revenuParPart, impotBrut, decote, impotNet, tmi,
//     detail: { tranches, ... }
//   }
//
function calculerIR({ foyer, revenus = [], revenusFonciers = 0, revenusBIC = 0 }) {
  // 1. Nombre de parts
  const nbParts = calculerNbParts(foyer);

  // 2. Revenus bruts par catégorie
  let salairesDeclarant1 = 0;
  let salairesDeclarant2 = 0;
  let autresRevenus      = 0;

  for (const r of revenus) {
    const montant = Number(r.montant_annuel) || 0;
    if (montant <= 0) continue;
    const type   = String(r.type_revenu || '').toLowerCase();
    const membre = String(r.membre || 'declarant1').toLowerCase();
    if (type === 'salaire' || type === 'retraite' || type === 'chomage') {
      if (membre === 'declarant2') salairesDeclarant2 += montant;
      else salairesDeclarant1 += montant;
    } else {
      autresRevenus += montant;
    }
  }

  const salairesTotaux = salairesDeclarant1 + salairesDeclarant2;

  // 3. Abattement salarié 10% (appliqué séparément par déclarant puis mutualisé)
  const abatt1 = calculerAbattementSalarie(salairesDeclarant1);
  const abatt2 = calculerAbattementSalarie(salairesDeclarant2);
  const abattementTotal = abatt1 + abatt2;

  // 4. Revenu net imposable (RNI)
  const revenuBrut = salairesTotaux + autresRevenus + revenusFonciers + revenusBIC;
  const revenuImposable = Math.max(0, salairesTotaux - abattementTotal) + autresRevenus
    + revenusFonciers + revenusBIC;

  // 5. Calcul de l'impôt avec QF
  const revenuParPart = revenuImposable / nbParts;
  const impotParPart  = impotBruteParPart(revenuParPart);
  let impotBrutTotal  = impotParPart * nbParts;

  // 5b. Plafonnement du QF
  // Parts "de base" sans enfants (pour calculer l'avantage lié aux enfants)
  const situation   = String((foyer.situation_maritale || 'celibataire')).toLowerCase();
  const partsBase   = (situation === 'marie' || situation === 'pacse') ? 2 : 1;
  if (nbParts > partsBase) {
    const impotSansEnfants = impotBruteParPart(revenuImposable / partsBase) * partsBase;
    impotBrutTotal = plafonnementQF(impotSansEnfants, impotBrutTotal, partsBase, nbParts);
  }

  // 6. Décote
  const decote    = calculerDecote(impotBrutTotal, nbParts);
  let impotNet    = Math.max(0, impotBrutTotal - decote);

  // 7. Arrondi à l'euro (les services fiscaux arrondissent à l'euro inférieur)
  impotNet = Math.floor(impotNet);

  // 8. TMI : taux sur la dernière tranche avec QF
  const tmi = tmiPourRevenu(revenuParPart);

  // 9. Détail par tranche (pour affichage pédagogique)
  const tranches = [];
  let prec = 0;
  for (const { max, rate } of BAREME_2024) {
    if (revenuParPart <= prec) break;
    const base = Math.min(revenuParPart, max) - prec;
    tranches.push({
      de: prec,
      a: max === Infinity ? null : max,
      taux: rate,
      base: Math.round(base * nbParts),     // base en revenu total (×N parts)
      impot: Math.round(base * rate * nbParts)
    });
    prec = max;
    if (revenuParPart <= max) break;
  }

  return {
    nbParts,
    revenuBrut:          Math.round(revenuBrut),
    salairesTotaux:      Math.round(salairesTotaux),
    abattementSalarie:   Math.round(abattementTotal),
    revenuImposable:     Math.round(revenuImposable),
    revenuParPart:       Math.round(revenuParPart),
    impotBrut:           Math.round(impotBrutTotal),
    decote:              Math.round(decote),
    impotNet,
    tmi,
    tmiPct:              Math.round(tmi * 100),
    tauxEffectif:        revenuImposable > 0 ? impotNet / revenuImposable : 0,
    tranches
  };
}

// Retourne uniquement la TMI (utile pour cashflow immobilier)
function getTMI({ foyer, revenus = [], revenusFonciers = 0, revenusBIC = 0 }) {
  const r = calculerIR({ foyer, revenus, revenusFonciers, revenusBIC });
  return r.tmi;
}

module.exports = {
  calculerIR,
  calculerNbParts,
  getTMI,
  BAREME_2024,
  PLAFOND_DEMI_PART,
  ABATTEMENT_SALARIE_MAX,
};
