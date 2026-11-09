---
id: ZN-1065
title: 'Web target: dev server and DOM-mode gaps'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:43'
updated_date: '2026-11-09 01:36'
labels:
  - web
  - size-S
milestone: m-14
dependencies: []
ordinal: 9100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small defects of the web export.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-?: `three` from npm in a web project resolves to the zinc:three plugin; the web backend of zinc:three (plugins agent) decides, or npm three wins on the web target
- ZN-?: the dev pre-bundle does not watch workspace packages; reload on a workspace package edit
- ZN-?: web `zinc dev --target web` for vendored UMD/addon libraries (three addons, MapLibre) once the unbundled dev server can load them
- ZN-?: silence W0603 for `zinc:map` on the web (lazy network calls in index.ts or a browser shim for zinc:net)
- ZN-?: a DOM-mode program that draws with gfx alone and has no zinc:ui tree yields no elements; export it in canvas mode or make DOM mode mount a canvas
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc dev reloads on an edit of a workspace package
- [x] #2 A DOM-mode program that draws with gfx alone mounts a canvas; vendored UMD/addon libraries load in zinc dev --target web
- [x] #3 zinc:map raises no W0603 on the web; npm three on the web target resolves by a documented rule
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet sub-agent, 2026-11-09):
- Vite does not pre-bundle linked packages (resolved outside node_modules): it serves them as ESM source and watches them; a CJS linked package needs optimizeDeps.include. https://vite.dev/guide/dep-pre-bundling , https://vite.dev/config/dep-optimization-options
- UMD/CJS in an unbundled ESM dev server: esbuild interop through pre-bundling, or a classic <script> that sets a global (what zinc:map's `scripts` already does for MapLibre).
- Gfx-only program in a DOM framework: get-or-create a <canvas> appended before drawing (react-konva Stage, PixiJS createRoot, Cornerstone getOrCreateCanvas). Zinc already does this (enterRaw in runtime.js).

What was found and done:
- DOM mode + gfx alone: already mounts a window-sized #zinc-canvas (runtime.js enterRaw, since the October work). Proven: a clear+rect program exported with --render dom shows #zinc-canvas 756x469 with the clear colour.
- Vendored UMD/addon libraries in zinc dev: MapLibre (plugin `scripts`) and the three addons (plugin web.modules) already load in dev. The gltf-viewer failed in dev AND in an export with `__clockMs is not defined` (zinc:sys clock() changed on 2026-11-08 to a prelude global the page lacked): runtime.js now defines it. The web GLTFLoader also sets the subset's counts (meshes, triangles), so the viewer no longer says "undefined triangles".
- W0603 of zinc:map: its index.ts downloads tiles with zinc:net, whose http rows had no page answer. targets/web/rows-net.js answers the fetch rows over the page's fetch (40/41 events, timeoutMs, maxBytes, saveTo, bodyFile); runtime.js dispatches host events in every page (not only under the bridge) and answers evPayload/evPayloadSize/evPayloadBytes; zinc:net's event hook is split (fetch: 40, 41, 47; servers: 42 to 46, 80 to 82, hooked by serve), so a fetch-only bundle carries no server rows. implementedRows also reads ev* and sig* rows (sigWatch was answered but still reported).
- npm three: rule documented (docs/targets/web.md, "npm packages"): tsconfig paths, then a plugin that answers the name, then node_modules, on every target. Proven with a fake npm three: plugin wins without paths (`three 170-zinc`), the npm one with a paths entry (run and web export).
- Workspace packages: prebundleDeps finds imported packages whose node_modules entry links outside every node_modules, adds their files' times and sizes to the key and returns their folders; zinc dev watches them (dist included). Proven: a linked package edited under zinc dev -> "../pkgs/greet/index.js saved: reloading the page, the packages or the lockfile changed (26 ms)", the new pre-bundle has the edit.

Proofs: maps/explorer export (no W0603), a zinc:net probe page in headless Chrome (`net 200 true true text/html`, `err true true`, `clock true`), maps explorer under zinc dev (maplibregl loaded, 2 canvases), gltf-viewer under zinc dev ("5 meshes, 3624 triangles"). T0: tests/t0/web_net_rows.sh PASS; tests/t0/net.sh PASS (native fetch and serve after the hook split). tools/web-npm-test gets step 4b (workspace edit reloads), not run.

Decisions (for the coordinator to record):
- zinc:net fetch in a page answers its host rows over the page's fetch (rows-net.js), events through Z.hostEvent in every page; servers stay ZnUnsupported (W0603) in an export. Over a browser variant of zinc:net: keeps one module for every engine and the dev bridge's servers.
- Bare specifiers: tsconfig paths > plugin (module, modules aliases) > node_modules on every target; npm three is reached through paths.
- Workspace packages are pre-bundled like registry ones (their stamps join the key, the folder is watched) instead of served unbundled as Vite does: one resolver, a reload instead of Fast Refresh for them.

later.md lines:
- ZN-1065: serve linked workspace packages unbundled under zinc dev, as Vite does, so their modules swap in place instead of a full reload
- ZN-1065: zinc:net fetch onProgress (upload progress) in a page, over XMLHttpRequest as fetch.browser.ts uploadFile does

Proposed tests:
- tests/run --only web_npm (T1, now with the workspace step): dev reloads on a workspace package edit; ~40 s, Chrome ~400 MB.
- tests/run --only web_gl (T1): three.js pages after the GLTFLoader change; ~1 min, Chrome ~500 MB.
- tests/run --only web_bridge (T1): zinc:net fetch now in the page under zinc dev, servers still through the bridge; ~40 s, Chrome ~400 MB.
- tests/run --only web_hw (T1): the map page with the zinc:net rows; ~1 min, Chrome ~500 MB.
<!-- SECTION:NOTES:END -->
