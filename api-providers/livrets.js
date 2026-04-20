// livrets.js — Récupération des taux de livrets français
//
// Stratégie :
//   1. Cache fichier (data/livrets-cache.json) avec TTL 24h
//   2. Scraping de economie.gouv.fr (page officielle taux livret A)
//   3. Fallback sur taux officiels codés en dur si scraping impossible
//
// Sources officielles :
//   - https://www.economie.gouv.fr/particuliers/taux-livret-epargne-populaire
//   - https://www.banque-france.fr/statistiques/taux-et-cours/taux-reglements-epargne
//
// Taux applicables au 1er août 2025 (révisés semestriellement : 1er fév. et 1er août)

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '..', 'data', 'livrets-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

// ─── Taux officiels de secours (mis à jour manuellement) ──────────────────
// Source : https://www.economie.gouv.fr/particuliers/livret-epargne-populaire
// Valables depuis le 1er février 2025
const FALLBACK_RATES = {
  livret_a:           { rate: 0.025, label: 'Livret A',             since: '2025-02-01' },
  ldds:               { rate: 0.025, label: 'LDDS',                 since: '2025-02-01' },
  lep:                { rate: 0.035, label: 'LEP',                  since: '2025-02-01' },
  pel:                { rate: 0.025, label: 'PEL (ouverture ≥2024)', since: '2024-01-01' },
  cel:                { rate: 0.02,  label: 'CEL',                  since: '2024-01-01' },
  livret_banque:      { rate: 0.02,  label: 'Livret bancaire (moy)', since: null },
  epargne_simple:     { rate: 0.005, label: 'Compte courant',        since: null },
  assurance_vie_euro: { rate: 0.023, label: 'AV fonds € (moy 2024)', since: null },
};

const FALLBACK_META = {
  source: 'fallback',
  sourceUrl: null,
  fetchedAt: null,
  note: 'Taux officiels 1er février 2025. Prochaine révision : 1er août 2025.'
};

// ─── Cache fichier ─────────────────────────────────────────────────────────

function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!data.fetchedAt) return null;
    const age = Date.now() - new Date(data.fetchedAt).getTime();
    if (age > CACHE_TTL_MS) return null; // expiré
    return data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[livrets] Impossible d\'écrire le cache:', e.message);
  }
}

// ─── Scraping ──────────────────────────────────────────────────────────────
// Tente de récupérer les taux depuis economie.gouv.fr.
// Analyse le HTML avec des regex simples (pas de dépendance cheerio).

async function scrapeLivretRates() {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9'
  };

  // URL de la page officielle taux d'épargne (Banque de France, données publiques)
  // Cette page liste tous les taux réglementés en JSON dans un script embed
  const SCRAPE_URLS = [
    // API Banque de France (données structurées, plus fiable)
    {
      url: 'https://www.banque-france.fr/fr/statistiques/details/taux-interet-epargne-reglementee',
      parser: parseFromBanqueFrance
    },
    // Page economie.gouv.fr
    {
      url: 'https://www.economie.gouv.fr/particuliers/livret-epargne-populaire',
      parser: parseFromGouv
    }
  ];

  for (const { url, parser } of SCRAPE_URLS) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10000);
      let res;
      try {
        res = await fetch(url, { headers: HEADERS, signal: ac.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) continue;
      const html = await res.text();
      const parsed = parser(html);
      if (parsed && Object.keys(parsed.rates || {}).length >= 2) {
        return { ...parsed, sourceUrl: url, fetchedAt: new Date().toISOString() };
      }
    } catch (e) {
      console.warn(`[livrets] Scraping ${url} échoué : ${e.message}`);
    }
  }
  return null;
}

// Extraction depuis banque-france.fr : cherche des patterns comme "2,50 %" dans le HTML
function parseFromBanqueFrance(html) {
  const rates = {};
  // Cherche les taux sous forme "X,XX %" avec leur contexte
  const patterns = [
    { key: 'livret_a', regex: /livret\s+a[^<]*?(\d+[,\.]\d+)\s*%/i },
    { key: 'ldds',     regex: /l[dD][dD][sS][^<]*?(\d+[,\.]\d+)\s*%/i },
    { key: 'lep',      regex: /l[eE][pP][^<]*?(\d+[,\.]\d+)\s*%/i },
    { key: 'pel',      regex: /p[eE][lL][^<]*?(\d+[,\.]\d+)\s*%/i },
    { key: 'cel',      regex: /c[eE][lL][^<]*?(\d+[,\.]\d+)\s*%/i },
  ];
  for (const { key, regex } of patterns) {
    const m = html.match(regex);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(val) && val > 0 && val < 20) {
        rates[key] = { rate: val / 100, label: FALLBACK_RATES[key]?.label || key };
      }
    }
  }
  if (Object.keys(rates).length < 2) return null;
  return { rates, source: 'banque-france.fr' };
}

// Extraction depuis economie.gouv.fr
function parseFromGouv(html) {
  const rates = {};
  const patterns = [
    { key: 'livret_a', regex: /livret\s+a[^<]{0,200}?(\d+[,\.]\d+)\s*%/i },
    { key: 'lep',      regex: /livret\s+d.épargne\s+populaire[^<]{0,200}?(\d+[,\.]\d+)\s*%/i },
    { key: 'ldds',     regex: /d[ée]veloppement\s+durable[^<]{0,200}?(\d+[,\.]\d+)\s*%/i },
  ];
  for (const { key, regex } of patterns) {
    const m = html.match(regex);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(val) && val > 0 && val < 20) {
        rates[key] = { rate: val / 100, label: FALLBACK_RATES[key]?.label || key };
      }
    }
  }
  if (Object.keys(rates).length < 2) return null;
  return { rates, source: 'economie.gouv.fr' };
}

// ─── API publique ──────────────────────────────────────────────────────────

// Construit la réponse finale en fusionnant scraped + fallback
function buildRatesResponse(scraped) {
  // Partir des fallback, écraser avec les valeurs scrapées si disponibles
  const merged = {};
  for (const [key, val] of Object.entries(FALLBACK_RATES)) {
    merged[key] = val;
  }
  if (scraped && scraped.rates) {
    for (const [key, val] of Object.entries(scraped.rates)) {
      if (merged[key]) {
        merged[key] = { ...merged[key], ...val };
      }
    }
  }
  return {
    rates: merged,
    source: scraped ? scraped.source : 'fallback',
    sourceUrl: scraped?.sourceUrl || null,
    fetchedAt: scraped?.fetchedAt || new Date().toISOString(),
    note: scraped
      ? `Taux récupérés depuis ${scraped.source}`
      : FALLBACK_META.note
  };
}

// Récupère les taux officiels (cache → scraping → fallback)
async function getOfficialRates() {
  // 1. Vérifier le cache
  const cached = readCache();
  if (cached) {
    console.log('[livrets] Cache hit (âge < 24h)');
    return { ...cached, fromCache: true };
  }

  // 2. Tenter le scraping
  console.log('[livrets] Tentative de scraping des taux officiels...');
  const scraped = await scrapeLivretRates();
  const result = buildRatesResponse(scraped);
  if (scraped) {
    console.log(`[livrets] Taux récupérés depuis ${scraped.source}`);
  } else {
    console.warn('[livrets] Scraping impossible, utilisation des taux de secours');
  }

  // 3. Écrire en cache
  writeCache(result);
  return result;
}

// Récupère un taux spécifique (synchrone, utilise le fallback)
function getRate(accountType) {
  const type = String(accountType || '').toLowerCase().trim();
  if (!FALLBACK_RATES.hasOwnProperty(type)) return null;
  return FALLBACK_RATES[type].rate;
}

// Invalide le cache (force un rafraîchissement au prochain appel)
function invalidateCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
  } catch {}
}

// Helper affichage taux
function formatRate(rate) {
  if (rate === null || rate === undefined) return '–';
  return `${(rate * 100).toFixed(2)}%`;
}

module.exports = {
  getOfficialRates,
  getRate,
  invalidateCache,
  formatRate,
  FALLBACK_RATES,
  CACHE_PATH
};
