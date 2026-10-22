#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# ios-parity.sh — vérifie que le Core Swift rend les mêmes nombres que la PWA.
#
# Le portage iOS ne peut pas se contenter de « ça a l'air juste » : les deux
# applications déclarent les mêmes montants au fisc. Alors la référence est
# RELEVÉE sur la suite de modules de la PWA (npm run parite:export), et le Core
# Swift la rejoue ici. Un écart d'un cent fait échouer le script.
#
# Pourquoi swiftc et non xcodebuild : le noyau ne dépend que de Foundation — ni
# UIKit, ni SwiftData, ni état d'application — et compile donc pour macOS en
# deux secondes. `xcodebuild` sait construire l'application (vérifié le
# 22 octobre 2026, appareil et simulateur), mais le projet n'a pas encore de
# cible de tests : il n'aurait rien à exécuter.
#
# Usage :
#   scripts/ios-parity.sh            → compile et exécute la suite
#   npm run parite                   → identique
#   npm run parite:export            → relève d'abord la référence sur la PWA
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

CORE=ios_2026/RevenusDepenses/Core
TESTS=ios_2026/Tests/Parity
REF=$TESTS/parite-vague1.json

if ! command -v swiftc >/dev/null 2>&1; then
  echo "✖ swiftc est absent : installez les outils en ligne de commande de Xcode." >&2
  exit 2
fi

if [ ! -f "$REF" ]; then
  echo "✖ Référence absente : $REF" >&2
  echo "  Relevez-la sur la PWA :  npm run parite:export" >&2
  exit 2
fi

# Un répertoire temporaire : le binaire n'a aucune raison d'atterrir dans le
# dépôt, et .gitignore n'a donc rien à savoir de lui.
SORTIE=$(mktemp -d)
trap 'rm -rf "$SORTIE"' EXIT

echo ""
echo "── Compilation du Core (Foundation seul, cible macOS) ─────────────────"
swiftc -swift-version 5 -O -o "$SORTIE/parite" "$CORE"/*.swift "$TESTS"/*.swift
echo "  ✔ $(ls "$CORE"/*.swift | wc -l | tr -d ' ') fichiers du noyau + $(ls "$TESTS"/*.swift | wc -l | tr -d ' ') de la suite"

"$SORTIE/parite" "$REF"
