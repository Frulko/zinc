# esp32-gpio

An LED that blinks and a button that stops it, on the pins of an ESP32: `zinc:gpio` (setup, write, read, watch) and `zinc:gfx` on the
board's screen. The same program runs on the Mac, where the pins are simulated.

Wiring on the ESP32-2432S022 (its free pins are on the P3 and P4 headers):

| What | Pin | Wiring |
|---|---|---|
| LED | GPIO 26 | LED and a 330 Ω resistor to GND |
| Button | GPIO 35 | button to GND, and a 10 kΩ resistor to 3.3 V (35 has no internal pull-up) |

```sh
zinc run examples/esp32-gpio --target esp32              # on the board (mquickjs, from zinc.json)
zinc run examples/esp32-gpio --target esp32 --emulator   # in esp32sim, no board
zinc run examples/esp32-gpio                             # on the Mac
```

The on-screen button does what the wired one does. The LED pin is set up as an output that reads back its level, which the UART log shows
(`LED on, the pin reads 1`).
