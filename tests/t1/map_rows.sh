#!/bin/sh
# Map and Set rows (ZN-602): integer keys probe inline, an absent key is inserted without a second search, compiled code calls the hot
# rows directly. Erased keys, float (NaN, -0) and string keys, chained set() print the same, interpreted and compiled, as the prototype
# (tests/data/map_rows/expected.txt).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$ZINC" run tests/data/map_rows/main.ts > "$tmp/i.txt" 2>&1
diff -q "$tmp/i.txt" tests/data/map_rows/expected.txt >/dev/null || { echo "interpreter output differs:"; diff "$tmp/i.txt" tests/data/map_rows/expected.txt | head -5; fail=1; }
"$ZINC" build tests/data/map_rows/main.ts -o "$tmp/app" >"$tmp/b.txt" 2>&1 || { echo "AOT build failed: $(head -c 300 "$tmp/b.txt")"; exit 1; }
"$tmp/app" > "$tmp/a.txt" 2>&1
diff -q "$tmp/a.txt" tests/data/map_rows/expected.txt >/dev/null || { echo "AOT output differs:"; diff "$tmp/a.txt" tests/data/map_rows/expected.txt | head -5; fail=1; }
exit $fail
