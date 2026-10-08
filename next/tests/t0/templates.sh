#!/bin/sh
# Project templates (ZN-315): templates/<name>/ with template.json; `zinc new --list` prints each with its description and targets, `zinc new <t> <dir>`
# copies the template's files (not template.json) with {{name}} and {{id}} filled, writes tsconfig.json, and the project passes `zinc check` and
# `zinc test`; an unknown template (exit 2) and a non-empty directory (exit 1) are refused with the list of templates; `zinc init --template` is an alias.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tpl=$(cd ../templates && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
list=$("$Z" new --list)
for d in "$tpl"/*/; do
  t=$(basename "$d")
  echo "$list" | grep -q "^  $t .*(.*)$" || { echo "zinc new --list misses $t: $list"; fail=1; }
  p="$tmp/My $t"
  "$Z" new "$t" "$p" >/dev/null || { echo "zinc new $t failed"; fail=1; continue; }
  (cd "$d" && find . -type f ! -name template.json | sort) > "$tmp/want"
  (cd "$p" && find . -type f ! -name tsconfig.json | sort) > "$tmp/got"
  cmp -s "$tmp/want" "$tmp/got" || { echo "$t: files differ: $(diff "$tmp/want" "$tmp/got" | head -4)"; fail=1; }
  grep -q '"name": "My '"$t"'"' "$p/zinc.json" || { echo "$t: {{name}} not filled in zinc.json"; fail=1; }
  grep -rq '{{' "$p" && { echo "$t: a variable is left: $(grep -rl '{{' "$p" | head -2)"; fail=1; }
  (cd "$p" && "$Z" check >/dev/null 2>&1) || { echo "$t: zinc check fails in the new project"; fail=1; }
  (cd "$p" && "$Z" test 2>&1 | tail -1 | grep -q ' 0 failure') || { echo "$t: zinc test fails in the new project"; fail=1; }
done
"$Z" new nope "$tmp/x" > /dev/null 2> "$tmp/err"; [ $? -eq 2 ] && grep -q "^  game " "$tmp/err" || { echo "an unknown template must exit 2 with the list"; fail=1; }
"$Z" new game "$tmp/My game" > /dev/null 2> "$tmp/err"; [ $? -eq 1 ] && grep -q "^  game " "$tmp/err" || { echo "a non-empty directory must exit 1 with the list"; fail=1; }
"$Z" init "$tmp/alias" --template cli >/dev/null && cmp -s "$tmp/alias/src/main.ts" "$tpl/cli/src/main.ts" || { echo "zinc init --template is not zinc new"; fail=1; }
[ $fail -eq 0 ] && echo "templates: ok"
exit $fail
