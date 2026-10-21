# Native C/C++ modules and Arduino on the ESP32 (mquickjs firmware)

Research for the question: how does a user call a classic C/C++ or Arduino library from TypeScript on the ESP32, and how
does a C++ developer embed Zinc in a sketch or an ESP-IDF app. Date 2026-10-22. Board: ESP32-2432S022C, no PSRAM, 4 MB
flash, ESP-IDF 5.5.5 (`~/.zinc/esp-idf`, measured: `version` of the checkout), firmware `firmware/esp32-mquickjs`.

Marking: **[read]** = read in the repository or a page I fetched; **[measured]** = measured here; **[est]** = my estimate or
memory, not checked; **[unverified]** = a search did not confirm it.

## 1. The native API of mquickjs

Sources: `third_party/mquickjs/mquickjs.h`, `mquickjs_build.h`, `mquickjs_build.c`, `mqjs_stdlib.c`, `README.md` (commit
6d4d7eb per `third_party/README.md`), upstream `example.c` (https://github.com/bellard/mquickjs).

### Build time only [read]

There is no `JS_NewCFunction`, no `JS_DefineProperty` for C pointers, no class registration call. Every C function and every
class lives in the ROM table that `mquickjs_build.c` writes from a `JSPropDef` array (`JS_CFUNC_DEF`, `JS_CGETSET_DEF`,
`JS_PROP_CLASS_DEF`, `JS_CLASS_DEF`). `JS_NewContext(mem, size, &js_stdlib)` takes that table (`JSSTDLibraryDef`: atoms,
`c_function_table`, `c_finalizer_table`, `class_count`). The README says the same: "The whole standard library resides in
ROM. It is generated at compile time." The only runtime creation of a function is `JS_NewCFunctionParams(ctx, func_idx,
params)`, a closure over one of the C functions declared in the table (`js_c_function_decl`, "only useful for C closures").
README limits: C functions cannot carry their own properties (C constructors can); getters/setters cannot sit on the global
object; the global object itself is "discouraged".

So a native module means: add entries to the table, regenerate `zn_stdlib.h` and `mquickjs_atom.h` with the host program,
recompile the firmware. This is already the firmware's pipeline: `firmware/esp32-mquickjs/main/CMakeLists.txt` compiles
`main/zn_stdlib.c` + `mquickjs_build.c` with the computer's `cc`, runs it with `-m32` (and `-m32 -a`), and the IDF component
includes the output. `zn_stdlib.c` already adds `JS_CFUNC_DEF("__host_gfxRect", 5, js_gfx_rect)` and so on, defined in `main.c`.
The JavaScript program itself is not in the firmware: it is bytecode in the `js` partition (0x110000, 512 KB) that `zinc run`
rewrites in a few KB; only a native module forces a firmware rebuild and a full flash.

### One C function [read: signature and macros; the body is a sketch]

```c
/* in zn_stdlib.c's global table */
JS_CFUNC_DEF("__host_qrSize", 1, js_qr_size),

/* in a .c file of the firmware; JSCFunction = (ctx, JSValue *this_val, int argc, JSValue *argv) */
static JSValue js_add(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) {
    int a, b;
    if (JS_ToInt32(ctx, &a, argv[0]) || JS_ToInt32(ctx, &b, argv[1])) return JS_EXCEPTION;
    return JS_NewInt32(ctx, a + b);
}
```
Strings: `JS_ToCString(ctx, v, &buf)` with a `JSCStringBuf` (5 bytes) returns a `const char *`. The heap is compacting, so
treat the pointer as valid only until the next JS allocation and copy at once (my reading of README "Memory handling" [est]).
Errors: `return JS_ThrowTypeError(ctx, "...")`. `JS_IsException(v)` tests a failed call.

### One class with C data [read, from upstream example.c, quoted by fetch]

```c
#define JS_CLASS_QR (JS_CLASS_USER + 0)               /* ids are yours, in table order */
#define JS_CLASS_COUNT (JS_CLASS_USER + 1)            /* the generated header defaults it to JS_CLASS_USER */

static JSValue js_qr_ctor(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) {
    if (!(argc & FRAME_CF_CTOR)) return JS_ThrowTypeError(ctx, "must be called with new");
    JSValue obj = JS_NewObjectClassUser(ctx, JS_CLASS_QR, 0);   /* n_values = JSValue slots kept in the object */
    if (JS_IsException(obj)) return obj;
    Qr *d = malloc(sizeof *d);  JS_SetOpaque(ctx, obj, d);      /* the opaque pointer is not traced */
    return obj;
}
static void js_qr_finalizer(JSContext *ctx, void *opaque) { free(opaque); }  /* must not call JS */
static JSValue js_qr_get_size(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) {
    if (JS_GetClassID(ctx, *this_val) != JS_CLASS_QR) return JS_ThrowTypeError(ctx, "not a QR");
    return JS_NewInt32(ctx, ((Qr *)JS_GetOpaque(ctx, *this_val))->size);
}

static const JSPropDef js_qr_proto[] = {
    JS_CGETSET_DEF("size", js_qr_get_size, NULL),
    JS_CFUNC_DEF("module", 2, js_qr_module),
    JS_PROP_END,
};
static const JSClassDef js_qr_class =
    JS_CLASS_DEF("QR", 1, js_qr_ctor, JS_CLASS_QR, NULL, js_qr_proto, NULL, js_qr_finalizer);
/* and in the global table: */  JS_PROP_CLASS_DEF("QR", &js_qr_class),
```
The generator writes `js_c_finalizer_table[JS_CLASS_COUNT - JS_CLASS_USER]` from the `finalizer_name` argument
(`mquickjs_build.c:397`). Finalizers run at GC time and at `JS_FreeContext`; mquickjs allocates nothing outside its buffer, so
the C data (malloc, or a static pool on this board with ~180 KB DRAM) is the library's own memory and the engine does not
count it. `JS_SetUserValue/GetUserValue(obj, idx, v)` store JS values inside the object (GC-traced) when `n_values > 0`.
`JS_CLASS_MAGIC_DEF` / `JS_CFUNC_MAGIC_DEF` share one C function across entries with a `magic` int.

### Calling JavaScript from C

- Values move: a `JSValue` held in a C variable across any allocating call is invalid. Use `JSGCRef r; JSValue *p =
  JS_PushGCRef(ctx, &r); *p = ...; ... JS_PopGCRef(ctx, &r);` (strict LIFO, `JS_PUSH_VALUE`/`JS_POP_VALUE`) or
  `JS_AddGCRef/JS_DeleteGCRef` (any order, for a value kept between calls). README: "avoid having variables of type JSValue
  in C". `DEBUG_GC` on a PC moves objects at every allocation to catch mistakes (the host `zinc-mqjs` can build with it).
- Best place to keep a JS callback: in the object (`JS_SetUserValue`), not in a global ref.
- The call protocol, from `example.c` (`js_test_object_call`) and `mquickjs.c:2654`: `JS_StackCheck(ctx, n+2)` first (returns
  nonzero on failure), then push arguments last to first, then the function, then `this`, then `JS_Call(ctx, argc)`:
```c
if (JS_StackCheck(ctx, 3)) return JS_EXCEPTION;
JS_PushArg(ctx, arg1);  JS_PushArg(ctx, fn);  JS_PushArg(ctx, JS_NULL);   /* this */
JSValue r = JS_Call(ctx, 1);
```
  (constructors OR `FRAME_CF_CTOR` into argc). A thrown JS error comes back as `JS_EXCEPTION`; `JS_GetException` reads it.
- From an ISR or another FreeRTOS task never call the API (single context, no locking). Queue the event (`xQueueSend`) and let
  the frame loop (`main.c`) call the JS callback, as it already does for `onFrame`.
- `JS_SetInterruptHandler(ctx, fn)` lets the host stop a runaway script (watchdog friendly).

## 2. How others let users add native modules

| Project | Mechanism | Rebuild? | Source |
| --- | --- | --- | --- |
| MicroPython | `USER_C_MODULES=<dir>`; each module dir has `micropython.cmake` (INTERFACE library linked to `usermod`) and `micropython.mk`; C file ends with `MP_REGISTER_MODULE(MP_QSTR_cexample, example_user_cmodule)`; functions via `MP_DEFINE_CONST_FUN_OBJ_*`, types via `mp_obj_type_t` | yes, firmware | https://docs.micropython.org/en/latest/develop/cmodules.html [read] |
| Moddable SDK | `manifest.json` per module: `include`, `modules`, `preload`, plus `"dependency"` for ESP Component Registry components (headers become visible to native code); JS declares a host function with `@ "xs_name"` in the class and the C file implements `xs_name(xsMachine *)`; ROM-resident JS, XS FFI generates glue from plain C signatures | yes, `mcconfig` builds it all | https://moddable.com/documentation/tools/manifest , https://moddable.com/blog/using-the-esp-component-registry/ , https://www.moddable.com/documentation/xs/XS%20FFI [read as search snippets; the `@ "xs_"` syntax is from memory, est] |
| Espruino | a `libs/<name>/jswrap_<name>.c` with `/*JSON{ "type":"class"/"library", ... }*/` comments; a generator (`scripts/build_jswrapper.py`) writes the binding; add `INCLUDE`/`WRAPPERSOURCES` lines in the Makefile; `"type":"library"` gives `require("name")` | yes, custom firmware; forum: "anyone using the same sensor would need to build their own Espruino"; JS modules avoid that | https://github.com/Tiancheng-Luo/Espruino/blob/master/libs/README.md , https://forum.espruino.com/comments/15210520/ [read] |
| Elk (Cesanta) | the host registers `jsval_t fn(struct js *, jsval_t *args, int nargs)` at runtime with `js_set(js, js_glob(js), "sum", js_mkfun(sum))`; no malloc, caller gives the buffer | no: runtime registration in the C app | https://github.com/cesanta/elk [read] |
| Toit | native "primitives" written in C++ inside the Toit SDK tree, called from Toit with `#primitive.mod.name`; custom primitives mean building the SDK/firmware yourself; there are also "external" packages for libraries | yes [est; page 404, not read] | https://docs.toit.io [unverified] |
| Lua / NodeMCU | `lua_CFunction` + `luaL_Reg` tables; NodeMCU modules live in `app/modules/*.c`, selected in `user_modules.h`; ESP32 builds select them in menuconfig | yes [est] | https://nodemcu.readthedocs.io [est, not fetched] |

What they share: native code is compiled into the firmware and registered in a table the engine reads; the user's script stays
a data file. The two usable ideas are MicroPython's per-module directory that holds a build fragment, and Moddable's manifest
that also pulls IDF components. Elk-style runtime registration is impossible here (ROM table), and Espruino's lesson is to keep
native modules rare and cache their firmware.

### Design that fits mquickjs + `plugin.json` (proposal)

A plugin already carries per-target native build data: **[read]** `plugins/display-st7789/plugin.json` has
`"esp32": { "sources": ["st7789.cpp"], "idf": ["esp_lcd", "esp_driver_spi", ...] }`; other plugins use `defines`, `libs`,
`linkFlags`. `idf` is the list of IDF components to `REQUIRES`. Extend the `esp32` entry:

```json
{ "name": "qr", "module": "zinc:qr", "entry": "index.ts",
  "targets": { "esp32": {
      "sources": ["native/qrcodegen.c", "native/qr_mqjs.c"],
      "defines": ["QR_MAX_VERSION=10"],
      "idf": [],
      "mqjs": { "table": "native/qr_table.h", "classes": 1 }
  } } }
```
- `native/qr_mqjs.c` holds the C functions and `JSClassDef`s (section 1). `native/qr_table.h` holds the `JSPropDef` lines
  (`JS_CFUNC_DEF("__host_qr...")`, `JS_PROP_CLASS_DEF("QR", ...)`). Zinc generates `zn_native.c` that `#include`s every
  plugin's `qr_table.h` and numbers `JS_CLASS_USER + n` (so two plugins cannot collide), then `zn_stdlib.c` includes it.
- `zinc build/run --target esp32 --engine mquickjs`: compute a hash of (engine, board sdkconfig, set of native plugins). Without
  native code: the prebuilt `prebuilt/zinc-mquickjs-flash.bin` (334 KB image **[measured]**, file size) is used as today. With
  it: zinc writes an IDF project into `$ZINC_HOME/cache/<hash>/` (main component + one component per plugin from its
  `sources`/`idf`/`defines`), runs `idf.py build` (the pinned 5.5.5, or docker as `docs/boards.md` describes), and caches the
  image. The first build is minutes (the IDF tree is large); later changes of the TS never rebuild.
- TypeScript side: `index.ts` declares the raw host calls (`declare function __host_qrEncode(...)`) and exports a typed wrapper;
  the existing `__host_` convention and the `js/sim.js` check (`tests/t0/mquickjs_esp32.sh` makes `sim.js` and `zn_stdlib.c`
  agree) extend naturally: a plugin ships a `sim` stub (`native/qr_sim.js`) so `zinc run` on the Mac and the 300-frame check
  still work, or the plugin has a macOS native file too (the engine already supports one `plugin.json` for many targets).
- C++ libraries (Arduino ones): `sources` accepts `.cpp`; the binding file stays `extern "C"`-free by being C++ with the C
  `JSCFunction` signatures declared `static`. Needs `CONFIG_COMPILER_CXX_EXCEPTIONS` only if the library throws (section 3).
- Ceilings: one context, one JS thread; ROM-table growth is cheap (a function costs ~12 bytes of `JSCFunctionDef` plus its
  atom [est]); each rebuild needs the host `cc` (any compiler, `-m32` is a program flag, not a compiler flag).
- A `zinc native init <name>` scaffold (plugin dir, C stub, TS stub, sim stub) is what makes this usable by non-experts.

## 3. Arduino and ESP-IDF

### arduino-esp32 as an IDF component

- Version for IDF 5.5: Arduino core **3.3.x** (docs: "Latest Arduino Core ESP32 version (3.3.12) is now compatible with ESP-IDF
  v5.5", https://docs.espressif.com/projects/arduino-esp32/en/latest/esp-idf_component.html [read]; another doc build says 3.3.7).
  Its manifest (https://raw.githubusercontent.com/espressif/arduino-esp32/release/v3.3.x/idf_component.yml [read]) pins
  `idf: ">=5.3,<6.2"`, so IDF 5.5.5 is inside the range. The repo's other doc line (`examples/boards/.../README.md`) names IDF v6.0 in docker
  for `zinc build`; 3.3.x also accepts 6.0 per the range, but the matching tested pair is 5.5.
- The line, in the main component's `idf_component.yml` (the manager downloads it at build):
```yaml
dependencies:
  espressif/arduino-esp32: "^3.3.12"      # or: idf.py add-dependency "espressif/arduino-esp32^3.3.12"
  idf: ">=5.5"
```
  and in the component's `CMakeLists.txt`: `idf_component_register(SRCS main.cpp ... REQUIRES arduino-esp32)`. The docs say: rename
  `main.c` to `main.cpp` for C++ sketches, and **turn off** "Autostart Arduino setup and loop on boot" (Arduino Configuration)
  to keep `app_main()`; leave it on to use `setup()/loop()`. `app_main` returning restarts the MCU.
- sdkconfig needs: `CONFIG_FREERTOS_HZ=1000` (docs: "requires the FreeRTOS tick rate CONFIG_FREERTOS_HZ set to 1000 Hz").
  **Zinc already sets 1000** in the firmware (`sdkconfig.defaults`) and the board preset, so there is no clash. Others [est]: the
  component's Kconfig turns on C++ exceptions and the `Arduino` menu for the loop task stack (8192 default); `CONFIG_ESP_MAIN_TASK_STACK_SIZE`
  is already 8192 here; with `setup/loop` autostart the loop runs in its own task (`CONFIG_ARDUINO_LOOP_STACK_SIZE`).
  C++ exceptions and RTTI are off in plain IDF ("disabled by default, enabled with CONFIG_COMPILER_CXX_EXCEPTIONS",
  RTTI "typically increases the binary size by tens of kB", https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32/api-guides/cplusplus.html [read]).
  The firmware's `-Os`/`CONFIG_COMPILER_OPTIMIZATION_ASSERTIONS_SILENT` settings are compatible.
- Cost: not measured here. Estimate [est]: an Arduino-as-component image with Serial, GPIO, Wire and SPI adds roughly 150 to
  300 KB flash and 10 to 30 KB DRAM (the core's `initArduino`, HardwareSerial, `esp32-hal-*`); Wi-Fi/BT stacks (if linked) add
  hundreds of KB more and ~40+ KB DRAM, which the 96 KiB JS heap + ~180 KB DRAM budget cannot afford without care. The firmware's
  factory partition is 1 MB (`partitions.csv`) and the current image is 334 KB **[measured]**, so flash has room; **DRAM is the
  limit** (docs/boards.md: DRAM static 93.5 KB of 180.7 KB in the UI firmware; the mquickjs firmware uses 96 KiB for JS).
  A real number needs one build: `idf.py size-components` after adding `arduino-esp32`.
- Using an Arduino library inside the IDF project: put the library under `components/<lib>/` with its own
  `CMakeLists.txt` (`idf_component_register(SRC_DIRS src INCLUDE_DIRS src REQUIRES arduino-esp32)`) or fetch it from the registry
  if published (Espressif's registry has many, e.g. `adafruit/...` wrappers: check https://components.espressif.com). PlatformIO
  can also do it with `framework = arduino, espidf` (hybrid) [est]. Libraries that use `Wire`, `SPI`, `Serial` link against the core.
  Libraries that call `delay()`/`millis()` are fine, `delay` becomes `vTaskDelay`; with the tick at 1000 Hz the resolution is 1 ms.
- Conflicts to watch [est]: Arduino `Wire` and our `display-st7789` touch both claim an I2C port (use the `i2c_master` bus
  handle once, or give the library port 1); `SPI` on VSPI (GPIO 18/19/23/5) is the TF slot; `Serial` = UART0 = the CH340 console that
  `zinc monitor` reads.

### Zinc as an Arduino library [proposal; Arduino rules read]

Arduino library spec (https://arduino.github.io/arduino-cli/1.5/library-specification/ [read]): `library.properties` with
`name, version, maintainer, sentence, paragraph, url` (required), `architectures=esp32`, optional `depends`, `includes`,
`precompiled`, `ldflags`, `dot_a_linkage`; `src/` and all subfolders compile; only `src/` is on the include path; headers in the
root of `src/` are the public ones, internal headers go in a subfolder. The Arduino IDE has **no host generator step**, so ship the
generated tables:

```
Zinc/                      library.properties (architectures=esp32)
  src/Zinc.h               public: Zinc.begin(heap, size); Zinc.run(const uint8_t *bytecode); Zinc.addFunction... (see below)
  src/Zinc.cpp             extern "C" bridge, run loop
  src/mquickjs/*.c *.h     vendored engine (MIT) + cutils, dtoa, libm
  src/gen/zn_stdlib.h      pregenerated: zn_stdlib -m32
  src/gen/mquickjs_atom.h  pregenerated: zn_stdlib -m32 -a
  examples/Blink/Blink.ino
```
- Regenerate the two headers in CI (`tools/build-esp32-core` already runs the generator) and commit them; they depend only on the
  table, not on the board. Native functions a sketch author adds cannot go in the pregenerated table. Offer two ways: (a) a tool
  `zinc arduino-gen my_table.c` that writes new headers into the sketch folder (host program, `-m32`), and (b) a fixed generic
  escape hatch in the prebuilt table: `__host_call(id, a, b, c, d)` dispatching to `Zinc.onCall(id, ...)` callbacks registered
  from the sketch, plus `__host_on(name, fn)` for events. (b) needs no generator and covers sketches; (a) gives named, typed APIs.
- The bytecode comes from `zinc` on the computer (`zinc build --target esp32 --engine mquickjs --emit-c app.h` as a C array)
  and is compiled into the sketch, or read from LittleFS/SPIFFS. Relocation as `main.c` does it needs RAM for a copy (the
  firmware says the program is at most half of its partition).
- C/C++ mixing: the engine files are `.c` and compile with C flags, so the C++ exception/RTTI flags do not affect them. The bridge
  `Zinc.cpp` wraps `#include "mquickjs.h"` in `extern "C"`. The arduino-esp32 core builds with its own flags (the C++ ones are in
  `platform.txt`; the spec page gives no flag guidance, so check `compiler.cpp.flags` of the installed core [unverified]).
  A user's C++ library that throws needs exceptions enabled in the core's prebuilt libraries (arduino-esp32's own `sdkconfig`
  enables them [est]); inside our binding code no exception may cross a `JSCFunction` (it is C ABI).
- `-O2`: the Arduino IDE builds at `-Os` by default (selectable "Optimize" in newer cores); the engine runs ~1.5 to 2x slower at -Os
  than -O2 [est]; the firmware's CMake sets `-O2` for the engine only (`main/CMakeLists.txt`). Put `#pragma GCC optimize ("O2")` on top of
  the vendored engine files.
- FreeRTOS tick: arduino-esp32's prebuilt IDF uses 1000 Hz, so inside the Arduino IDE the tick is fixed and right. In a custom IDF
  project the default is 100 Hz and `vTaskDelay(1)` = 10 ms (the preset already fixes this to 1000, `docs/boards.md`).
- PlatformIO (https://docs.platformio.org/en/latest/manifests/library-json/index.html [read, list of fields only]): a
  `library.json` with `"frameworks": ["arduino","espidf"]`, `"platforms": ["espressif32"]`, `"build": {"flags": ["-O2",
  "-DJS_PTR_SIZE=4"], "srcFilter": ["+<*>","-<mquickjs/mqjs*.c>"]}`. Exclude `mqjs.c`, `readline*.c` (REPL, not for MCU). The official
  platform's Arduino core lags (3.x arrives via the `pioarduino` fork) [est]. The library.properties form works for PlatformIO too.
- Build exclusions in both: do not compile `mqjs.c`, `readline.c`, `readline_tty.c`, `mquickjs_build.c` (host-only).

### What the plain-IDF C++ developer needs (the answer to (c)) [proposal]

1. `components/zinc/` in the IDF project: `idf_component.yml` for the registry (or git), `CMakeLists.txt` that registers the engine and
   an **option** `ZINC_STDLIB_TABLE` (a path to the user's `JSPropDef` file). A CMake function `zinc_generate_stdlib(TARGET ...
   TABLE ...)` runs the host generator exactly as this firmware's CMake does (works on macOS, Linux, Windows with a host compiler).
2. C API header `zinc.h`: `zinc_init(heap, size)`, `zinc_run(bytecode, len)`, `zinc_tick()`, `zinc_post_event(...)` (queue-based, ISR safe).
3. A documented binding macro set (thin wrappers on mquickjs: `ZN_FN(name, nargs)`, `ZN_CLASS(...)`) and one fully worked example
   (the QR module below).
4. `idf.py menuconfig` entries (Kconfig): JS heap size, bytecode partition, display/touch plugin on/off.
5. Component dependencies by `REQUIRES` (e.g. `esp_lcd`, `driver`), not by Arduino; Arduino becomes one more optional `REQUIRES`.

## 4. A library for a demo with no extra hardware: Nayuki QR Code generator

Pick: **nayuki/QR-Code-generator, C version** (https://github.com/nayuki/QR-Code-generator, `c/qrcodegen.c` + `qrcodegen.h`).
- Licence: MIT [read]. Pure C99, no heap (all buffers are caller-provided), no dependencies beyond `<string.h>`, `<stdint.h>`.
- Size: source about 1,000 lines; flash ~6 to 10 KB at -Os [est]. RAM: two buffers of `qrcodegen_BUFFER_LEN_FOR_VERSION(v)` =
  `((4v+17)^2+7)/8+1` bytes: version 6 (41x41) 212 B each, version 10 (57x57) 408 B, version 40 3,918 B [computed from the
  macro formula, which I remember from the header [est]]. A 240 px wide screen fits version up to 10 at 4 px/module (228 px).
- API (from memory of the header [est]):
  `bool qrcodegen_encodeText(const char *text, uint8_t tmp[], uint8_t qr[], enum qrcodegen_Ecc ecl, int minVer, int maxVer,
  enum qrcodegen_Mask mask, bool boostEcl); int qrcodegen_getSize(const uint8_t qr[]); bool qrcodegen_getModule(const uint8_t qr[],
  int x, int y);`
- Alternative [read]: ricmoo/QRCode (https://github.com/ricmoo/QRCode), MIT, Arduino library with `library.properties`, no heap,
  `qrcode_initText(&qrcode, buf, version, ecc, text)`, `qrcode_getModule`; fewer versions and ECC options, 11 commits, "last commit
  not visible". Nayuki is better maintained and tests ECC/mask choices. The Arduino one is the right demo for the IDF/Arduino path (section 3).

Why it is a good demo: no hardware, shows text -> pixels on the 240x320 LCD, and the touch can edit the text (a keypad exists in
`examples/boards/esp32-2432s022`). Display cost: the draw list has a limit of **768 commands per frame** (README of the firmware), so do not
draw one `rect` per dark module (V5 is 37x37 = up to 1,369): merge runs of dark modules per row in the binding (about
18 runs/row worst case = 666 rects) or return the matrix as a packed `Uint8Array` and draw once as an image/canvas when
the display list supports it. Merging in TS is simple enough.

TypeScript API sketch:
```ts
import { QR } from 'zinc:qr'
const qr = new QR('https://zinc.dev/hello', { ecc: 'medium', minVersion: 1, maxVersion: 10 }) // throws RangeError if too long
qr.size                      // modules per side, e.g. 29
qr.module(x, y)              // boolean
qr.rows()                    // Uint8Array(size*ceil(size/8)), bit 1 = dark, packed row-major
qr.runs(y)                   // number[]: [start, length, start, length...] for the dark runs of row y
// draw: for (y) for (i of qr.runs(y)) rect(ox + s*start, oy + s*y, s*len, s, 0x000000)
```
Native side: a `QR` class with `JS_CLASS_QR`, an opaque `{ uint8_t size; uint8_t data[BUFFER_LEN_FOR_VERSION(maxVer)]; }`,
`encodeText` into a temp buffer on the C stack/static, finalizer `free`. Registered by `plugins/qr/plugin.json` with
`"esp32": { "sources": ["native/qrcodegen.c", "native/qr_mqjs.c"] }` and a pure-TS fallback
(`index.ts` on macOS can use the same C via the macOS target, or a TS port, so `zinc run` shows it on the Mac too).

## 5. ESP32-2432S022C pins

Sources: `boards/esp32-2432s022.json` [read], `examples/boards/esp32-2432s022/README.md` [read], `docs/boards.md` (the vendor
package's schematic read in an earlier session: `5-Schematic/ESP32-2432022-{LCM,MCU}-V1.0.png`, not in the repository) [read].
The web search found **no** published pinout of this exact board: results were the 2.8" and 3.2" Sunton boards (different wiring), an
openHASP issue (https://github.com/HASwitchPlate/openHASP/issues/606, LovyanGFX config agrees with the repository: display and touch pins, SD =
MISO 19, MOSI 23, SCLK 18, CS 5; it also lists a commented, "unverified" `BUTTON1 = 0`), and the PlatformIO Sunton board list
(https://github.com/rzeldent/platformio-espressif32-sunton: a `esp32-2432S022C.json`, "Speaker JST 1.25 2p", "Battery interface JST 1.25 2p", TF card).
I did not open the serial port and could not read the PNG schematics from this machine. Anything marked [unverified] must be checked
on the board with a multimeter or the vendor PNG before wiring.

| GPIO | Used by | Source | Free for the user? |
| --- | --- | --- | --- |
| 0 | LCD backlight (AO3402 MOSFET gate, 10k pull-down) and BOOT strap/button | docs/boards.md, preset | readable as a button only with the backlight off; see below |
| 1, 3 | UART0 TX/RX to the CH340C (console) | ESP32 + CH340 [est] | no (monitor) |
| 2 | LCD RD (held high) | preset | no (strap pin, also LCD) |
| 4 | LCD WR | preset | no |
| 5 | TF slot CS | docs/boards.md | yes if no card is used (strap pin: must be high at boot, TF CS has a pull-up [est]) |
| 12, 13, 14, 15, 25, 27, 32, 33 | LCD D4..: D2=12, D1=13, D3=14, D0=15, D5=25, D4=27, D7=32, D6=33 | preset | no (12 is the flash-voltage strap: leave as is) |
| 16, 17 | LCD DC, CS | preset | no |
| 18, 19, 23 | TF slot CLK, MISO, MOSI | docs/boards.md | yes if no card; free only when the slot is empty [unverified wiring to a header] |
| 21, 22 | I2C SDA/SCL: CST820 touch (0x15); INT unused, RST on EN | preset | shared I2C: a second I2C device on the same bus at another address if the board exposes it [unverified] |
| 26 | SC8002B speaker amp input (DAC2), JST 1.25 2-pin socket | docs/boards.md | audio out; no LED |
| 34, 35, 36, 39 | not in any table | by elimination | input-only pins; **whether any reaches a connector is unverified** (on the 2.8"/3.2" Sunton boards IO35 does; this board has no 'P3' that I could confirm) |
| EN | reset: LCD reset and touch reset are tied to it | docs/boards.md | the RST button |

- BOOT button: GPIO0, shared with the backlight gate. It works at runtime only by reading the pin with the LEDC backlight
  **detached** (`gpio_set_direction(0, GPIO_MODE_INPUT)`): the MOSFET gate's pull-down is 10k, the strap's pull-up inside the module
  is weak, so the pin level while the screen is on is the PWM output; pressing the button then pulls the gate low and darkens the
  screen (README: "pressing it while the demo runs darkens the screen"). So it is usable as a button, but each read costs the
  backlight for a moment; do not recommend it for the first demo.
- RGB LED: **none that I could confirm**. The 2.8" Sunton boards have one on 4/16/17, which here are LCD WR/DC/CS, so this board does not
  have it (its LCD is on those pins) [read: preset].
- Battery: JST 1.25 2-pin with a LiPo charger [read: README/boards.md "TF slot, a LiPo charger"]. No GPIO ADC divider found (the openHASP
  config lists `BAT_ADC = 5` as a commented guess [unverified]).
- Connectors: speaker JST, battery JST, TF slot, USB-C; a P1 / expansion header exists on this family but I could not confirm which
  pins it carries here [unverified].

**Recommendation for an LED/button demo**
1. No-hardware version first: the "LED" is the backlight (GPIO0 PWM, already `zinc:device.backlight`) and the "button" is a touch
   region on the screen (CST820, `pointerDown`). This runs today and needs no schematic.
2. External parts: the only outputs with a chance to be free are the TF slot's pins when the card slot is empty. Use **GPIO 23 (MOSI)
   as the LED output** (not a strap pin; LED + 330 ohm to GND on the slot's pad 3 or on the P1 pin if it exists) and **GPIO 19 (MISO)
   as the button input** (internal pull-up, switch to GND). Avoid 5 (strap), 18 (fine, spare), 2/12/15 (straps). Prove with a continuity
   check before connecting: **[unverified]** the pads are reachable. If a header exposes IO35, use it for the button (input only,
   needs an external pull-up). Use 1 mA-class LED current; ESP32 pins source about 20 mA max.

## 6. Recommendation

1. The ROM table forbids runtime registration: native modules are a build-time feature. Say so in the docs.
2. Add to `plugin.json` an `esp32.mqjs` entry (`sources`, `idf`, `defines`, a `table` header, a class count) and let zinc generate `zn_native.c`
   and the user class ids; the TS wrapper and a `sim` stub stay in the plugin.
3. `zinc` builds the firmware with IDF (pinned 5.5.5) into a cache keyed by the native plugin set; no native plugin keeps the 334 KB
   prebuilt image and the fast `js` partition loop.
4. First demo: `plugins/qr` on Nayuki's C library (MIT), run-merged drawing under the 768-command limit, text edited by touch.
5. For Arduino libraries: add `arduino-esp32 ^3.3.x` as an optional IDF dependency of a plugin (`"idf": ["arduino-esp32"]`
   + `idf_component.yml`); tick is already 1000 Hz; measure one build for flash/DRAM before promising anything (no number is measured yet).
6. Zinc as an Arduino/PlatformIO library: vendor the engine, ship the two pregenerated headers (`-m32`), add `__host_call` and
   `__host_on` generic hooks so a sketch needs no generator, and a `zinc arduino-gen` for named APIs.
7. Do not call the API from ISRs or other tasks; queue events and call JS from the frame loop; keep callbacks in `JS_SetUserValue`.
8. Use `-O2` for the engine in Arduino with a pragma; keep exceptions/RTTI off unless a library requires them.
9. For the board demo: LED = backlight, button = touch; external wiring only after checking the vendor schematic PNG (TF pins 23/19 are the candidates).
10. Open facts to settle with one build or one look: the real arduino-esp32 flash/DRAM cost, the Arduino IDE's C++ flags, and the free connector pins of this board.
