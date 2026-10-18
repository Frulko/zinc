# Tests that fail only on the GitHub macOS runner (2026-10-18)

Run 39151081009 (f7da60ed, macos-15 arm64, 3 vCPU "Apple M1 (Virtual)", 7 GB, no display in `system_profiler SPDisplaysDataType`, Xcode 16.4, no FFmpeg).
Read from the artifacts `test-results-{1..6}` and the reports of runs 38948301697 (59b4b2da, the last green one) to 39123690387. Nothing was built or run locally.

## History: almost none of them is a regression

The "green" run at 59b4b2da was green because the test jobs are `continue-on-error`: it already failed agent_ota, compat and diagnostics.
Every other test in the list was **added after 59b4b2da** and failed from its first CI run:

| test | added | first CI run that ran it | result since |
|---|---|---|---|
| window_live_resize, webrtc_chat | 10-16 22:24-22:37 | 38971341358 | FAIL |
| export_ios | 10-16 23:00 | 39014526867 PASS (before the plugin part, dbfcdb20), then 39016615577 | FAIL |
| webrtc_call, webrtc_interop | 10-16 23:40 | 39014526867 | FAIL (webrtc_interop passed twice, then FAIL) |
| export_packages, video_phone, webview_hybrid | 10-17 01:06-01:59 | 39016615577 / 39024495728 | FAIL |
| web_dom, web_video, web_physics2d | 10-17 14:40-15:03 | 39055046900 | FAIL |
| examples_all | old | FAIL since 39016615577 (webrtc-call/chat added to the list, marble new) | FAIL |
| netlog | 10-10 | PASS on 9 runs, FAIL only on 39151081009 | flaky |
| agent_ota | 10-12 | FAIL on every run but one (39014526867) | FAIL |

## Side findings in the CI plumbing (they hide evidence)

1. **Shard 3 loses its results.** `tests/t2/desktop.sh:11` (and `tests/t0/runner_cwd.sh:6`) run `tests/run` inside a test. The inner one inherits `ZINC_TEST_RESULTS` and truncates it (`tests/run`: `: > "$results"`). `results-3.txt` holds only 4 lines, so web_dom and web_physics2d never show up in `results.txt`, and the rerun step finds no failure to trace in shard 3. Fix: in `tests/run`, `unset ZINC_TEST_RESULTS` right after `results=${ZINC_TEST_RESULTS:-}` (the loop uses `$results`).
2. **The "Rerun the failures with a trace" step does not run the same environment.** It sets no `PYTHONPATH=tests/ci` and no `ZN_WAIT_SCALE`. The netlog trace dies on the `getfqdn` hang that `sitecustomize.py` exists to stop. agent_ota passes in the rerun because S=1 there, and export_ios passes there because the plugin cache is warm by then. Fix: add `export PYTHONPATH="$PWD/tests/ci" ZN_WAIT_SCALE=4` to that step.
3. **`python3 -I` skips `sitecustomize`.** The web tests run their HTTP servers under `-I`, which ignores `PYTHONPATH`, so they still hit the `getfqdn` hang when they bind. This costs time only once, at bind, so it is not the failure itself.

## Group A: zinc builds plugins for the host during a phone export (export_ios, export_packages, video_phone)

**Root cause.** `zinc export --target ios|android` runs `ZN_AOT_CPP_ONLY=1 zinc build --profile <phone>` (`src/cli_core.cpp:1109`). The frontend resolves a plugin's `native/x.spec` through `nativeProvided()` (`src/frontend/modules.cpp:1250`, used at 1733-1734). For a live plugin, or one with a `*.host.cpp`, that builds the plugin **for the Mac** with the pinned zig and loads it (`installNativeProvider`, `src/main.cpp:169-189`). That native build is useless for a phone export.

- **export_ios, export_packages.** zig's own Darwin SDK probe runs `xcode-select --print-path` and `xcrun --sdk macosx --show-sdk-path` from `PATH`, which is exactly what the test's traps catch (`a tool ran: xcrun --sdk macosx --show-sdk-path`). With xcrun trapped, the SDK path is empty, so the compile fails ("export of a plugin with privacy failed", no `PrivacyInfo.xcprivacy`).
  - It passes on the dev Mac only because `~/.zinc/cache` already holds the beep fixture's archive (content-keyed), so zig never runs.
  - The runner starts with an empty cache (only `toolchains` is cached). The trace rerun of export_ios passed for that reason: the main run had filled the cache.
- **video_phone.** `plugins/video` is live and its macOS build needs FFmpeg through pkg-config (`plugins/video/plugin.json`, targets.macos.pkg). The runner has no FFmpeg (`brew install` in the workflow does not list it). The host build fails, the frontend falls back to `video.next.ts`, and the exported CMakeLists has no `zn_app_plugin_video`. The `zinc_native_video.h` errors are only the follow-on: the generated header is never written.
  - Any user without FFmpeg who exports to a phone silently loses zinc:video.

**Verdict: FIX (real bug).** Under `ZN_AOT_CPP_ONLY` (or a phone `--profile`), never build or load a host library. A spec whose plugin declares the target (`targetSettings.count(profile)`) counts as provided: skip `nativeProvided()` / `gNativeLive` in `src/frontend/modules.cpp:1733-1734` for that build, and let `installNativeProvider` (`src/main.cpp:169`) answer true from the manifest.
- Stopgap if that waits: in export_ios.sh and export_packages.sh, run `"$Z" plugin-build beep tests/data/mobile-plugin >/dev/null` before the traps go on `PATH`, and add `ffmpeg pkgconf` to the workflow's `brew install`. Both hide the bug.

## Group B: a cold plugin and asset cache inside a test's timeout (webrtc_call, webrtc_chat, webrtc_interop, examples_all, marble)

**Root cause.** The first use of `zinc:webrtc` compiles libdatachannel, libjuice, usrsctp, libsrtp, libopus and libvpx with zig (`plugins/webrtc/plugin.json`). On a fresh 3-core runner that takes longer than the timeouts:
- webrtc_call: its first shot gives an empty hash: "local light 1040x680: , recorded …". `timeout 120`. All later shots pass.
- webrtc_interop: "no offer from Zinc".
- examples_all: `webrtc-call` and `webrtc-chat` "timed out after 40s".

The trace reruns of webrtc_call and webrtc_interop **pass**, because the cache is warm by then.

examples_all `marble/src/main.ts` CRASH is the same thing: its first run builds the asset packs (`level.ldtk` as a tilemap, `models/**/*.glb` to zmesh) inside the 40 s of `tools/examples-status`. The rerun reports it OK. On the dev Mac `examples/marble/build/` (untracked) already holds the packs.

**Verdict: FIX (workflow).**
- Add a "Warm the caches" step before Tests: `build/zinc plugin-build webrtc && build/zinc assets build ../examples/marble`.
- Or cache `~/.zinc/cache` with actions/cache, keyed on `hashFiles('plugins/**', 'next/include/zn/native.h', 'runtime/zrt.h')`. The archive keys are by content, so a stale cache is harmless.

The runner can do it; it only needs to do it once, outside the timed part.

## netlog: the check reads the console events

`netlog: the events expose json-secret`. Every network check before it passed: masked headers, query, JSON and form bodies, and `getResponseBody`.
- `tests/netlog_check.py:81` searches `json.dumps(events)`, which is **every** CDP message, not only `Network.*`.
- The devtools plugin mirrors every console line to every client (`plugins/devtools/native/cdp.host.cpp:288`, `on_log` → `send(-1, …)`).
- The program itself prints the login echo with the raw secret: `login 200 {… "pin":"json-secret" …}` in app.log.

On the dev Mac (and on 9 earlier CI runs) the program has printed that line before the probe connects. On a slow runner the fetches come after the connection, so the console event reaches the probe.

**Verdict: FIX (test).** At `tests/netlog_check.py:81`, use `json.dumps(net)` (the `Network.*` events, line 26) instead of `json.dumps(events)`.

## agent_ota: the trial window counts sleeps, and the client gives up after 30 s

- `zinc device run` waits for the answer with a fixed 30 s (`src/agent/client.cpp:97`, `recv(..., 30000)`).
- The agent answers `run` only after the update's trial (`src/agent/server.cpp:650`, `otaRolledBack`).
- The trial loop counts iterations of `sleep_for(50ms)` instead of wall time (`src/agent/ota.cpp:224`).

With `ZN_WAIT_SCALE=4` the trial is 16 s. The loop stretches on the loaded VM:
- At 59b4b2da the 24 s app had already exited before `dev run` returned.
- Now the client hits its 30 s limit: "the session with zn-o6567 ended early". The update is left on trial, and every later step cascades (rolled back to 1.0.0 instead of 1.1.0…).

The rerun with S=1 (4 s trial) passes. A user who sets `ZINC_AGENT_TRIAL_MS` to 30 s or more for a slow board meets the same error every time.

**Verdict: FIX (real bug).**
- `src/agent/ota.cpp:224`: loop on a `steady_clock` deadline instead of `waited += 50`.
- `src/agent/client.cpp:97`: give `request()` a timeout parameter. `run` (`client.cpp:375`) passes one above any trial (e.g. 120000, as `client.cpp:345` does), or the agent sends a "trial running" frame first.

## The web target in headless Chrome (web_physics2d, web_dom, web_video)

Chrome runs, and most checks pass (web_dom 63/64, web_video 16/18). The runner has no GPU and 3 slow cores, so the page boots and redraws far more slowly than on the dev Mac.
- **web_physics2d.** "no element with the text Run". `tests/t1/web_physics2d.sh:17` gives the page a fixed `--wait 2` before `--click-text Run`, and `tools/web-browser-test:51-57` exits at once if the element is not there yet. Box2D wasm plus the canvas page under software GL takes longer.
  - **FIX (test):** poll for the text up to a deadline (`--wait` × `ZN_WAIT_SCALE`) at `tools/web-browser-test:51-57` instead of a single try.
- **web_dom.** "the row is where 5000 rows of 32 px put it -384". The same value on 3 runs; one run also had 15 element checks fail because the page was not booted at the first check. After `scrollTop = 160000` and a fixed `pump(0.8)` (`tools/web-dom-test:176-180`), row 5000 sits 12 rows above the top. This is most likely Chrome's scroll anchoring moving `scrollTop` while the virtual list swaps rows and spacers on a slow frame. Nothing in the DOM render sets `overflow-anchor`.
  - **FIX:** set `overflow-anchor: none` on the DOM scroller of virtual lists (users can meet the jump on a slow machine).
  - In the test, poll until the position is stable instead of one read after 0.8 s.
  - Likely, not proven: confirm with one CI run.
- **web_video.** "Seek moves the playhead 0" and "Next loads the AV1 file" (src still the VP9 clip). Play, pause, volume, rate and controls pass.
  - Corrected after the fix: the test server already serves Range (`tools/rangehttp.py`). The VP9 clip lasts 2 s and the playlist loops: on the slow runner the clip ended before Pause, the player moved on to the AV1 file, Seek acted on it (0) and Next wrapped back to VP9. Reproduced locally by delaying Pause by 2.6 s.
  - **FIXED (test):** the clip plays at 0.25x until the Rate step, and every step polls with a deadline × `ZN_WAIT_SCALE`.
  - Likely, not proven: confirm with one CI run.

## A display the hosted runner does not have (window_live_resize, webview_hybrid)

- **window_live_resize.** "limits 360x240 to 900x600" where zinc.json asks for 900x700: AppKit clamps the window's maximum to the virtual screen, which is shorter than 700 points. The allocation bound (13388 for 125 sizes, about 107 per size against about 70 locally) is measured on those clamped sizes.
  - **SKIP-ON-CI:** `[ -z "$ZINC_CI" ] || { echo "skipped: the runner's virtual screen is smaller than the 900x700 window the size limits need"; exit 77; }`
- **webview_hybrid.** The WKWebView frames are fractions: `clip 0,0.1875 0.899414x0.899414` instead of `clip 256,0 768x640`. The window gets no real screen (no display attached to the VM), so AppKit never lays the window out at 1024x640.
  - **SKIP-ON-CI:** `[ -z "$ZINC_CI" ] || { echo "skipped: no display on the hosted runner: AppKit gives the WKWebView no real window frame"; exit 77; }`

## Verdicts

| test | verdict | where |
|---|---|---|
| export_ios | FIX | no host plugin build in a phone export: `src/frontend/modules.cpp:1733-1734`, `src/main.cpp:169` (stopgap: `zinc plugin-build beep` before the traps) |
| export_packages | FIX | same as export_ios |
| video_phone | FIX | same as export_ios (stopgap: `brew install ffmpeg pkgconf`) |
| webrtc_call, webrtc_chat, webrtc_interop | FIX (workflow) | warm or cache `~/.zinc/cache`: `zinc plugin-build webrtc` before Tests |
| examples_all (webrtc-call, webrtc-chat, marble) | FIX (workflow) | same, plus `zinc assets build ../examples/marble` |
| netlog | FIX (test) | `tests/netlog_check.py:81`: `events` → `net` |
| agent_ota | FIX | `src/agent/ota.cpp:224` wall-clock deadline; `src/agent/client.cpp:97` run timeout above the trial |
| web_physics2d | FIX (test) | `tools/web-browser-test:51-57` polls for the text |
| web_dom | FIX | `overflow-anchor: none` on the virtual list's scroller; poll in `tools/web-dom-test:176-180` (likely, not proven) |
| web_video | FIXED (test) | slower clip and polling in `tools/web-video-test` (the clip ended before Pause; reproduced) |
| window_live_resize | SKIP-ON-CI | "the runner's virtual screen is smaller than the 900x700 window the size limits need" |
| webview_hybrid | SKIP-ON-CI | "no display on the hosted runner: AppKit gives the WKWebView no real window frame" |

Also fix the CI plumbing: `unset ZINC_TEST_RESULTS` in `tests/run`, and add `PYTHONPATH`/`ZN_WAIT_SCALE` to the rerun step.
