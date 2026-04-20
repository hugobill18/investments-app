// quotes.js — Récupération des cours avec provider multi-fallback gratuit.
//
// Architecture :
//   1. Yahoo Finance v8 (query1.finance.yahoo.com) — principal
//   2. Yahoo Finance v8 (query2.finance.yahoo.com) — même données, domaine mirror
//   3. Yahoo Finance v7 (query1 / query2)           — endpoint alternatif
//   4. Mock data                                    — dernier recours pour les tickers connus
//
// Tous gratuits, sans clé API. Couvre :
//   - Actions françaises Euronext Paris (.PA) : CW8.PA, MC.PA, TTE.PA, AI.PA
//   - ETF européens : IWDA.AS, VWCE.DE, SPPW.PA, WPEA.PA, PANX.PA, etc.
//   - Actions US (NYSE/NASDAQ), actions mondiales
//   - Cryptos (via CoinGecko dans api-providers/coingecko.js)
//   - Taux de change (EURUSD=X, etc.)

const { getMockQuote } = require('./api-providers/mock-data');
const { fetchQuoteWithSuffixFallback, fetchQuotesBatchMulti } = require('./api-providers/openfinance');

// Récupère une cotation pour un ticker exact.
// Utilise le provider multi-fallback (Yahoo v8/v7, 2 domaines) puis mock.
async function fetchQuote(ticker) {
  const symbol = String(ticker || '').trim();
  if (!symbol) throw new Error('Ticker vide');

  try {
    return await fetchQuoteWithSuffixFallback(symbol);
  } catch (e) {
    // Dernier recours : mock data pour les tickers connus
    const mockQuote = getMockQuote(symbol);
    if (mockQuote) {
      console.warn(`[quotes] Fallback mock pour ${symbol} : ${e.message}`);
      return { ...mockQuote, source: 'mock' };
    }
    throw e;
  }
}

// Récupère plusieurs cours en parallèle, par vagues pour éviter le rate-limiting.
// Renvoie un tableau d'objets { ticker, ok, data | error }.
async function fetchQuotesBatch(tickers) {
  return fetchQuotesBatchMulti(tickers);
}

// Taux de change via Yahoo Finance. fetchFx('USD', 'EUR') → combien d'EUR pour 1 USD.
// Exemple : EURUSD=X, USDEUR=X, EURGBP=X
async function fetchFx(from, to) {
  if (from === to) return 1;
  const { fetchWithFallback } = require('./api-providers/openfinance');
  const { price } = await fetchWithFallback(`${from}${to}=X`);
  return price;
}

// Alias pour la compatibilité avec le code existant
async function fetchQuoteExact(ticker) {
  const { fetchWithFallback } = require('./api-providers/openfinance');
  return fetchWithFallback(ticker);
}

module.exports = { fetchQuote, fetchQuoteExact, fetchQuotesBatch, fetchFx };
