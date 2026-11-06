#!/bin/sh
# Riffle against zinc:desktop-windows' fake windows (a deterministic run never touches the keyboard or the machine's windows): the order logic, then the list and the settings on screen.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} HOME="$tmp"
"$ZINC" check app/riffle >/dev/null 2>&1 || { echo "zinc check failed"; "$ZINC" check app/riffle; exit 1; }
"$ZINC" test app/riffle/tests >"$tmp/test.log" 2>&1 || { cat "$tmp/test.log"; exit 1; }
look() {
  screen=$1; shift
  RIFFLE_OPEN=$screen ZINC_SCENE_DUMP="$tmp/scene" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=30 "$ZINC" run app/riffle >"$tmp/run.log" 2>&1 || { cat "$tmp/run.log"; exit 1; }
  tools/scene-texts "$tmp/scene" > "$tmp/texts" 2>&1 || cp "$tmp/scene" "$tmp/texts"
  for text in "$@"; do
    grep -qF "$text" "$tmp/texts" || { echo "not on screen ($screen): $text"; cat "$tmp/texts"; exit 1; }
  done
}
look picker "Groceries" "Zinc documentation" "Other Space" "Minimized" "Settings" "Menu bar icon" "Quit"
look settings "Cmd + Tab" "Row size" "Start at login" "Menu bar icon"
echo "riffle: ok"
