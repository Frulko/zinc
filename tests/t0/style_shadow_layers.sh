#!/bin/sh
# Box shadows beyond the presets (ZN-260). The five presets keep the frame they had before layered shadows (tests/golden/ui-style/shadow-presets),
# the layered and inset scene its golden (shadow-layers: two layers with a spread, a hard coloured layer, inset-shadow-sm, an inset in a border,
# inset-shadow-<colour>, an inset filling the box). On the esp32 profile (tier T0) a box with three layers, a 12 px blur and an inset is drawn
# as the same box with its first two layers at 8 px and no inset, one log line for each simplification; on the desktop it is not. A style
# object's boxShadow string draws what the shadow-[..] class draws.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x160 ZINC_FRAMES=3 ZINC_FRAMEHASH=last ZINC_LANG=en
g=tests/golden/ui-style
fail=0
hash() { timeout 60 "$ZINC" run "$@" 2>&1 | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p'; }
for s in shadow-presets shadow-layers; do
  got=$(hash $g/$s.tsx)
  [ "$got" = "$(cat $g/$s.hash)" ] || { echo "$s: frame hash '$got', golden $(cat $g/$s.hash)"; fail=1; }
done
scene() {
  cat > "$tmp/$1.tsx" <<EOF
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="p-8 bg-slate-100"><View className="w-24 h-16 bg-white rounded-lg $2"/></View>;
}
render(App, 0xffffff, (dt: number) => {});
EOF
}
scene full "shadow-[0_2px_3px_#000,0_6px_12px_rgba(220,38,38,0.6),0_14px_20px_#2563eb] inset-shadow-sm"
scene kept "shadow-[0_2px_3px_#000,0_6px_8px_rgba(220,38,38,0.6)]"
out=$(timeout 60 "$ZINC" run --profile esp32 "$tmp/full.tsx" 2>&1)
for l in "an inset shadow is not drawn" "a box shadow beyond two layers is drawn with its first two" "a box shadow blur beyond 8 px is drawn at 8 px"; do
  [ "$(echo "$out" | grep -cF "zinc:ui: $l on this profile (tier T0)")" = 1 ] || { echo "esp32: not once: $l"; fail=1; }
done
a=$(echo "$out" | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p')
b=$(hash --profile esp32 "$tmp/kept.tsx")
[ -n "$a" ] && [ "$a" = "$b" ] || { echo "esp32: the degraded box ($a) is not the box with two layers at 8 px ($b)"; fail=1; }
[ "$(hash "$tmp/full.tsx")" != "$(hash "$tmp/kept.tsx")" ] || { echo "desktop: the three layers and the inset are not drawn"; fail=1; }
cat > "$tmp/object.tsx" <<'EOF'
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="p-8 bg-slate-100"><View className="w-24 h-16 bg-white rounded-lg" style={{ boxShadow: '0 2px 3px #000, 0 6px 8px rgba(220, 38, 38, 0.6)' }}/></View>;
}
render(App, 0xffffff, (dt: number) => {});
EOF
[ "$(hash "$tmp/object.tsx")" = "$(hash "$tmp/kept.tsx")" ] || { echo "style={{ boxShadow }} does not draw what shadow-[..] draws: $(timeout 60 "$ZINC" run "$tmp/object.tsx" 2>&1 | head -3)"; fail=1; }
[ $fail -eq 0 ] && echo "style shadow layers: ok"
exit $fail
