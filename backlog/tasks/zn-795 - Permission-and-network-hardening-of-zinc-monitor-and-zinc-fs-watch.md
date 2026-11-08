---
id: ZN-795
title: 'Permission and network hardening of zinc monitor and zinc:fs watch'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:54'
updated_date: '2026-11-08 19:45'
labels:
  - size-S
milestone: m-10
dependencies: []
ordinal: 2800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-327: zinc:fs watch of a file reports its changes without fs:read under "permissions" (the other unchecked calls were fixed).
- ZN-327: `zinc monitor --udp` binds every interface and prints control characters raw: bind 127.0.0.1 by default and escape them, as the prototype did.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc monitor --udp` binds 127.0.0.1 by default (an option opens it) and escapes control characters
- [x] #2 zinc:fs watch of a file needs fs:read under permissions
- [x] #3 tests in t0 for both
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research: Vite `server.host` defaults to localhost, 0.0.0.0 is an opt-in (https://vite.dev/config/server-options.html); Node `--inspect` binds 127.0.0.1 and warns that a public bind allows remote code execution; ANSI injection through logged text: uvicorn CVE-2020-7694 (https://access.redhat.com/security/cve/CVE-2020-7694), OSC 52 can write the clipboard. Fix pattern: show C0 (but the newline), DEL and C1 as visible escapes. The prototype did exactly that (`\uXXXX`, ZINC_MONITOR_HOST, default 127.0.0.1, compiler/src/tools.ts under the tag prototype-final).

Done:
- #1 src/cli_core.cpp `zinc monitor --udp <port>` binds 127.0.0.1; `--host <ipv4>` (or ZINC_MONITOR_HOST, the prototype's spelling) opens it; a bad address exits 2; a stderr line says where it listens. UDP lines print through `say()`, which escapes C0 (not the final newline), DEL and UTF-8 C1 as `\u001b`, also inside decoded JSON strings. A file or a serial port keeps its bytes (a device's coloured log). Help text and docs/guide/08-security.md updated.
- #2 On the typed engines fs.watch of a file was already refused (ZN-327 made exists/stat checked). The hole was on QuickJS (and jsc/v8/hermes): the run path never called perm::configure, so no zinc.json permission was checked at all (readText, watch, net...). src/main.cpp: `runPermissions()` shared by the typed and the JavaScript run paths.
- #3 tests/t0/monitor_udp.sh (default bind, JSON and raw escapes, --host 0.0.0.0 via lsof, bad host, a file keeps its colours; fails on the old binary), tests/t0/permissions.sh (fs.watch and readText outside the permissions refused on --interp and --engine quickjs): PASS. cli_core, run_js_engine PASS.

Decision (reversible): escaping only for --udp (untrusted network); a serial port or a file is the user's own device, its ANSI colours stay.

Proposed tests: tests/t1 runs of the JS examples with a "permissions" key (none has one today) after integration.

later.md line (for the coordinator): - ZN-795: zinc:telemetry has no udp:// sink in this engine (modules.cpp says it comes with the host telemetry), so `zinc monitor --udp` only receives from other senders; docs/prototype.md still shows ZINC_TELEMETRY=udp://.
<!-- SECTION:NOTES:END -->
