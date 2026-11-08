#!/bin/sh
# ZN-1004: zinc:ui says what to write instead of drawing nothing. An icon name Lucide renamed draws the new icon and warns with it, an
# unknown one warns with the closest name, and a name decided at run time that is not compiled in warns once (U0001); a string where a
# style takes a number warns once with pct(n) or the colour as a number on QuickJS (U0002, U0003); <Button icon> inside the file's own
# function Button names the rename (U0004); `zinc explain` has the four.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 ZINC_LANG=en ZINC_HEADLESS=1 ZINC_FRAMES=2
has() { printf '%s\n' "$1" | grep -qF -- "$2" || { echo "ui_say_what ($3): no '$2' in:"; printf '%s\n' "$1" | head -8; fail=1; }; }
count() { n=$(printf '%s\n' "$1" | grep -cF -- "$2"); [ "$n" = "$3" ] || { echo "ui_say_what: '$2' printed $n times, expected $3"; fail=1; }; }

mkdir -p "$tmp/icons/src"
echo '{ "name": "icons", "entry": "src/main.tsx", "icons": ["trash-2"] }' > "$tmp/icons/zinc.json"
cat > "$tmp/icons/src/main.tsx" <<'TS'
import { render } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
const names = ['heart', 'star'];
function App(): i32 {
  return <View className="flex-row">
    <Icon name="trash-2" /><Icon name="hearts" /><Icon name={names[1]} /><Icon name={names[1]} size={12} />
  </View>;
}
render(App, 0xffffff, null);
TS
for e in --interp "--engine quickjs"; do
  out=$(timeout 120 "$ZINC" run $e "$tmp/icons" 2>&1)
  has "$out" "icon 'trash-2' is an old Lucide name: write 'trash'" "icons $e"
  has "$out" "no Lucide icon 'hearts' (did you mean 'heart'?)" "icons $e"
  count "$out" "icon 'star' is not in this program" 1
  count "$out" "'hearts'" 1
done

mkdir -p "$tmp/str/src"
echo '{ "name": "str", "entry": "src/main.tsx", "engine": "quickjs" }' > "$tmp/str/zinc.json"
cat > "$tmp/str/src/main.tsx" <<'TS'
import { render } from 'zinc:ui/solid';
const n = 40, w = `${n}%`, bg = '#ff0000';
function App(): i32 {
  return <View><View style={{ width: w, height: 10, backgroundColor: bg }} /><View style={{ width: w }} /></View>;
}
render(App, 0xffffff, null);
TS
out=$(timeout 120 "$ZINC" run --engine quickjs "$tmp/str" 2>&1)
has "$out" "write width: pct(40) (zinc explain U0002)" "string width"
has "$out" "write 0xff0000 (zinc explain U0003)" "string colour"
count "$out" "U0002" 1

mkdir -p "$tmp/shadow"
cat > "$tmp/shadow/main.tsx" <<'TS'
function Button(p: { icon: string }): i32 {
  return <Button icon={p.icon} />;
}
TS
out=$(timeout 60 "$ZINC" check "$tmp/shadow/main.tsx" 2>&1)
has "$out" "inside your own function Button, <Button> is zinc:ui's Button" "shadowed Button"
has "$out" "give your component another name (AppButton)" "shadowed Button"

for c in U0001 U0002 U0003 U0004; do
  timeout 10 "$ZINC" explain $c | grep -q "^$c: " || { echo "ui_say_what: zinc explain $c printed nothing"; fail=1; }
done
exit $fail
