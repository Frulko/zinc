#!/bin/sh
# zinc:physics2d on the web target (docs/targets/web.md, "Plugins"): Box2D built to WebAssembly by the pinned zig through plugins/physics2d/web/physics2d_web.c,
# the plugin's index.ts unchanged. tests/fixtures/web-physics2d drops a ball on a static ground for 120 steps; the page prints its final pose and the contacts begun.
# The same scene (src/scene.ts) runs natively (the plugin's macOS build, tests/fixtures/web-physics2d/src/native.ts) and the two lines must agree: the version and
# the contact count equal, every number within 0.01 (the native build may use SIMD, the wasm one the scalar path; in practice they print the same).
# Skipped (77) without Chrome, python3 or a pinned zig.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_physics2d: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_physics2d: no Chrome"; exit 77; }
ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-* >/dev/null 2>&1 || { echo "web_physics2d: no pinned zig downloaded"; exit 77; }
export ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" export tests/fixtures/web-physics2d --target web -o "$tmp/web" >/dev/null 2>"$tmp/err" || { echo "web_physics2d: the export failed: $(cat "$tmp/err")"; exit 1; }
ls "$tmp"/web/physics2d.*.wasm >/dev/null 2>&1 || { echo "web_physics2d: no physics2d.wasm in the export"; fail=1; }
python3 -I tools/web-browser-test "$tmp/web" --wait 2 --after 2 --size 800x500 --click-text Run --expect-text "box2d 3.1.1, ball" >"$tmp/web.out" 2>&1 || { echo "web_physics2d: the page: $(cut -c1-500 "$tmp/web.out")"; fail=1; }
grep -q '"errors": \[\]' "$tmp/web.out" || { echo "web_physics2d: errors in the page: $(cut -c1-400 "$tmp/web.out")"; fail=1; }
"$Z" run tests/fixtures/web-physics2d/src/native.ts 2>/dev/null | grep '^box2d ' >"$tmp/native.txt"
[ -s "$tmp/native.txt" ] || { echo "web_physics2d: the native run printed nothing"; exit 1; }
python3 -I - "$tmp/web.out" "$tmp/native.txt" <<'EOF' || fail=1
import json, re, sys
line = lambda t: next(l for l in t.split('\n') if l.startswith('box2d '))
web = line(json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])['text'])
nat = line(open(sys.argv[2]).read())
tok = lambda s: re.findall(r'-?\d+(?:\.\d+)?', s)
w, n = tok(web), tok(nat)
ok = len(w) == len(n) and all(abs(float(a) - float(b)) <= 0.01 for a, b in zip(w, n)) and web.split(',')[-1] == nat.split(',')[-1]
print(('web_physics2d: web and native agree: ' if ok else 'web_physics2d: MISMATCH\n  web:    ') + web + ('' if ok else '\n  native: ' + nat))
sys.exit(0 if ok else 1)
EOF
exit $fail
