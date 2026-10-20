#!/bin/sh
# GPU textures (ZN-439, docs/reports/zinc-next-assets.md "Textures") on tests/data/texture, whose two textures (one opaque, one with a soft
# transparent edge) make_texture.py writes, TEXTURE_SIZE texels a side (128; TEXTURE_SIZE=2048 gives the table of the doc, in minutes):
# 1. `zinc assets build --release` for each profile, macos (bc7 with alpha, bc1 opaque), rpi1 (rgba4444, etc1), wasm (ktx2:uastc) and the
#    project's named profiles on spare targets (rmpp: etc2, sim: astc, ps2: pvrtc): each texture's format, pack and GPU bytes in report.json
#    (the GPU bytes are the levels' arithmetic), printed as a table;
# 2. determinism: two copies built in two directories with two ZINC_HOMEs (no shared cache) give the same packs, basisu run with the thread
#    count the importer fixes;
# 3. the software raster draws each profile's packs (BCn and ETC decoded by bcdec and etcdec) within a tolerance of the rgba8 frame;
# 4. display-gl, a window: the macos packs (BC1 and BC3 uploaded as blocks where the driver lists them, BC7 decoded where it does not) and the
#    rpi1 packs (ETC1 uploaded where the driver has it, decoded otherwise) within a tolerance of the rgba8 GL frame (skipped without a window);
# 5. the WebGL layer offers the ETC1, ETC, ASTC and PVRTC extensions exactly where the driver takes their formats (webgl_ext.js).
# basisu: ZINC_BASISU, else the pinned one of ZINC_HOME or ~/.zinc, built once by `zinc toolchain basisu` (skipped when it cannot be had).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
if [ -z "$ZINC_BASISU" ]; then
  ZINC_BASISU=$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/basisu-*/basisu 2>/dev/null | head -1)
  [ -n "$ZINC_BASISU" ] || ZINC_BASISU=$("$Z" toolchain basisu 2>/dev/null | tail -1)
fi
[ -x "$ZINC_BASISU" ] || { echo "skipped: no basisu (zinc toolchain basisu)"; exit 77; }
export ZINC_BASISU
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=$tmp/home
unset ZINC_ASSETS ZINC_PACKS
n=${TEXTURE_SIZE:-128}
p="$tmp/p"
cp -R tests/data/texture "$p" && rm -f "$p/make_texture.py" "$p/webgl_ext.js"
mkdir -p "$p/assets/tex"
python3 tests/data/texture/make_texture.py "$n" "$p/assets/tex/alpha.png" && python3 tests/data/texture/make_texture.py "$n" "$p/assets/tex/opaque.png" opaque || exit 1
fail=0

# the RGBA path: a dev build makes rgba8
"$Z" assets build "$p" >/dev/null || { echo "texture: the dev build failed"; exit 1; }
mv "$p/build/assets/macos" "$tmp/rgba8"
targets="macos rpi1 wasm rmpp sim ps2"
for t in $targets; do
  "$Z" assets build "$p" --release --target $t >"$tmp/build-$t.txt" 2>&1 || { echo "texture: the $t build failed: $(head -c 400 "$tmp/build-$t.txt")"; exit 1; }
done
python3 - "$p/build/assets" "$n" $targets <<'PY' || fail=1
import json, sys
root, n, targets = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
want = {"macos": ("bc7", "bc1"), "rpi1": ("rgba4444", "etc1"), "wasm": ("ktx2:uastc", "ktx2:uastc"), "rmpp": ("etc2", "etc1"), "sim": ("astc", "astc"), "ps2": ("pvrtca", "pvrtc")}
bpt = {"bc1": 4, "etc1": 4, "pvrtc": 4, "pvrtca": 4, "bc7": 8, "etc2": 8, "astc": 8, "ktx2:uastc": 8, "rgba4444": 16}   # bits a texel, 4 x 4 blocks
def levels(n):
    out = [n]
    while n > 1: n //= 2; out.append(n)
    return out
bad = 0
print("%-6s %-10s %-10s %10s %10s %10s %8s" % ("target", "texture", "format", "pack", "gpu", "output", "ms"))
for t in targets:
    r = json.load(open(f"{root}/{t}/report.json"))
    assert r["profile"] == "release"
    for a in r["assets"]:
        kind = "alpha" if a["name"].endswith("alpha.png") else "opaque"
        fmt, gpu, pack = a.get("format"), a.get("gpuBytes", 0), a["packBytes"]
        expect = want[t][0 if kind == "alpha" else 1]
        side = lambda l: max(l, 8) if fmt.startswith("pvrtc") else l if fmt.startswith("rgb") else (l + 3) // 4 * 4
        arith = sum(side(l) * side(l) * bpt.get(fmt, 32) // 8 for l in levels(n))
        ok = fmt == expect and gpu == arith and 0 < pack <= a["outputBytes"]
        bad += not ok
        print("%-6s %-10s %-10s %10d %10d %10d %8.0f%s" % (t, kind, fmt, pack, gpu, a["outputBytes"], a["ms"], "" if ok else f"  WRONG: want {expect}, {arith} GPU bytes"))
sys.exit(1 if bad else 0)
PY

# the same packs from a second copy, its own cache (a fresh ZINC_HOME): every encode run again
cp -R "$p" "$tmp/q" && rm -rf "$tmp/q/build"
for t in macos wasm; do
  (cd "$tmp" && ZINC_HOME="$tmp/home2" "$Z" assets build "$tmp/q" --release --target $t >/dev/null 2>&1) || { echo "texture: the second $t build failed"; fail=1; }
  for f in "$p/build/assets/$t"/*.zpk; do cmp -s "$f" "$tmp/q/build/assets/$t/$(basename "$f")" || { echo "texture: two builds of $t give two $(basename "$f")"; fail=1; }; done
done
[ $fail -eq 0 ] && echo "determinism: the macos and wasm packs of two copies are the same bytes"

# the software raster: blocks decoded on the CPU
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=384x128 ZINC_FRAMES=2"
shot() { (cd "$p" && env $env ZINC_PACKS="$1" ZINC_SHOT="$2" "$Z" run . >"$2.txt" 2>&1); }
close() {   # frame, reference, limit of the pixels over 24 in %, limit of the mean error: glcompare's line
  o=$(python3 tools/glcompare "$2" "$1")
  python3 -c "
import re, sys
m = re.search(r'pixels over \d+: ([\d.]+)%, mae ([\d.]+)', sys.argv[1])
sys.exit(0 if m and float(m.group(1)) <= float(sys.argv[2]) and float(m.group(2)) <= float(sys.argv[3]) else 1)" "$o" "$3" "$4" || { echo "$o (limits $3% and $4)"; return 1; }
  echo "$o"
}
shot "$tmp/rgba8" "$tmp/rgba8.png" || { echo "texture: the rgba8 run failed: $(head -c 300 "$tmp/rgba8.png.txt")"; exit 1; }
grep -q "^opaque ${n}x${n}, alpha ${n}x${n}$" "$tmp/rgba8.png.txt" || { echo "texture: the program did not find its textures: $(head -c 300 "$tmp/rgba8.png.txt")"; fail=1; }
for t in macos rpi1 rmpp; do
  shot "$p/build/assets/$t" "$tmp/cpu-$t.png" || { echo "texture: the $t run failed"; fail=1; continue; }
  o=$(close "$tmp/cpu-$t.png" "$tmp/rgba8.png" 2 3) && echo "software raster, $t packs: $o" || { echo "texture: software raster, $t packs: $o"; fail=1; }
done

# display-gl: the GPU path
gl() { (cd "$p" && ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SIZE=384x128 ZINC_FRAMES=2 ZINC_PACKS="$1" ZINC_SHOT="$2" timeout 90 "$Z" run . >"$2.txt" 2>&1); [ -s "$2" ]; }
if gl "$tmp/rgba8" "$tmp/gl-rgba8.bmp"; then
  for t in macos rpi1; do
    gl "$p/build/assets/$t" "$tmp/gl-$t.bmp" || { echo "texture: display-gl drew no frame of the $t packs"; fail=1; continue; }
    stats=$(grep -o "[0-9]* compressed textures uploaded as blocks ([0-9]* bytes), [0-9]* decoded" "$tmp/gl-$t.bmp.txt")
    formats=$(grep -o "compressed formats.*" "$tmp/gl-$t.bmp.txt")
    lim=$([ $t = macos ] && echo "1 2" || echo "2 3")   # ETC1 loses more than BC1 and BC7 on the sharp edges of the tiles
    o=$(close "$tmp/gl-$t.bmp" "$tmp/gl-rgba8.bmp" $lim) && echo "display-gl, $t packs: $o; $stats; driver $formats" || { echo "texture: display-gl, $t packs: $o"; fail=1; }
    blocks=${stats%% *}; decoded=${stats##*, }; decoded=${decoded%% *}
    want=$([ $t = macos ] && echo 2 || echo 1)   # macos: bc7 and bc1; rpi1: etc1 (rgba4444 is plain texels)
    [ "$((blocks + decoded))" = "$want" ] || { echo "texture: display-gl took $stats of the $t packs, not $want"; fail=1; }
    case "$formats" in *0x83f0*) [ $t = macos ] && [ "$blocks" -lt 1 ] && { echo "texture: the driver lists BC1 and display-gl did not upload it as blocks"; fail=1; } ;; esac
  done
else
  echo "display-gl: skipped, no window ($(head -c 200 "$tmp/gl-rgba8.bmp.txt"))"
fi
# the WebGL layer: the ETC1, ETC, ASTC and PVRTC extensions offered exactly where the driver takes their formats (QuickJS, headless)
o=$(ZINC_HEADLESS=1 timeout 60 "$Z" run tests/data/texture/webgl_ext.js --engine quickjs 2>&1)
[ "$(echo "$o" | tail -1)" = ok ] && echo "webgl: $(echo "$o" | grep -c offered) of 8 extension rows offered by this driver, the rest refused" || { echo "texture: webgl_ext.js:"; echo "$o" | tail -9; fail=1; }
[ $fail -eq 0 ] && echo "texture: ok"
exit $fail
