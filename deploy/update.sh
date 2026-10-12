#!/usr/bin/env bash
# Mise à jour : récupérer la dernière version du code, puis relancer l'installation (données et configuration conservées).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -d .git ]; then git pull --ff-only; fi
bash deploy/install.sh
