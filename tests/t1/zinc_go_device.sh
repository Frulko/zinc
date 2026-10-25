#!/bin/sh
# Zinc Go's device mode (ZN-792, src/app/player.cpp over src/agent/player.cpp): the player library linked into a desktop player with no home
# screen, headless, serving `zinc device` on the loopback (ZINC_PLAYER_PORT=0: a port the system chooses), as the Android and iOS players do on
# a phone's Wi-Fi: a wrong code refused, pairing, info (a player of the macos profile), deploy of hello (its lines, those of zinc run --profile
# macos), a program that never ends deployed, its log, stopped, run again, zinc:sys exit (the player outlives it), a drawing program and the
# frame on its screen (zinc device shot), zinc dev --device, and the player still serving. The phones: tests/t2/zinc_go_phones.sh by hand.
cd "$(dirname "$0")/../.." || exit 2
BUILD=${BUILD:-build}
Z="${ZINC:-$BUILD/zinc}"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
[ -f "$BUILD/libzn_app_player.a" ] && [ -f "$BUILD/zn_app.link" ] || { echo "skipped: the player is not built (tools/build zn_app_player)"; exit 77; }
t=$(mktemp -d); trap 'kill $pl $dpid 2>/dev/null; wait $pl $dpid 2>/dev/null; rm -rf "$t"' EXIT
fail=0
bad() { echo "zinc go device: $*"; fail=1; }
case $(uname) in
  Darwin) sys="-Wl,-dead_strip"; for fw in Cocoa CoreMedia CoreVideo IOKit Carbon Foundation Metal QuartzCore AppKit CoreFoundation CoreGraphics CoreServices UniformTypeIdentifiers CoreHaptics GameController ForceFeedback AudioToolbox AVFoundation CoreAudio CoreBluetooth CoreMotion OpenGL; do sys="$sys -framework $fw"; done; sys="$sys -lobjc" ;;
  *) sys="-Wl,--gc-sections -ldl -lm -lpthread" ;;
esac
printf '#include "zn/app.h"\nint main(int argc, char** argv) { return zn_app_main(argc, argv); }\n' > "$t/main.cpp"
c++ -std=c++20 -O1 -w -I include "$t/main.cpp" "$BUILD/libzn_app_player.a" $(tr '\n' ' ' < "$BUILD/zn_app.link") $sys -o "$t/player" 2>"$t/link.log" || { echo "linking the player failed: $(head -5 "$t/link.log")"; exit 1; }
mkdir -p "$t/home" "$t/work"
env -u ZINC_DETERMINISTIC ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_GO_HOME="$t/none.unit" ZINC_PLAYER_HOME="$t/home" ZINC_PLAYER_CODE=123456 \
  ZINC_PLAYER_PORT=0 ZINC_PLAYER_BIND=127.0.0.1 ZINC_PLAYER_NAME=zn-go "$t/player" > "$t/player.log" 2>&1 & pl=$!
n=0; while [ $n -lt 200 ] && ! grep -q "listening on" "$t/player.log"; do sleep 0.05; n=$((n+1)); done
port=$(sed -n 's/.*listening on [0-9.]*:\([0-9]*\).*/\1/p' "$t/player.log" | head -1)
[ -n "$port" ] || { echo "zinc go device: the player did not listen: $(cat "$t/player.log")"; exit 1; }
dev() { ZINC_HOME="$t/work" timeout 60 "$Z" device "$@"; }

out=$(dev pair "127.0.0.1:$port" 000000 2>&1) && bad "a wrong code paired"
case $out in *"wrong code"*) ;; *) bad "wrong code: $out";; esac
dev pair "127.0.0.1:$port" 123456 >/dev/null 2>&1 || bad "pairing with the code failed"
dev info > "$t/info" 2>&1 || bad "info: $(cat "$t/info")"
grep -q "player       macos, at " "$t/info" || bad "info does not say it is a macos player: $(cat "$t/info")"

want=$(cd examples/hello && "$Z" run --interp --profile macos . 2>/dev/null)
ZINC_STEPS=1 dev deploy examples/hello > "$t/hello.out" 2>"$t/hello.err" || bad "deploy hello: $(cat "$t/hello.err")"
grep -q "zn-go is a .*player: packing for --profile macos" "$t/hello.err" || bad "deploy does not say it packs for the profile: $(cat "$t/hello.err")"
grep -v '^\[exited \|^packed ' "$t/hello.out" > "$t/hello.lines"
[ "$(cat "$t/hello.lines")" = "$want" ] || { bad "hello's lines differ from zinc run --profile macos:"; printf '%s\n' "$want" | diff "$t/hello.lines" - | head -6; }
grep -q '^\[exited 0\]$' "$t/hello.out" || bad "no [exited 0] after hello: $(tail -3 "$t/hello.out")"

mkdir -p "$t/ticker/src"
printf '{ "name": "ticker", "entry": "src/main.ts" }\n' > "$t/ticker/zinc.json"
printf 'let n: i32 = 0;\nsetInterval(() => { n++; console.log("tick " + n); }, 20);\n' > "$t/ticker/src/main.ts"
dev deploy "$t/ticker" --no-logs >/dev/null 2>"$t/ticker.err" || bad "deploy ticker: $(cat "$t/ticker.err")"
sleep 0.5
dev logs ticker | grep -q "^tick 3$" || bad "the ticker's log: $(dev logs ticker 2>&1 | tail -3)"
dev apps | grep -q "^ticker .*running" || bad "apps does not show the ticker running: $(dev apps 2>&1)"
[ "$(dev stop ticker 2>&1)" = "stopped ticker" ] || bad "stop ticker"
sleep 0.3
dev logs ticker | tail -1 | grep -q '^\[exited ' || bad "the stopped ticker's log does not end with [exited n]: $(dev logs ticker 2>&1 | tail -2)"
dev run ticker >/dev/null 2>&1 || bad "run ticker again"
sleep 0.3
dev logs ticker | grep -q "^tick 2$" || bad "the ticker run again"
dev stop ticker >/dev/null 2>&1

mkdir -p "$t/quits/src"
printf '{ "name": "quits", "entry": "src/main.ts" }\n' > "$t/quits/zinc.json"
printf 'import { exit } from "zinc:sys";\nconsole.log("bye");\nexit(3);\n' > "$t/quits/src/main.ts"
dev deploy "$t/quits" > "$t/quits.out" 2>&1 || bad "deploy quits: $(cat "$t/quits.out")"
grep -q '^bye$' "$t/quits.out" && grep -q '^\[exited 3\]$' "$t/quits.out" || bad "exit(3): $(cat "$t/quits.out")"

dev deploy examples/bouncing-ball --no-logs >/dev/null 2>"$t/ball.err" || bad "deploy bouncing-ball: $(cat "$t/ball.err")"
sleep 0.5
(cd "$t" && dev shot bouncing-ball ball.png) >/dev/null 2>"$t/shot.err" || bad "shot: $(cat "$t/shot.err")"
[ "$(head -c 8 "$t/ball.png" 2>/dev/null | od -An -tx1 | tr -d ' \n')" = 89504e470d0a1a0a ] || bad "the shot is not a PNG"
dev stop bouncing-ball >/dev/null 2>&1

until_grep() { n=0; while [ $n -lt 200 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.05; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }
mkdir -p "$t/devd/src"
printf '{ "name": "devd", "entry": "src/main.ts" }\n' > "$t/devd/zinc.json"
printf 'console.log("one");\nsetInterval(() => {}, 1000);\n' > "$t/devd/src/main.ts"
ZINC_HOME="$t/work" "$Z" dev "$t/devd" --device zn-go > "$t/dev.log" 2>&1 & dpid=$!
until_grep "^one$" "$t/dev.log" || bad "zinc dev --device: the program did not start on the player: $(cat "$t/dev.log")"
printf 'console.log("two");\nsetInterval(() => {}, 1000);\n' > "$t/main.new"; mv "$t/main.new" "$t/devd/src/main.ts"
until_grep "^two$" "$t/dev.log" || bad "zinc dev --device: the saved source does not run on the player: $(cat "$t/dev.log")"
kill $dpid 2>/dev/null; wait $dpid 2>/dev/null

dev info >/dev/null 2>&1 && dev apps | grep -q "^ticker " || bad "the player stopped serving"
kill -0 $pl 2>/dev/null || bad "the player is gone: $(tail -5 "$t/player.log")"
[ $fail -eq 0 ] && echo "zinc go device: ok"
exit $fail
