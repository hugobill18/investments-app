# 💡 Exemples d'utilisation pratique

## Dans une route Express

### Exemple 1 : Ajouter une position avec fetch automatique

```javascript
// server.js — Route POST /api/financial-accounts/:id/positions

app.post('/api/financial-accounts/:id/positions', requireAuth, async (req, res) => {
  const acc = ensureOwnedAccount(req.params.id, req.session.userId);
  if (!acc) return res.status(404).json({ error: 'Compte introuvable.' });

  const { errors, data } = validatePositionPayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  // 🆕 Utiliser la nouvelle API unifiée pour fetch automatique
  let fetched = null;
  if (data.ticker && (!data.current_price || data.current_price === 0)) {
    try {
      const quote = await apiProviders.getQuote(data.ticker);
      data.current_price = quote.price;
      data.currency = quote.currency || data.currency;
      if (!data.name || data.name.trim() === data.ticker.trim()) {
        data.name = quote.name;
      }
      fetched = { ok: true, price: quote.price, source: quote.apiSource };
    } catch (e) {
      fetched = { ok: false, error: e.message };
      // Ne pas bloquer : l'utilisateur garde sa valeur manuelle
    }
  }

  const info = db.prepare(`
    INSERT INTO positions (account_id, ticker, name, quantity, buy_price, current_price, currency, last_updated)
    VALUES (@account_id, @ticker, @name, @quantity, @buy_price, @current_price, @currency, @last_updated)
  `).run({
    account_id: acc.id,
    ...data,
    last_updated: fetched && fetched.ok ? new Date().toISOString() : null
  });

  const row = db.prepare('SELECT * FROM positions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...row, fetched }); // Inclure le statut du fetch
});
```

**Response** :
```json
{
  "id": 42,
  "account_id": 5,
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "quantity": 10,
  "buy_price": 150,
  "current_price": 185.25,
  "currency": "EUR",
  "last_updated": "2026-04-19T10:30:00.000Z",
  "fetched": {
    "ok": true,
    "price": 185.25,
    "source": "yahoo"
  }
}
```

---

### Exemple 2 : Route de rafraîchissement batch

```javascript
// server.js — Route POST /api/refresh-quotes (existante, optimisée)

app.post('/api/refresh-quotes', requireAuth, async (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.ticker FROM positions p
    JOIN financial_accounts a ON a.id = p.account_id
    WHERE a.user_id = ? AND p.ticker IS NOT NULL AND TRIM(p.ticker) != ''
  `).all(req.session.userId);

  if (rows.length === 0) {
    return res.json({ refreshed: 0, failed: 0, details: [] });
  }

  // 🆕 Utiliser la nouvelle API de batch
  const tickers = [...new Set(rows.map(r => r.ticker.trim()))];
  const quoteResults = await apiProviders.getPrices(tickers);

  const update = db.prepare(`
    UPDATE positions SET current_price = ?, currency = COALESCE(?, currency), last_updated = ?
    WHERE id = ?
  `);
  const now = new Date().toISOString();

  const details = [];
  let refreshed = 0, failed = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      const qResult = quoteResults.find(q => q.ticker === row.ticker);

      if (qResult && qResult.ok) {
        update.run(qResult.data.price, qResult.data.currency || null, now, row.id);
        refreshed++;
        details.push({
          id: row.id,
          ticker: row.ticker,
          ok: true,
          price: qResult.data.price,
          currency: qResult.data.currency
        });
      } else {
        failed++;
        details.push({
          id: row.id,
          ticker: row.ticker,
          ok: false,
          error: qResult?.error || 'Erreur inconnue'
        });
      }
    }
  });

  tx();

  res.json({
    refreshed,
    failed,
    at: now,
    details,
    message: `${refreshed} position(s) mises à jour, ${failed} erreur(s)`
  });
});
```

**Response** :
```json
{
  "refreshed": 3,
  "failed": 1,
  "at": "2026-04-19T10:35:00.000Z",
  "message": "3 position(s) mises à jour, 1 erreur(s)",
  "details": [
    {
      "id": 1,
      "ticker": "AAPL",
      "ok": true,
      "price": 185.25,
      "currency": "EUR"
    },
    {
      "id": 2,
      "ticker": "BTC",
      "ok": true,
      "price": 67234.50,
      "currency": "EUR"
    },
    {
      "id": 3,
      "ticker": "MSFT",
      "ok": true,
      "price": 389.50,
      "currency": "EUR"
    },
    {
      "id": 4,
      "ticker": "UNKNOWNTICKER",
      "ok": false,
      "error": "Aucun cours trouvé"
    }
  ]
}
```

---

### Exemple 3 : Endpoint pour voir les stats du cache

```javascript
// Dans api-routes.js (déjà implémenté)

app.get('/api/cache/stats', requireAuth, (req, res) => {
  const stats = apiProviders.getCacheStats();
  res.json({
    cacheSize: stats.size,
    ttlMinutes: Math.round(stats.ttlMs / 60000),
    entries: stats.entries.map(e => ({
      key: e.key,
      source: e.source,
      expiresInSeconds: Math.round(e.expiresIn / 1000)
    }))
  });
});
```

**Response** :
```json
{
  "cacheSize": 4,
  "ttlMinutes": 30,
  "entries": [
    {
      "key": "quote:AAPL:EUR",
      "source": "yahoo",
      "expiresInSeconds": 1234
    },
    {
      "key": "quote:BTC:EUR",
      "source": "coingecko",
      "expiresInSeconds": 1567
    },
    {
      "key": "livret:rates",
      "source": "banque-de-france",
      "expiresInSeconds": 1890
    },
    {
      "key": "fx:EURUSD",
      "source": "yahoo-fx",
      "expiresInSeconds": 234
    }
  ]
}
```

---

## Côté client (JavaScript / Frontend)

### Exemple 1 : Fetch au chargement du dashboard

```javascript
// public/dashboard.js ou similar

async function loadPositions() {
  try {
    const response = await fetch('/api/financial-accounts/5/positions');
    const positions = await response.json();

    // Afficher les positions
    positions.forEach(pos => {
      console.log(`${pos.ticker}: ${pos.current_price} ${pos.currency}`);
      console.log(`Dernière mise à jour: ${pos.last_updated}`);
    });
  } catch (error) {
    console.error('Erreur lors du chargement', error);
  }
}

// Appeler au démarrage
document.addEventListener('DOMContentLoaded', loadPositions);
```

### Exemple 2 : Bouton de rafraîchissement

```javascript
// HTML
<button id="refreshButton" class="btn btn-primary">
  🔄 Rafraîchir les prix
</button>
<span id="refreshStatus"></span>

// JavaScript
document.getElementById('refreshButton').addEventListener('click', async () => {
  const btn = document.getElementById('refreshButton');
  const status = document.getElementById('refreshStatus');

  btn.disabled = true;
  status.textContent = '⏳ Chargement...';

  try {
    const response = await fetch('/api/refresh-quotes', { method: 'POST' });
    const result = await response.json();

    // Afficher le résultat
    status.textContent = `✅ ${result.message} (à ${new Date(result.at).toLocaleTimeString()})`;

    // Mettre à jour le tableau des positions
    loadPositions();

    // Désactiver le bouton pendant 30 secondes (limite cache)
    btn.disabled = true;
    setTimeout(() => { btn.disabled = false; }, 30000);
  } catch (error) {
    status.textContent = `❌ Erreur: ${error.message}`;
  } finally {
    btn.disabled = false;
  }
});
```

### Exemple 3 : Afficher le taux d'un livret

```javascript
// HTML
<select id="livretType">
  <option value="">Sélectionner un type</option>
  <option value="livret_a">Livret A</option>
  <option value="ldds">LDDS</option>
  <option value="pel">PEL</option>
  <option value="cel">CEL</option>
</select>
<span id="livretRate"></span>

// JavaScript
async function updateLivretRate() {
  try {
    const response = await fetch('/api/livret-rates');
    const data = await response.json();

    const select = document.getElementById('livretType');
    select.addEventListener('change', (e) => {
      const type = e.target.value;
      const rate = data.rates[type];

      if (rate === null) {
        document.getElementById('livretRate').textContent = '(N/A)';
      } else {
        const percent = (rate * 100).toFixed(2);
        document.getElementById('livretRate').textContent = `${percent}%`;
      }
    });

    // Afficher la note de mise à jour
    console.log(`Taux à jour au : ${data.lastUpdate}`);
  } catch (error) {
    console.error('Erreur', error);
  }
}

document.addEventListener('DOMContentLoaded', updateLivretRate);
```

---

## Tests curl

### Test 1 : Récupérer un cours unique

```bash
curl "http://localhost:3000/api/quote/AAPL"

# Réponse
{
  "symbol": "AAPL",
  "price": 185.25,
  "currency": "EUR",
  "name": "Apple Inc.",
  "timestamp": "2026-04-19T10:30:00.000Z",
  "apiSource": "yahoo"
}
```

### Test 2 : Récupérer plusieurs cours

```bash
curl -X POST http://localhost:3000/api/quotes/batch \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": ["AAPL", "BTC", "MSFT", "INVALID"],
    "currency": "EUR"
  }'

# Réponse
{
  "tickers": ["AAPL", "BTC", "MSFT", "INVALID"],
  "currency": "EUR",
  "quotes": [
    {
      "ticker": "AAPL",
      "ok": true,
      "data": { "symbol": "AAPL", "price": 185.25, ... }
    },
    {
      "ticker": "BTC",
      "ok": true,
      "data": { "symbol": "BTC", "price": 67234.50, ... }
    },
    {
      "ticker": "MSFT",
      "ok": true,
      "data": { "symbol": "MSFT", "price": 389.50, ... }
    },
    {
      "ticker": "INVALID",
      "ok": false,
      "error": "Aucun cours trouvé"
    }
  ]
}
```

### Test 3 : Obtenir les taux des livrets

```bash
curl "http://localhost:3000/api/livret-rates"

# Réponse
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

### Test 4 : Convertir une devise

```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{ "amount": 100, "from": "EUR", "to": "USD" }'

# Réponse
{
  "amount": 107.5,
  "from": "EUR",
  "to": "USD",
  "rate": 1.075,
  "source": "yahoo"
}
```

### Test 5 : Vider le cache

```bash
curl -X POST http://localhost:3000/api/cache/clear

# Réponse
{
  "ok": true,
  "message": "Cache cleared"
}
```

---

## Intégration progressive

### Phase 1 : Backend ready ✅
- ✅ APIs implémentées
- ✅ Routes Express ajoutées
- ✅ Cache fonctionnel
- ✅ Tests passent

### Phase 2 : Frontend simple ⏳
- [ ] Bouton "Rafraîchir" sur le dashboard
- [ ] Afficher les prix + devises
- [ ] Afficher l'heure de mise à jour

### Phase 3 : UX améliorée
- [ ] Animer le chargement (spinner)
- [ ] Gérer les erreurs (afficher message)
- [ ] Pré-remplir les taux des livrets
- [ ] Timer "30 min avant prochain refresh"

### Phase 4 : Avancé
- [ ] Auto-refresh chaque 5 minutes?
- [ ] Historique des prix (graphiques)
- [ ] Alertes price change
- [ ] Convertir multi-devise

---

**Prêt à intégrer !** 🚀
