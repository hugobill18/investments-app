# Capacité Équipe — gestion des congés & absences sans serveur

Application **monofichier** (`index.html`) de gestion de la capacité de plusieurs
équipes : congés payés, RTT, télétravail, arrêts maladie, absences imprévues,
jours fériés **par lieu de travail**, soldes restants par personne, ressources
internes/externes avec cible de jours travaillés, et circuit de validation par
des administrateurs.

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
2. Déposez-y `index.html` **et** `Lancer.cmd`, et créez un sous-dossier vide :
   ```
   Capacité Équipe/
   ├── index.html      ← l'application
   ├── Lancer.cmd      ← lanceur (transmet le login Windows)
   └── donnees/        ← le dossier de données (sera rempli automatiquement)
   ```
3. Double-cliquez sur `Lancer.cmd` (ou sur `index.html`).
4. Cliquez sur **« Choisir le dossier de données »**, sélectionnez `donnees/`
   et autorisez l'accès en lecture/écriture quand Edge le demande.
5. L'assistant crée votre compte **administrateur** (votre login Windows est
   pré-rempli), une équipe par défaut et le lieu « Paris » avec les fériés
   français de l'année en cours et de la suivante.
6. Dans **Paramètres** :
   - créez vos **équipes** ;
   - créez vos **lieux** (Lisbonne, Kuala Lumpur… — générateurs de fériés
     fournis pour France, Portugal, Malaisie, Luxembourg, Québec/Montréal) ;
   - ajoutez les **personnes** et renseignez pour chacune : login Windows,
     rôle, équipe, lieu, contrat interne/externe, droits CP/RTT, cible de
     jours travaillés.

## 2. Connexion automatique par login Windows

Un site web local n'a pas le droit de lire le nom d'utilisateur Windows :
c'est le rôle de **`Lancer.cmd`**, qui ouvre l'application en lui transmettant
`%USERNAME%`. L'application rapproche ce login du champ « Login Windows » de
chaque personne (casse ignorée) et connecte l'utilisateur automatiquement.

- Chaque membre lance donc l'application via `Lancer.cmd` (un raccourci vers
  ce fichier sur le bureau est idéal).
- Si le login n'est associé à personne, l'écran de choix manuel s'affiche et
  indique le login détecté, pour que l'admin puisse faire l'association.
- Ouvrir `index.html` directement fonctionne aussi (choix manuel du nom).

## 3. Fonctionnement au quotidien

Chaque membre peut :
- poser une **demande de congé / RTT / congé sans solde** → « En attente »
  jusqu'à validation par un administrateur ;
- déclarer **télétravail, arrêt maladie ou absence imprévue** → enregistrés
  directement (faits constatés, pas de validation) ;
- suivre ses **soldes** (internes : CP/RTT restants ; externes : jours
  travaillés projetés vs cible), ses demandes et le **calendrier équipe**
  (filtrable par équipe) avec la ligne « Disponibles » (capacité par jour).

Les jours sont décomptés en **jours ouvrés selon le lieu de la personne** :
un 14 juillet est férié pour Paris mais ouvré pour Kuala Lumpur, et
inversement pour le Federal Territory Day.

Les **administrateurs** ont en plus :
- **Validation** : valider/refuser les demandes (avec motif) ;
- **Équipes & soldes** : soldes et capacité de tous (filtre par équipe),
  saisie d'une absence pour un tiers (auto-validée), export CSV ;
- **Paramètres** : personnes (login Windows, rôle, équipe, lieu, contrat,
  droits, cible), équipes, lieux et jours fériés.

### Internes / externes

- **Interne** : droits CP et RTT décomptés, cible par défaut **206** jours
  travaillés/an.
- **Externe** : pas de solde CP/RTT (non applicable), cible par défaut
  **210** jours travaillés/an.
- La colonne « Projeté » = jours ouvrés de l'année selon le lieu − absences
  validées ; elle passe en rouge sous la cible. La cible est modifiable par
  personne.

### Jours fériés — cas particulier de Kuala Lumpur

Le générateur Malaisie ne produit que les fériés **à date fixe** (les fêtes
mobiles — Nouvel An chinois, Thaipusam, Hari Raya Aidilfitri, Wesak, Hari
Raya Haji, Awal Muharram, Maulidur Rasul, Deepavali — dépendent de calendriers
lunaires et d'annonces officielles). Ajoutez-les manuellement chaque année
dans Paramètres → Lieux & jours fériés (l'application le rappelle à l'écran).
Pour le Québec, le Vendredi saint est généré ; certains employeurs chôment
le lundi de Pâques à la place — ajustez si besoin.

## 4. Comment les données sont stockées

```
donnees/
├── config.json          ← équipes, lieux, personnes, rôles, fériés
└── requests/
    ├── req_xxx.json     ← une demande/absence = un fichier
    └── ...
```

Le choix « un fichier par demande » est volontaire : OneDrive synchronise des
fichiers entiers, donc deux personnes qui saisissent en même temps modifient
des fichiers **différents** et il n'y a pas d'écrasement mutuel. Seul
`config.json` est partagé, modifié rarement et uniquement par les admins.

Les données se rafraîchissent quand la fenêtre reprend le focus ; le bouton
**⟳ Rafraîchir** force la relecture. Les données créées avec la première
version (mono-équipe) sont migrées automatiquement.

**Sauvegarde** : copiez périodiquement le dossier `donnees/` (OneDrive
conserve aussi un historique de versions des fichiers).

## 5. Limites à connaître (importantes)

- **Ce n'est pas un système sécurisé.** La connexion par login Windows est
  pratique mais reste déclarative (un utilisateur avancé peut ouvrir l'URL
  avec un autre login), et les rôles ne sont appliqués que par l'interface :
  toute personne ayant accès au dossier partagé peut, techniquement, modifier
  les fichiers JSON à la main. C'est un outil de **confiance d'équipe**, pas
  un outil RH opposable. N'y mettez pas de données médicales sensibles
  (motif d'un arrêt maladie par exemple).
- **Synchronisation OneDrive** : un poste hors-ligne verra des données datées
  jusqu'à la resynchronisation. Les conflits sont très improbables grâce au
  fichier-par-demande, mais pas impossibles sur `config.json` si deux admins
  modifient les paramètres au même moment.
- **Navigateur requis** : Edge ou Chrome (l'API *File System Access* n'existe
  pas dans Firefox). Edge est présent sur tous les Windows récents.
- Le décompte suppose un week-end samedi/dimanche (vrai pour Paris, Lisbonne,
  Kuala Lumpur, Luxembourg et Montréal).

## 6. Si un jour vous avez accès à Microsoft 365 « complet »

Puisque vous utilisez OneDrive, vous avez probablement des licences
Microsoft 365. Une alternative **sans fichier à gérer** existe alors dans vos
licences : **listes SharePoint + Power Automate** (approbations natives) ou
**Power Apps**, avec de vrais droits appliqués côté serveur et la vraie
identité Microsoft de chacun. Cette application-fichier reste la solution la
plus simple si ces outils sont bloqués ou si vous voulez zéro dépendance.
