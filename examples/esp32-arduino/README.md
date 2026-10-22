# esp32-arduino

A C++ sketch on Arduino's core, in a TypeScript program on the ESP32. The project's own plugin, `plugins/sketch`, is the sketch: its
`setup()` starts Arduino's core and counts the boots with `Preferences`, its `loop()` runs once per frame, and TypeScript reads what it
keeps through `zinc:sketch`. The screen shows the boot count, `millis()`, how often `loop()` runs, `ESP.getFreeHeap()` and the chip.

```sh
zinc run examples/esp32-arduino --target esp32   # the first time, zinc builds the firmware with Arduino's core (ESP-IDF, several minutes)
zinc run examples/esp32-arduino                  # the same file on the computer, without Arduino
```

## How the sketch gets in

```text
plugins/sketch/
├── plugin.json              # esp32: "idfComponents": {"espressif/arduino-esp32": "^3.3.0"}, "sdkconfig": ["CONFIG_AUTOSTART_ARDUINO=n"]
├── index.ts                 # zinc:sketch, the functions TypeScript calls
├── native/sketch.spec.ts    # the native calls and their types
└── native/sketch.abi.cpp    # the sketch: C++ on Arduino.h, on Zinc's native ABI
```

- `idfComponents` adds Arduino's core to the firmware as an ESP-IDF component; ESP-IDF downloads it from the Component Registry.
- `CONFIG_AUTOSTART_ARDUINO=n` keeps the firmware's own `app_main`: Arduino starts when the sketch calls `initArduino()` in `setup()`.
- The module's `init` is the sketch's `setup()`, its `poll` its `loop()`. `loop()` runs between two frames of the program, on the
  JavaScript task: it must return quickly (no `delay()` of more than a few milliseconds), as a TypeScript frame does.
- `verifyRollbackLater()` returns true: the firmware marks a new image valid itself, once a program runs, not Arduino's start.
- `Serial` is the console zinc reads: write to it with `printf`, or `console.log` from TypeScript; never `Serial.begin()` at another speed.
- Any Arduino library goes the same way: its files in the plugin's `sources`, or its package in `idfComponents`.

On the computer `ARDUINO` is not defined, and the same file answers with the computer's values.
More: [docs/plugins/native-esp32.md](../../docs/plugins/native-esp32.md).
