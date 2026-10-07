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
  return <view style={[s.box, { gap: n(), opacity: 0.5 }]}>
    <VirtualList count={n()} itemHeight={20} class="flex-col">{(i: i32) => <text>{i}</text>}</VirtualList>
    <text style={{ fontSize: 14, color: 'white', height: '100%' }}>x</text>
  </view>
}
TSX
out=$(ZN_DUMP_JSX=s.tsx "$ZINC" check --check "$tmp/s.tsx" 2>&1)
want() { echo "$out" | grep -qF -- "$1" || { echo "missing in the lowered text: $1"; fail=1; }; }
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
exit $fail
