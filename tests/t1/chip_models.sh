#!/bin/sh
# Chip models, waves 1 to 3 (ZN-127, ZN-128, ZN-297; wave 3: mpu6050, sdcard, dht22, servo, encoder, buzzer, sevenseg, hcsr04): src/sim/chips/{ssd1306,ws2812,qmi8658,st7789,cst820,is31fl3730}.h decode what the real drivers send through hw.h. The frame equals the golden bitmap (tests/golden/sim), and a
# wrong init byte (charge pump, addressing mode, segment remap, COM scan) is an error or a different picture.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cc() { c++ -std=c++17 -w -DZN_HW_SIM -DSSD1306_STUB -DWS2812_STUB -DSCROLLPHAT_STUB -Isrc/sim/chips -Isrc -Itests/native -Itests/native/stubs -I../runtime/include -I../plugins/display-ssd1306 -I../plugins/display-ws2812 -I../plugins/display-st7789 -I../plugins/display-scrollphat -I../plugins/display-fbdev "$@"; }
cc tests/native/chip_ssd1306.cpp -o "$tmp/ssd" 2>"$tmp/e1" || { echo "ssd1306 test does not build: $(head -c 400 "$tmp/e1")"; fail=1; }
cc tests/native/chip_ws2812.cpp -o "$tmp/ws" 2>"$tmp/e2" || { echo "ws2812 test does not build: $(head -c 400 "$tmp/e2")"; fail=1; }
cc tests/native/chip_st7789.cpp -o "$tmp/st" 2>"$tmp/e4" || { echo "st7789 test does not build: $(head -c 600 "$tmp/e4")"; fail=1; }
cc tests/native/chip_scrollphat.cpp -o "$tmp/sp" 2>"$tmp/e5" || { echo "scrollphat test does not build: $(head -c 600 "$tmp/e5")"; fail=1; }
cc tests/native/chip_fbdev.cpp -o "$tmp/fb" -I../plugins/display-fbdev 2>"$tmp/e6" || { echo "fbdev test does not build: $(head -c 600 "$tmp/e6")"; fail=1; }
cc tests/native/chip_qmi8658.cpp -o "$tmp/qmi" 2>"$tmp/e3" || { echo "qmi8658 test does not build: $(head -c 400 "$tmp/e3")"; fail=1; }
cc tests/native/chip_wave3.cpp -o "$tmp/w3" 2>"$tmp/e7" || { echo "wave 3 test does not build: $(head -c 600 "$tmp/e7")"; fail=1; }
[ -x "$tmp/w3" ] && { "$tmp/w3" tests/golden/sim 2>&1 | grep -q "wave 3 models ok" || { echo "wave 3 models: $("$tmp/w3" tests/golden/sim 2>&1 | head -c 600)"; fail=1; }; }
[ -x "$tmp/ssd" ] && { "$tmp/ssd" tests/golden/sim/ssd1306.pbm 2>&1 | grep -q "ssd1306 model ok" || { echo "ssd1306 model: $("$tmp/ssd" tests/golden/sim/ssd1306.pbm 2>&1 | head -c 600)"; fail=1; }; }
[ -x "$tmp/ws" ] && { "$tmp/ws" tests/golden/sim/ws2812.ppm 2>&1 | grep -q "ws2812 model ok" || { echo "ws2812 model: $("$tmp/ws" tests/golden/sim/ws2812.ppm 2>&1 | head -c 600)"; fail=1; }; }
[ -x "$tmp/st" ] && { "$tmp/st" tests/golden/sim/esp32-2432s022.ppm 2>&1 | grep -q "st7789 model ok" || { echo "st7789 model: $("$tmp/st" tests/golden/sim/esp32-2432s022.ppm 2>&1 | head -c 800)"; fail=1; }; }
[ -x "$tmp/sp" ] && { "$tmp/sp" tests/golden/sim/scrollphat.pbm 2>&1 | grep -q "scrollphat model ok" || { echo "scrollphat model: $("$tmp/sp" tests/golden/sim/scrollphat.pbm 2>&1 | head -c 600)"; fail=1; }; }
[ -x "$tmp/fb" ] && { mkdir -p "$tmp/fbd"; "$tmp/fb" tests/golden/sim/fbdev.ppm "$tmp/fbd" 2>&1 | grep -q "fbdev sim ok" || { echo "fbdev sim: $("$tmp/fb" tests/golden/sim/fbdev.ppm "$tmp/fbd" 2>&1 | head -c 600)"; fail=1; }; }
[ -x "$tmp/qmi" ] && { "$tmp/qmi" 2>&1 | grep -q "qmi8658 model ok" || { echo "qmi8658 model: $("$tmp/qmi" 2>&1 | head -c 600)"; fail=1; }; }
[ $fail -eq 0 ] && echo "chip models: ok"
exit $fail
