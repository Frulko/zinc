#!/bin/sh
# zinc migrate (src/lint/migrate.cpp): the two codemods turn tests/golden/migrate/before.* into after.* (code, props, nested JSX, a .md fence
# of tsx and jsx; comments, strings, JSX text, inline code and a sh fence untouched), a second run changes nothing, --dry-run writes nothing
# and prints the diff, one codemod alone does only its part, an unknown lowercase tag is left for a person and named, and the result checks.
cd "$(dirname "$0")/../.." || exit 2
fail=0
g=tests/golden/migrate
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp $g/before.tsx "$tmp/a.tsx"; cp $g/before.md "$tmp/a.md"
"$ZINC" migrate --list | grep -q "^jsx-classname .*Z0006" || { echo "--list has no jsx-classname"; fail=1; }
"$ZINC" migrate --list | grep -q "^jsx-capitalised-tags .*Z0007" || { echo "--list has no jsx-capitalised-tags"; fail=1; }
out=$("$ZINC" migrate "$tmp" 2>"$tmp/err")
cmp -s "$tmp/a.tsx" $g/before.tsx || { echo "--dry-run wrote a.tsx"; fail=1; }
echo "$out" | grep -qF -- '+  return <ScrollView className="grow">' || { echo "--dry-run diff lacks the ScrollView line: $out"; fail=1; }
grep -q "a.tsx:20:6: <frobnicate> is not a component" "$tmp/err" || { echo "the unknown tag is not named: $(cat "$tmp/err")"; fail=1; }
"$ZINC" migrate jsx-capitalised-tags --apply "$tmp/a.tsx" >/dev/null 2>&1
grep -q 'class="grow"' "$tmp/a.tsx" && grep -q '<ScrollView' "$tmp/a.tsx" || { echo "jsx-capitalised-tags alone did more or less than the tags"; fail=1; }
"$ZINC" migrate --apply "$tmp" >/dev/null 2>&1
cmp -s "$tmp/a.tsx" $g/after.tsx || { echo "a.tsx differs from after.tsx:"; diff "$tmp/a.tsx" $g/after.tsx; fail=1; }
cmp -s "$tmp/a.md" $g/after.md || { echo "a.md differs from after.md:"; diff "$tmp/a.md" $g/after.md; fail=1; }
"$ZINC" migrate --apply "$tmp" 2>&1 | grep -q "nothing to rewrite" || { echo "a second run rewrote again"; fail=1; }
# the error fixtures, migrated, compile; the engine's message names the codemod
cp tests/golden/jsx/errors/class_attr.tsx tests/golden/jsx/errors/class_prop.tsx tests/golden/jsx/errors/lowercase_tag.tsx tests/golden/jsx/errors/lowercase_html.tsx "$tmp/"
"$ZINC" check "$tmp/class_attr.tsx" 2>&1 | grep -q "zinc migrate jsx-classname --apply" || { echo "Z0006 does not name its codemod"; fail=1; }
"$ZINC" check "$tmp/lowercase_tag.tsx" 2>&1 | grep -q "zinc migrate jsx-capitalised-tags --apply" || { echo "Z0007 does not name its codemod"; fail=1; }
"$ZINC" migrate --apply "$tmp" >/dev/null 2>&1
for f in class_attr class_prop lowercase_tag lowercase_html; do
  "$ZINC" check --check "$tmp/$f.tsx" >/dev/null 2>&1 || { echo "migrated $f.tsx does not check: $("$ZINC" check --check "$tmp/$f.tsx" 2>&1 | head -1)"; fail=1; }
done
"$ZINC" migrate --bogus 2>/dev/null; [ $? = 2 ] || { echo "an unknown option is not exit 2"; fail=1; }
# ui-explicit-looks (D163): only when named; the old look of host Button, Input and TextArea family by family in front of the program's own
# classes (literals, ternaries, concatenations, templates, the file's constants), a kit's Button untouched, the unreadable ones named
l="$tmp/looks"; mkdir "$l"
cp $g/looks-before.tsx "$l/a.tsx"; cp $g/looks-before.md "$l/a.md"
"$ZINC" migrate --list | grep -q "^ui-explicit-looks " || { echo "--list has no ui-explicit-looks"; fail=1; }
"$ZINC" migrate --apply "$l" >/dev/null 2>&1
cmp -s "$l/a.tsx" $g/looks-before.tsx || { echo "ui-explicit-looks ran without being named"; fail=1; }
"$ZINC" migrate ui-explicit-looks --apply "$l" >/dev/null 2>"$tmp/err"
cmp -s "$l/a.tsx" $g/looks-after.tsx || { echo "a.tsx differs from looks-after.tsx:"; diff "$l/a.tsx" $g/looks-after.tsx; fail=1; }
cmp -s "$l/a.md" $g/looks-after.md || { echo "a.md differs from looks-after.md:"; diff "$l/a.md" $g/looks-after.md; fail=1; }
grep -q "a.tsx:23:6: <Input> takes a className zinc migrate cannot read" "$tmp/err" && grep -q "a.tsx:24:6: <Button> takes a className" "$tmp/err" || { echo "the unreadable classNames are not named: $(cat "$tmp/err")"; fail=1; }
"$ZINC" migrate ui-explicit-looks --apply "$l" 2>&1 | grep -q "nothing to rewrite" || { echo "ui-explicit-looks rewrote again"; fail=1; }
"$ZINC" check --check "$l/a.tsx" >/dev/null 2>&1 || { echo "the migrated looks do not check: $("$ZINC" check --check "$l/a.tsx" 2>&1 | head -1)"; fail=1; }
exit $fail
