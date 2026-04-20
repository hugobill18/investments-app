// rates.js — Taux de référence des livrets réglementés français.
//
// Ces taux sont fixés par l'État / la Banque de France et changent rarement
// (1 à 2 fois par an). Il n'existe pas de bonne API gratuite qui les expose
// en JSON, donc on les garde ici en dur. À mettre à jour quand la BdF publie
// un nouveau taux (source officielle : service-public.fr/particuliers/vosdroits).
//
// Dernière vérification : avril 2026.
// Pour un taux personnalisé (promo livret bancaire, AV avec bonus, etc.),
// l'utilisateur peut toujours surcharger le champ dans le formulaire.

const LIVRET_REFERENCE_RATES = {
  livret:              2.40,  // Livret A / LDDS / Livret Jeune : même taux réglementé
  livret_banque:       1.50,  // Livrets bancaires (moyenne indicative, très variable)
  assurance_vie_euro:  2.50,  // Rendement moyen fonds € en 2025 (indicatif)
  pel:                 1.75,  // PEL ouvert à partir de 2024
  cel:                 1.50,  // CEL
  epargne_simple:      0.00,  // Compte courant : pas d'intérêts
  autre:               0.00
};

// Source "humaine" pour afficher à l'utilisateur d'où vient le taux.
const LIVRET_REFERENCE_NOTE =
  'Taux de référence (avril 2026). Vérifiez et ajustez si besoin.';

function getReferenceRate(accountType) {
  return LIVRET_REFERENCE_RATES[accountType] ?? null;
}

module.exports = {
  LIVRET_REFERENCE_RATES,
  LIVRET_REFERENCE_NOTE,
  getReferenceRate
};
