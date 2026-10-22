#!/bin/sh
# --target esp32 --engine mquickjs (src/cli_mqjs.cpp, firmware/esp32-mquickjs): the board's ROM table builds and names the zinc:gfx host calls
# js/sim.js stands in for on the computer; examples/breakout, unchanged, is checked under mquickjs and exported as the firmware and the 32-bit
# bytecode image; a program using what mquickjs lacks (Map) or a zinc:gfx call the board does not have (line) fails before anything is sent,
# with its own file and line; every examples/esp32-* demo is checked (zinc check), a plugin's native module runs its C in the check, and a
# pull-up asked of an input-only pin (35) is refused with the reason. No board, no ESP-IDF; esbuild and SWC must already be in ZINC_HOME (never downloaded here).
cd "$(dirname "$0")/../.." || exit 2
F=firmware/esp32-mquickjs
command -v cc >/dev/null || { echo "needs cc"; exit 77; }
[ -x "$(dirname "$ZINC")/zinc-mqjs" ] || { echo "needs zinc-mqjs beside zinc (tools/build zinc-mqjs)"; exit 77; }
ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1 && ZINC_OFFLINE=1 "$ZINC" toolchain swc >/dev/null 2>&1 || { echo "needs esbuild and SWC in ZINC_HOME (zinc toolchain esbuild; zinc toolchain swc)"; exit 77; }
T=$(mktemp -d) && trap 'rm -rf "$T"' EXIT
fail=0
cc -w -I third_party/mquickjs -o "$T/stdlib" $F/main/zn_stdlib.c third_party/mquickjs/mquickjs_build.c -lm && "$T/stdlib" -m32 > "$T/table.h" || { echo "zn_stdlib.c does not build the board's table"; fail=1; }
grep -o '"__host_[A-Za-z]*"' $F/main/zn_stdlib.c | tr -d '"' | grep -v '^__host_native' | sort > "$T/board"   # zinc:native's are zinc-mqjs's own
grep -o '^function __host_[A-Za-z]*' $F/js/sim.js | sed 's/^function //' | sort > "$T/sim"
diff "$T/board" "$T/sim" >/dev/null || { echo "main/zn_stdlib.c and js/sim.js name different host calls:"; diff "$T/board" "$T/sim"; fail=1; }

"$ZINC" export examples/breakout --target esp32 --engine mquickjs --frames 120 -o "$T/bo" >"$T/log" 2>&1 || { cat "$T/log"; fail=1; }
[ "$(od -An -tx1 -N10 "$T/bo/app.img" 2>/dev/null | tr -d ' \n' | cut -c1-8,17-20)" = "5a4e4a53fbac" ] || { echo "app.img is not ZNJS + mquickjs bytecode"; fail=1; }
cmp -s "$T/bo/firmware.bin" $F/prebuilt/zinc-mquickjs-flash.bin && [ -x "$T/bo/flash.sh" ] || { echo "the export lacks the firmware or flash.sh"; fail=1; }

mkdir -p "$T/bad" "$T/line"
printf "import { onFrame } from 'zinc:gfx';\nconst m = new Map<string, number>();\nonFrame(() => { m.set('a', 1); });\n" > "$T/bad/main.ts"
"$ZINC" export "$T/bad/main.ts" --target esp32 --engine mquickjs -o "$T/bad/out" >"$T/log" 2>&1 && { echo "a program using Map was accepted"; fail=1; }
grep -q "bad/main.ts:2:" "$T/log" || { echo "the Map failure does not point at main.ts:2"; cat "$T/log"; fail=1; }
printf "import { onFrame, line } from 'zinc:gfx';\nonFrame(() => {\n  line(0, 0, 10, 10, 0xffffff);\n});\n" > "$T/line/main.ts"
"$ZINC" export "$T/line/main.ts" --target esp32 --engine mquickjs -o "$T/line/out" >"$T/log" 2>&1 && { echo "a zinc:gfx call the board lacks was accepted"; fail=1; }
grep -q "zinc:gfx line() is not on the ESP32" "$T/log" && grep -q "line/main.ts:3:" "$T/log" || { echo "the line() failure does not name it at main.ts:3"; cat "$T/log"; fail=1; }
for j in examples/esp32-*/zinc.json examples/esp32-*/*/zinc.json; do   # the board's programs (esp32-ble/mac is the Mac's)
  grep -q '"esp32"' "$j" 2>/dev/null || continue
  d=$(dirname "$j")
  "$ZINC" check "$d" --target esp32 --engine mquickjs --frames 120 >"$T/log" 2>&1 || { echo "$d does not check for mquickjs"; cat "$T/log"; fail=1; }
done
# a plugin's native module (plugins/qrcode, C on the native ABI): the check runs its C, built for this computer (main/zn_native.c in zinc-mqjs)
mkdir -p "$T/qr"
printf "import { encode } from 'zinc:qrcode';\nconst q = encode('HELLO', 0, 1);\nif (q.size !== 21 || !q.module(0, 0) || q.module(7, 0)) throw new Error('qr ' + q.size);\nconsole.log('qr ok');\n" > "$T/qr/main.ts"
"$ZINC" check "$T/qr/main.ts" --target esp32 --engine mquickjs >"$T/log" 2>&1 || { echo "a program on a plugin's native module does not check"; cat "$T/log"; fail=1; }
# zinc:device has device.host.cpp for zinc's engines and device.abi.c for mquickjs: the check builds and runs the ABI file, whose heap
# figures come from zinc-mqjs (zn_js_heap)
mkdir -p "$T/dev"
printf "import * as d from 'zinc:device';\nconst m = d.memory();\nd.setBacklight(0.5);\nconst s = (m.zincUsed > 0 && m.zincSize > m.zincUsed) + ' ' + m.chipFree + ' ' + m.chipMinFree + ' ' + d.hasBacklight() + ' ' + d.backlight() + ' ' + d.hasTouch() + ' ' +\n  d.frameMs() + ' ' + d.drawCmds() + ' ' + d.cpuMhz() + ' ' + d.flashSize() + ' [' + d.idfVersion() + d.firmware() + '] ' + d.chip();\nif (s !== 'true -1 -1 false 0.5 true -1 -1 0 -1 [] mquickjs on the computer') throw new Error('device: ' + s);\n" > "$T/dev/main.ts"
"$ZINC" check "$T/dev/main.ts" --target esp32 --engine mquickjs >"$T/log" 2>&1 && grep -q "checked for" "$T/log" || { echo "a zinc:device program does not run its check under mquickjs"; cat "$T/log"; fail=1; }
# a local name that is also a Web global (screen) is the program's own: zinc:web, which needs what mquickjs lacks, is not linked in
mkdir -p "$T/local"
printf "function f(): number { const screen = 2; return screen; }\nconsole.log('local ' + f());\n" > "$T/local/main.ts"
"$ZINC" check "$T/local/main.ts" --target esp32 --engine mquickjs >"$T/log" 2>&1 || { echo "a local named screen pulled zinc:web in"; cat "$T/log"; fail=1; }
# a program on the radio gets the network firmware; esp32sim has no radio
"$ZINC" export examples/esp32-espnow --target esp32 -o "$T/wifi" >/dev/null 2>&1 && cmp -s "$T/wifi/firmware.bin" $F/prebuilt/zinc-mquickjs-net-flash.bin || { echo "zinc:espnow does not take the network firmware"; fail=1; }
"$ZINC" run examples/esp32-espnow --target esp32 --emulator >"$T/log" 2>&1 && { echo "the emulator accepted a program on the radio"; fail=1; }
grep -q "esp32sim has no radio" "$T/log" || { echo "the emulator's refusal does not say why"; cat "$T/log"; fail=1; }
mkdir -p "$T/pull"
printf "import { setup } from 'zinc:gpio';\nsetup(35, 'in', 'up');\n" > "$T/pull/main.ts"
"$ZINC" export "$T/pull/main.ts" --target esp32 --engine mquickjs -o "$T/pull/out" >"$T/log" 2>&1 && { echo "a pull-up on GPIO 35 was accepted"; fail=1; }
grep -q "pin 35 has no internal pull resistor" "$T/log" || { echo "the pull failure does not say why"; cat "$T/log"; fail=1; }
exit $fail
