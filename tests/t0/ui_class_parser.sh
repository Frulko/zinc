#!/bin/sh
# The class parser is compiled only into programs that give classes (ZN-774.18 step 6): rebuildStyle reaches applyToken through a hook that
# setClass and styleC install. A style-only Solid program and a React Native program with sticky section headers carry no @applyToken in
# their ZBC; one className, or one style object that lowers to a class token (fontFamily), brings it back, so the check cannot pass vacuously.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
export ZINC_DETERMINISTIC=1
mkdir -p "$tmp/solid" "$tmp/rn"
cat > "$tmp/solid/base.tsx" <<'T'
import { createSignal, render } from 'zinc:ui/solid';
import { StyleSheet } from 'zinc:ui';
const [count, setCount] = createSignal<i32>(0);
const s = StyleSheet.create({ title: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' }, sticky: { position: 'sticky', top: 0, zIndex: 2 } });
function App(): i32 {
  return <View style={{ flex: 1, padding: 16, gap: 12, backgroundColor: '#f8fafc' }}>
    <Text style={s.title}>Style objects only</Text>
    <View style={s.sticky} onClick={() => setCount(count() + 1)}><Text style={{ color: count() > 2 ? '#ef4444' : '#2563eb' }}>{count()}</Text></View>
  </View>;
}
render(App, 0xf8fafc, null);
T
sed 's|<Text style={s.title}>|<Text className="p-2" style={s.title}>|' "$tmp/solid/base.tsx" > "$tmp/solid/class.tsx"
sed "s|fontSize: 20,|fontSize: 20, fontFamily: 'mono',|" "$tmp/solid/base.tsx" > "$tmp/solid/token.tsx"
sed "s|gap: 12,|gap: 12, backgroundSize: 'cover',|" "$tmp/solid/base.tsx" > "$tmp/solid/inline.tsx"
echo '{ "name": "rn", "entry": "main.tsx", "ui": { "preset": "react-native" } }' > "$tmp/rn/zinc.json"
cat > "$tmp/rn/main.tsx" <<'T'
import { AppRegistry, View, Text, SectionList } from 'react-native';
const DATA = [{ title: 'A', data: ['a1', 'a2'] }, { title: 'B', data: ['b1'] }];
function App(): i32 {
  return <SectionList sections={DATA} renderItem={({ item }) => <Text>{item}</Text>}
    renderSectionHeader={({ section }) => <View style={{ backgroundColor: '#eeeeee' }}><Text>{section.title}</Text></View>} />;
}
AppRegistry.registerComponent('main', () => App);
T
has() {   # has <file> <expected 0|1> <what>
  "$ZINC" --emit=zbc "$1" > "$tmp/out.txt" 2>&1 || { echo "$3: compile failed: $(grep -m3 error "$tmp/out.txt")"; fail=1; return; }
  n=$(grep -c '^func @applyToken(' "$tmp/out.txt")
  [ "$n" = "$2" ] || { echo "$3: $n @applyToken function(s) in the ZBC, expected $2"; fail=1; }
}
has "$tmp/solid/base.tsx" 0 "style-only Solid program"
has "$tmp/rn/main.tsx" 0 "React Native SectionList (sticky headers)"
has "$tmp/solid/class.tsx" 1 "one className"
has "$tmp/solid/token.tsx" 1 "a fontFamily key in StyleSheet.create (styleC)"
has "$tmp/solid/inline.tsx" 1 "a backgroundSize key in an inline style object (styleC)"
[ $fail -eq 0 ] && echo "ok: no class parser without classes; className and class-token style objects bring it in"
exit $fail
