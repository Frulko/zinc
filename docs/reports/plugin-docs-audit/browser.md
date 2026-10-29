# Audit: zinc:browser (plugins/browser)

## What it is
Ask what the browser running a web export can do (WebUSB, camera, WebGPU...) with `supports`/`requireFeature`, which browser it is, and show a banner; on desktop it answers "no browser".

## Targets and status
plugin.json: every target (macos, linux, windows, rpi1, wasm, esp32, ps2, android, ios); the real implementation is `web/index.ts`, picked by `zinc export --target web`. Test: `tests/t1/web_caps.sh` with `tests/fixtures/web-caps`. Verified in Chrome per docs/targets/web.md.

## What the docs have
- [~] Documented only inside docs/targets/web.md ("Capabilities and limits", "At run time", feature table). No docs/plugins/browser.md.
- [x] Function names listed in one sentence; [x] header comments of index.ts explain each function
- [ ] Full API reference; [ ] runnable example in examples/ (only the test fixture); [ ] screenshot of the banner; [ ] tutorial; [ ] feature key list (lives in targets/web/browsers.json)

## What is missing
1. docs/plugins/browser.md with each function, return type and a "desktop answers" column.
2. Screenshot of the banner bar and of an app that degrades gracefully (run the web-caps fixture in Chrome).
3. The list of feature keys with minimum browser versions, generated from `targets/web/browsers.json`.
4. Tutorial: "ask before you use": `requireFeature('webusb')` try/catch, `ZnUnsupported.feature`, a fallback UI.
5. `zinc export --check` and `--browsers` explained next to it, with an example error.
6. A small example in examples/ (a capability panel).
7. Note: `isBrowser()` false in tests; `browserInfo()` fields; Safari/iOS detection quirk (iOS Chrome reported as safari).

## Wrong or stale
- Nothing contradicts the code. The plugin's "esp32/ps2" targets are only stubs.

## Suggested pages
Browser capabilities overview; API reference (generated, both implementations); Feature table (generated from browsers.json); Tutorial: graceful fallback; Example: capability panel; Notes: export --check.
