# esp32sim, patched for the ESP32-2432S022C

`zinc run <app> --target esp32 --engine mquickjs --emulator` runs the board's firmware in
[esp32sim](https://github.com/mikroverk/esp32sim) (MIT), the ESP32 emulator chosen in `docs/reports/esp32sim.md`.
Its release 0.3.0 has no model of our board, so zinc builds it from the sources of the tag `v0.3.0`
(commit `964c26c1a6dac335e849195d2cabc15c713015a3`) with `esp32sim-0.3.0-zinc.patch`:

- `Cst820` and `TouchState` move from the S3 crate (`esp32s3/src/i2c.rs`) to `esp-periph/src/i2c.rs`, so the classic ESP32's
  boards can use them; the S3 boards keep them through `esp32s3::i2c`'s re-export, unchanged. `Cst820` gets a `pins` field (the
  SDA and SCL it hangs on, for the classic I2C's routes).
- A classic board, `--board esp32-2432s022-spi` (`esp32/src/board/tdisplay.rs`): the T-Display's wiring with the ESP32-2432S022C's
  240x320 glass (the ST7789's whole RAM) and its CST820 at 0x15 on I2C0, SDA 21 / SCL 22. The real board drives its panel over an
  8-bit i80 bus (I2S0 in LCD mode), which esp32sim does not model; our firmware has an SPI build for it (`-DZN_PANEL=spi`).
  A script's `touch X Y 1|0` and the board UI's pointer reach the CST820.
- A test of the board, and its line in `docs/boards.md`.
- `--web 0` prints the port it bound (`[emu] board UI: http://127.0.0.1:<port>/`), not 0 (`cli/src/lib.rs`).

The live view (`--emulator --live`) uses esp32sim's own board UI: zinc starts it with `--web 0` (a WebSocket on 127.0.0.1 that
streams the panel and takes touches, paced to real time), reads the port from that line and shows the panel in its window.

## How zinc builds it

The first `--emulator` run (and the first after this patch changes) downloads GitHub's archive of the tag (its SHA-256 pinned in
`src/tc/tc.cpp`), applies the patch and runs the user's cargo (`$CARGO`, `cargo` on the PATH or `~/.cargo/bin/cargo`):

```sh
cargo build --release --locked --offline -p esp32sim --bin esp32sim
```

into `~/.zinc/toolchains/esp32sim-<host>-0.3.0-zinc/esp32sim` (`ZINC_HOME`), with the patch's SHA-256 in `PATCH` beside it; the
sources and the objects are deleted after. No crate is downloaded (the workspace has no dependency outside itself). Without cargo,
zinc says to install Rust with rustup. `ZINC_ESP32SIM=<path>` runs another esp32sim instead (it needs this patch's board).

By hand:

```sh
git clone --depth 1 -b v0.3.0 https://github.com/mikroverk/esp32sim && cd esp32sim
patch -p1 < <zinc>/tools/esp32sim/esp32sim-0.3.0-zinc.patch
cargo test -p esp-periph -p esp32 --lib && cargo build --release -p esp32sim --bin esp32sim
```

To change the patch: edit that clone, then `git diff > <zinc>/tools/esp32sim/esp32sim-0.3.0-zinc.patch`.

## Upstream (not opened: the owner's step)

The patch is meant for esp32sim itself. The pull request to open on github.com/mikroverk/esp32sim, from a fork's branch on `main`
(rebased: `main` has moved since 0.3.0):

- Title: `esp32: ESP32-2432S022C stand-in board with its CST820 touch`
- Body: the points above; why a stand-in (no I2S LCD mode on the classic ESP32 yet, `docs/peripherals.md`); the test
  `s022_stand_in_shows_the_whole_ram_and_reports_touches`; that MicroQuickJS firmware with an SPI panel build boots on it and a
  scripted `touch` turns LVGL's pages.

Once it is merged and released, zinc can pin that release again (the binaries of `kEsp32simPins` in the history of `src/tc/tc.cpp`)
and this directory goes.
