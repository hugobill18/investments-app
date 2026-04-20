# Documentation des Git Hooks

## Vue d'ensemble

Les git hooks permettent d'automatiser et de valider les commits selon une convention définie.

### Hooks implémentés

#### 1. `prepare-commit-msg`
**Localisation** : `.git/hooks/prepare-commit-msg`

**Rôle** : Enrichit automatiquement le message de commit avec l'ID de la story

**Fonctionnement** :
- Détecte si on est sur une branche `feature/us-XX-*`
- Extrait l'ID (ex. US-20 depuis feature/us-20-*)
- Ajoute automatiquement `[US-XX]` à la fin du message si absent
- Ne s'applique pas aux merges

**Exemple d'utilisation** :
```bash
# Sur la branche feature/us-20-git-workflow
git commit -m "chore(admin): configurer workflow Git"

# Résultat automatique :
# chore(admin): configurer workflow Git [US-20]
```

**Code** : Voir `.git/hooks/prepare-commit-msg`

#### 2. `commit-msg`
**Localisation** : `.git/hooks/commit-msg`

**Rôle** : Valide que le format du commit respecte la convention

**Fonctionnement** :
- Vérifie le format : `<type>(<module>): <description> [US-XX]`
- Refuse les commits qui ne respectent pas le format
- Accepte les merges automatiques sans validation
- Affiche un message d'erreur clair en cas de violation

**Validation stricte** :
- ✅ Type dans : feat, fix, refactor, style, test, docs, chore
- ✅ Module dans : auth, admin, dashboard, instruments, immobilier, revenus, autres
- ✅ Format exact : `<type>(<module>): message [US-XX]`

**Exemple d'erreur** :
```
❌ Format de commit invalide!

Format attendu : <type>(<module>): <description> [US-XX]

Types autorisés : feat, fix, refactor, style, test, docs, chore

Exemple valide : feat(admin): ajouter écran de profile [US-20]

Message entré : fix: bug incorrect
```

**Code** : Voir `.git/hooks/commit-msg`

## Installation et configuration

Les hooks sont déjà en place dans `.git/hooks/`. Ils s'activent automatiquement pour tous les commits.

### Tester les hooks

#### Test 1 : Auto-ajout de [US-XX]

```bash
# Créer une branche feature
git checkout -b feature/us-99-test

# Faire un commit SANS [US-99]
git commit -m "feat(autres): test du hook"

# ✅ Le hook ajoute [US-99] automatiquement
# Résultat : "feat(autres): test du hook [US-99]"
```

#### Test 2 : Validation du format

```bash
# Créer une branche feature
git checkout -b feature/us-99-test2

# Tenter un commit avec mauvais format
git commit -m "fix: test du hook invalide"

# ❌ Le hook rejette le commit
# Message d'erreur : Format de commit invalide!
# Solution : Suivre le format attendu
```

## Maintenance des hooks

### Permissions
Les hooks doivent avoir les permissions d'exécution (`755`). Vérifiez avec :
```bash
ls -la .git/hooks/prepare-commit-msg
# Doit afficher : -rwxr-xr-x
```

Si besoin de corriger :
```bash
chmod +x .git/hooks/prepare-commit-msg
chmod +x .git/hooks/commit-msg
```

### Désactiver un hook (temporairement)
```bash
# Désactiver le hook commit-msg
chmod -x .git/hooks/commit-msg

# Réactiver
chmod +x .git/hooks/commit-msg

# Ou utiliser --no-verify (à éviter sauf urgence)
git commit --no-verify -m "Message sans validation"
```

### Dépannage

**Problème** : "Hook rejette tous mes commits"
- **Solution** : Vérifier le format : `<type>(<module>): message [US-XX]`
- **Type valide ?** : feat, fix, refactor, style, test, docs, chore
- **Module valide ?** : auth, admin, dashboard, instruments, immobilier, revenus, autres
- **Format [US-XX]** : Inclure avec deux-points et tirets

**Problème** : "Le hook ne fait rien"
- **Solution** : Vérifier que vous êtes sur `feature/us-*`
- **Branche correcte ?** : `git branch` doit montrer `feature/us-XX-*`
- **Permissions OK ?** : `chmod +x .git/hooks/prepare-commit-msg`

**Problème** : "Merge commit rejeté"
- **Solution** : Les merges ne sont pas validés par `commit-msg`
- Si le rejet est une erreur, vérifier que le message de merge suit le format

## Customisation des hooks

Pour modifier les hooks, éditez directement :
- `.git/hooks/prepare-commit-msg`
- `.git/hooks/commit-msg`

Les modifications s'appliqueront immédiatement au prochain commit.

### Ajouter de nouveaux hooks

Pour ajouter d'autres validations (ex. linting, tests), créez des fichiers dans `.git/hooks/` :

```bash
# Exemple : pre-commit hook pour linter
nano .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Hooks disponibles** :
- `pre-commit` : Avant le commit
- `commit-msg` : Validation du message (déjà utilisé)
- `post-commit` : Après le commit
- `pre-push` : Avant un push

## Intégration CI/CD

Ces hooks garantissent que tous les commits respectent la convention. Un système CI/CD peut :

1. Récupérer tous les commits avec un ID de story : `git log --grep="\[US-"`
2. Valider que chaque commit a un ID unique
3. Générer des rapports de couverture par story
4. Créer automatiquement des commentaires Notion

## Bonnes pratiques

✅ **À faire** :
- Utiliser le format exact : `<type>(<module>): message [US-XX]`
- Créer une branche `feature/us-XX-*` pour chaque story
- Un commit = une tâche logique
- Push régulièrement pour ne pas perdre le travail

❌ **À éviter** :
- Utiliser `--no-verify` (sauf vraie urgence)
- Committer sur `main` directement
- Changer de branche sans terminer la story
- Faire des commits géants (= merging impossible)

## Voir aussi

- `CONTRIBUTING.md` : Guide complet du workflow
- `README.md` : Section "Guide de développement"
- `GIT_WORKFLOW_EXAMPLE.md` : Exemple concret d'utilisation
- `scripts/git-workflow.sh` : Script utilitaire
