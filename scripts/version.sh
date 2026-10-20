#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# version.sh — incrémente la version de la PWA partout où elle apparaît.
#
# La version vit à six endroits, et un seul oubli suffit à faire servir
# l'ancien code depuis le cache du navigateur — la panne la plus fréquente du
# projet. Ce script est le seul outil autorisé à les écrire.
#
#   1. const APP_VERSION      dans pwa_2026/index.html   (affichée aux réglages)
#   2. const APP_BUILD        dans pwa_2026/index.html   (date du jour)
#   3. ?v=<version>           sur chaque balise <script src="js/…"> (18 à ce jour)
#   4. const CACHE            dans pwa_2026/sw.js
#   5. "version"              dans pwa_2026/manifest.json
#   6. "version"              dans package.json            (en-tête de npm test)
#
# Usage :
#   scripts/version.sh                 → affiche la version courante
#   scripts/version.sh patch           → 2.1.0 → 2.1.1
#   scripts/version.sh minor           → 2.1.0 → 2.2.0
#   scripts/version.sh major           → 2.1.0 → 3.0.0
#   scripts/version.sh set 2.4.1       → impose une version
#   scripts/version.sh minor --deploy  → incrémente puis déploie en prod
#
# Le script refuse d'agir si les six endroits ne sont pas déjà cohérents :
# mieux vaut s'arrêter que propager une incohérence.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."
HTML=pwa_2026/index.html
SW=pwa_2026/sw.js
MANIFEST=pwa_2026/manifest.json
PKG=package.json

lire_version() { sed -n "s/^const APP_VERSION *= *'\([0-9.]*\)'.*/\1/p" "$HTML" | head -1; }

verifier_coherence() {
  local v="$1" pb=0
  # Le nombre de modules n'est pas figé dans le script : on compte les balises
  # réellement présentes (en début de ligne, pour ne pas attraper le
  # commentaire qui les décrit) et on exige que TOUTES portent la version.
  local n_balises; n_balises=$(grep -c '^<script src="js/' "$HTML" || true)
  local n_tags; n_tags=$(grep -c "^<script src=\"js/[^\"]*\.js?v=$v\"" "$HTML" || true)
  local n_autres; n_autres=$(grep -o '\.js?v=[0-9A-Za-z.]*"' "$HTML" | grep -cv "?v=$v\"" || true)
  [ "$n_balises" -gt 0 ] || { echo "  ✖ aucune balise <script src=\"js/…\"> trouvée"; pb=1; }
  [ "$n_tags" -eq "$n_balises" ] \
    || { echo "  ✖ $n_tags des $n_balises balises de module en ?v=$v"; pb=1; }
  [ "$n_autres" -eq 0 ] || { echo "  ✖ $n_autres balise(s) de module sur une autre version"; pb=1; }
  grep -q "const CACHE = 'depenses-$v'" "$SW" || { echo "  ✖ $SW n'est pas en depenses-$v"; pb=1; }
  grep -q "\"version\": \"$v\"" "$MANIFEST" || { echo "  ✖ $MANIFEST n'est pas en $v"; pb=1; }
  grep -q "\"version\": \"$v\"" "$PKG" || { echo "  ✖ $PKG n'est pas en $v"; pb=1; }
  return $pb
}

ecrire_version() {
  local ancienne="$1" nouvelle="$2" aujourdhui
  aujourdhui=$(date +%F)
  perl -pi -e "s/^const APP_VERSION = '\Q$ancienne\E'/const APP_VERSION = '$nouvelle'/" "$HTML"
  perl -pi -e "s/^const APP_BUILD   = '[0-9-]*'/const APP_BUILD   = '$aujourdhui'/" "$HTML"
  perl -pi -e "s/\.js\?v=\Q$ancienne\E\"/.js?v=$nouvelle\"/g" "$HTML"
  perl -pi -e "s/const CACHE = 'depenses-\Q$ancienne\E'/const CACHE = 'depenses-$nouvelle'/" "$SW"
  perl -pi -e "s/\"version\": \"\Q$ancienne\E\"/\"version\": \"$nouvelle\"/" "$MANIFEST"
  perl -pi -e "s/\"version\": \"\Q$ancienne\E\"/\"version\": \"$nouvelle\"/" "$PKG"
}

COURANTE=$(lire_version)
[ -n "$COURANTE" ] || { echo "✖ APP_VERSION introuvable dans $HTML"; exit 1; }

ACTION="${1:-}"

if [ -z "$ACTION" ]; then
  echo "Version courante : $COURANTE"
  if verifier_coherence "$COURANTE"; then echo "✔ Les six emplacements concordent."; else exit 1; fi
  exit 0
fi

echo "Vérification de la version courante ($COURANTE)…"
verifier_coherence "$COURANTE" || { echo "✖ Incohérence : corrigez-la avant d'incrémenter."; exit 1; }

IFS=. read -r MA MI PA <<< "$COURANTE"
case "$ACTION" in
  patch)   NOUVELLE="$MA.$MI.$((PA+1))" ;;
  minor)   NOUVELLE="$MA.$((MI+1)).0" ;;
  major)   NOUVELLE="$((MA+1)).0.0" ;;
  set)     NOUVELLE="${2:-}"
           [[ "$NOUVELLE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "✖ Usage : $0 set X.Y.Z"; exit 1; }
           shift ;;
  *)       echo "✖ Action inconnue : $ACTION (patch | minor | major | set X.Y.Z)"; exit 1 ;;
esac

ecrire_version "$COURANTE" "$NOUVELLE"
echo "Version $COURANTE → $NOUVELLE"
if verifier_coherence "$NOUVELLE"; then echo "✔ Les six emplacements concordent."; else
  echo "✖ L'écriture a laissé une incohérence — vérifiez le diff."; exit 1
fi

if [ "${2:-}" = "--deploy" ] || [ "${3:-}" = "--deploy" ]; then
  echo
  echo "Déploiement en production…"
  firebase deploy --only hosting
fi
