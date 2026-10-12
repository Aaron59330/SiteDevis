#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js n'est pas installé : https://nodejs.org"; read -p "Entrée pour quitter"; exit 1; fi
(sleep 1.5; open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) &
node server.js
