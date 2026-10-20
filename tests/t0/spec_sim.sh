#!/bin/sh
# A plugin's native/x.spec.ts is stood in for by its x.sim.ts (ZN-075): the calls are written against the Spec (here 5 parameters),
# the sim implements fewer (TypeScript lets a function drop trailing parameters), and the missing ones are added unused.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/native"
cat > "$tmp/native/x.spec.ts" <<'SPEC'
import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  open(path: string, flags: i32, mode: i32, tag: string, on: boolean): i32;
  name(): string;
  onEvent(cb: (kind: string, data: string) => void): void;
}
export default requireNative<Spec>('X');
SPEC
cat > "$tmp/native/x.sim.ts" <<'SIM'
export default {
  open: (path: string) => path.length,
  name: () => 'sim',
  onEvent: (cb: (kind: string, data: string) => void) => { cb('k', 'd'); },
}
SIM
printf "import S from './native/x.spec'\nconsole.log(S.open('abc', 1, 2, 't', true), S.name())\nS.onEvent((k, d) => { console.log(k, d) })\n" > "$tmp/index.ts"
out=$("$ZINC" run "$tmp/index.ts" 2>&1)
[ "$out" = "3 sim
k d" ] || { echo "sim with fewer parameters than the Spec: $out"; exit 1; }
