#!/bin/sh
# Real JSX (owner, 2026-10-16): `class` on any element is Z0006 (write className) and a lowercase tag is Z0007 (the message
# names the capitalised component). Each fixture of tests/golden/jsx/errors reports its .expect (`Zxxxx line:col`) and its fix;
# no spelling of the old form gets through, the --interp run and a .tsx entry of --engine quickjs included.
cd "$(dirname "$0")/../.." || exit 2
fail=0
d=tests/golden/jsx/errors
for f in $d/*.tsx; do
  got=$("$ZINC" check --check "$f" 2>&1 | sed -E 's/^[^:]*:([0-9]+:[0-9]+): error (Z[0-9]+):.*/\2 \1/' | head -1)
  [ "$got" = "$(cat "${f%.tsx}.expect")" ] || { echo "fixture $(basename "$f"): got '$got'"; fail=1; }
done
msg() { "$ZINC" run --interp "$d/$1.tsx" 2>&1 | grep -qF "$2" || { echo "$1: no '$2' in: $("$ZINC" run --interp "$d/$1.tsx" 2>&1 | head -2)"; fail=1; }; }
msg class_attr "class_attr.tsx:3:16: error Z0006"
msg class_attr "write className, not class, on <View>"
msg class_prop "class_prop.tsx:5:11: error Z0006"
msg class_prop "write className, not class, on <Card>"
msg lowercase_tag "lowercase_tag.tsx:4:6: error Z0007"
msg lowercase_tag "<scroll> is not a component: write <ScrollView>"
msg lowercase_html "<div> is not a component: write <View>"
msg lowercase_tag "zinc explain Z0007"
"$ZINC" explain Z0006 | grep -q "className" || { echo "zinc explain Z0006 does not name className"; fail=1; }
"$ZINC" explain Z0007 | grep -q "<View>" || { echo "zinc explain Z0007 does not name <View>"; fail=1; }
"$ZINC" run $d/lowercase_tag.tsx --engine quickjs >/dev/null 2>&1 && { echo "--engine quickjs ran a lowercase tag"; fail=1; }
# tools/jsx-migrate (needs Node and the checkout's TypeScript) turns the fixtures it can fix into programs that check
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp $d/class_attr.tsx $d/class_prop.tsx $d/lowercase_tag.tsx "$tmp/"
if command -v node >/dev/null 2>&1 && node tools/jsx-migrate "$tmp" >/dev/null 2>&1; then
  for f in "$tmp"/*.tsx; do "$ZINC" check --check "$f" >/dev/null 2>&1 || { echo "jsx-migrate left $(basename "$f") wrong: $("$ZINC" check --check "$f" 2>&1 | head -1)"; fail=1; }; done
fi
exit $fail
