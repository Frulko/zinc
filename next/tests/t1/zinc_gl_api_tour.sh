#!/bin/sh
# zinc:gl (ZN-562.02): tests/golden/webgl/api_tour.ts makes the WebGL 2 calls of api_tour.js (shaders, active info, parameters, vertex arrays, buffer
# reads, uniforms, readPixels, immutable textures, framebuffers, clearBuffer, queries, syncs, extensions, errors, uniform blocks) through zinc:gl and
# prints what the QuickJS binding prints, interpreted and built.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1
want=$("$ZINC" run tests/golden/webgl/api_tour.js --engine quickjs 2>&1)
case "$want" in *"is not a function"*|*"null"*) echo "skipped: no WebGL 2 here: $(echo "$want" | head -1)"; exit 77 ;; esac
fail=0
got=$("$ZINC" run tests/golden/webgl/api_tour.ts --interp 2>&1)
[ "$got" = "$want" ] || { echo "interpreted zinc:gl differs from QuickJS:"; echo "$want" > "$tmp/want"; echo "$got" > "$tmp/got"; diff "$tmp/want" "$tmp/got"; fail=1; }
"$ZINC" build tests/golden/webgl/api_tour.ts -o "$tmp/tour" >"$tmp/build.out" 2>&1 || { echo "zinc build failed: $(tail -5 "$tmp/build.out")"; exit 1; }
got=$("$tmp/tour" 2>&1)
[ "$got" = "$want" ] || { echo "built zinc:gl differs from QuickJS:"; echo "$want" > "$tmp/want"; echo "$got" > "$tmp/got"; diff "$tmp/want" "$tmp/got"; fail=1; }
[ $fail -eq 0 ] && echo "zinc gl api tour: ok ($(echo "$want" | wc -l | tr -d ' ') lines)"
exit $fail
