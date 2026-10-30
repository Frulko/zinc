#!/bin/sh
# Several windows that talk (ZN-864). tests/data/multiwin: the main window and a second one show a zinc:ui tree each; zinc:system/window
# lists, moves and resizes both and closes the second; a MessageChannel carries typed messages both ways, posted and as request/reply. The
# interpreter, the AOT and QuickJS print the same lines and draw the same frames of both windows. tests/data/multiwin_worker: the second
# window's scene is computed by a worker (workerPort/parentPort); a deterministic run captures both windows, a run on the real clock checks
# that the main window keeps drawing while the worker holds its thread 1.5 s (interpreter; the AOT build of workers is worker_engines.sh's).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
want() {   # log line
  grep -qxF "$2" "$tmp/$1.log" || { echo "$1: no line '$2' in: $(tr '\n' '|' <"$tmp/$1.log" | head -c 600)"; fail=1; }
}
same() {   # image golden
  tools/pngdiff "$1" "$2" >"$tmp/d" 2>&1 || { echo "$(basename "$1") differs from $2: $(head -1 "$tmp/d")"; fail=1; }
}
for r in interp native quickjs; do
  e=""; p=tests/data/multiwin; [ $r = quickjs ] && e="--engine quickjs"
  env ZINC_RUN=$r ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=12 ZINC_SHOT="$tmp/$r.png" ZINC_SHOT_FRAMES=7 \
    timeout 120 "$ZINC" run $p $e >"$tmp/$r.log" 2>&1 || { echo "$r: exit $?: $(tail -c 400 "$tmp/$r.log")"; fail=1; continue; }
  want $r "side window 1"
  want $r "windows: 0@0,0 320x240 1@0,0 240x140"
  want $r "moved: 0@10,20 320x240 1@400,40 260x160"
  want $r "side got 'hello' 1"
  want $r "main got 'thanks' 2"
  want $r "side asked, main replied 'main counts apples' 42"
  want $r "main asked, side replied 'side counts pears' 102"
  want $r "closed the side window: 0@10,20 320x240, open no"
  same "$tmp/$r-7.png" tests/golden/multiwin/main.png
  same "$tmp/$r-7-w1.png" tests/golden/multiwin/side.png
done

env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=9 ZINC_SHOT="$tmp/w.png" ZINC_SHOT_FRAMES=8 timeout 60 "$ZINC" run --interp tests/data/multiwin_worker >"$tmp/w.log" 2>&1 ||
  { echo "worker scene: exit $?: $(tail -c 400 "$tmp/w.log")"; fail=1; }
want w "scene 5: 8 shapes"
same "$tmp/w-8.png" tests/golden/multiwin/worker-main.png
same "$tmp/w-8-w1.png" tests/golden/multiwin/worker-side.png
# the real clock: the worker's busy wait reads it (tests/run sets ZINC_DETERMINISTIC)
env -u ZINC_DETERMINISTIC ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run --interp tests/data/multiwin_worker >"$tmp/busy.log" 2>&1 ||
  { echo "busy worker: exit $?: $(tail -c 400 "$tmp/busy.log")"; fail=1; }
want busy "busy reply 'done': the main window kept drawing"
exit $fail
