# Évolutions v2 — Sécurité, fiscalité, projections, abonnements, opportunités

Cette itération reprend la base de l'application, la **sécurise**, et livre
quatre évolutions majeures orientées « gestion de patrimoine du particulier ».
Toutes les données restent stockées **en local** (SQLite dans `data/`) —
seules les cotations, historiques de cours et actualités sont récupérées sur
Internet (Yahoo Finance, sans clé API).

---

## 1. Sécurisation de la base (`security.js`)

| Mesure | Détail |
|---|---|
| En-têtes de sécurité | CSP stricte (aucun domaine externe, Chart.js désormais servi en local), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS en production |
| Anti brute-force | Rate-limiting en mémoire sur `/api/login`, `/api/register` (20 req / 15 min) et `/api/verify-code`, `/api/resend-code` (10 req / 15 min) |
| Codes de vérification | Maximum **5 essais** par code ; au-delà, les codes en cours sont invalidés et la connexion doit être reprise à zéro |
| CSRF | Vérification de l'en-tête `Origin` sur toutes les requêtes mutantes de `/api` (en plus de `SameSite=Lax`) |
| Sessions | Secret de session **persisté** dans `data/.session-secret` (mode 600, ignoré par git) — les sessions survivent aux redémarrages sans variable d'environnement |
| Divers | `x-powered-by` désactivé, cookies `secure` en production, limite de taille du corps JSON (3 Mo), route `/admin` dupliquée supprimée |

## 2. Frais & fiscalité des placements (`investment-tax.js`)

Chaque placement porte désormais ses **frais d'entrée, de gestion et de
sortie** (% modifiables dans la modale, section « Frais & ancienneté ») et son
**année d'ouverture** (ancienneté fiscale).

Fiscalité appliquée à la sortie, par enveloppe :

- **Livrets réglementés** : exonérés.
- **CTO, livret bancaire, crypto, épargne** : PFU 30 % sur les gains.
- **PEA** : PFU 30 % avant 5 ans, puis 17,2 % de PS seulement.
- **Assurance-vie** : PFU 30 % avant 8 ans ; après, abattement 4 600 € / 9 200 €
  (couple) puis 7,5 % + 17,2 %.
- **PER** : TMI + 17,2 % sur les gains (sortie en capital).

La TMI utilisée est **celle calculée depuis votre foyer fiscal** (module Revenus).

## 3. Projection patrimoniale (vue « 📈 Projection »)

Simulation année par année (horizon 5 à 30 ans) de tout le patrimoine :

- placements simples : taux saisi, versements/retraits mensuels, frais ;
- **portefeuilles (PEA, CTO, AV UC, PER, crypto)** : taux extrapolé depuis la
  **performance annualisée des 3 dernières années** de chaque position
  (Yahoo Finance, borné à −5 % / +12 % par prudence), pondérée par la valeur ;
- immobilier : revalorisation paramétrable (+1 %/an par défaut) + cumul des
  cashflows nets d'impôt ;
- résultats **nets de frais et de fiscalité de sortie**, avec le détail
  impôts / frais par placement.

Sur chaque position avec ticker, le bouton **📊** affiche la performance
3 ans (CAGR, volatilité, courbe) et les **dernières actualités** de la société.

## 4. Abonnements & dépenses récurrentes (vue « 🧾 Abonnements »)

- Import d'un **relevé bancaire CSV** (export de votre banque) : les débits
  récurrents (mensuels, trimestriels, annuels) sont détectés automatiquement
  (libellé normalisé, montant stable ±20 %, espacement régulier).
- **Confidentialité** : le relevé est analysé en mémoire par le serveur local
  et n'est **jamais stocké** ; seuls les abonnements confirmés sont conservés.
- Catégorisation automatique (streaming, télécom, énergie, assurance…),
  coût mensuel/annuel, graphique de répartition.
- Marquez un abonnement « dispensable » → l'**économie potentielle annuelle**
  est calculée automatiquement.

## 5. Opportunités immobilières (vue « 🔎 Opportunités »)

Collez le lien d'une annonce (Leboncoin, PAP, SeLoger…), saisissez prix et
loyer (réel si déjà loué), le simulateur calcule :

- **frais de notaire** (ancien ≈ 7,5 % / neuf ≈ 2,5 %), travaux, coût total ;
- **financement** : par défaut le prêt est pris sur la **durée la plus longue
  possible** — 25 ans plafonnés par la règle « fin de prêt à 70 ans maximum »
  (l'âge est pré-rempli depuis l'année de naissance du foyer fiscal) ;
- **fiscalité des loyers** (micro-foncier, réel, micro-BIC/LMNP, réel BIC)
  avec votre TMI réelle + prélèvements sociaux ;
- rendements **brut / net / net-net**, cashflow mensuel après impôt ;
- projection : valeur du bien vs capital restant dû, enrichissement net cumulé.

Les opportunités se sauvegardent pour comparaison (lien vers l'annonce inclus).

> Note : la récupération automatique des annonces depuis Leboncoin/PAP n'est
> pas réalisable proprement (protection anti-robots de ces sites) ; la saisie
> reste manuelle avec le lien conservé.

---

## Fichiers ajoutés / modifiés

| Fichier | Rôle |
|---|---|
| `security.js` | En-têtes, rate-limiting, garde CSRF, secret persistant |
| `investment-tax.js` | Fiscalité de sortie par enveloppe + frais par défaut |
| `projection.js` | Moteur de projection comptes + biens |
| `api-providers/history.js` | Historique 3 ans (CAGR, volatilité) + actualités |
| `subscriptions.js` | Parsing CSV bancaire + détection de récurrences |
| `real-estate.js` | Simulateur d'opportunité locative (prêt, notaire, fiscalité) |
| `routes-v2.js` | Routes API des évolutions |
| `public/js/features.js` | Frontend des nouvelles vues |
| `public/js/vendor/chart.umd.min.js` | Chart.js servi en local (plus de CDN) |
| `db.js` | Tables `subscriptions`, `property_opportunities` + colonnes frais/année |

## Nouvelles routes API

```
GET  /api/projection?years=20&immoRate=1     Projection globale
GET  /api/positions/:id/insights             Perf 3 ans d'une position
GET  /api/positions/:id/news                 Actualités de la société
POST /api/subscriptions/analyze              Analyse d'un relevé CSV (sans stockage)
CRUD /api/subscriptions                      Abonnements suivis
POST /api/opportunities/simulate             Simulation d'une annonce
GET  /api/opportunities/loan-defaults        Âge + durée max d'emprunt
CRUD /api/opportunities                      Opportunités sauvegardées
```

## 6. Interface iPhone (`/mobile`)

Interface mobile dédiée, consommant **exactement les mêmes API** :

- design iOS natif : tab bar en bas (Accueil, Patrimoine, Projection, Immo,
  Abos), safe areas (encoche), mode sombre automatique, police système ;
- **PWA installable** : depuis Safari → Partager → « Sur l'écran d'accueil »,
  l'app s'ouvre en plein écran avec sa propre icône ;
- Accueil : patrimoine total, cashflows, graphiques de répartition ;
- Patrimoine : comptes et biens dépliables, actualisation des cours ;
- Projection : horizons 5/10/20/30 ans, courbe et détail par placement ;
- Opportunités : le simulateur complet — le cas d'usage mobile par excellence,
  devant une annonce Leboncoin ;
- Abonnements : totaux, import CSV, interrupteur « essentiel ».

Après connexion, les écrans ≤ 820 px sont automatiquement dirigés vers
`/mobile` (les autres vers `/dashboard`). La saisie détaillée des placements
reste sur la version ordinateur.

## Cap vers l'application iPhone / iPad

L'architecture reste 100 % locale (serveur Node + SQLite + frontend web),
ce qui prépare la suite : le frontend étant découplé de l'API, une future
app iOS (SwiftUI ou capacitor/WebView) pourra consommer les mêmes routes,
avec les données stockées sur l'appareil.
