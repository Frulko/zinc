# esp32sim and Espressif QEMU for the mquickjs firmware

Question (owner, 2026-10-21): can https://github.com/mikroverk/esp32sim (Rust, MIT, v0.3.0) let us prove
`zinc run --target esp32 --engine mquickjs` without the ESP32-2432S022C board? Source read from a shallow clone
(commit 51a9154, 2026-10-21). Nothing was built: the load average was 39 (limit 6). Nothing was run.

## Recommendation

Use esp32sim, with option (b): a second display back end in our firmware for the one board esp32sim already
models (LilyGO TTGO T-Display, ST7789 on SPI), chosen at build time. Add a CST820 touch device to that board
model in esp32sim (about 80 lines of Rust, upstreamable). Capture the full 240x320 frame with `--gram-png`.

Why not the others:

- (a) a real ESP32-2432S022 model needs the classic I2S0 in LCD mode with TX DMA. esp32sim has none of it today
  (the classic I2S file is "RX register adapter"; no i80 anywhere in `esp32/src`). It is the right answer for
  upstream later. It is too big and too uncertain for a proof now.
- (c) Espressif QEMU boots our image and prints the console, but it has no panel for the classic ESP32. We could
  never see a frame, so it cannot prove `zinc:gfx`. Keep it for console-only checks.

What this proves and what it does not: the whole path (compile, js partition, boot, mquickjs, render, touch,
frames) runs. The i80 driver itself (about 25 lines, already on the real board) is not exercised.

## 1. Classic ESP32 support in esp32sim

Classic is marked "early" in the README. The `esp32` crate (7,000 lines) loads the ECO3 mask ROM
(`esp32_rev300_rom.elf`) and boots the real bootloader into an unchanged app (`docs/esp32.md`).

| Item | State on classic | Evidence |
|---|---|---|
| ESP-IDF 5.5 app boot | Yes. hello_world built with IDF 5.5.4 matches golden console and interrupt counts. MicroPython 1.29 (IDF 5.5.2) runs, with Wi-Fi and HTTPS | `docs/esp32.md`, test `hello_world_classic` |
| Flash, partition table, MMU | Yes: SPI flash model, flash MMUs, any custom table through `--ptable`. `esp_partition_read` is plain SPI flash reads | `docs/esp32.md` |
| I2C0/1 | Modelled (`I2c::new_classic`, command lists, devices attached by `i2c_devices()` in `esp32/src/bus.rs:317`). Not yet checked with the IDF 5.x `i2c_master` driver on classic: the tests use a register stub only | `bus.rs:750` |
| SPI2/SPI3 + DMA | Modelled, controller-local DMA, CPU and DMA transactions, route by GPIO matrix. Checked with MicroPython `machine.SPI(2)` | `docs/esp32.md`, `esp32/src/spi.rs` |
| GPIO matrix, IO_MUX | Yes (`ChipPins` decodes routes) | `docs/boards.md` |
| Timers, LACT, LEDC, RMT, ADC | Yes. esp_timer runs on the timer groups | `docs/esp32.md` |
| UART | TX goes to the console | `docs/peripherals.md` |
| I2S0/1 | RX only. No TX, no LCD mode, no i80. `peripherals.md` lists I2S TX only for the S3 and says "i8080 LCD mode: not modelled" | `esp32/src/i2s.rs:1`, `docs/peripherals.md` |
| PSRAM, double precision | Not modelled (we need neither) | `docs/esp32.md` |

`docs/peripherals.md` is written for the S3. For classic the per-chip page `docs/esp32.md` is the reference.
Unknown registers are logged with `--log-periph`.

## 2. Boards, touch, capture, loading

- A board is a Rust type that implements `esp_soc::BoardModel` (`docs/boards.md`): GPIO edges, SPI transfers with
  their routes, `i2c_devices()`, `display()`, `touch()`. `make_board(name)` in `esp32/src/board/mod.rs` maps
  `--board`. Classic boards today: `none`, `esp32dev`, `esp32dev-loopback`, `ttgo-tdisplay`.
- TTGO T-Display (`esp32/src/board/tdisplay.rs`): ST7789 on SPI, SCLK 18, MOSI 19, CS 5, D/C 16, RST 23,
  backlight 4. It uses `DcsPanel::st7789()`, a full 240x320 RAM, and shows the 135x240 window at column 52, row
  40. Buttons on GPIO 0 and 35. The I2C header (SDA 21, SCL 22, the same pins as our touch) has nothing attached.
- An i80/I2S panel cannot be attached: the SoC side does not produce parallel bus cycles (section 1).
- CST820: `Cst820` exists, in `esp32s3/src/i2c.rs:149` (address 0x15, point reports, used by the Waveshare
  AMOLED 1.8 V2 board). It is in the S3 crate, so the classic board must either depend on it or it moves to
  `esp-soc`. The T-Display board does not attach it, and its `touch()` does nothing.
- Scripts: `--script F`, one line per action at an emulated time. `3.0 touch 120 160 1`, `3.2 touch 120 160 0`,
  `press boot 150`, `gpio N v`, `serial`, `stop`. The `touch` action reaches `BoardModel::touch_at`.
- Capture: `--tft-png F` writes the visible frame (135x240 for the T-Display). `--gram-png F` writes the raw GRAM,
  here the full 240x320, which is what we want. Both are written at the end of the run.
- Loading: `--bootloader`, `--ptable`, `--app` (three images), or `--flash-image` (a whole dump), and
  `--flash-at 0xOFFSET=FILE` (repeatable) writes a file into flash. The js partition therefore loads with
  `--flash-at 0x110000=<js image>`. No merged image is needed. The 4 MB flash is the classic default.

## 3. Options, scored (RULES.md section 4)

Scores 1 to 5. Weights: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1
(maximum 70). Fit is "can we prove the mquickjs path including the screen and touch". Performance is the speed
of the test run.

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| (a) ESP32-2432S022 board in esp32sim (i80 ST7789 + CST820) | 5 | 2 | 5 | 2 | 5 | 3 | 1 | 49 |
| (b) SPI back end in our firmware for the T-Display board | 4 | 2 | 4 | 4 | 5 | 3 | 4 | 51 |
| (c) Espressif QEMU `esp32` machine | 1 | 4 | 5 | 4 | 5 | 4 | 4 | 49 |

(c) fails the gate: no frame can be seen, so it cannot prove the goal whatever its total. Between (a) and (b),
(b) wins on risk and effort.

Option details:

- (a) Rust to write: I2S0 TX registers, LCD mode bit, TX out-link descriptor walk and EOF interrupt, the GPIO
  matrix outputs for 8 data lines plus WR (signals `I2S0O_DATA_OUT8..15`, `I2S0O_WS`), an i80 byte decoder that
  feeds `DcsPanel` (D/C on a GPIO, CS), a board file, and the Cst820 move. Estimate 800 to 1,200 lines with tests,
  two to four sessions, and a fork until upstream takes it. The result would be the only option that runs the real
  `esp_lcd_new_i80_bus` code. Not proven that the IDF driver would work on the first try (clock setup, FIFO).
- (b) Our firmware work: a `CONFIG_ZN_PANEL_SPI` branch in `main/main.c` that calls `spi_bus_initialize` and
  `esp_lcd_new_panel_io_spi` with the T-Display pins (the ST7789 command set is the same, our init code stays).
  The window offset is 0 in our code, so all 240x320 lands in GRAM, and `--gram-png` shows it. Backlight on GPIO 4
  in this variant. Rust work in esp32sim: attach `Cst820` at I2C0 / 0x15 on pins 21/22 and implement `touch()`
  in `tdisplay.rs`. About 80 lines, one session. If we skip touch at first, the firmware already prints
  "no touch controller" and goes on, so the screen proof can come first.
- (c) Facts: the machine list of Espressif's QEMU (pinned `esp_develop_9.2.2_20260417`, in
  `~/.zinc/toolchains`) has `esp32` and `esp32s3`. The binary contains `esp32.i2s0`, `esp32.i2s1` and a
  `display.esp.rgb` device (`hw/display/esp_rgb.c`). The RGB panel is the S3's LCD_CAM engine; I found nothing
  that gives the classic ESP32 an i80, I2S LCD or SPI panel. Checked with `strings` and `-machine help`, not by
  running an image.

## 4. Practicalities

- This Mac is Apple silicon, not Intel: `uname -m` is arm64, `rustc -vV` host is `aarch64-apple-darwin`, and the
  QEMU in `~/.zinc` is the aarch64 build. The release `esp32sim-0.3.0-macos-arm64.tar.gz` therefore runs here and
  no build is needed. Only an Intel Mac needs a source build (no x86_64 macOS asset).
- Build from source (needed anyway for the Rust change in (b), and for Intel): `cargo build --release -p cli`
  style, workspace of 12 crates, `lto = "fat"`, `codegen-units = 1`. Estimate (not measured) 8 to 20 minutes with
  `-j 2` on this machine. The edition is 2021, no nightly features seen, so the installed toolchain should do.
  Run it in the background, one build only, when `uptime` load is below 6.
- Mask ROM: yes, a download. `tools/fetch-rom-elfs.sh DIR` fetches `esp-rom-elfs` 20260528 (Apache-2.0, Espressif),
  tarball pinned by SHA-256, file `esp32_rev300_rom.elf` sha256
  `920b70635440517866aab2230964a570d2cf2b676658d93c52fbac108c1cca31`. If IDF is installed, the ROMs are found under
  `~/.espressif/tools/esp-rom-elfs/` and `--rom` is not needed. `ESP32SIM_ROM_DIR` sets the directory.
- Licence: esp32sim is MIT (copyright Eriksson, Alice, Fiumara). ROM files Apache-2.0. Nothing is linked into
  zinc; it is a separate tool, as QEMU is.
- Pin and fetch: add a second tool next to `kQemuPins` in `src/tc/tc.cpp`: `Pin {host, file, sha256}` for
  `aarch64-macos`, `x86_64-linux`, `aarch64-linux` from the release `esp32sim-0.3.0-SHA256SUMS.txt` (fetched with
  `gh release download`, hashes copied into the table, not downloaded at run time). `fetchTool` already handles
  `.tar.gz` and a binary path (`esp32sim-*/esp32sim`). `x86_64-macos` has no entry and says so, like the QEMU
  error at `tc.cpp:635`; `ZINC_ESP32SIM` overrides the path. The ROM is a second pinned file with the hash above.
  Activity is high (merged PR the same day as this report), so pin the release, not main.
- Risks: v0.3.0 and "early" classic support; the classic I2C with the IDF `i2c_master` driver and the SPI DMA
  path of `spi_master` under IDF 5.5 are modelled but not shown with those exact drivers. Speed on classic is not
  stated (the JIT is S3 only); mquickjs boot may take real seconds. Use `--max-seconds` as the bound.

## 5. Command lines

Today, nothing boots our firmware to a frame: the i80 panel is unmodelled, and the run would only show the console
(the I2S call may stop the firmware at `esp_lcd_new_i80_bus`; not tried). After (b) (SPI build, called `build-sim/`
here) the commands are:

```sh
# 1. once: the mask ROM and the release
tools/fetch-rom-elfs.sh $ZINC_HOME/esp32sim/roms          # script is inside the esp32sim tarball
# 2. the program image (ZNJS header + bytecode), Node, no flashing
node firmware/esp32-mquickjs/js/build.mjs <entry.ts>      # writes <out>/<name>.img
# 3. boot and capture
ZINC_BACKGROUND=1 esp32sim --chip esp32 --board ttgo-tdisplay --boot rom \
  --rom $ZINC_HOME/esp32sim/roms/esp32_rev300_rom.elf \
  --bootloader build-sim/bootloader/bootloader.bin \
  --ptable build-sim/partition_table/partition-table.bin \
  --app build-sim/zinc-mquickjs.bin \
  --flash-at 0x110000=<out>/<name>.img \
  --script touch.txt --console uart0 --max-seconds 10 --no-dump \
  --gram-png frame.png
```

`touch.txt` (needs the Cst820 change): `5.0 touch 120 160 1`, `5.2 touch 120 160 0`, `8.0 stop`.
The `--flash-at` and `--gram-png` flags and the three-image boot are in `cli/src/lib.rs:124-167`; `--flash-at` is
documented in `docs/cli.md:31`. Not run.

## Next step (one session)

1. Build or fetch esp32sim; run `hello_world` classic from its tree to see the golden console on this machine.
2. Add `CONFIG_ZN_PANEL_SPI` to the firmware; boot with `--board ttgo-tdisplay` and no touch; read `frame.png`.
3. Add `Cst820` to the T-Display board; script a touch; then pin the tool in `src/tc/tc.cpp` and wire
   `zinc run --target esp32 --engine mquickjs` to it.
4. Put a line in `backlog/later.md`: upstream the 2432S022 i80 model (option a) once step 3 works.
