# hello

A first Zinc program: a short console tour in four sections (greetings, a counter, a shopping basket, numbers).
Nothing here is special to Zinc: it is ordinary TypeScript, compiled to C++ and then to a native executable that
prints exactly the same bytes as the reference run on Node.

## Run it

```sh
zinc run examples/hello                   # macOS / Linux executable
zinc run examples/hello --target sim      # Node.js: the reference output
zinc run examples/hello --target esp32    # ESP-IDF firmware in Espressif's QEMU (f32 numbers)
zinc run examples/hello --target ps1      # PS-EXE in PCSX-Redux (Q20.12 fixed point)
zinc run examples/hello --target rpi1     # ARMv6 binary under QEMU
zinc run examples/hello --target rmpp     # reMarkable Paper Pro build, run in its container
```

`scripts/parity.sh` runs it on the sim and natively and diffs the two outputs.

## What to look at

| File | Role |
| --- | --- |
| `src/main.ts` | the tour: one function per section, called in order |
| `src/greeting.ts` | a function and a class with an options interface |
| `src/counter.ts` | a class with private fields, methods and a getter |
| `src/basket.ts` | typed records, `map` / `filter`, a `Map` used as a tally, integer money |
| `src/report.ts` | console helpers: headings and aligned `label  value` lines |

The numbers section shows that number formatting follows JavaScript exactly (`0.1 + 0.2` prints
`0.30000000000000004`); on targets with another number type (f32 on ESP32, fixed point on PS1) the sim run with the
same `--profile` prints the same thing as the device.
