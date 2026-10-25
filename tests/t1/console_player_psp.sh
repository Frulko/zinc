#!/bin/sh
# The PSP's Zinc Player (ZN-792) in PPSSPPHeadless: its network up (targets/psp/net_psp.cpp, ZN-791), a workstation pairs with its code on
# the loopback interface, deploys a program packed for the PSP and reads its lines, deploys a drawing program and gets the frame of its
# screen, stops it, and deploys again. The 3DS (Azahar) and the Vita (Vita3K) ran the same steps by hand (docs/reports/zinc-next-agent.md).
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
[ -f targets/psp/net_psp.cpp ] || { echo "console player psp: no PSP network (ZN-791) in this tree"; exit 77; }
emu=$("$Z" toolchain install ppsspp-headless 2>/dev/null) || { echo "console player psp: no ppsspp-headless"; exit 77; }
"$Z" toolchain install psp >/dev/null 2>&1 || { echo "console player psp: no pspdev"; exit 77; }
tmp=$(mktemp -d)
trap 'kill $epid 2>/dev/null; wait $epid 2>/dev/null; rm -rf "$tmp"' EXIT
port=$(python3 -I -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1])")
B=$PWD/build/console-psp-player-test
ZINC=$Z tools/build-console-core psp --player --env ZINC_PLAYER_CODE=123456 --env ZINC_PLAYER_PORT=$port --env ZINC_PLAYER_NAME=ppsspp -B "$B" >"$tmp/build.log" 2>&1 ||
  { echo "console player psp: the player does not build"; tail -20 "$tmp/build.log"; exit 1; }
rm -rf "$B/apps" "$B/logs" "$B/agent"   # PPSSPP's umd0: is the build directory: a fresh player
(cd "$tmp" && exec "$emu" --graphics=software --timeout=120 "$B/EBOOT.PBP") >"$tmp/emu.log" 2>&1 & epid=$!
n=0; while [ $n -lt 120 ] && ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do sleep 0.5; n=$((n+1)); done
fail=0
bad() { echo "console player psp: $*"; fail=1; }
dev() { ZINC_HOME="$tmp/work" timeout 60 "$Z" device "$@"; }
dev pair "127.0.0.1:$port" 123456 >/dev/null 2>&1 || { echo "console player psp: pairing failed: $(dev pair "127.0.0.1:$port" 123456 2>&1)"; exit 1; }
dev info 2>&1 | grep -q "player       psp" || bad "info does not say it is a PSP player"
want=$(cd examples/hello && "$Z" run --interp --profile psp . 2>/dev/null)
dev deploy examples/hello 2>/dev/null | grep -v '^\[exited \|^packed ' > "$tmp/hello" || bad "deploy hello"
[ "$(cat "$tmp/hello")" = "$want" ] || bad "hello's lines differ from zinc run --profile psp"
dev deploy examples/bouncing-ball --no-logs >/dev/null 2>&1 || bad "deploy bouncing-ball"
sleep 2
(cd "$tmp" && dev shot bouncing-ball ball.png) >/dev/null 2>&1 || bad "shot"
[ "$(head -c 8 "$tmp/ball.png" 2>/dev/null | od -An -tx1 | tr -d ' \n')" = 89504e470d0a1a0a ] || bad "the shot is not a PNG"
[ "$(dev stop bouncing-ball 2>&1)" = "stopped bouncing-ball" ] || bad "stop"
dev deploy examples/hello 2>/dev/null | grep -q '^\[exited 0\]$' || bad "the player did not take a second program"
[ $fail -eq 0 ] && echo "console player psp: ok"
exit $fail
