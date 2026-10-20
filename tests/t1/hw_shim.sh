#!/bin/sh
# Bus shim (ZN-126): the display drivers talk to runtime/include/hw.h; against chip models (IS31FL3730, SSD1306, the WS2812 SPI stream) the bytes on the wire give the frame the driver
# reports, and the Linux back end (i2c-dev, spidev) compiles for x86_64 and aarch64 with the pinned zig when it is there.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for t in scrollphat:SCROLLPHAT ssd1306:SSD1306 ws2812:WS2812; do
  n=${t%%:*}; m=${t##*:}
  c++ -std=c++17 -w -D${m}_STUB -DZN_HW_SIM -I../runtime/include ../plugins/display-$n/test_hw.cpp -o "$tmp/$n" 2>"$tmp/err" || { echo "$n: sim build fails: $(head -c 300 "$tmp/err")"; fail=1; continue; }
  "$tmp/$n" 2>&1 | grep -q "$n hw ok" || { echo "$n: model check fails"; fail=1; }
done
zig=$(ls -d build/tc-home/toolchains/zig-*/zig 2>/dev/null | head -1)
if [ -n "$zig" ]; then
  for target in x86_64-linux-gnu aarch64-linux-gnu; do
    for t in scrollphat:SCROLLPHAT ssd1306:SSD1306 ws2812:WS2812; do
      n=${t%%:*}; m=${t##*:}
      "$zig" c++ -target $target -std=c++17 -w -c -I../runtime/include -D${m}_STUB ../plugins/display-$n/test_hw.cpp -o "$tmp/$n.o" 2>"$tmp/err" || { echo "$n: linux back end ($target) does not build: $(head -c 300 "$tmp/err")"; fail=1; }
    done
  done
fi
[ $fail -eq 0 ] && echo "hw shim: ok"
exit $fail
