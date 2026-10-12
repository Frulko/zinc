# Zinc Next: resume

Overwritten at the end of every session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## State (2026-10-12)

- Owner batch completed: ZN-655 (real macOS WebView), ZN-720 (run/build progress and plugin fallback diagnostics), ZN-721 (standalone museum .app). Commits: `1a6ecb9a`, `9733d0e4`, `57d54780`. Local main only; no push.
- `build/zinc` rebuilt. All engines now announce startup stages on stderr by default; native C++ builds show an elapsed-time spinner, completed jobs and object-cache reuse. `-q` / `ZINC_STEPS=0` suppress progress; JSON remains structured. Failed native plugins warn with their fallback and cause, including cached runs. QuickJS honors `dev.perfHud`.
- WebView actually loads local pages and exchanges messages/RPC in AOT and interpreter. Fixed hosted-C++ compilation, prototype-only asset symbols, lazy window startup, the shadowing weak window-handle stub, and duplicate SDL linkage. QuickJS native callbacks remain unsupported with an explicit error; deterministic simulation opens no page.
- Museum artifacts: `../examples/museum-table/build/museum-table.app`, `.app.zip` (66.82 MB), `museum-table-sizes.json`. macOS arm64, local ad-hoc signature; 15 bundled dylibs. Extracted ZIP launched from `/` for 3 headless frames with no Homebrew library references/loads; strict/deep signature valid. Not notarized or published.
- Size cause: 93.65 MB executable includes 75.60 MB of decoded RGBA images and 11.69 MB of baked glyph tables/bitmaps. The old resource baker duplicates images held in the newer asset packs. Detail: museum README and `docs/reports/zinc-next-perf.md`; a later line records the renderer/pack convergence, no optimization performed.
- Targeted PASS: webview, build_progress, steps, plugin_fallback, verbose_log, run_js_engine, modules, run_cache, run_compiled, perf_hud, package_app, package. Headless p5 HUD, Phaser startup, museum native run and an actual terminal spinner smoke passed. No whole corpus or cross-platform checks.
- Follow-up research: `../docs/reports/zinc-next-resource-lifecycle.md` compares primary engine/framework sources and proposes view scopes over the existing native resource ABI, shared references, bounded idle cache, async cancellation and complete CPU/GPU retirement. Proposal only; no memory fix implemented or new benchmark run.
- ZN-722 Done: `--probe` / generic `tools/resource-probe` (JSON scenarios, remote counter mode; `museum-probe` convenience entry) remotely drive the museum and record native app RSS plus live CPU/GPU resource counters. Three native GUI cycles retain one 3D target (12.96 MB CPU, 155.52 MB GPU estimate) and one stopped video (8.20 MB buffers, two open sources) at home; counts remain stable. PASS resource_stats, resource_probe, museum_probe, devtools_port. Model/video captures inspected separately; captures strongly perturb RSS, disabled for memory runs. No unload policy changed. Report: `../docs/reports/zinc-next-museum-memory-probe.md`; local JSONL: `.logs/museum-probe/samples.jsonl`.
- Owner report: `../docs/reports/zinc-next-assets-outside-binary.md` inventories all 15 baked JPEGs (75.60 MB RGBA from 5.71 MB sources), 58 font variants and the bundle contents; recommends external assets inside Resources/packs, demand loading and view release. Existing capture-free home RSS is 315.0 / 320.9 / 321.2 MiB over three cycles; retained media remain. No optimization or new benchmark in this report. Corrected the earlier glTF note: the museum vase is loaded from OBJ.
- Usage: n/a for this Codex session; tools/usage reads an unrelated Claude transcript.

## Next

`tools/next-task` selects ZN-158 (typed arrays, ArrayBuffer, DataView). No task started by this session beyond the owner's batch.

## Watch out

- Existing worktrees from other sessions remain; respect task claims and the shared build limit. No other session's changes were committed.
- Earlier machine-specific failures, not re-investigated here: tls (ZN-610), macos_window fullscreen readback (ZN-394), macos_vibrancy; system_instance can fail under load (ZN-613). Screen locking can block non-Apple executables in the kernel; leave the development session unlocked for builds/tests.
- Distribution is rebuilt with `build/zinc build --bundle <entry> -o <app>` then `tools/package --app <app>` before Developer ID signing/notarization. The museum's app identity is now declared in zinc.json; source runs with permissions may use the existing macOS dev-bundle path.

## Raspberry Pi session (2026-10-12, a second session, the owner at the Pi)

- hero and museum-table are cross built on the Mac for the Pi 3B+ and run there (`5dd7b278`: the display driver linked into a cross build, a sysroot for plugins that need system libraries in `~/.zinc/sysroots/aarch64-linux`, filled by `tools/device <pi> sysroot`). Recipe, measurements and causes: the 2026-10-12 sections of `../docs/reports/raspberry-pi.md`. Device tool: `tools/device` (status, sysroot, push, run, stop, shot, capture, profile, stacks).
- The Pi now has a supply that holds 1400 MHz (it ran at 600 MHz, under-voltage, for every number taken before 13:56); with no heatsink it reaches the soft temperature limit under the software renderer (1200 MHz). `spark.local` did not resolve after the reboot: `pi@192.168.2.107`.
- ZN-725 (GL replay on GLES 2: a program per mode, edges as strips; D111) is integrated, back in Backlog with criteria 5 to 7 open: navigation 181 to 25 ms on the GPU against 19 ms for the software bands, at a fifth of the CPU. Open points are lines of `backlog/later.md` under "Cross-platform pass".
- Touch: a tap that lands and lifts between two polls is kept (`2ad9f0f5`, display-fbdev); two fingers over an onWheel node arrive as a trackpad pinch (`a3e0952a`, lib/std/ui.ts). display-gl's own input code (`plugins/display-gl/src/kms.cpp`) has neither the tap latch nor been checked for it.
- ZN-726 (text under a scaling matrix, and museum-table's cards) is with a worktree agent, claimed; integrate its branch when it reports.
- Not done, asked by the owner: a touch calibration tool (the screen reports 0..799 x 0..479 and the mapping is 1:1, so wait for the owner's verdict after the tap fix); the map as a GPU layer under a software UI (a line of later.md).
