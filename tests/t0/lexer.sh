#!/bin/sh
# Lexer: every corpus source tokenises with no error and exact position round-trip; 5 golden token dumps match.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for f in tests/conformance/*.ts tests/conformance/*.tsx tests/bench/kernels/*.ts tests/visual/clock.ts; do
  "$ZINC" lex --check "$f" || fail=1
done
for g in tests/golden/lexer/*.tok; do
  n=$(basename "$g" .tok)
  src=$(ls tests/conformance/"$n" tests/bench/kernels/"$n" 2>/dev/null | head -1)
  # Preserve the prototype's lexical input when the running UI fixture gains explicit styles.
  [ ! -f "tests/data/lexer/$n" ] || src="tests/data/lexer/$n"
  "$ZINC" lex --dump "$src" | diff -q - "$g" >/dev/null || { echo "golden differs: $n"; fail=1; }
done
# JSX nesting (ZN-998): a template substitution is its own context, so a stray </b> inside one does not leak a negative depth to the JSX after
# it; an unmatched closing tag is a diagnostic that names it
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'const s = `${</b>}`;\nconst x = <Text>y</Text>;\n' > "$tmp/tpl.tsx"
"$ZINC" lex --dump "$tmp/tpl.tsx" | grep -q "^2:17 JsxText y$" || { echo "a template substitution leaks its JSX depth: $("$ZINC" lex --dump "$tmp/tpl.tsx" | sed -n '9,14p')"; fail=1; }
printf 'const a = </View>;\nconst b = <Text>x</Text>;\n' > "$tmp/close.tsx"
out=$("$ZINC" check "$tmp/close.tsx" 2>&1)
echo "$out" | grep -q "1:11: error Z0002.*closing tag </View> has no opening tag" || { echo "an unmatched closing tag: $out"; fail=1; }
exit $fail
