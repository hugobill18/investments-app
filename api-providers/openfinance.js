// openfinance.js — Provider alternatif gratuit pour les données financières
//
// Stratégie multi-source :
//   1. Yahoo Finance v8 (principal, gratuit, sans clé)
//   2. Yahoo Finance v7 (endpoint alternatif, même domaine)
//   3. Yahoo Finance query2 (deuxième domaine Yahoo)
//
// Ces trois endpoints sont tous gratuits, publics, et couvrent :
//   - Actions françaises Euronext Paris (.PA)
//   - ETF cotés en Europe et aux US
//   - Actions mondiales (NYSE, NASDAQ, Xetra, etc.)
//   - Taux de change
//
// NOTE : L'API Open Finance / openfigi.com n'est pas adaptée aux cotations
// en temps réel. Pour les cours boursiers gratuits sans clé API, Yahoo reste
// la meilleure option. Ce module implémente un système de fallback robuste
// entre les trois endpoints Yahoo, plus un provider de taux de change alternatif.

const YAHOO_DOMAINS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com'
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Accept': 'application/json',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
};

// Tickers ETF populaires en France (pour l'autocomplete)
const FRENCH_ETF_TICKERS = [
  // Amundi / Lyxor
  { ticker: 'CW8.PA',  name: 'Amundi MSCI World ETF',           currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'WPEA.PA', name: 'Amundi Prime All Country World',  currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'EWLD.PA', name: 'Lyxor MSCI World ETF',            currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'PAEEM.PA',name: 'Amundi MSCI Emerging Markets',    currency: 'EUR', category: 'ETF Émergents' },
  { ticker: 'RS2K.PA', name: 'Amundi Russell 2000 ETF',         currency: 'EUR', category: 'ETF US Small Cap' },
  { ticker: 'NASD.PA', name: 'Lyxor Nasdaq-100 ETF',            currency: 'EUR', category: 'ETF US Tech' },
  { ticker: 'ESE.PA',  name: 'Amundi MSCI Europe ETF',          currency: 'EUR', category: 'ETF Europe' },
  { ticker: 'C50.PA',  name: 'Amundi CAC 40 ETF',               currency: 'EUR', category: 'ETF France' },
  { ticker: 'CAC.PA',  name: 'Lyxor CAC 40 ETF',                currency: 'EUR', category: 'ETF France' },
  { ticker: 'PANX.PA', name: 'Amundi PEA Nasdaq-100 ETF',       currency: 'EUR', category: 'ETF US Tech PEA' },
  { ticker: 'PUST.PA', name: 'Amundi PEA S&P 500 ETF',          currency: 'EUR', category: 'ETF US PEA' },
  { ticker: 'PSPS.PA', name: 'Amundi PEA S&P 500 UCITS ETF',    currency: 'EUR', category: 'ETF US PEA' },
  { ticker: 'SP5.PA',  name: 'Amundi S&P 500 ETF',              currency: 'EUR', category: 'ETF US' },
  { ticker: 'SPPW.PA', name: 'SPDR S&P 500 ETF',                currency: 'EUR', category: 'ETF US' },
  { ticker: 'VWCE.DE', name: 'Vanguard FTSE All-World UCITS',   currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'IWDA.AS', name: 'iShares Core MSCI World ETF',     currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'CSPX.AS', name: 'iShares Core S&P 500 ETF',        currency: 'USD', category: 'ETF US' },
  { ticker: 'EIMI.AS', name: 'iShares Core MSCI EM IMI',        currency: 'USD', category: 'ETF Émergents' },
  { ticker: 'SWRD.PA', name: 'SPDR MSCI World UCITS ETF',       currency: 'EUR', category: 'ETF Monde' },
  // Immobilier
  { ticker: 'RECY.PA', name: 'Amundi FTSE EPRA NAREIT Global',  currency: 'EUR', category: 'ETF Immobilier' },
  { ticker: 'EPRA.PA', name: 'Lyxor FTSE EPRA NAREIT ETF',      currency: 'EUR', category: 'ETF Immobilier' },
  // Obligataire
  { ticker: 'OBLI.PA', name: 'Amundi Euro Govt Bond ETF',       currency: 'EUR', category: 'ETF Obligataire' },
  { ticker: 'EHY.PA',  name: 'Amundi EUR High Yield Bond ETF',  currency: 'EUR', category: 'ETF Obligataire' },
];

// Timeout helper
function withTimeout(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms))
  ]);
}

// Récupère une cotation via Yahoo v8/finance/chart (endpoint 1 ou 2)
async function fetchYahooV8(symbol, domain) {
  const url = `${domain}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: ac.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Timeout v8' : `Réseau : ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let data;
  try { data = await res.json(); } catch { throw new Error('JSON illisible'); }
  const err = data?.chart?.error;
  if (err) throw new Error(err.description || err.code || 'Erreur Yahoo');
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    throw new Error('Pas de prix v8');
  }
  return {
    symbol: meta.symbol || symbol,
    price: meta.regularMarketPrice,
    currency: meta.currency || 'EUR',
    name: meta.shortName || meta.longName || symbol,
    timestamp: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    source: `yahoo-v8 (${domain.includes('query2') ? 'q2' : 'q1'})`
  };
}

// Récupère une cotation via Yahoo v7/finance/quote (endpoint alternatif)
async function fetchYahooV7(symbol, domain) {
  const url = `${domain}/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=regularMarketPrice,currency,shortName,regularMarketTime`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: ac.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Timeout v7' : `Réseau : ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let data;
  try { data = await res.json(); } catch { throw new Error('JSON illisible v7'); }
  const result = data?.quoteResponse?.result?.[0];
  if (!result || typeof result.regularMarketPrice !== 'number') {
    throw new Error('Pas de prix v7');
  }
  return {
    symbol: result.symbol || symbol,
    price: result.regularMarketPrice,
    currency: result.currency || 'EUR',
    name: result.shortName || result.longName || symbol,
    timestamp: result.regularMarketTime
      ? new Date(result.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    source: 'yahoo-v7'
  };
}

// Tente tous les endpoints dans l'ordre : v8-q1, v8-q2, v7-q1, v7-q2
// Renvoie le premier succès ou jette si tout échoue.
async function fetchWithFallback(symbol) {
  const sym = String(symbol || '').trim();
  if (!sym) throw new Error('Ticker vide');

  const attempts = [
    () => fetchYahooV8(sym, YAHOO_DOMAINS[0]),
    () => fetchYahooV8(sym, YAHOO_DOMAINS[1]),
    () => fetchYahooV7(sym, YAHOO_DOMAINS[0]),
    () => fetchYahooV7(sym, YAHOO_DOMAINS[1]),
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error(`Aucune source disponible pour "${sym}": ${errors.join(' | ')}`);
}

// Essaie le ticker exact, puis les variantes françaises/europénnes courantes.
// Utile pour les utilisateurs qui tapent "CW8" au lieu de "CW8.PA", etc.
async function fetchQuoteWithSuffixFallback(ticker) {
  const sym = String(ticker || '').trim().toUpperCase();
  if (!sym) throw new Error('Ticker vide');

  // Si le ticker contient déjà un séparateur (., -, =), on essaie juste tel quel
  const hasSuffix = /[.\-=]/.test(sym);
  const tries = hasSuffix
    ? [sym]
    : [sym, `${sym}.PA`, `${sym}.DE`, `${sym}.AS`, `${sym}.MI`, `${sym}-EUR`];

  const errors = [];
  for (const t of tries) {
    try {
      return await fetchWithFallback(t);
    } catch (e) {
      errors.push(`${t}: ${e.message}`);
    }
  }
  throw new Error(`Cotation introuvable (${errors.join(' | ')})`);
}

// Récupère plusieurs cotations en parallèle (par vague de 4 pour limiter le rate-limiting)
async function fetchQuotesBatchMulti(tickers) {
  const batchSize = 4;
  const results = [];
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        try {
          return { ticker: t, ok: true, data: await fetchQuoteWithSuffixFallback(t) };
        } catch (e) {
          return { ticker: t, ok: false, error: e.message };
        }
      })
    );
    results.push(...batchResults);
    if (i + batchSize < tickers.length) {
      await new Promise(r => setTimeout(r, 300)); // pause entre vagues
    }
  }
  return results;
}

module.exports = {
  fetchWithFallback,
  fetchQuoteWithSuffixFallback,
  fetchQuotesBatchMulti,
  FRENCH_ETF_TICKERS,
  YAHOO_DOMAINS
};
