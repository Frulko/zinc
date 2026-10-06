# Zinc Next: profiling tools

Four tools, all running on the interpreter or on any process, with output in formats other tools already read.

## CPU: `zinc profile`

```
zinc profile prog.ts [--hz 1000] [--speedscope out.json] [--folded out.folded]
```

Runs the program in the interpreter and samples the call stack on a CPU-time timer (`SIGPROF`). The signal handler only copies function
indices into memory reserved before the run, so the program is not slowed down by more than the timer. The report on stdout lists the
functions by self time (self and total, in percent and milliseconds); the program's own output goes to stderr.

- `--speedscope`: a sampled profile of the speedscope file format. Open it at <https://www.speedscope.app> (time order, left heavy, sandwich).
  Default `zinc.speedscope.json`.
- `--folded`: collapsed stacks (`main;f;g 42`), for `flamegraph.pl`, `inferno` or `pprof` converters.

The optimiser inlines small functions (`ZN_NO_OPT=1` keeps the structure of the source). Native (AOT) programs are measured with the
system's tools (`sample`, `perf`, Instruments); `tools/resmon` covers their CPU and memory over a run.

## Memory: `zinc mem`

```
zinc mem prog.ts [--json] [--check-leaks]
```

Counts objects and reference-counting traffic: allocations and frees, peak live objects, bytes of objects (header, fields, string bytes),
the capacity of array and Map storage when they die (survivors counted at exit), retains and releases, the process peak RSS, and a table
per class with what is still alive at exit. `--check-leaks` exits with 4 when objects are left, and is what `tests/t1/rc.sh` uses.
The counters are off unless this command asks for them.

## Frames of a UI app

The runtime's own profiler is wired into `zinc:gfx` (`profiling()`, `profMark()`, the end of the run). Headless:

```
ZINC_DETERMINISTIC=1 ZINC_FRAMES=300 ZINC_PROFILE=1 ZINC_TRACE=frames.json zinc run app.tsx
```

`ZINC_PROFILE=1` prints, on stderr, p50, p99 and max of the frame work and of each phase (app, input, anim, layout, paint, effects, diff,
raster, present). `ZINC_TRACE=file.json` writes a Chrome trace event file that Perfetto (<https://ui.perfetto.dev>) and
`chrome://tracing` open: one row per phase and per raster band. The virtual clock does not change what is measured: times are real.

## Process: `tools/resmon`

```
tools/resmon [--interval 0.05] [--energy] [--no-samples] -- command args...
```

Prints a JSON object: wall, user and system time and the peak RSS (from the kernel's accounting of the child), plus RSS and CPU
percent over time (`ps`, any POSIX host). With `--energy`: Intel RAPL on Linux, `sudo -n powermetrics` on macOS; when the host does
not offer one, `energy_mj` is null and `energy_note` says why. On the Pi rig a power meter reading would be added next to this.

`tools/bench-m4` records user time, system time and peak RSS of one extra run per kernel and engine in `bench/m4.json`, and compares
every median time and peak RSS with the numbers committed at `HEAD` (or `--baseline file`): more than 15 percent worse (`--tolerance`)
is listed under "Regressions" in the report, and `--check-regressions` makes the exit code 3.

## Not covered yet

Exact instruction counts per function (a counting interpreter), per-allocation sites, GPU and I/O, and energy on the Pi rig and the
ESP32 (needs the power meter).
