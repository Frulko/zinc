#!/bin/sh
# The showcase demos on QuickJS through the bundler's transform stage (docs/reports/zinc-quickjs-bundler.md): hero, rn-showcase, nuxt-ui, breakout
# and webcam (the fake camera) draw, headless and deterministic, the frame the interpreter draws (one hash each); the minified bundle of hero
# (zinc bundle, with the pinned esbuild when ZINC_HOME has it) draws it too. webcam is compared at frame 40: at frame 20 the QuickJS virtual clock
# fires the camera's setInterval one camera frame earlier (#9 against #8 in the HUD), an engine timing that the bundler does not change.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
shot() {   # frames, png, args...
  n=$1; png=$2; shift 2
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=$n ZINC_SHOT="$png" "$ZINC" run "$@" >"$png.log" 2>&1 || { echo "$*: exit $?: $(tail -2 "$png.log")"; fail=1; }
}
same() { [ -f "$1" ] && cmp -s "$1" "$2"; }
for d in hero:20 rn-showcase:20 nuxt-ui:20 breakout:20 webcam:40; do
  ex=${d%%:*}; n=${d#*:}
  shot "$n" "$tmp/$ex.i.png" "examples/$ex" --interp
  shot "$n" "$tmp/$ex.q.png" "examples/$ex" --engine quickjs
  same "$tmp/$ex.q.png" "$tmp/$ex.i.png" || { echo "$ex: frame $n on quickjs differs from the interpreter's"; fail=1; }
done
if ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1; then
  out=examples/hero/dist/qjs-demos-$$.js   # in the project (dist/ is ignored by git): its zinc.json sizes the window
  "$ZINC" bundle examples/hero -o "$out" --minify >/dev/null 2>&1 || { echo "zinc bundle hero failed"; fail=1; }
  shot 20 "$tmp/hero.b.png" "$out"
  rm -f "$out"
  same "$tmp/hero.b.png" "$tmp/hero.i.png" || { echo "hero: frame 20 of the minified bundle differs from the interpreter's"; fail=1; }
else
  echo "skip the hero bundle: no esbuild in ZINC_HOME"
fi
exit $fail
