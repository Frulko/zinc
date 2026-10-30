#!/bin/sh
# Pictures inline in a Text (tests/golden/ui-pictures, ZN-880): <Image> nested in <Text> flows with the words and wraps with them, and a
# picture run of setTextRuns does the same. The layout (ui.dump) and the last frame are main.out's on the interpreter; QuickJS, the compiled
# program and the React model draw the same frame.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-pictures
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_FRAMES=4 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=180x150 ZINC_FRAMEHASH=last
"$ZINC" run --interp $d/solid.tsx 2>&1 | grep -v '^zinc: frame [0-9]' > "$tmp/out"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/out" $d/main.out; echo "ui-pictures: golden recorded"; exit 0; fi
diff $d/main.out "$tmp/out" || { echo "ui-pictures: the layout or the frame differs from main.out"; exit 1; }
want=$(grep framehash $d/main.out) fail=0
h=$("$ZINC" run $d/solid.tsx --engine quickjs 2>&1 | grep framehash); [ "$h" = "$want" ] || { echo "QuickJS: $h"; fail=1; }
h=$("$ZINC" run --interp $d/react.tsx 2>&1 | grep framehash); [ "$h" = "$want" ] || { echo "React model: $h"; fail=1; }
if "$ZINC" build $d/solid.tsx -o "$tmp/app" >"$tmp/log" 2>&1; then h=$("$tmp/app" 2>&1 | grep framehash); [ "$h" = "$want" ] || { echo "compiled: $h"; fail=1; }
else echo "the program does not build: $(tail -c 300 "$tmp/log")"; fail=1; fi
exit $fail
