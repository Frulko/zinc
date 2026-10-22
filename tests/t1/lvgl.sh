#!/bin/sh
# zinc:lvgl on the computer (plugins/lvgl, decision D156): LVGL's C is built as the plugin's library; in a deterministic headless run a
# tapped button gets its click and LVGL redraws after the first frame (its clock is the frames'), a plugin's now_ms moves (LVGL's time is
# measured), and two runs give the same picture. The first build of the plugin compiles LVGL's C (about a minute); later runs reuse it.
cd "$(dirname "$0")/../.." || exit 2
T=$(mktemp -d) && trap 'rm -rf "$T"' EXIT
fail=0
cat > "$T/main.ts" <<'TS'
import * as lv from 'zinc:lvgl';
lv.start(240, 320, true, 0x3b82f6);
const b = lv.button(lv.screen(), 'Tap');
lv.align(b, lv.ALIGN_CENTER, 0, 0);
let taps = 0;
let frame = 0;
lv.on(b, lv.EVENT_CLICKED, () => { taps++; lv.setText(lv.buttonLabel(b), 'Tapped ' + taps); });
lv.run((dt: number) => {
  frame++;
  if (frame === 2) lv.stats();   // the first full render is not counted
  if (frame === 30) { const s = lv.stats(); console.log('taps ' + taps + ', redrawn ' + (s[3] > 0) + ', timed ' + (s[1] > 0)); }
});
TS
printf "8 move 120 160\n10 down\n12 up\n" > "$T/input"
run() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=31 ZINC_INPUT="$T/input" ZINC_SHOT="$T/$1.png" "$ZINC" run "$T/main.ts" 2>&1; }
run a > "$T/a.log" || { echo "lvgl: the program failed"; tail -20 "$T/a.log"; fail=1; }
grep -q "^taps 1, redrawn true, timed true$" "$T/a.log" || { echo "lvgl: expected 'taps 1, redrawn true, timed true':"; grep -v "^  " "$T/a.log" | tail -5; fail=1; }
run b > "$T/b.log" && cmp -s "$T/a.png" "$T/b.png" || { echo "lvgl: two deterministic runs differ"; fail=1; }
exit $fail
