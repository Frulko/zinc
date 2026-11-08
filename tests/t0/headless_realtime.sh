#!/bin/sh
# Headless frames in real time on request (ZN-1005): with ZINC_REALTIME=1 the null HAL paces frames at 60 a second, so ZINC_FRAMES=60 lasts about
# a second and a 500 ms timer fires inside a 300-frame ZINC_SHOT run; ZINC_DURATION=ms ends a run that sets no frame count; a deterministic run
# still goes as fast as it can. The program reports itself: the frame its timer fired at, and the real time at frame 60. About 6 s.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/pace.ts" <<'T'
import { onFrame, rect } from 'zinc:gfx';
let n = 0;
const t0 = Date.now();
setTimeout((): void => { console.log('timer at frame ' + n); }, 500);
onFrame((dt: number): void => { n++; rect(0, 0, 10, 10, 0xff0000ff); if (n === 60) console.log('frame 60 at ' + (Date.now() - t0)); });
T
export ZINC_HEADLESS=1; unset ZINC_DETERMINISTIC ZINC_FRAMES ZINC_SHOT ZINC_DURATION
fail=0
ms() { python3 -c 'import time; print(int(time.time() * 1000))'; }
# frame 60 at about 1000 ms (a loaded machine may be late, never early), on the typed engine and on QuickJS
for e in --interp --engine; do
  [ "$e" = --engine ] && set -- --engine quickjs || set -- --interp
  ZINC_REALTIME=1 ZINC_FRAMES=60 timeout 20 "$ZINC" run "$tmp/pace.ts" "$@" > "$tmp/a.out" 2>/dev/null
  t=$(sed -n 's/^frame 60 at //p' "$tmp/a.out")
  [ -n "$t" ] && [ "$t" -ge 900 ] && [ "$t" -le 3000 ] || { echo "$*: ZINC_FRAMES=60 in real time took '$t' ms: $(tr '\n' '|' < "$tmp/a.out")"; fail=1; }
done
# a 500 ms timer fires inside a 300-frame capture run, around frame 30
ZINC_REALTIME=1 ZINC_FRAMES=300 ZINC_SHOT="$tmp/shot.png" timeout 20 "$ZINC" run --interp "$tmp/pace.ts" > "$tmp/b.out" 2>/dev/null
f=$(sed -n 's/^timer at frame //p' "$tmp/b.out")
[ -n "$f" ] && [ "$f" -ge 20 ] && [ "$f" -le 60 ] && [ -s "$tmp/shot.png" ] || { echo "ZINC_SHOT run: the timer fired at frame '$f': $(tr '\n' '|' < "$tmp/b.out")"; fail=1; }
# ZINC_DURATION alone: the run ends after 700 ms, before frame 60, with its timer fired
s=$(ms); ZINC_REALTIME=1 ZINC_DURATION=700 timeout 20 "$ZINC" run --interp "$tmp/pace.ts" > "$tmp/c.out" 2>/dev/null; e=$(ms)
grep -q '^timer at frame' "$tmp/c.out" && ! grep -q '^frame 60' "$tmp/c.out" && [ $((e - s)) -lt 10000 ] || { echo "ZINC_DURATION=700: $(tr '\n' '|' < "$tmp/c.out") in $((e - s)) ms"; fail=1; }
# deterministic: 600 frames as fast as they come (paced, they would take 10 s)
s=$(ms); ZINC_DETERMINISTIC=1 ZINC_FRAMES=600 timeout 20 "$ZINC" run --interp "$tmp/pace.ts" > "$tmp/d.out" 2>/dev/null; e=$(ms)
[ $((e - s)) -lt 5000 ] || { echo "a deterministic run of 600 frames took $((e - s)) ms"; fail=1; }
exit $fail
