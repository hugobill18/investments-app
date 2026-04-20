# Guide de Contribution - Investissements App

## Convention de Branches

Chaque user story doit avoir sa propre branche avec le format suivant :
```
feature/us-XX-description-courte
```

Exemples :
- `feature/us-20-git-workflow`
- `feature/us-14-comparateur-fiscal`
- `feature/us-19-estimation-immobilier`

### Cycle de vie d'une branche

1. **Création** : Créer une branche depuis `main`
   ```bash
   git checkout -b feature/us-XX-description-courte
   ```

2. **Développement** : Faire les commits avec la convention ci-dessous

3. **Merge** : Une fois terminé, fusionner avec main avec un commit de merge explicite
   ```bash
   git merge --no-ff feature/us-XX-description-courte
   ```

## Convention de Commits

Tous les commits doivent suivre le format Conventional Commits avec la user story en suffixe :

```
<type>(<module>): <description> [US-ID]
```

### Types de commit autorisés
- **feat** : Une nouvelle fonctionnalité
- **fix** : Un correctif de bug
- **refactor** : Refactorisation sans changement de comportement
- **style** : Changements de formatage, points-virgules manquants, etc.
- **test** : Ajout ou modification de tests
- **docs** : Modification de la documentation
- **chore** : Mises à jour de build, dépendances, etc.

### Modules concernés
- auth
- admin
- dashboard
- instruments
- immobilier
- revenus
- autres

### Exemples de commits valides

```bash
git commit -m "feat(auth): ajouter écran de profile utilisateur [US-20]"
git commit -m "fix(immobilier): corriger calcul de rendement [US-14]"
git commit -m "docs: documenter API endpoints [US-20]"
git commit -m "chore(admin): configurer hooks de synchronisation Git [US-20]"
```

## Traçabilité des Stories à Git

Chaque story a :
1. **Une branche dédiée** : `feature/us-XX-*`
2. **Des commits de travail** : Chaque commit contient `[US-XX]`
3. **Un merge identifié** : Un commit de merge `Merge pull request` ou `Merge branch 'feature/us-XX-*'`

Cela permet de retrouver facilement toutes les modifications liées à une story :
```bash
# Voir tous les commits d'une story
git log --grep="\[US-20\]"

# Voir les branches associées à une story
git branch | grep us-20

# Voir le diff complet d'une story
git diff main...feature/us-20-git-workflow
```

## Checklist avant de terminer une story

- [ ] Tous les commits contiennent le format `[US-ID]`
- [ ] La branche feature est à jour avec `main`
- [ ] Les tests passent (s'il y en a)
- [ ] Le code a été revu
- [ ] Le merge vers `main` est fait avec `--no-ff` pour garder l'historique

## Synchronisation avec Notion

Chaque commit doit contenir `[US-XX]` pour permettre une synchronisation automatique avec Notion.

Les statuts dans Notion :
- **À faire** : Story non commencée
- **En cours** : Branche créée, travail en cours
- **À tester** : Commits faits et mergés dans main, en attente de validation
- **Terminé** : Story validée (uniquement fait par Jeremy)
