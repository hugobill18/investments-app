// coingecko.js — Récupération des prix crypto via CoinGecko (gratuit, sans limite).
//
// CoinGecko est la meilleure source gratuite pour crypto. L'API est publique
// et n'a pas de limite de taux.
//
// Tickers supportés : BTC, ETH, SOL, XRP, ADA, DOGE, LINK, UNI, AAVE, etc.
// https://api.coingecko.com/api/v3/simple/price
//
// Les prix sont en EUR et USD.

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const HEADERS = {
  'Accept': 'application/json'
};

// Mapping des symboles courants → IDs CoinGecko (CoinGecko utilise des IDs uniques)
const SYMBOL_TO_ID = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'AAVE': 'aave',
  'MATIC': 'matic-network',
  'AVAX': 'avalanche-2',
  'FTM': 'fantom',
  'OP': 'optimism',
  'ARB': 'arbitrum',
  'LDO': 'lido-dao',
  'STG': 'stargate-finance'
};

// Récupère le prix d'une crypto
async function fetchCryptoPriceExact(symbol, currency = 'EUR') {
  const id = SYMBOL_TO_ID[symbol.toUpperCase()];
  if (!id) throw new Error(`Crypto ${symbol} non supportée (ajouter à SYMBOL_TO_ID)`);

  const url = `${COINGECKO_BASE}/simple/price?ids=${id}&vs_currencies=${currency.toLowerCase()}&include_market_cap=true`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: ac.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'CoinGecko : délai dépassé' : 'CoinGecko injoignable');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`CoinGecko a répondu ${res.status}`);
  }

  let data;
  try { data = await res.json(); }
  catch { throw new Error('Réponse CoinGecko illisible'); }

  const priceData = data[id];
  if (!priceData || typeof priceData[currency.toLowerCase()] !== 'number') {
    throw new Error(`Pas de prix disponible pour ${symbol} en ${currency}`);
  }

  return {
    symbol: symbol.toUpperCase(),
    id,
    price: priceData[currency.toLowerCase()],
    currency: currency.toUpperCase(),
    marketCap: priceData[`${currency.toLowerCase()}_market_cap`],
    name: symbol.toUpperCase(),
    timestamp: new Date().toISOString()
  };
}

// Récupère le prix d'une crypto (wrapper avec retry)
async function fetchCryptoPrice(symbol, currency = 'EUR') {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) throw new Error('Symbole crypto vide');

  try {
    return await fetchCryptoPriceExact(sym, currency);
  } catch (e) {
    throw new Error(`Crypto ${sym} : ${e.message}`);
  }
}

// Récupère plusieurs prix en parallèle
async function fetchCryptoPricesBatch(symbols, currency = 'EUR') {
  const batchSize = 10; // CoinGecko supporte bien les requêtes parallèles
  const out = [];

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (s) => {
        try {
          return { symbol: s, ok: true, data: await fetchCryptoPrice(s, currency) };
        } catch (e) {
          return { symbol: s, ok: false, error: e.message };
        }
      })
    );
    out.push(...results);
    if (i + batchSize < symbols.length) {
      await new Promise(r => setTimeout(r, 100)); // délai léger
    }
  }

  return out;
}

// Ajoute une crypto au mapping (pour support custom)
function registerCrypto(symbol, coingeckoId) {
  SYMBOL_TO_ID[symbol.toUpperCase()] = coingeckoId.toLowerCase();
}

module.exports = {
  fetchCryptoPrice,
  fetchCryptoPriceExact,
  fetchCryptoPricesBatch,
  registerCrypto,
  SUPPORTED_CRYPTOS: Object.keys(SYMBOL_TO_ID)
};
