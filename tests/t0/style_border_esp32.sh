#!/bin/sh
# The extended border on the esp32 profile (ZN-257, ST-08, tier T0): a dashed border with a radius per corner is drawn as the solid border with
# the largest corner's radius, a dotted border with a colour per side as the solid one, one log line for each simplification (once a run);
# on the desktop both differ from their simple form. tests/golden/ui-style/border-ext pins the desktop frame (ui_style.sh).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x160 ZINC_FRAMES=3 ZINC_FRAMEHASH=last ZINC_LANG=en
fail=0
hash() { timeout 60 "$ZINC" run "$@" 2>&1 | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p'; }
scene() {
  cat > "$tmp/$1.tsx" <<EOF
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="flex-row p-6 gap-6 bg-slate-100">
    <View className="w-20 h-14 bg-white border-4 border-rose-500 $2"/>
    <View className="w-20 h-14 bg-white border-4 border-sky-500 border-t-amber-500 border-l-emerald-500 $3"/>
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
EOF
}
scene ext "border-dashed rounded-tl-2xl rounded-br-md rounded-sm" "border-dotted rounded-lg"
scene simple "rounded-2xl" "rounded-lg"
out=$(timeout 60 "$ZINC" run --profile esp32 "$tmp/ext.tsx" 2>&1)
for l in "a dashed or dotted border is drawn solid" "a radius per corner is drawn as the largest corner"; do
  [ "$(echo "$out" | grep -cF "zinc:ui: $l on this profile (tier T0)")" = 1 ] || { echo "esp32: not once: $l"; fail=1; }
done
a=$(echo "$out" | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p')
b=$(hash --profile esp32 "$tmp/simple.tsx")
[ -n "$a" ] && [ "$a" = "$b" ] || { echo "esp32: the dashed and dotted borders ($a) are not the solid ones with the largest corner ($b)"; fail=1; }
[ "$(hash "$tmp/ext.tsx")" != "$(hash "$tmp/simple.tsx")" ] || { echo "desktop: the dashed and dotted borders are drawn solid"; fail=1; }
[ $fail -eq 0 ] && echo "style border esp32: ok"
exit $fail
