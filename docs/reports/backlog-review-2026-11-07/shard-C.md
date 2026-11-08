# Shard C: handhelds (M23), NTC CHIP (M24), Raspberry Pi SDK (M25)

66 tasks. Verdicts: 52 park, 9 keep, 5 rewrite, 0 done, 0 drop, 0 merge, 0 split. None is assigned.

## Findings

- The shard is almost all cross-platform or board work. The owner's priority is the Mac, so 52 tasks are parked (label `parked` or the cross pass): the handheld 3D demos and renderers (ZN-487 to ZN-511), the CHIP board tasks (ZN-514 to ZN-532), and the Pi hardware tasks.
- Nothing is already done. ZN-489 (cooker) is mostly built (`zinc assets cook`, `tests/t0/cook.sh`) but three criteria still have no test. That is a short Mac task.
- ZN-493 has status Review but cannot be proven: Vita3K stubs the GXM memory calls. It needs the owner's Vita. Set it to Backlog with `parked`.
- Real overlap: ZN-544 and ZN-497 both want a GLES2 cooked-pack renderer (parked together). ZN-541 is an epic with three subtasks (541.01 to 541.03) and is never handed out. ZN-550 already carries ZN-518. ZN-555 carries ZN-533 and ZN-651. ZN-486 carries ZN-463/464/465.
- `third_party/three` holds r186 only. ZN-540 (vendor r162) is the real prerequisite of ZN-541.x, ZN-534 and ZN-545.
- I did not grep the other shards for duplicates beyond the notes already in the task files.

## The ten that matter most (Mac, finishable)

1. ZN-547: per-frame draw/pass/upload counters and a budget warning in the perf overlay. Useful on every machine.
2. ZN-550: `zinc:i2c` and `zinc:spi` over hw.h with sim models. The backends exist, the module API does not.
3. ZN-489: add the three missing tests to `tests/t0/cook.sh`. Small, closes a reopened task.
4. ZN-540: vendor three r162 and select it for WebGL1. Unblocks four tasks.
5. ZN-535: Pi/board identity decoder tested with fixture trees, then `zinc doctor`.
6. ZN-549: GPIO uAPI v2 sim backend and `zinc:gpio` API (Linux backend verified in the cross pass).
7. ZN-538: a VC4 limits profile for libzn_webgl, as a clamp the Mac can test.
8. ZN-539: instancing and 32-bit index emulation, forced on the Mac GL.
9. ZN-541.02: split geometries over 65535 vertices and warm-up, pure TS.
10. ZN-513: capabilities rows, a T0 table test and `docs/targets/chip.md`.

ZN-512 is a one-line change (`+neon` at `src/tc/tc.cpp:199`), but its proof waits for the cross pass.

## Surprises

- The handheld milestones hold 25 demo/renderer tasks with no user in sight. They stay parked until the cross pass reaches handhelds.
