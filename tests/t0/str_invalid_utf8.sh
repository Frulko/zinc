#!/bin/sh
# A string read from bytes that are not UTF-8 (a binary body read as text): every UTF-16 index below its length reads in bounds and the
# same in slice, charAt and substring (it read past the end before, a crash of the hub server on a 39 MB upload).
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'a\360A\200\342\202b\303' > "$tmp/bin.dat"
mkdir "$tmp/p" && cat > "$tmp/p/main.ts" <<'TS'
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
const s = fs.readText(sys.args()[0]);
let out = '';
for (let i: i32 = 0; i < s.length; i++) out += s.charAt(i) === s.slice(i, i + 1) && s.slice(i, i + 1) === s.substring(i, i + 1) ? '.' : 'x';
console.log(s.length.toString() + ' ' + out + ' ' + s.slice(0, 1) + s.slice(3, 4) + s.slice(5, 6));
TS
out=$(ZINC_LANG=en "$ZINC" run "$tmp/p/main.ts" -- "$tmp/bin.dat" 2>&1 | tail -n 1)
case "$out" in "7 ....... aAb") echo "str invalid utf8: ok" ;; *) echo "FAIL: $out"; exit 1 ;; esac
