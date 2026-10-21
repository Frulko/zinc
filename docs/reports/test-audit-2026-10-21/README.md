# Test audit, 2026-10-21 (owner request: a CI of quality, no duplicates, nothing a runner cannot prove)

Basis: the 543 scripts of `tests/t0..t2`, read one by one (g1 to g5 in this folder, one row per test with file:line evidence), and the results of the
last full release run (v0.4.2: 510 PASS, 32 SKIP, 6203 s of test time over 6 shards).

## Done

- **`tests/run --only <name>` looked only in T0.** Every `--only` of a T1 or T2 test without `--tier` ran nothing and printed `0 passed, 0 failed`:
  the package job's smoke test of the release archive never ran, nor did the task-end checks AGENTS.md describes. `--only` alone now looks in every
  tier, and a name that matches nothing exits 2.
- **Package tests run once, on the real archive.** `install_nocompiler` (123 s) and `t2/package` (148 s) rebuilt the archive in a test shard; on CI
  they now skip there and run in the package job against `dist/`.
- **Tests that passed on CI without proving anything** now skip (exit 77) or get what they need:
  `wasm`, `layout_fuzz`, `wasm_browser` (exit 0 without node or Chrome); `build_inputs_tracked` (a fresh clone is tracked by construction);
  the runners install `ffmpeg`, `libgphoto2`, `jpeg-turbo`, `openssl@3`, `jsonschema` and python-tuf, so `video` (real decode instead of the fake
  player), `camera`, `camera_pixels`, `museum_probe`, the museum's video halves, `tls`, `netlog`, `sbom` and `tuf_interop` run for real.
- **Fake "compiled" passes removed.** Headless or deterministic, `zinc run` interprets (`runcache::wanted`, src/main.cpp): the second pass of
  `museum_mode`, `museum_table`, `museum_viewer`, `solid_props` and the "compiled" checks of `museum_theme`, `museum_access`, `museum_stats`,
  `museum_video`, `museum_zoom` ran the interpreter again. `museum_visit` keeps one real `--native` run.
- **Merged:** the six copy-pasted `macos_{menu,dock,tray,shortcut,dialog,popup}` into `macos_selftests`; `webgl_js`, `webgl2_js`, `webgl2_tex`,
  `webgl_libs` into `webgl_js`. `damage_sig` no longer re-runs `framehash.sh`.
- **Deleted:** `t2/desktop` (re-ran nine T1 tests a T2 run already runs), `corpus_complete` (counts files of the frozen corpus), `vita_gxp_3d`
  (always skips: no blob is committed), `security_guide` (greps the prose of a guide).

Verdicts of the agents rejected after reading: `version`, `gh_org_setup`, `qjs_profile`, `qjs2c`, `shared_headers`, `ui_docs` test real behaviour
(the version string the packages are named from, an idempotent tool, a refusal message, the vendored QuickJS loop, a binding architecture rule, a
generated doc's freshness) and stay.

## Left as explicit SKIPs on CI (they need what a hosted runner has not)

Real GPU: `gl_renderer`, `gl_occlusion`, `gl_scroll`, `three_gpu`, `zinc3d_aa`, `webgl_conformance`. Display or window: `window_live_resize`,
`webview_hybrid`, `mapper`. Timing: `launch_time`, `bench_render`. Debugger: `debug_lldb`. Emulators and simulators: `console_emulators`,
`ios_sim`, `zinc_go_phones`, `export_esp32`. Headless Chrome on a loaded runner: `web_dom`, `web_dom_visual`, `web_export`, `web_gl`,
`web_plugins`, `web_video`, `web_vite`, `oklab_tints`. `fuzz` skips in the shards and runs in its own job.
Chrome-free halves worth splitting out of the web ones: the file layout of `web_export`, `gen-web-gl --check` of `web_gl`, the prerender check of
`web_dom`; and the `otool -L` checks of `launch_time`.

## Still to do (each needs its own rework and proof)

Merges: `touch_marks` into `touch_spread`, `ui_kit_sections` into `ui_theme`, `plugin_tiers` with `trust_policy` (one publisher build),
`run_compiled` into `run_cache`, `t2/cross` into `t2/cross_cpu`, `hw_shim` into `chip_models`.

Too slow for what they prove (CI seconds):

| test | s | cut |
|---|---|---|
| t2/cross_linux | 580 | builds hero for two arches to check an ELF header: aarch64 only, or the cross-platform pass |
| installer_deb | 171 | two zig cross builds for determinism: a tiny program |
| t2/compat | 168 | 400 MB of sources on a shard: its own cached job |
| texture | 159 | six basisu builds: macos, rpi1, wasm |
| app_library | 109 | links rn-showcase in T0: hello only |
| rn_showcase | 95 | dark rows and five idle screens covered elsewhere |
| gpu_strokes, gl_strips | 95, 93 | the window half repeats gl_strips; two programs instead of four |
| web_hw, web_real | 93, 88 | split the map; one render pass |
| marble | 91 | two console sizes instead of four |
| t2/cross_cpu | 85 | the exports rebuild the builds |
| web_libs, web_physics2d | 71, 71 | npm install and a zig wasm build each run: cache them |
| test262_regexp | 68 | parallel over the cores |
| webrtc_chat | 68 | the two-peer room is real time on 3 loaded cores |
| gl_offscreen, gl_replay_es2, webgl1_core | 64, 64, 52 | a `cmake --build` inside the test: build in the build job |
| agents_chat, agents_go | 64, 49 | one long run, short smoke runs |
| museum_visit, museum_viewer, pinball3d | 51, 45, 60 | one `ZINC_FRAMEHASH=all` run instead of one run per hash |
| layout_yoga | 41 | the sanitizer rebuild belongs to a nightly |
