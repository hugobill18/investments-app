#!/bin/bash
# Double-cliquez ce fichier depuis le Finder pour lancer l'application.

cd "$(dirname "$0")"

# Vérifie que Node.js est installé
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js n'est pas installé."
  echo "   Téléchargez-le ici : https://nodejs.org  (version LTS, 'macOS Installer')"
  read -p "Appuyez sur Entrée pour fermer…"
  exit 1
fi

# Installe les dépendances au premier lancement
if [ ! -d "node_modules" ]; then
  echo "📦 Première installation des dépendances (2-3 minutes)…"
  npm install || { echo "❌ Échec de l'installation."; read -p "Entrée pour fermer…"; exit 1; }
fi

# Crée le fichier .env s'il n'existe pas encore
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "ℹ️  Fichier .env créé à partir de .env.example."
  echo "    Par défaut, les codes s'affichent ici dans le terminal."
  echo "    Pour recevoir les codes par email, éditez .env (voir README.md)."
fi

echo ""
echo "🚀 Démarrage du serveur… Ouvrez http://localhost:3000 dans votre navigateur."
echo "   (Pour arrêter : touches Ctrl+C)"
echo ""
npm start
