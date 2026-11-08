#!/bin/sh
# The style conformance scenes (tests/golden/ui-style, ZN-277) through the GL replay (ZN-666): each scene is drawn by display-gl's replay and by
# the software raster (whose frame ui_style.sh pins by hash) at the GL frame's pixel scale (ZINC_SCALE: the window's density times display-gl's
# own upscale, so text is made at the same size on both), the GL frame box-averaged to the software size (tools/glcompare) and held to
# display-gl's tolerance (gl_renderer.sh): at most 5% of the pixels more than 24 away in a channel, mean error under 3. A scene that differs
# more is a row of tests/golden/ui-style/gl.known (`scene percent mae`, the numbers of its last run): it may not get worse, and the row is
# dropped when the scene passes. UI_STYLE_GL_BLESS=1 rewrites gl.known from this run; UI_STYLE_GL_ONLY="radius shadow" runs those scenes.
# Opens a window per scene: skipped (77) without a GL context.
cd "$(dirname "$0")/../.." || exit 2
[ -z "$ZINC_CI" ] || { echo "skipped: needs a real GPU"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_BACKGROUND=1 ZINC_AUDIO=null ZINC_DETERMINISTIC=1 ZINC_SIZE=240x160 ZINC_FRAMES=3
g=tests/golden/ui-style
fail=0; n=0; : > "$tmp/known"
for f in $g/*.tsx; do
  s=$(basename "$f" .tsx)
  [ -z "$UI_STYLE_GL_ONLY" ] || case " $UI_STYLE_GL_ONLY " in *" $s "*) ;; *) continue ;; esac
  n=$((n+1))
  rm -f "$tmp/gl.bmp" "$tmp/sw.png"
  ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run "$f" >"$tmp/gl.log" 2>&1
  if [ ! -s "$tmp/gl.bmp" ]; then
    [ $n -eq 1 ] && { echo "skipped: no GL context here ($(head -c 200 "$tmp/gl.log"))"; exit 77; }
    echo "$s: no GL frame"; fail=1; continue
  fi
  if ! grep -q "renderer gl:" "$tmp/gl.log"; then   # no context at all (no display, SDL's dummy driver): skipped; a context without the replay fails
    [ $n -eq 1 ] && ! grep -q "using cpu" "$tmp/gl.log" && { echo "skipped: no GL context here ($(grep "^display-gl:" "$tmp/gl.log" | head -c 200))"; exit 77; }
    echo "$s: the GL replay did not run: $(grep 'using cpu' "$tmp/gl.log")"; fail=1; continue
  fi
  k=$(python3 -c 'import struct,sys; w=struct.unpack("<i", open(sys.argv[1],"rb").read()[18:22])[0]; k=w//240; print(k if 1<=k<=4 and k*240==w else 1)' "$tmp/gl.bmp")
  ZINC_HEADLESS=1 ZINC_SCALE=$k ZINC_SHOT="$tmp/sw.png" timeout 60 "$ZINC" run "$f" >/dev/null 2>&1
  [ -s "$tmp/sw.png" ] || { echo "$s: no software frame"; fail=1; continue; }
  out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png")
  python3 - "$s" "$out" "$g/gl.known" "$tmp/known" <<'PY' || fail=1
import re, sys
s, out, known_path, new_known = sys.argv[1:5]
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", out)
if not m: print("%s: %s" % (s, out)); sys.exit(1)
pct, mae = float(m.group(1)), float(m.group(2))
known = {}
try:
    for line in open(known_path):
        p = line.split()
        if len(p) == 3 and not line.startswith("#"): known[p[0]] = (float(p[1]), float(p[2]))
except OSError: pass
if pct <= 5 and mae <= 3:
    if s in known: print("%s: passes now (%s): drop its row from gl.known" % (s, out))
    sys.exit(0)
open(new_known, "a").write("%s %.3f %.3f\n" % (s, pct, mae))
if s in known and pct <= known[s][0] + 0.05 and mae <= known[s][1] + 0.05: sys.exit(0)
print("%s: the GL frame differs from the software frame: %s (limits 5%% / 3%s)" % (s, out, ", known %.3f%% / %.3f" % known[s] if s in known else ""))
sys.exit(1)
PY
done
if [ -n "$UI_STYLE_GL_BLESS" ]; then
  { echo "# scenes whose GL frame differs from the software one beyond display-gl's tolerance: scene, % of pixels over 24, mae (tests/t1/ui_style_gl.sh)"; cat "$tmp/known"; } > "$g/gl.known"
  echo "ui_style_gl: gl.known rewritten ($(wc -l < "$tmp/known" | tr -d ' ') rows)"; exit 0
fi
[ $fail -eq 0 ] && echo "ui_style_gl: $n scenes within tolerance or known ($(wc -l < "$tmp/known" | tr -d ' ') known)"
exit $fail
