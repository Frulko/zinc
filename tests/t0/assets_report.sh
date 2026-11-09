#!/bin/sh
# zinc assets report (ZN-437) on tests/data/assets_check: the groups of report.json with their assets and sizes; --diff old.json names the
# groups that changed (level1 grew, default is new), with sizes before and after, and lists the unchanged ones (boot); the same report
# against itself changes nothing; a project never built says how to make its report.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
p="$tmp/p"
mkdir -p "$p/assets/boot" "$p/assets/level1"
cp tests/data/assets_check/zinc.json "$p/"
head -c 4096 /dev/urandom > "$p/assets/boot/hud.bin"
head -c 20000 /dev/urandom > "$p/assets/level1/a.bin"
export ZINC_HEADLESS=1 HOME="$tmp" ZINC_HOME="$tmp/.zinc"
fail=0
want() { printf '%s\n' "$2" | grep -qE -- "$3" || { echo "assets_report: $1: no /$3/ in:"; printf '%s\n' "$2" | head -20; fail=1; }; }

out=$("$Z" assets report "$p" --target linux 2>&1); rc=$?
[ $rc -eq 1 ] || { echo "assets_report: no report: exit $rc, expected 1"; fail=1; }
want missing "$out" "no report at .*report.json \(zinc assets build --target linux writes it\)"

"$Z" assets build "$p" --target linux >/dev/null || { echo "assets_report: build failed"; exit 1; }
cp "$p/build/assets/linux/report.json" "$tmp/old.json"
out=$("$Z" assets report "$p" --target linux 2>&1)
want table "$out" "^  group +assets +pack +memory +gpu$"
want table "$out" "^  level1 +1 +20 KB +20 KB +0 B$"
want table "$out" "^  total +2 "

head -c 30000 /dev/urandom > "$p/assets/level1/b.bin"
echo note > "$p/assets/note.txt"
"$Z" assets build "$p" --target linux >/dev/null || { echo "assets_report: second build failed"; exit 1; }
out=$("$Z" assets report "$p/build/assets/linux/report.json" --diff "$tmp/old.json" 2>&1)
want diff "$out" "^2 groups changed since .*old.json:$"
want diff "$out" "^  level1 +pack 20 KB -> 49 KB \(\+29 KB, \+150%\), memory 20 KB -> 49 KB \(\+29 KB, \+150%\), 1 -> 2 assets$"
want diff "$out" "^  default +new: pack [0-9]+ B, memory 5 B, 1 asset$"
want diff "$out" "^  total +pack "
want diff "$out" "^unchanged: boot$"

out=$("$Z" assets report "$tmp/old.json" --diff "$tmp/old.json" 2>&1)
want same "$out" "^no group changed since .*old.json \(2 groups\)$"
[ $fail -eq 0 ] && echo "assets_report: ok"
exit $fail
