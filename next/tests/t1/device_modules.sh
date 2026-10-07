#!/bin/sh
# The device core says which host modules it has (ZN-131): `zinc run --target esp32` refuses a program that imports another one before a byte of it is uploaded, and names the module.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
printf "import { width } from 'zinc:gfx';\nconsole.log(width());\n" > "$tmp/gfx.ts"
printf "import * as path from 'zinc:path';\nconsole.log(path.join('a', 'b'));\n" > "$tmp/path.ts"
run() { timeout 60 "$ZINC" run "$1" --target esp32 --device "$ZINC device-sim $2" 2>&1; }
out=$(run "$tmp/gfx.ts" "--modules zinc:sys"); code=$?
case "$out" in *"imports 'zinc:gfx' but the device does not provide it (it has: zinc:sys)"*) ;; *) echo "no early refusal: $out"; fail=1 ;; esac
[ "$code" -ne 0 ] || { echo "refusal exits 0"; fail=1; }
out=$(run "$tmp/gfx.ts" "--board waveshare-esp32-s3-matrix")
[ "$out" = 320 ] || { echo "the s3-matrix board has a display: '$out'"; fail=1; }
out=$(run "$tmp/path.ts" "--modules zinc:sys")
[ "$out" = "a/b" ] || { echo "zinc:path is Zinc source over zinc:sys: '$out'"; fail=1; }
out=$(run "$tmp/gfx.ts" "")
[ "$out" = 320 ] || { echo "a core that lists nothing is not checked: '$out'"; fail=1; }
out=$(run "$tmp/gfx.ts" "--board nope"); case "$out" in *"unknown board 'nope'"*) ;; *) echo "unknown board: $out"; fail=1 ;; esac
[ $fail -eq 0 ] && echo "device modules: ok"
exit $fail
