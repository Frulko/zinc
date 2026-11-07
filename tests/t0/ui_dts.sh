#!/bin/sh
# lib/ui.d.ts, the editor's zinc:ui (ZN-799): it is what tools/ui-dts generates from lib/std/ui.ts today, and a project's tsconfig.json
# (zinc tsconfig) types PointerEvent, KeyEvent and the event attributes of the host tags: a handler reading a field the event lacks is an error.
cd "$(dirname "$0")/../.." || exit 2
root=$PWD
tsc=${TSC:-$root/node_modules/.bin/tsc}
"$tsc" --version >/dev/null 2>&1 || { echo "skipped: no tsc (pnpm install, or TSC=<path>)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
TSC=$tsc tools/ui-dts --stdout > "$tmp/ui.d.ts" || exit 1
cmp -s "$tmp/ui.d.ts" lib/ui.d.ts || { echo "lib/ui.d.ts is stale: run tools/ui-dts"; exit 1; }
mkdir -p "$tmp/p/src"
"$ZINC" tsconfig "$tmp/p" >/dev/null || exit 1
cat > "$tmp/p/src/main.tsx" <<'P'
import { PointerEvent, KeyEvent } from 'zinc:ui';
function key(e: KeyEvent): void { console.log(e.key); }
export function App(): i32 {
  return <View className="p-4" onPointerDown={(e) => console.log(`${e.x} ${e.shift}`)} onKeyDown={key} onClick={() => {}}><Text>Hi</Text></View>;
}
export function down(e: PointerEvent): number { return e.y; }
P
out=$("$tsc" -p "$tmp/p" 2>&1) || { echo "the editor rejects a correct program: $out"; exit 1; }
echo 'export function Bad(): i32 { return <View onPointerDown={(e) => e.nope} />; }' > "$tmp/p/src/bad.tsx"
out=$("$tsc" -p "$tmp/p" 2>&1)
case "$out" in *"bad.tsx"*"'nope' does not exist on type 'PointerEvent'"*) ;; *) echo "the editor does not type onPointerDown's event: $out"; exit 1 ;; esac
echo "ui d.ts: ok"
