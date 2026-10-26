#!/bin/sh
# reMarkable panel model (ZN-130, ZN-834): the real display-rmpp driver (plugins/display-rmpp/rmpp.cpp) runs inside a Zinc app on the Mac against a fake AppLoad
# qtfb server, a fake ink lane and a model of the compositor (tests/native/rmpp/sim.cpp).
#   notes, dashboard: the trace of messages (modes, update rectangles, hash of the glass after each) is compared with tests/golden/sim/rmpp-<app>.trace;
#   the other runs prove the backend choice per manifest option ("ink": qtfb / native / session), the L1 -> L0 downgrade on EOF and the fallbacks
#   (no lane, unverified vendor hash, unknown model), each with its one message; the "touch" run taps the dashboard's buttons through AppLoad's
#   MESSAGE_USERINPUT (ZN_RMPP_SIM_TAP) and must give the golden's screens.
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
  src=$root/examples/remarkable/$app; case $app in */*) src=$root/$app ;; esac   # an app of examples/remarkable, or a path (a fixture)
  ln -s "$src/src" "$proj/src"; [ -d "$src/native" ] && ln -s "$src/native" "$proj/native"
  # the option as a project sets it; under ZINC_DISPLAY (needed headless) it is read from plugins.<driver> of zinc.json
  opt=""; [ "$ink" != - ] && opt=" \"plugins\": { \"display-rmpp-sim\": { \"ink\": \"$ink\" } },"
  sz=""; [ -n "$size" ] && sz="-e s/1620/${size%x*}/ -e s/2160/${size#*x}/"   # $size=WxH: another model's panel
  sed $sz -e "1s/{/{$opt/" -e 's/"driver": "rmpp"/"driver": "rmpp-sim"/' "$src/zinc.json" > "$proj/zinc.json"
  sed "s|\"RMPP_DRIVER\"|\"$root/plugins/display-rmpp/rmpp.cpp\"|" tests/native/rmpp/sim.cpp > "$proj/plugins/display-rmpp-sim/sim.cpp"
  # the plugin cache keys on this source and its neighbours: the driver's own files go in as a hash, so an edited header is rebuilt
  cat plugins/display-rmpp/*.cpp plugins/display-rmpp/*.h integrations/remarkable-ink/protocol.h | shasum | sed 's|^|// driver |' >> "$proj/plugins/display-rmpp-sim/sim.cpp"
  cat > "$proj/plugins/display-rmpp-sim/plugin.json" <<J
{ "name": "display-rmpp-sim", "kind": "display", "options": {},
  "targets": { "macos": { "sources": ["sim.cpp"], "flags": ["-I$root/tests/native/stubs", "-I$root/plugins/display-rmpp", "-I$root/integrations/remarkable-ink"] }, "linux": { "sources": ["sim.cpp"] } } }
J
  : > "$proj/input"; [ $app = dashboard ] && [ -z "$taps" ] && printf "80 move 1360 456\n81 down\n82 up\n200 move 120 800\n201 down\n202 up\n" > "$proj/input"
  ( cd "$proj" && env "$@" ZN_RMPP_SIM_OUT="$proj/out" ZINC_STORAGE="$proj/storage.kv" ZINC_DISPLAY=rmpp-sim QTFB_KEY=7 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_INPUT="$proj/input" ZINC_FRAMES=$frames \
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

# the dashboard saves its state as it changes (zinc:storage): after the golden run's taps (Start, the second task, done at start) the timer's end and the
# tasks are stored, and a second run on that storage starts from them (its first page differs from a fresh start's)
st=$tmp/dashboard/storage.kv
grep -q "^dashboard.tasks	00000$" "$st" && grep -q "^dashboard.timerEnd	[0-9]" "$st" || { echo "dashboard: state not saved: $(cat "$st" 2>/dev/null | cut -c1-60)"; fail=1; }
mkdir -p "$tmp/again" && cp "$st" "$tmp/again/storage.kv"
taps=none
if run again dashboard 30 - ZINC_RMPP_REFRESH_MODE=fast; then
  first() { grep -m1 " update " "$tmp/$1/out/trace.txt" | sed 's/.* glass //'; }
  [ "$(first again)" != "$(first dashboard)" ] || { echo "again: the dashboard did not restore its saved state"; fail=1; }
  grep -q "^dashboard.tasks	00000$" "$tmp/again/storage.kv" || { echo "again: the saved tasks changed"; fail=1; }
fi
# the dashboard's widget (RemarkableApp of zinc:remarkable) with the widget AppLoad: Accueil shows it, only its rectangle is sent, a task
# ticked in it is saved, a tap on its header collapses it (nothing sent) and opens it again (its rectangle repainted), and the full window comes back with the whole page and one full refresh
if run widget dashboard 160 - ZINC_RMPP_REFRESH_MODE=fast ZN_RMPP_SIM_APPLOAD=widget "ZN_RMPP_SIM_TAP=${WIDGET_TAPS:-40:1294,85;80:400,180}" \
     ZN_RMPP_SIM_RESTORE=${WIDGET_RESTORE:-60} ZN_RMPP_SIM_COLLAPSE=70-76 ${WIDGET_FULL:+ZN_RMPP_SIM_FULL=1}; then
  [ -n "$WIDGET_TRACE" ] && cp "$tmp/widget/out/trace.txt" "$WIDGET_TRACE"
  [ -n "$WIDGET_FULL" ] && cp "$tmp/widget/out/glass.ppm" "$WIDGET_FULL"
  has widget trace 1 "widget rect 0,0 640x260"; has widget trace 1 " widget$"; has widget trace 1 " restore"
  has widget trace + "update PARTIAL 0,0 1620x2160"; has widget trace 1 "full refresh"; has widget trace 1 " collapse$"
  awk '/ expand$/ { e = 1; next } e && / update / { print; exit }' "$tmp/widget/out/trace.txt" | grep -q "update PARTIAL 0,0 640x260" ||
    { echo "widget: the widget was not repainted when it opened again"; fail=1; }
  grep -q "^dashboard.tasks	01100$" "$tmp/widget/storage.kv" || { echo "widget: the task ticked in the widget was not saved: $(grep tasks "$tmp/widget/storage.kv")"; fail=1; }
fi
taps=

# the automatic full refresh: after the notes demo's strokes and an idle pen, AppLoad 0.6 gets one; 0.5 (no device state) never
if run full notes 260 - NOTES_DEMO=1 ZINC_RMPP_REFRESH_MODE=fast ZN_RMPP_SIM_APPLOAD=0.6 ZINC_RMPP_FULL_AFTER_PCT=0 ZINC_RMPP_FULL_AFTER_UPDATES=20; then has full trace + "full refresh"; fi
if run full05 notes 260 - NOTES_DEMO=1 ZINC_RMPP_REFRESH_MODE=fast ZINC_RMPP_FULL_AFTER_PCT=1; then has full05 trace 0 "full refresh"; fi
# refreshDisplay() of zinc:gfx (the demo asks once after its strokes), with the automatic one off: exactly one
if run asked notes 260 - NOTES_DEMO=1 NOTES_DEMO_REFRESH=1 ZINC_RMPP_REFRESH_MODE=fast ZN_RMPP_SIM_APPLOAD=0.6 ZINC_RMPP_FULL_AFTER_PCT=0 ZINC_RMPP_FULL_AFTER_UPDATES=0; then has asked trace 1 "full refresh"; fi
# Accueil (minimizeWindow of zinc:gfx; the demo asks after its strokes): with the window-state AppLoad the window hides, nothing is sent
# while it is hidden (an update then is an error), and when it shows again the whole page goes out and one full refresh follows
if run home notes 300 - NOTES_DEMO=1 NOTES_DEMO_HOME=1 ZINC_RMPP_REFRESH_MODE=fast ZN_RMPP_SIM_APPLOAD=window ZINC_RMPP_FULL_AFTER_PCT=0 ZINC_RMPP_FULL_AFTER_UPDATES=0; then
  has home trace 1 " minimize"; has home trace 1 " restore"; has home trace + "update PARTIAL 0,0 1620x2160"; has home trace 1 "full refresh"
fi
# an AppLoad without it would drop the client: the driver never sends the message there
if run home06 notes 300 - NOTES_DEMO=1 NOTES_DEMO_HOME=1 ZINC_RMPP_REFRESH_MODE=fast ZN_RMPP_SIM_APPLOAD=0.6; then has home06 trace 0 "minimize"; fi

# An app that asks for the Pen waveform while it writes (zinc:remarkable setPenMode; InkPalette unfolded) and UI again after: both
# switches reach qtfb in order, the second one once qtfb's second after the first is over
if run penmode tests/data/rmpp-penmode 400 - "$ferrari"; then
  [ "$(grep -o 'mode [A-Z][A-Z]*' "$tmp/penmode/out/trace.txt" | tr '\n' ' ')" = "mode UI mode FAST mode UI " ] || { echo "penmode: $(grep -o 'mode [A-Z][A-Z]*' "$tmp/penmode/out/trace.txt" | tr '\n' ' ')"; fail=1; }
fi

# The way out of a stuck app: three fingers held 2 s quit it (one journal line); two fingers held as long do not
if run escape tests/data/rmpp-penmode 600 - "$ferrari" ZN_RMPP_SIM_HOLD=60:3:200; then
  has escape log 1 "three fingers held 2 s: quitting the app"; [ "$(grep -c 'update PARTIAL' "$tmp/escape/out/trace.txt")" -lt 60 ] || { echo "escape: the app went on after the gesture"; fail=1; }
fi
if run noescape tests/data/rmpp-penmode 300 - "$ferrari" ZN_RMPP_SIM_HOLD=60:2:200; then has noescape log 0 "quitting the app"; fi

# L1: "ink": "native" with a lane that answers a verified hash. qtfb stays in UI; strokes go through the lane, never through qtfb.
pen=ZN_RMPP_SIM_PEN=70-95,110-130
if run lane notes 140 native NOTES_DEMO=1 "$ferrari" ZN_RMPP_SIM_LANE=ok $pen; then
  has lane log 1 "ink lane on (Paper Pro"; has lane trace 1 "mode UI"; has lane trace 0 "mode FAST"
  has lane trace 2 "lane stroke begin"; has lane trace + "lane ink "; has lane trace 2 "lane stroke end"; has lane trace 1 "lane bye"
fi
# L1 through zinc-canvas: its Welcome names xochitl's hash (verified on the tablet), not a vendor row; the same strokes, no vendor check
if run canvas notes 140 native NOTES_DEMO=1 "$ferrari" ZN_RMPP_SIM_LANE=canvas $pen; then
  has canvas log 1 "ink canvas on (Paper Pro, xochitl 0badc0de0bad)"; has canvas log 0 "not verified"; has canvas trace 1 "mode UI"
  has canvas trace 2 "lane stroke begin"; has canvas trace + "lane ink "; has canvas trace 2 "lane stroke end"
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

# L0 touch (AppLoad's MESSAGE_USERINPUT): the dashboard's two taps sent by the fake qtfb instead of ZINC_INPUT give the same screens as the golden
taps=1
if run touch dashboard 360 - ZINC_RMPP_REFRESH_MODE=fast "ZN_RMPP_SIM_TAP=80:1360,456;200:120,800"; then
  has touch trace 4 " touch "
  grep -v " touch " "$tmp/touch/out/trace.txt" | diff -q - tests/golden/sim/rmpp-dashboard.trace >/dev/null ||
    { echo "touch: qtfb taps do not press the dashboard's buttons as the golden's taps do"; grep -v " touch " "$tmp/touch/out/trace.txt" | diff - tests/golden/sim/rmpp-dashboard.trace | head -6; fail=1; }
fi
taps=

# L0 keys (AppLoad's MESSAGE_USERINPUT, INPUT_BTN_*: the Type Folio): Qt key codes, with Shift held, reach the focused field as text and
# named keys: "Hi é!" ("Hi é" on the way and again after Backspace), Return, then Ctrl+A that types nothing.
S=0x01000020
if run keys tests/fixtures/rmpp-keys 40 - "ZN_RMPP_SIM_KEYS=10:+$S,0x48,-$S,0x49,0x20,0xC9,+$S,0x21,-$S;14:0x01000003;16:0x01000004;18:+0x01000021,0x41,-0x01000021"; then
  has keys log 1 "typed \[Hi é!\]"; has keys log 2 "typed \[Hi é\]$"; has keys log 1 "^submit"; has keys log 0 "typed \[.*a"
fi

[ $fail -eq 0 ] && echo "rmpp sim: ok"
exit $fail
