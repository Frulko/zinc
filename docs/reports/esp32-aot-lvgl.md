# zinc:lvgl on the ESP32 without mquickjs (AOT): what it takes

Research only, 2026-10-22. Nothing was built and no serial port was touched. Board: ESP32-2432S022 (WROOM-32, no PSRAM, 4 MB flash,
240x320 ST7789 on an 8-bit i80 bus, CST820 touch), `boards/esp32-2432s022.json`, `docs/boards.md`.

Short answer: there is no AOT firmware for the ESP32 today. It is a plan (`docs/reports/zinc-next-esp32-aot.md`, 7 phases), not code.
A first usable path needs about 4 phases of that plan plus a small LVGL glue; the program tables and the heap are the real risks.

## 1. How the ESP32 build works today

- `zinc build --target esp32` fails: `findTarget("esp32")` returns "unknown target" (`src/tc/tc.cpp:745,780`; measured in
  `zinc-next-esp32-aot.md` section 1). zig has no Xtensa backend, so the zig cross path cannot be reused.
- Three ESP32 paths exist, none of them AOT:
  - **Core firmware, interpreter** (`firmware/esp32/main/main.cpp`, `CMakeLists.txt:1-4`): ZBC bytecode over the UART or from flash at
    0x300000. `zinc run x --target esp32 [--qemu|--port]` (`src/main.cpp:2410-2450`) and `zinc export --target esp32`
    (`src/cli_core.cpp:908-933`) use it. Module limit 48 KB (`cli_core.cpp:920`, `main.cpp` `maxModule`). It links no plugins
    (only `src/rt`, `src/vm`, `src/zbc`, `src/dev`), so `zinc:lvgl` cannot run there. Prebuilt image: `firmware/esp32/prebuilt/`.
  - **mquickjs firmware** (`firmware/esp32-mquickjs`, `src/cli_mqjs.cpp`, `main.cpp:1706`): an IDF project built with ESP-IDF 5.5.5
    in `~/.zinc/esp-idf`, one build dir per module set in `~/.zinc/esp32/firmware/<key>`. This is the only path that links
    `native/<x>.abi.c` (`docs/plugins/native-esp32.md`, "What zinc does with it"; plugin `targets.esp32` keys: `sources`, `defines`, `idf`,
    `idfComponents`, `sdkconfig`).
  - **esp32sim / QEMU** runners (`src/tc/tc.cpp:97-103,519-559,688-739`), for the two above.
- `src/aot/aot.cpp` emits C++ over the interpreter's register window (`aot.h:1-5`). No `ESP_PLATFORM` or esp32 code in `src/aot`.
  `src/rt` is partly ready: `alloc.cpp:5`, `machine.cpp:4,214,237` guard mimalloc and mmap for `ESP_PLATFORM`.
- Tests: no test builds or runs an AOT ESP32 program. ESP32 tests are `tests/t1/export_esp32.sh`, `tests/t2/esp32_qemu.sh`,
  `tests/t2/atelier_esp32.sh` (all core/interpreter), and `tests/t1/lvgl.sh` (host only).
- Plugin build (`src/tc/plugin_build.cpp`): the implementation is `native/<x>.<target>.cpp`, then `.host.cpp`, then `.abi.c(pp)`
  (`:386-389`, `:806`); an `.abi.c` needs the generated C export header (`:391`) and is compiled as C99 (`:608`). That code builds a
  host shared library with `c++`; it has no IDF branch. `targets.esp32.sources` of `plugins/lvgl/plugin.json:542` is read only by the
  mquickjs firmware generator. `plugins/lvgl` has an esp32 source list already, so the file list is reusable.
- The AOT plan's phase 1 (`zinc-next-esp32-aot.md` section 4) writes an IDF project `<out>.idf/` with generated units, the runtime list of
  `firmware/esp32/main/CMakeLists.txt`, and `app_main` calling the program's `main`. Not started. Toolchain: IDF 5.5.5 from
  `tools/build-esp32-core` (`~/.zinc/esp-idf`, `~/.zinc/esp-tools`).

## 2. Display and touch in the AOT design

- `plugins/display-st7789/st7789.cpp` is the AOT/zinc:gfx driver (`plugin.json:30` `esp32.sources`, `idf`: esp_lcd, spi, gpio, ledc, i2c).
  `open_i80()` `:68`, `init()` `:96`, `send(y, ry0, ry1, x0, x1)` `:157` (sends a damaged box of one band), `present(const HalFrame*)` `:182`
  (rasterized 0x00RRGGBB bands converted to RGB565 in place on i80, `:36`), `open_touch()` `:88`, `poll(HalInput*)` `:242` (CST820 over
  `zn_i2c_read_reg`), `zinc_display_backlight()` `:46`, `zinc_display_touch()` `:239`. It registers as `hal_display` (`:268`).
- It sits behind `runtime/include/hal.h` (`HalDisplay`, `hal_heap_region_more`); the ESP32 HAL itself (`targets/esp32/hal_esp32.cpp`)
  exists only at tag `prototype-final`; `targets/` has no `esp32` directory now.
- This driver takes full `zinc:gfx` frames from the rasterizer. LVGL does not want that: it renders its own partial areas.
- The touch map (affine, NVS) lives in the mquickjs firmware; `docs/boards.md:234` says `setTouchMap` returns false in the AOT firmware.
- The mquickjs firmware has a second, separate panel layer in `firmware/esp32-mquickjs/main/main.c` (918 lines) behind `zn.h`.

## 3. What lvgl.abi.c needs

From the firmware under `ESP_PLATFORM` (`plugins/lvgl/native/lvgl.abi.c:13-18`):
- `void *zn_panel_buffer(size_t)` at start (`:170`), 240x32x2 = 15 KB, twice unless `zn_panel_copies()` says the bus copies each area
  (the 2432S022's i80 driver does: one buffer); must be bus-readable memory.
- `zn_panel_flush(x0, y0, x1, y1, pixels)` (`:44`), RGB565 high byte first (the file swaps with `lv_draw_rgb565_swap`).
  It must block on the previous transfer (`docs/plugins/native-esp32.md`).
- `zn_panel_rotate(quarter)`: MADCTL change, and `zn_panel_copies()` (`zn.h`).
- `esp_system.h`: `esp_get_free_heap_size`, `esp_get_minimum_free_heap_size` (`:280-284`), plain IDF.
- Touch comes in as arguments of `step(dt, x, y, down)` (`:189-207`), from `pointerX/Y/Down` of `zinc:gfx` (`plugins/lvgl/index.ts:10`).
  In mquickjs those come from `zn_touch`/the touch map in `main.c`. In AOT they would come from `HalInput` filled by `st7789.cpp:poll`.
- Host API: `host->set_error`, `host->now_ms` (`ZnHostApi`, `include/zn/native.h`); the AOT host must supply it
  (the native table of `src/rt/native.cpp`, already built by the core firmware).
- `lv_conf.h` uses `LV_STDLIB_CLIB` (malloc) on the board (`:14`), `LV_OS_NONE`, refresh period 1 ms (`:24`). OK on IDF.

TypeScript side:
- `plugins/lvgl/index.ts:10-12,310-318`: `run(each)` calls `onFrame` from `zinc:gfx`, calls `L.step`, then `present()`.
- `display.esp32.ts` (chosen by the `.esp32.ts` suffix rule) does nothing but `keep()` from `zinc:gfx`. In the AOT firmware that
  means the `zinc:gfx` frame loop must still run (as pacing and input), and draw nothing, or the rasterizer would overwrite the panel.
  `display.ts` is the desktop's: RGBA copy via `L.frame()`.

## 4. The gap, as work items

To run `zinc run examples/esp32-widgets --target esp32` without `--engine mquickjs`:

1. **A target "esp32" in the AOT builder** (plan phase 1): generate an IDF project (CMake, component with units, runtime sources,
   `app_main` -> program `main`), sdkconfig from `firmware/esp32/sdkconfig.defaults` plus the board's and plugin `sdkconfig` (LVGL needs a
   28 KB main stack, `docs/plugins/lvgl.md:72`), partition table, build with `idf.py`, flash/run (`esptool`). `zinc run --target esp32` must stop
   meaning "interpreter core upload" when AOT is wanted (flag or default).
2. **Plugin glue for IDF**: compile `lvgl.abi.c` and `targets.esp32.sources` as part of the IDF component (like the mquickjs generator does),
   register `zn_module_Lvgl` in the program's native table, and generate `zinc_native_lvgl_abi.h` from the spec (`zinc native-gen --c`).
   Teach `plugin_build.cpp` or a sibling the IDF branch.
3. **Small ESP32 runtime** (plan phase 2): `hal_esp32.cpp` (heap, time, log, watchdog/`vTaskDelay` per frame), an ESP32 "sys host" replacing
   `sys_host`/libuv/`netlog`/`splash`, and a frame loop that supports `onFrame` and `zinc:gfx` pointer input without rasterizing.
   For LVGL only, a shortcut: skip `zrt/gfx/raster` entirely and expose only the frame loop, timers and pointer. That removes the 33 KB of pools.
4. **Panel functions for AOT**: `zn_panel_buffer/flush/rotate` implemented over `esp_lcd` i80 using the init, MADCTL and 8-bit write code of
   `st7789.cpp`, plus a flush that takes arbitrary rectangles (the driver's `send` is band-oriented). Backlight and CST820 polling feed
   `HalInput`; the touch calibration map would have to be ported from the mquickjs firmware.
5. **Program tables in flash** (plan phase 3): the AOT today unpacks, copies, decodes and verifies tables into the heap at start
   (`src/rt/program.cpp:62-80`) and builds dense vtables (`machine.cpp:259-264`). For the 1,166-class widgets-with-ui demo it is 4-5 MB, so
   it cannot start. The LVGL demo has no `zinc:ui` classes; its tables are far smaller (the `esp32-widgets` demo is a few hundred lines of
   calls on `lv.*`), so phase 3 may be skipped first and measured. Not measured.
6. **Machine limits**: set `kStackSlots` and frames to core-firmware sizes (`machine.cpp:100`; the core uses 3000 slots, 128 frames), and a
   FreeRTOS C-stack bound (`machine.cpp:85-96` returns null off macOS/Linux).
7. **Board preset**: partition table and `appSize` (the board json says `4MB`); a factory partition around 2-3 MB.
8. **Tests**: a QEMU smoke check (hello through the AOT image), an `lvgl` build check, then the board by hand; the panel and the touch cannot
   be proven in QEMU (`zinc-next-esp32-aot.md` risk 5).

Risks:
- **Heap**: no PSRAM, about 280 KB free after IDF. LVGL objects already take most of what mquickjs leaves; the mquickjs path gives LVGL
  about 138 KB total with a 96 KB JS heap, so AOT gives LVGL more room (no 96 KB JS heap), but Zinc objects are 16-byte header + 8-byte
  Slots, and strings and arrays of the demo live on the Zinc heap too. Two allocators (zrt TLSF and IDF malloc) must not be mixed.
- **Flash**: LVGL 9 with the file list of `plugin.json` plus fonts is the largest piece (the mquickjs image already fits); generated C++
  is about 1.6 KB per function on x86 (measured proxy, not Xtensa); the 1 MB app partition of the core layout is too small, use a custom table.
- **Build time**: LVGL's C is built once; the generated C++ of the program is the cost. No Xtensa timing exists; IDF ccache helps.
- **State**: the AOT ESP32 path has never built. `RESUME.md` and `backlog/later.md` mention only the mquickjs path for the ESP32
  (`later.md:417-420` and following); the plan's tasks (ZN-136, 145, 164, 055, 194) are not done. Expect surprises in `src/rt` on Xtensa
  (the 64-bit Slot, soft-float f64: the `esp32` profile makes `number` f32).
- **Speed**: AOT has no 31-bit boxing or GC pauses, so numeric code is faster than mquickjs; LVGL's C is the same in both.

## 5. DeviceScript

DeviceScript (Microsoft) compiles a TypeScript subset to a compact bytecode that runs on its own small VM on microcontrollers, with
services over the Jacdac bus, a VS Code workflow and a simulator; programs are tens of KB and the VM is a few tens of KB, but the code
is interpreted and its native library is fixed by the firmware (no arbitrary C library like LVGL without writing a driver in C and a
binding). Zinc AOT turns the same kind of typed TypeScript into C++, so it is native speed and can link any C library through the native ABI,
but it costs a full toolchain build (IDF, minutes) and flash for code and tables. Zinc plus mquickjs ships plain JavaScript bytecode to an
existing firmware in seconds with no rebuild, which is the best loop for iteration, at the price of a 96 KB heap, boxed floats and GC pauses.
For LVGL, which does the heavy drawing in C, DeviceScript and mquickjs both only drive it; AOT helps most when the UI logic itself is heavy.
