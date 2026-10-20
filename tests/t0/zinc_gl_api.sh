#!/bin/sh
# zinc:gl (ZN-562.02): the generated rows, C++ and methods are those of tools/gen-zinc-gl's table, and every method the QuickJS WebGL binding has
# (src/gl/webgl_js.cpp: WebGL 1, WebGL 2, the extensions' methods) has a zinc:gl counterpart; gl.zincPresent is zinc:gl's present.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
python3 tools/gen-zinc-gl --check || exit 1
python3 - <<'P'
import re, sys
js = open('src/gl/webgl_js.cpp').read()
names = set(re.findall(r'F_\((\w+), \d+\)', js)) | set(re.findall(r'\{"(\w+)", js_\w+, \d+\}', js))
ts = open('../lib/std/gl.ts').read()
cls = ts[ts.index('export class WebGLRenderingContext'):ts.index('export function createContext')]
have = set(re.findall(r'^  (\w+)\(', cls, re.M))
renamed = {'zincPresent': 'present'}
extension_only = {'getSupportedProfiles'}   # a method of the WEBGL_compressed_texture_astc object: zinc:gl's getExtension returns a boolean, there is no object to hold it
names -= extension_only
missing = sorted(n for n in names if renamed.get(n, n) not in have)
if missing: print('zinc:gl lacks %d method(s) of the QuickJS binding: %s' % (len(missing), ' '.join(missing))); sys.exit(1)
print('zinc gl api: ok (%d methods of the QuickJS binding)' % len(names))
P
