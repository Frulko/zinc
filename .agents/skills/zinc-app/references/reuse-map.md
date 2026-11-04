# Where to look before implementing

Repository paths below are entry points, not a frozen API specification. Read current exports and caller behavior before importing. Public std bindings are listed in `src/frontend/modules.cpp`; `lib/modules.d.ts` covers built-ins but is not the entire std/plugin catalog.

| Need | Existing provider / useful consumers | Boundary to keep |
| --- | --- | --- |
| Sonos discovery, topology, playback | `plugins/sonos/index.ts`, `docs/plugins/sonos.md`; music-tree, iPod, sonos-lastfm | Use the plugin, never app-local SSDP/SOAP. |
| Spotify service | `plugins/spotify/`, `docs/plugins/spotify.md` | Spotify Web API and Sonos playback restrictions are different; inspect working integration. |
| Last.fm/scrobbling | `examples/ipod/src/services/scrobble.ts`, already imported by ipod-web; `app/sonos-lastfm/src/lastfm.ts` and `delivery.ts` | These are existing candidates, not a published `zinc:lastfm` module. Reconcile auth transport, accepted/ignored results, queue schemas and units before extraction. |
| Bytes, URLs and forms | `zinc:web`: `toHex`, `URL`, `URLSearchParams`, base64 helpers in `lib/std/web.ts` | A color parser named `hex` is not byte encoding; private-key hex decoding needs validation. |
| HTTP | `zinc:net`: `fetch`, `serve`, `Reply`; `zinc:web/fetch`: web `Request`/`Response` | Native Reply and web Response are different types. Keep server auth and application retry policy explicit. |
| Cryptographic operations | `zinc:subtle`, `lib/std/subtle.ts`; native provider in `src/host/crypto.cpp` | Do not write crypto or claim TS loops are proven constant-time. No public token-comparison helper was found in the 2026-10-31 audit. |
| Files and paths | `zinc:fs`, `zinc:path` (`lib/std/path.ts`) | Read current path semantics; preserving a file's text differs from parsing and rewriting it. No atomic text-write helper was found in the audit. |
| UI components | `zinc:ui/kit`, `lib/std/kit/index.ts`; `zinc:ui/nuxt` / `lib/std/nuxt` as used by existing demos | Reuse established components and tokens before inventing controls; verify the public binding. |
| Display tree / old devices | `zinc:stage`, `lib/std/stage.ts`, `docs/reference/stage.md`, music-tree | Reuse tree/input/lifecycle; never copy a new layout/rendering engine into a demo. |
| UI image lifetime | `zinc:ui/image-cache`, `lib/std/image-cache.ts`; Discord `services/cdn.ts` | Immutable UI-node references differ from stage images, network decoding and mutable camera/video frames. |
| Desktop integration | `plugins/system/`, `plugins/secure-store/` and docs | Check platform support and credential ownership before falling back to app files. |
| Tests | `zinc:assert`, `lib/std/assert.ts`, `tests/run`, `tests/affected.json` | Choose behavioral checks covering changed contracts, not broad unrelated suites. |
| Async delay / CLI | Existing timer APIs and `zinc:sys.args`; consumers in web-relay, hub-server, sonos-lastfm | The audit found no public high-level delay or CLI parser. Candidate names in the audit are proposals, not APIs to import. |

The evidence and ordered promotion list are in `docs/reports/app-demo-reuse-audit-2026-10-31.md`. Recheck the tree: implementations can have been promoted since that report. Do not convert this map into a new catch-all `utils` module.
