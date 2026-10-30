#!/bin/sh
# ZN-774.28: errors that teach. Every code a beginner meets has, in `zinc explain`, a wrong program, two or three fixes and its lesson:
# the wrong program gives its code, each fix compiles with no error, the lesson's page exists, and at least 20 codes have them.
cd "$(dirname "$0")/../.." || exit 2
fail=0 codes=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for code in $("$ZINC" explain --codes); do
  out=$(ZINC_LANG=en "$ZINC" explain "$code")
  printf '%s\n' "$out" | grep -q '^Fixed:$' || continue
  codes=$((codes + 1))
  rm -f "$tmp"/p*
  # one file per program: p0 the example, p1.. its fixes (a section runs from its title to the next blank line)
  printf '%s\n' "$out" | awk -v dir="$tmp" '/^(Example|Fixed):$/ { f = dir "/p" n++; next } /^$/ { f = "" } f != "" { print > f }'
  n=0
  for p in "$tmp"/p*; do
    ex=$p.ts; grep -qE '/>|</' "$p" && ex=$p.tsx   # a JSX program is a .tsx file
    mv "$p" "$ex"
    got=$("$ZINC" check --check "$ex" 2>&1 | grep -oE 'error Z[0-9]{4}' | head -1 | cut -c7-)
    if [ "$n" -eq 0 ]; then [ "$got" = "$code" ] || { echo "$code: the wrong program gives '$got'"; fail=1; }
    else [ -z "$got" ] || { echo "$code: fix $n gives $got: $(cat "$ex" | head -1)"; fail=1; }; fi
    n=$((n + 1))
  done
  [ "$n" -ge 3 ] && [ "$n" -le 4 ] || { echo "$code: $((n - 1)) fixes, not two or three"; fail=1; }
  page=$(printf '%s\n' "$out" | sed -n 's|^Lesson: https://frulko.github.io/zinc/docs/\(.*\)/$|\1|p')
  [ -n "$page" ] && [ -f "docs/$page.md" ] || { echo "$code: its lesson '$page' is not a page of docs/"; fail=1; }
  printf '%s\n' "$out" | grep -q "^Reference: https://frulko.github.io/zinc/docs/diagnostics/#$(echo "$code" | tr 'Z' 'z')-" || { echo "$code: no reference link"; fail=1; }
done
[ "$codes" -ge 20 ] || { echo "only $codes codes have fixes, 20 at least"; fail=1; }
# the published page carries them too
grep -q '^Fixed:$' docs/diagnostics.md || { echo "docs/diagnostics.md has no fixes: run zinc explain --markdown > docs/diagnostics.md"; fail=1; }
exit $fail
