#pragma once
// zinc on the mquickjs firmware of the ESP32 (owner, 2026-10-21; firmware/esp32-mquickjs, docs/reports/zinc-next-mquickjs.md): a zinc:gfx
// program in JavaScript on MicroQuickJS instead of the core's Zinc bytecode, prepared on the computer and sent as 32-bit bytecode.
#include <string>
#include <vector>

namespace zn::cli {

// Whether the command line is `zinc run|export|flash ... --engine mquickjs`.
bool mquickjsWanted(const std::vector<std::string>& args);
// zinc run <app> --target esp32 --engine mquickjs [--port P] [--run-ms N] [--frames N]: the program written to the board's js partition, then its
// UART until the program ends, fails or N ms have passed; --emulator: the same in esp32sim, N ms of emulated time (10 s), the last frame as a
// PNG. zinc export <app> --target esp32 --engine mquickjs [-o dir]: dist/<name>-esp32 with the firmware, the program and flash.sh. zinc flash
// --target esp32 --engine mquickjs [--port P]: the firmware. `cacheDir`: zinc run --engine quickjs's transform cache. The exit code.
int mquickjs(const std::vector<std::string>& args, const std::string& root, const std::string& cacheDir);

}  // namespace zn::cli
