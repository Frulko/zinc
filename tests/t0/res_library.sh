#!/bin/sh
# Library styles use embedded TrueType at run time; program sizes and non-ASCII library text are still baked.
cd "$(dirname "$0")/../.." || exit 2
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/lib/std"
cat > "$tmp/lib/std/style.ts" <<'TS'
export function text(): string { return 'text-[63px] font-mono italic Ж'; }
function unused(): string { return '中'; }
TS
cat > "$tmp/main.ts" <<'TS'
import { text } from './lib/std/style';
console.log('text-[27px]', text());
TS
"$ZINC" bake "$tmp/main.ts" -o "$tmp/blob"
python3 - "$tmp/blob" <<'PY'
import struct, sys
b = open(sys.argv[1], 'rb').read(); p = 4
def u32():
    global p
    n, = struct.unpack_from('<I', b, p); p += 4; return n
def string():
    global p
    n = u32(); s = b[p:p+n].decode(); p += n; return s
fonts = {}; chars = set()
for _ in range(u32()):
    name, px = string(), u32(); p += 12
    for _ in range(u32()):
        chars.add(u32()); p += 24
    n = u32(); p += n
    fonts[name, px] = True
assert ('sans', 27) in fonts, 'explicit program size was dropped'
assert ('sans', 63) not in fonts and ('mono', 63) not in fonts, 'library style table baked unused sizes'
assert ord('中') not in chars, 'dead library literal characters were retained'
assert ord('Ж') in chars, 'library literal characters were dropped'
assert u32() == 0, 'unexpected images'
names = []
for _ in range(u32()):
    names.append(string()); n = u32(); p += n
assert {'sans', 'sans-bold', 'mono'} <= set(names), 'runtime font fallback was dropped'
PY
