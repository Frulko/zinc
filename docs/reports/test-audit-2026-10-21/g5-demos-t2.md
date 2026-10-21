# Test audit, group 5: museum_*, pinball3d_*, music_*, zinc_gl_api_tour, all of T2 (2026-10-21)

Counts: KEEP 45, SHORTEN 7, MERGE 2, DELETE-DUP 1, LOCAL-ONLY 5, DELETE-WEAK 0 (60 tests).

## Findings that cut across the group

1. **The "compiled" runs of the demo tests are interpreter runs.** `src/main.cpp:1066` (`wanted()`): with `ZINC_HEADLESS` or `ZINC_DETERMINISTIC` set and no `ZINC_RUN=native`/`--native`, `zinc run` interprets. Checked: `ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 zinc run examples/museum-table` prints `engine Zinc interpreter`. Every `mode=""` / "compiled" branch below therefore compares the interpreter with itself and proves nothing, while costing a full rerun: museum_table:18-24, museum_viewer:16-25, museum_mode:27-40, museum_video:31-32, museum_visit:33-34, museum_theme:23-24, museum_zoom:32-33, museum_stats:62-63, museum_access:56-57, pinball3d_chooser:27 vs 36 ("interpreter draws what the compiled game draws"). Only `pinball3d_aot` (`zinc build`) and the T2 `*_aot` tests really compile. Fix: delete these branches; if a compiled smoke test of the museum is wanted, one test with `--native` and one frame hash.
2. **The CI package job's smoke test is a no-op.** `.github/workflows/zinc-next.yml:138` runs `tests/run --only install_nocompiler`; `tests/run` defaults to `tier=t0` (line 8) and `install_nocompiler` is `tests/t1/`. Nothing runs, "0 passed, 0 failed", exit 0. Needs `--tier t1`. (Not mine to fix; flagging.)
3. **Frame-hash loops restart the app per frame.** museum_visit (11 runs), museum_viewer (3 runs x 2), museum_mode (4+2 runs x 2), museum_table (4 x 2), museum_access (5 runs). `ZINC_FRAMEHASH=all` (used by museum_panorama:13) gives every frame's hash from one run; pick the wanted frames with grep. This is the "one long proof" rule of AGENTS.md.
4. **GPU sub-assertions are meaningless on a hosted runner**: museum_viewer:27-30 and pinball3d:52-63 (the test itself says "the software renderer again where there is no GPU context"), museum_table:59-71 (needs a GL window; silently skips). They belong to t1/three_gpu / gl_renderer.
5. **Silent "pass" skips on missing tools**: layout_fuzz:4, wasm_browser:7, wasm:5 `exit 0` instead of 77. museum_video:50-55 and museum_editor_sound:36-52 (real FFmpeg decode of the clip, the files' own length) only print a note and pass when `pkg-config libavformat` is absent, which is the CI case: that half is never proven on CI.
6. The scripted pinball game (play.input, 3600 frames) is played 10 times across the family (pinball3d x4 incl. portrait and two high-score runs, controls, sound x2, second_table, aot x2). Cuts: portrait only needs frames 12/320/460 (compare the head of the log as pinball3d_controls:33 does); the first high-score run is the landscape run with `--scores`; `--log --sounds` in one run if the two logs can be split; selftest.ts runs in both pinball3d_editor:55 and pinball3d_editor_rules:74.

## Table

| test | verdict | target (dup/merge) | reason with file:line evidence |
|---|---|---|---|
| t1/museum_access | KEEP | | One scripted session per feature (sessions.py goldens), reach/contrast/voice checks are unique (:61-96). Drop the "compiled" run (:56-57, interpreter) |
| t1/museum_assets | KEEP | | Every asset loads and is credited, size < 12 MB (:10-18); cheap, unique |
| t1/museum_details | KEEP | | One editor session with saved-file golden + player loader check (:18-29); distinct from editor_views |
| t1/museum_editor_sound | KEEP | | Narration/film session with golden (:21-33); real-length half (:36-52) silently skipped without FFmpeg |
| t1/museum_editor_views | KEEP | | Preview window, points, turn, settings, Save as, close (:43-115); already split from museum_editor for time (28 s) |
| t1/museum_editor | KEEP | | selftest.ts + storyboard/table/preview sessions (:26-81); unique |
| t1/museum_format | KEEP | | Project format + 15 broken files (:12-32), 0 s |
| t1/museum_mode | SHORTEN | | 25 s: the `for mode in "--interp" ""` loop (:27-40) runs everything twice and the second pass is also the interpreter (finding 1); get sides/two frames from one `FRAMEHASH=all` run per input (:30-31). Keeps unique idle/reset/unreadable-project checks |
| t1/museum_panorama | KEEP | | Pano log, 5 frame hashes, attach.ts projection within 2 px (:13-38); hashes recorded on Intel pass on arm64 CI |
| t1/museum_polish | KEEP | (partial overlap museum_access:61-76) | Attract loop view restore and tours list (:31-45) are unique; the subtitle `over=0` block (:47-55) repeats museum_access's `over=0` awk and could go there |
| t1/museum_probe | LOCAL-ONLY | | Needs FFmpeg libavformat (:5, SKIPs with 77 on CI), real native, realtime, RSS and a free port (:8, :35); explicit SKIP, not silent. t0/resource_probe covers the probe tool |
| t1/museum_stats | KEEP | | Anonymous statistics file golden + privacy checks (:33-60); drop "compiled" (:62-63) |
| t1/museum_table | KEEP | | Two-hand gesture log/frames + continuity awk (:27-36) + hotspot (:52-57) unique. Drop compiled loop (:18) and GL compare (:59-71) |
| t1/museum_theme | KEEP | | Fonts/logo each change the frame, editor round trip (:26-59); drop compiled check (:23-24) |
| t1/museum_update | KEEP | | Local HTTP server + pack/publish, signature, truncation, reset-time update (:29-60); real flow, 9 s |
| t1/museum_video | KEEP | | Film story + paused frame + licences (:27-47); real-decode half not proven on CI (finding 5) |
| t1/museum_viewer | SHORTEN | | 45 s: 3 runs x 2 modes (:16-25, second is interpreter) + a GPU compare (:28-30, software vs software on CI) + pins session. One `FRAMEHASH=all` run, no GPU step; keep the pins check (:33-57) |
| t1/museum_visit | SHORTEN | | 51 s: 11 separate runs for 11 frame hashes (:26) + a 14700-frame story run (:27). Take all 11 hashes from the 14700-frame run with `ZINC_FRAMEHASH=all`; drop :33-34 |
| t1/museum_zoom | KEEP | | Line-break stability during zoom via scene-texts (:26-31), 1 s; drop compiled :32-33 |
| t1/music_city_standby | KEEP | | Local geocoding server, debounce, config.json, StandBy frames (:37-52); deterministic, passes on CI |
| t1/music_tree_sonos | KEEP | | Made-up Sonos/Spotify house, idle-frame budget, handoff request chain (:70-86); ZN_WAIT_SCALE aware |
| t1/pinball3d_aot | KEEP | | The only real `zinc build` of the game compared with play.log/sounds.log (:8-15). Could be one run with `--log --sounds` |
| t1/pinball3d_chooser | KEEP | | Tab/press/package list (:26-55). The "interpreter vs compiled" frame (:27, :36-37) is interpreter vs interpreter |
| t1/pinball3d_controls | KEEP | | Gamepad remap and bad bindings (:24-49); first run is a full 3600-frame game (:21): compare only the head of play.log |
| t1/pinball3d_editor_looks | KEEP | | Looks/handles/L-shaped deck sessions with goldens (:42-114) |
| t1/pinball3d_editor_rules | KEEP | | Guided rules sessions; selftest.ts also run in pinball3d_editor:55, one run could serve both |
| t1/pinball3d_editor_table | KEEP | | Table from nothing, played by the game, export/unpack, altered package (:32-80) |
| t1/pinball3d_editor | KEEP | | Editor slices 1-4 sessions, 15 zinc runs, 40 s, distinct from the other editor tests |
| t1/pinball3d_format | KEEP | | Loader/packaging/16 broken tables (:35-43), compiled and QuickJS (:76-81); 26 s, could pass several files to one `check` as museum_format:31 does |
| t1/pinball3d_second_table | KEEP | | Replay of the 5 editor sessions reproduces the shipped table byte for byte (:29-35); the "nothing of the table in the code" python (:55-81) repeats pinball3d:136-166 on a second table and greps source text: weak, can go |
| t1/pinball3d_sound | KEEP | | Sound log golden + completeness + rename test + probes (:30-148); the table-completeness part (:35-77) is a data check, fine |
| t1/pinball3d | SHORTEN | | 60 s: landscape, portrait and two high-score runs are four 3600-frame games (:38-39, :121-123); portrait needs 460 frames (compare log head), fold the first sign run into landscape; drop the GPU steps (:55-63, finding 4). Probes (:81-118) and goldens are unique |
| t1/zinc_gl_api_tour | KEEP | | zinc:gl vs QuickJS binding output, interpreted and built (:9-16); skips with 77 if no WebGL 2 |
| t2/aot_layout_link | KEEP | | Classic AOT build links no Yoga, rn does (:11-12); size feature, 26 s |
| t2/atelier_esp32 | KEEP | | Atelier "ESP32 emulator" Run path (:12-16); first 2 lines repeat esp32_qemu hello as setup only |
| t2/bench_render | LOCAL-ONLY | | `ZINC_CI` -> exit 77 (:4): timings on a 3-core runner prove nothing; explicit SKIP; bench-gate job covers perf |
| t2/compat | SHORTEN | | 168 s, ~400 MB of pinned sources fetched (:3), `--jobs 8` on 3 cores. Real unique conformance gate (baseline.json): give it its own cached job instead of a shard slot |
| t2/console_emulators | LOCAL-ONLY | | `ZINC_CI` -> 77 (:11); windowed PSP/Vita/PS2/3DS emulators + SDKs; explicit SKIP |
| t2/cross_cpu | SHORTEN | | 85 s: 3 `build --target` (:7-9) then 3 `export --target` (:11-13) rebuild the same fib for armhf/armv7; keep builds + one export per board mapping. Unique .ARM.attributes check (:14-55) |
| t2/cross_linux | SHORTEN | | 580 s, the slowest test of the release (hero graphics host cross-linked for two arches, :8-14). Only ELF e_machine + "Lottie" string checked; build aarch64 only (armhf codegen is cross_cpu's) or move to nightly. The owner defers Linux to the cross-platform pass |
| t2/cross_plugin_pack | KEEP | | plugin-pack e_machine of armhf/aarch64 objects (:10-22), 1 s |
| t2/cross_windows | KEEP | | PE32+ check, alias name, clear refusal for a windowed program (:9-16); Windows opens the cross pass; windows-cross CI job (off) runs the same tools/windows-cross |
| t2/cross | MERGE | t2/cross_cpu | aarch64 fib build + ELF machine 183 (:9-14) is also built in cross_cpu:7-9 and asserted by cross_linux:12. Move only the pinned-zig `SHA256` record check (:15) into cross_cpu |
| t2/desktop | DELETE-DUP | t1/macos_bundle, macos_menu, macos_dock, macos_tray, macos_window, macos_shortcut, macos_dialog, macos_power, macos_deeplink | Re-runs those nine T1 tests through `tests/run --tier t1 --only` (:10-13); `--tier t2` already includes t1 (tests/run:12), so the release runs each twice (73 s on CI). Only own assertion is that a PNG exists (:15). Also treats "skipped" output as pass |
| t2/diff | KEEP | | tools/diff-matrix, the corpus interpreter vs AOT vs frozen; unique |
| t2/esp32_qemu | KEEP | | Headless Espressif QEMU hello/library/exit 101 (:9-13), works on CI, 10 s |
| t2/examples_all | KEEP | | Every example vs tests/examples.lst; supersedes t1/examples (cross-group) |
| t2/examples_pixels | KEEP | | proto-capture compare --all against the frozen prototype frames |
| t2/fixed_aot | KEEP | | fx12 profile AOT programs vs goldens + fx16 (:9-16); unique profile, 38 s |
| t2/fuzz | KEEP | | Entry point of the `fuzz` CI job (workflow:352, `ZINC_FUZZ=1`); SKIPs in the shards (:4), so no double run |
| t2/input_aot | KEEP | | Compiled click session frame + SDL dummy window HAL path (:6-10) |
| t2/ios_sim | LOCAL-ONLY | | `ZINC_CI` -> 77 (:7); Xcode generator + simulator; explicit SKIP |
| t2/layout_fuzz | KEEP | | 1000 random flex trees vs headless Chrome (:6-11); Chrome exists on macos-15. Missing Chrome gives `exit 0` (:4): should be 77 |
| t2/package | MERGE | t1/install_nocompiler | Without ZINC_DIST (the CI shard case) it rebuilds the whole package (:11) that the package job already built; unpack, `--root`, `run hello.ts` and the app opening repeat install_nocompiler:50-102. Unique: aarch64 build and ESP32 QEMU run from a clean-machine package with downloads (:32-36) - move those two lines behind the package job's ZINC_DIST and delete the shard test. Note the inventory's "PASS 0s" is the t0/package line (same name) |
| t2/res_aot | KEEP | | Baked fonts/images frame of a compiled program (:6-8), 2 s |
| t2/ui_aot | KEEP | | AOT ui.tsx frames 1 and 40 vs the goldens t1/ui.sh uses (the other engine, few frames) |
| t2/wasm_browser | KEEP | | Breakout in headless Chrome through the wasm glue; `exit 0` without Chrome (:7) should be 77; shares tools/build-wasm with wasm |
| t2/wasm | KEEP | | 18 M3 programs on vm.wasm vs the interpreter (:9-14), 58 s; `exit 0` without node (:5) |
| t2/webrtc_interop | KEEP | | Zinc vs headless Chrome with fake devices, offer/answer x VP8/H.264; unique vs t1/webrtc_* |
| t2/zinc_go_phones | LOCAL-ONLY | | Needs an Android emulator or a booted iOS simulator plus PIL (:16-18); SKIPs with 77 (the 27 s in the log is spent before the skip) |

## Cross-group duplicates and CI redundancies

- `tests/run --tier t2` is cumulative (t0+t1+t2): any T2 test that calls T1 tests (desktop) double-runs them in the release.
- Workflow package job (line 138) smoke test is a no-op (finding 2); the shard-run `t2/package` then does the real work by rebuilding the package.
- t1/examples (30+ examples, 3 frames, exit 0) is a subset of t2/examples_all (examples.lst); a release runs both. Candidate for deletion (other group).
- t1/example_output uses `proto-capture compare` on 2 entries already in t2/examples_pixels `--all`; only `tools/example-output` is unique.
- fuzz: no duplication; the T2 `fuzz` test is the job's entry and skips in shards. t1/fuzz_regress (crash corpus replay) is separate.
- windows-cross job (off) and t2/cross_windows run the same `tools/windows-cross build`; keep one when Windows is switched on.
- cross, cross_cpu, cross_linux, package all assert "`zinc build --target aarch64-linux` makes an ELF"; keep it in cross_cpu (+ one hero link in cross_linux).
- t2/wasm and t2/wasm_browser both run tools/build-wasm; t1/export_wasm is the separate `export --target wasm` path.
- t0/package vs t2/package share a name: results files and CI statuses key on the name, so the t2 result is hidden (the inventory shows t0's "PASS 0s" for both).
