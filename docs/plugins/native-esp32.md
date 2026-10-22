# Native code on the ESP32 (mquickjs)

A C library becomes a TypeScript module on the ESP32 under `--engine mquickjs`, and on the computer, with one C file: a plugin whose
native side is written on Zinc's native ABI (`include/zn/native.h`). `plugins/qrcode` is the worked example.

## The files

```text
plugins/qrcode/
├── plugin.json                 # "targets": { "macos": {...}, "esp32": { "sources": ["vendor/qrcodegen.c"], "idf": [], "defines": [] } }
├── index.ts                    # the module's API in TypeScript, on the native calls
├── native/qrcode.spec.ts       # the native calls: requireNative<Spec>('Qrcode'), machine types (i32, f64, string, u8[]...)
├── native/qrcode.abi.c         # their C, on include/zn/native.h
└── vendor/                     # the library, unmodified, with its licence and PIN
```

`zinc native-gen --c native/qrcode.spec.ts` prints the C side of the spec: one function per call,
`int32_t zn_qrcode_encode(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)`, and the table `ZN_qrcode_EXPORTS`. The `.abi.c` file
implements them, keeps the `ZnHostApi` its `init` receives (for `set_error`, `ret_str`, `ret_buf`), and ends with the module:

```c
static const ZnExport exports[] = {ZN_qrcode_EXPORTS};
const ZnModule *zn_module_Qrcode(void) {
    static const ZnModule m = {ZN_ABI_VERSION, sizeof(ZnModule), "Qrcode", exports, 1, 0, 0, 0, init, 0, 0};
    return &m;
}
```

It includes `zinc_native_qrcode_abi.h` (generated) and its library's headers from the plugin's directory (`"vendor/qrcodegen.h"`).

## What zinc does with it

- **On the computer** (`zinc run`, any engine): `native/<x>.abi.c` is the plugin's implementation when there is no `<x>.host.cpp`; it is
  compiled as C with the plugin's `sources`, with no thunk, and loaded as any plugin.
- **On the ESP32** (`zinc run|export --target esp32`, mquickjs): zinc finds the native modules the program opens (`requireNative`),
  writes their list, and builds the firmware with them using ESP-IDF 5.5.5, installed into `~/.zinc/esp-idf` the first time (about 1.5 GB).
  The build takes a few minutes and is kept in `~/.zinc/esp32/firmware/<key>`; the key covers the firmware and the modules' files, so a change
  of the TypeScript never rebuilds it and the program alone goes to the board in a second. `zinc:native` there is `js/modules/native.js`
  and `main/zn_native.c`, which convert the arguments and results by the export's signature.
- **The check** before anything is sent runs the program under mquickjs on the computer with the same C: `zinc-mqjs` loads the plugin's
  library built for the computer. `zinc check <app> --target esp32 --engine mquickjs` runs it alone.

The plugin's ESP32 settings: `sources` (C or C++ files, compiled with the firmware), `defines`, `idf` (ESP-IDF components the code
`REQUIRES`: `esp_driver_i2c`, `esp_adc`...), `idfComponents` (packages of the ESP Component Registry, written into the generated
component's `idf_component.yml`) and `sdkconfig` (settings such as `CONFIG_X=y`, added after the firmware's defaults). A library written for Arduino (C++ on `Wire`, `SPI`) needs the Arduino core as a component,
which this build does not add yet; a library on ESP-IDF or plain C works as is.

## What is carried

Arguments and results: `string`, `i32`, `u32`, `boolean`, `f64`, `f32`, handles (`h`), and the arrays `u8[]`, `i32[]`, `f64[]`, `string[]`
(an array result is a JavaScript array). Eight arguments at most. Callbacks, promises and resources are not carried under mquickjs yet: a
module that uses them is refused when the program opens it, with the export's name. JavaScript runs on one task: a native function must
not block for long, and must never call back from an interrupt or another task.
