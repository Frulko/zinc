#!/bin/sh
# zinc:gfx images in the browser (ZN-432): zinc export --target wasm ships the baked images (app.res) and the worker draws them (image, imageWidth, drawImage,
# drawImageRect). tests/data/image_rect/web.ts, the nearest sprites of a sheet (mirrored, translucent, cut at the image's edge) and a pixel-for-texel copy, is the
# same frame in headless Chrome as in the interpreter, within 2 a channel (the canvas keeps premultiplied pixels), the interpreter and the AOT build giving one hash;
# the sprites of the Chrome frame are the sheet's texels (check.py). The game-2d template exported and started (Enter) shows its player and its coins.
# Skipped (77) without Chrome or the pinned zig.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME=$(command -v google-chrome chromium chromium-browser 2>/dev/null | head -1)
[ -n "$CHROME" ] && [ -x "$CHROME" ] || { echo "image_rect_wasm: no Chrome"; exit 77; }
ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-* >/dev/null 2>&1 || { echo "image_rect_wasm: no pinned zig downloaded"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
d=tests/data/image_rect
unset ZINC_ASSETS
fail=0
"$Z" export $d/web.ts --target wasm -o "$tmp/web" >/dev/null || { echo "image_rect_wasm: the export failed"; exit 1; }
[ -s "$tmp/web/app.res" ] || { echo "image_rect_wasm: the export has no app.res"; fail=1; }
python3 tools/wasm-export-test "$CHROME" "$tmp/web" 10 "sheet 32 16" "$tmp/chrome.png" >"$tmp/web.log" || { cat "$tmp/web.log"; exit 1; }
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=480x320 ZINC_FRAMES=2 ZINC_FRAMEHASH=last"
interp=$(env $env ZINC_SHOT="$tmp/native.png" "$Z" run $d/web.ts 2>&1 | grep framehash | awk '{print $5}')
out=$(python3 tools/pngdiff "$tmp/chrome.png" "$tmp/native.png" --tol 2) || { echo "image_rect_wasm: the frame of Chrome differs from the interpreter's: $out"; fail=1; }
python3 $d/check.py "$tmp/chrome.png" $d/assets/sheet.png 0 nearest || { echo "image_rect_wasm: the sprites of the Chrome frame are not the sheet's"; fail=1; }
if [ -n "$CXX" ] || command -v c++ >/dev/null; then
  "$Z" build $d/web.ts -o "$tmp/app" >"$tmp/build.log" 2>&1 || { echo "image_rect_wasm: AOT build failed: $(head -c 300 "$tmp/build.log")"; exit 1; }
  aot=$(env $env "$tmp/app" 2>&1 | grep framehash | awk '{print $5}')
  [ -n "$interp" ] && [ "$aot" = "$interp" ] || { echo "image_rect_wasm: the AOT frame ($aot) is not the interpreter's ($interp)"; fail=1; }
fi
# game-2d: its title waits for Start; then the play scene draws the player and five coins over its background
"$Z" new game-2d "$tmp/game" >/dev/null && "$Z" export "$tmp/game" --target wasm -o "$tmp/game-site" >/dev/null || { echo "image_rect_wasm: game-2d could not be exported"; exit 1; }
python3 tools/wasm-export-test "$CHROME" "$tmp/game-site" 180 "exit 0" "$tmp/game.png" Enter >"$tmp/game.log" || { cat "$tmp/game.log"; exit 1; }
python3 - "$tmp/game.png" <<'PY' || fail=1
import importlib.machinery, importlib.util, sys
l = importlib.machinery.SourceFileLoader("pngdiff", "tools/pngdiff"); s = importlib.util.spec_from_loader("pngdiff", l); pd = importlib.util.module_from_spec(s); l.exec_module(pd)
w, h, bpp, d = pd.dec(sys.argv[1])
def count(c): return sum(1 for o in range(0, w * h * bpp, bpp) if all(abs(d[o + k] - c[k]) <= 8 for k in range(3)))
at = lambda x, y: tuple(d[(y * w + x) * bpp:(y * w + x) * bpp + 3])
player, coins = count((0x4f, 0xc3, 0xf7)), count((0xf9, 0xc7, 0x4f))   # the fills of assets/player.svg and coin.svg
# the play scene (its bar and its background), a 32x32 player (356 pixels of its body when this was written) and five 20x20 coins (1098)
if at(5, 5) != (0x0b, 0x13, 0x2b) or at(5, 100) != (0x14, 0x21, 0x3d) or player < 250 or coins < 700:
    print("image_rect_wasm: game-2d in Chrome: bar %s, background %s, %d pixels of the player, %d of the coins" % (at(5, 5), at(5, 100), player, coins)); sys.exit(1)
PY
[ $fail -eq 0 ] && echo "image_rect_wasm: ok (web.ts: $out; $(cat "$tmp/web.log"); $(cat "$tmp/game.log"))"
exit $fail
