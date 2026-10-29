#!/bin/sh
# Compare actual pixels, not screenshot previews: text and generated images must
# survive native build/cache, interpreter and QuickJS with the same appearance.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/app/src" "$tmp/app/assets"
cat > "$tmp/app/zinc.json" <<'JSON'
{"name":"resource-parity","entry":"src/main.tsx"}
JSON
cat > "$tmp/app/src/main.tsx" <<'TSX'
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="flex-col h-full p-4 gap-4 bg-slate-950">
    <Text className="text-2xl text-white">Resource parity 65</Text>
    <Text className="text-slate-300">Original images · native / interpreted</Text>
    <View className="flex-row gap-4">
      <Image className="w-32 h-32" src="pattern.png" />
      <Image className="w-32 h-32" src="pattern.png" />
    </View>
    <Text className="text-slate-300">All labels must remain visible.</Text>
  </View>;
}
render(App, 0x020617, () => {});
TSX
python3 - "$tmp/app/assets/pattern.png" <<'PY'
import runpy, sys
png = runpy.run_path('tools/pngdiff')
pixels = bytes(v for y in range(32) for x in range(32)
               for v in ((220, 50, 30) if (x//8+y//8)%2 else (30, 190, 80)))
png['write_rgb'](sys.argv[1], 32, 32, pixels)
PY
shot() {
  name=$1; shift
  env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=2 ZINC_SIZE=480x320 \
    ZINC_FRAMES=3 ZINC_SHOT="$tmp/$name.png" \
    ZINC_SCENE_DUMP="$tmp/$name.scene" \
    "$ZINC" run "$tmp/app" "$@" >"$tmp/$name.log" 2>&1 || {
      cat "$tmp/$name.log"; exit 1;
    }
}
shot native --native
shot cached --native
shot interp --interp
shot quickjs --engine quickjs
for mode in cached interp quickjs; do
  tools/pngdiff "$tmp/native.png" "$tmp/$mode.png"
done
python3 - "$tmp/native.png" "$tmp/native.scene" <<'PY'
import runpy, sys
png = runpy.run_path('tools/pngdiff')
w, h, bpp, pixels = png['dec'](sys.argv[1])
assert (w, h) == (960, 640)
# Equality alone could bless four empty frames. Assert real text ink above the
# images and the generated colored image pixels below it.
white = sum(min(pixels[i:i+3]) > 180 for i in range(0, w*80*bpp, bpp))
red = sum(pixels[i] > 180 and pixels[i+1] < 90 for i in range(0, len(pixels), bpp))
assert white > 300 and red > 1000, (white, red)
scene = open(sys.argv[2], 'rb').read()
assert b'Resource parity 65' in scene and b'All labels must remain visible.' in scene
PY
