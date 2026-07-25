# Capacité Équipe — gestion des congés & absences sans serveur

> **L'interface de l'application (`index.html`) est entièrement en anglais**
> (tout le monde dans l'équipe ne parle pas français) — ce README reste en
> français pour vous, mais mentionne entre parenthèses le libellé anglais
> exact affiché à l'écran, ex. « Paramètres (**Settings**) ».

Application **monofichier** (`index.html`) de gestion de la capacité de plusieurs
équipes : congés payés, RTT, télétravail, arrêts maladie, absences imprévues,
formations, jours fériés **par lieu de travail**, soldes restants par personne,
ressources internes/externes avec cible de jours travaillés, date de fin de
contrat, et circuit de validation par des administrateurs.

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
   └── data/           ← le dossier de données (sera rempli automatiquement)
   ```
3. Double-cliquez sur `Lancer.cmd` (ou sur `index.html`).
4. Cliquez sur **« Choose the data folder »**, sélectionnez `data/`
   et autorisez l'accès en lecture/écriture quand Edge le demande.
5. L'assistant crée l'**organisation de base** définie dans `index.html`
   (constante `DEFAULT_ORG`) : les équipes Stability of production, Master
   Datahub Pricing, Master Datahub Atlas, Casa Datahub, 3MS & Pricing project
   et Transversal, leurs membres avec contrat et lieu, et les lieux
   Paris / Lisbonne (**Lisbon**) / Kuala Lumpur / Tunis avec leurs fériés sur
   deux ans. Saisissez votre nom : s'il correspond à une personne de
   l'organisation, elle devient votre compte **administrateur** (login
   Windows pré-rempli).
6. Dans **Paramètres (Settings)**, ajustez si besoin : logins Windows des
   membres (pour leur connexion automatique), profils, équipes, lieux
   supplémentaires (générateurs fournis : France, Portugal, Malaisie,
   Tunisie, Luxembourg, Québec/Montréal), droits CP/RTT, cibles de jours
   travaillés, date de fin de contrat.

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

Chaque membre peut, depuis **Mon espace (My space)** :
- poser une **demande de congé / RTT / congé sans solde** → « En attente »
  (**Pending**) jusqu'à validation par un administrateur ;
- déclarer **télétravail, arrêt maladie, absence imprévue ou formation
  (Training)** → enregistrés directement (faits constatés, pas de
  validation) ;
- suivre ses **soldes CP/RTT restants** (internes et externes, chacun avec
  ses propres défauts), ses demandes et le **calendrier équipe (Team
  calendar)** — avec la ligne « Disponibles » (**Available**, capacité par
  jour).

Les jours sont décomptés en **jours ouvrés selon le lieu de la personne** :
un 14 juillet est férié pour Paris mais ouvré pour Kuala Lumpur, et
inversement pour le Federal Territory Day.

### Regroupement par équipe, avec expand/collapse

Le **calendrier équipe** et **Équipes & soldes (Teams & balances)**
regroupent les personnes par équipe (bandeau coloré + nom + effectif).
Chaque bandeau porte un bouton **▼ / ▶** pour réduire (collapse) ou déplier
(expand) l'équipe correspondante — pratique pour se concentrer sur une
partie de l'organisation sans changer le filtre. L'état replié/déplié est
mémorisé pendant la session et partagé entre les deux écrans, mais n'affecte
jamais les totaux (ligne « Disponibles », soldes) qui restent calculés sur
tout le monde même équipe repliée.

### Affichage des personnes : trigramme d'équipe

Partout où une liste de personnes apparaît (listes déroulantes, écran de
connexion, calendrier équipe, capacity plan, affectations projet), le nom
est affiché sous la forme **`TRI-Prénom`** (trigramme de l'équipe, tiret,
prénom), trié alphabétiquement sur cette chaîne — donc groupé par équipe
puis par ordre alphabétique à l'intérieur. Le trigramme de chaque équipe se
définit et se modifie dans Paramètres → Équipes (une suggestion est
proposée automatiquement pour les équipes créées ensuite, mais reste
éditable). Trigrammes de l'organisation de base : SOP (Stability of
production), MDP (Master Datahub Pricing), MDA (Master Datahub Atlas), CDH
(Casa Datahub), 3MS (3MS & Pricing project), TRV (Transversal).

### Profils (cumulables)

Chaque personne peut cumuler plusieurs profils, gérés par les admins dans
Paramètres → Personnes (**Settings → People**) :

- **Standard** (implicite, tout le monde) : poser/annuler ses propres
  demandes, voir le calendrier d'équipe ;
- **Admin** : valider/refuser les demandes (onglet **Approvals**), saisir
  pour un tiers (le champ « Person » apparaît directement dans My space,
  avec un rappel, ainsi que dans Teams & balances), gérer personnes/équipes/
  lieux/fériés (onglets **Teams & balances** — regroupé par équipe,
  expand/collapse — et **Settings**), export CSV ;
- **Chef de projet (Project manager)** : onglets **Capacity plan** et
  **Projects**.

Un chef de projet non admin ne peut pas valider de congés ; un admin non
chef de projet ne voit pas le capacity plan. Dans l'organisation de base :
Admin = Jeremy, Jerome, Youssef ; Chef de projet = Jeremy, Jerome, Firas,
Samuel, Gwendoline.

Les **compétences** de l'organisation de base : Business Analyst (Saloua,
Nabila, Abibatou, Mustapha) ; Developer (Souha, Landry, Ali, Saleh, Marcin,
Ghaith, Radha, Farid, Soumaya, Chaima, Sarra, Olivier, Laurent, Béraud) ;
Support (Sambit, Vijay Kumar, Mohamed Ali, Samya) ; Project Manager (Firas,
Samuel, Gwendoline) ; Tech Lead (Youssef, Walid) ; Manager (Jeremy) ;
Product Owner (Jerome). Modifiables ensuite dans Paramètres → Personnes.

### Capacity plan (profil Chef de projet)

- **Histogramme** de la capacité restante par équipe, mois par mois, puis le
  détail chiffré en tableau ; en sélectionnant une équipe, détail par
  personne avec filtre par **compétence**.
- Capacité restante = jours ouvrés du mois selon le lieu de chacun −
  absences **validées** − affectations projets (% du mois). Les congés
  **en attente** apparaissent en orange (« −x ? ») mais n'impactent la
  capacité qu'une fois validés. Une valeur négative (rouge) = surcharge.
- Le télétravail n'est pas déduit (jours travaillés).
- **Simulation de congés restants** (case à cocher, activée par défaut),
  répartie uniformément sur les mois restants de l'année (annotation
  violette « ~x » sous la valeur, déjà déduite) — méthode différente selon
  le contrat :
  - **Interne** : le solde CP+RTT non encore posé.
  - **Externe** : pas de solde de référence à lisser directement — le calcul
    part de sa cible de jours travaillés (ex. 210/an) : jours ouvrés de
    l'année − cible − ce qu'il a déjà posé = combien de jours de congé il
    peut encore poser tout en tenant sa cible, réparti sur les mois restants.
  C'est une projection indicative pour anticiper la prise de congés à venir,
  pas une réservation réelle. Décocher la case revient aux seules absences
  actées.

### Projets & affectations (profil Chef de projet)

- Un projet peut viser **plusieurs cibles équipe/compétence** (bloc « Cibles
  équipe / compétence » de l'éditeur — en ajouter, en retirer ; laisser la
  compétence vide vise toute l'équipe). Il est créé avec une première cible,
  les suivantes s'ajoutent ensuite.
- Deux façons d'affecter des personnes, combinables :
  - **Affectation groupée** : on choisit UNE des cibles du projet, un % et
    une période, appliqués en un clic à toutes les personnes actives
    correspondantes ;
  - **Affectation individuelle** : par personne, par mois, en % du temps —
    une personne (notamment transverse) peut être répartie sur plusieurs
    projets et venir d'une équipe hors des cibles du projet. Modifiable
    après une affectation groupée pour ajuster cas par cas.
- Le **% restant non affecté** d'une personne reste disponible pour sa
  propre équipe (c'est exactement ce que montre le capacity plan : la
  capacité restante déduit uniquement ce qui est explicitement affecté).
- Un total d'affectations supérieur à 100 % (tous projets confondus) est
  signalé dans l'éditeur, et la capacité restante devient négative (rouge)
  dans le capacity plan — l'application avertit mais ne bloque pas la
  saisie, à vous de trancher. Décocher « Actif » suspend un projet sans
  perdre ses affectations.
- **Charge & délais** : pour chaque compétence du projet, indiquez la
  **charge restante** (en jours-personnes) et la **date de fin souhaitée**.
  L'application calcule, à partir des personnes déjà affectées sur ce
  projet (filtrées par cette compétence), la capacité planifiée d'ici cette
  date, le rythme mensuel requis pour tenir le délai, le rythme
  actuellement planifié, et un verdict (✅ Tenable / ⚠ Manque X j-p / Date
  dépassée) — de quoi projeter la capacité des mois à venir et vérifier que
  le délai est réaliste avant de s'engager.
- Stockage : un fichier JSON par projet (`projects/proj_*.json`), même
  logique anti-conflits que les demandes.

### Internes / externes

- **Interne** : par défaut **31 CP** et **14 RTT** par an, cible par défaut
  **206** jours travaillés/an.
- **Externe** : par défaut **28 CP** et **10 RTT** par an, cible par défaut
  **210** jours travaillés/an. Contrairement à une version précédente, les
  externes ont bien des soldes CP/RTT suivis comme les internes.
- Ces valeurs par défaut ne s'appliquent qu'à la création d'une personne
  (ou en changeant son contrat tant que les champs CP/RTT/cible sont restés
  à l'un des deux défauts) — modifiables ensuite librement dans Paramètres.
- La colonne « Projeté » (**Projected**) = jours ouvrés de l'année selon le
  lieu − absences validées ; elle passe en rouge sous la cible. La cible est
  modifiable par personne.

### Date de fin de contrat (End date)

Chaque personne peut recevoir, dans Paramètres → Personnes (**Settings →
People**, colonne **End date**), une date de fin de contrat/mission —
la date à laquelle elle quitte l'équipe. À partir de cette date :
- sa **capacité disponible tombe à zéro** automatiquement (calendrier,
  capacity plan, projets) — un mois à cheval sur la date de fin est
  proratisé (jours ouvrés jusqu'à cette date seulement) ;
- elle reste visible dans les écrans (historique, transparence) mais ses
  cellules du calendrier au-delà de sa date de fin sont grisées avec la
  mention « Left the team on JJ/MM/AAAA » ; un sous-libellé « Ends
  JJ/MM/AAAA » apparaît partout où sa fiche s'affiche.
- la simulation de congés restants (voir plus bas) s'arrête d'elle-même dès
  qu'elle n'a plus de capacité ce mois-là — pas de valeur négative
  artificielle.

Ce champ est indépendant de la case « Actif » : il ne masque pas la
personne, il fait juste disparaître sa capacité à la date prévue, sans
attendre que l'admin pense à la désactiver manuellement le jour J.

### Jours fériés — cas de Kuala Lumpur et Tunis

Les générateurs Malaisie et Tunisie ne produisent que les fériés **à date
fixe**. Les fêtes mobiles dépendent de calendriers lunaires et d'annonces
officielles et sont à ajouter manuellement chaque année dans
Paramètres → Lieux & jours fériés (l'application le rappelle à l'écran) :
- **Kuala Lumpur** : Nouvel An chinois (2 j), Thaipusam, Hari Raya
  Aidilfitri (2 j), Wesak, Hari Raya Haji, Awal Muharram, Maulidur Rasul,
  Deepavali ;
- **Tunis** : Aïd el-Fitr (2 j), Aïd el-Idha (2 j), Ras el Am hégirien,
  Mouled.

Pour le Québec, le Vendredi saint est généré ; certains employeurs chôment
le lundi de Pâques à la place — ajustez si besoin.

## 4. Comment les données sont stockées

```
data/
├── config.json          ← équipes, lieux, personnes, rôles, fériés
├── requests/
│   ├── req_xxx.json     ← une demande/absence = un fichier
│   └── ...
└── projects/
    ├── proj_xxx.json    ← un projet (cibles, affectations, charges) = un fichier
    └── ...
```

Le choix « un fichier par demande/projet » est volontaire : OneDrive
synchronise des fichiers entiers, donc deux personnes qui saisissent en même
temps modifient des fichiers **différents** et il n'y a pas d'écrasement
mutuel. Seul `config.json` est partagé, modifié rarement et uniquement par
les admins.

Les données se rafraîchissent quand la fenêtre reprend le focus ; le bouton
**⟳ Refresh** force la relecture. Les données créées avec les versions
précédentes (mono-équipe, ancien format de projet, etc.) sont migrées
automatiquement à l'ouverture.

**Sauvegarde** : copiez périodiquement le dossier `data/` (OneDrive
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
  Kuala Lumpur, Tunis, Luxembourg et Montréal).

## 6. Si un jour vous avez accès à Microsoft 365 « complet »

Puisque vous utilisez OneDrive, vous avez probablement des licences
Microsoft 365. Une alternative **sans fichier à gérer** existe alors dans vos
licences : **listes SharePoint + Power Automate** (approbations natives) ou
**Power Apps**, avec de vrais droits appliqués côté serveur et la vraie
identité Microsoft de chacun. Cette application-fichier reste la solution la
plus simple si ces outils sont bloqués ou si vous voulez zéro dépendance.
