#!/bin/sh
# zinc test runners (ZN-124): the project mode (test-*.ts, *.test.ts; exit 0 passes, a failed zinc:assert fails), --runner skips with the reason, quickjs on plain programs.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$ZINC" test ../examples/testing/tests >"$tmp/o" 2>&1 || { echo "examples/testing/tests fails"; cat "$tmp/o"; fail=1; }
grep -q "2 test file(s), 0 failure(s)" "$tmp/o" || { echo "no summary: $(cat "$tmp/o")"; fail=1; }
printf "import * as assert from 'zinc:assert';\nassert.equal(1 + 1, 3);\n" > "$tmp/test-bad.ts"
out=$("$ZINC" test "$tmp" 2>&1) && { echo "a failed assert passes"; fail=1; }
case "$out" in *"expected 3, got 2"*) ;; *) echo "no assert message: $out"; fail=1 ;; esac
out=$("$ZINC" test --runner devicesim 2>&1)
case "$out" in *"skip all [devicesim] (the device simulator is not built yet"*) ;; *) echo "devicesim: $out"; fail=1 ;; esac
out=$("$ZINC" test --runner esp32-qemu 2>&1)
case "$out" in *"skip all [esp32-qemu] (esp32-qemu runs the esp32 profile only)"*) ;; *) echo "esp32-qemu: $out"; fail=1 ;; esac
mkdir "$tmp/c"; cp ../tests/conformance/conversions.ts ../tests/conformance/conversions.out ../tests/conformance/errors.ts ../tests/conformance/errors.out "$tmp/c/"
"$ZINC" test --runner quickjs "$tmp/c" 2>&1 | grep -q "^ok   conversions.ts \[macos/quickjs\]" || { echo "quickjs does not run conversions"; fail=1; }
"$ZINC" test --runner aot "$tmp/c" 2>&1 | grep -q "^ok   conversions.ts \[macos/aot\]" || { echo "aot does not run conversions"; fail=1; }
[ $fail -eq 0 ] && echo "zinc test runners: ok"
exit $fail
