# 0011 — Target variants for built-in native modules (esp32, rpi1)

**Context.** `MODULE_TARGETS` (0010) gated `storage`, `fs`, `net`, `gpio` off esp32 because only the
host/sim implementation (`runtime/mod/<name>.cpp`) existed. `gpio` on linux/rpi1 only had the
simulator, never real hardware.

**Choice.** One implementation file per target variant, selected by file name, not by `#ifdef` inside
a shared file, so hosts and cross targets stay decoupled:

- `runtime/mod/<name>_esp32.cpp` — used by `espBuild` (`compiler/src/cli.ts`) instead of
  `runtime/mod/<name>.cpp` when it exists. Added: `storage_esp32.cpp` (NVS, namespace `"zinc"`),
  `fs_esp32.cpp` (POSIX calls against a SPIFFS partition mounted at `/zinc`; since merged into `fs.cpp` under
  `ESP_PLATFORM`, the calls being the same), `net_esp32.cpp`
  (`fetch` via `esp_http_client`; `serve`/`stop` are a stub, see below), `gpio_esp32.cpp`
  (`driver/gpio`, ISR → queue → `Poller`). `MODULE_TARGETS` now lists `esp32` for all four, plus
  the already-working `osc`/`mqtt`/`telemetry` (POSIX sockets over lwIP — no source changes were
  needed, only `REQUIRES lwip`/`esp_event` in the generated `idf/main/CMakeLists.txt`).
- `runtime/mod/gpio_linux.cpp` — used by `cmakeLists()` (`compiler/src/cli.ts`) for `linux`/`rpi1`
  instead of `gpio.cpp` only when the `ZRT_GPIOD` environment variable is set at `zinc build` time
  (which also adds `-DZRT_GPIOD` to the C++ build and links `libgpiod` via `pkg-config`). Without
  it, and on macOS always, the simulator in `gpio.cpp` stays the default — unchanged.

**fs on esp32: SPIFFS, not the `esp_littlefs` managed component.** The managed component is
fetched from the ESP Component Registry the first time `idf.py build` runs, which the Docker/QEMU
build path used here (`docker run espressif/idf:v6.0 idf.py build`, no persistent component cache)
can't rely on being reachable. SPIFFS ships in-tree with ESP-IDF, needs no fetch, and is good
enough for the file API zinc exposes (`readText`/`writeText`/`list`/`remove`; `mkdir` is a
documented no-op — SPIFFS has no real directory entries, the slash-containing path *is* the
filename). `espBuild` writes a custom `partitions.csv` (nvs + phy_init + factory app, matching
IDF's default single-app table, plus a 512 KiB `storage` partition) only when `fs` is used;
`storage` (NVS) alone fits inside IDF's default table, no custom partitions needed.

**net on esp32: fetch only, on a FreeRTOS task.** `esp_http_client_perform` blocks, so `fetch()`
runs it on its own task instead of stalling the event loop. NAT-07 says native threads must never
touch the Zinc heap; `net_esp32.cpp` copies every request field into plain `malloc`'d C buffers
before starting the task, accumulates the response body into a `malloc`'d buffer from the
`esp_http_client` event callback, and hands the result back to the main task as a pointer on a
`QueueHandle_t` — FreeRTOS queues are internally lock-protected, so this is the "mutex-protected
queue drained by a `Poller`" the task called for, without a hand-rolled mutex. Building the
`Ref<Response>` and resolving/rejecting the promise happen only in `Fetcher::poll()`, on the main
task. `net.serve`/`net.stop` are an honest stub (`g_err` set on `serve`) — no conformance program
needs a listening HTTP server on esp32 and QEMU has no network to test one against; build on
`esp_http_server` when a real use case shows up.

WiFi isn't available in Espressif's QEMU (no radio), so there is no separate "is the network up"
check to write: with no station connected, `esp_http_client_perform` simply fails and `fetch()`
rejects with that reason. To join a real network on hardware, `zinc.json` takes
`targets.esp32.wifi = { ssid, password }`; `espBuild` turns that into
`ZINC_WIFI_SSID`/`ZINC_WIFI_PASSWORD` compile defines. Actual `esp_wifi` station bring-up is not
implemented — it can't be exercised in QEMU, and wiring it up untested against a stub would just
be unverified code; the defines are threaded through so that work has a well-defined seam.

**gpio on esp32.** `driver/gpio` for setup/write/read; edges use `gpio_install_isr_service` +
`gpio_isr_handler_add`, with the ISR handler only pushing a `{pin, value}` struct onto a
`QueueHandle_t` (ISR context must not touch the Zinc heap either). `PinEdge` objects, edge
matching and software debounce run in `Poller::poll()` on the main task, using the exact same
logic as `gpio.cpp`'s simulator. `simulate()` calls that same delivery path directly, bypassing
hardware, so it works headless under QEMU (no GPIO chip emulation) — this is what
`tests/conformance/modules_esp32.ts` exercises.

**gpio on linux/rpi1 (`ZRT_GPIOD`).** `gpio_linux.cpp` uses libgpiod: Alpine 3.20 (`sdk-rpi1`)
ships libgpiod 1.6, so this is the v1 API (`gpiod_chip_open_by_name`, `gpiod_line_request_*_flags`,
`gpiod_line_event_read`); the file also has a v2 code path behind `#ifdef` (detected by the
`GPIOD_LINE_VALUE_ACTIVE` enum constant v2 headers define) for a future Alpine bump, but only the
v1 path has been compiled and run. At first use it checks for `/dev/gpiochip0`; if absent (every
Docker/QEMU build here — rpi1 can't be exercised in QEMU without GPIO chip passthrough) it prints
one warning to stderr and falls back to `gpio.cpp`'s simulator logic (duplicated in this file, not
shared, to keep the two translation units independent — `gpio.cpp` stays the sole default when
`ZRT_GPIOD` isn't set). `docker/sdk-rpi1/Dockerfile` adds `libgpiod-dev` and `pkgconf`;
`cmakeLists()` links `libgpiod` via `pkg_check_modules` only when `gpio_linux.cpp` is selected.

**Verified in QEMU/docker (this session, `espressif/idf:v6.0` and a rebuilt `zinc/sdk-rpi1` with
`libgpiod-dev`, both already available locally):**
- `zinc build --target esp32 tests/conformance/modules_esp32.ts` compiles and links (REQUIRES:
  `nvs_flash`, `spiffs`, `esp_http_client`, `esp_driver_gpio`, `lwip`, `esp_timer`, resolved from
  the modules actually used).
- `zinc run --target esp32 tests/conformance/modules_esp32.ts` in Espressif's QEMU: output is
  byte-for-byte identical to `zinc run --target sim --profile esp32` (`tests/conformance/modules_esp32.f32.out`)
  — storage (NVS set/get/remove), fs (SPIFFS mkdir/write/append/read/list/remove/ENOENT), events,
  and `gpio.simulate` all confirmed working on real ESP-IDF v6.0 in QEMU. First mount formats the
  blank SPIFFS partition and IDF logs a `W (...) SPIFFS: mount failed, ... formatting...` line;
  `sdkconfig.defaults` now sets `CONFIG_LOG_DEFAULT_LEVEL_ERROR=y` so component log noise never
  lands on the UART stream zinc's own output is compared against.
- `ZRT_GPIOD=1 zinc build --target rpi1 tests/conformance/modules_esp32.ts`: full cross-compile
  and link against Alpine's real libgpiod 1.6 headers/lib succeeds (`gpio_linux.cpp` selected,
  `-DZRT_GPIOD` set, `PkgConfig::GPIOD` linked).
- `ZRT_GPIOD=1 zinc run --target rpi1 tests/conformance/modules_esp32.ts` under QEMU (no
  `/dev/gpiochip0` in the container): prints the fallback warning on stderr and produces the same
  byte-for-byte output as the sim oracle — confirms the fallback path, not real hardware.
- `zinc build --target rpi1` **without** `ZRT_GPIOD` still selects plain `gpio.cpp`
  (unaffected/unchanged) and matches too.
- `node compiler/bin/zinc.mjs test` (macOS host, sim + macos native): all 10 conformance programs
  pass, including the added `modules_esp32.ts`.

**Not verified (no hardware, cannot be verified in QEMU):** real GPIO edges on rpi1 through
libgpiod against an actual `/dev/gpiochip0` (`gpio_linux.cpp`'s v1 code path is exercised for the
absent-chip branch only), esp32 `driver/gpio` against real silicon (QEMU has no dedicated-GPIO
emulation beyond level get/set), the libgpiod v2 `#ifdef` branch (Alpine 3.20 ships v1), fetch
against a live WiFi network / real HTTP server (QEMU esp32 has no WiFi radio), and `esp_wifi`
station bring-up (not implemented, see above).
