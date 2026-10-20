#!/bin/sh
# Embedded TrueType files (ZN-428): subset to what the program can show (tests/golden/res), whole for a "text": "shaped" project (the shaper reads
# every table): tests/golden/shaped-ui keeps lib/fonts byte for byte.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" bake tests/golden/res/main.ts -o "$tmp/sub.bin" || { echo "zinc bake failed"; exit 1; }
"$ZINC" bake tests/golden/shaped-ui/main.tsx -o "$tmp/whole.bin" || { echo "zinc bake failed on the shaped project"; exit 1; }
python3 - "$tmp/sub.bin" "$tmp/whole.bin" ../lib/fonts <<'EOF'
import struct, sys
def ttfs(path):
    b = open(path, 'rb').read(); p = 4
    def u32():
        nonlocal p; v = struct.unpack_from('<I', b, p)[0]; p += 4; return v
    def string():
        nonlocal p; n = u32(); s = b[p:p+n].decode(); p += n; return s
    for _ in range(u32()):
        string(); p += 16; ng = u32(); p += ng * 28; nb = u32(); p += nb
    for _ in range(u32()):
        string(); w = u32(); h = u32(); u32(); p += w * h * 4
    out = {}
    for _ in range(u32()):
        n = string(); k = u32(); out[n] = b[p:p+k]; p += k
    return out
files = {'sans': 'Inter-Regular.ttf', 'sans-bold': 'Inter-Bold.ttf', 'mono': 'JetBrainsMono-Regular.ttf'}
sub, whole = ttfs(sys.argv[1]), ttfs(sys.argv[2])
bad = 0
for name, f in files.items():
    full = open(sys.argv[3] + '/' + f, 'rb').read()
    s = sub.get(name, b'')
    if not (0 < len(s) < len(full) // 4 and s[:4] == b'\x00\x01\x00\x00'): print('not subset:', name, len(s), 'of', len(full)); bad += 1
    if whole.get(name) != full: print('shaped project: not the whole file:', name); bad += 1
sys.exit(1 if bad else 0)
EOF
