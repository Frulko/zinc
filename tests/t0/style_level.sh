#!/bin/sh
# ZN-278: style levels. A build for a profile names each style token its drawing tier does not draw as written (U0005, file and line): a conic
# gradient below T3, a gradient beyond two stops along an axis below T2; zinc.json "ui": {"style": "strict"} makes it an error, "off" silences it;
# box shadows below T2 (an inset, more than two layers, a blur over 8 px, ZN-260); a desktop build says nothing; zinc doctor prints the level and what the last build drew simpler; zinc explain U0005 has the entry.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 ZINC_LANG=en ZINC_HEADLESS=1 ZINC_HOME="$tmp/home" NO_COLOR=1
has() { printf '%s\n' "$1" | grep -qF -- "$2" || { echo "style_level ($3): no '$2' in:"; printf '%s\n' "$1" | head -8; fail=1; }; }
hasnt() { printf '%s\n' "$1" | grep -qF -- "$2" && { echo "style_level ($3): '$2' in:"; printf '%s\n' "$1" | head -8; fail=1; }; }

mkdir -p "$tmp/app/src"
echo '{ "name": "app", "entry": "src/main.tsx" }' > "$tmp/app/zinc.json"
cat > "$tmp/app/src/main.tsx" <<'TS'
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="p-4">
    <View className="w-10 h-10 bg-conic from-red-500 to-blue-500" />
    <View style={{ width: 10, height: 10, backgroundImage: 'linear-gradient(45deg, red, blue)' }} />
    <View className="w-10 h-10 bg-gradient-to-r from-sky-500 to-indigo-500" />
    <View className="w-10 h-10 inset-shadow-sm shadow-[0_1px_2px_#000,0_2px_4px_#000,0_4px_8px_#000]" />
    <View className="w-10 h-10 shadow-[0_4px_12px_rgba(0,0,0,0.5)] shadow-[0_1px_8px_#000] inset-shadow-rose-500" />
  </View>;
}
render(App, 0xffffff, null);
TS
out=$(timeout 60 "$ZINC" check --profile esp32 "$tmp/app" 2>&1); rc=$?
[ $rc -eq 0 ] || { echo "style_level: the esp32 check fails (exit $rc): $out"; fail=1; }
has "$out" "src/main.tsx:4:" "esp32 conic"
has "$out" "warning U0005: 'bg-conic' is not drawn as written on esp32 (tier T0, style level core; T3 draws it): a conic gradient is drawn as the average of its stops (zinc explain U0005)" "esp32 conic"
has "$out" "src/main.tsx:5:" "esp32 angled"
has "$out" "'linear-gradient(45deg, red, blue)' is not drawn as written on esp32" "esp32 angled"
hasnt "$out" "bg-gradient-to-r" "two stops along an axis"
hasnt "$out" "from-sky-500" "two stops along an axis"
has "$out" "'inset-shadow-sm' is not drawn as written on esp32 (tier T0, style level core; T2 draws it): an inset shadow is not drawn" "esp32 inset"
has "$out" "src/main.tsx:7:" "esp32 shadow layers"
has "$out" "a box shadow beyond two layers is drawn with its first two" "esp32 shadow layers"
has "$out" "'shadow-[0_4px_12px_rgba(0,0,0,0.5)]' is not drawn as written on esp32" "esp32 shadow blur"
has "$out" "a box shadow blur beyond 8 px is drawn at 8 px" "esp32 shadow blur"
hasnt "$out" "shadow-[0_1px_8px_#000]" "a blur of 8 px"
hasnt "$out" "inset-shadow-rose-500" "an inset shadow's colour"

doc=$(timeout 30 "$ZINC" doctor 2>&1)
has "$doc" "UI styles" "doctor"
has "$doc" "the last build for esp32 ($tmp/app" "doctor"
has "$doc" "bg-conic (src/main.tsx:4:" "doctor"
has "$(timeout 30 "$ZINC" doctor --profile esp32 2>&1)" "level core on esp32 (tier T0)" "doctor esp32"

out=$(timeout 60 "$ZINC" check --profile rpi1 "$tmp/app" 2>&1)
has "$out" "'bg-conic' is not drawn as written on rpi1 (tier T2, style level extended" "rpi1 conic"
hasnt "$out" "linear-gradient" "rpi1 angled"

out=$(timeout 60 "$ZINC" check "$tmp/app" 2>&1)
hasnt "$out" "U0005" "desktop"

echo '{ "name": "app", "entry": "src/main.tsx", "ui": { "style": "strict" } }' > "$tmp/app/zinc.json"
out=$(timeout 60 "$ZINC" check --profile esp32 "$tmp/app" 2>&1); rc=$?
[ $rc -ne 0 ] || { echo "style_level: strict passes on esp32"; fail=1; }
has "$out" "src/main.tsx:4:32: error U0005: A style the profile does not draw as written: 'bg-conic'" "strict"
out=$(timeout 60 "$ZINC" check "$tmp/app" 2>&1) || { echo "style_level: strict fails a desktop check: $out"; fail=1; }

echo '{ "name": "app", "entry": "src/main.tsx", "ui": { "style": "off" } }' > "$tmp/app/zinc.json"
out=$(timeout 60 "$ZINC" check --profile esp32 "$tmp/app" 2>&1)
hasnt "$out" "U0005" "off"

echo '{ "name": "app", "entry": "src/main.tsx", "ui": { "style": "loud" } }' > "$tmp/app/zinc.json"
out=$(timeout 60 "$ZINC" check --profile esp32 "$tmp/app" 2>&1)
has "$out" '"ui.style" must be "warn", "strict" or "off"' "bad value"

timeout 10 "$ZINC" explain U0005 | grep -q "^U0005: A style the profile does not draw as written" || { echo "style_level: zinc explain U0005 printed nothing"; fail=1; }
[ $fail -eq 0 ] && echo "style_level: ok"
exit $fail
