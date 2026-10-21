# esp32-ble: the Mac side

A Mac and an ESP32 that talk over Bluetooth Low Energy, with the [`zinc:ble`](../../docs/plugins/ble.md) plugin. This
app scans, connects by itself to the first device whose name starts with `Zinc`, says `hello from the Mac`, and shows
the conversation: type a message and press Enter or Send. The ESP32 side is `../esp32`.

```sh
zinc run examples/esp32-ble/mac                    # the real radio: run it from iTerm2 or Ghostty the first time (below)
ZINC_NATIVE=sim zinc run examples/esp32-ble/mac    # no ESP32: a simulated "Zinc sim" that sends back what you write
```

**Bluetooth access.** macOS asks once, for the app that started the program: under `zinc run`, the terminal app.
iTerm2 and Ghostty can ask; Terminal.app cannot (it does not declare Bluetooth use, and macOS would end the program),
so the app says "Bluetooth cannot be used" there. `ZINC_BLE_ASK=1` tries anyway. Once allowed, System Settings >
Privacy & Security > Bluetooth lists the terminal app. `zinc export examples/esp32-ble/mac --target macos` makes an
app that asks for itself (`"permissions": ["bluetooth"]` in `zinc.json`).

There is no pairing: any device in range that speaks the Nordic UART Service can connect. Send nothing secret.

## Layout of `src/`

```text
src/
├── main.tsx           # the page (header, devices, conversation, composer) and render()
├── constants.ts       # colours, the device name prefix, the greeting, limits
├── state.ts           # signals: phase, devices, peer, lines, draft
└── services/radio.ts  # zinc:ble: scan, connect, send, the callbacks that update the state
```

Test: `tests/t1/ble.sh` runs this app headless against the simulated peripheral.
