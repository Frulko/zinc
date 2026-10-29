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
# A module the sim imports (a helper the plugin shares with it) imports the spec's records while the sim loads: it gets the spec's
# declarations, not a circular import of the sim.
cat > "$tmp/native/x.spec.ts" <<'SPEC'
import { NativeModule, requireNative } from 'zinc:native';
export interface Item { name: string; n: i32; }
export interface Spec extends NativeModule { items(): Item[]; }
export default requireNative<Spec>('X');
SPEC
printf "import type { Item } from './native/x.spec';\nexport function make(name: string): Item { return { name: name, n: name.length }; }\n" > "$tmp/helper.ts"
printf "import type { Item } from './x.spec';\nimport { make } from '../helper';\nexport default { items: (): Item[] => [make('ab'), make('xyz')] };\n" > "$tmp/native/x.sim.ts"
printf "import S from './native/x.spec';\nimport { make } from './helper';\nfor (const i of S.items()) console.log(i.name, i.n);\nconsole.log(make('q').n);\n" > "$tmp/index.ts"
out=$(ZINC_NATIVE=sim "$ZINC" run "$tmp/index.ts" 2>&1)
[ "$out" = "ab 2
xyz 3
1" ] || { echo "a helper of the sim importing the spec's records: $out"; exit 1; }
