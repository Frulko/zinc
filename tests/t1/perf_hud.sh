#!/bin/sh
# ZINC_PERF_HUD (ZN-375): the perf panel is an overlay (a frame with it differs from one without only inside its rectangle), its numbers are
# ZINC_PROFILE's, and scripted input (ZINC_INPUT) drags it, collapses it to a badge and toggles it with Cmd+Shift+P, while the program does
# not see a pointer pressed on it.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_PROFILE=1
unset ZINC_PERF_HUD ZINC_SCALE
fail=0
cat > "$tmp/app.ts" <<'T'
import { onFrame, clear, rect, pointerDown } from 'zinc:gfx';
onFrame(() => { clear(0x202020); rect(10, 10, 50, 50, 0xff0000); if (pointerDown()) console.log('the program saw a press'); });
T
hud() { echo "$1" | sed -n 's/^zinc perf hud: x=\([0-9]*\) y=\([0-9]*\) w=\([0-9]*\) h=\([0-9]*\).*/\1 \2 \3 \4/p'; }
# 1. hero: only the panel's rectangle differs, and the panel's p50 / p99 are the summary's
ZINC_FRAMES=60 ZINC_SHOT="$tmp/off.png" "$ZINC" run ../examples/hero --interp >/dev/null 2>&1
out=$(ZINC_PERF_HUD=1 ZINC_FRAMES=60 ZINC_SHOT="$tmp/on.png" "$ZINC" run ../examples/hero --interp 2>&1)
set -- $(hud "$out")
[ $# -eq 4 ] || { echo "no panel line: $out"; exit 1; }
bb=$(tools/pngdiff "$tmp/off.png" "$tmp/on.png" --bbox | sed -n 's/^bbox //p')
[ "$bb" = "$1 $2 $(($1 + $3)) $(($2 + $4))" ] || { echo "the frame differs outside the panel ($1 $2 $3 $4): bbox $bb"; fail=1; }
a=$(echo "$out" | sed -n 's/^zinc perf hud: .* work \(p50=[0-9.]* p99=[0-9.]*\) ms.*/\1/p'); b=$(echo "$out" | sed -n 's/^zinc profile: frames=[0-9]* work \(p50=[0-9.]* p99=[0-9.]*\) max.*/\1/p')
[ -n "$a" ] && [ "$a" = "$b" ] || { echo "the panel says '$a', ZINC_PROFILE says '$b'"; fail=1; }
# 2. dragged by its title (from 100,14 to 40,100), the program sees no press; then a click on its "-" collapses it
printf '3 move 100 14\n3 down\n4 move 80 40\n5 move 40 100\n6 up\n' > "$tmp/drag.in"
out=$(ZINC_PERF_HUD=1 ZINC_FRAMES=12 ZINC_INPUT="$tmp/drag.in" "$ZINC" run "$tmp/app.ts" --interp 2>&1)
[ "$(hud "$out")" = "4 94 248 140" ] || { echo "drag: $(hud "$out") (expected 4 94 248 140): $out"; fail=1; }
echo "$out" | grep -q "the program saw a press" && { echo "the program saw the press on the panel"; fail=1; }
printf '3 move 306 12\n3 down\n4 up\n' > "$tmp/collapse.in"
out=$(ZINC_PERF_HUD=1 ZINC_FRAMES=10 ZINC_INPUT="$tmp/collapse.in" "$ZINC" run "$tmp/app.ts" --interp 2>&1)
set -- $(hud "$out")
[ "$3 $4" = "72 14" ] || { echo "collapse: $(hud "$out") (expected a 72x14 badge): $out"; fail=1; }
# 3. Cmd+Shift+P shows a hidden panel
printf '3 key p shift+meta\n' > "$tmp/key.in"
out=$(ZINC_FRAMES=8 ZINC_INPUT="$tmp/key.in" "$ZINC" run "$tmp/app.ts" --interp 2>&1)
set -- $(hud "$out")
[ "$3" = "248" ] || { echo "Cmd+Shift+P did not show the panel: $(hud "$out"): $out"; fail=1; }
# 4. zinc.json "dev": {"perfHud": true} shows it
mkdir -p "$tmp/proj" && cp "$tmp/app.ts" "$tmp/proj/main.ts"
printf '{ "name": "hud", "entry": "main.ts", "dev": { "perfHud": true } }\n' > "$tmp/proj/zinc.json"
out=$(ZINC_FRAMES=4 "$ZINC" run "$tmp/proj" --interp 2>&1)
set -- $(hud "$out")
[ "$3" = "248" ] || { echo "zinc.json dev.perfHud did not show the panel: $out"; fail=1; }
out=$(ZINC_FRAMES=4 "$ZINC" run "$tmp/proj" --engine quickjs 2>&1)
set -- $(hud "$out")
[ "$3" = "248" ] || { echo "QuickJS zinc.json dev.perfHud did not show the panel: $out"; fail=1; }
[ $fail -eq 0 ] && echo "perf hud: ok"
exit $fail
