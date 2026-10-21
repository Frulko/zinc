#!/bin/sh
# zinc:ble on the simulated radio only: never the real one (the system's permission question goes to the app that started the test, and a
# host without the Bluetooth usage text gets the process killed). tests/data/ble/echo.ts on the interpreter with the stand-in
# (ble.sim.ts): scan, connect, 'ping' echoed back, a message cut into 20-byte chunks across multi-byte characters comes back whole, '\n'
# splits a text into two messages, close, a failed connect, advertise; the same output on QuickJS, which builds the macOS plugin and runs
# its simulated radio (ZINC_BLE_SIM=1); a radio that is off makes scan() throw the reason. Then examples/esp32-ble/mac talks to "Zinc sim".
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
d=tests/data/ble
export ZINC_BLE_ASK=0 ZINC_HEADLESS=1   # belt and braces: no permission question even if the simulated radio were not picked
ZINC_NATIVE=sim timeout 60 "$ZINC" run $d/echo.ts 2>/dev/null | diff - $d/echo.out >"$tmp/d" || { echo "ble: echo.ts on the stand-in: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
if [ "$(uname -s)" = Darwin ]; then
  ZINC_BLE_SIM=1 timeout 120 "$ZINC" run $d/echo.ts --engine quickjs 2>"$tmp/q.err" | diff - $d/echo.out >"$tmp/d" || { echo "ble: echo.ts on QuickJS: $(head -4 "$tmp/d" | cut -c1-300) $(grep -m2 error "$tmp/q.err" | cut -c1-300)"; fail=1; }
fi
ZINC_NATIVE=sim ZINC_BLE_SIM_STATE=off timeout 60 "$ZINC" run $d/echo.ts >/dev/null 2>"$tmp/off.err"
grep -q "ble: scan: Bluetooth is off: turn it on" "$tmp/off.err" || { echo "ble: an off radio did not make scan() throw its reason: $(tail -2 "$tmp/off.err" | cut -c1-300)"; fail=1; }
out=$(ZINC_DETERMINISTIC=1 ZINC_NATIVE=sim ZINC_FRAMES=40 timeout 60 "$ZINC" run examples/esp32-ble/mac 2>&1)
echo "$out" | grep -q "^esp32-ble: connected to Zinc sim$" && echo "$out" | grep -q "^esp32-ble: received 'hello from the Mac'$" ||
  { echo "ble: examples/esp32-ble/mac did not talk to Zinc sim: $(echo "$out" | grep -v '^  ' | head -3 | cut -c1-300)"; fail=1; }
exit $fail
