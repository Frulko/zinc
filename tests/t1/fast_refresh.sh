#!/bin/sh
# Fast Refresh of components (ZN-742.03, docs/reports/zinc-next-fast-refresh.md §11): the desktop-app template under zinc dev, headless.
# ZINC_INPUT types a name in Settings and opens Notes; the test then edits src/pages/notes.tsx (on screen) and src/pages/home.tsx: each save
# is refreshed in the same process (no new version), the next frames show the new text, the page and the typed name are kept, and the
# zinc:ui/solid proxies dispose the old instance so no callback of the old file stays alive. A late click opens Home: "Hello, Ada".
# A program on QuickJS restarts on a save, with the reason.
cd "$(dirname "$0")/../.." || exit 2
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
root=$PWD
t=$(mktemp -d); trap 'kill $dev 2>/dev/null; wait $dev 2>/dev/null; [ -n "$FAST_REFRESH_KEEP" ] && cp "$t"/dev.log "$FAST_REFRESH_KEEP"; rm -rf "$t"' EXIT
fail=0
waitfor() { # file pattern seconds
  n=0; while [ $n -lt $(( $3 * 20 )) ]; do grep -q "$2" "$1" 2>/dev/null && return 0; sleep 0.05; n=$((n+1)); done; return 1; }
latest() { ls "$t/scene" | sed -n 's/^s-\([0-9]*\)\.bin$/\1/p' | sort -n | tail -1; }
# texts SECONDS PATTERN: waits for a scene dump that draws a text matching PATTERN (after the newest dump at the call), prints its texts
texts() {
  from=$(latest); n=0
  while [ $n -lt $(( $1 * 20 )) ]; do
    l=$(latest)
    if [ "${l:-0}" -gt "${from:-0}" ]; then
      out=$(python3 "$root/tools/scene-texts" "$t/scene/s-$l.bin" 2>/dev/null)
      printf '%s\n' "$out" | grep -q "$2" && { printf '%s\n' "$out"; return 0; }
    fi
    sleep 0.05; n=$((n+1))
  done
  return 1
}
cd "$t" && "$Z" new desktop-app app >/dev/null && cd app || exit 2
# ~125 frames a second, so the late click of the script comes after the saves (a headless frame loop does not wait)
sed -i.bak 's/render(App, 0xffffff, (dt: number) => {});/render(App, 0xffffff, (dt: number) => { const t0 = Date.now(); while (Date.now() - t0 < 8) {} });/' src/main.tsx && rm src/main.tsx.bak
grep -q 'Date.now() - t0' src/main.tsx || { echo "the template's render call changed: $(grep 'render(' src/main.tsx)"; exit 1; }
cat > "$t/input.txt" <<'I'
5 move 80 156
6 down
7 up
15 move 500 174
16 down
17 up
20 text "Ada"
30 move 72 122
31 down
32 up
1500 move 72 88
1501 down
1502 up
I
mkdir -p "$t/scene"
unset ZINC_DETERMINISTIC   # the pace above reads the real clock (tests/run sets the virtual one)
export ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_INPUT="$t/input.txt" ZINC_STORAGE="$t/storage.json" ZINC_SCENE_DUMP="$t/scene/s.bin" ZINC_SHOT_EVERY=25
"$Z" dev --no-devtools > "$t/dev.log" 2>&1 &
dev=$!
waitfor "$t/dev.log" "v1 started" 20 || { echo "dev did not start: $(cat "$t/dev.log")"; exit 1; }
texts 20 "No notes yet." > "$t/notes1.txt" || { echo "the script did not reach Notes: $(tail -5 "$t/dev.log")"; exit 1; }
pid1=$(pgrep -P $dev)
# 1. the page on screen
sed -i.bak "s/No notes yet\./Nothing written yet./" src/pages/notes.tsx && rm src/pages/notes.tsx.bak
waitfor "$t/dev.log" "v1 refreshed src/pages/notes.tsx" 10 || { echo "notes.tsx was not refreshed: $(tail -5 "$t/dev.log")"; fail=1; }
texts 10 "Nothing written yet." > "$t/notes2.txt" || { echo "the new text of notes.tsx is not on screen: $(tail -5 "$t/dev.log")"; fail=1; }
# 2. a page not on screen
sed -i.bak "s/'Welcome'/'Hello'/; s/\`Welcome, /\`Hello, /" src/pages/home.tsx && rm src/pages/home.tsx.bak
waitfor "$t/dev.log" "v1 refreshed src/pages/home.tsx" 10 || { echo "home.tsx was not refreshed: $(tail -5 "$t/dev.log")"; fail=1; }
texts 30 "Hello, Ada" > "$t/home.txt" || { echo "Home does not greet the typed name with the new text: $(tail -5 "$t/dev.log")"; fail=1; }
[ "$(pgrep -P $dev)" = "$pid1" ] || { echo "the process changed: $pid1 -> $(pgrep -P $dev)"; fail=1; }
grep -q "v2 started\|restart:" "$t/dev.log" && { echo "a save restarted the program: $(cat "$t/dev.log")"; fail=1; }
ms=$(sed -n 's/.*refreshed src\/pages\/notes.tsx (\([0-9]*\) ms after the save).*/\1/p' "$t/dev.log")
ms2=$(sed -n 's/.*refreshed src\/pages\/home.tsx (\([0-9]*\) ms after the save).*/\1/p' "$t/dev.log")
kill $dev; wait $dev 2>/dev/null
# 3. QuickJS has no Fast Refresh: a save restarts the program and says so
mkdir -p "$t/q/src" && cd "$t/q" || exit 2
echo '{"name":"q","entry":"src/main.js"}' > zinc.json
echo 'setInterval(() => {}, 1000); console.log("one");' > src/main.js
"$Z" dev --no-devtools > "$t/q.log" 2>&1 &
dev=$!
waitfor "$t/q.log" "^one" 10 || { echo "the QuickJS program did not start: $(cat "$t/q.log")"; fail=1; }
echo 'setInterval(() => {}, 1000); console.log("two");' > src/main.js
waitfor "$t/q.log" "restart: the program runs on QuickJS.*, which has no Fast Refresh" 5 || { echo "no QuickJS restart line: $(cat "$t/q.log")"; fail=1; }
waitfor "$t/q.log" "^two" 10 || { echo "the QuickJS program did not restart: $(cat "$t/q.log")"; fail=1; }
[ $fail -eq 0 ] && echo "fast_refresh: ok (notes.tsx refreshed $ms ms after the save, home.tsx $ms2 ms)"
exit $fail
