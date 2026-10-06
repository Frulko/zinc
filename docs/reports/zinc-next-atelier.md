# Zinc Atelier (ZN-050)

The desktop app of Zinc, written in Zinc on `zinc:ui` (Solid signals, JSX) and run by the engine it drives:

```
zinc run app/atelier/main.tsx -- <project dir>
```

| Piece | What it does |
|---|---|
| Project browser | the `.ts`/`.tsx` files of the project, three levels deep (`model.ts: projectFiles`) |
| Editor | a `<TextArea>`; **Save** writes the file |
| Check | `zinc check --check <file>`; the diagnostics fill the **Problems** tab (`parseDiagnostics`) |
| Run / Stop | `zinc run <file>` as a child process (a window for a graphics app); its output streams into **Output** |
| ESP32 (emulated) | `zinc run <file> --target esp32 --qemu`: the same program on the emulated board (needs the emulator, downloaded on first use) |
| Profile | `zinc profile <file> --folded ...`; the **Profile** tab lists the functions with the most self samples |
| Frames | `ZINC_ATELIER_TRACE=<file>` loads a `ZINC_TRACE` file (Chrome trace events); the tab shows the time per phase |

The app starts `zinc` through `zinc:process` (new host module: `spawn`, `read`, `status`, `kill` over `sh -c`, stdout and stderr merged, non-blocking
reads polled once per frame). `ZINC_BIN` (set by `zinc` itself to its own path) tells the app which binary to start; `ZINC_SIZE=WxH` sets the window
size.

## Limits and lessons

- A program that uses `any` or `JSON.parse` cannot use `zinc:ui` (Dyn's `undefined` differs from null, and the std library uses `undefined` as null), so the
  trace view scans the text instead of parsing JSON.
- The kit's props (`<Button label=... variant=...>`) are read once; importing `Button` from `zinc:ui/kit` also hides the host `<Button>`. The app uses the host
  elements for everything that follows a signal (tabs, file rows, status).
- Not yet: a flame graph (the Profile tab is a table of bars), serial ports and flashing a real board (the CLI has `zinc flash`), settings.

## Tests

`tests/t0/atelier.sh` (model), `tests/t1/atelier.sh` (pixel goldens of the check, run and frames flows, and edit + save), `tests/t2/atelier_esp32.sh`.
