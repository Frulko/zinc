#!/bin/sh
# reMarkable panel model (ZN-130, ZN-834): the real display-rmpp driver (plugins/display-rmpp/rmpp.cpp) runs inside a Zinc app on the Mac against a fake AppLoad
# qtfb server, a fake ink lane and a model of the compositor (tests/native/rmpp/sim.cpp).
#   notes, dashboard: the trace of messages (modes, update rectangles, hash of the glass after each) is compared with tests/golden/sim/rmpp-<app>.trace;
#   the other runs prove the backend choice per manifest option ("ink": qtfb / native / session), the L1 -> L0 downgrade on EOF and the fallbacks
#   (no lane, unverified vendor hash, unknown model), each with its one message.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens.
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
ferrari="ZINC_RMPP_MACHINE=reMarkable Ferrari"

# run <label> <app> <frames> <ink option or -> [VAR=value...]: runs the app; its trace is $tmp/<label>/out/trace.txt, its stderr $tmp/<label>.log
run() {
  label=$1 app=$2 frames=$3 ink=$4; shift 4
  proj=$tmp/$label; mkdir -p "$proj/plugins/display-rmpp-sim" "$proj/out"
  src=$root/examples/remarkable/$app
  ln -s "$src/src" "$proj/src"; [ -d "$src/native" ] && ln -s "$src/native" "$proj/native"
  # the option as a project sets it; under ZINC_DISPLAY (needed headless) it is read from plugins.<driver> of zinc.json
  opt=""; [ "$ink" != - ] && opt=" \"plugins\": { \"display-rmpp-sim\": { \"ink\": \"$ink\" } },"
  sz=""; [ -n "$size" ] && sz="-e s/1620/${size%x*}/ -e s/2160/${size#*x}/"   # $size=WxH: another model's panel
  sed $sz -e "1s/{/{$opt/" -e 's/"driver": "rmpp"/"driver": "rmpp-sim"/' "$src/zinc.json" > "$proj/zinc.json"
  sed "s|\"RMPP_DRIVER\"|\"$root/plugins/display-rmpp/rmpp.cpp\"|" tests/native/rmpp/sim.cpp > "$proj/plugins/display-rmpp-sim/sim.cpp"
  cat > "$proj/plugins/display-rmpp-sim/plugin.json" <<J
{ "name": "display-rmpp-sim", "kind": "display", "options": {},
  "targets": { "macos": { "sources": ["sim.cpp"], "flags": ["-I$root/tests/native/stubs", "-I$root/plugins/display-rmpp", "-I$root/integrations/remarkable-ink"] }, "linux": { "sources": ["sim.cpp"] } } }
J
  : > "$proj/input"; [ $app = dashboard ] && printf "80 move 1360 456\n81 down\n82 up\n200 move 120 800\n201 down\n202 up\n" > "$proj/input"
  ( cd "$proj" && env "$@" ZN_RMPP_SIM_OUT="$proj/out" ZINC_DISPLAY=rmpp-sim QTFB_KEY=7 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_INPUT="$proj/input" ZINC_FRAMES=$frames \
      "$ZINC" run "$proj" >"$tmp/$label.log" 2>&1 ) || { echo "$label: run failed: $(tail -c 400 "$tmp/$label.log")"; fail=1; return 1; }
  [ -n "$headless" ] && return 0   # the driver refused the panel: no trace to judge
  [ -s "$proj/out/trace.txt" ] || { echo "$label: no trace: $(tail -c 400 "$tmp/$label.log")"; fail=1; return 1; }
  grep -q " 0 errors" "$proj/out/trace.txt" || { echo "$label: the model reports errors:"; grep error "$proj/out/trace.txt" | head -3; fail=1; }
  return 0
}
# has <label> <file: trace|log> <count|+> <pattern>: the pattern appears exactly <count> times (+: at least once)
has() {
  f=$tmp/$1/out/trace.txt; [ "$2" = log ] && f=$tmp/$1.log
  n=$(grep -c -- "$4" "$f")
  if [ "$3" = + ]; then [ "$n" -gt 0 ]; else [ "$n" -eq "$3" ]; fi || { echo "$1: expected $3 x '$4' in the $2, found $n"; fail=1; }
}

for app in notes dashboard; do
  frames=360; extra=ZINC_RMPP_REFRESH_MODE=fast; [ $app = notes ] && { frames=170; extra="NOTES_DEMO=1"; }
  run $app $app $frames - $extra ZINC_RMPP_REFRESH_MODE=fast || continue
  proj=$tmp/$app
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$proj/out/trace.txt" tests/golden/sim/rmpp-$app.trace; cp "$proj/out/glass.ppm" tests/golden/sim/rmpp-$app.ppm; continue; fi
  diff -q "$proj/out/trace.txt" tests/golden/sim/rmpp-$app.trace >/dev/null || { echo "$app: trace differs from tests/golden/sim/rmpp-$app.trace"; diff "$proj/out/trace.txt" tests/golden/sim/rmpp-$app.trace | head -6; fail=1; }
  cmp -s "$proj/out/glass.ppm" tests/golden/sim/rmpp-$app.ppm || { echo "$app: glass differs from tests/golden/sim/rmpp-$app.ppm"; fail=1; }
done

# L1: "ink": "native" with a lane that answers a verified hash. qtfb stays in UI; strokes go through the lane, never through qtfb.
pen=ZN_RMPP_SIM_PEN=70-95,110-130
if run lane notes 140 native NOTES_DEMO=1 "$ferrari" ZN_RMPP_SIM_LANE=ok $pen; then
  has lane log 1 "ink lane on (Paper Pro"; has lane trace 1 "mode UI"; has lane trace 0 "mode FAST"
  has lane trace 2 "lane stroke begin"; has lane trace + "lane ink "; has lane trace 2 "lane stroke end"; has lane trace 1 "lane bye"
fi
# L1 -> L0: the lane closes its end mid-stroke; the driver says so once and goes on with qtfb, in FAST as the app asked
if run eof notes 170 native NOTES_DEMO=1 "$ferrari" ZN_RMPP_SIM_LANE=eof:5 $pen; then
  has eof trace 5 "lane ink "; has eof trace 1 "lane closed: eof"; has eof trace 0 "lane stroke end"; has eof log 1 "ink lane closed; qtfb from now on"
  sed -n '/lane closed: eof/,$p' "$tmp/eof/out/trace.txt" | grep -q "mode FAST" || { echo "eof: no switch to FAST after the downgrade"; fail=1; }
  sed -n '/lane closed: eof/,$p' "$tmp/eof/out/trace.txt" | grep -q "update PARTIAL" || { echo "eof: no qtfb update after the downgrade"; fail=1; }
fi
# The fallbacks to L0, each with one message: an unverified vendor hash, no lane, a session outside the lease, an unknown model
run badhash notes 20 native "$ferrari" ZN_RMPP_SIM_LANE=badhash && { has badhash log 1 "vendor library 0badc0de.* is not verified for the Paper Pro"; has badhash trace 1 "mode FAST"; has badhash trace 0 "lane stroke"; }
run nolane notes 20 native "$ferrari" && { has nolane log 1 "no ink lane at /run/zinc-ink.sock"; has nolane trace 1 "mode FAST"; }
run session notes 20 session "$ferrari" && { has session log 1 "no ink lane"; has session log 1 "ink session starts from its AppLoad tile"; }
run unknown notes 20 native "ZINC_RMPP_MACHINE=reMarkable Nova" ZN_RMPP_SIM_LANE=ok && { has unknown log 1 "unknown model 'reMarkable Nova'"; has unknown trace 0 "lane hello"; }
# "ink": "qtfb" (the default) never asks the lane, even when it runs
run qtfb notes 20 qtfb "$ferrari" ZN_RMPP_SIM_LANE=ok && { has qtfb trace 0 "lane hello"; has qtfb trace 1 "mode UI"; }

# Model rows (ZN-835): each panel gets its row's qtfb format; a model without a verified vendor row stays on qtfb with one message;
# the reMarkable 2 goes through rm2fb and never through qtfb
size=954x1696
run move notes 20 native "ZINC_RMPP_MACHINE=reMarkable Chiappa" && { has move trace 1 "init key 7 fmt 4 (RGB888 954x1696)"; has move log 1 "no ink lane"; }
size=1404x1872
run pure notes 20 native "ZINC_RMPP_MACHINE=reMarkable Tatsu" ZN_RMPP_SIM_LANE=ok && { has pure trace 1 "init key 7 fmt 7 (RGB888 1404x1872)"; has pure log 1 "vendor library 3800e9f3.* is not verified for the Paper Pure"; }
if run rm2 notes 40 native "ZINC_RMPP_MACHINE=reMarkable 2.0" ZN_RMPP_SIM_RM2FB=1 ZN_RMPP_SIM_LANE=ok; then
  has rm2 trace 1 "rm2fb init own 0 format 1404x1872/0"; has rm2 trace 1 "rm2fb update 0,0 1404x1872 GC16_FAST"; has rm2 trace 0 "init key"; has rm2 trace 0 "lane hello"
  has rm2 log 1 "no ink lane or session on the reMarkable 2"; has rm2 log 1 "reMarkable 2 through rm2fb"
fi
headless=1; run rm2-none notes 20 qtfb "ZINC_RMPP_MACHINE=reMarkable 2.0"; headless=
has rm2-none log 1 "reMarkable 2: rm2fb is not running"
size=

[ $fail -eq 0 ] && echo "rmpp sim: ok"
exit $fail
