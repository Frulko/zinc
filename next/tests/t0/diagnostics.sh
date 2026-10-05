#!/bin/sh
# Registry: every code has a fixture, every registry example triggers its own code, docs/diagnostics.md is current,
# `zinc explain` prints entries and rejects unknown codes.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for code in $("$ZINC" explain --codes); do
  grep -qs "^$code " tests/golden/*/errors/*.expect || { echo "no fixture for $code"; fail=1; }
  "$ZINC" explain "$code" | sed '1,/^Example:/d' > "$tmp/ex.ts"
  got=$("$ZINC" parse --check "$tmp/ex.ts" 2>&1 | sed -E 's/^[^:]*:[0-9]+:[0-9]+: error (Z[0-9]+):.*/\1/')
  [ "$got" = "$code" ] || { echo "example of $code reports '$got'"; fail=1; }
done
"$ZINC" explain --markdown | diff -q - docs/diagnostics.md >/dev/null || { echo "docs/diagnostics.md is stale: run zinc explain --markdown > docs/diagnostics.md"; fail=1; }
"$ZINC" explain Z9999 >/dev/null 2>&1 && { echo "unknown code accepted"; fail=1; }
exit $fail
