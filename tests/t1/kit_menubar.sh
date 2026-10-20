#!/bin/sh
# The kit's MenuBar and ContextMenu (ZN-247): where the system does not draw the menu the kit does, from the same template: a scripted click on File > New and the mod-n accelerator both run the item, a right
# press opens the context menu and a click on Copy runs it; with native=true nothing is rendered; the File menu open matches the pixel goldens (light and dark theme).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
g=$PWD/tests/golden/ui/menubar
out=$(ZINC_INPUT=$g/script ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=80 "$ZINC" run "$g" 2>&1 | grep -v "^\[system\]")
[ "$out" = "menu new
menu new
context ctx-copy" ] || { echo "interaction output: $out"; fail=1; }
dump=$(MENUBAR_NATIVE=1 MENUBAR_DUMP=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=100 "$ZINC" run "$g" 2>&1 | grep -v "^\[system\]")
case "$dump" in *'"File"'*|*'"Edit"'*) echo "native=true still renders the menu bar"; fail=1 ;; esac
case "$dump" in *"nothing yet"*) ;; *) echo "native=true broke the page: $dump"; fail=1 ;; esac
for th in dark light; do
  ZINC_INPUT=$g/open.script MENUBAR_THEME=$th ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=14 ZINC_SCALE=1 ZINC_SHOT="$tmp/$th.png" ZINC_SHOT_FRAMES=14 "$ZINC" run "$g" >/dev/null 2>&1
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/$th-14.png" "$g/$th-14.png"; continue; fi
  tools/pngdiff "$tmp/$th-14.png" "$g/$th-14.png" >/dev/null || { echo "$th theme: the open File menu differs from $g/$th-14.png"; fail=1; }
done
[ $fail -eq 0 ] && echo "kit menubar: ok"
exit $fail
