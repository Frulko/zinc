#!/bin/sh
# Style lowering (ZN-077): percentage and keyword lengths, colours, shorthands, StyleSheet.create, static hoisting, <VirtualList>; the lowered text
# is what the prototype's compiler (compiler/src/jsx.ts, styles.ts, ui-style.ts) writes.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/s.tsx" <<'TSX'
import { StyleSheet } from 'zinc:ui'
import { createSignal } from 'zinc:ui/solid'
const s = StyleSheet.create({ box: { width: '50%', height: 'auto', backgroundColor: '#f00', padding: '4px 8px', border: '1px solid blue', marginTop: -3 }, row: { flexDirection: 'row', fontWeight: 'bold' } })
export function App(): i32 {
  const [n] = createSignal<i32>(3)
  return <View style={[s.box, { gap: n(), opacity: 0.5 }]}>
    <VirtualList count={n()} itemHeight={20} className="flex-col">{(i: i32) => <Text>{i}</Text>}</VirtualList>
    <Text style={{ fontSize: 14, color: 'white', height: '100%' }}>x</Text>
  </View>
}
TSX
out=$(ZN_DUMP_JSX=s.tsx "$ZINC" check --check "$tmp/s.tsx" 2>&1)
want() { echo "$out" | tr -d '\n' | grep -qF -- "$1" || { echo "missing in the lowered text: $1"; fail=1; }; }   # line breaks: the lowering keeps each piece on its source line (ZN-371.03)
want '"widthPercent", "height"'
want '"@backgroundColor:ff0000", "backgroundAlpha"'
want '"paddingTop", "paddingRight", "paddingBottom", "paddingLeft"'
want '[0.5, -1, 0, 255, 4, 8, 4, 8, 1, 0, -3]'
want '"marginTop"'
want '"flexDirection", "fontWeight"'
want '_virtual(__n2, () => (n()), 20,'
want '_class(__n2, "flex-col");'
want '/* font-size: 14px */'
want '"heightPercent"'
want 'const __zsheet0'
# A style computed by a function or held in a constant of the file: its object literal is lowered where it is written, on every engine
cat > "$tmp/f.tsx" <<'TSX'
import * as ui from 'zinc:ui'
import { createNodeRef } from 'zinc:ui/solid'
const card = { backgroundColor: '#123456', opacity: 0.5 }
const seg = (on: boolean) => ({ backgroundColor: on ? 0x00ff00 : 0x0000ff })
function pad(n: number): ui.Style { return { paddingLeft: n * 2 } }
const a = createNodeRef(), b = createNodeRef(), c = createNodeRef()
const root = <View>
  <View ref={a} style={card} />
  <View ref={b} style={seg(true)} />
  <View ref={c} style={[seg(false), pad(3)]} />
</View>
console.log(ui.getNumber(a.node, 'backgroundColor'), ui.getNumber(a.node, 'opacity'), ui.getNumber(b.node, 'backgroundColor'), ui.getNumber(c.node, 'backgroundColor'), ui.getNumber(c.node, 'paddingLeft'), root >= 0)
TSX
for e in "" "--engine quickjs"; do
  got=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/f.tsx" $e 2>&1 | grep -v '^ ' | tail -1)
  [ "$got" = "1193046 0.5 65280 255 6 true" ] || { echo "computed style ($e): $got"; fail=1; }
done
exit $fail
