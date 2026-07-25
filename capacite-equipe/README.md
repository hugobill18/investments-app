# Capacité Équipe — gestion des congés & absences sans serveur

Application **monofichier** (`index.html`) de gestion de la capacité d'équipe :
congés payés, RTT, télétravail, arrêts maladie, absences imprévues, jours fériés,
soldes restants par personne et circuit de validation par des administrateurs.

Elle a été conçue pour une contrainte précise : **aucun hébergement, aucune
installation** sur les postes. Elle fonctionne intégralement dans le navigateur
(Microsoft Edge ou Chrome, déjà présents sur les PC Windows d'entreprise) et
stocke ses données dans un **dossier OneDrive/SharePoint partagé** synchronisé
sur chaque poste.

---

## 1. Mise en place (une seule fois, par le responsable)

1. Créez un dossier partagé accessible à toute l'équipe, par exemple :
   - un dossier d'une bibliothèque **SharePoint / Teams** synchronisée sur les postes, ou
   - un dossier **OneDrive** partagé avec l'équipe (chacun clique sur
     « Ajouter un raccourci à mes fichiers » puis le synchronise).
2. Déposez-y le fichier `index.html` et créez à côté un sous-dossier vide,
   par exemple :
   ```
   Capacité Équipe/
   ├── index.html      ← l'application
   └── donnees/        ← le dossier de données (sera rempli automatiquement)
   ```
3. Double-cliquez sur `index.html` (il s'ouvre dans Edge).
4. Cliquez sur **« Choisir le dossier de données »**, sélectionnez `donnees/`
   et autorisez l'accès en lecture/écriture quand Edge le demande.
5. L'assistant de première utilisation crée votre compte **administrateur**
   et génère les jours fériés français de l'année en cours et de la suivante.
6. Dans **Paramètres**, ajoutez les membres de l'équipe, ajustez leurs droits
   à congés (CP/RTT) et promouvez d'autres administrateurs si besoin.

## 2. Utilisation par chaque membre de l'équipe

1. Ouvrir `index.html` depuis le dossier partagé (un raccourci sur le bureau
   pointant vers le fichier synchronisé fonctionne très bien).
2. Choisir le dossier `donnees/` la première fois (mémorisé ensuite —
   au relancement, un seul clic « Reconnecter le dossier » suffit).
3. Sélectionner son nom dans la liste.

Chacun peut alors :
- poser une **demande de congé / RTT / congé sans solde** → statut « En attente »
  jusqu'à validation par un administrateur ;
- déclarer **télétravail, arrêt maladie ou absence imprévue** → enregistrés
  directement (pas de validation, ce sont des faits constatés) ;
- suivre ses **soldes restants** (CP, RTT), ses demandes et le
  **calendrier d'équipe** avec la ligne « Disponibles » (capacité par jour).

Les **administrateurs** disposent en plus des onglets :
- **Validation** : valider/refuser les demandes en attente (avec motif) ;
- **Équipe & soldes** : vue des soldes de tous, saisie d'une absence pour un
  tiers (auto-validée), export CSV de toutes les demandes ;
- **Paramètres** : gestion des personnes, rôles, droits à congés, jours fériés
  (génération automatique des fériés français, ajout de ponts).

## 3. Comment les données sont stockées

```
donnees/
├── config.json          ← personnes, rôles, droits CP/RTT, jours fériés
└── requests/
    ├── req_xxx.json     ← une demande/absence = un fichier
    └── ...
```

Le choix « un fichier par demande » est volontaire : OneDrive synchronise des
fichiers entiers, donc deux personnes qui saisissent en même temps modifient
des fichiers **différents** et il n'y a pas d'écrasement mutuel. Seul
`config.json` est partagé, et il n'est modifié que par les administrateurs,
rarement.

Les données se rafraîchissent automatiquement quand la fenêtre reprend le
focus ; le bouton **⟳ Rafraîchir** force la relecture.

**Sauvegarde** : copiez périodiquement le dossier `donnees/` (OneDrive
conserve aussi un historique de versions des fichiers).

## 4. Limites à connaître (importantes)

- **Ce n'est pas un système sécurisé.** L'identification est déclarative
  (on choisit son nom, pas de mot de passe) et les rôles ne sont appliqués
  que par l'interface : toute personne ayant accès au dossier partagé peut,
  techniquement, ouvrir ou modifier les fichiers JSON à la main. C'est un
  outil de **confiance d'équipe**, adapté à un petit collectif, pas un outil
  RH opposable. Ne pas y mettre de données médicales sensibles (motif d'un
  arrêt maladie par exemple).
- **Synchronisation OneDrive** : un poste hors-ligne verra des données
  datées jusqu'à la resynchronisation. Les conflits sont très improbables
  grâce au fichier-par-demande, mais pas impossibles sur `config.json` si
  deux admins modifient les paramètres au même moment.
- **Navigateur requis** : Edge ou Chrome (l'API *File System Access* n'existe
  pas dans Firefox). Edge est présent sur tous les Windows récents.
- Le décompte des jours est en **jours ouvrés** (hors week-ends et fériés),
  avec gestion des demi-journées pour une absence d'un jour.

## 5. Si un jour vous avez accès à Microsoft 365 « complet »

Puisque vous utilisez OneDrive, vous avez probablement des licences
Microsoft 365. Dans ce cas, une alternative **sans aucun fichier à gérer**
existe déjà dans vos licences : **listes SharePoint + Power Automate**
(circuit d'approbation natif) ou **Power Apps**. C'est plus robuste en
matière de droits (les rôles y sont réellement appliqués côté serveur).
Cette application-fichier reste la solution la plus simple si ces outils
sont bloqués ou si vous voulez zéro dépendance.
