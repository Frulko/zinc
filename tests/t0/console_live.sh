#!/bin/sh
# console.log of a running program (ZN-638): a line is in the redirected file, or through the pipe, one event-loop turn after it was printed, in the interpreter,
# in a native program (AOT) and on QuickJS. The program proves it itself: one turn prints `turn`, the next ones look for that line in the file its output goes to,
# say `seen while running` and end; a program whose output only comes out at exit never finds it and says `not seen`.
# A host that keeps the program's output (zinc mem: its standard output is the report) still gets it whole.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cat > "$tmp/timers.ts" <<'T'
import * as fs from 'zinc:fs';
import { args } from 'zinc:sys';
const log = args().length > 0 ? args()[0] : '';
console.log('start');
let n: i32 = 0;
const id = setInterval((): void => {
  n++;
  if (n === 1) { console.log('turn'); return; }
  const seen = fs.exists(log) && fs.readText(log).indexOf('turn\n') >= 0;
  if (seen || n > 500) { clearInterval(id); console.log(seen ? 'seen while running' : 'not seen'); }
}, 10);
T
cat > "$tmp/frames.ts" <<'T'
import { onFrame, quit } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import { args } from 'zinc:sys';
const log = args()[0];
let n = 0;
onFrame((dt: number): void => {
  n++;
  if (n === 1) { console.log('turn'); return; }
  const seen = fs.exists(log) && fs.readText(log).indexOf('turn\n') >= 0;
  if (seen || n > 100000) { console.log(seen ? 'seen while running' : 'not seen'); quit(); }
});
T
# check NAME: the log of the run that just ended
check() { grep -q '^seen while running$' "$tmp/$1.log" || { echo "$1: the line was not in the output while the program ran: $(tr '\n' ' ' < "$tmp/$1.log" | head -c 200)"; fail=1; }; }
export ZINC_HEADLESS=1 ZINC_FRAMES=200000 ZINC_DETERMINISTIC=1
# the timer loop: the clock is virtual in a deterministic run (always on QuickJS), so the turns follow each other at once; the output is in the file at the next one all the same
"$ZINC" run --interp "$tmp/timers.ts" -- "$tmp/interp.log" > "$tmp/interp.log" 2>&1; check interp
"$ZINC" build "$tmp/timers.ts" -o "$tmp/timers" > "$tmp/build.log" 2>&1 || { echo "zinc build failed: $(head -c 300 "$tmp/build.log")"; exit 1; }
"$tmp/timers" "$tmp/aot.log" > "$tmp/aot.log" 2>&1; check aot
"$ZINC" run "$tmp/timers.ts" --engine quickjs -- "$tmp/quickjs-timers.log" > "$tmp/quickjs-timers.log" 2>&1; check quickjs-timers
# through a pipe the reader needs real time to copy the line: a real clock, 10 ms a turn, 5 s at most
env -u ZINC_DETERMINISTIC "$ZINC" run --interp "$tmp/timers.ts" -- "$tmp/pipe.log" 2>&1 | cat > "$tmp/pipe.log"; check pipe
# the frame loop, on the typed engine and on QuickJS
"$ZINC" run --interp "$tmp/frames.ts" -- "$tmp/frames.log" > "$tmp/frames.log" 2>&1; check frames
"$ZINC" run "$tmp/frames.ts" --engine quickjs -- "$tmp/quickjs.log" > "$tmp/quickjs.log" 2>&1; check quickjs
"$ZINC" run "$tmp/frames.ts" --engine quickjs -- "$tmp/quickjs-pipe.log" 2>&1 | cat > "$tmp/quickjs-pipe.log"; check quickjs-pipe
# zinc mem: the report alone on the standard output, the program's lines on the standard error at the end
"$ZINC" mem "$tmp/timers.ts" > "$tmp/mem.out" 2> "$tmp/mem.err"
grep -q '^turn$' "$tmp/mem.out" && { echo "zinc mem: the program's output is in the report"; fail=1; }
grep -q '^turn$' "$tmp/mem.err" || { echo "zinc mem: the program's output is lost: $(head -c 200 "$tmp/mem.err")"; fail=1; }
exit $fail
