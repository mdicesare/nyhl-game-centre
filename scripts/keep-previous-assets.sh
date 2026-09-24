#!/usr/bin/env bash
#
# Keep the files the *currently live* index.html points at.
#
# A deploy replaces dist/ wholesale, so every hashed bundle from the previous
# build disappears. But copies of the old index.html survive that deploy in
# three places — the GitHub Pages CDN (max-age=600), the browser's own HTTP
# cache (also 600s), and the service worker's precache (which keeps
# index.html until the new worker activates). Those copies still ask for the
# old bundle, get a 404, and the visitor is left staring at a blank page with
# nothing but the stylesheet's background colour.
#
# So before uploading, pull the referenced bundles forward into dist/. Old
# HTML keeps booting (and the autoUpdate service worker then hands the visitor
# the new version on the next load), while new HTML gets the fresh build.
set -uo pipefail

SITE="${1:-https://mdicesare.github.io/nyhl-game-centre/}"

if [ ! -d dist ]; then
  echo "no dist/ directory — run the build first" >&2
  exit 1
fi

mkdir -p dist/assets

live_html="$(curl -fsSL --max-time 30 "$SITE" 2>/dev/null || true)"
refs="$(printf '%s' "$live_html" | grep -oE 'assets/[A-Za-z0-9._-]+\.(js|css|png|svg|woff2)' | sort -u || true)"

if [ -z "$refs" ]; then
  echo "Nothing referenced by the live site (first deploy, or it is unreachable)."
  exit 0
fi

kept=0
for f in $refs; do
  # This build's own output — never clobber it with the older copy.
  if [ -f "dist/$f" ]; then
    continue
  fi
  if curl -fsSL --max-time 30 -o "dist/$f" "$SITE$f"; then
    echo "kept $f (still referenced by the live index.html)"
    kept=$((kept + 1))
  else
    # Not fatal: a missing bundle we cannot fetch would 404 either way.
    echo "could not fetch $SITE$f — skipping" >&2
  fi
done

echo "carried $kept previous asset(s) into this deploy"
