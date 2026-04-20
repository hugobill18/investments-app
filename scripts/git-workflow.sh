#!/bin/bash
# Script utilitaire pour gérer le workflow Git des user stories

set -e

# Couleurs pour la sortie
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'affichage
log_info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

log_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

log_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

# Fonction pour créer une branche feature
create_feature_branch() {
    local us_id=$1
    local description=$2

    if [ -z "$us_id" ] || [ -z "$description" ]; then
        log_error "Usage: git-workflow create <US-ID> <description>"
        log_info "Example: git-workflow create US-20 'git-workflow'"
        exit 1
    fi

    # Normaliser la description (minuscules, espaces en tirets)
    local branch_name="feature/$(echo $us_id | tr '[:upper:]' '[:lower:]')-$(echo "$description" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')"

    log_info "Création de la branche $branch_name..."

    git fetch origin main 2>/dev/null || true
    git checkout main
    git pull origin main 2>/dev/null || true
    git checkout -b "$branch_name"

    log_success "Branche créée : $branch_name"
    log_info "Commencez à développer !"
    log_info "N'oubliez pas d'ajouter [${us_id}] dans chaque commit"
}

# Fonction pour finaliser une branche
finish_feature_branch() {
    local current_branch=$(git rev-parse --abbrev-ref HEAD)

    if [ "$current_branch" == "main" ]; then
        log_error "Vous êtes déjà sur main"
        exit 1
    fi

    if [[ ! $current_branch =~ ^feature/us- ]]; then
        log_error "Cette branche n'est pas une feature branch (doit commencer par feature/us-)"
        exit 1
    fi

    log_info "Finalisation de la branche $current_branch..."

    # Vérifier qu'il n'y a pas de changements non commités
    if ! git diff-index --quiet HEAD --; then
        log_error "Des changements non commités existent. Faites d'abord un commit."
        exit 1
    fi

    # Mettre à jour main
    git checkout main
    git pull origin main 2>/dev/null || true

    # Merger la branche avec --no-ff
    log_info "Merge de $current_branch vers main..."
    git merge --no-ff "$current_branch" -m "Merge branch '$current_branch' into main"

    log_success "Merge effectué !"
    log_warn "N'oubliez pas de mettre à jour Notion : passez le statut à 'À tester'"
}

# Fonction pour afficher les stories
list_stories() {
    log_info "Stories actives :"
    git log --oneline --grep="\[US-" | head -20
}

# Fonction pour chercher une story
search_story() {
    local us_id=$1

    if [ -z "$us_id" ]; then
        log_error "Usage: git-workflow search <US-ID>"
        exit 1
    fi

    log_info "Commits pour $us_id :"
    git log --grep="\[${us_id}\]" --oneline

    log_info "Branches pour $us_id :"
    git branch -a | grep -i "us-$(echo $us_id | sed 's/US-//')" || log_warn "Aucune branche trouvée"
}

# Fonction pour afficher l'aide
show_help() {
    echo -e "${BLUE}=== Outil de Workflow Git pour User Stories ===${NC}"
    echo ""
    echo "Commandes :"
    echo ""
    echo "  ${GREEN}create <US-ID> <description>${NC}"
    echo "    Créer une nouvelle branche feature"
    echo "    Exemple: git-workflow create US-20 'git-workflow'"
    echo ""
    echo "  ${GREEN}finish${NC}"
    echo "    Finaliser la branche feature actuelle (merge vers main)"
    echo ""
    echo "  ${GREEN}list${NC}"
    echo "    Afficher les stories commencées"
    echo ""
    echo "  ${GREEN}search <US-ID>${NC}"
    echo "    Chercher les commits et branches d'une story"
    echo "    Exemple: git-workflow search US-20"
    echo ""
    echo "  ${GREEN}help${NC}"
    echo "    Afficher cette aide"
    echo ""
}

# Main
case "${1:-help}" in
    create)
        create_feature_branch "$2" "$3"
        ;;
    finish)
        finish_feature_branch
        ;;
    list)
        list_stories
        ;;
    search)
        search_story "$2"
        ;;
    help)
        show_help
        ;;
    *)
        log_error "Commande inconnue : $1"
        show_help
        exit 1
        ;;
esac
