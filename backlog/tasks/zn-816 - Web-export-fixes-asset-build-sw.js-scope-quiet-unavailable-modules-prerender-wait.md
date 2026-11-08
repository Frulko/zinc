---
id: ZN-816
title: >-
  Web export fixes: asset build, sw.js scope, quiet unavailable modules,
  prerender wait
status: Done
assignee: []
created_date: '2026-10-24 23:56'
updated_date: '2026-11-08 21:45'
labels:
  - size-M
milestone: m-14
dependencies: []
ordinal: 5600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-?: web export does not run the asset build (zinc:assets rules, atlases, tilemaps, textures), so examples/platformer fails at start; run `assets::build` and ship the output as web assets
- ZN-?: `sw.js` is shared by every export served from the same origin and port, so a stale offline fallback can come from another demo; scope the cache or the worker by app name
- ZN-?: zinc:sprite, zinc:link and zinc:udp should answer "unavailable" quietly on the web instead of apps logging console.error (music)
- ZN-?: `zinc export` of a raw template folder should say "run `zinc new` first" instead of the reverse-DNS id error
- ZN-?: `web_dom` prerender waits a fixed six seconds and flakes under a load of 30 ("the app drew nothing"); wait on the first frame instead
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc export --target web runs the asset build so examples/platformer starts
- [x] #2 sw.js cache is scoped by app name
- [x] #3 zinc:sprite/link/udp answer unavailable quietly on the web
- [x] #4 Exporting a raw template says "run zinc new first"; web_dom waits on the first frame, not 6 s
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Web search (2026-11-08, sonnet): Cache Storage is per origin, not per scope; Workbox prefixes cache names with an app id for apps sharing a localhost port (https://developer.chrome.com/docs/workbox/modules/workbox-core); on activate delete only your own prefix. Headless prerender: wait on an app signal or DOM state polled over CDP, not a fixed --virtual-time-budget (unreliable with real-time loads). Web ports of native APIs: throw a typed "unsupported" error the app can tell apart, never fake the service.

Done:
- AC1 asset build: already done by ef2b26c17 (builtAssets in src/cli_web.cpp unpacks the web packs). Proof today: examples/platformer exported to web, tools/web-browser-test: 239 frames, no console error, title screen and level drawn (scratchpad shot).
- AC2 sw.js: cache named `zinc:<scope>:<app>-<hash>`; reads only its own cache (caches.open(V).match, never the origin-wide caches.match, which could return another export's ./); activate drops only older caches of its scope and the legacy unscoped `zinc-*` names. T0: tests/t0/cli_polish.sh.
- AC3: zinc:sprite already works on the web (platformer uses it). zinc:socket udp already threw ZnUnsupported. zinc:link web init now throws ZnUnsupported (every call runs init first). examples/music skips its console.error for `e instanceof ZnUnsupported` (zinc:browser). Engine gap found and fixed: zinc:browser's native index.ts did not compile under the typed checker (index signature type, Z0005), so no typed program could import it; browserFeatures() now returns Map<string, boolean> on both sides (no caller in the repo). Proof: music exported to web, web-browser-test console empty (it had the two music errors before).
- AC4 raw template: parseProject refuses a zinc.json holding {{name}}, {{id}} or {{ident}} with "this is a project template ... zinc new <template> <dir>"; resolveProject now stops on a fatal manifest error before anything is written (the web export used to leave build/web-export/stage.log inside the template). T0: cli_polish.sh. Prerender: Chrome driven over --remote-debugging-pipe by a small Python driver (as tools/cdp.py) polling for a marked element every 100 ms, up to 60 s real time; no fixed sleep for serve.py either (it waits for the port). tests/fixtures/web-dom export --prerender: 78 marked elements, whole export 4 s.

later.md lines (for the coordinator):
- ZN-816: index signature types (`{ [k: string]: V }`) are refused by the typed checker (Z0005): plugin and user declarations must use Map; worth a language task.
- ZN-816: old exports' unscoped `zinc-<hash>` caches are deleted by the first new-style worker of the origin; a sibling app still on an old sw.js loses its offline copy once (refills on next visit).

Proposed tests: tests/t1/web_dom.sh (prerender adopt, ~1 min, Chrome ~1 GB); tests/t1/web_export.sh (sw.js shape, offline reload); tools/web-real-test --matrix with music and platformer (console errors, few minutes, one Chrome).
<!-- SECTION:NOTES:END -->
