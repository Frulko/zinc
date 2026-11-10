#!/bin/sh
# Run against a configured OFF build; never start a nested configure/build from a test.
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
bin=$(dirname "$Z")
[ -x "$bin/host_permissions_test" ] || exit 77
"$bin/host_permissions_test"
grep -Eq '^ZN_HOST_GFX:BOOL=(OFF|FALSE|0)$' "$bin/CMakeCache.txt" || exit 77
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_STEPS=0
echo "console.log('console without graphics');" > "$tmp/main.ts"
"$Z" check "$tmp/main.ts" > "$tmp/check" 2>&1
"$Z" run --interp "$tmp/main.ts" > "$tmp/out" 2>&1
grep -qx 'console without graphics' "$tmp/out"
echo "setTimeout(() => console.log('timer without graphics'), 1);" > "$tmp/timer.js"
"$Z" run --engine quickjs "$tmp/timer.js" > "$tmp/out" 2>&1
grep -qx 'timer without graphics' "$tmp/out"
echo "import * as fs from 'zinc:fs'; console.log(fs.readText('missing'));" > "$tmp/io.ts"
if "$Z" run --engine quickjs "$tmp/io.ts" > "$tmp/out" 2>&1; then
  echo 'unavailable host I/O unexpectedly succeeded'
  exit 1
fi
grep -q 'not available in this build' "$tmp/out"
reject() {
  if "$Z" "$@" > "$tmp/out" 2>&1; then
    echo "unexpected success: $*"
    exit 1
  fi
  grep -q 'this build has no graphics host' "$tmp/out"
}
reject capture "$tmp/main.ts" -o "$tmp/out.png"
reject capture --scene missing "$tmp/main.ts" -o "$tmp/out.png"
reject capture --scene missing "$tmp/main.ts" --bench 1 1
reject capture --scene missing --damage missing
reject capture --scene missing "$tmp/main.ts" --scroll missing
reject capture --stroke-check 1
reject bench "$tmp/main.ts" --frames 1
echo 'no_graphics_host: ok'
