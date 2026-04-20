// api-providers/index.js — Gestionnaire principal d'APIs financières
//
// Point d'entrée unique pour toutes les requêtes de données financières.
// Gère le cache, les fallbacks, et l'orchestration entre les différentes sources.
//
// Usage :
//   const { getQuote, getPrices } = require('./api-providers');
//   const quote = await getQuote('AAPL');  // Yahoo Finance
//   const crypto = await getQuote('BTC');  // CoinGecko
//   const rates = await getLivretRates(); // Banque de France

const { APICache } = require('./cache');
const { fetchQuote, fetchQuotesBatch, fetchFx } = require('../quotes');
const { fetchCryptoPrice, fetchCryptoPricesBatch, SUPPORTED_CRYPTOS } = require('./coingecko');
const { getOfficialRates, getRate: getLivretRateForType } = require('./livrets');

// Initialiser le cache global
const cache = new APICache(30 * 60 * 1000); // 30 minutes

// Logger pour le monitoring (peut être remplacé par Winston, Pino, etc.)
class SimpleLogger {
  log(level, message, metadata = {}) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${level}: ${message}`, metadata);
  }
  info(message, metadata) { this.log('INFO', message, metadata); }
  warn(message, metadata) { this.log('WARN', message, metadata); }
  error(message, metadata) { this.log('ERROR', message, metadata); }
}

const logger = new SimpleLogger();

// --- Détection du type de ticker ---

function isCrypto(ticker) {
  return SUPPORTED_CRYPTOS.includes(ticker.toUpperCase());
}

function isLivret(accountType) {
  const livretTypes = [
    'livret', 'livret_banque', 'assurance_vie_euro', 'pel', 'cel', 'epargne_simple'
  ];
  return livretTypes.includes(String(accountType || '').toLowerCase());
}

// --- API unifiée ---

// Récupère un cours (stock, crypto, ou devise)
// Détecte automatiquement le type et appelle la bonne API.
async function getQuote(ticker, options = {}) {
  const { useCache = true, currency = 'EUR' } = options;

  if (!ticker || typeof ticker !== 'string') {
    throw new Error('Ticker invalide');
  }

  const symbolNorm = ticker.toUpperCase().trim();
  const cacheKey = `quote:${symbolNorm}:${currency}`;

  // Vérifier le cache
  if (useCache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`Cache hit: ${symbolNorm}`, { source: cached.source, cachedAt: cached.cachedAt });
      return { ...cached.value, fromCache: true };
    }
  }

  let result;
  try {
    if (isCrypto(symbolNorm)) {
      // CoinGecko
      logger.info(`Fetching crypto: ${symbolNorm}`);
      result = await fetchCryptoPrice(symbolNorm, currency);
      result.apiSource = 'coingecko';
    } else {
      // Yahoo Finance
      logger.info(`Fetching stock: ${symbolNorm}`);
      result = await fetchQuote(symbolNorm);
      result.apiSource = 'yahoo';
    }

    // Cacher le résultat
    cache.set(cacheKey, result, result.apiSource);
    logger.info(`Successfully fetched: ${symbolNorm}`, { price: result.price, source: result.apiSource });
    return result;
  } catch (error) {
    logger.error(`Failed to fetch ${symbolNorm}`, { error: error.message });
    throw error;
  }
}

// Récupère plusieurs cours en parallèle (optimisé)
async function getPrices(tickers, options = {}) {
  const { useCache = true, currency = 'EUR' } = options;

  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new Error('Liste de tickers invalide');
  }

  // Séparer cryptos et stocks
  const cryptos = tickers.filter(t => isCrypto(t));
  const stocks = tickers.filter(t => !isCrypto(t));

  const results = [];
  let failedCount = 0;

  // Traiter les stocks via Yahoo
  if (stocks.length > 0) {
    try {
      logger.info(`Fetching batch: ${stocks.length} stocks`);
      const stockResults = await fetchQuotesBatch(stocks);
      for (const result of stockResults) {
        if (result.ok) {
          cache.set(`quote:${result.ticker}:${currency}`, result.data, 'yahoo');
          results.push({ ticker: result.ticker, ok: true, data: result.data });
        } else {
          failedCount++;
          results.push({ ticker: result.ticker, ok: false, error: result.error });
        }
      }
    } catch (error) {
      logger.error(`Batch stock fetch failed`, { error: error.message });
      for (const t of stocks) {
        results.push({ ticker: t, ok: false, error: error.message });
      }
      failedCount += stocks.length;
    }
  }

  // Traiter les cryptos via CoinGecko
  if (cryptos.length > 0) {
    try {
      logger.info(`Fetching batch: ${cryptos.length} cryptos`);
      const cryptoResults = await fetchCryptoPricesBatch(cryptos, currency);
      for (const result of cryptoResults) {
        if (result.ok) {
          cache.set(`quote:${result.symbol}:${currency}`, result.data, 'coingecko');
          results.push({ ticker: result.symbol, ok: true, data: result.data });
        } else {
          failedCount++;
          results.push({ ticker: result.symbol, ok: false, error: result.error });
        }
      }
    } catch (error) {
      logger.error(`Batch crypto fetch failed`, { error: error.message });
      for (const t of cryptos) {
        results.push({ ticker: t, ok: false, error: error.message });
      }
      failedCount += cryptos.length;
    }
  }

  logger.info(`Batch fetch completed`, { total: tickers.length, failed: failedCount, succeeded: tickers.length - failedCount });
  return results;
}

// Récupère les taux des livrets
async function getLivretRates() {
  const cacheKey = 'livret:rates';

  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(`Cache hit: livret rates`);
    return { ...cached.value, fromCache: true };
  }

  try {
    logger.info(`Fetching livret rates`);
    const result = await getOfficialRates();
    cache.set(cacheKey, result, 'banque-de-france');
    return result;
  } catch (error) {
    logger.error(`Failed to fetch livret rates`, { error: error.message });
    throw error;
  }
}

// Récupère un taux de livret spécifique
function getLivretRate(accountType) {
  const rate = getLivretRateForType(accountType);
  return rate;
}

// Convertit une devise à une autre
async function convertCurrency(amount, from, to, options = {}) {
  const { useCache = true } = options;

  if (from === to) return { amount, from, to, rate: 1 };

  const cacheKey = `fx:${from}${to}`;
  if (useCache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`Cache hit: fx ${from}→${to}`);
      return {
        amount: amount * cached.value.price,
        from,
        to,
        rate: cached.value.price,
        fromCache: true
      };
    }
  }

  try {
    logger.info(`Fetching fx rate: ${from}→${to}`);
    const rate = await fetchFx(from, to);
    cache.set(cacheKey, { price: rate }, 'yahoo-fx');
    return {
      amount: amount * rate,
      from,
      to,
      rate,
      source: 'yahoo'
    };
  } catch (error) {
    logger.error(`Failed to convert ${from}→${to}`, { error: error.message });
    throw error;
  }
}

// --- Gestion du cache ---

function getCacheStats() {
  return cache.stats();
}

function clearCache() {
  cache.clear();
  logger.info('Cache cleared');
}

function pruneCache() {
  const pruned = cache.prune();
  logger.info(`Cache pruned`, { prunedCount: pruned });
  return pruned;
}

module.exports = {
  // API principale
  getQuote,
  getPrices,
  getLivretRates,
  getLivretRate,
  convertCurrency,

  // Helpers
  isCrypto,
  isLivret,

  // Cache management
  getCacheStats,
  clearCache,
  pruneCache,

  // Logging
  logger,

  // Exports pour test/override
  cache
};
