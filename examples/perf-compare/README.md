# perf-compare

The same four screens in Zinc and Flutter, plus the scripts that measure them. Report: `docs/reports/perf-comparison-2026-10.md`.

Screens (`ZINC_DEMO=` for Zinc, `PC_DEMO=` for Flutter): `hello` (one centred text), `list` (1000 rows, scrolled 40 px
per frame, down 200 frames and back), `anim` (a counter and a bar updated every frame), `input` (a text field that
receives one character per frame).

## Reproduce

```sh
# Zinc: AOT executable (about 5 MB)
tools/build zinc && build/zinc build examples/perf-compare/zinc -o /tmp/pc-zinc

# Flutter: SDK unpacked anywhere, a macOS shell around flutter/lib/main.dart
flutter create --platforms=macos --project-name pc_flutter /tmp/pc-flutter
cp examples/perf-compare/flutter/lib/main.dart /tmp/pc-flutter/lib/ && (cd /tmp/pc-flutter && flutter build macos --release)

# Measure (one at a time, waits for the 1-minute load average to go under 4)
examples/perf-compare/run.sh zinc-aot /tmp/pc-zinc            # start_ms, rss_mb, cpu_pct per screen
examples/perf-compare/frames.sh zinc /tmp/pc-zinc             # per-frame CPU work
examples/perf-compare/run.sh flutter /tmp/pc-flutter/build/macos/Build/Products/Release/pc_flutter.app/Contents/MacOS/pc_flutter
examples/perf-compare/frames.sh flutter <same executable>
```

`measure.py` needs python3 with `Quartz` (pyobjc). It launches the app 5 times for the cold start (launch until the
process owns a window larger than 100 px), then once for 10 s and samples RSS and CPU of the process tree with `ps`
over the second half. Run it on a quiet machine: check `uptime` first.
