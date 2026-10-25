#!/bin/sh
# The console player (ZN-792, targets/console/player_console.cpp, src/agent/player.cpp) built for this machine with the headless HAL, on the
# loopback interface: a wrong code refused, pairing by its code, info (a player, its profile), zinc device deploy of a program packed for the
# PSP's profile (its lines followed to its end), a program that never ends deployed, its log read, stopped from the workstation, run again,
# zinc:sys exit (the player outlives it), a drawing program and the frame of its screen (zinc device shot), the refusals of a player (shell),
# and the player still serving after all of it. The same player runs in PPSSPP, Azahar and Vita3K (tests/t1/console_player_emulators.sh).
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
command -v cmake >/dev/null 2>&1 || { echo "console player: no cmake"; exit 77; }
B=${ZN_CONSOLE_PLAYER_BUILD:-build/console-player}
tmp=$(mktemp -d)
trap 'kill $ppid $dpid 2>/dev/null; wait $ppid 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
bad() { echo "console player: $*"; fail=1; }
{ [ -f "$B/CMakeCache.txt" ] || cmake -S targets/console -B "$B" -DZN_CONSOLE_PLAYER=ON; } >"$tmp/build.log" 2>&1 && cmake --build "$B" -j 4 >>"$tmp/build.log" 2>&1 ||
  { echo "console player: the player does not build"; tail -20 "$tmp/build.log"; exit 1; }

# the player: real time (ZINC_DETERMINISTIC would make its waits virtual, and a program's timers would spin), a port the system chooses
mkdir -p "$tmp/player" "$tmp/work"
env -u ZINC_DETERMINISTIC ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_PLAYER_HOME="$tmp/player" ZINC_PLAYER_CODE=123456 ZINC_PLAYER_PORT=0 \
  ZINC_PLAYER_BIND=127.0.0.1 ZINC_PLAYER_NAME=zn-player ZINC_PLAYER_PROFILE=psp "$PWD/$B/zinc-core" >"$tmp/player.log" 2>&1 & ppid=$!
n=0; while [ $n -lt 100 ] && ! grep -q "listening on" "$tmp/player.log"; do sleep 0.05; n=$((n+1)); done
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/player.log")
[ -n "$port" ] || { echo "console player: it did not start: $(cat "$tmp/player.log")"; exit 1; }
dev() { ZINC_HOME="$tmp/work" timeout 60 "$Z" device "$@"; }

out=$(dev pair "127.0.0.1:$port" 000000 2>&1) && bad "a wrong code paired"
case $out in *"wrong code"*) ;; *) bad "wrong code: $out";; esac
dev pair "127.0.0.1:$port" 123456 >/dev/null 2>&1 || bad "pairing with the code failed"
dev info > "$tmp/info" 2>&1 || bad "info: $(cat "$tmp/info")"
grep -q "player       psp, at 127.0.0.1" "$tmp/info" || bad "info does not say it is a PSP player: $(cat "$tmp/info")"
out=$(dev shell ls 2>&1) && bad "a player gave a shell"
case $out in *"is a player: no shell"*) ;; *) bad "shell: $out";; esac

# a program packed for the PSP, its lines followed to its end; the same lines as zinc run --profile psp
want=$(cd examples/hello && "$Z" run --interp --profile psp . 2>/dev/null)
ZINC_STEPS=1 dev deploy examples/hello > "$tmp/hello.out" 2>"$tmp/hello.err" || bad "deploy hello: $(cat "$tmp/hello.err")"
grep -q "zn-player is a .*player: packing for --profile psp" "$tmp/hello.err" || bad "deploy does not say it packs for the PSP: $(cat "$tmp/hello.err")"
grep -v '^\[exited \|^packed ' "$tmp/hello.out" > "$tmp/hello.lines"   # zinc pack says what it packed, then the program's lines
[ "$(cat "$tmp/hello.lines")" = "$want" ] || { bad "hello's lines differ from zinc run --profile psp:"; diff "$tmp/hello.lines" - <<EOF | head -6
$want
EOF
}
grep -q '^\[exited 0\]$' "$tmp/hello.out" || bad "no [exited 0] after hello: $(tail -3 "$tmp/hello.out")"

# a program that never ends: deployed without following, its log read, stopped from here, run again, stopped
mkdir -p "$tmp/ticker/src"
printf '{ "name": "ticker", "entry": "src/main.ts" }\n' > "$tmp/ticker/zinc.json"
printf 'let n: i32 = 0;\nsetInterval(() => { n++; console.log("tick " + n); }, 20);\n' > "$tmp/ticker/src/main.ts"
dev deploy "$tmp/ticker" --no-logs >/dev/null 2>"$tmp/ticker.err" || bad "deploy ticker: $(cat "$tmp/ticker.err")"
sleep 0.5
dev logs ticker | grep -q "^tick 3$" || bad "the ticker's log: $(dev logs ticker 2>&1 | tail -3)"
dev apps | grep -q "^ticker .*running" || bad "apps does not show the ticker running: $(dev apps 2>&1)"
[ "$(dev stop ticker 2>&1)" = "stopped ticker" ] || bad "stop ticker"
sleep 0.3
dev logs ticker | tail -1 | grep -q '^\[exited 0\]$' || bad "the stopped ticker's log does not end with [exited 0]: $(dev logs ticker 2>&1 | tail -2)"
dev run ticker >/dev/null 2>&1 || bad "run ticker again"
sleep 0.3
dev logs ticker | grep -q "^tick 2$" || bad "the ticker run again"
dev stop ticker >/dev/null 2>&1

# zinc:sys exit ends the program, not the player
mkdir -p "$tmp/quits/src"
printf '{ "name": "quits", "entry": "src/main.ts" }\n' > "$tmp/quits/zinc.json"
printf 'import { exit } from "zinc:sys";\nconsole.log("bye");\nexit(3);\n' > "$tmp/quits/src/main.ts"
dev deploy "$tmp/quits" > "$tmp/quits.out" 2>&1 || bad "deploy quits: $(cat "$tmp/quits.out")"
grep -q '^bye$' "$tmp/quits.out" && grep -q '^\[exited 3\]$' "$tmp/quits.out" || bad "exit(3): $(cat "$tmp/quits.out")"

# a drawing program and the frame of the player's screen
dev deploy examples/bouncing-ball --no-logs >/dev/null 2>"$tmp/ball.err" || bad "deploy bouncing-ball: $(cat "$tmp/ball.err")"
sleep 0.5
(cd "$tmp" && dev shot bouncing-ball ball.png) >/dev/null 2>"$tmp/shot.err" || bad "shot: $(cat "$tmp/shot.err")"
[ "$(head -c 8 "$tmp/ball.png" 2>/dev/null | od -An -tx1 | tr -d ' \n')" = 89504e470d0a1a0a ] || bad "the shot is not a PNG"
dev stop bouncing-ball >/dev/null 2>&1

# zinc dev --device: the program runs on the player, a saved source replaces it there
until_grep() { n=0; while [ $n -lt 200 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.05; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }
mkdir -p "$tmp/devd/src"
printf '{ "name": "devd", "entry": "src/main.ts" }\n' > "$tmp/devd/zinc.json"
printf 'console.log("one");\nsetInterval(() => {}, 1000);\n' > "$tmp/devd/src/main.ts"
ZINC_HOME="$tmp/work" "$Z" dev "$tmp/devd" --device zn-player > "$tmp/dev.log" 2>&1 & dpid=$!
until_grep "^one$" "$tmp/dev.log" || bad "zinc dev --device: the program did not start on the player: $(cat "$tmp/dev.log")"
printf 'console.log("two");\nsetInterval(() => {}, 1000);\n' > "$tmp/main.new"; mv "$tmp/main.new" "$tmp/devd/src/main.ts"
until_grep "^two$" "$tmp/dev.log" || bad "zinc dev --device: the saved source does not run on the player: $(cat "$tmp/dev.log")"
kill $dpid 2>/dev/null; wait $dpid 2>/dev/null

# still there, and the ticker's files kept
dev info >/dev/null 2>&1 && dev apps | grep -q "^ticker " || bad "the player stopped serving"
kill -0 $ppid 2>/dev/null || bad "the player is gone: $(tail -5 "$tmp/player.log")"
[ $fail -eq 0 ] && echo "console player: ok"
exit $fail
