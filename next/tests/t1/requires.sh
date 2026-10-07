#!/bin/sh
# Capability checks (ZN-123): zinc.json "requires", plugin.json "requires" (Z5005) and --force, against the profile in force.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
out=$("$ZINC" run ../examples/hero --profile esp32 2>&1); code=$?
case "$out" in *"hero cannot run on esp32: it requires heap>=8M (esp32 has heap 160K) (zinc.json \"requires\"; --force builds anyway)"*) [ $code -ne 0 ] || { echo "hero on esp32 exits 0"; fail=1; } ;; *) echo "hero on esp32: $out"; fail=1 ;; esac
printf "// zinc-profile: esp32\nimport 'zinc:sqlite';\n" > "$tmp/sq.ts"
out=$("$ZINC" run "$tmp/sq.ts" 2>&1)
case "$out" in *"error Z5005"*"plugin sqlite requires heap>=4M"*) ;; *) echo "sqlite on esp32: $out"; fail=1 ;; esac
printf "// zinc-profile: rmpp\nimport 'zinc:ffi';\n" > "$tmp/ffi.ts"
out=$("$ZINC" run "$tmp/ffi.ts" 2>&1)
case "$out" in *"error Z5005"*"plugin ffi requires dynlib"*) ;; *) echo "ffi on rmpp: $out"; fail=1 ;; esac
out=$("$ZINC" run "$tmp/sq.ts" --force 2>&1)
case "$out" in *"warning: plugin sqlite requires heap>=4M"*"building anyway (--force)"*) ;; *) echo "--force: $out"; fail=1 ;; esac
[ $fail -eq 0 ] && echo "requires: ok"
exit $fail
