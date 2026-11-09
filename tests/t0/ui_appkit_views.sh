#!/bin/sh
# A plugin's own native view (ZN-1075): examples/native-view's zinc:levels declares LevelIndicator in its spec, `zinc native-gen --views` writes its
# glue, and the AppKit host mounts the plugin's NSLevelIndicator for the kind, in tests/golden/ui-appkit-views, headless (a window never shown) and
# dumped. A level set through AppKit comes back to the program's onChange; a refused one goes back to the program's. The interpreter is compared
# with the golden, QuickJS and the AOT with the interpreter, and the drawn fallback (ZINC_RENDER=drawn) with its lines. macOS only
# (ZN_UPDATE_GOLDEN=1 writes the golden again).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: AppKit is macOS only"; exit 77; }
g=tests/golden/ui-appkit-views
render=; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() {   # run <name> <zinc args...>
  n=$1; shift
  ZINC_RENDER=$render ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SIZE=320x120 ZINC_SCALE=1 timeout 300 "$ZINC" run -q "$@" $g > "$tmp/$n.out" 2>"$tmp/$n.err" || { echo "ui appkit views: $n fails: $(head -c 400 "$tmp/$n.err")"; exit 1; }
  ! grep -q 'did not build' "$tmp/$n.err" || { echo "ui appkit views: $n: $(head -c 400 "$tmp/$n.err")"; exit 1; }
}
run interp --interp
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/interp.out" $g/main.out; fi
diff "$tmp/interp.out" $g/main.out > "$tmp/d" || { echo "ui appkit views: $(head -12 "$tmp/d")"; exit 1; }
run qjs --engine quickjs
cmp -s "$tmp/qjs.out" "$tmp/interp.out" || { echo "ui appkit views: QuickJS differs: $(diff "$tmp/qjs.out" "$tmp/interp.out" | head -6)"; exit 1; }
run aot
cmp -s "$tmp/aot.out" "$tmp/interp.out" || { echo "ui appkit views: the AOT differs: $(diff "$tmp/aot.out" "$tmp/interp.out" | head -6)"; exit 1; }
render=drawn; run drawn --interp
for want in 'rating 4' 'drawn: rating 4'; do
  grep -qxF "$want" "$tmp/drawn.out" || { echo "ui appkit views: the drawn fallback lacks '$want': $(tr '\n' '|' < "$tmp/drawn.out")"; exit 1; }
done
echo "ui_appkit_views: ok"
