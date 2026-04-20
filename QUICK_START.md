# 🚀 Quick Start — En 5 minutes

## Copie depuis ton dossier de travail vers ta machine

```bash
# Sur ta machine macOS, depuis le dossier où tu veux le projet:
cp -r /path/to/investments-app ./investments-app
cd investments-app
```

---

## Prépare l'environnement (1 min)

```bash
# Vérifie les versions
node --version    # Doit être 16+
npm --version     # Doit être 8+

# Installe les dépendances
npm install

# Si meilleure-sqlite3 te pose problème:
npm rebuild better-sqlite3
```

---

## Démarre le serveur (30 sec)

```bash
npm start
```

**Tu dois voir** :
```
📊 Serveur lancé sur http://localhost:3000
✅ Dashboard prêt
✅ API financière active
```

---

## Teste en 4 clics (3 min)

### Test 1 : Page de test indépendante
1. Ouvre: `http://localhost:3000/js/quick-test.html`
2. Clique le premier bouton: "Récupérer le cours"
3. Dois voir les données de Apple s'afficher
4. ✅ Si ça marche, l'API fonctionne

### Test 2 : Dashboard avec API
1. Va à: `http://localhost:3000/dashboard`
2. Logue-toi si nécessaire
3. Scroll jusqu'à "Financier"
4. Tu dois voir un bouton bleu: **🔄 Rafraîchir les prix**
5. Clique-le
6. ✅ Les prix doivent se mettre à jour avec notification

### Test 3 : Ajouter une position
1. Dans Financier, clique "Ajouter une position"
2. Entre "AAPL" dans le champ Ticker
3. Clique le bouton **🔍 Récupérer le prix**
4. ✅ Les champs doivent se pré-remplir

### Test 4 : Livrets
1. Dans Financier, clique "Ajouter un livret"
2. Sélectionne "Livret A"
3. ✅ Le champ "Taux annuel" doit afficher 3.00

---

## Aide-mémoire

| Problème | Solution |
|----------|----------|
| Port 3000 déjà utilisé | `lsof -i :3000` puis tuer le processus |
| Better-sqlite3 error | `npm rebuild better-sqlite3` |
| Boutons n'apparaissent pas | F12 → Console → cherche erreurs |
| API 404 | Vérifie que `/api/quote/AAPL` répond |
| Pas d'authentification | Crée un compte d'abord |

---

## Logs importants

### À chercher dans npm start output:
```
✅ Serveur lancé              → Bon démarrage
✅ Database initialisée       → DB prête
❌ Port déjà utilisé          → Problème
❌ Invalid ELF header         → Rebuild better-sqlite3
```

### À chercher en F12 Console:
```
✅ API Client chargé          → api-client.js chargé
✅ Intégration APIs initialisée → api-integration.js chargé
❌ Failed to load script      → Fichier manquant
❌ Unauthorized 401           → Pas logué
```

---

## Prochaines étapes

Si tout fonctionne ✅ :
- **Explore** : Ajoute des positions, essaye différents tickers, rafraîchis
- **Enjoy** : C'est une vraie application qui fonctionne!

Si quelque chose casse ❌ :
- Regarde la console (F12)
- Envoie-moi l'erreur exacte
- Je vais corriger

---

**Ça devrait prendre 5-10 minutes max.**
**Bon test! 🎉**
