# esp32-ble: the board's side

The ESP32 half of a Mac and an ESP32 that talk over Bluetooth Low Energy, with `zinc:ble`, the same API as the Mac's side (`../mac`). The
board advertises `Zinc e3d8` (its name) with the Nordic UART Service, says hello when the Mac connects, answers each message, and drives an
LED on GPIO 26 when the Mac sends `led on` or `led off`; the button on the screen sends `press N` to the Mac.

```sh
zinc run examples/esp32-ble/esp32 --target esp32   # the board (the network firmware is written the first time)
zinc run examples/esp32-ble/mac                    # then the Mac: it connects to the first "Zinc" device it finds
```

Any phone app that speaks the Nordic UART Service (nRF Connect, Serial Bluetooth Terminal) can talk to the board too. One link at a time,
no pairing: send nothing secret. The LED wiring is the one of `examples/esp32-gpio`.
