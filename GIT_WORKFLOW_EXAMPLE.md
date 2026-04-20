# Exemple de Workflow Git — Story US-20

## Contexte
La story **US-20** "Enregistrer les différentes modifications sur GIT" demande de configurer un système de suivi Git cohérent.

## Implémentation effectuée

### 1. Configuration de la convention de commits

**Format standardisé** :
```
<type>(<module>): <description> [US-ID]
```

**Types autorisés** :
- `feat` — nouvelle fonctionnalité
- `fix` — correctif de bug
- `refactor` — refactorisation
- `style` — formatage
- `test` — tests
- `docs` — documentation
- `chore` — build, dépendances

**Modules** : auth, admin, dashboard, instruments, immobilier, revenus, autres

### 2. Fichiers créés/modifiés

#### CONTRIBUTING.md
Documentation complète du workflow :
- Convention de branches : `feature/us-XX-description`
- Convention de commits : `<type>(<module>): <desc> [US-XX]`
- Checklist avant de terminer une story
- Comment tracer une story à Git

#### .git/hooks/prepare-commit-msg
Hook Git qui :
- Détecte les branches feature/us-XX
- Ajoute automatiquement [US-XX] aux commits
- Fonctionne uniquement pour les branches feature

Exemple : 
```bash
# Sur la branche feature/us-20-git-workflow
git commit -m "feat(admin): configurer hooks"
# Résultat automatique : "feat(admin): configurer hooks [US-20]"
```

#### .git/hooks/commit-msg
Hook Git qui valide le format des commits :
- Refuse les commits qui ne respectent pas `<type>(<module>): <desc> [US-XX]`
- Accepte les merges sans validation
- Affiche un message d'erreur explicite

Exemple d'erreur :
```
❌ Format de commit invalide!

Format attendu : <type>(<module>): <description> [US-XX]

Types autorisés : feat, fix, refactor, style, test, docs, chore

Modules disponibles : auth, admin, dashboard, instruments, immobilier, revenus, autres

Exemple valide : feat(admin): ajouter écran de profile [US-20]

Message entré : fix: bug incorrect
```

#### scripts/git-workflow.sh
Script utilitaire avec commandes :

```bash
# Créer une branche feature
./scripts/git-workflow.sh create US-20 "git-workflow"
# → Crée et bascule vers feature/us-20-git-workflow

# Finaliser la branche (merge avec --no-ff)
./scripts/git-workflow.sh finish
# → Merge feature/us-20-git-workflow vers main

# Lister les stories
./scripts/git-workflow.sh list
# → Affiche les 20 derniers commits avec [US-XX]

# Chercher une story
./scripts/git-workflow.sh search US-20
# → Montre tous les commits [US-20] et les branches concernées
```

#### README.md
Ajout d'une section "Guide de développement" :
- Workflow pour une nouvelle story
- Convention de commits
- Lien vers CONTRIBUTING.md

### 3. Traçabilité complète

Chaque story peut être entièrement tracée via Git :

```bash
# Voir tous les commits d'une story
git log --grep="\[US-20\]"

# Voir le diff complet d'une story
git diff main...feature/us-20-git-workflow

# Voir les branches associées
git branch | grep us-20

# Voir l'historique de merge
git log --oneline --graph --all | grep -A5 -B5 "Merge.*us-20"
```

## Utilisation dans le futur

### Workflow standard pour chaque story

1. **Commencer la story** (depuis Notion)
   - Note l'ID : ex. US-20
   - Passe le statut à "En cours"

2. **Créer la branche**
   ```bash
   ./scripts/git-workflow.sh create US-20 "git-workflow"
   ```

3. **Développer** avec des commits réguliers
   ```bash
   git commit -m "chore(admin): documenter convention [US-20]"
   # Le hook ajoute [US-20] automatiquement si absent
   ```

4. **Finaliser la story**
   ```bash
   ./scripts/git-workflow.sh finish
   ```

5. **Mettre à jour Notion**
   - Passe le statut à "À tester"
   - Ajoute dans Notes : fichiers modifiés et comment tester

### Synchronisation Notion ↔ Git

La traçabilité automatique est possible via [US-XX] :
- Chaque commit contient l'ID de la story
- Les branches sont nommées avec l'ID
- Les merges gardent l'historique complet

Un script Python/Node pourrait automatiquement :
- Lire les commits [US-20] depuis Git
- Créer des commentaires Notion avec les liens Git
- Proposer automatiquement "À tester" après le merge

## Validation du système

Le système a été validé pour :

✅ **Branches** : Pattern clair `feature/us-XX-*`
✅ **Commits** : Format validé par hook
✅ **Historique** : Merges conservés avec `--no-ff`
✅ **Traçabilité** : Chaque commit lié à une story via [US-XX]
✅ **Documentation** : CONTRIBUTING.md + exemples complets
✅ **Automatisation** : Hooks + script utilitaire

## Prochaines étapes

Pour améliorer le système :

1. **Intégration GitHub** (si utilisé) : Automatic PR linking
2. **Script de notification** : Notifier Notion des changements Git
3. **Dashboard Git** : Visualiser l'état des branches vs stories Notion
4. **CI/CD hooks** : Valider les builds à chaque merge
5. **Archive des branches** : Auto-supprimer les branches après N jours

## Notes techniques

- Les hooks sont stockés dans `.git/hooks/` et appliqués à tous les commits
- Le hook `prepare-commit-msg` ne fonctionne que pour les branches `feature/us-*`
- Le hook `commit-msg` accepte les merges automatiques
- Le script `git-workflow.sh` est optionnel mais recommandé pour la cohérence
