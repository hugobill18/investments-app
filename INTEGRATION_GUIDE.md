# 📚 Guide d'intégration des APIs financières

## Architecture mise en place

L'architecture est organisée en modules distincts dans le dossier `api-providers/` :

```
investments-app/
├── api-providers/
│   ├── index.js           ← Point d'entrée unique (orchestration)
│   ├── cache.js           ← Gestion du cache avec TTL
│   ├── coingecko.js       ← Récupération des cryptos
│   └── livrets.js         ← Taux des livrets français
├── quotes.js              ← Existant : Yahoo Finance
├── api-routes.js          ← Nouvelles routes API
├── server.js              ← À mettre à jour
└── ...
```

## 🚀 Intégration dans server.js

### Étape 1 : Importer les API

Au début du fichier `server.js`, ajouter :

```javascript
const apiProviders = require('./api-providers');
const setupApiRoutes = require('./api-routes');
```

### Étape 2 : Initialiser les routes API

Après `app.use(express.static(...))`, ajouter :

```javascript
// Enregistrer les nouvelles routes API financières
setupApiRoutes(app, db, requireAuth);
```

### Étape 3 : Utiliser les APIs dans les routes existantes

Si tu veux enrichir les routes existantes (ex : `/api/positions`), tu peux utiliser :

```javascript
// Exemple : refetch automatique d'un position au lieu de Yahoo seul
app.post('/api/financial-accounts/:id/positions', requireAuth, async (req, res) => {
  // ... validation ...
  
  if (data.ticker && !data.current_price) {
    try {
      // ✅ Utiliser la nouvelle API unifiée
      const quote = await apiProviders.getQuote(data.ticker);
      data.current_price = quote.price;
      data.currency = quote.currency;
      data.name = quote.name;
    } catch (e) {
      // Fallback : laisser l'utilisateur saisir
      logger.warn(`Could not fetch quote for ${data.ticker}`);
    }
  }
  
  // ... insert ...
});
```

## 📡 Nouvelles routes API

### 1. **GET /api/quote/:ticker**
Récupère un cours (stock, crypto, devise).

```bash
curl "http://localhost:3000/api/quote/AAPL?currency=EUR"
curl "http://localhost:3000/api/quote/BTC?currency=EUR"
```

**Réponse** :
```json
{
  "symbol": "AAPL",
  "price": 185.25,
  "currency": "EUR",
  "name": "Apple Inc.",
  "timestamp": "2026-04-19T10:30:00.000Z",
  "apiSource": "yahoo"
}
```

### 2. **POST /api/quotes/batch**
Récupère plusieurs cours en parallèle.

```bash
curl -X POST http://localhost:3000/api/quotes/batch \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": ["AAPL", "BTC", "MSFT"],
    "currency": "EUR"
  }'
```

**Réponse** :
```json
{
  "tickers": ["AAPL", "BTC", "MSFT"],
  "currency": "EUR",
  "quotes": [
    { "ticker": "AAPL", "ok": true, "data": {...} },
    { "ticker": "BTC", "ok": true, "data": {...} },
    { "ticker": "MSFT", "ok": false, "error": "Ticker inconnu" }
  ]
}
```

### 3. **GET /api/livret-rates**
Récupère les taux officiels des livrets.

```bash
curl http://localhost:3000/api/livret-rates
```

**Réponse** :
```json
{
  "rates": {
    "livret_a": 0.03,
    "ldds": 0.03,
    "pel": 0.025,
    "cel": 0.04,
    "epargne_simple": 0.01,
    "assurance_vie_euro": 0.023,
    "assurance_vie_uc": null,
    "per": null,
    "pea": null,
    "compte_titres": null
  },
  "lastUpdate": "2026-04-01",
  "source": "Banque de France (manuel)",
  "note": "Taux au 1er avril 2026. Prochaine révision 1er août 2026."
}
```

### 4. **POST /api/convert**
Convertit une devise.

```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{ "amount": 100, "from": "EUR", "to": "USD" }'
```

**Réponse** :
```json
{
  "amount": 107.5,
  "from": "EUR",
  "to": "USD",
  "rate": 1.075,
  "source": "yahoo"
}
```

### 5. **GET /api/cache/stats**
Infos du cache.

```bash
curl http://localhost:3000/api/cache/stats
```

### 6. **POST /api/cache/clear**
Vide le cache.

```bash
curl -X POST http://localhost:3000/api/cache/clear
```

## 🔧 Configuration

### TTL du cache (30 minutes par défaut)

Modifiable dans `api-providers/index.js` :

```javascript
const cache = new APICache(30 * 60 * 1000); // ← changer ici
```

### Cryptos supportées

Voir `api-providers/coingecko.js`, constante `SYMBOL_TO_ID`.

Pour en ajouter :
```javascript
const { registerCrypto } = require('./api-providers/coingecko');
registerCrypto('SHIB', 'shiba-inu'); // Ajouter Shiba Inu
```

### Taux des livrets

Modifiables dans `api-providers/livrets.js`, constante `OFFICIAL_RATES`.

Mise à jour officielle : 1er février et 1er août.

## 🧪 Tests

### Tester l'API unifiée directement

```javascript
const apiProviders = require('./api-providers');

// Test stock
const apple = await apiProviders.getQuote('AAPL');
console.log(apple); // { symbol: 'AAPL', price: ..., apiSource: 'yahoo' }

// Test crypto
const btc = await apiProviders.getQuote('BTC');
console.log(btc); // { symbol: 'BTC', price: ..., apiSource: 'coingecko' }

// Test batch
const quotes = await apiProviders.getPrices(['AAPL', 'BTC', 'MSFT']);
console.log(quotes);

// Test taux
const rates = await apiProviders.getLivretRates();
console.log(rates);
```

## 📊 Logging et monitoring

Les appels API sont loggés automatiquement. Vérifier la console :

```
[2026-04-19T10:30:00.000Z] INFO: Fetching stock: AAPL
[2026-04-19T10:30:01.234Z] INFO: Successfully fetched: AAPL
[2026-04-19T10:30:01.235Z] INFO: Batch fetch completed
```

## 🚨 Gestion des erreurs

- **Ticker inconnu** : retourne erreur 502
- **API timeout** (8s) : retourne erreur 502
- **Réseau indisponible** : retourne erreur 502
- **Cache expiré** : refetch automatique
- **Cryptos non supportées** : retourne liste des supportées

## 🔮 Évolutions futures

- [ ] Intégration Alpha Vantage (alternative Yahoo pour stocks US)
- [ ] WebSocket pour données temps réel (si besoin)
- [ ] Historique des prix (base de données)
- [ ] Alertes price change
- [ ] API Finnhub pour données fondamentales
- [ ] Taux de change live (au lieu de Yahoo)

## 📝 Notes

- Yahoo Finance : gratuit, ~60 req/min limite soft
- CoinGecko : gratuit, illimité
- Banque de France : taux manuels, pas de vraie API
- Fallbacks : basculer automatiquement si une API est down

---

**Questions ?** Demande à Claude !
