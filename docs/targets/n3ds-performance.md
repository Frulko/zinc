# Capturing 3DS frame pacing

Use complete display refreshes, not eye callbacks or just the game's update callback. The two eyes and the
bottom window share one refresh. A 3DS refresh is about 16.715 ms (nominal 60 Hz).

Build a playable capture without a frame limit or scripted inputs:

```sh
tools/build-console-core n3ds --aot examples/n3ds-pinball \
  --env ZINC_PROFILE=defer --env ZINC_FRAME_CAPTURE=1 \
  --title 'Nova Patrol DS 0.2.3' -B build/n3ds-pinball-profile
```

Play normally, including the situation that stutters. Hold START and SELECT together to return to the
Homebrew Launcher. This orderly exit saves `zinc-frames.csv` at the root of the SD card; powering off
before exit loses the in-memory capture. The file contains the latest 3600 refreshes (about one minute).
A later capture replaces it. Copy a capture before another profiling session if it must be retained.

```sh
tools/n3ds-frame-report /Volumes/DS/zinc-frames.csv --source hardware --gate
```

The report is JSON. It distinguishes flat/stereo modes and reports frame gaps, CPU time excluding the
GPU/vblank wait, physics, draw-command recording, command comparison, GPU validation/replay, texture
uploads, submission/cache maintenance, the previous refresh's GPU execution time, runtime allocations,
software fallbacks and missed vblanks. Times are microseconds. `previous_gpu_us` includes the previous
queue's display transfers, not the current frame; nested upload/validation/replay measurements must not
be added to the runtime phase totals. Allocations count Zinc runtime objects/storage, not every Box2D or
SDK allocation. The capture header identifies the model reported by libctru and overwritten ring rows.

The gate skips the initial 120 refreshes, rejects missed refreshes/vblanks and software fallback, and
requires CPU p99 at most 15 ms. Ring captures that start later do not discard another warm-up period.
A pass proves only the captured session. `--source emulator` explicitly labels Azahar measurements;
they do not establish physical cache-maintenance cost or real-device performance.

No per-frame file writes or allocations are made by the capture itself. `ZINC_PROFILE=defer` suppresses
periodic game sample sorting/logging; native phase rings remain active and normal log flushing is deferred
to shutdown. The raw CSV is written after gameplay stops. The profiler can be reused by other 3DS demos.

For a reproducible three-ball scenario, replace the entry with
`examples/n3ds-pinball/tools/multiball.ts`, add `--frames 3600` and `--env ZINC_3D_SLIDER=0` or `1` in a
separate build directory. Serialize Azahar runs with `/tmp/zinc-azahar.lock` and copy its SD capture before
releasing the lock. `n3ds_frame_profile` tests eye aggregation, allocation deltas, ring rollover and the gate;
`physics2d_bulk` proves packed native snapshots match the previous protocol exactly.
