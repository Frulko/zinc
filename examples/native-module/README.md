# native-module

How to call your own native code from Zinc. A native module is a typed spec (`native/sensor.spec.ts`); `zinc build`
generates the C++ interface from it (`zinc_native_sensor.h`), and each target provides one implementation. Calls
from TypeScript are direct C++ virtual calls: no bridge, no serialization.

## Run it

```sh
zinc run examples/native-module                # macOS / Linux: native/sensor.host.cpp
zinc run examples/native-module --target sim   # Node: native/sensor.sim.ts, same behaviour
ZINC_TELEMETRY=udp://127.0.0.1:9999 zinc run examples/native-module & zinc monitor   # watch the exposed value
```

Both runs print the same output. A target without an implementation fails at build time with the file it expects
(`native/sensor.<target>.cpp`), e.g. `native/sensor.esp32.cpp` for an ESP32 driver.

## What to look at

| File | Role |
| --- | --- |
| `native/sensor.spec.ts` | the contract: method signatures with machine types (`f64`), doc comments |
| `native/sensor.host.cpp` | the macOS / Linux implementation of the generated `NativeSensor` class |
| `native/sensor.sim.ts` | the sim implementation, used by `zinc test` and `--target sim` |
| `src/main.ts` | the program: reads the serial and a few temperatures, exposes the value to telemetry, drives the LED |
