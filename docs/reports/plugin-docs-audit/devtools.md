# Audit: zinc:devtools (plugins/devtools)

## What it is
Open Chrome DevTools on a running Zinc UI app: Elements tree, live style edits, console, network, performance, screenshots. `zinc dev` adds it automatically.

## Targets and status
plugin.json: macos, linux, windows, rpi1; port 9229 (option). docs/dev-mode.md says it is added on macos, linux, rpi1 (windows not mentioned). Tests: `inspector`, `devtools_styles`, `devtools_port`, `netlog`, `dev_mode`. Not available on esp32/wasm.

## What the docs have
- [x] docs/dev-mode.md "Inspector (plugins/devtools)": opt-in/out flags, port and env var, protocol subset, Styles panel, Zinc Inspector app, `zinc device inspect`
- [x] Test names in the doc; [x] header comment of index.ts lists the domains
- [ ] docs/plugins/devtools.md (none); [ ] screenshot of DevTools on a Zinc app; [ ] tutorial; [ ] full list of supported methods; [ ] troubleshooting (port busy, Chrome URL)

## What is missing
1. Screenshots: Elements + Styles panel and the Network panel on a Zinc app (`zinc dev examples/hello`, open `devtools://...?ws=127.0.0.1:9229/zinc`); and `app/inspector`.
2. Short plugin page that points to dev-mode.md and lists the domains (DOM, CSS, Overlay, Runtime, Page, Tracing, Network) and what is not supported (unknown methods return empty).
3. Tutorial: "inspect a Zinc app and fix a style": edit in Styles, copy the printed patch back.
4. Troubleshooting: port in use (`ZINC_DEVTOOLS_PORT=0`), nothing listening on a release build, headless apps, remote device forwarding.
5. Security note: loopback only; what `--inspect` over a device exposes (ZN-729.05 will add `zinc device deploy --inspect`).
6. Windows status line.
7. Performance panel how-to (Tracing, 32768 spans, ~3600 frames).

## Wrong or stale
- plugin.json targets include windows; dev-mode.md says macos/linux/rpi1.
- examples/music-tree/build/.zinc-dev/main.ts contains a stray import of the plugin (a build artefact, not a doc).

## Suggested pages
DevTools overview; API/config reference (options, env vars); Tutorial: inspect and style-edit a running app; Supported protocol domains; Inspect a device; Example: Zinc Inspector (app/inspector); Troubleshooting.
