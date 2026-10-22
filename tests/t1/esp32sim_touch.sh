#!/bin/sh
# Touch in the ESP32 emulator (src/cli_mqjs.cpp, tools/esp32sim: esp32sim's ESP32-2432S022C stand-in, its CST820 at 0x15 on I2C0): a tap on
# examples/esp32-widgets' navigation bar, on its Input item (x 72, y 298 of 240x320), reaches the firmware's touch poll, LVGL's click turns the
# page, and the program says so on the UART ("widgets: page Input", every 5 s). Twice: from an --emulator-script, and in the live view
# (--live) through esp32sim's board UI socket, headless, the pointer from a ZINC_INPUT script. Skipped without cargo (or ZINC_ESP32SIM),
# zinc-mqjs, or ESP-IDF in ZINC_HOME (zinc:lvgl's C is built into the firmware; never installed here). The first run builds esp32sim and the
# firmware (minutes); then about 20 s.
cd "$(dirname "$0")/../.." || exit 2
[ -x "$(dirname "$ZINC")/zinc-mqjs" ] || { echo "needs zinc-mqjs beside zinc (tools/build zinc-mqjs)"; exit 77; }
[ -n "$ZINC_ESP32SIM" ] || command -v cargo >/dev/null || [ -x "$HOME/.cargo/bin/cargo" ] || { echo "needs cargo to build esp32sim (or ZINC_ESP32SIM)"; exit 77; }
[ -f "${ZINC_HOME:-$HOME/.zinc}/esp-idf/export.sh" ] || { echo "needs ESP-IDF in ZINC_HOME (a zinc:lvgl program on the board installs it)"; exit 77; }
T=$(mktemp -d) && trap 'rm -rf "$T"' EXIT
fail=0
printf '3.0 touch 72 298 1\n3.2 touch 72 298 0\n' > "$T/tap"
ZINC_SHOT="$T/frame.png" "$ZINC" run examples/esp32-widgets --target esp32 --emulator --emulator-script "$T/tap" --run-ms 6000 >"$T/out" 2>"$T/err" ||
  { echo "the emulator run failed"; tail -20 "$T/err"; exit 1; }
grep -q "no touch controller" "$T/err" && { echo "the firmware found no CST820"; fail=1; }
grep -q "^widgets: page Input," "$T/out" || { echo "a scripted tap on Input did not turn the page"; cat "$T/out"; fail=1; }
# the live view: frames come over the socket, the pointer goes back as touches. Polls of about 8 ms in real time: pressed from about 2.4 s
# to 3.6 s (LVGL clicks on the release, wherever the UI was when it was pressed), so the page has turned by the log at 10 s
printf '300 move 72 298\n300 down\n450 up\n' > "$T/input"
ZINC_STEPS=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000 ZINC_INPUT="$T/input" "$ZINC" run examples/esp32-widgets --target esp32 --emulator --live --run-ms 11000 >"$T/out" 2>"$T/err" ||
  { echo "the live run failed"; tail -20 "$T/err"; exit 1; }
grep -q "^widgets: page Input," "$T/out" || { echo "a tap in the live view did not turn the page"; cat "$T/out"; tail -5 "$T/err"; fail=1; }
grep -Eq " [1-9][0-9]* frames shown" "$T/err" || { echo "the live view showed no frame"; tail -5 "$T/err"; fail=1; }
exit $fail
