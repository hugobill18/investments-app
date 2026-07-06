// history.js — Historique de cours 3 ans et actualités d'un instrument.
//
//   - fetchHistory3y(ticker) : cours mensuels sur 3 ans via Yahoo Finance
//     (query1 puis query2), dont on tire un CAGR annualisé et une volatilité.
//     C'est ce CAGR qui sert à extrapoler la performance dans les projections.
//   - fetchNews(ticker) : dernières actualités de la société via l'endpoint
//     de recherche Yahoo Finance.
//
// Les deux sont mis en cache (2 h pour l'historique, 30 min pour les news) :
// ces données bougent lentement et on évite le rate-limiting.

const { APICache } = require('./cache');

const historyCache = new APICache(2 * 60 * 60 * 1000);
const newsCache    = new APICache(30 * 60 * 1000);

const YAHOO_DOMAINS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com'
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Accept': 'application/json',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
};

async function fetchJson(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 7000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Historique mensuel 3 ans → { series: [{date, close}], cagrPct, volatilityPct }
async function fetchHistory3y(ticker) {
  const symbol = String(ticker || '').trim();
  if (!symbol) throw new Error('Ticker vide');

  const cached = historyCache.get(`hist3y:${symbol}`);
  if (cached) return cached.value;

  let lastErr;
  for (const domain of YAHOO_DOMAINS) {
    try {
      const url = `${domain}/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1mo`;
      const json = await fetchJson(url);
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error('Réponse Yahoo vide');

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.adjclose?.[0]?.adjclose
                  || result.indicators?.quote?.[0]?.close || [];

      const series = [];
      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i];
        if (c != null && Number.isFinite(c)) {
          series.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close: c });
        }
      }
      if (series.length < 6) throw new Error('Historique insuffisant');

      // CAGR annualisé sur la période réellement couverte
      const first = series[0], last = series[series.length - 1];
      const yearsSpan = Math.max(0.5,
        (new Date(last.date) - new Date(first.date)) / (365.25 * 24 * 3600 * 1000));
      const cagr = Math.pow(last.close / first.close, 1 / yearsSpan) - 1;

      // Volatilité annualisée à partir des rendements mensuels
      const monthlyReturns = [];
      for (let i = 1; i < series.length; i++) {
        if (series[i - 1].close > 0) monthlyReturns.push(series[i].close / series[i - 1].close - 1);
      }
      const mean = monthlyReturns.reduce((s, r) => s + r, 0) / (monthlyReturns.length || 1);
      const variance = monthlyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (monthlyReturns.length || 1);
      const volatility = Math.sqrt(variance) * Math.sqrt(12);

      const out = {
        ticker: symbol,
        currency: result.meta?.currency || null,
        series,
        yearsSpan: Math.round(yearsSpan * 10) / 10,
        cagrPct: Math.round(cagr * 1000) / 10,
        volatilityPct: Math.round(volatility * 1000) / 10
      };
      historyCache.set(`hist3y:${symbol}`, out, domain);
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Historique indisponible pour ${symbol} : ${lastErr?.message || 'inconnu'}`);
}

// Extrapolation prudente pour les projections : le CAGR 3 ans est borné
// à [-5% ; +12%] pour éviter de projeter des performances extrêmes.
function expectedRateFromHistory(history) {
  return Math.max(-5, Math.min(12, history.cagrPct));
}

// Dernières actualités liées à un ticker (titre, source, lien, date).
async function fetchNews(ticker, count = 6) {
  const symbol = String(ticker || '').trim();
  if (!symbol) throw new Error('Ticker vide');

  const cached = newsCache.get(`news:${symbol}`);
  if (cached) return cached.value;

  let lastErr;
  for (const domain of YAHOO_DOMAINS) {
    try {
      const url = `${domain}/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=${count}&quotesCount=0`;
      const json = await fetchJson(url);
      const news = (json.news || []).map(n => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        publishedAt: n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000).toISOString()
          : null
      })).filter(n => n.title && n.link);
      newsCache.set(`news:${symbol}`, news, domain);
      return news;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Actualités indisponibles pour ${symbol} : ${lastErr?.message || 'inconnu'}`);
}

module.exports = { fetchHistory3y, fetchNews, expectedRateFromHistory };
