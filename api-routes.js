// api-routes.js — Routes supplémentaires pour les APIs financières
//
// À intégrer dans server.js :
//   const apiRoutes = require('./api-routes');
//   apiRoutes(app, db, apiProviders);
//
// Ajoute les routes :
//   GET /api/quote/:ticker              — Récupère un cours unique
//   POST /api/quotes/batch              — Récupère plusieurs cours
//   GET /api/livret-rates               — Taux des livrets
//   POST /api/convert                   — Convertit devise
//   GET /api/cache/stats                — Infos du cache
//   POST /api/cache/clear               — Vide le cache

const { getQuote, getPrices, getLivretRates, convertCurrency, getCacheStats, clearCache, pruneCache } = require('./api-providers');

module.exports = function(app, db, requireAuth) {
  // --- Quotations ---

  // GET /api/quote/:ticker
  // Récupère un cours pour un ticker (stock, crypto, devise, etc.)
  // Query params: currency (default: EUR), useCache (default: true)
  app.get('/api/quote/:ticker', requireAuth, async (req, res) => {
    try {
      const ticker = String(req.params.ticker || '').trim();
      if (!ticker) return res.status(400).json({ error: 'Ticker requis' });

      const currency = String(req.query.currency || 'EUR').toUpperCase();
      const useCache = req.query.useCache !== 'false';

      const quote = await getQuote(ticker, { currency, useCache });
      res.json(quote);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // POST /api/quotes/batch
  // Récupère plusieurs cours en parallèle.
  // Body: { tickers: ['AAPL', 'BTC', ...], currency?: 'EUR', useCache?: true }
  app.post('/api/quotes/batch', requireAuth, async (req, res) => {
    try {
      const { tickers, currency = 'EUR', useCache = true } = req.body;

      if (!Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: 'tickers doit être un tableau non vide' });
      }

      const quotes = await getPrices(tickers, { currency, useCache });
      res.json({ tickers, currency, quotes });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // --- Livrets ---

  // GET /api/livret-rates
  // Récupère les taux officiels des livrets
  app.get('/api/livret-rates', requireAuth, async (req, res) => {
    try {
      const rates = await getLivretRates();
      res.json(rates);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // --- Conversion de devises ---

  // POST /api/convert
  // Convertit un montant d'une devise à une autre.
  // Body: { amount: 100, from: 'EUR', to: 'USD', useCache?: true }
  app.post('/api/convert', requireAuth, async (req, res) => {
    try {
      const { amount, from, to, useCache = true } = req.body;

      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: 'Montant invalide' });
      }

      const result = await convertCurrency(amount, from, to, { useCache });
      res.json(result);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // --- Cache Management ---

  // GET /api/cache/stats
  // Retourne les stats du cache (taille, TTL, entrées)
  app.get('/api/cache/stats', requireAuth, (req, res) => {
    try {
      const stats = getCacheStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/cache/clear
  // Vide complètement le cache
  app.post('/api/cache/clear', requireAuth, (req, res) => {
    try {
      clearCache();
      res.json({ ok: true, message: 'Cache cleared' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/cache/prune
  // Nettoie les entrées expirées du cache
  app.post('/api/cache/prune', requireAuth, (req, res) => {
    try {
      const pruned = pruneCache();
      res.json({ ok: true, pruned });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};
