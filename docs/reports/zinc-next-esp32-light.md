# Zinc Next: an "esp32 light" mode (smaller modules, less RAM)

Question (owner, 2026-10-22): a limited mode of the engine for the ESP32 that gives lighter builds, taking less space and less memory. Today
the widgets demo (`examples/boards/esp32-2432s022`) compiles to a 2.4 MB ZBC module, while the interpreter core of `firmware/esp32` accepts
48 KB modules and has about 280 KB of heap. This report says what the module is made of, what is reachable, what the loader does with it in
RAM, and which changes make a light profile, with their savings. It also gives the smallest step to draw a `zinc:gfx` program on the board
through the interpreter core. Companion reports: `zinc-next-esp32.md` (the core), `zinc-next-esp32-aot.md` (the AOT plan),
`zinc-next-mquickjs.md` (the mquickjs firmware).

Method. All modules come from the develop build `build/zinc` (2026-10-21 23:59), compiled as `zinc run --target esp32` compiles:
`ZINC_DEVICE_TARGET=esp32 zinc --profile esp32 --emit=zbc-bin <entry> out.zbc`. A small Python reader of the version-7 layout written by
`encode()` (`src/zbc/zbc.cpp:671-718`) split each file by section and walked its code; it was not committed. Nothing was built for the ESP32,
the board and its serial port were not touched, and no compiler change was made.

- *measured*: read from a real module or from a run on the Mac;
- *computed*: the effect of a change worked out on the real module bytes (the pass was simulated by the script, the compiler was not changed);
- *estimate*: a model, for example 32-bit struct sizes times real counts.

## 1. What the 2.4 MB is made of

The ZBC binary has no debug information. Line tables, local variables and field names exist only in memory for `zinc debug`; `encode()`
never writes them (`zbc.h:69-70`, `:96-98`). So "strip debug info" saves nothing today. Only names remain: class, selector and function names.

Sections (*measured*, bytes):

| Program | File | Dense vtables | Code | Strings | Names | Rest | Functions | Classes (concrete) | Selectors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| console hello (`console.log`) | 125 | 4 | 20 | 13 | 15 | 73 | 1 | 1 (0) | 0 |
| zinc:gfx hello (one `rect` per frame) | 17,469 | 6,516 | 5,320 | 1,576 | 1,900 | 2,157 | 16 | 45 (11) | 66 |
| `examples/breakout` (zinc:gfx) | 37,550 | 10,076 | 18,736 | 2,218 | 2,656 | 3,864 | 39 | 54 (16) | 85 |
| zinc:ui hello (solid, a View and a Text) | 425,051 | 76,648 | 301,000 | 13,370 | 10,690 | 23,343 | 334 | 187 (76) | 165 |
| the same plus one kit `Button` | 1,709,002 | 1,189,088 | 400,224 | 27,876 | 31,367 | 60,447 | 605 | 920 (323) | 392 |
| widgets demo | 2,415,900 | 1,638,492 | 615,692 | 31,140 | 40,979 | 89,597 | 955 | 1,166 (620) | 413 |

For the widgets demo the split is: vtables 67.8%, code 25.5%, names 1.7%, strings 1.3%, the rest 3.7%. The rest is handlers 20,166,
constants 19,147, class selector lists 10,712, field types 10,537, supertypes 9,984, function records 8,105, class headers 7,270, selector
signatures 1,813, globals 1,549 and natives 293. For comparison, the AOT's run-length packing (`packRuns`) gives 776,094 bytes and zlib -9
gives 268,930 bytes.

**Vtables.** Every class that is not an interface or abstract writes one u32 per selector of the whole program (`lower.cpp:395,618,815`). In
the widgets demo, 989 classes carry a 413-word vtable, 408,457 words in all:

- 620 concrete classes: 256,060 words, 1,024,240 B;
- 369 classes that the dead-function pass (ZN-431) turned abstract, because nothing constructs them and they lost methods (`opt.cpp:557`):
  152,397 words, **609,588 B**. Nothing reads them: the verifier and `Machine::load` skip abstract classes (`zbc.cpp:119`,
  `machine.cpp:260`).

The concrete vtables hold only 716 real entries. Classes list 1,512 selectors in all (the AOT report's figure), interfaces included. Of the 620
concrete classes, 569 have at most one entry: 711 of the 1,166 classes are closure classes (`lambdaN`) whose only method is `call`. The largest
class has 55 entries.

**Code.** 147,671 instructions (*measured*):

- Retain and Release are 26,144 of them (17.7%), Move 16,549 and LoadStr 9,846.
- The 10 largest functions hold 20% of the code, the 50 largest 46.5%.
- The largest are `main` 22,380 B, `applyToken` 19,952 (the className token parser, `ui.ts:2173`), `paint` 10,700, `editKey` 9,456 and
  `frame` 8,420.

The kit is the step that makes modules big. A single `Button` over the zinc:ui hello adds 271 functions, 733 classes and 227 selectors, and the
file grows from 425 KB to 1.71 MB (*measured*; why the kit builds so many classes was not looked into).

**Breakout** is 37,550 B, under the core's 48 KB limit. Of it, 27% is vtables and 7% names. Compiled with the host profile (no `--profile
esp32`) it is 36,259 B (*measured*): the esp32 profile makes `number` f32, which adds 221 `F32ToF64` conversions before host calls.

## 2. What is reachable from the entry

The lowering compiles every function of every imported module. ZN-431 then drops the functions that no reachable code can call
(`opt.cpp:514-562`). It walks from `main` through direct calls and through the whole vtable of every class that reachable code constructs.
Its effect, with `ZN_KEEP_UNREACHABLE=1` as the baseline (*measured*):

| | widgets: pulled in | widgets: kept | breakout: pulled in | breakout: kept |
|---|---:|---:|---:|---:|
| functions | 2,692 | 955 | 277 | 39 |
| file | 3,029,061 B | 2,415,900 B | 79,504 B | 37,550 B |
| code | 1,145,284 B | 615,692 B | - | 18,736 B |

What it does not remove (*measured* by walking the kept code):

- **Classes.** All 1,166 stay. Only 513 are named by kept code (`New`, `Downcast`, `InstanceOf`, `LoadNull`) or reached from those classes
  through parents, interfaces and field types. This is a lower bound, since signature types were not followed.
- **Selectors.** All 413 stay. Only 107 are called by kept code (`CallVirt`) or looked up by name by the runtime: `call` and `__errorString`
  (`rtcalls.cpp:851,866`, `machine.cpp:357,374`).
- **Methods of constructed classes whose selector nobody calls.** A selector-aware pass (rapid type analysis) drops 279 more functions of the
  955: 74,292 B of code, 83,459 B with their constants and records (*computed*). The largest are web.ts's `BatteryManager.update` 7,920,
  `NetworkInformation.update` 5,856 and `sha2x64` 5,592. Then come `ScreenOrientation.set`, `sha256`, `Navigator.vibrate`,
  `EventTarget.dispatchEvent`, `sha1` and `Document.update`. On breakout the same pass drops 16 of 39 functions (2,418 B).
- **Strings.** The string table is the lowering's and is never pruned. 540 of the 1,889 strings are loaded by no function that the
  selector-aware pass keeps; 421 are loaded by none of today's 955.

**Library against demo** (*estimate*: by function name, since lambdas cannot be attributed). The sources are `ui.ts` 6,912 lines,
`solid.ts` 346 and the kit about 1,530 lines in 22 files, against 1,030 lines of demo.

- Pulled in: 1,909 named library functions (674 KB of code), 711 lambdas (436 KB) and 72 demo functions (24 KB).
- Kept: 543 (383 KB), 384 (209 KB) and 28 (20 KB).

About two thirds of the kept code is library code that the generic event and paint paths reach. Some live code does nothing on this board
(no keyboard, no wheel, no screen reader). It totals 32,336 B: `editKey` 9,456, `paintEdit` 7,368, `paintTouchSelection` 3,240, `a11yWalk`
3,620, `trackpadInput` 2,972, `wheelInput` 2,936 and `systemSignal` 2,744. These functions are reached by direct calls from `ui.ts`'s dispatch
(for example `ui.ts:5635`), so only a profile constant folded by `foldConstGlobals` (`opt.cpp:177`) can remove them.

## 3. What the loader does in RAM

The interpreter core (`src/dev/core.cpp:66-82`) takes these steps:

1. It keeps the received bytes (`body_`, reserved to the full length).
2. It runs the CRC.
3. `zbc::decode` copies every section into `std::vector` and `std::string`. A constant becomes a 16-byte `Const`. The dense vtables are copied
   too. Nothing is reserved, so `push_back` rounds every code, constant and vtable vector up to a power of two (`zbc.cpp:575-606,720-807`).
4. `zbc::verify` runs (it needs temporary state for each function).
5. The core frees `body_`.
6. `Machine::load` (`machine.cpp:220-290`) does the following:
   - it keeps pointers into the decoded vectors, so the `Module` stays alive while the program runs;
   - it allocates the register stack (3,000 slots, 24 KB) and 128 frames;
   - it builds a `ClassRT` per class: a copy of the name, the supertypes and the field flags, and for each concrete class a dense
     `std::vector<const Func*>` sized to all selectors;
   - it turns every string constant into an immortal heap `StrObj` (a 32-byte header plus the text);
   - it allocates the `Func` array.

The AOT start-up path does the same after unpacking and copying the tables twice (`program.cpp:62-80`).

RAM on the ESP32 core (*estimate*: 32-bit libstdc++ with a 24-byte `std::string`, a 12-byte vector and an 8-byte heap header, times the real
counts; the verifier's temporary state is not included):

| | breakout | widgets demo |
|---|---:|---:|
| received bytes, until verify ends | 37,550 | 2,415,900 |
| decoded `Module` | 69,052 | 3,341,384 |
| ... of it code vectors (power-of-two capacity) | 29,772 | 897,672 |
| ... of it dense vtables | 15,080 | 2,033,384 |
| `ClassRT` | 11,400 | 1,166,348 |
| ... of it dense vtables (620 x 413 x 4 for the demo) | 5,568 | 1,029,200 |
| string constants as heap `StrObj` | 8,684 | 111,336 |
| `Func` records | 1,092 | 26,740 |
| registers and frames | 25,536 | 25,536 |
| **peak while decoding** | **~107 KB** | **~5.8 MB** |
| **resident before the first object** | **~116 KB** | **~4.7 MB** |

With exact capacities, the decoded `Module` would be 52,612 B for breakout and 2,659,748 B for the demo.

Host check (*measured*, x86-64): `zinc zbc --check` (decode and verify only) peaks at a footprint of 9.50 MB for the demo against 1.66 MB for
hello. Breakout's difference is below the page granularity of the measurement.

**What could stay in flash.** On the ESP32 the data bus maps flash at 0x3F400000-0x3F7FFFFF (`soc.h:170-171`), through the 64 KB MMU pages of
`esp_partition_mmap`. Reads of any width go through the cache. This report did not measure the cost of a cache miss. The core already stores a
`zinc export` program at 0x300000 (1 MB up to the end of the 4 MB flash, `firmware/esp32/main/main.cpp:27`), but it copies that program into
RAM. The mquickjs firmware already runs its bytecode in place from mapped flash, after relocating it once and writing it back
(`firmware/esp32-mquickjs/main/main.c:443-470`).

| Can be read in place | Must be in RAM |
|---|---|
| code words (u32, aligned) | globals (8 B each), register stack, frames |
| constants, if laid out as the 16-byte `Const` array, 8-aligned | `ClassRT`'s mutable parts (`nameStr`, allocation statistics) |
| handlers (12-byte `Handler` array) | heap objects |
| names, supertype lists, field-kind tables | string objects: a `StrObj` holds its class pointer, which is a RAM address. Make them on first use, or patch that pointer in flash while the core writes the upload |
| the dispatch table (function indices) | the `Func` array, or keep it in flash as offsets |

Immortal objects are never written: Retain and Release ignore them (`opcodes.h:15`). So a string constant could live in flash once its class
pointer is right.

## 4. An "esp32 light" profile

The changes are ordered by saving per effort. They are worked out for the widgets demo, with breakout in brackets. "File" also means flash.
RAM is on the ESP32 core.

| # | Change | File saved | RAM saved | Effort | Risk | Files (shared core?) |
|---|---|---:|---:|---|---|---|
| 1 | A class that ZN-431 makes abstract also drops its vtable (`cl.vtable.clear()` beside `opt.cpp:557`) | 609,588 (4,420) *computed* | ~0.6-0.76 MB (~7 KB) of decoded `Module` *estimate* | XS: 1 line | low: nothing reads abstract vtables, and the format is unchanged, so the prebuilt core accepts it | `src/ir/opt.cpp` (IR: yes) |
| 2 | `decode()` reserves exact sizes (`Reader::u32s`, code, constants) | 0 | ~680 KB (~16 KB) *estimate* | XS: 4 lines | none | `src/zbc/zbc.cpp` (ZBC) |
| 3 | Sparse vtables in the file (ZBC v8): for each class, one function index per listed selector; the decoder rebuilds the dense table | 1,021,376 (5,320) *computed* | 0 alone; with 4, the `Module`'s 1.27 MB of dense vectors | S | low; the version bump needs the prebuilt core rebuilt (`decode` refuses another version) | `src/zbc/zbc.cpp`, `firmware/esp32/prebuilt` (ZBC format) |
| 4 | Sparse dispatch in the runtime: one row-displacement table of `(owner, Func*)` per selector, `CallVirt` looks up `base[cls] + sel` and checks the owner (O(1)) | 0 | 1,029,200 (5,568) of `ClassRT`; with 3, 1.27 MB more; 2 MB on 64-bit hosts | M | medium: `CallVirt` speed (bench), AOT dispatch, the `call` lookups in rtcalls | `src/rt/rt.h`, `machine.cpp`, `rtcalls.cpp`, `src/vm`, `src/aot` (runtime: yes) |
| 5 | Flash-resident module: the core writes the upload into a data partition at 0x300000 and maps it; `Func` points into the mapping | 0 (bytes move from RAM to flash) | after 6: code and constants 562 KB (18 KB) *estimate*; no `body_` copy; the module limit goes from 48 KB to about 1 MB | M-L | medium: flash writes in the core, cache misses on code fetch, a layout aligned for in-place reads | `zbc.h` (a decode that views a buffer), `machine.cpp`, `src/dev/core.cpp`, `firmware/esp32/main`, a partition table (ZBC, runtime: yes) |
| 6 | Selector-aware tree shaking: a method of a constructed class is kept only when some kept code calls its selector; `call` and `__errorString` are roots | 83,459 (2,418) *computed* | the same bytes in RAM, plus 279 `Func` records | S: ~20 lines | medium: every selector a host calls by name must be a root; hot mode's entries | `src/ir/opt.cpp` (IR: yes) |
| 7 | Names behind the switch: names become "" except Error classes, `call`, `__errorString`, `main`, `__appStep`, `__gfxRedraw`; zinc keeps a side table to name traps | 40,979 (2,656) *computed* | ~30 KB (~2 KB) of name copies *estimate* | S | low: messages on the device carry ids until zinc maps them back | `src/zbc/emit.cpp` or an `encode` option, `src/main.cpp`, `src/dev/client.cpp` (ZBC) |
| 8 | String constants made on their first `LoadStr` | 0 | most of 111,336 (8,684) *estimate* | S-M | low: one branch per `LoadStr` | `machine.cpp`, `src/vm`, `src/aot` (runtime: yes) |
| 9 | Prune strings that no kept code loads, renumbering `LoadStr` | 9,461 (1,334) *computed* | ~25 KB (~5 KB) of `StrObj` *estimate* | S | low | `src/ir/opt.cpp` (IR: yes) |
| 10 | Profile constants in `ui.ts` (keyboard, wheel, accessibility) folded by `foldConstGlobals` | ~32 KB (0) | the same unless 5 | M | medium: behaviour differs per profile, so each profile needs its tests | `lib/std/ui.ts`, `src/frontend/profile.cpp` (ui.ts: yes) |
| 11 | Compact object fields on 32 bits (the field half of ZN-145) | 0 | a UiNode goes from 1,376 B to ~600 B, about half the UI heap (AOT report) *estimate* | L | high | `src/rt`, `src/vm`, `src/aot` (runtime: yes) |
| 12 | Prune classes and selectors with renumbering | ~35 KB of class records *estimate* | ~57 KB of `ClassRT` (88 B x ~650) *estimate* | M-L | medium-high: class ids in types, fields, handlers and the verifier | `src/ir/opt.cpp` (IR: yes) |

Item 1 could go further. 105 concrete classes of the demo are never constructed by any function, for 173,460 B of vtables. But Error,
TypeError and RangeError are among them, and the runtime or a `catch` may make those. Those classes need to be roots first (not checked).

Other compactions are small. u16 counts and varint lengths in the format would save about 15 KB on the demo. 4-byte constants on the f32
profile would save 6.8 KB. Code is the floor: after 1, 3, 6, 7 and 9 the demo is still 538 KB of code. Only less code can shrink it further:
item 10, `applyToken`'s classes resolved at compile time, or fewer Retain/Release.

**Which items are behind the switch.** Items 1, 2, 3, 4, 6, 8, 9 and 12 change no behaviour and help every target (the `packRuns` comment
counts 8.4 MB of vtables for hero), so they are always on. Item 7 (names) and item 10 (profile constants) belong to the light profile:
`--profile esp32`, and later a `light` field in `Profile` (`src/frontend/profile.h:12`). Item 5 is the device core's. Item 11 is ZN-145's
switch, on for esp32.

### Projections

File size step by step (*computed* on the real modules):

| Module | Today | after 1 | after 3 | after 6 | after 7 | after 9 |
|---|---:|---:|---:|---:|---:|---:|
| zinc:gfx hello | 17,469 | 14,037 | 11,177 | 10,870 | 8,970 | 7,631 |
| breakout | 37,550 | 33,130 | 27,810 | 25,392 | 22,736 | **21,402** |
| zinc:ui + kit Button | 1,709,002 | 1,030,058 | 525,266 | 442,852 | 411,485 | 400,609 |
| widgets demo | 2,415,900 | 1,806,312 | 784,936 | 701,477 | 660,498 | **651,037** |

For comparison, the mquickjs firmware runs breakout from 11,800 B of bytecode (`zinc-next-mquickjs.md`).

RAM on the core before the first object (*estimate*; globals add 0.5 KB for breakout and 7.4 KB for the demo):

| | Today | 1-4, 6-9 (code in RAM) | plus 5 (code in flash) |
|---|---:|---:|---:|
| breakout | ~116 KB (peak ~107 KB while decoding, plus the verifier) | ~50 KB | ~32 KB, mostly the 25.5 KB register file |
| widgets demo | ~4.7 MB (peak ~5.8 MB) | ~740 KB | ~180 KB |

Breakout fits today. The light mode leaves more room for the display list and the objects, and lifts the 48 KB limit.

For the widgets demo, light mode is needed but not enough. With 1-9 the tables drop from about 4.7 MB to about 180 KB, and the module
(651 KB) fits the 1 MB flash area. But the UI objects alone peak at 184 to 326 KB (*measured*, `zinc-next-esp32-aot.md` section 3), against
about 256 KB free after the panel drivers. It also needs item 11 and the UiNode slimming the AOT report names. The AOT plan stays the way to
run the demo. Items 1-4 and 8 are its phase 3 ("tables in flash, sparse vtables") as well.

### What to do first

- **Session 1: items 1, 2 and 3** (done 2026-10-22 with item 6, section 6), all in `src/zbc` and one line of `opt.cpp`, plus the prebuilt core rebuilt in the background
  (`tools/build-esp32-core`). The demo goes from 2.42 MB to 785 KB, and every module on every target gets smaller.
  - Proof: `zinc zbc --check` on the corpus, `tools/diff-matrix` and T1 in the background (the change touches the IR), then the
    `tests/t0/device.sh` and `tests/t2/esp32_qemu.sh` sizes.
  - Without the rebuilt image, a v8 module is refused by boards flashed with the old core: `zinc flash --target esp32` again.
- **Session 2: items 7 and 9** (item 6 is done), in the compiler only.
- **Session 3: items 4 and 8**, in the runtime, with `zbench --suite boundary` and the interpreter benchmarks.
- **Session 4: item 5.**
- **Items 10 to 12** are the UI work that the demo needs on top.

Items 1, 6, 9 and 12 are in the IR, and 4, 8 and 11 in the runtime: under "Several tasks at once", none of them runs beside another
shared-core task.

## 5. The smallest step to draw a zinc:gfx program on the board with the interpreter core

The state today:

- Breakout's module is 37,550 B with `--profile esp32` and 36,259 B without (*measured*). Both fit the firmware's 48 KB
  (`firmware/esp32/main/main.cpp:20`).
- Through the device simulator, `zinc --profile esp32 run examples/breakout/src/main.ts --target esp32 --device "zinc device-sim"` uploads,
  decodes, verifies and runs two headless frames: status 0, 0 objects left (*measured*, `ZINC_HEADLESS=1 ZINC_FRAMES=2`). The simulator runs
  inside zinc, which installs a graphics host.
- The real core has no host. `firmware/esp32/main/CMakeLists.txt` links rt, vm, zbc and dev only, so `zn::host::hostGfx` and `hostSys`
  stay null.
- Breakout's first `image()` call, at the top of `skin.ts`, therefore ends the run with "zinc:gfx is not available in this build"
  (`rtcalls.cpp:684`; read from the code, not run on the board).
- No light-mode change is needed for breakout.

The module uses 28 host rows (*measured*):

- graphics: `gfxFrames`, `gfxPoll`, `gfxBegin`, `gfxEnd`, `gfxFinish`, `gfxShouldQuit`, `gfxWidth`, `gfxHeight`, `gfxClear`, `gfxRect`,
  `gfxText`, `gfxImage`, `gfxDrawImage`, `gfxIsDown`, `gfxWasPressed`, `gfxPointerDown`, `gfxPointerX`, and the main-window-only
  `gfxBeginWindow`, `gfxEndWindow` and `gfxWindowOpen`;
- the loop: `loopNow`, `loopEpoch`, `loopReal`, `loopWait`, `evNext`, `evActive` and `evReady`;
- `nativePoll`, which `rtcalls.cpp` already serves.

The frame contract is the one of `__gfxStep` (`src/frontend/modules.cpp:75-100`). `gfxFrames` gives the number of frames, `gfxPoll` gives dt
in seconds after reading input, and `gfxEnd` presents the frame.

The step (one session, all of it in `firmware/esp32` plus two lines in zinc):

1. **A board host in the core firmware.** A new file, `firmware/esp32/main/board_host.cpp` (about 350 lines), installs `hostGfx` and
   `hostSys` before `core.announce()` and serves the 28 rows. Its drawing comes from `firmware/esp32-mquickjs/main/main.c`, which already
   runs breakout on this board at 85-89 fps:
   - the 768-command display list and its text pool;
   - RGB565 band rendering with only the damaged bands sent;
   - `lcd_init` for the ST7789 on the i80 bus;
   - CST820 touch over I2C;
   - the 8x8 font of SDL3's debug text.

   The rest of the host:
   - `image()` returns -1, so `skin.ts` falls back to `render.ts`'s rectangles;
   - `gfxEnd` waits for the next 60 Hz tick (`vTaskDelay`);
   - the event rows answer "nothing";
   - the core sets `cfg.reportModules` with `zinc:sys,zinc:gfx`, so zinc refuses a program that needs another module before the upload.

   `CMakeLists.txt` gains `esp_lcd esp_driver_i2c esp_driver_gpio esp_timer`. None of `runtime/` (zrt, raster, the gfx host: about 220 KB
   of x86-64 text) is needed for this step.
2. **Two fixes in zinc** (`src/main.cpp:2407-2425`):
   - `zinc run examples/breakout --target esp32` fails today with `Z0119 Cannot find module` (*measured*): this path does not resolve a
     project directory to its `entry`.
   - The path compiles with the host profile unless `--profile esp32` is given, so `number` is a soft-float f64 on the LX6. It should apply
     the esp32 profile, after checking the `library` golden of `tests/t2/esp32_qemu.sh` with f32 numbers.
3. **Output while the program runs.** The core sends a program's output only when it ends (`core.cpp:77-82`). A frame loop never ends, so
   `zinc run` would stop after `--run-ms` (60 s) with "the program did not finish in time". Sending `ZN out` lines as they come (at each
   `gfxEnd`) fixes it.
4. **Proof.**
   - esp32sim with the SPI panel build, as the mquickjs session did (`-DZN_PANEL=spi`, `docs/reports/esp32sim.md`): the frame as a PNG.
   - Then the board, once the mquickjs session has released the port.
   - Image size and free heap at `ready` recorded here. The expected heap is ~116 KB of tables and registers (*estimate*), 17.5 KB of display
     list and two 7.7 KB bands, within the ~256 KB left after the panel drivers.

## 6. Session 1 (2026-10-22): items 1, 2, 3 and 6, measured

Done on the branch of this session, one commit each:

1. **Abstract vtables** (`src/ir/opt.cpp`): a class that ZN-431 makes abstract clears its vtable.
2. **The decode reserve** (`src/zbc/zbc.cpp`, `src/rt/machine.cpp`): `decode` reserves every vector whose count it has just read. A count
   from a corrupted file reserves no more than the rest of the file can hold. `Machine::load` does the same for its per-class field
   flags, the global flags and the string constants.
3. **Sparse vtables, ZBC version 8** (`src/zbc`, `src/rt/machine.cpp`, `src/aot/aot.cpp`, `docs/ir-format.md`). A concrete class writes
   one function index per selector of its own list, with no count. Interfaces and abstract classes write none.
   - The decoded `zbc::Module` keeps the sparse form: `ClassInfo::vtable[k]` belongs to `selectors[k]`. The verifier, the disassembler
     and the AOT's argument count read that form.
   - `Machine::load` expands it into the runtime's existing dense `ClassRT` tables. Item 4, a sparse dispatch in the runtime, is not done.
   - The prebuilt core image was rebuilt (`firmware/esp32/prebuilt/esp32-core-flash.bin`, 889,648 B).
   - `tests/compat/fib-v8.zbc` is the new reference file. `fib-v7.zbc` is refused as older.
   - The fuzz fixture `tests/fuzz/regress/zbc-class-flags.zbc` was rewritten in the v8 layout, so it still fails at its class flags and
     not at the version.
   - A board flashed by an older zinc refuses a v8 module. zinc now answers that error with "the core firmware on the device is older
     than this zinc ...: write the new one with `zinc flash --target esp32`", where the core's own message said "update zinc"
     (`src/dev/client.cpp`, checked by `tests/t0/device.sh` with a fake device).
6. **Selector-aware dead-method pass** (`src/ir/opt.cpp`, rapid type analysis). A method of a constructed class is kept only if
   reachable code calls its selector (`CallVirt`).
   - The roots are `call` and `__errorString`, which the runtime looks up by name (`machine.cpp`, `rtcalls.cpp`; no other lookup by
     name exists).
   - A debug or hot build keeps every method.
   - A selector nobody calls leaves every class's list, so the verifier's rule that a concrete class implements each selector it lists
     still holds.
   - Nine `tests/golden/zbc` disassemblies lose the dropped methods and gain nothing else. In `devirt`, the class `Unused` stays
     concrete with no selector: its only method's selector is no longer called, so the class no longer counts as having lost a method.

Then a first step of item 4 (`src/rt/machine.cpp`): `Machine::load` gives no dense table to a concrete class that lists no selector.
- A verified `CallVirt` names a selector of its receiver's class, a subclass lists its parents' selectors, and the lookups by name check
  the table's size, so nothing indexes such a table.
- After item 6, 230 of the demo's 560 concrete classes have no selector, and 11 of breakout's 20.
- The core image was rebuilt again (889,664 B).

Also fixed on the way: `zinc run --target esp32 --qemu` left its QEMU running after every run, because `sh -c` does not pass SIGTERM on.
The QEMU command is now `exec`'d (`src/tc/tc.cpp`), and `tests/t2/esp32_qemu.sh` fails if an emulator outlives its run.

### Module size

Bytes, `ZINC_DEVICE_TARGET=esp32 zinc --profile esp32 --emit=zbc-bin` (*measured*). Item 2 changes no byte.

| Program | Before | after 1 | after 3 (ZBC 8) | after 6 |
|---|---:|---:|---:|---:|
| console hello | 125 | 125 | 121 | 121 |
| zinc:gfx hello | 17,469 | 14,037 | 10,997 | 10,393 |
| `examples/breakout` | 37,550 | 33,130 | 27,594 | **24,562** |
| zinc:ui hello | 425,051 | 399,311 | 348,763 | 343,943 |
| zinc:ui + kit Button | 1,709,002 | 1,030,058 | 521,586 | 429,392 |
| widgets demo (`examples/boards/esp32-2432s022`) | 2,415,900 | 1,806,312 | 780,272 | **686,695** |

- Item 3 saves a little more than projected, because the vtable count is gone too.
- Item 6 saves more than projected (93.6 KB against 83.5 KB on the demo), because it also trims the classes' selector lists.
- On the demo, item 6 keeps 343 vtable entries of 716, and its code goes from 615,692 B to 540,212 B.

### RAM

**Measured on the emulated ESP32** (`zinc run --target esp32 --qemu`, Espressif's QEMU, `ZN_DEVICE_STATS=1`). The figure is the free heap
in the `done` line. At that point the decoded module is still alive, and the `Machine` (`ClassRT`, string objects, registers) is already
freed. Breakout stops at its first `zinc:sys` call, since the core has no host, but only after it has loaded. Each column is a core image
built from the same sources as the zinc that compiled the module.

| Free heap at `done` | Before (core v7) | 1 + 2 | 1 + 2 + 3 | 1 + 2 + 3 + 6 |
|---|---:|---:|---:|---:|
| console hello | 274,632 | 274,552 | 274,556 | 274,556 |
| `tests/golden/run/library.ts` | 226,584 | 236,760 | 238,656 | 238,656 |
| `examples/breakout` | 157,852 | 189,932 | 202,556 | **210,420** |
| breakout's decoded module (hello minus breakout) | 116,780 | 84,620 | 72,000 | **64,136** |

**32-bit model** (*estimate*). This is section 3's model, plus the top-level vectors of the `Module` (classes, functions, strings), which
the push_back growth also rounds up. "Peak" is the received bytes plus the decoded `Module`.

| Decoded `Module` | Before | after 1 | after 2 | after 3 | after 6 |
|---|---:|---:|---:|---:|---:|
| breakout | 77,648 | 70,888 | 48,716 | 43,364 | 38,584 |
| widgets demo | 3,506,228 | 2,747,564 | 2,084,936 | 1,062,208 | 940,496 |
| widgets demo, peak while decoding | 5,922,128 | 4,553,876 | 3,891,248 | 1,842,480 | 1,627,191 |

**Host** (*measured*, x86-64): `zinc zbc --check` (decode and verify) of the widgets demo peaks at a footprint of 4.8 MB, against 8.9 MB
before. The figure moves by up to about 0.8 MB between runs.

The dense `ClassRT` vtables of `Machine::load` (*estimate*, 32-bit, one table of 413 or 85 words per concrete class with selectors):

| | Before | After |
|---|---:|---:|
| widgets demo | 1,029,200 (620 tables) | 547,800 (330 tables) |
| breakout | 5,568 (16) | 3,132 (9) |

These tables are freed before the `done` line, so the QEMU figures above do not show them.

The largest tables left:

- These dense tables: about 550 KB on the demo. The rest of item 4 (a row-displacement table) or item 12 (renumbered selectors) removes
  them.
- The code in RAM: 540 KB on the demo. This is item 5.

### Proof that the output did not change

- **Items 1 to 3.** For the six programs above, `--emit=zbc` (the disassembly of every class table and every function) is byte-identical
  to the one before the change. `zinc zbc --dump` of each binary is identical to its `--emit=zbc`, so the v8 encoding round-trips.
- **Item 6.** The last frame and the output of a headless deterministic run (40 frames) are byte-identical before and after the pass, on
  the interpreter, for:
  - the widgets demo: Home, Controls and System pages;
  - `examples/hero`, `breakout`, `nuxt-ui`, `rn-showcase`, `rn-port` and `music-tree`.

  The widgets demo's Controls page was also compared on AOT (`--native`), with the same result.
- **The skipped tables.** The same comparison, before and after, on the widgets demo's three pages, `hero`, `nuxt-ui` and `rn-showcase`:
  identical. `hot_swap` passes too, since it rewrites the tables of removed classes.
- **Tests:**
  - T0 and T1: `zbc`, `ir`, `irformat`, `aot` (T0 and T1), `rc`, `rc_borrow`, `rc_lend`, `rc_refcast`, `hot_off`, `virtual_default`,
    `device`, `profile`, `console_live`, `fuzz_regress` and `checker` pass.
  - T2: `esp32_qemu` (hello, the library golden and an uncaught exception, on the rebuilt core) and `export_esp32` pass.
- **`tools/diff-matrix`** (interpreter and AOT against the frozen outputs, 149 programs): 146 agree.
  - `clock`, `date_full` and `dates` differ with the binary from before the change too: the local hour is one off the frozen output, a
    time zone matter.
  - Run it with `ZINC_STEPS=0`. Without it, the progress lines of `zinc run` reach the compared output and every interpreter cell differs.
