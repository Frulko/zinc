#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
export ZINC_ROOT="$root" ZINC_HEADLESS=1 ZINC_STEPS=0
fixtures="$root/tests/data/generated-runtime"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export ZINC_BOARD_ROOT="$tmp/empty"
mkdir "$ZINC_BOARD_ROOT"
for engine in --interp '--engine quickjs'; do
  check() {
    got=$("$ZINC" run "$fixtures/$1" $engine 2>&1)
    [ "$got" = "$2" ] || { printf '%s: %s\n' "$1 $engine" "$got"; exit 1; }
  }
  check profile.ts true
  check bare.ts true
  check runtime.ts 'true true true true true true'
  check transitive.ts true
  check namespace.ts 'true true'
  check effect-main.ts "$(printf 'effect\n4')"
done
[ "$("$ZINC" run "$fixtures/dynamic.js" --engine quickjs 2>&1)" = 'true true' ]
for entry in profile bare; do
  "$ZINC" --emit=cpp "$fixtures/$entry.ts" > "$tmp/$entry.cpp" 2>&1
  if grep -E 'sysDevice|jsonParse|__board|board.ts' "$tmp/$entry.cpp"; then echo 'unused runtime group retained'; exit 1; fi
done

if "$ZINC" check "$fixtures/type-value.ts" > "$tmp/type-value.log" 2>&1; then echo 'type-only value import unexpectedly accepted'; exit 1; fi
grep 'Z0101' "$tmp/type-value.log" >/dev/null
for options in '--target' '--target nope' '--target pi --profile macos' '--profile=macos --target=pi'; do
  if "$ZINC" doctor $options > "$tmp/doctor-error.log" 2>&1; then echo "doctor accepted $options"; exit 1; fi
  grep 'zinc doctor:' "$tmp/doctor-error.log" >/dev/null
done
if ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1; then
  for entry in profile bare; do
    "$ZINC" bundle "$fixtures/$entry.ts" -o "$tmp/$entry.js" >/dev/null 2>&1
    if grep -E 'sysDevice|JSON.parse|__board|board.ts' "$tmp/$entry.js"; then echo 'unused group in bundle'; exit 1; fi
  done
  "$ZINC" bundle "$fixtures/runtime.ts" -o "$tmp/runtime.js" >/dev/null 2>&1
  [ "$("$ZINC" run "$tmp/runtime.js" --engine quickjs 2>&1)" = 'true true true true true true' ]
fi
[ "$("$ZINC" run "$fixtures/profile.js" --engine quickjs 2>&1)" = true ]
[ "$("$ZINC" run "$fixtures/mapped/main.js" --engine quickjs 2>&1)" = '19 mapped true' ]
