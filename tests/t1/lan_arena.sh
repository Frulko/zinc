#!/bin/sh
# The LAN multiplayer demo, examples/lan-arena (ZN-791), on loopback: a host and a client run headless at the same time. The client finds the
# host with the "who hosts?" broadcast (no address given), joins, sees both players in the snapshots, and its shots reach the host as balls.
# Then a solo match with bots at the PSP's size: the bots splat each other in 900 frames, and the interpreter and the native engine draw
# the same last frame (the raycaster and the billboards).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
ex=$PWD/examples/lan-arena
fail=0
# the duo runs on the real clock (tests/run sets ZINC_DETERMINISTIC, whose virtual clock would end --seconds in a few real ms)
port=$(python3 tests/free_ports.py 2>/dev/null || echo 47891)
env -u ZINC_DETERMINISTIC ARENA_PORT=$port ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run -q "$ex" -- --host --bots 0 --log --seconds 6 --name Host > "$tmp/host.log" 2>&1 &
sleep 1   # the host is bound before the client asks
env -u ZINC_DETERMINISTIC ARENA_PORT=$port ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run -q "$ex" -- --search --auto --autofire --log --seconds 4 --name Guest > "$tmp/client.log" 2>&1
wait
grep -q '^found Host at .*:'"$port"'$' "$tmp/client.log" || { echo "lan-arena: the client did not find the host by broadcast"; fail=1; }
grep -q '^welcome 1$' "$tmp/client.log" || { echo "lan-arena: the client was not admitted"; fail=1; }
grep -q '^players 2$' "$tmp/client.log" || { echo "lan-arena: the client's snapshots do not hold both players"; fail=1; }
grep -q '^joined 1 Guest from ' "$tmp/host.log" || { echo "lan-arena: the host did not admit the client"; fail=1; }
grep -q '^fire 1$' "$tmp/host.log" || { echo "lan-arena: the client's shots did not reach the host"; fail=1; }
grep -q '^left 1$' "$tmp/host.log" || { echo "lan-arena: the client's leaving was not heard"; fail=1; }
[ $fail -eq 0 ] || { echo "--- host (port $port)"; head -20 "$tmp/host.log"; echo "--- client"; head -20 "$tmp/client.log"; }

solo() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=480x272 ZINC_FRAMES=900 ZINC_FRAMEHASH=last timeout 120 "$ZINC" run "$ex" "$@" -- --solo --log 2>"$tmp/err"; grep framehash "$tmp/err" | awk '{ print $NF }'; }
solo --interp > "$tmp/interp"
hits=$(grep -c '^hit ' "$tmp/interp")
[ "$hits" -ge 1 ] || { echo "lan-arena: no splat in 900 frames of bots"; fail=1; }
h1=$(tail -1 "$tmp/interp"); h2=$(solo | tail -1)
[ -n "$h1" ] && [ "$h1" = "$h2" ] || { echo "lan-arena: the interpreter and the native engine draw different frames ($h1, $h2)"; fail=1; }
[ $fail -eq 0 ] && echo "lan-arena: ok ($hits splats solo)"
exit $fail
