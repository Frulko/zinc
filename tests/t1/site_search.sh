#!/bin/sh
# The site's search (ZN-774.22): the built site indexed by Pagefind, one index per language, and ten known queries in each language
# (site/search-check.mjs: gfx, stage, onClick, Z0103...) find their page among the first three results, with the site's ranking.
# Skipped (77) without the site's packages (cd site && pnpm install). About 20 s: the site build.
cd "$(dirname "$0")/../.." || exit 2
[ -d site/node_modules ] || { echo "site_search: no site/node_modules (cd site && pnpm install)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
(cd site && pnpm -s exec astro build --outDir "$tmp/dist" >"$tmp/build.log" 2>&1 && pnpm -s exec pagefind --site "$tmp/dist" >>"$tmp/build.log" 2>&1) \
  || { tail -20 "$tmp/build.log"; echo "site_search: the site does not build"; exit 1; }
grep -q 'Discovered 5 languages' "$tmp/build.log" || { echo "site_search: Pagefind did not find the five languages: $(grep -i languages "$tmp/build.log")"; exit 1; }
node site/search-check.mjs "$tmp/dist" || exit 1
echo "site_search: ok"
