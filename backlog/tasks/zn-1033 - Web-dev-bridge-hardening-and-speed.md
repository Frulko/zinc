---
id: ZN-1033
title: Web dev bridge hardening and speed
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
updated_date: '2026-11-09 07:21'
labels:
  - web
  - security
  - size-M
milestone: m-14
dependencies: []
ordinal: 12600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `zinc dev` web bridge binds 0.0.0.0 (zinc:net `serve` has no `host` option), allows any 127.0.0.1 origin, serves dotfiles from `/__project/`, sends bytes as JSON number arrays (one `__host_fsByte` call per byte), keeps a page-local copy of a sqlite machine path, and logs `ERR_EMPTY_RESPONSE` once per reload. Add `host` to `serve`, bind 127.0.0.1, restrict CORS to the page origin, hide dotfiles, send base64, route sqlite through the bridge.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Web dev bridge: zinc:net `serve`/`serveAsync` take a `host` option so the bridge binds 127.0.0.1 instead of 0.0.0.0 (others are refused with 403 today, but the port is open on the LAN).
- Web dev bridge: `Access-Control-Allow-Origin` only the dev page's own origin (today any http://127.0.0.1:*); `/__project/` serves dotfiles such as `.env`.
- Web dev bridge: bytes travel as JSON number arrays and `__fs.load` reads one byte per `__host_fsByte` call (~4x the size in sync XHR); send base64 or binary.
- Web dev: zinc:sqlite keeps a page-local copy (localStorage) of a machine path under `zinc dev`; route it through the bridge in dev.
- Web dev: the old page's pending `/wait` logs `net::ERR_EMPTY_RESPONSE` once per reload (the bridge restarts before the page unloads).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the bridge listens on 127.0.0.1 only; a request from another origin gets 403
- [x] #2 `/__project/.env` is refused
- [x] #3 `__fs.load` of 4 MB takes one request in base64
- [x] #4 `serve({host})` exists with a test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent).
- Bridge (targets/web/bridge-host.mjs): serveAsync(PORT, ..., { hostname: '127.0.0.1' }); answers only the dev page's origin (http://127.0.0.1|localhost|[::1]:<dev port>, written as PAGE), 403 for any other Origin; Vary: Origin; Access-Control-Max-Age 600 (one preflight per 10 min instead of one per sync call). Bytes travel as {$ta, b: base64} (QuickJS-ng Uint8Array.toBase64/fromBase64; the page uses Uint8Array.fromBase64 with an atob fallback), in plain-object fields too (a fetch's body); fsWriteBytes/fsAppendBytes/fsWriteAt, replyBytes, fetch bodies and event payloads go as base64.
- zinc:net serve/serveAsync already had the option, spelled hostname (Bun, Deno): ServeOptions.hostname -> __host_httpServeAt. AC #4 is met by it; new T0 tests/t0/net_hostname.sh (+ tests/golden/host/net_hostname.ts): 127.0.0.1 answers, the LAN address is refused, 'nope' is refused with 'not an IP address', interpreter and QuickJS.
- Dev server (src/cli_web.cpp): /__project/ and /assets/ paths with a dot segment get 403 (.env, .git). The listener is bound before the bridge starts (listenDev), so the bridge knows the page's port.
- Lifecycle (audit 'Web dev server' H): the bridge is one enum Dev::Bridge {Off, Fresh, Used, Ended} changed only by bridgeTo (rejects illegal transitions); spawnBridge returns a pid and touches no state. A token per page load (ZINC_BRIDGE_TOKEN; the served index.html carries the current one): a second tab no longer drives the newer page's bridge with its own callback numbers, it gets 403 and its console says 'a newer load of this page has the dev bridge: reload this page' once, its poll stops. checkBridge uses try_lock: the watch loop no longer waits up to 15 s while a page load restarts the bridge. lastError written under d.m.
- ERR_EMPTY_RESPONSE: the page aborts its /wait poll on beforeunload (the reload request reaches zinc dev, which kills the bridge, before the old page unloads).
- sqlite: plugin.json web 'dev': 'native' now also works for a plugin with a web impl (findPlugins drops impl and wasm under ZINC_WEB_DEV), so zinc:sqlite under zinc dev opens the project's database file on the machine through the bridge (checked: probe program, 'sqlite rows: 1', probe.db on disk). The web watcher ignores *.db/*.sqlite(3) and their -journal/-wal/-shm (each write reloaded the page).
- Found and fixed on the way (web_bridge failed on develop at 'events' with the main binary too): the bridge forwarded the events of its own fetches (__fetch, zinc:net fetch rows on the machine) to the page, where handle 1 ended the page's own rows-net.js fetch 1 with an empty body. The bridge now keeps its own fetch handles (wrapped __host_httpFetch*) and drops their 40/41/47 events.
Research (sonnet sub-agent): Vite server.host default localhost + allowedHosts and server.fs.deny ['.env', '.env.*', '*.{pem,crt}'] https://vite.dev/config/server-options ; Uint8Array.fromBase64 support https://caniuse.com/mdn-javascript_builtins_uint8array_frombase64 ; base64 speed https://simdutf.github.io/browserbase64 ; sync XHR cannot take responseType, so text/base64 is the way; abort the long poll before the restart.
Numbers: 4 MB file through the bridge: one request, 287 ms in headless Chrome (M1 Pro). QuickJS encode of 4 MB: base64 2 ms / 5.6 MB vs JSON number array 393 ms / 15 MB.
Proof: tools/web-bridge-test build/zinc tests/fixtures/web-bridge: all steps pass (callback, promise, serve, udp, events, fetch, token, rebinding, origin, loopbackOnly, dotfiles, load4MB, reload, staleToken, ended, stopped). tests/run --only net_hostname PASS.
Proposed tests: tests/t1/web_bridge.sh (the steps above, ~40 s, Chrome ~300 MB); tests/t0/net_hostname.sh (5 s); web_fs (fs rows under zinc dev unchanged).
later.md: - ZN-1033: lib/modules.d.ts declares zinc:net serve/serveAsync with tls? only; ServeOptions (hostname, limits, webSocket) is missing there. - ZN-1033: zinc dev (desktop and web) reloads on any file the program writes in its folder; watch the module graph, assets and zinc.json only, as Vite does (the web watcher skips database files only). - ZN-1033: a beforeunload cancelled by another handler leaves the dev bridge poll stopped (events then come with the next call).
<!-- SECTION:NOTES:END -->
