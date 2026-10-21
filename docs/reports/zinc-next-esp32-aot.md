# Zinc Next: the widgets demo on the ESP32 by AOT

Goal (owner, 2026-10-21): run `examples/boards/esp32-2432s022` unchanged on the ESP32-2432S022C board with the Next engine, through
`zinc build --target esp32`. The board has an ESP32-WROOM-32 (no PSRAM, 4 MB flash), an ST7789 240x320 panel on an 8-bit i80 bus and a
CST820 touch controller on I2C. The demo is about 1,030 lines and uses `zinc:ui/solid` JSX, `zinc:ui/kit`, canvas drawing and `zinc:device`.
The first generation (tag `prototype-final`) ran it this way. This report covers what Next has, what it lacks, the measured gap and a plan of
one-session phases. The `--engine mquickjs` path is separate work and is not covered here. Nothing was built for the ESP32 and the board
was not touched.

Numbers marked *measured* come from the develop build of `zinc` (main tree, 2026-10-21) run on this tree's demo. Numbers marked *estimate* do
not.

## 1. How the AOT works today

- **Emitter.** `src/aot/aot.cpp` turns each function of a verified ZBC module into a C++ function over the interpreter's register window
  (`aot.h:1-5`). The C++ shares the `Machine`, the heap and the runtime calls of `src/rt`. Typed numeric functions take C parameters
  (ZN-144). Each object class with fields gets a struct `Z_C<n>`, a 16-byte header plus one 8-byte `Slot` per field (`aot.cpp:416-422`).
- **Tables at start-up.** The module is embedded with its code stripped, then run-length packed (`aot.cpp:409-413`, `kModule` at `:453`).
  `main` calls `runProgramPacked` (`:483`), which does the following on every launch (`src/rt/program.cpp:62-80`):
  1. unpacks the tables into a `std::vector`;
  2. copies that vector again;
  3. decodes it into `zbc::Module`;
  4. verifies it;
  5. builds `Machine` tables, including one dense vtable per concrete class sized to all selectors (`src/rt/machine.cpp:259-264`).
- **Host build (`zinc build <file> -o out`, `src/main.cpp:762-884`).** It compiles the units with the system `c++ -O2` (several units of 48
  functions for large programs). It links `libzn_rt`, mimalloc, zbc, ir, frontend, native and regexp. Programs that draw also get
  `libzn_host_gfx`: zrt, raster and gfx of `runtime/`, the HAL, libuv, llhttp, mbedTLS and codecs (`:880-884`). Yoga is linked only for
  the `rn` layout, HarfBuzz only for `"text": "shaped"` (`:792-801`).
- **Cross build (`zinc build --target <t> <file> -o out`, `src/main.cpp:2549-2628`).** It uses the pinned zig, and the targets come from
  `src/tc/tc.cpp:163-189` (Linux, macOS, Windows). A console program gets `crossBuild` (`tc.cpp:633-665`), which compiles ten runtime
  sources per target into `~/.zinc/cache/<t>`. A program that draws gets `ensureCrossLibs` (`tc.cpp:668-704`), which configures a whole
  CMake tree with zig wrappers and is **Linux only** (`:672`).
- **No ESP32 target.** `findTarget("esp32")` fails, so today `zinc build --target esp32 ...` prints `unknown target 'esp32'` (*measured*).
  zig has no Xtensa backend, so the ESP32 path cannot reuse zig. It needs ESP-IDF's GCC: `~/.zinc/esp-tools/tools/xtensa-esp-elf/esp-14.2.0_20260121`,
  with IDF v5.5.5 in `~/.zinc/esp-idf`, both installed by `tools/build-esp32-core`.
- **What exists for the ESP32.** There is the interpreter core firmware (`firmware/esp32`, `docs/reports/zinc-next-esp32.md`).
  `firmware/esp32/main/CMakeLists.txt` already compiles `src/rt/{alloc,machine,rtcalls,program,native,unicode}.cpp`, `src/zbc/zbc.cpp` and
  `libunicode.c` as an IDF component. It uses `ZN_NO_MIMALLOC` and `CONFIG_COMPILER_CXX_EXCEPTIONS=n`. That is the base of an AOT component:
  the same list plus the generated units, without `src/vm` and `src/dev`.

### What an ESP32 AOT build needs

| Part | Sources | State for ESP32 |
|---|---|---|
| program | generated units (`emitCppParts`, about 20 units for the demo) | compile as-is; tables must move to flash (section 3) |
| runtime | `src/rt` (6 files), `src/zbc/zbc.cpp`, `libunicode.c` | already built by the core firmware |
| graphics | `runtime/zrt.cpp gfx.cpp raster.cpp host.cpp`, `src/host/gfx_host.cpp resources.cpp` | written to compile with `ESP_PLATFORM` (`raster.cpp:23,449,581`); `ttf.cpp` off, as in the prototype |
| zinc:sys | `src/host/sys_host.cpp` (POSIX: process, dlfcn, sockets), `loop.cpp` (libuv), `netlog.cpp`, `splash.cpp` | **not portable**: needs a small esp32 sys host (env, platform, args, time, write), the ESP32 part of ZN-164 |
| layout | `lib/std/ui.ts` "classic" flexbox, compiled into the program | nothing native: `targets/capabilities.json` esp32 has `ui.layout: classic`, no Yoga |
| text | baked bitmap fonts of `src/res` (ZN-048, the prototype's baker ported bit for bit) | no HarfBuzz; but `installResources` copies every glyph table and bitmap into the heap (`src/host/resources.cpp:62-71`) |
| HAL | `runtime/include/hal.h` (`HalDisplay` `:214`, `hal_heap_region_more` `:161`) | same interface as the prototype; `targets/esp32/hal_esp32.cpp` exists only at the tag |
| panel, touch | `plugins/display-st7789/st7789.cpp` (carried over), `plugin.json` `idf` list | ready; uses the `esp_lcd_io_i80.h` API that IDF 5.5.5 has (`bus_width`, `dma_burst_size`) |
| zinc:device | `plugins/device/native/device.esp32.cpp` + the generated thunk (`src/tc/plugin_build.cpp:597`) | thunk generation must write into the IDF component instead of calling `c++` |

C++ features:

- **Exceptions.** None. Zinc exceptions are status returns (`st == 1`, `m.thrown`), and src/rt already builds with exceptions off.
- **RTTI.** None: no `dynamic_cast` or `typeid` in src/rt, the hosts or `runtime/`.
- **Threads.** `std::mutex` in `src/rt/native.cpp:59`, which works through IDF pthreads. The `std::thread` band pool of `render_bands.h`
  is not used by the panel drivers.
- **mimalloc.** Off (`alloc.cpp:5`).
- **mmap.** Guarded (`machine.cpp:4,237`).
- **64-bit assumptions.**
  - `Slot = uint64_t` everywhere (`include/zn/value.h:7`), and references are stored in Slots.
  - `Obj` is `alignas(Slot)`, so its header is 16 bytes on 32 bits too (`src/rt/rt.h:104-110`).
  - The AOT asserts that object layout equals header plus n Slots (`aot.cpp:422`).
  - f64 is soft-float on the LX6. The `esp32` profile makes `number` f32 (`src/frontend/profile.cpp:15`), so program numbers do not use f64.
- **ZN-145 (parked).** It makes references and typed locals 4 bytes on 32-bit targets. It was parked only because its criteria run armhf
  under qemu-user, which is Linux only. Its field half can be proven on the Mac instead: a host build with the compact layout switched on
  runs the corpus, and Espressif's QEMU runs on macOS (phase 4).

### Machine defaults that break on the ESP32

- **Register stack.** `kStackSlots` is 10,000 frames x 256 registers, about 20 MB (`machine.cpp:100`). The frames array is 10,000 entries
  (`:285-286`). The core firmware sets 3,000 slots and 128 frames; an AOT build must set the same kind of values.
- **C stack check.** `cStackLimit` returns null when the OS is neither macOS nor Linux (`machine.cpp:85-96`), so `stackLow` never fires on
  the ESP32. It needs a FreeRTOS bound: the task stack start plus a 2 KB margin, not 256 KB. The demo needs at most 62 registers per function
  (median 6, *measured*), so a 24-32 KB main task stack is enough for its recursion.

## 2. What zinc:ui needs on the device, and how the prototype fitted

| Need | Prototype (tag, read by a sub-agent) | Next |
|---|---|---|
| layout | classic flexbox in `lib/std/ui.ts` (Zinc) | same code, classic on esp32 (Yoga refused: "about 60 KB of code and a record per node") |
| reactivity | `lib/std/solid.ts` | same |
| objects | typed C++ objects: `float` / `int32_t` / `bool` fields, 12-byte header with a C++ vptr (`runtime/zrt.h:63-82`), about 0.5 KiB per UiNode | 16-byte header + 8 bytes per field: **1,376 B per UiNode** (170 fields: 97 i32/bool, 38 refs, 35 f32; *measured*) |
| class tables | C++ vtables and constants in flash | decoded into RAM at start (section 3) |
| fonts, icons | `static const` arrays in flash (`compiler/src/resources.ts:385-388`), 744 KB "mostly baked fonts"; no runtime TTF on esp32 (`cli.ts:372,389`) | same baker, embedded `static const`, then **copied into the heap** |
| raster | `runtime/raster.cpp`, 32-bit 0x00RRGGBB, single thread, scratch by `hal_alloc` | the same file |
| band output | `st7789.cpp`: 6-line band `W*L*4` = 5.8 KB, RGB565 converted in place on i80 (the bus copies it into its DMA buffer), only the damaged box of each band sent | the same file (`st7789.cpp:33-36,100-104,156-236`) |
| draw pools | static, per board: 136 commands (48 B each), 2048 points, 2 KB text, two buffers, about 33 KB of .bss | `zn_host_gfx` is built with `ZRT_GROW_DRAW_CMDS` and desktop pools (`CMakeLists.txt:305`); the esp32 build must take the board's `pools` |
| heap | TLSF over two internal RAM blocks, keeping 24 KiB for IDF (`targets/esp32/hal_esp32.cpp:31-71`): "heap 161 KiB in 2 block(s)" | src/rt objects on `malloc`, zrt on its own TLSF region: two heaps |
| watchdog, clock | `esp_task_wdt_reset` + `vTaskDelay(1)` per frame, `FREERTOS_HZ=1000`, 240 MHz, `-O2` (board `sdkconfig`) | to port with the HAL |
| build | `espBuild` (`compiler/src/cli.ts:618-685`): IDF project generated in `<build>/idf`, REQUIRES from plugin `idf` lists, `ZP_*` defines, `WHOLE_ARCHIVE`, sdkconfig and partitions from the board, docker `espressif/idf:v6.0` | none |

ZN-194 (compact scene plus RGB565 native raster) is not needed to run the demo: the prototype ran with the 32-bit raster and in-place
RGB565. It would save about 15-20 KB of pools and band, so it stays an optimisation (phase 7).

## 3. Size and memory: the measured gap

### Program tables (*measured*, `zinc --profile esp32 --emit=cpp`, ZINC_DEVICE_TARGET=esp32)

| Program | Functions | Classes | Packed tables | Unpacked tables | of which vtables |
|---|---:|---:|---:|---:|---:|
| zinc:gfx hello | 16 | 45 | - | 12 KB | 6 KB |
| zinc:ui hello (one View, one Text) | 334 | 187 | - | 116 KB | 76 KB |
| widgets demo | 955 | 1,166 | 138 KB | **1,776 KB** | **1,634 KB** (408,457 words) |

The demo's dense vtables hold 408,457 words, but only 1,512 class-selector pairs are real. On the device, today's start-up path would need:

- the unpacked bytes twice;
- the decoded `Module`;
- 620 concrete classes x 413 selectors x 4 B, about 1.0 MB of `ClassRT` vtables;
- 1,889 string constants as heap `StrObj` (31 KB of text);
- 955 `Func` records (about 23 KB).

That is roughly 4-5 MB on a chip with about 280 KB free. A UI program cannot start until these tables are `const` data in flash.

### Objects (*measured*, `zinc mem --profile esp32`, interpreter on the Mac)

The object layout is the same as on the ESP32: a 16-byte header and 8-byte Slots.

| Page (frames) | Peak live objects | Bytes of objects at peak | UiNodes live |
|---|---:|---:|---:|
| Home (90) | 1,332 | 184 KB | 92 |
| Controls (`ZINC_DEMO=1`, 120) | 1,876 | 326 KB | 180 |
| System (`ZINC_DEMO=4`, 120) | 1,802 | 304 KB | 168 |

Array storage comes on top of these figures. The prototype peaked at 123-127 KiB over the whole tour. With 4-byte refs, i32 and f32 fields
and 1-byte booleans, a UiNode drops to about 600 B (*estimate*), which roughly halves the UI heap. The Controls page would still be at
about 150-170 KB, so moving more cold fields of `UiNode` to the existing shared records (scroll, edit and min/max fields) may also be needed.

### RAM budget for the demo (target)

| Item | Next today | Target |
|---|---|---|
| module tables, vtables, strings, `Func` | about 4-5 MB (above) | 0 (flash) |
| register stack, frames | 20 MB, 10,000 frames | 16 KB, 128 frames |
| globals | 919 x 8 B = 7 KB | 7 KB |
| draw pools (.bss) | desktop sizes | about 33 KB (board `pools`) |
| band | - | 5.8 KB |
| fonts, icons | copied into heap | 0 (flash) |
| UI objects, peak | 184-326 KB | 130 KB or less |
| main task stack | 16 KB (core) | 24-32 KB |

The prototype had 93.5 KB of static DRAM and a 161 KiB Zinc heap, with 31 KiB left to IDF. Next must land in the same envelope.

### Code and flash

There are no ESP32 numbers yet. The load average was 10 to 12 during this research, so no Xtensa compile was run. The proxy is x86-64
`-O2` object text from the main build tree:

| Part | x86-64 text |
|---|---:|
| src/rt | 148 KB |
| native.cpp | 35 KB |
| zbc.cpp (decode + verify; mostly unneeded with flash tables) | 115 KB |
| libunicode | 63 KB |
| zrt + gfx + raster | 195 KB |
| gfx_host + resources + splash | 26 KB |

Not linked on the ESP32: sys_host 125 KB, Yoga 93 KB, mimalloc 87 KB and vm 91 KB. Generated code averages about 1.6 KB of x86-64 text
per function (median of 41 cached 48-function units in `~/.zinc/cache/aot-obj`), so the demo's 955 functions are about 1.5 MB on x86-64.

Image estimate: generated code 0.8-1.2 MB + runtime 0.35-0.45 MB + IDF about 0.2 MB + fonts about 0.7 MB + tables about 0.15 MB, so
**2.2-2.7 MB**. That is more than the board's `appSize: "2M"` (the prototype image was 1.2-1.65 MB, code 416 KB), so the partition should
be one 3 MB factory app with no OTA. Measuring command once the target exists: `xtensa-esp-elf-size -A build/esp32/idf/build/*.elf`.

### Main risks

1. **Heap.** Even with compact fields the Controls page is near 160 KiB. Fixing it needs shared-core work in `lib/std/ui.ts` and solid
   effects (`backlog/later.md:215`).
2. **Tables to flash.** This changes how every AOT program starts (src/aot, src/rt). Host goldens and `tools/diff-matrix` must stay
   identical.
3. **Code size and speed.** Next's register-window C++ is several times the prototype's code. Flash-cache misses (32 KB cache) may cost
   frame time. Choosing `-O2` or `-Os` must be measured.
4. **Two allocators.** IDF `malloc` and zrt's TLSF would split about 190 KB and fragment it.
5. **No display under QEMU.** Pixels, MADCTL/BGR, inversion and touch orientation are proven only on the board. The board is shared with
   the mquickjs session.
6. **Build time.** 6.7 MB of generated C++ (180,899 lines) compiled by GCC 14 for Xtensa. Use the multi-unit split (`emitCppParts`) and
   IDF's ccache (`IDF_CCACHE_ENABLE=1`).

## 4. Phases (one session each)

Every phase builds with the local IDF 5.5.5 through `idf.py` (`IDF_PATH=~/.zinc/esp-idf`, `IDF_TOOLS_PATH=~/.zinc/esp-tools`). Builds
run in the background. QEMU is the pinned Espressif build, with the command line of `tc.cpp:629` pointed at the app image. The board is used
only when the other session has released the port.

`zinc device-sim --board esp32-2432s022` is the upload-protocol interpreter core: it reports the board's module list but draws nothing
(`src/main.cpp:2376-2403`). For pixels, the oracle is `zinc run --profile esp32` on the Mac.

| # | Build | Proof |
|---|---|---|
| 1 | **`zinc build --target esp32` for console programs.** An esp32 branch beside the zig path writes `<out>.idf/`: CMakeLists, a component with the units + the firmware's runtime list, `app_main` calling `main` (`-Dmain=zinc_program_main`, as the prototype did), sdkconfig from `firmware/esp32` + the board's `sdkconfig`, a partition table from `appSize`. Then `idf.py build` and `merge_bin`. Machine config for the ESP32: stack slots, frames, FreeRTOS stack limit. `zinc flash <dir> --target esp32` writes the image. | QEMU: hello, the `library` golden and an uncaught exception, like `tests/t2/esp32_qemu.sh`, in a new `tests/t2/esp32_aot_qemu.sh`. Image size and free heap at `main` recorded here. |
| 2 | **Hello on the panel (zinc:gfx).** Port `targets/esp32/hal_esp32.cpp` from the tag: heap regions, panic backtrace, watchdog and `vTaskDelay` per frame, time, log. Add `runtime/` zrt, gfx, raster and host, plus `gfx_host.cpp`. Write an esp32 sys host to replace `sys_host`, `loop`, `netlog` and `splash`. Make `installResources` point into the flash blob. Take the pools from the board's `pools`. Build `st7789.cpp` with its `ZP_*` defines, the REQUIRES from `plugin.json` and `WHOLE_ARCHIVE`. | QEMU with `display.debug: 3`: boots, frames run, heap and damage lines printed. Board: "Hello ESP32" on the panel, a dot under the finger, the MADCTL and touch orientation confirmed. Rows in `zinc-next-hardware.md` (ZN-055). |
| 3 | **Program tables in flash.** The AOT emits `ClassRT`, `Func`, selectors, sparse vtables (sorted `(selector, function)` pairs per class, 1,512 for the demo) and string constants as immortal `StrObj` in `const` data. A static load path in src/rt skips unpack, copy, decode and verify. | Host: corpus AOT against the interpreter and frozen outputs unchanged (`tools/diff-matrix`, full T1 in the background), start-up time measured. QEMU: the zinc:ui hello boots, and free heap at `main` shows the tables cost about 0. |
| 4 | **Compact object fields on 32 bits (the field half of ZN-145).** A per-class field table (offset, kind) emitted by the AOT and read by the runtime paths that walk fields (release by `fieldRef`, generic field rows, Dyn/JSON, inspector). `Z_C` structs typed `int32_t`, `float`, `uint8_t`, `Obj*`. Behind a switch, on for esp32, off by default on hosts. | Host build with the switch on: the corpus equal, so this is proven on the Mac without qemu-user. QEMU: UiNode bytes (target about 600) and the demo pages' peak heap, from a heap walk printed on the UART. |
| 5 | **zinc:ui and touch.** A two-page kit app (button, slider, switch, text) with the zinc:device thunk generated into the component. If the numbers of phase 4 call for it, slim `UiNode` (cold fields to shared records, a shared-core change with its own tests). | QEMU: auto tour of the two pages, heap stable over repeated visits. Board: a slider dragged by touch. |
| 6 | **The widgets demo.** The demo unchanged. The board preset gets a 3 MB app partition. | QEMU: the five-page tour runs three times with the heap below budget and stable, and damage figures like the prototype README's. Board: every page, the keypad check (`ZINC_DEMO=pin` equivalent by touch), fps and heap from the serial figures, recorded in `zinc-next-hardware.md`. |
| 7 | **Speed and size (if needed).** `-O2` against `-Os` per part, IRAM for the raster's inner loops, ZN-194's RGB565 raster if RAM or fps fall short, the ESP32 size gate of ZN-164. | Board fps per page against the prototype README's estimates. |

### Open decisions and recommendations

| Decision | Recommendation | Why |
|---|---|---|
| toolchain | local ESP-IDF 5.5.5 of `tools/build-esp32-core`, not docker IDF 6.0 | already pinned and installed, no Docker, and the i80 API that `st7789.cpp` uses is present (`esp_lcd_io_i80.h:30-34`) |
| where the IDF project lives | generated beside the output, engine sources by absolute path (as `firmware/esp32/main/CMakeLists.txt` does), ccache on | the smallest step; a prebuilt runtime component can come later if the build time hurts |
| program tables | `const` data in flash, sparse vtables | zero RAM and faster start-up on every target; a RAM decoder of sparse tables would still cost about 100 KB |
| field layout | compact fields only; registers stay 8-byte Slots | the RAM is in objects; registers live on the C stack (62 at most per function) |
| heap | one heap: zrt on `hal_alloc` (IDF `malloc`), budget from the profile, figures from `heap_caps` | no guessed split of about 190 KB between two allocators |
| program entry | plain `main` renamed and called from `app_main`, `hal_run` loops | as the prototype did; the `ZN_APP_LIBRARY` shell path (`aot.cpp:480-482`) is meant for app shells that drive the loop |
| new tasks | phases map to ZN-136 (AC2: the 2432s022 image), ZN-145 (fields), ZN-164 (ESP32 split), ZN-055 (board rows), ZN-194 (phase 7); new task files carry `New-task: owner ESP32 widgets demo by AOT (2026-10-21)` | the backlog is frozen; the owner asked for this work |
