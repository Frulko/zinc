#!/bin/sh
# Zinc Go, the player (ZN-631, docs/reports/zinc-next-zinc-go.md), on this desktop: the player library (zn_app_player) linked into a player
# with no plugin and no home screen, run headless against `zinc dev --lan`, as a phone runs it:
# 1. zinc dev prints the QR code and the link; the player connects with the link, runs the program zinc dev compiled for it, and its console
#    lines reach zinc dev's terminal;
# 2. a save of a module is swapped in place by Fast Refresh: `refreshed`, the same player process, the module it did not touch keeps its state;
# 3. a top-level effect without dispose starts the program again in the same player, with the reason;
# 4. a program that calls a plugin the player lacks: the player names the plugin and keeps running (no crash);
# 5. a link with a wrong code is refused.
cd "$(dirname "$0")/../.." || exit 2
BUILD=${BUILD:-build}
Z="${ZINC:-$BUILD/zinc}"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
[ -f "$BUILD/libzn_app_player.a" ] && [ -f "$BUILD/zn_app.link" ] || { echo "skipped: the player is not built (tools/build zn_app_player)"; exit 77; }
t=$(mktemp -d); trap 'kill $dev $pl 2>/dev/null; wait $dev $pl 2>/dev/null; [ -n "$ZINC_GO_KEEP" ] && cp "$t"/*.log "$ZINC_GO_KEEP"; rm -rf "$t"' EXIT
fail=0
waitfor() { # file pattern seconds
  n=0; while [ $n -lt $(( $3 * 20 )) ]; do grep -q "$2" "$1" 2>/dev/null && return 0; sleep 0.05; n=$((n+1)); done; return 1; }
case $(uname) in
  Darwin) sys="-Wl,-dead_strip"; for fw in Cocoa CoreMedia CoreVideo IOKit Carbon Foundation Metal QuartzCore AppKit CoreFoundation CoreGraphics CoreServices UniformTypeIdentifiers CoreHaptics GameController ForceFeedback AudioToolbox AVFoundation CoreAudio CoreBluetooth CoreMotion OpenGL; do sys="$sys -framework $fw"; done; sys="$sys -lobjc" ;;
  *) sys="-Wl,--gc-sections -ldl -lm -lpthread" ;;
esac
printf '#include "zn/app.h"\nint main(int argc, char** argv) { return zn_app_main(argc, argv); }\n' > "$t/main.cpp"
c++ -std=c++20 -O1 -w -I include "$t/main.cpp" "$BUILD/libzn_app_player.a" $(tr '\n' ' ' < "$BUILD/zn_app.link") $sys -o "$t/player" 2>"$t/link.log" || { echo "linking the player failed: $(head -5 "$t/link.log")"; exit 1; }
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2000000000
mkdir -p "$t/g/src" && cd "$t/g" || exit 2
printf 'export let frames: i32 = 0;\nexport function tick(): i32 { frames++; return frames; }\n' > src/state.ts
echo "export const label = 'one';" > src/labels.ts
cat > src/main.ts <<'T'
import { onFrame, clear } from 'zinc:gfx';
import { tick, frames } from './state';
import { label } from './labels';
const shown = label + '!';   // computed when this module runs: it changes only if the save runs it again
onFrame((dt: number) => { clear(0x101820); if (tick() % 20000 === 0) console.log(shown, frames); });
T
"$Z" dev --lan --port 18090 > "$t/dev.log" 2>&1 &
dev=$!
waitfor "$t/dev.log" "Scan it with Zinc Go, or open zinc://" 10 || { echo "zinc dev --lan did not start: $(cat "$t/dev.log")"; exit 1; }
grep -q "$(printf '\342\226\200')" "$t/dev.log" || { echo "no QR code in the terminal"; fail=1; }
url=$(sed -n 's/.*or open \(zinc:[^ ]*\).*/\1/p' "$t/dev.log" | head -1)
port=$(echo "$url" | sed 's/.*:\([0-9]*\)\/.*/\1/'); code=${url##*/}
# 5. a wrong code
"$t/player" "zinc://127.0.0.1:$port/00000000" > "$t/wrong.log" 2>&1
grep -q "zinc dev refused: wrong code" "$t/wrong.log" || { echo "a wrong code was not refused: $(tail -3 "$t/wrong.log")"; fail=1; }
# 1. the program from zinc dev
"$t/player" "zinc://127.0.0.1:$port/$code" > "$t/player.log" 2>&1 &
pl=$!
waitfor "$t/dev.log" "v1 started on " 30 || { echo "the player did not start the program: $(tail -5 "$t/dev.log"; tail -5 "$t/player.log")"; exit 1; }
waitfor "$t/dev.log" "| one! 40000" 10 || { echo "the program's lines did not reach zinc dev: $(tail -5 "$t/dev.log")"; fail=1; }
# 2. Fast Refresh
echo "export const label = 'two';" > src/labels.ts
waitfor "$t/dev.log" "v1 refreshed src/labels.ts on " 10 || { echo "no refresh: $(tail -8 "$t/dev.log"; tail -3 "$t/player.log")"; fail=1; }
waitfor "$t/dev.log" "| two! " 5 || { echo "main.ts did not run again: $(tail -5 "$t/dev.log")"; fail=1; }
kill -0 $pl 2>/dev/null || { echo "the player ended"; fail=1; }
before=$(grep "| one! " "$t/dev.log" | tail -1 | awk '{print $NF}'); after=$(grep "| two! " "$t/dev.log" | head -1 | awk '{print $NF}')
[ -n "$after" ] && [ -n "$before" ] && [ "$after" -gt "$before" ] || { echo "state.ts lost its state: one! $before, then two! $after"; fail=1; }
grep "refreshed src/labels.ts" "$t/dev.log" | head -1 | sed 's/^zinc dev: /  /'
# 3. a top-level effect: started again, in the same player
printf "export const label = 'three';\nconsole.log('labels ran');\n" > src/labels.ts
waitfor "$t/dev.log" "restart on .*: src/labels.ts:2 .*no import.meta.hot.dispose" 10 || { echo "no restart with a reason: $(tail -5 "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "v2 started on " 5 || { echo "the restart did not start v2: $(tail -5 "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "| three! " 10 || { echo "v2 did not run: $(tail -5 "$t/dev.log")"; fail=1; }
# 3b. the React model: a save of a component's file renders the whole tree again with the new code (its handlers are the old file's closures),
#     the store of a module it did not touch keeps its count
mkdir -p src
printf 'export let ticks: i32 = 0;\nexport function tick(): void { ticks++; }\n' > src/store.ts
printf "import { View, Text, Pressable } from 'zinc:react-native';\nimport { ticks } from './store';\nexport function App() {\n  console.log('alpha', ticks);\n  return <View><Pressable onPress={() => console.log('pressed')}><Text>alpha</Text></Pressable></View>;\n}\n" > src/app.tsx
printf "import { render } from 'zinc:ui/react';\nimport { App } from './app';\nimport { tick } from './store';\nrender(App, 0, (dt: number): void => { tick(); });\n" > src/main.ts
waitfor "$t/dev.log" "v3 started on " 30 || { echo "the React program did not start: $(tail -5 "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "| alpha " 10 || { echo "the React program did not render: $(tail -5 "$t/dev.log")"; fail=1; }
sleep 0.5
sed -i '' 's/alpha/beta/g' src/app.tsx
waitfor "$t/dev.log" "v3 refreshed src/app.tsx on " 10 || { echo "the React component was not refreshed: $(grep -a 'zinc dev:' "$t/dev.log" | tail -2)"; fail=1; }
waitfor "$t/dev.log" "| beta " 5 || { echo "the tree did not render again with the new code: $(tail -3 "$t/dev.log")"; fail=1; }
n=$(grep -a "| beta " "$t/dev.log" | head -1 | awk '{print $NF}')
[ -n "$n" ] && [ "$n" -gt 10 ] || { echo "the store lost its count: beta $n"; fail=1; }
# 4. a plugin the player lacks (this one links none): named, and the player goes on
printf "import { devices } from 'zinc:camera';\nimport { onFrame, clear } from 'zinc:gfx';\ndevices().then((d) => console.log('cameras', d.length));\nonFrame((dt: number) => { clear(0); });\n" > src/main.ts
waitfor "$t/dev.log" "has no plugin 'camera'" 30 || { echo "the missing plugin was not named: $(tail -5 "$t/dev.log"; tail -3 "$t/player.log")"; fail=1; }
grep -q 'needs the plugin "camera"' "$t/player.log" || { echo "the player did not say which plugin: $(tail -3 "$t/player.log")"; fail=1; }
sleep 0.3
kill -0 $pl 2>/dev/null || { echo "the player stopped at the missing plugin"; fail=1; }
# ... and stays connected: the save that drops the plugin runs
printf "import { onFrame, clear } from 'zinc:gfx';\nconsole.log('without the camera');\nonFrame((dt: number) => { clear(0); });\n" > src/main.ts
waitfor "$t/dev.log" "| without the camera" 30 || { echo "the save without the plugin did not run: $(tail -5 "$t/dev.log")"; fail=1; }
[ $fail -eq 0 ] && echo "zinc go: ok"
exit $fail
