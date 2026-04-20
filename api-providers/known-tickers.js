/**
 * known-tickers.js — Liste de référence des tickers disponibles sur Yahoo Finance
 * 
 * Cette liste servira à :
 * 1. L'autocomplete du champ Ticker (frontend)
 * 2. La validation et la suggestion (backend)
 * 3. La page Admin pour afficher les tickers disponibles
 * 
 * Format : { ticker, name, currency, category }
 */

const KNOWN_TICKERS = [
  // === ACTIONS US (NASDAQ/NYSE) ===
  { ticker: 'AAPL', name: 'Apple Inc.', currency: 'USD', category: 'US Tech' },
  { ticker: 'MSFT', name: 'Microsoft Corporation', currency: 'USD', category: 'US Tech' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', currency: 'USD', category: 'US Tech' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', currency: 'USD', category: 'US Tech' },
  { ticker: 'TSLA', name: 'Tesla Inc.', currency: 'USD', category: 'US Auto/Energy' },
  { ticker: 'NFLX', name: 'Netflix Inc.', currency: 'USD', category: 'US Tech' },
  { ticker: 'META', name: 'Meta Platforms', currency: 'USD', category: 'US Tech' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', currency: 'USD', category: 'US Tech' },
  { ticker: 'INTC', name: 'Intel Corporation', currency: 'USD', category: 'US Tech' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', currency: 'USD', category: 'US Tech' },
  { ticker: 'IBM', name: 'IBM Corporation', currency: 'USD', category: 'US Tech' },
  { ticker: 'JPM', name: 'JPMorgan Chase', currency: 'USD', category: 'US Finance' },
  { ticker: 'BAC', name: 'Bank of America', currency: 'USD', category: 'US Finance' },
  { ticker: 'GS', name: 'Goldman Sachs', currency: 'USD', category: 'US Finance' },
  { ticker: 'WMT', name: 'Walmart Inc.', currency: 'USD', category: 'US Retail' },
  { ticker: 'DIS', name: 'The Walt Disney Company', currency: 'USD', category: 'US Media' },
  { ticker: 'MCD', name: 'McDonalds Corporation', currency: 'USD', category: 'US Food' },
  { ticker: 'KO', name: 'The Coca-Cola Company', currency: 'USD', category: 'US Food' },
  { ticker: 'PEP', name: 'PepsiCo Inc.', currency: 'USD', category: 'US Food' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', currency: 'USD', category: 'US Pharma' },
  { ticker: 'PG', name: 'Procter & Gamble', currency: 'USD', category: 'US Consumer' },
  { ticker: 'V', name: 'Visa Inc.', currency: 'USD', category: 'US Finance' },
  { ticker: 'MA', name: 'Mastercard Inc.', currency: 'USD', category: 'US Finance' },
  { ticker: 'PYPL', name: 'PayPal Holdings', currency: 'USD', category: 'US Finance' },
  { ticker: 'UBER', name: 'Uber Technologies', currency: 'USD', category: 'US Tech' },
  { ticker: 'AIRB', name: 'Airbnb Inc.', currency: 'USD', category: 'US Tech' },

  // === ACTIONS EURONEXT PARIS (.PA) — CAC 40 & Mid Cap ===
  { ticker: 'MC.PA',   name: 'LVMH Moët Hennessy',         currency: 'EUR', category: 'France Luxury' },
  { ticker: 'OR.PA',   name: 'L\'Oréal S.A.',               currency: 'EUR', category: 'France Beauty' },
  { ticker: 'SAN.PA',  name: 'Sanofi S.A.',                  currency: 'EUR', category: 'France Pharma' },
  { ticker: 'BNP.PA',  name: 'BNP Paribas',                 currency: 'EUR', category: 'France Finance' },
  { ticker: 'ACA.PA',  name: 'Crédit Agricole',             currency: 'EUR', category: 'France Finance' },
  { ticker: 'GLE.PA',  name: 'Société Générale',            currency: 'EUR', category: 'France Finance' },
  { ticker: 'STLA.PA', name: 'Stellantis N.V.',             currency: 'EUR', category: 'France Auto' },
  { ticker: 'TTE.PA',  name: 'TotalEnergies SE',            currency: 'EUR', category: 'France Energy' },
  { ticker: 'AIR.PA',  name: 'Airbus SE',                   currency: 'EUR', category: 'France Aerospace' },
  { ticker: 'AI.PA',   name: 'Air Liquide S.A.',            currency: 'EUR', category: 'France Chemicals' },
  { ticker: 'DG.PA',   name: 'Vinci S.A.',                  currency: 'EUR', category: 'France Infra' },
  { ticker: 'CS.PA',   name: 'AXA S.A.',                    currency: 'EUR', category: 'France Insurance' },
  { ticker: 'SU.PA',   name: 'Schneider Electric',          currency: 'EUR', category: 'France Industrie' },
  { ticker: 'DSY.PA',  name: 'Dassault Systèmes',           currency: 'EUR', category: 'France Tech' },
  { ticker: 'SAF.PA',  name: 'Safran S.A.',                 currency: 'EUR', category: 'France Aerospace' },
  { ticker: 'RI.PA',   name: 'Pernod Ricard',               currency: 'EUR', category: 'France Spirits' },
  { ticker: 'RMS.PA',  name: 'Hermès International',        currency: 'EUR', category: 'France Luxury' },
  { ticker: 'EL.PA',   name: 'EssilorLuxottica',            currency: 'EUR', category: 'France Health' },
  { ticker: 'KER.PA',  name: 'Kering S.A.',                 currency: 'EUR', category: 'France Luxury' },
  { ticker: 'EN.PA',   name: 'Bouygues S.A.',               currency: 'EUR', category: 'France Infra' },
  { ticker: 'SGO.PA',  name: 'Saint-Gobain',                currency: 'EUR', category: 'France Matériaux' },
  { ticker: 'VIE.PA',  name: 'Veolia Environnement',        currency: 'EUR', category: 'France Services' },
  { ticker: 'ORA.PA',  name: 'Orange S.A.',                 currency: 'EUR', category: 'France Telecom' },
  { ticker: 'VIV.PA',  name: 'Vivendi SE',                  currency: 'EUR', category: 'France Media' },
  { ticker: 'CAP.PA',  name: 'Capgemini SE',                currency: 'EUR', category: 'France Tech' },
  { ticker: 'ALO.PA',  name: 'Alstom S.A.',                 currency: 'EUR', category: 'France Industrie' },
  { ticker: 'LR.PA',   name: 'Legrand S.A.',                currency: 'EUR', category: 'France Industrie' },
  { ticker: 'SW.PA',   name: 'Sodexo S.A.',                 currency: 'EUR', category: 'France Services' },
  { ticker: 'ASML.PA', name: 'ASML Holding',                currency: 'EUR', category: 'Europe Tech' },
  { ticker: 'NOKIA.PA',name: 'Nokia Corporation',           currency: 'EUR', category: 'Europe Tech' },

  // === ETF EURONEXT PARIS — Amundi / Lyxor ===
  { ticker: 'CW8.PA',   name: 'Amundi MSCI World ETF',            currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'WPEA.PA',  name: 'Amundi Prime All Country World',   currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'EWLD.PA',  name: 'Lyxor MSCI World ETF',             currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'PAEEM.PA', name: 'Amundi MSCI Emerging Markets',     currency: 'EUR', category: 'ETF Émergents' },
  { ticker: 'RS2K.PA',  name: 'Amundi Russell 2000 ETF',          currency: 'EUR', category: 'ETF US Small Cap' },
  { ticker: 'NASD.PA',  name: 'Lyxor Nasdaq-100 ETF',             currency: 'EUR', category: 'ETF US Tech' },
  { ticker: 'ESE.PA',   name: 'Amundi MSCI Europe ETF',           currency: 'EUR', category: 'ETF Europe' },
  { ticker: 'C50.PA',   name: 'Amundi CAC 40 ETF',                currency: 'EUR', category: 'ETF France' },
  { ticker: 'PANX.PA',  name: 'Amundi PEA Nasdaq-100 ETF',        currency: 'EUR', category: 'ETF US Tech PEA' },
  { ticker: 'PUST.PA',  name: 'Amundi PEA S&P 500 ETF',           currency: 'EUR', category: 'ETF US PEA' },
  { ticker: 'PSPS.PA',  name: 'Amundi PEA S&P 500 UCITS ETF',     currency: 'EUR', category: 'ETF US PEA' },
  { ticker: 'SP5.PA',   name: 'Amundi S&P 500 ETF',               currency: 'EUR', category: 'ETF US' },
  { ticker: 'SPPW.PA',  name: 'SPDR S&P 500 ETF',                 currency: 'EUR', category: 'ETF US' },
  { ticker: 'SWRD.PA',  name: 'SPDR MSCI World UCITS ETF',        currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'RECY.PA',  name: 'Amundi FTSE EPRA NAREIT Global',   currency: 'EUR', category: 'ETF Immobilier' },
  { ticker: 'EPRA.PA',  name: 'Lyxor FTSE EPRA NAREIT ETF',       currency: 'EUR', category: 'ETF Immobilier' },
  { ticker: 'OBLI.PA',  name: 'Amundi Euro Govt Bond ETF',        currency: 'EUR', category: 'ETF Obligataire' },
  { ticker: 'EHY.PA',   name: 'Amundi EUR High Yield Bond ETF',   currency: 'EUR', category: 'ETF Obligataire' },

  // === ETF EURONEXT AMSTERDAM (.AS) / XETRA (.DE) ===
  { ticker: 'VWCE.DE',  name: 'Vanguard FTSE All-World UCITS',    currency: 'EUR', category: 'ETF Monde' },
  { ticker: 'IWDA.AS',  name: 'iShares Core MSCI World ETF',      currency: 'USD', category: 'ETF Monde' },
  { ticker: 'CSPX.AS',  name: 'iShares Core S&P 500 ETF',         currency: 'USD', category: 'ETF US' },
  { ticker: 'EIMI.AS',  name: 'iShares Core MSCI EM IMI',         currency: 'USD', category: 'ETF Émergents' },

  // === CRYPTOMONNAIES EN EUR ===
  { ticker: 'BTC-EUR', name: 'Bitcoin', currency: 'EUR', category: 'Crypto' },
  { ticker: 'ETH-EUR', name: 'Ethereum', currency: 'EUR', category: 'Crypto' },
  { ticker: 'BNB-EUR', name: 'Binance Coin', currency: 'EUR', category: 'Crypto' },
  { ticker: 'SOL-EUR', name: 'Solana', currency: 'EUR', category: 'Crypto' },
  { ticker: 'ADA-EUR', name: 'Cardano', currency: 'EUR', category: 'Crypto' },
  { ticker: 'XRP-EUR', name: 'XRP', currency: 'EUR', category: 'Crypto' },
  { ticker: 'DOGE-EUR', name: 'Dogecoin', currency: 'EUR', category: 'Crypto' },

  // === CRYPTOMONNAIES EN USD ===
  { ticker: 'BTC-USD', name: 'Bitcoin', currency: 'USD', category: 'Crypto' },
  { ticker: 'ETH-USD', name: 'Ethereum', currency: 'USD', category: 'Crypto' },
  { ticker: 'BNB-USD', name: 'Binance Coin', currency: 'USD', category: 'Crypto' },

  // === INDICES ===
  { ticker: '^GSPC', name: 'S&P 500', currency: 'USD', category: 'Indices' },
  { ticker: '^IXIC', name: 'NASDAQ Composite', currency: 'USD', category: 'Indices' },
  { ticker: '^DJI', name: 'Dow Jones Industrial', currency: 'USD', category: 'Indices' },
  { ticker: '^FTSE', name: 'FTSE 100', currency: 'GBP', category: 'Indices' },
  { ticker: '^N225', name: 'Nikkei 225', currency: 'JPY', category: 'Indices' },
];

/**
 * Cherche un ticker dans la liste connue
 * @param {string} ticker - Le ticker à chercher (case-insensitive)
 * @returns {object|null} L'objet ticker ou null si non trouvé
 */
function getKnownTicker(ticker) {
  if (!ticker) return null;
  const t = String(ticker).toUpperCase().trim();
  return KNOWN_TICKERS.find(kt => kt.ticker.toUpperCase() === t) || null;
}

/**
 * Cherche des tickers par pattern (autocomplete)
 * @param {string} pattern - Pattern à chercher (ex: "AA" pour AAPL, AMZN)
 * @param {number} limit - Nombre max de résultats
 * @returns {array} Tickers trouvés
 */
function searchTickers(pattern, limit = 10) {
  if (!pattern || pattern.length < 1) return [];
  const p = pattern.toUpperCase();
  return KNOWN_TICKERS.filter(t => 
    t.ticker.toUpperCase().includes(p) || 
    t.name.toUpperCase().includes(p)
  ).slice(0, limit);
}

module.exports = {
  KNOWN_TICKERS,
  getKnownTicker,
  searchTickers
};
