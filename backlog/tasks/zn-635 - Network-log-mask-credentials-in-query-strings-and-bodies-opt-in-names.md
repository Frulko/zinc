---
id: ZN-635
title: 'Network log: mask credentials in query strings and bodies (opt-in names)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:27'
updated_date: '2026-10-10 16:51'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50220
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Headers and URL userinfo are masked at record time; query strings and bodies are not. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the names in ZINC_NET_SENSITIVE also mask query parameters and form or JSON body fields, in the events and the HAR
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in a parallel worktree (branch worktree-agent-a0700e36f27b616d0), on top of ZN-633.

What changed (src/host/netlog.cpp, all at record time, so the events, getResponseBody, getRequestPostData and the HAR hold no secret)
- Query parameters: maskQuery on the URL of every request, on the request target of a WebSocket upgrade and on the value of a Location header (so the HAR's redirectURL too).
- Bodies of requests and responses (maskBody, before the 4 MiB cut): a urlencoded form by its fields (Content-Type), any other text as JSON: the value after a listed "name": becomes "***" (string, number, object or array), at any depth; every other byte is kept.
- WebSocket text frames and MQTT messages go through the same JSON masking (addFrame).
- Only the names of ZINC_NET_SENSITIVE, whatever their case; the built-in words of the headers (token, secret, session...) do not apply to fields.
- docs/dev-mode.md (Network, HAR export) and the header comment of netlog.h say what is and is not masked.

Decisions (no record number, for the coordinator; D60 should lose 'bodies and query strings are not masked (ZN-635)')
1. Opt-in names only for fields. Why: the title says so, and a field called token or session is often the data being debugged; masking it by default would hide what the panel is for. Headers keep their built-in list.
2. JSON fields are masked by a scanner of strings and brackets (maskJson, about 25 lines), not by a JSON library. Options: (a) yyjson in the host: the host library links no JSON parser, so every AOT program would link libzn_yyjson.a (the link line of main.cpp, the cross targets of tc.cpp, the size tests), and a body that does not parse (cut at 4 MiB, JSON lines, an event stream) would need a second rule; a re-serialised body also differs from what was sent. (b) the scanner: no new link, keeps the body byte for byte, masks cut or line-delimited JSON too. Chosen: (b). It builds no values and validates nothing, so it is not the JSON parser RULES.md forbids writing; revisit if the host gets a JSON reader for another reason.
3. Any text body is scanned for JSON fields, not only application/json: covers a wrong Content-Type, JSON lines and server-sent events, and costs nothing when ZINC_NET_SENSITIVE is empty (early return).

Known limits (written in docs/dev-mode.md): free text in a body, multipart forms, the bytes of a plain TCP stream, names written percent-encoded (pass%77ord) or with JSON escapes, JSON inside a JSON string, the fragment of a URL. The HAR queryString array stays empty as before.

Proof (development Mac)
- AC1: tests/run --only netlog -> PASS; the checker's lines (NETLOG_KEEP): 'AC1 ok: 9 requests in the Network domain ...', 'AC2 ok: HAR 1.2 with the same 9 requests, bodies, messages and timings', 'masking ok: the names of ZINC_NET_SENSITIVE are *** as query parameters, JSON fields and form fields, in the events and in the HAR (9 secrets absent)'. The run sets ZINC_NET_SENSITIVE=pin,API_KEY and checks exact texts: URL .../login?api_key=***&plain=1, Location /new?api_key=***, JSON body {"user":"z\\"inc","pin":"***","deep":[{"PIN":"***","keep":true}],"api_key":"***","token":"shown"} in requestWillBeSent, getRequestPostData, getResponseBody and the HAR, form user=zinc&pin=***&keep=1, WebSocket URL /chat?api_key=***&room=1 and message {"say":"hello ws","pin":"***"}.
- The check can fail: its first run failed with 'the HAR exposes redirect-secret' (the test server repeated the query in a text/plain body, which is free text; the server no longer repeats it).
- Also PASS socket, net, mqtt (the other users of the recorder's call sites).

Follow-ups for the coordinator
- (size S) Network log: mask the fields of multipart/form-data bodies (FormData of zinc:net). AC: a FormData field named in ZINC_NET_SENSITIVE is *** in the events and the HAR.
- (size S, optional) Network log: percent-decode parameter names and read JSON escapes in keys before comparing. AC: pass%77ord and "p\u0069n" are masked when password and pin are listed.
- No affected.json change (netlog.cpp and the test files are already mapped to netlog).

usage: n/a (tools/usage)
<!-- SECTION:NOTES:END -->
