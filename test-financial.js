// test-financial.js — Vérifications automatiques de financial.js
// Lance : node test-financial.js

const assert = require('assert');
const { computeAccount, isPortfolio, PORTFOLIO_TYPES } = require('./financial');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); fail++; }
}

console.log('\n--- isPortfolio ---');
test('Types portefeuille', () => {
  for (const t of ['compte_titres','pea','assurance_vie_uc','per','crypto']) {
    assert.strictEqual(isPortfolio(t), true, t + ' devrait être un portefeuille');
  }
});
test('Types simples', () => {
  for (const t of ['livret','livret_banque','assurance_vie_euro','pel','cel','epargne_simple','autre']) {
    assert.strictEqual(isPortfolio(t), false, t + ' ne devrait PAS être un portefeuille');
  }
});

console.log('\n--- computeAccount : type simple (Livret A) ---');
test('Livret avec rendement + versement mensuel', () => {
  const a = {
    account_type: 'livret',
    amount: 10000,
    monthly_in: 200,
    monthly_out: 0,
    annual_rate: 3
  };
  const r = computeAccount(a, []);
  assert.strictEqual(r.isPortfolio, false);
  assert.strictEqual(r.currentValue, 10000);
  assert.strictEqual(r.investedValue, 10000);
  assert.strictEqual(r.unrealizedGain, 0);
  assert.strictEqual(r.monthlyIn, 200);
  assert.strictEqual(r.monthlyOut, 0);
  assert.strictEqual(r.monthlyNet, 200);
  assert.strictEqual(r.annualNet, 2400);
  assert.strictEqual(r.annualRate, 3);
  // 10000 × 3% = 300
  assert.strictEqual(r.estimatedAnnualReturn, 300);
  assert.strictEqual(r.positionCount, 0);
  assert.strictEqual(r.typeLabel, 'Livret réglementé');
});

console.log('\n--- computeAccount : type simple avec retrait ---');
test('Épargne avec retrait > versement (flux négatif)', () => {
  const a = {
    account_type: 'epargne_simple',
    amount: 5000,
    monthly_in: 100,
    monthly_out: 300,
    annual_rate: 0
  };
  const r = computeAccount(a, []);
  assert.strictEqual(r.monthlyNet, -200);
  assert.strictEqual(r.annualNet, -2400);
  assert.strictEqual(r.estimatedAnnualReturn, 0);
});

console.log('\n--- computeAccount : portefeuille (PEA) ---');
test('PEA avec 2 positions et +value', () => {
  const a = { account_type: 'pea', amount: 0, monthly_in: 0, monthly_out: 0, annual_rate: 0 };
  const positions = [
    // Apple : 10 × (achat 150 → actuel 180) = +300 €
    { quantity: 10, buy_price: 150, current_price: 180 },
    // ETF : 5 × (achat 100 → actuel 120) = +100 €
    { quantity: 5,  buy_price: 100, current_price: 120 }
  ];
  const r = computeAccount(a, positions);
  assert.strictEqual(r.isPortfolio, true);
  // current : 10×180 + 5×120 = 1800 + 600 = 2400
  assert.strictEqual(r.currentValue, 2400);
  // invested : 10×150 + 5×100 = 1500 + 500 = 2000
  assert.strictEqual(r.investedValue, 2000);
  assert.strictEqual(r.unrealizedGain, 400);
  // 400 / 2000 = 20 %
  assert.strictEqual(r.unrealizedGainPct, 20);
  assert.strictEqual(r.positionCount, 2);
  // Pour un portefeuille, pas de rendement "taux × montant"
  assert.strictEqual(r.estimatedAnnualReturn, 0);
});

console.log('\n--- computeAccount : portefeuille avec -value ---');
test('CTO avec -value', () => {
  const a = { account_type: 'compte_titres', amount: 0, monthly_in: 0, monthly_out: 0, annual_rate: 0 };
  const positions = [
    { quantity: 2, buy_price: 500, current_price: 400 } // -200
  ];
  const r = computeAccount(a, positions);
  assert.strictEqual(r.currentValue, 800);
  assert.strictEqual(r.investedValue, 1000);
  assert.strictEqual(r.unrealizedGain, -200);
  assert.strictEqual(r.unrealizedGainPct, -20);
});

console.log('\n--- computeAccount : portefeuille vide ---');
test('Portefeuille sans position (valeurs nulles, pas de division par 0)', () => {
  const a = { account_type: 'crypto', amount: 0, monthly_in: 0, monthly_out: 0, annual_rate: 0 };
  const r = computeAccount(a, []);
  assert.strictEqual(r.currentValue, 0);
  assert.strictEqual(r.investedValue, 0);
  assert.strictEqual(r.unrealizedGain, 0);
  assert.strictEqual(r.unrealizedGainPct, 0);
  assert.strictEqual(r.positionCount, 0);
});

console.log('\n--- computeAccount : valeurs manquantes / non numériques ---');
test('Champs undefined ou null → 0 (pas de NaN)', () => {
  const a = { account_type: 'livret' }; // tout le reste est absent
  const r = computeAccount(a, []);
  assert.strictEqual(r.currentValue, 0);
  assert.strictEqual(r.monthlyIn, 0);
  assert.strictEqual(r.monthlyOut, 0);
  assert.strictEqual(r.monthlyNet, 0);
  assert.strictEqual(r.annualNet, 0);
  assert.strictEqual(r.annualRate, 0);
  assert.strictEqual(r.estimatedAnnualReturn, 0);
  assert.strictEqual(Number.isFinite(r.unrealizedGainPct), true);
});

console.log('\n--- Résumé ---');
console.log(`${pass} OK · ${fail} échec(s)`);
process.exit(fail === 0 ? 0 : 1);
