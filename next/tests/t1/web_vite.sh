#!/bin/sh
# @zinc/vite (packages/vite-plugin-zinc, docs/targets/web.md, "Vite and other bundlers"): the web-vite fixture is built with `vite build` and developed with `vite` in headless Chrome. The build runs and counts
# with a CommonJS package inside; the dev server hot-updates a component through Vite's own HMR (the counter stays), shows Vite's overlay on a broken file and reloads when a state module changes.
# Vite is installed once into ~/.zinc/cache/web-vite. Skipped (77) without Chrome, node, npm or a network for that first install. Firefox and Safari are not tested here.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_vite: no python3"; exit 77; }
command -v node >/dev/null 2>&1 || { echo "web_vite: no node"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_vite: no Chrome"; exit 77; }
out=$(timeout 280 python3 -I tools/web-vite-test "$Z" tests/fixtures/web-vite); rc=$?
[ $rc -eq 77 ] && { echo "web_vite: $out"; exit 77; }
[ $rc -eq 0 ] || { echo "web_vite: $out"; exit 1; }
exit 0
