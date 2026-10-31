#!/bin/sh
# Timers of a real run (no ZINC_DETERMINISTIC) wait for the wall clock on every engine: 25 ticks of a 20 ms setInterval take half a
# second. QuickJS used to jump its clock from timer to timer when no native call was in flight, so an interval polled by a plugin (the
# fake microphone, zinc:webrtc's queue) ran as fast as the CPU goes. A deterministic run still jumps.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3 to time the runs"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.ts" <<'TS'
let n = 0;
const t = setInterval(() => { if (++n === 25) { clearInterval(t); console.log('ticks ' + n); } }, 20);
TS
unset ZINC_DETERMINISTIC ZINC_REPLAY ZINC_RECORD
ms() { python3 -c 'import subprocess,sys,time; t=time.time(); o=subprocess.run(sys.argv[1:],capture_output=True,text=True).stdout.strip(); print(int((time.time()-t)*1000), o)' "$@"; }
fail=0
"$ZINC" build "$tmp/t.ts" -o "$tmp/aot" >"$tmp/build.log" 2>&1 || { echo "timers_wall_clock: the AOT build fails: $(head -3 "$tmp/build.log")"; fail=1; }
for run in "interp:$ZINC run $tmp/t.ts --interp" "quickjs:$ZINC run $tmp/t.ts --engine quickjs" "aot:$tmp/aot"; do
  name=${run%%:*}
  [ "$name" = aot ] && [ ! -x "$tmp/aot" ] && continue
  set -- $(ms ${run#*:})
  [ "$2 $3" = "ticks 25" ] || { echo "timers_wall_clock $name: printed '$2 $3'"; fail=1; }
  [ "$1" -ge 450 ] || { echo "timers_wall_clock $name: 25 ticks of 20 ms took $1 ms of wall time"; fail=1; }
done
set -- $(ZINC_DETERMINISTIC=1 ms "$ZINC" run "$tmp/t.ts" --engine quickjs)
[ "$1" -lt 450 ] || { echo "timers_wall_clock: a deterministic QuickJS run waits ($1 ms)"; fail=1; }
exit $fail
