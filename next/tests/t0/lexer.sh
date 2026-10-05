#!/bin/sh
# Lexer: every corpus source tokenises with no error and exact position round-trip; 5 golden token dumps match.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for f in ../tests/conformance/*.ts ../tests/conformance/*.tsx ../tests/bench/kernels/*.ts ../tests/visual/clock.ts; do
  "$ZINC" lex --check "$f" || fail=1
done
for g in tests/golden/lexer/*.tok; do
  n=$(basename "$g" .tok)
  src=$(ls ../tests/conformance/"$n" ../tests/bench/kernels/"$n" 2>/dev/null | head -1)
  "$ZINC" lex --dump "$src" | diff -q - "$g" >/dev/null || { echo "golden differs: $n"; fail=1; }
done
exit $fail
