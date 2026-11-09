#!/bin/sh
# The native host contract (D210, ZN-1069): with zinc.json "ui": {"render": "native"} a stub host installed by ui.setHost gets one buffer per changed frame
# (tests/golden/ui-native-host: the whole tree mounted, then a text, a colour and a move, a removal with a recycled handle, a removal alone), the same on
# the interpreter, the AOT and QuickJS; with ZINC_RENDER=drawn setHost installs nothing and the program is drawn as before.
cd "$(dirname "$0")/../.." || exit 2
g=tests/golden/ui-native-host
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
R=
run() {   # run <name> <zinc args...>
  n=$1; shift
  ZINC_RENDER=$R ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_SIZE=240x160 ZINC_SCALE=1 "$ZINC" run "$@" $g > "$tmp/$n.out" 2>"$tmp/$n.err" || { echo "ui native host: $n fails: $(head -c 400 "$tmp/$n.err")"; exit 1; }
}
run interp --interp
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/interp.out" $g/main.out; fi
diff "$tmp/interp.out" $g/main.out > "$tmp/d" || { echo "ui native host: $(head -12 "$tmp/d")"; exit 1; }
run aot
cmp -s "$tmp/aot.out" "$tmp/interp.out" || { echo "ui native host: the AOT differs: $(diff "$tmp/aot.out" "$tmp/interp.out" | head -6)"; exit 1; }
run qjs --engine quickjs
cmp -s "$tmp/qjs.out" "$tmp/interp.out" || { echo "ui native host: QuickJS differs: $(diff "$tmp/qjs.out" "$tmp/interp.out" | head -6)"; exit 1; }
R=drawn; run drawn --interp
want="native false installed false active false"
[ "$(head -1 "$tmp/drawn.out")" = "$want" ] && grep -q "^done: 0 commits$" "$tmp/drawn.out" || { echo "ui native host: drawn: $(head -3 "$tmp/drawn.out")"; exit 1; }
echo "ui_native_host: ok"
