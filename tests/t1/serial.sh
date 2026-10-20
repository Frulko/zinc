#!/bin/sh
# zinc:serial (ZN-717), with no board. The native code (POSIX termios) against a pseudo-terminal whose other end tests/data/serial/fake_board.py
# holds: open errors that name the port and the reason, lines both ways (LF and CR LF, UTF-8), every byte value out and in unchanged (the port is
# raw: no XON/XOFF, no CR or NUL translation), 200,000 bytes written at once and queued until the port takes them, then the other end closes and
# the program is told the board was unplugged and ends; the same output interpreted and as a compiled program that links the plugin. Then the
# stand-in (serial.sim.ts) a deterministic run binds, with its loopback port, and examples/serial plotting a value through it.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "serial: no python3 to hold the other end of the pseudo-terminal"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
d=tests/data/serial
ZINC_NATIVE=real timeout 50 python3 $d/fake_board.py "$ZINC" run $d/board.ts >"$tmp/i.out" 2>&1
diff "$tmp/i.out" $d/board.out >"$tmp/d" || { echo "serial: board.ts interpreted: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
ZINC_NATIVE=real "$ZINC" build $d/board.ts -o "$tmp/board" >"$tmp/b.log" 2>&1 || { echo "serial: board.ts does not build: $(tail -c 300 "$tmp/b.log")"; fail=1; }
timeout 50 python3 $d/fake_board.py "$tmp/board" 2>&1 | diff - $d/board.out >"$tmp/d" || { echo "serial: board.ts compiled: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
ZINC_DETERMINISTIC=1 timeout 30 "$ZINC" run $d/loopback.ts 2>&1 | diff - $d/loopback.out >"$tmp/d" || { echo "serial: loopback.ts on the stand-in: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
out=$(ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=10 timeout 30 "$ZINC" run examples/serial 2>&1)
echo "$out" | grep -q "^serial: first value [0-9]*$" || { echo "serial: examples/serial plotted nothing: $(echo "$out" | head -3)"; fail=1; }
exit $fail
