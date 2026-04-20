const MOCK_QUOTES = {
  'AAPL': {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 185.25,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    apiSource: 'mock'
  },
  'BTC': {
    symbol: 'BTC',
    name: 'Bitcoin',
    price: 67234.50,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    apiSource: 'mock'
  },
  'MSFT': {
    symbol: 'MSFT',
    name: 'Microsoft',
    price: 389.50,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    apiSource: 'mock'
  },
  'TSLA': {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    price: 242.75,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    apiSource: 'mock'
  },
  'GOOGL': {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    price: 178.50,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    apiSource: 'mock'
  },
  'AMZN': {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    price: 195.25,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    apiSource: 'mock'
  },
  'ETH': {
    symbol: 'ETH',
    name: 'Ethereum',
    price: 3542.30,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    apiSource: 'mock'
  },
  'NFLX': {
    symbol: 'NFLX',
    name: 'Netflix Inc.',
    price: 249.50,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    apiSource: 'mock'
  }
};

function getMockQuote(ticker) {
  return MOCK_QUOTES[ticker.toUpperCase()] || null;
}

module.exports = { getMockQuote, MOCK_QUOTES };
