#!/bin/sh
# Fast Refresh in zinc dev on the interpreter (ZN-742.02, docs/reports/zinc-next-fast-refresh.md §10), headless:
# 1. a gfx program: a save of a module that exports values re-runs it and its importers in the same process (same pid, `refreshed`, no new
#    version), and the module it did not touch keeps its state (the frame counter goes on);
# 2. a top-level effect without import.meta.hot.dispose restarts with a one-line reason, and a file that is not a module restarts too;
# 3. a compile error keeps the red box (the program is replaced by it) and the fix starts the program again;
# 4. a Solid program whose entry runs again mounts its root again, with the state of its store kept, and the first tree is disposed (its
#    effects stop).
cd "$(dirname "$0")/../.." || exit 2
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
t=$(mktemp -d); trap 'kill $dev 2>/dev/null; wait $dev 2>/dev/null; [ -n "$HOT_SWAP_KEEP" ] && cp "$t"/dev*.log "$HOT_SWAP_KEEP"; rm -rf "$t"' EXIT
fail=0
waitfor() { # file pattern seconds
  n=0; while [ $n -lt $(( $3 * 20 )) ]; do grep -q "$2" "$1" 2>/dev/null && return 0; sleep 0.05; n=$((n+1)); done; return 1; }
last() { grep "$2" "$1" | tail -1 | awk '{print $2}'; }   # the frame count of the last line of the program that starts with $2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2000000000
# ---- 1. gfx
mkdir -p "$t/g/src" && cd "$t/g" || exit 2
cat > src/state.ts <<'T'
export let frames: i32 = 0;
export function tick(): i32 { frames++; return frames; }
T
echo "export const label = 'one';" > src/labels.ts
cat > src/main.ts <<'T'
import { onFrame, clear } from 'zinc:gfx';
import { tick, frames } from './state';
import { label } from './labels';
const shown = label + '!';   // computed when this module runs: it changes only if the save re-runs it
onFrame((dt: number) => { clear(0x101820); if (tick() % 20000 === 0) console.log(shown, frames); });
T
"$Z" dev --no-devtools > "$t/dev.log" 2>&1 &
dev=$!
waitfor "$t/dev.log" "v1 started" 10 || { echo "dev did not start: $(cat "$t/dev.log")"; exit 1; }
waitfor "$t/dev.log" "^one! 40000" 10 || { echo "the program did not run: $(cat "$t/dev.log")"; exit 1; }
pid1=$(pgrep -P $dev)
echo "export const label = 'two';" > src/labels.ts
waitfor "$t/dev.log" "v1 refreshed src/labels.ts" 5 || { echo "no refresh: $(cat "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "^two! " 5 || { echo "main.ts did not run again: $(tail -5 "$t/dev.log")"; fail=1; }
[ "$(pgrep -P $dev)" = "$pid1" ] || { echo "the process changed: $pid1 -> $(pgrep -P $dev)"; fail=1; }
grep -q "v2 started" "$t/dev.log" && { echo "the save restarted the program: $(cat "$t/dev.log")"; fail=1; }
before=$(last "$t/dev.log" "^one!"); after=$(grep "^two!" "$t/dev.log" | head -1 | awk '{print $2}')
[ -n "$after" ] && [ "$after" -gt "$before" ] || { echo "state.ts lost its state: one! $before, then two! $after"; fail=1; }
ms=$(sed -n 's/.*refreshed src\/labels.ts (\([0-9]*\) ms after the save).*/\1/p' "$t/dev.log")
# 2. fallbacks: a top-level effect without dispose, then a file that is not a module
printf "export const label = 'three';\nconsole.log('labels ran');\n" > src/labels.ts
waitfor "$t/dev.log" "restart: src/labels.ts:2 .*no import.meta.hot.dispose" 5 || { echo "no restart with a reason: $(cat "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "v2 started" 5 || { echo "the restart did not start v2: $(cat "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "^three! " 10 || { echo "v2 did not run: $(tail -5 "$t/dev.log")"; fail=1; }
echo '{"name":"g"}' > zinc.json
waitfor "$t/dev.log" "restart: zinc.json changed (not a module)" 5 || { echo "zinc.json did not restart: $(tail -5 "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "v3 started" 5 || { echo "no v3: $(tail -5 "$t/dev.log")"; fail=1; }
# 3. a compile error: the red box; the fix: the program again
sleep 1
echo "export const label: i32 = 'four';" > src/labels.ts
waitfor "$t/dev.log" "compile error: src/labels.ts:1" 5 || { echo "no compile error: $(tail -5 "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "red box on screen" 5 || { echo "no red box: $(tail -5 "$t/dev.log")"; fail=1; }
echo "export const label = 'five';" > src/labels.ts
waitfor "$t/dev.log" "v4 started" 5 || { echo "the fix did not start v4: $(tail -5 "$t/dev.log")"; fail=1; }
kill $dev; wait $dev 2>/dev/null
# ---- 4. Solid: the entry runs again and mounts its root again; the store keeps its count
mkdir -p "$t/s/src" && cd "$t/s" || exit 2
cat > src/store.ts <<'T'
import { createSignal } from 'zinc:ui/solid';
export const [count, setCount] = createSignal<i32>(0);
T
echo "export const title = 'one';" > src/labels.ts
cat > src/app.tsx <<'T'
import { createEffect } from 'zinc:ui/solid';
import { count } from './store';
export function App(props: { title: string }): i32 {
  console.log('mount', props.title, count() > 0 ? 'counting' : 'zero');
  createEffect(() => { if (count() % 20000 === 0) console.log('tick', props.title); });
  return <View><Text>{props.title}</Text></View>;
}
T
cat > src/main.tsx <<'T'
import { render } from 'zinc:ui/solid';
import { App } from './app';
import { title } from './labels';
import { count, setCount } from './store';
render(() => <App title={title} />, 0x000000, (dt: number) => { setCount(count() + 1); });
T
"$Z" dev --no-devtools > "$t/dev2.log" 2>&1 &
dev=$!
waitfor "$t/dev2.log" "^mount one zero" 15 || { echo "the Solid program did not mount: $(cat "$t/dev2.log")"; exit 1; }
sleep 0.5
pid1=$(pgrep -P $dev)
echo "export const title = 'two';" > src/labels.ts
waitfor "$t/dev2.log" "v1 refreshed src/labels.ts" 5 || { echo "no refresh of the Solid program: $(cat "$t/dev2.log")"; fail=1; }
waitfor "$t/dev2.log" "^mount two counting" 5 || { echo "the root did not mount again with the count kept: $(tail -5 "$t/dev2.log")"; fail=1; }
[ "$(pgrep -P $dev)" = "$pid1" ] || { echo "the Solid program's process changed"; fail=1; }
waitfor "$t/dev2.log" "^tick two" 5 || { echo "the new tree does not run: $(tail -5 "$t/dev2.log")"; fail=1; }
sed -n '/^mount two/,$p' "$t/dev2.log" | grep -q "^tick one" && { echo "the first tree is still alive after the entry ran again"; fail=1; }
ms2=$(sed -n 's/.*refreshed src\/labels.ts (\([0-9]*\) ms after the save).*/\1/p' "$t/dev2.log")
[ $fail -eq 0 ] && echo "hot_swap: ok (refreshed $ms ms after the save on gfx, $ms2 ms on Solid)"
exit $fail
