#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
cat > "$tmp/main.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { views(a: u8[], b: u8[], c: string[], d: string[]): i32; }
const n = requireNative<Spec>('Fixture');
console.log(n.views([1, 2], [3, 4], ['a', 'bc'], ['d', 'ef']));
console.log(n.views([], [], [], []));
TS
printf '607\n0\n' > "$tmp/expected"
"$ZINC" build "$tmp/main.ts" -o "$tmp/app" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
"$tmp/app" > "$tmp/out"; diff -u "$tmp/expected" "$tmp/out"
"$ZINC" run "$tmp/main.ts" --interp > "$tmp/out"; diff -u "$tmp/expected" "$tmp/out"
"$ZINC" run "$tmp/main.ts" --engine quickjs > "$tmp/out"; diff -u "$tmp/expected" "$tmp/out"
echo 'native views: ok'
