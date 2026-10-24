# Shard C: profiles, targets, simulators and performance (56 tasks)

Milestones m-11 (profiles, targets, simulators), m-12 (hardening) and m-21 (performance). Result data: `shard-C.json`.

## Counts per verdict

| verdict | n | tasks |
|---|---|---|
| review-close | 10 | 121, 124, 125, 126, 131, 132, 136, 147, 714, 731 |
| park | 17 | 133, 134, 137, 156, 207-216, 218, 219, 412.07 |
| keep | 13 | 416, 419, 423, 562.04, 563.01-.03, 590.03, 592.04, 596, 597, 601, 724 |
| rewrite | 4 | 145, 221, 589.01, 713 |
| done-partly | 4 | 611, 725, 744, 746 |
| merge | 3 | 157 into 156, 414.01 into 133, 592.02 into 589.01 |
| drop | 3 | 217, 220, 222 |
| split | 2 | 418, 723 |

Six tasks carry an assignee (713, 714, 725, 731, 744, 746). It is `@parallel` from 2026-10-11/16 sessions that have finished, so the marks are stale; the coordinator should still leave them alone or clear them on purpose.

## Notable findings

- **The development machine is an Apple M1 Pro now** (`sysctl`: Apple M1 Pro, 10 cores), while AGENTS.md still says Intel Mac. ZN-589.01 and ZN-592.02 ("re-measure on Apple Silicon") can be done today, and I merged them into one S task. ZN-713 (Electron/Tauri numbers) was taken on the Intel Mac under load and should be retaken on this machine. ZN-611 (Intel Espressif QEMU) is already fixed by commit 1f525337 and no longer matters here.
- **Ten Review tasks are finished work**: each was held open by one criterion that needs a rig, IDF, Linux qemu-user or a follow-up that already has its own task (ZN-313 for the device-sim frame hash). Close them done. ZN-714 (Windows first step) is overtaken: a native `package-windows` CI job, `tools/windows-setup.ps1` and `docs/targets/windows.md` exist. ZN-731 (zero-copy video on the Pi) met its purpose: 3.5-4.8 ms of CPU per picture instead of 37, no dropped picture over 69 s.
- **The bare-metal Pi chain (ZN-207 to 222, 16 tasks)** has no code (`firmware/rpi` does not exist). The Pi OS image, the device agent and `zinc device deploy` shipped since and serve makers on the Pi; the bare-metal core only buys boot time and drags a GPLv3 question (Circle). I parked the chain and dropped three speculative tails (multicore raster, Pi 5, PIC blob loader). ZN-221 (`zinc repl`) is the one useful idea in it: no repl exists; re-aim it at device-sim and the agent.
- **PS1/PS2** (137, 156, 157, 145 originally) stay parked; 157 folds into 156. ZN-145 (4-byte references on 32-bit targets) is rewritten so it can be proven on wasm32 and the 3DS/PSP emulators instead of qemu-user.
- **Performance tasks measured as not paying**: none are dropped on that ground, but ZN-725 (Pi GLES2 fast path) ended with D111 keeping the `cpu` renderer on GLES 2 because the fbdev bands are faster except for navigation. Its remainder (and the three other Pi GLES2 checks, 562.04, 563.02, 590.03) is one Pi session with a doubtful payoff. ZN-744 and ZN-746 are done except the Nexus 7 60 fps goal, which Tegra 3 memory bandwidth blocks. ZN-423 (LTO) is cheap to try but PGO gave -1 percent (D54), so expect little.
- **Duplicates**: ZN-414.01 and ZN-133 both need the same qemu-user runner (merged). ZN-586 (JSC/JIT spike, another shard) overlaps ZN-724 and is superseded by D110; merge it into 724. ZN-419 depends on ZN-194/195 (pixel-format template), which sit in another shard.
- `tests/t0/fuzz_regress.sh` fails today on its void-call check: the run banner on stderr is captured in the compared output. The fix is in the test, not in the engine (the duplicate-names crash of ZN-147 is fixed and refused cleanly).

## The ten that matter most (Mac lane, by value)

1. **ZN-724**: measure Longbridge's quickjs-jit and record the decision against D110; it gates all JS-library speed work and ZN-723.
2. **ZN-601**: write the QuickJS binding rules and add the boundary micro-benchmark gate; S, fully provable here, protects every plugin.
3. **ZN-596**: typed fast native calls for QuickJS (patch queue entry; the upstream PR is an owner step).
4. **ZN-597**: native accelerators for three.js math (-24 percent frame measured); after 596.
5. **ZN-418** (split): packed numeric arrays and narrow fields; biggest memory win for every target, deep change so cut into four parts.
6. **ZN-723** (split): the QuickJS bytecode compiler, after the 724 verdict.
7. **ZN-563.03**: zinc:3d on WebGL2, provable on the Mac with headless Chrome.
8. **ZN-589.01** (merged with 592.02): Apple Silicon shadow and launch re-measure, S and immediate.
9. **ZN-713**: retake the Electron/Tauri table alone on the M1 Pro; the "no browser" claim needs clean numbers.
10. **ZN-221**: `zinc repl` for devices, a maker and education feature that does not exist.

Cross-pass items worth doing in order: ZN-592.04 and ZN-563.01 (Linux), then the single Pi session (562.04, 563.02, 590.03, 416, 419).

## Surprises

- AGENTS.md describes an Intel Mac; the machine is arm64.
- Windows has a real native CI job already, so the cross-build step ZN-714 is history.
- Several "Review" tasks were left open for months by a single hardware criterion; the same pattern probably repeats in other shards.
