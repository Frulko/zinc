# Museum resource lifecycle probe

The museum can now be driven remotely through an explicit `--probe` mode using the existing loopback DevTools
transport. The common `tools/resource-probe` consumes JSON scenarios; `tools/museum-probe` selects
`tools/scenarios/museum.json`. It runs home → model → video → home repeatedly, waits for each fade to complete,
and samples the endpoint's actual process PID. The measurements confirm retained resources after returning
home; this run does not reproduce an ever-growing allocation on every pass.

## Reproduce

From `next/`:

```sh
build/zinc build --bundle examples/museum-table/src/main.ts -o examples/museum-table/build/museum-probe.app
tools/museum-probe --launch examples/museum-table/build/museum-probe.app/Contents/MacOS/zinc --port 19329 --cycles 3 --dwell 2 --output .logs/museum-probe
```

The driver writes `.logs/museum-probe/samples.jsonl` and the launched app's log. It terminates only the app it
launched. `--pid` attaches without closing an existing app; the endpoint reports its own PID and mismatches
are rejected. Captures are optional and disabled for the memory run. The
[museum README](../../examples/museum-table/README.md#remote-lifecycle-diagnostics-zinc-next) describes individual
CDP commands and SSH use. Diagnostic mode disables idle attract/reset and uses wall time even headless;
films, sequence timing and transitions still run. Navigation uses `Player.go`, as ordinary links do, rather
than synthesizing mouse clicks, so this measures view/resource lifetimes without testing button hit geometry.

## Observations, 2026-10-12

Native AOT app, macOS arm64, MacBookPro18,3; real GL renderer and FFmpeg, Retina frame 3840 × 2160. Other sessions
were active and machine load was uncontrolled (a nearby reading was 22.6). These are allocation diagnostics,
not a quiet-machine performance benchmark. Each scene dwelled for two seconds after its transition. Three
cycles took approximately 26 seconds. The raw local JSONL is the evidence for the table below.

| Step | Scene | Native app RSS (MiB) | Runtime live blocks |
|---:|---|---:|---:|
| 0 | ukiyo-e | 347.3 | 2568 |
| 1 | porcelain | 295.4 | 2621 |
| 2 | wave | 323.7 | 2623 |
| 3 | ukiyo-e | 315.0 | 2638 |
| 4 | porcelain | 315.1 | 2626 |
| 5 | wave | 322.3 | 2623 |
| 6 | ukiyo-e | 320.9 | 2638 |
| 7 | porcelain | 320.9 | 2626 |
| 8 | wave | 321.3 | 2623 |
| 9 | ukiyo-e | 321.2 | 2638 |

The scene's native resource counters are stronger evidence than RSS:

| Resource at home | Before visiting | After first cycle | After third cycle |
|---|---:|---:|---:|
| Retained model views | 0 | 1 | 1 |
| 3D meshes | 0 | 1 | 1 |
| 3D render targets | 0 | 1 | 1 |
| Target CPU pixels | 0 | 12,960,000 B | 12,960,000 B |
| Target estimated GPU storage | 0 | 155,520,000 B | 155,520,000 B |
| 3D texture GPU estimate | 0 | 12,582,912 B | 12,582,912 B |
| Video players / allocated output buffers | 0 | 1 / 8,198,400 B | 1 / 8,198,400 B |
| Running video players | 0 | 0 | 0 |
| Open FFmpeg sources | 0 | 2 | 2 |
| 2D replay image textures / GPU estimate | 7 / 31,262,720 B | 10 / 47,502,080 B | 10 / 47,502,080 B |

The 3D target owns its CPU output, resolved color/depth, two PBOs and four-sample MSAA attachments. Its raster
image borrows the CPU output; adding `images.borrowedBytes` to `3d.targets.cpuBytes` would count that memory
twice. Video's five output buffers use 8.20 decimal MB; FFmpeg's internal frames and hardware decoder surfaces
are additional, unmeasured storage. The two source contexts remain open when the film is stopped. glTF
document handles were zero throughout the visit: the museum loads its vase from an OBJ through `viewer.ts`.

Baked images own 75,596,032 B and baked font payloads own 11,611,819 B at startup. The baked blob references
87,353,953 B mapped from the executable separately. No entries were resident in the new asset manager for
this bundled run. These counters connect the earlier binary duplication finding to real live buffers;
mapped-file bytes do not imply that every page is resident in RSS.

The same resource counts recur at home after every pass. Live runtime blocks also recur at 2,638 there.
This supports a retained cache diagnosis for this route, rather than continued growth in those resource
pools. It does not rule out other leaks, longer-running growth, allocator fragmentation, memory compression
or other routes. The owner's 400 → 900 MB observation was not reproduced by the capture-free route here.

A separate visual-control check saved and inspected the actual model and decoded-video frames. Four
full-resolution CDP captures produced 1.5–6.8 MiB PNGs; that separate run's RSS reached 818.6 MiB even though
its tracked media resources stayed unchanged. The capture/encoding/transport path creates large temporary
buffers and byte arrays, and the machine was under uncontrolled load. Do not use those samples as evidence
for the app-only route or infer a precise leak attribution from them. Capture/streaming needs its own memory
budget before using it continuously during profiling.

## What the counters cover

Providers register read-only callbacks behind `include/zn/resource_stats.h`; no plugin names are built into
the frontend, VM or runtime dispatch. The JSON runtime row is appended to preserve earlier bytecode ids.
The hooks are weak and optional for reused prototype native sources. Both Next's TS CDP transport and the
native transport expose the same snapshot; hosts without instrumentation return `{}`.

Snapshots run on the host/render thread, require no GPU readback or `glFinish`, and read allocation metadata.
Only the cross-thread FFmpeg source count uses an atomic; player running state is read under its existing
mutex. `objects` is a live count, `cpuBytes` is owned payload storage, `borrowedBytes` references another owner's
storage, and `gpuBytesEstimate` is requested GL payload storage. `active` counts running players or asset jobs
where applicable. `--remote` reuses the same driver through a forwarded CDP endpoint and omits local RSS.
Missing provider keys mean no instrumented backend registered; a loaded empty backend
reports zero counts. `runtime.blocks.objects` counts live Zinc allocator blocks, not bytes.

This is not total-process memory accounting. Driver alignment/reserves, compositor framebuffers and glyph
atlases, native control structures, allocator capacity, decoder internals, GPU command queues and other
uninstrumented caches are outside these counters. GPU depth storage assumes 32-bit padding and mipmaps use
a 4/3 estimate. Providers have process/module lifetime, register on the host thread and have a fixed 64-slot
table; currently loaded modules are not unloaded.

## Validation and next correction

- `tests/run --only resource_stats`: PASS. Interpreter and AOT image create/destroy; software mesh/target
  destruction, correct borrowed/owned separation; real FFmpeg output buffers and source counts return to zero
  on `Player.close()`.
- `tests/run --tier t1 --only museum_probe`: PASS. Remote scene changes, completed fades, unknown scene/method
  rejection, busy-transition rejection, real native counters, stopped video state and endpoint PID sampling.
- `tests/run --only devtools_port`: PASS. Existing inspector ports and CDP framing remain functional.
- `tests/run --only resource_probe`: PASS. Different demo protocol/state names, initial-state navigation,
  repeated JSON route, remote sampling without local RSS, scenario validation and no attached-app log truncation.
- Native GUI: three cycles without captures, plus a separate model/video screenshot inspection. No cross-platform
  or whole-corpus run. No unloading policy was changed in this diagnostic task.

The smallest next correction is to connect outgoing view ownership to the existing mesh/target/video close
operations after the final transition frame. Immutable shared textures can use counted references and a
byte-bounded idle cache; video output rings and view-sized render targets should normally close when unused.
The [resource lifecycle research](zinc-next-resource-lifecycle.md) explains these policies and primary sources.
The probe now provides a repeatable before/after check: home should shed the relevant native resources,
while successive passes should reach the same post-release state.
