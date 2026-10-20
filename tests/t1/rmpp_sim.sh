#!/bin/sh
# reMarkable Paper Pro panel model (ZN-130): the real display-rmpp driver (plugins/display-rmpp/rmpp.cpp) runs inside a Zinc app on the Mac against a fake AppLoad qtfb server and a model of
# the compositor (tests/native/rmpp/sim.cpp). The trace of messages (modes, update rectangles, hash of the glass after each) is compared with tests/golden/sim/rmpp-<app>.trace.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens.
cd "$(dirname "$0")/../.." || exit 2
root=$(cd .. && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for app in notes dashboard; do
  proj=$tmp/$app; mkdir -p "$proj/plugins/display-rmpp-sim" "$proj/out"
  src=$root/examples/remarkable/$app
  ln -s "$src/src" "$proj/src"; [ -d "$src/native" ] && ln -s "$src/native" "$proj/native"
  sed 's/"driver": "rmpp"/"driver": "rmpp-sim"/' "$src/zinc.json" > "$proj/zinc.json"
  sed "s|\"RMPP_DRIVER\"|\"$root/plugins/display-rmpp/rmpp.cpp\"|" tests/native/rmpp/sim.cpp > "$proj/plugins/display-rmpp-sim/sim.cpp"
  cat > "$proj/plugins/display-rmpp-sim/plugin.json" <<J
{ "name": "display-rmpp-sim", "kind": "display", "options": {},
  "targets": { "macos": { "sources": ["sim.cpp"], "flags": ["-I$PWD/tests/native/stubs", "-I$root/plugins/display-rmpp"] }, "linux": { "sources": ["sim.cpp"] } } }
J
  extra=""; frames=360; : > "$proj/input"; [ $app = dashboard ] && printf "80 move 1360 456\n81 down\n82 up\n200 move 120 800\n201 down\n202 up\n" > "$proj/input"; [ $app = notes ] && { extra="NOTES_DEMO=1"; frames=170; }
  ( cd "$proj" && env $extra ZN_RMPP_SIM_OUT="$proj/out" QTFB_KEY=7 ZINC_RMPP_REFRESH_MODE=fast ZINC_DISPLAY=rmpp-sim ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_INPUT="$proj/input" ZINC_FRAMES=$frames \
      "$ZINC" run "$proj" >"$tmp/$app.log" 2>&1 ) || { echo "$app: run failed: $(tail -c 400 "$tmp/$app.log")"; fail=1; continue; }
  [ -s "$proj/out/trace.txt" ] || { echo "$app: no trace: $(tail -c 400 "$tmp/$app.log")"; fail=1; continue; }
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$proj/out/trace.txt" tests/golden/sim/rmpp-$app.trace; cp "$proj/out/glass.ppm" tests/golden/sim/rmpp-$app.ppm; continue; fi
  diff -q "$proj/out/trace.txt" tests/golden/sim/rmpp-$app.trace >/dev/null || { echo "$app: trace differs from tests/golden/sim/rmpp-$app.trace"; diff "$proj/out/trace.txt" tests/golden/sim/rmpp-$app.trace | head -6; fail=1; }
  cmp -s "$proj/out/glass.ppm" tests/golden/sim/rmpp-$app.ppm || { echo "$app: glass differs from tests/golden/sim/rmpp-$app.ppm"; fail=1; }
  grep -q " 0 errors" "$proj/out/trace.txt" || { echo "$app: the model reports errors"; fail=1; }
done
[ $fail -eq 0 ] && echo "rmpp sim: ok"
exit $fail
