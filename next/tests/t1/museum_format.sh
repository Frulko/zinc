#!/bin/sh
# Museum table, the project format (ZN-650.01, examples/museum-table/src/project.ts, docs/museum-table-format.md): the sample project loads, uses
# every kind of medium, leaves no sequence without a link to it and is in canonical form (load, save gives its bytes); a file written by hand
# saves to a form that loads and saves to the same bytes; fifteen broken files are each refused with the message that names the field;
# a sequence nothing leads to is named, and one that only a point of interest leads to is not.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/museum-table; d=$PWD/tests/data/museum_format
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
check() { "$ZINC" run "$ex/src/check.ts" -- "$@" 2>&1; }

got=$(check --save "$tmp/sample.json" "$ex/assets/project.json")
case $got in
  'project.json: ok, "floating-world" version 1, languages fr en, '*', canonical') ;;
  *) echo "the sample project: $got"; fail=1 ;;
esac
for kind in photo model panorama text audio video; do
  case $got in *" $kind"[,\;]*) ;; *) echo "the sample project has no $kind"; fail=1 ;; esac
done
cmp -s "$tmp/sample.json" "$ex/assets/project.json" || { echo "the sample project does not save to the same bytes"; fail=1; }

first=$(check --save "$tmp/a.json" "$d/small.json"); second=$(check --save "$tmp/b.json" "$tmp/a.json")
case "$first|$second" in *', not canonical|a.json: ok, '*', canonical') ;; *) echo "small.json: $first / $second"; fail=1 ;; esac
cmp -s "$tmp/a.json" "$tmp/b.json" || { echo "small.json: load, save, load, save gives other bytes"; fail=1; }

# a sequence reached only through a point of interest is not lost; one that nothing leads to is named
case $(check "$d/by-a-point.json") in *'no link leads to'*) echo "by-a-point.json: the sequence a point of interest leads to is reported lost"; fail=1 ;; esac
case $(check "$d/island.json") in *'island.json: no link leads to island') ;; *) echo "island.json: the sequence nothing leads to is not named"; fail=1 ;; esac

files=$(sed 's/: .*//' "$d/expected.txt" | sed "s|^|$d/|")
got=$(check $files) && { echo "broken files were accepted"; fail=1; }
[ "$got" = "$(cat "$d/expected.txt")" ] || { printf 'broken files, messages differ:\n%s\n' "$got" | diff - "$d/expected.txt" | head -20; fail=1; }
[ $fail = 0 ] && echo "museum_format: ok"
exit $fail
