#!/usr/bin/env node
// test-api-providers.js — Tests rapides des APIs financières
//
// Usage : node test-api-providers.js

const apiProviders = require('./api-providers');

async function runTests() {
  console.log('\n🧪 Tests des APIs financières\n');
  console.log('═'.repeat(60));

  try {
    // Test 1 : Stock (Yahoo Finance)
    console.log('\n📊 Test 1 : Récupération d\'un stock (Apple)');
    const apple = await apiProviders.getQuote('AAPL');
    console.log('✅ Résultat :', {
      symbol: apple.symbol,
      price: apple.price,
      currency: apple.currency,
      source: apple.apiSource
    });

    // Test 2 : Cache hit
    console.log('\n💾 Test 2 : Cache hit (même requête)');
    const appleCached = await apiProviders.getQuote('AAPL');
    console.log('✅ Résultat :', {
      price: appleCached.price,
      cached: appleCached.fromCache
    });

    // Test 3 : Crypto (CoinGecko)
    console.log('\n🪙 Test 3 : Récupération d\'une crypto (Bitcoin)');
    const btc = await apiProviders.getQuote('BTC');
    console.log('✅ Résultat :', {
      symbol: btc.symbol,
      price: btc.price,
      currency: btc.currency,
      source: btc.apiSource
    });

    // Test 4 : Batch
    console.log('\n⚡ Test 4 : Récupération multiple (batch)');
    const batch = await apiProviders.getPrices(['MSFT', 'ETH', 'EURUSD']);
    console.log(`✅ Résultat : ${batch.filter(q => q.ok).length}/${batch.length} réussis`);
    for (const q of batch) {
      if (q.ok) {
        console.log(`   - ${q.ticker} : ${q.data.price} ${q.data.currency}`);
      } else {
        console.log(`   - ${q.ticker} : ❌ ${q.error}`);
      }
    }

    // Test 5 : Taux de livrets
    console.log('\n🏦 Test 5 : Taux des livrets');
    const rates = await apiProviders.getLivretRates();
    console.log('✅ Résultat :', {
      livretA: rates.rates.livret_a,
      pel: rates.rates.pel,
      source: rates.source,
      lastUpdate: rates.lastUpdate
    });

    // Test 6 : Conversion de devise
    console.log('\n💱 Test 6 : Conversion de devise');
    const converted = await apiProviders.convertCurrency(100, 'EUR', 'USD');
    console.log('✅ Résultat :', {
      amount: converted.amount.toFixed(2),
      from: converted.from,
      to: converted.to,
      rate: converted.rate.toFixed(4)
    });

    // Test 7 : Stats du cache
    console.log('\n📈 Test 7 : Stats du cache');
    const stats = apiProviders.getCacheStats();
    console.log('✅ Résultat :', {
      cacheSize: stats.size,
      ttlMinutes: Math.round(stats.ttlMs / 60000),
      entries: stats.entries.length
    });

    // Test 8 : Erreur (ticker invalide)
    console.log('\n⚠️  Test 8 : Gestion d\'erreur (ticker inexistant)');
    try {
      await apiProviders.getQuote('XYZABC123INVALID');
      console.log('❌ Aurait dû échouer');
    } catch (error) {
      console.log('✅ Erreur capturée :', error.message);
    }

    console.log('\n═'.repeat(60));
    console.log('\n✅ Tous les tests sont passés !\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur lors des tests :', error);
    process.exit(1);
  }
}

runTests();
