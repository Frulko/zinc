#!/bin/sh
# Dead native declarations are removed and the surviving call index is remapped before ZBC is serialized.
cd "$(dirname "$0")/../.." || exit 2
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule {
  fail(): void;
  add(a: i32, b: i32): i32;
}
const n = requireNative<Spec>('Fixture');
function unused(): void { console.log("DEAD_NATIVE_STRING"); n.fail(); }
console.log("answer", n.add(19, 23));
TS
"$ZINC" --emit=zbc-bin "$tmp/main.ts" "$tmp/main.zbc"
"$ZINC" zbc --check "$tmp/main.zbc" >/dev/null
python3 - "$tmp/main.zbc" <<'PY'
import sys
b = open(sys.argv[1], 'rb').read()
assert b.count(b'\x07\x00\x00\x00Fixture') == 1, 'unused native row was retained'
assert b'DEAD_NATIVE_STRING' not in b, 'dead string constant was retained'
assert b'answer' in b, 'live string constant was dropped'
assert b'ii>i' in b, 'used native signature was removed'
PY
"$ZINC" run --interp "$tmp/main.zbc" > "$tmp/out"
[ "$(cat "$tmp/out")" = "answer 42" ] || { echo 'surviving native call used the wrong export'; exit 1; }

# The parent no longer accidentally registers a native module used only by its worker.
cat > "$tmp/worker.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
import { self, MessageEvent } from 'zinc:worker';
interface Spec extends NativeModule { add(a: i32, b: i32): i32 }
const n = requireNative<Spec>('Fixture');
self.onmessage = (e: MessageEvent<i32>) => { self.postMessage(n.add(e.data, 23)); };
TS
cat > "$tmp/parent.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
import { Worker, MessageEvent, ErrorEvent } from 'zinc:worker';
interface Spec extends NativeModule { fail(): void }
const n = requireNative<Spec>('Fixture');
function unused(): void { console.log("DEAD_NATIVE_STRING"); n.fail(); }
const w = new Worker<i32, i32>(new URL('./worker.ts', import.meta.url));
w.onmessage = (e: MessageEvent<i32>) => { console.log(e.data); w.terminate(); };
w.onerror = (e: ErrorEvent) => { console.log(e.message); w.terminate(); };
w.postMessage(19);
TS
"$ZINC" build "$tmp/parent.ts" -o "$tmp/parent" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
ZINC_HEADLESS=1 timeout 10 "$tmp/parent" > "$tmp/out"
grep -q 'native Fixture.add: native modules run on the main thread only' "$tmp/out" || { echo 'worker native module was not registered before enforcing thread policy'; exit 1; }
