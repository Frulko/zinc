# App/demo reuse and authoring audit — 2026-10-31

What this repo does: Zinc runs typed applications, games and services across devices, with shared std and plugins. Its apps and demos also contain infrastructure that is repeatedly rediscovered or rewritten. This audit looks for reusable contracts and practical authoring rules, assuming a personal app or small local service unless the source shows another load.

## Scope and method

Inventoried **1,158 TS/TSX files** returned by `rg --files app examples`: **116 app files and 1,042 example files**. Excluded vendor, node_modules, build and dist subdirectories. These span 118 top-level directories containing typed source; separate manifest inventory found 16 app manifests and 142 example manifests, including nested projects and entries without typed source. This is an inventory, not a claim that every line or workflow was reviewed.

The source-name scan produced candidates; representative bodies, callers, existing std exports and semantic differences were then read. For example, five functions named `same`/token-comparison candidates resolve to only three real token comparisons. SQL query helpers, color hex functions and test assertions are not counted as equivalent utilities. Named-function counts miss arrow and inline timer wrappers.

Deep reads focused on server apps, web/Markdown/PDF/Hub/Inspector persistence, Sonos/Last.fm, music/music-tree images and display lifecycle, iPod/iPod-web services, selected Discord image/formatting code and camera/pinball geometry. Std bindings were checked in `src/frontend/modules.cpp`; built-in declarations alone are not a complete provider index.

**No production app, std, plugin or engine implementation is migrated by this audit.** Source files were inspected read-only. The delivered changes are this report, two authoring skills, their reuse/quality references, discovery instructions and a clarification of demo scaffolding guidance.

## Findings

### Must fix before sharing the affected behavior

1. **Last.fm batch acknowledgement can discard ignored listens** (`examples/ipod/src/services/scrobble.ts:344`).
   - **What this is:** The existing iPod scrobbler is already shared with iPod-web and drains a saved batch after a Last.fm response.
   - **Problem:** A source-level case is HTTP 200 with no top-level API error but `accepted=0, ignored=1` (for example a daily limit). `flushLastfm` checks the top-level error and then removes the batch without interpreting per-record acceptance. The Sonos client checks these results and retains retryable ignored records. This discrepancy must not become the common contract. No live rejection was induced in this audit.
   - **Fix:** Define accepted/retryable/permanent-rejection results per record, prove the case with a local fixture, and preserve pending listens before extracting a shared transport. Keep queue formats compatible or provide explicit migration.
   - **If we skip it:** A shared client could spread silent loss of listening history to more apps.

### Should fix

2. **Some “missing utilities” already have std providers.**
   - **What this is:** Apps manually implement byte encoding, form/query parsing and path manipulation.
   - **Problem:** Four byte-to-hex helpers across three example families plus Hub's helper duplicate `zinc:web.toHex`. The Hub server and web relay also have duplicate form/query parsers despite `URLSearchParams`. Markdown/Atelier/Inspector implement path operations already provided by `zinc:path`.
   - **Fix:** Use the providers below after edge-case checks; no new module is needed.
   - **If we skip it:** Every new app pays for another implementation and different edge cases.

   | Existing operation | Concrete copies | Provider and migration caution |
   | --- | --- | --- |
   | Bytes → lowercase hex | `examples/notify-relay/src/capture.ts:15`, `relay.ts:17`; `examples/ipod/src/services/sonos.ts:72`; `examples/video/mapper/companion/server.ts:16`; `app/hub-server/src/protocol.ts:6` | `zinc:web.toHex`, `lib/std/web.ts:2230`. Color parsing and hex decoding are different operations. |
   | Form/query parameters | `app/hub-server/src/main.ts:68`, `:75`; `app/web-relay/src/main.ts:40`, `:47` | `zinc:web.URLSearchParams`, `lib/std/web.ts:790`. Check duplicate keys, encoded names, bare names, plus signs and malformed percent encoding. |
   | Paths | `app/markdown/src/state.ts:71`; `app/atelier/app/workspace.ts:59`; `app/inspector/storage.tsx:232` | `zinc:path`: dirname, basename, join, resolve. Root and trailing-slash behavior differ from the local helpers; test the callers. |
   | JSON string quoting | `app/hub-server/src/main.ts:56` | `JSON.stringify`; the local helper replaces some control characters with spaces, so preserve intended signed/catalog behavior. |

3. **Private key/value config is already duplicated exactly.**
   - **What this is:** `app/web/src/conf.ts:4` and `app/markdown/src/conf.ts:4` contain the same 19-line class apart from their first comment. Hub uses the same file grammar at `app/hub/src/services/config.ts:6`.
   - **Problem:** Reading, retaining unknown keys, flattening newlines and replacing the file are maintained independently.
   - **Fix:** One small key/value reader/writer built on atomic file replacement. Keep schemas/defaults local. Hub sometimes writes public installation records and sometimes private tokens; retain the distinction.
   - **If we skip it:** A parser, permission or write-failure fix must be repeated in each app.

4. **Atomic text-file replacement is a proven std need.**
   - **What this is:** Eight source files across six apps write a temporary file then rename it: Sonos `store.ts:4`, web `conf.ts:19`, Markdown `conf.ts:19` and `state.ts:222`, PDF `state.ts:208`, Hub `services/config.ts:29` and `services/installs.ts:184`, Hub server `main.ts:306`.
   - **Problem:** Temporary names, private modes, parent directories and failure cleanup are decided repeatedly. Not every file rename is this operation: user-file moves and engine-package activation were excluded.
   - **Fix:** A narrow **proposed** `zinc:fs.writeTextAtomic` operation. Specify replacement mode/permissions, same-directory temporary ownership, concurrent writers, cleanup and error propagation before migrating callers.
   - **If we skip it:** Small persistence helpers continue to diverge at the point where mistakes can lose user data. Rename alone must not be advertised as an fsync-backed power-loss guarantee or a multi-file transaction.

5. **Async waiting should be a primitive, not another app helper.**
   - **What this is:** Nine files across seven apps wrap `setTimeout` in a Promise. Five further named wrappers occur in three example families. Arrow/inline variants also exist and are not included in those counts.
   - **Problem:** Apps repeatedly implement the same event-loop wait, sometimes returning a meaningless boolean to suit the callback.
   - **Fix:** A **proposed** `zinc:timers.delay(ms): Promise<void>` using existing timer semantics. Define finite/non-negative input and shutdown behavior. Keep Notion rate limiting, MusicBrainz pacing and durable Last.fm retries in their services; do not build a generic job/retry framework.
   - **If we skip it:** Every app keeps recreating the same glue, obscuring the actual service behavior.
   - **Evidence:** `app/web-relay/src/chrome.ts:32`, `app/inspector/state.ts:22`, `app/hub/src/services/running.ts:70`, `app/pdf/src/script.ts:14`, `app/web/src/script.ts:15` and `main.tsx:197`, `app/markdown/src/script.ts:15` and `notion.ts:20`, `app/sonos-lastfm/src/main.ts:48`; `examples/music-tree/src/state.ts:244`, `examples/music/src/main.ts:308`, iPod `musicbrainz.ts:22`, `historyImport.ts:46`, `audiomuse.ts:126`.

6. **Three servers repeat secret-comparison machinery.**
   - **What this is:** Full-length XOR comparisons in `app/hub-server/src/main.ts:50`, `app/web-relay/src/main.ts:49`, and `app/sonos-lastfm/src/server.ts:28` guard HTTP tokens.
   - **Problem:** Their intent is security-sensitive, yet TS source loops are not proof of constant-time execution across native and JS engines.
   - **Fix:** A narrow native byte-comparison primitive on the existing crypto surface, backed by a proven implementation such as the vendored `mbedtls_ct_memcmp` (`third_party/mbedtls/tf-psa-crypto/include/mbedtls/constant_time.h:32`). Keep wrong-length and empty-token rejection explicit at the callers. Test equal, unequal, empty and unequal-length inputs on supported engines.
   - **If we skip it:** Each server continues to carry crypto-adjacent code with an unproven execution property. This audit does not claim a demonstrated exploit.

7. **CLI option parsing has several consumers with different validation behavior.**
   - **What this is:** Five apps read arguments, but three are confirmed value-option parsers: Hub server `main.ts:45`, web relay `main.ts:35`, Sonos `config.ts:14`. Similar parsers occur in LAN arena, pinball3d and the video companion.
   - **Problem:** Some parsers silently accept missing/unknown options; Sonos rejects them. Copying one as std would freeze those accidental differences.
   - **Fix:** A small **proposed** `zinc:cli.parseArgs`, covering observed value options, flags and positionals. Keep application range checks local. Specify duplicate/unknown/missing values and literal `--` behavior before migration; preserve command compatibility explicitly.
   - **If we skip it:** New apps either contain another opaque `opt` helper or build a one-off parser with different failures.

8. **Scrobbling is a shared domain service, not generic std.**
   - **What this is:** `examples/ipod/src/services/scrobble.ts:1` explicitly has no UI/app-state dependency. iPod uses it at `services/listening.ts:14`; iPod-web imports it across example roots at `services/plays.ts:7`. Sonos independently implements Last.fm signatures, browser auth and delivery.
   - **Problem:** The useful existing service is hidden inside a demo. It also differs from the Sonos code: seconds versus milliseconds, batching/queue schemas, GET for auth reads after a documented POST/error-4 incident (`scrobble.ts:97`), and acknowledgement handling from finding 1.
   - **Fix:** A small Last.fm protocol/service plugin or owned shared domain module, **not an existing `zinc:lastfm` API today**. Share proven protocol operations first. Keep observed-position accounting, accounts UI, durable queue policy and ListenBrainz concerns distinct until their contracts agree.
   - **If we skip it:** Authentication and delivery fixes remain scattered, or an unsafe “pick either client” merge loses existing behavior.

9. **Hub's signed protocol is shared but owned by the server app.**
   - **What this is:** `app/hub/src/services/server.ts:9`, `installs.ts:6`, `engine.ts:8` and `app/hub/src/state.ts:3` import `app/hub-server/src/protocol.ts`, also used by the server.
   - **Problem:** Client/server infrastructure depends on a sibling app's private source layout.
   - **Fix:** Move the cohesive Hub protocol to an owned domain module/package/plugin. Preserve exact signed lines (`protocol.ts:65`) and the development-build ordering of `newerEngine` (`:50`). Do not present either as a generic config parser or standard semver.
   - **If we skip it:** Server refactors can break client imports, or generic helpers erase signed-byte/version guarantees.

10. **Stage network pictures have two close implementations, with a different ownership model from UI images.**
    - **What this is:** `examples/music/src/ui.ts:180` and `examples/music-tree/src/core/pictures.ts:34` both manage URL maps, bounded in-flight work, pending downloaded bytes, per-frame decode, downscaling and eviction.
    - **Problem:** Repeated mechanics deserve sharing, but `zinc:ui/image-cache` is not a drop-in: `lib/std/image-cache.ts:3` depends on UI-node references and owns immutable decoded images. Stage references, staged decode and mutable camera/video frames have different contracts.
    - **Fix:** Design the smallest stage/gfx picture-loading contract with explicit ownership, bounded loading, stale-result handling and disposal, then migrate these two consumers. Reuse `zinc:ui/image-cache` for actual UI nodes, as Discord already does at `examples/discord/src/services/cdn.ts:7`.
    - **If we skip it:** Copies diverge, or the wrong cache destroys images that another renderer still owns. No memory/performance savings were measured here.

### Nice to have

11. **Text fitting and contain-image geometry are narrow graphics candidates.**
    - **What this is:** Binary-search ellipsis repeats in `examples/music/src/ui.ts:100` and `examples/music-tree/src/components/primitives.ts:30`. Image contain calculations recur in camera `LiveView.tsx:13`, pinball3d-editor `widgets.tsx:77` and music `ui.ts:256`.
    - **Problem:** Camera floors centering and rounds sizes; pinball rounds centering and clamps sizes to at least one pixel. Similar geometry is not identical pixel behavior.
    - **Fix:** A small gfx/stage helper after agreeing on units, empty bounds, rounding and text measurement. Keep app styling, clipping and corner radii local; prove representative pixels.
    - **If we skip it:** A little duplication remains; this is lower priority than persistence or protocols.

## What should stay local

- Config defaults versus outbox corruption: a recoverable preference file may fall back, but a damaged offline queue must not silently reset history.
- Key/value config versus signed manifests: one normalizes fields, the other must preserve original ordered bytes.
- Notion's bounded 429/Retry-After reads versus durable Last.fm writes: share a wait primitive, not their retry policy.
- Game controls named `readControls`: breakout pointer/keyboard arbitration, platformer held/pressed jump and LAN arena turn/strafe/fire differ in meaning and dead zones.
- Duration formatting: milliseconds, seconds, local wall time, total minutes and hour/minute displays need explicit units and output contracts, not one ambiguous `formatTime`.
- App-specific Section/Row/Pill/Field composition: reuse the existing kit controls without forcing all screen composition into a universal component.
- Resource cleanup: Hub child termination, Chrome/WebSocket ownership and scrobble persistence do not justify an `Application` base class.
- Latest-request counters: small existing guards do not by themselves justify a request-manager framework.

## Promotion order and acceptance bar

Names below are proposals; this report does not add exports.

| Order | Work | Minimum proof before claiming shared support |
| --- | --- | --- |
| 1 | Existing-provider replacements: hex, URLs/forms and paths | Existing caller cases plus the specific changed edge cases; no broad app rewrites. |
| 2 | Delay + atomic text replacement | Small std contract test on the required engines and at least two real migrated consumers; permissions/failure preservation for writes. |
| 3 | Exact key/value config duplication | Load existing files, preserve unknown keys/newlines, public/private modes and write failure; web + Markdown, then Hub. |
| 4 | Native secret comparison + small CLI parsing | Their actual callers and explicit boundary behavior; no general crypto/config/server framework. |
| 5 | Last.fm and Hub domain ownership | Reconcile acceptance/auth/queue behavior first; keep signed bytes and old state. Then move callers together. |
| 6 | Stage pictures, then small gfx operations | Two concrete consumers; stale/idle/lifetime/pixel behavior. Do not merge UI cache and camera/video ownership. |

Follow the current backlog freeze: record this evidence and ordered needs, not a new task per helper. No automatic bulk refactor, deployment, service activation or package installation is authorized by this audit alone.

## Authoring skills delivered

- `.agents/skills/zinc-app/SKILL.md`: search existing providers and real consumers before implementation; distinguish std, protocol, renderer and app policy; write readable ownership and lifecycle; inspect the full diff and prove behavior.
- `.agents/skills/zinc-app/references/reuse-map.md`: concrete provider lookup points, including services already in demos and proposed APIs that do not exist yet.
- `.agents/skills/zinc-app/references/quality-bar.md`: evidence-based review questions and observed failure modes; no arbitrary file/class/line score.
- `.agents/skills/zinc-demo/SKILL.md`: app quality plus existing demo UI/input/idle/resource rules, without manufacturing scaffolding.

The skill creator validator checks metadata/structure only. An independent read-only forward check applied the skills to a Sonos scrobbler and an idle HP TouchPad music remote, verifying actual exports. It correctly selected existing Sonos/scrobble services and stage resources, and identified scaffolding ambiguity and recovery-guarantee wording to clarify. This is workflow review, not proof that every future app will be good.

Verdict: **Improve provider discovery immediately; then promote the few proven primitives and domain services with their consumers.** Readability comes from explicit responsibilities and contracts, not a larger utility framework or a shorter compressed entrypoint.

Lean: several copies can disappear using already shipped APIs; no numeric line, dependency, RAM or speed savings are claimed without migrations and measurement.

Not checked: every application flow, all JS/native/scripts/templates, real remote failures, live hardware, runtime tests, cross-platform behavior, every UI component or whole-repository security. No app/service/device was started for this audit.
