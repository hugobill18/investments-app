// subscriptions.js — Détection des abonnements récurrents depuis un relevé
// bancaire exporté en CSV.
//
// Confidentialité : le relevé est envoyé au serveur LOCAL, analysé en mémoire,
// et n'est JAMAIS stocké. Seuls les abonnements que l'utilisateur choisit de
// conserver sont enregistrés en base (libellé + montant, pas les transactions).
//
// Détection : on regroupe les débits par libellé normalisé, puis on considère
// comme abonnement tout groupe avec ≥ 2 occurrences, un montant stable (±20%)
// et un espacement régulier (~mensuel, trimestriel ou annuel).

// Catégorisation heuristique par mots-clés (pour le graphique + conseils)
const CATEGORY_KEYWORDS = [
  { cat: 'streaming',  words: ['netflix', 'spotify', 'disney', 'prime video', 'amazon prime', 'deezer', 'canal', 'ocs', 'youtube', 'apple.com/bill', 'apple music', 'paramount', 'crunchyroll'] },
  { cat: 'telecom',    words: ['orange', 'sfr', 'bouygues', 'free ', 'free mobile', 'freebox', 'sosh', 'red by', 'prixtel', 'nrj mobile'] },
  { cat: 'energie',    words: ['edf', 'engie', 'totalenergies', 'total direct', 'eni ', 'ekwateur', 'ilek', 'veolia', 'suez', 'saur'] },
  { cat: 'assurance',  words: ['axa', 'maif', 'macif', 'matmut', 'gmf', 'allianz', 'groupama', 'assurance', 'mutuelle', 'harmonie', 'april'] },
  { cat: 'sport',      words: ['basic fit', 'basic-fit', 'fitness', 'neoness', 'keepcool', 'salle de sport', 'gymlib', 'club med gym'] },
  { cat: 'logiciel',   words: ['adobe', 'microsoft', 'google one', 'icloud', 'dropbox', 'github', 'openai', 'chatgpt', 'notion', 'canva'] },
  { cat: 'presse',     words: ['le monde', 'figaro', 'mediapart', 'les echos', 'courrier int', 'la croix', 'liberation'] },
  { cat: 'transport',  words: ['navigo', 'sncf', 'ratp', 'velib', 'blablacar premium', 'lime', 'tier'] },
  { cat: 'banque',     words: ['cotisation', 'frais carte', 'frais tenue', 'abonnement bancaire', 'jazz ', 'esprit libre'] },
];

function guessCategory(label) {
  const l = label.toLowerCase();
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (words.some(w => l.includes(w))) return cat;
  }
  return 'autre';
}

// --- Parsing CSV -------------------------------------------------------------

const DATE_RES = [
  { re: /^(\d{4})-(\d{2})-(\d{2})/,        fn: m => new Date(+m[1], +m[2] - 1, +m[3]) },
  { re: /^(\d{2})\/(\d{2})\/(\d{4})/,      fn: m => new Date(+m[3], +m[2] - 1, +m[1]) },
  { re: /^(\d{2})-(\d{2})-(\d{4})/,        fn: m => new Date(+m[3], +m[2] - 1, +m[1]) },
  { re: /^(\d{2})\/(\d{2})\/(\d{2})$/,     fn: m => new Date(2000 + +m[3], +m[2] - 1, +m[1]) },
];

function parseDate(s) {
  const str = String(s || '').trim();
  for (const { re, fn } of DATE_RES) {
    const m = str.match(re);
    if (m) {
      const d = fn(m);
      if (!isNaN(d)) return d;
    }
  }
  return null;
}

function parseAmount(s) {
  // Gère "1 234,56", "-12.99", "12,99 €", "−12,99"
  const str = String(s || '').replace(/[€\s ]/g, '').replace('−', '-').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
  const v = parseFloat(str);
  return Number.isFinite(v) ? v : null;
}

function detectDelimiter(line) {
  const counts = [';', ',', '\t'].map(d => ({ d, n: line.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 1 ? counts[0].d : ';';
}

// Découpe une ligne CSV en respectant les guillemets.
function splitCsvLine(line, delim) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(c => c.trim());
}

// Transforme le texte CSV en transactions { date, label, amount }.
// Heuristique par ligne : première cellule datée = date, dernière cellule
// numérique = montant, le reste concaténé = libellé. Fonctionne avec les
// exports des banques françaises courantes (avec ou sans en-tête).
function parseBankCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { transactions: [], skipped: 0 };

  const delim = detectDelimiter(lines[0]);
  const transactions = [];
  let skipped = 0;

  for (const line of lines) {
    const cells = splitCsvLine(line, delim);
    if (cells.length < 2) { skipped++; continue; }

    let date = null, dateIdx = -1;
    for (let i = 0; i < cells.length; i++) {
      const d = parseDate(cells[i]);
      if (d) { date = d; dateIdx = i; break; }
    }
    if (!date) { skipped++; continue; } // en-tête ou ligne invalide

    let amount = null, amountIdx = -1;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (i === dateIdx) continue;
      const a = parseAmount(cells[i]);
      if (a !== null) { amount = a; amountIdx = i; break; }
    }
    if (amount === null) { skipped++; continue; }

    const label = cells
      .filter((_, i) => i !== dateIdx && i !== amountIdx)
      .join(' ').replace(/\s+/g, ' ').trim();
    if (!label) { skipped++; continue; }

    transactions.push({ date, label, amount });
  }
  return { transactions, skipped };
}

// --- Détection des récurrences -----------------------------------------------

// Normalise un libellé bancaire : retire dates, numéros de carte, références.
function normalizeLabel(label) {
  return String(label)
    .toUpperCase()
    .replace(/\b\d{2}[\/.-]\d{2}([\/.-]\d{2,4})?\b/g, ' ')  // dates
    .replace(/\bCB\b|\bCARTE\b|\bPRLV\b|\bPRELEVEMENT\b|\bSEPA\b|\bVIR\b|\bPAIEMENT\b|\bACHAT\b|\bECH\b/g, ' ')
    .replace(/\b[A-Z0-9]{10,}\b/g, ' ')                     // références longues
    .replace(/\d{4,}/g, ' ')                                // numéros
    .replace(/[*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Détecte les abonnements dans une liste de transactions.
function detectSubscriptions(transactions) {
  // Seuls les débits nous intéressent
  const debits = transactions.filter(t => t.amount < 0)
    .map(t => ({ ...t, amount: Math.abs(t.amount) }));

  const groups = new Map();
  for (const t of debits) {
    const key = normalizeLabel(t.label);
    if (key.length < 3) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const detected = [];
  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;
    txs.sort((a, b) => a.date - b.date);

    // Montant stable ? (écart max 20% autour de la médiane)
    const amounts = txs.map(t => t.amount);
    const med = median(amounts);
    if (med < 1) continue;
    if (!amounts.every(a => Math.abs(a - med) / med <= 0.20)) continue;

    // Espacement régulier ?
    const gaps = [];
    for (let i = 1; i < txs.length; i++) {
      gaps.push((txs[i].date - txs[i - 1].date) / 86400000);
    }
    const medGap = median(gaps);
    let periodicity = null;
    if (medGap >= 25 && medGap <= 35) periodicity = 'mensuel';
    else if (medGap >= 80 && medGap <= 100) periodicity = 'trimestriel';
    else if (medGap >= 350 && medGap <= 380) periodicity = 'annuel';
    if (!periodicity) continue;

    const monthlyCost = periodicity === 'mensuel' ? med
      : periodicity === 'trimestriel' ? med / 3
      : med / 12;

    detected.push({
      label: key,
      category: guessCategory(key),
      periodicity,
      amount: Math.round(med * 100) / 100,
      monthlyCost: Math.round(monthlyCost * 100) / 100,
      annualCost: Math.round(monthlyCost * 12 * 100) / 100,
      occurrences: txs.length,
      lastDate: txs[txs.length - 1].date.toISOString().slice(0, 10)
    });
  }

  detected.sort((a, b) => b.monthlyCost - a.monthlyCost);
  return detected;
}

// Point d'entrée : CSV brut → abonnements détectés + stats.
function analyzeBankCsv(text) {
  const { transactions, skipped } = parseBankCsv(text);
  const detected = detectSubscriptions(transactions);
  return {
    transactionCount: transactions.length,
    skippedLines: skipped,
    subscriptions: detected,
    totalMonthly: Math.round(detected.reduce((s, d) => s + d.monthlyCost, 0) * 100) / 100
  };
}

module.exports = { analyzeBankCsv, parseBankCsv, detectSubscriptions, normalizeLabel, guessCategory };
