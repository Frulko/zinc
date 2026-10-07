#!/bin/sh
# Chip models wave 1 (ZN-127): src/sim/chips/{ssd1306,ws2812,qmi8658}.h decode what the real drivers send through hw.h. The frame equals the golden bitmap (tests/golden/sim), and a
# wrong init byte (charge pump, addressing mode, segment remap, COM scan) is an error or a different picture.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cc() { c++ -std=c++17 -w -DZN_HW_SIM -DSSD1306_STUB -DWS2812_STUB -Isrc/sim/chips -Isrc -Itests/native -Itests/native/stubs -I../runtime/include -I../plugins/display-ssd1306 -I../plugins/display-ws2812 "$@"; }
cc tests/native/chip_ssd1306.cpp -o "$tmp/ssd" 2>"$tmp/e1" || { echo "ssd1306 test does not build: $(head -c 400 "$tmp/e1")"; fail=1; }
cc tests/native/chip_ws2812.cpp -o "$tmp/ws" 2>"$tmp/e2" || { echo "ws2812 test does not build: $(head -c 400 "$tmp/e2")"; fail=1; }
cc tests/native/chip_qmi8658.cpp -o "$tmp/qmi" 2>"$tmp/e3" || { echo "qmi8658 test does not build: $(head -c 400 "$tmp/e3")"; fail=1; }
[ -x "$tmp/ssd" ] && { "$tmp/ssd" tests/golden/sim/ssd1306.pbm 2>&1 | grep -q "ssd1306 model ok" || { echo "ssd1306 model: $("$tmp/ssd" tests/golden/sim/ssd1306.pbm 2>&1 | head -c 600)"; fail=1; }; }
[ -x "$tmp/ws" ] && { "$tmp/ws" tests/golden/sim/ws2812.ppm 2>&1 | grep -q "ws2812 model ok" || { echo "ws2812 model: $("$tmp/ws" tests/golden/sim/ws2812.ppm 2>&1 | head -c 600)"; fail=1; }; }
[ -x "$tmp/qmi" ] && { "$tmp/qmi" 2>&1 | grep -q "qmi8658 model ok" || { echo "qmi8658 model: $("$tmp/qmi" 2>&1 | head -c 600)"; fail=1; }; }
[ $fail -eq 0 ] && echo "chip models: ok"
exit $fail
