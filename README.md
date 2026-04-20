# Mes Investissements — Application locale

Première brique de votre application web pour gérer vos investissements.
Ici, on se concentre sur l'authentification : écran d'accueil, connexion
en deux étapes (code email ou clef d'accès de l'appareil de confiance),
et inscription.

L'application tourne **entièrement sur votre Mac** — rien n'est envoyé sur
Internet à part les codes de vérification par email (optionnel).

---

## 1. Prérequis (à faire une seule fois)

1. **Installer Node.js** si ce n'est pas déjà fait :
   - Allez sur https://nodejs.org
   - Téléchargez la version **LTS** → *macOS Installer (.pkg)*
   - Double-cliquez le fichier téléchargé, cliquez « Continuer » jusqu'à la fin.

2. **(Optionnel) Configurer l'envoi d'emails iCloud** — voir section 4.
   Ce n'est pas obligatoire pour commencer : par défaut, les codes de
   vérification s'affichent dans la fenêtre du terminal, ce qui suffit
   largement pour tester.

---

## 2. Lancer l'application

Depuis le Finder, **double-cliquez sur `start.command`** dans ce dossier.

- Au premier lancement, ça prend 2-3 minutes (installation des dépendances).
- Ensuite, une fenêtre de terminal s'ouvre avec ce message :

  ```
  Application démarrée : http://localhost:3000
  ```

- Ouvrez cette adresse dans **Safari, Chrome ou Firefox**.
- Pour arrêter le serveur : revenez au terminal et pressez `Ctrl + C`.

> Astuce : si macOS dit que `start.command` ne peut pas être ouvert,
> clic droit → *Ouvrir* → confirmer. À faire une seule fois.

---

## 3. Utilisation

1. **Créer un compte** depuis l'écran d'accueil → saisir email + mot de
   passe → un code à 6 chiffres est envoyé (ou affiché dans le terminal
   si l'email n'est pas encore configuré).
2. **Se connecter** : email + mot de passe → un nouveau code vous est envoyé.
3. Cochez « **Faire confiance à cet appareil** » pour que les prochaines
   connexions depuis ce Mac ne demandent plus de code — c'est la
   « clef d'accès » dont vous m'aviez parlé.
4. Pour révoquer la confiance d'un appareil : cliquez sur *Se déconnecter*
   dans l'application.

---

## 4. Envoyer vraiment les codes par email (iCloud)

Par défaut, les codes s'affichent dans le terminal. Pour les recevoir par
email via votre compte iCloud :

1. Assurez-vous que la **double authentification** est activée sur votre
   compte Apple.
2. Allez sur https://account.apple.com → **Connexion et sécurité** →
   **Mots de passe pour app** → **+ Générer un mot de passe**.
3. Donnez-lui un nom (ex. « App Investissements »). Apple vous affichera
   un mot de passe à 16 caractères du genre `abcd-efgh-ijkl-mnop`.
4. Ouvrez le fichier `.env` dans ce dossier (créé au premier lancement) :

   ```
   SMTP_USER=votre-adresse@icloud.com
   SMTP_PASS=abcd-efgh-ijkl-mnop
   MAIL_FROM=votre-adresse@icloud.com
   ```

5. Sauvegardez, puis relancez `start.command`. Le terminal affichera
   désormais `Envoi email : EMAIL RÉEL` au démarrage.

---

## 5. Où sont stockées mes données ?

Tout est dans ce dossier :

- `data/app.db` — base SQLite (utilisateurs, codes, appareils de confiance)
- `.env` — configuration (mot de passe iCloud)
- `node_modules/` — dépendances (régénérables avec `npm install`)

Faites une copie régulière de `data/app.db` pour sauvegarder vos comptes.

---

## 6. Structure du projet

```
investments-app/
├── server.js          # serveur + routes API (/login, /verify-code, etc.)
├── db.js              # base de données SQLite
├── mailer.js          # envoi d'emails
├── public/            # pages HTML + CSS
│   ├── index.html     # écran d'accueil (login)
│   ├── register.html  # création de compte
│   ├── verify.html    # saisie du code à 6 chiffres
│   ├── dashboard.html # tableau de bord (placeholder)
│   └── css/style.css
├── data/app.db        # base SQLite (créée au 1er lancement)
├── .env.example       # modèle de configuration
├── start.command      # lance l'app (double-clic)
└── package.json
```

---

## 7. Guide de développement — Synchronisation Git

> **Important** : Chaque fonctionnalité doit être développée dans une branche dédiée et tracée via le système de user stories.

### Workflow pour une nouvelle story

1. **Consulter Notion** : Prendre la story P1 avec le statut "À faire"
2. **Créer une branche** :
   ```bash
   git checkout -b feature/us-XX-description-courte
   ```
3. **Développer** : Faire les commits avec la convention :
   ```bash
   git commit -m "feat(module): description courte [US-XX]"
   ```
4. **Finaliser** : Merger vers main avec `--no-ff` pour garder l'historique :
   ```bash
   git merge --no-ff feature/us-XX-description-courte
   ```
5. **Mettre à jour Notion** : Passer le statut à "À tester"

### Convention de commits
- Format : `<type>(<module>): <description> [US-ID]`
- Types : feat, fix, refactor, style, test, docs, chore
- Modules : auth, admin, dashboard, instruments, immobilier, revenus, autres

**Exemples** :
- `feat(admin): ajouter écran de profile utilisateur [US-20]`
- `fix(immobilier): corriger calcul de rendement [US-14]`
- `docs: documenter API endpoints [US-20]`

Voir **CONTRIBUTING.md** pour la documentation complète.

---

## 8. Prochaines étapes (à construire)

- Saisie des comptes (banque, courtier, assurance-vie, crypto, etc.)
- Ajout des positions (titres, montants investis, valorisation)
- Historique et performance
- Tableau de bord avec graphiques
- Import/export CSV

On avancera **une étape à la fois**, à votre rythme.
