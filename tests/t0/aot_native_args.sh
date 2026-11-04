#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"$ZINC" --emit=cpp tests/golden/run/native_call.ts > "$tmp/call.cpp"
"$ZINC" --emit=cpp tests/golden/run/native_callbacks.ts > "$tmp/callbacks.cpp"
python3 - "$tmp" <<'PY'
import pathlib, re, sys
for name, arities in [('call', [2, 2, 1, 1, 1]), ('callbacks', [1, 1, 1, 1, 3, 2])]:
    seen = set()
    for line in (pathlib.Path(sys.argv[1]) / (name + '.cpp')).read_text().splitlines():
        match = re.search(r'nativeCall\(m, (\d+), win \+ (\d+), win \+ \d+\)', line)
        if not match:
            continue
        native, base = map(int, match.groups())
        expected = list(range(base, base + arities[native]))
        assert list(map(int, re.findall(r'win\[(\d+)\] = r\[', line))) == expected, line
        assert list(map(int, re.findall(r'r\[(\d+)\] = win\[', line))) == expected, line
        seen.add(native)
    assert len(seen) == len(arities), (name, seen)
PY
"$ZINC" build tests/golden/run/native_callbacks.ts -o "$tmp/callbacks" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
"$tmp/callbacks" > "$tmp/out"
diff -u tests/golden/run/native_callbacks.out "$tmp/out"
echo 'aot native args: ok'
