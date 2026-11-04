#!/bin/sh
# Lumen against zinc:monitors' two fake displays (a deterministic run never touches the real screens): the panel lists the displays and tools, the
# Display Mode row lists the sizes, and picking one changes the mode and asks to keep it.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
cat >"$tmp/input" <<'INPUT'
5 move 51 331
6 down
7 up
INPUT
"$ZINC" check app/lumen >/dev/null 2>&1 || { echo "zinc check failed"; "$ZINC" check app/lumen; exit 1; }
LUMEN_OPEN=1 LUMEN_OPEN_ROW="Display Mode" ZINC_INPUT="$tmp/input" ZINC_SCENE_DUMP="$tmp/scene" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=60 ZINC_SHOT="$tmp/frame.png" \
  "$ZINC" run app/lumen >"$tmp/run.log" 2>&1 || { cat "$tmp/run.log"; exit 1; }
tools/scene-texts "$tmp/scene" > "$tmp/texts" 2>&1 || cp "$tmp/scene" "$tmp/texts"
for text in "Built-in Liquid Retina XDR" "Display Mode" "1512 × 982" "Virtual Screens" "Keep this resolution"; do
  grep -qF "$text" "$tmp/texts" || { echo "not on screen: $text"; cat "$tmp/texts"; exit 1; }
done
echo "lumen: ok"
