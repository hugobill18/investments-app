# 🏗️ Architecture des APIs financières

## Overview

Le système d'APIs financières est construit sur une **architecture modulaire et extensible** qui permet de récupérer les cours et taux de diverses sources de manière unifiée.

```
┌─────────────────────────────────────────────────────────┐
│           Client (Dashboard)                            │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Express Routes (api-routes.js)                         │
│  GET /api/quote/:ticker                                 │
│  POST /api/quotes/batch                                 │
│  GET /api/livret-rates                                  │
│  POST /api/convert                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  API Providers (index.js)                               │
│  - Orchestration des sources                            │
│  - Gestion du cache                                     │
│  - Logging                                              │
└─┬──────────────────┬──────────────────┬────────────────┘
  │                  │                  │
  ▼                  ▼                  ▼
Cache (30min)   Yahoo Finance      CoinGecko
                (Stocks)            (Cryptos)

┌──────────────────────────────────────────────────────────┐
│  Livrets.js (Taux statiques Banque de France)           │
└──────────────────────────────────────────────────────────┘
```

## 📂 Structure des fichiers

### `index.js`
**Point d'entrée principal** — API unifiée pour tous les besoins.

Exports :
- `getQuote(ticker, options)` — Récupère un cours unique
- `getPrices(tickers, options)` — Batch de plusieurs cours
- `getLivretRates()` — Taux des livrets
- `getLivretRate(accountType)` — Taux d'un type spécifique
- `convertCurrency(amount, from, to, options)` — Conversion devise
- `getCacheStats()`, `clearCache()`, `pruneCache()` — Gestion cache
- `isCrypto(ticker)`, `isLivret(type)` — Helpers de détection

### `cache.js`
**Gestion du cache avec TTL.**

Classe `APICache` :
- `set(key, value, source)` — Stocke une valeur
- `get(key)` — Récupère (null si expiré)
- `has(key)` — Vérifie présence
- `delete(key)`, `clear()` — Supprime entrées
- `prune()` — Nettoie les expirées
- `stats()` — Retourne les infos

**TTL par défaut** : 30 minutes

### `coingecko.js`
**Récupération des crypto-monnaies** via CoinGecko (gratuit, illimité).

Exports :
- `fetchCryptoPrice(symbol, currency)` — Prix unique
- `fetchCryptoPriceExact(symbol, currency)` — Prix avec full validation
- `fetchCryptoPricesBatch(symbols, currency)` — Batch
- `registerCrypto(symbol, coingeckoId)` — Ajouter une crypto
- `SUPPORTED_CRYPTOS` — Liste des cryptos supportées

**Cryptos supportées** :
BTC, ETH, SOL, XRP, ADA, DOGE, LINK, UNI, AAVE, MATIC, AVAX, FTM, OP, ARB, LDO, STG

**Ajouter une crypto** :
```javascript
const { registerCrypto } = require('./coingecko');
registerCrypto('SHIB', 'shiba-inu');
```

### `livrets.js`
**Taux des livrets français** (statiques, mis à jour manuellement).

Exports :
- `getOfficialRates()` — Tous les taux
- `getRate(accountType)` — Taux spécifique
- `fetchRatesFromAPI()` — Simule un appel API
- `mergeWithUserRates(official, overrides)` — Merge taux
- `formatRate(rate)` — Formate pour affichage (ex: "3.00%")
- `EURIBOR` — Taux de référence
- `LAST_UPDATE` — Date de mise à jour

**Types supportés** :
- `livret_a` (3.0%)
- `ldds` (3.0%)
- `pel` (2.5%)
- `cel` (4.0%)
- `epargne_simple` (1.0%)
- `assurance_vie_euro` (2.3%)
- `assurance_vie_uc` (null)
- `per` (null)
- `pea` (null)
- `compte_titres` (null)

**Mettre à jour les taux** :
Modifier la constante `OFFICIAL_RATES` (normalement le 1er février et 1er août).

## 🔄 Flux des requêtes

### 1️⃣ Récupération simple

```javascript
const quote = await apiProviders.getQuote('AAPL');
// Recherche dans le cache → pas trouvé
// Détecte que c'est un stock → appel Yahoo Finance
// Stock en cache pendant 30 minutes
// Retour : { symbol: 'AAPL', price: 185.25, ... }
```

### 2️⃣ Batch (optimisé)

```javascript
const quotes = await apiProviders.getPrices(['AAPL', 'BTC', 'MSFT']);
// Sépare stocks et cryptos
// Appel Yahoo batch pour : AAPL, MSFT
// Appel CoinGecko batch pour : BTC
// Exécution parallèle avec délais pour rate-limiting
// Cache tous les résultats
// Retour : tableau { ticker, ok, data|error }
```

### 3️⃣ Gestion des erreurs

- **Stock introuvable** → tente avec suffixes (.PA, -EUR) → erreur
- **Timeout** (8s) → erreur
- **Crypto non supportée** → erreur avec liste des supportées
- **Conversion currency** → basculer sur stock/devise

## 🧠 Détection automatique

La fonction `getQuote()` détecte le type de ticker :

```javascript
if (SUPPORTED_CRYPTOS.includes(ticker.toUpperCase())) {
  // → CoinGecko
}
else {
  // → Yahoo Finance
}
```

Pour personnaliser :
```javascript
const { isCrypto } = require('./api-providers');
if (isCrypto('BTC')) { /* ... */ }
```

## 📊 Logging

Les appels API sont loggés automatiquement :

```
[2026-04-19T10:30:00.000Z] INFO: Fetching stock: AAPL
[2026-04-19T10:30:01.234Z] INFO: Successfully fetched: AAPL
[2026-04-19T10:30:01.235Z] INFO: Cache hit: AAPL (cachedAt: ...)
```

Logger custom dans `index.js` (class `SimpleLogger`) — remplaçable par Winston, Pino, etc.

## ⚙️ Configuration

### TTL du cache

```javascript
// Dans index.js
const cache = new APICache(30 * 60 * 1000); // 30 minutes
```

### Timeout des requêtes

```javascript
// Dans quotes.js et coingecko.js
const timer = setTimeout(() => ac.abort(), 8000); // 8 secondes
```

### Limites de taux (rate limiting)

- **Yahoo Finance** : ~60 req/min (soft limit)
- **CoinGecko** : illimité
- **Délais internes** : 250ms entre vagues pour Yahoo, 100ms pour CoinGecko

## 🧪 Tests

```bash
node test-api-providers.js
```

Teste tous les chemins : stocks, cryptos, batch, taux, conversion, cache, erreurs.

## 🔮 Évolutions futures

- [ ] **Alpha Vantage** : Alternative à Yahoo pour stocks US (avec clé API gratuite)
- [ ] **WebSocket** : Données temps réel (si besoin)
- [ ] **Historique** : Stocker les prix en BDD pour graphiques
- [ ] **Alertes** : Notifications price change
- [ ] **Finnhub** : Données fondamentales (PE ratio, yield, etc.)
- [ ] **Real-time FX** : Taux de change live vs statiques Yahoo

## 🚨 Limitations connues

1. **Livrets** : Taux manuels, pas de vraie API (Banque de France n'expose pas les taux)
2. **Yahoo Finance** : Limitation soft à ~60 req/min
3. **CoinGecko** : Retard de quelques minutes vs temps réel
4. **Conversion** : Utilise Yahoo, pas de crypto → crypto direct

## 📚 Références

- [Yahoo Finance v8 API](https://query1.finance.yahoo.com/v8/finance/chart/)
- [CoinGecko Free API](https://www.coingecko.com/en/api)
- [Banque de France](https://www.banque-france.fr/)

---

**Maintenu par** : Claude | **Version** : 1.0.0
