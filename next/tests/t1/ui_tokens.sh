#!/bin/sh
# The class-token parser (ZN-252): tests/golden/ui-tokens prints, for 60 tokens, whether lib/std/ui.ts accepts them and the node fields they set (main.out). The compile-time
# check of the JSX lowering (src/frontend/jsx.cpp validClass) is a second copy of that grammar: it must accept exactly the tokens the runtime accepts.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 "$ZINC" run tests/golden/ui-tokens/main.tsx 2>&1 | diff -q - tests/golden/ui-tokens/main.out >/dev/null || { echo "token fields differ from tests/golden/ui-tokens/main.out"; fail=1; }
acc=$(awk '$2 == "true" {print $1}' tests/golden/ui-tokens/main.out)
{ echo "import { render } from 'zinc:ui/react';"; echo "function S(): i32 { return <View>"; for t in $acc; do echo "<View class=\"$t\" />"; done; echo "</View>; }"; echo "render(S, 0xffffff, null);"; } > "$tmp/accepted.tsx"
"$ZINC" check "$tmp/accepted.tsx" 2>&1 | grep -q "unknown class" && { echo "the JSX check refuses a token the runtime accepts: $("$ZINC" check "$tmp/accepted.tsx" 2>&1 | grep 'unknown class' | head -1)"; fail=1; }
for t in $(awk '$2 == "false" && $1 !~ /:/ {print $1}' tests/golden/ui-tokens/main.out); do
  printf "import { render } from 'zinc:ui/react';\nfunction S(): i32 { return <View class=\"%s\" />; }\nrender(S, 0xffffff, null);\n" "$t" > "$tmp/r.tsx"
  "$ZINC" check "$tmp/r.tsx" 2>&1 | grep -q "unknown class" || { echo "the JSX check accepts '$t', the runtime refuses it"; fail=1; }
done
# hit test follows z-index, visibility and pointer-events (ZN-255)
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x160 "$ZINC" run tests/golden/ui-hit/main.tsx 2>&1 | diff -q - tests/golden/ui-hit/main.out >/dev/null || { echo "hit test differs from tests/golden/ui-hit/main.out"; fail=1; }
# colour tokens (ZN-259): the same 35 strings, the same values on the f32 build and on the fixed-point profile of the PS1 (no 24-bit colour in a `number`)
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 "$ZINC" run tests/golden/ui-colors/main.tsx 2>&1 | diff -q - tests/golden/ui-colors/main.out >/dev/null || { echo "colour tokens differ from tests/golden/ui-colors/main.out"; fail=1; }
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 "$ZINC" run --profile ps1 tests/golden/ui-colors/main.tsx 2>&1 | diff -q - tests/golden/ui-colors/main.out >/dev/null || { echo "colour tokens differ under --profile ps1"; fail=1; }
exit $fail
