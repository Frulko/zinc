#!/bin/sh
# zinc:lvgl on the computer (plugins/lvgl, decision D156): LVGL's C is built as the plugin's library; in a deterministic headless run a
# tapped button gets its click and LVGL redraws after the first frame (its clock is the frames'), a plugin's now_ms moves (LVGL's time is
# measured), LVGL's animations run to their end, begin part way in (a negative delay) and stop where they are, and two runs give the same
# picture. The first build of the plugin compiles LVGL's C (about a minute); later runs reuse it.
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
const once = lv.obj(lv.screen());
lv.size(once, 20, 20);
lv.animate(once, lv.X, 0, 100, 200, lv.LINEAR);                         // over by frame 13
const loop = lv.obj(lv.screen());
lv.size(loop, 20, 20);
lv.animate(loop, lv.Y, 0, 100, 1000, lv.LINEAR, -500, lv.FOREVER, 1000);   // begun half way
let begun = 0, stopped = 0;
lv.run((dt: number) => {
  frame++;
  if (frame === 2) { lv.stats(); begun = lv.posY(loop); }   // the first full render is not counted
  if (frame === 20) { lv.stopAnimation(loop); stopped = lv.posY(loop); }
  if (frame === 30) {
    const s = lv.stats();
    console.log('taps ' + taps + ', redrawn ' + (s[3] > 0) + ', timed ' + (s[1] > 0));
    console.log('animated to ' + lv.posX(once) + ', begun half way ' + (begun >= 50) + ', stopped ' + (stopped > 0 && lv.posY(loop) === stopped));
  }
});
TS
printf "8 move 160 160\n10 down\n12 up\n" > "$T/input"   # the button, the display's centre (120, 160); the display is centred in the window (320 x 240)
run() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=31 ZINC_INPUT="$T/input" ZINC_SHOT="$T/$1.png" "$ZINC" run "$T/main.ts" 2>&1; }
run a > "$T/a.log" || { echo "lvgl: the program failed"; tail -20 "$T/a.log"; fail=1; }
grep -q "^taps 1, redrawn true, timed true$" "$T/a.log" || { echo "lvgl: expected 'taps 1, redrawn true, timed true':"; grep -v "^  " "$T/a.log" | tail -5; fail=1; }
grep -q "^animated to 100, begun half way true, stopped true$" "$T/a.log" || { echo "lvgl: expected 'animated to 100, begun half way true, stopped true':"; grep -v "^  " "$T/a.log" | tail -5; fail=1; }
run b > "$T/b.log" && cmp -s "$T/a.png" "$T/b.png" || { echo "lvgl: two deterministic runs differ"; fail=1; }
# the same program under mquickjs, as on the board (the check runs LVGL's C for this computer through the firmware's zn_native.c, which
# carries a native call's arguments: animate takes nine)
"$ZINC" check "$T/main.ts" --target esp32 --engine mquickjs --frames 31 > "$T/mq.log" 2>&1 || { echo "lvgl: the program does not check under mquickjs"; grep -v "^  " "$T/mq.log" | tail -5; fail=1; }
exit $fail
