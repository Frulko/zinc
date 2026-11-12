---
id: ZN-1034
title: 'iPod demo: layout and small usability fixes on the Mac'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
labels:
  - ipod
  - ui
  - size-M
  - demo
milestone: m-15
dependencies: []
ordinal: 17300
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small defects of examples/ipod seen at normal window sizes plus the missing hooks of the toast kit.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- iPod web: the Songs page renders every row (2400 songs = 34k DOM nodes, heap 16→105 MB); use a virtual list.
- ZN-857: the iPod demo's album grid should take its column count from the window width (fixed at 4 now); a wider window wastes space.
- ZN-857: the Optimise page could offer one-click fixes for its other findings (fill missing tags or covers from a duplicate or online, delete empty playlists).
- iPod demo: the arrows of an album's or playlist's rows show progress during a whole-album download (needs per-track progress from ipod.onProgress).
- iPod demo: "Show details" on a failed toast opens the failed job's row on Transfers, not just the page.
- kit: toast() and addToast return a handle that can be updated (title, progress, actions), so apps do not each rebuild a live toast like the iPod demo's.
- iPod demo: covers in the cache are not invalidated after setArtwork (one size per album); invalidate by track when the cover changes.
- iPod demo: history entries survive opening another iPod; reset the history when a device opens.
- iPod demo: the Devices page does not show the "waiting for the iPod" line yet (the signal exists).
- iPod demo: the track tables at 1180 px leave the Title column a few characters wide beside Artist and Album/Why; give Title a minimum width or narrow the fixed columns.
- iPod demo: AudioMuse auto-sync only follows analysis tasks; a clustering run that ends after one does not sync again.
- iPod demo: "From A to B" drafts last only for the run (not kept in genius.json like the Genius lists).
- iPod demo: the mood mixer's tempo bar and the volume bar are click-only; add dragging to both.
- iPod demo: the now-playing display is crowded at 1180 px (the time label touches the cover).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Album grid column count follows the window width; Title column keeps a minimum width at 1180 px; the now-playing time label no longer touches the cover
- [x] #2 Devices page shows the waiting-for-the-iPod line; history resets when another iPod opens; covers cache invalidated after setArtwork
- [x] #3 kit toast()/addToast return an updatable handle (title, progress, actions); the failed toast "Show details" opens the job row; album rows show per-track progress
- [ ] #4 The mood mixer tempo and volume bars drag; "From A to B" drafts are kept in genius.json
- [ ] #5 T1 of the demo still passes
<!-- AC:END -->

## Implementation Notes

2026-11-12 — AC1 only; task stays Backlog and AC2–5 remain open.

- Album rows derive their column count from the live content container (`createNodeRef`, `ui.inspectNode().lw` and a watcher removed on cleanup). The same signal drives row count and slices, including resizes that keep the row count unchanged. Virtual rows, cover disposal and the existing scroll key remain in use; photo columns are unchanged.
- Headers and rows share column constraints: Title has a 220 px minimum; Artist and Album/Why shrink from their established widths. At 1180 px total content with the 232 px sidebar, measured Title is 316 px in the full table and 221 px beside the additional 250 px playlist panel. The latter keeps Artist/Album at 116/129 px, or Artist/Why at 111/134 px; headers align and Time/download remain inside the content.
- The LCD and progress rail use the room their parents provide. A scoped watcher measures the rail for its numeric fill, and seeking reads the current live rail width with a zero-width guard. Time labels have 48 px each; controls remain present, with more compact outer spacing. The measured rail is 86 px at 1180 px with the real sidebar, HistoryBar, SleepButton and OutputButton, including radio controls.
- Provider reuse: solid refs/signals/cleanup and UI watchers/inspection already exist; no timer, new dependency, engine, UI library, service, daemon, device or network change. Classic layout documents `widthPercent` as RN-only, so this component uses the supported measured numeric width. Abandoned newly introduced percent forms and their authentic failure logs are preserved.

Research supplied by the coordinator: [Flutter parent constraints](https://docs.flutter.dev/ui/adaptive-responsive/general) and [LayoutBuilder](https://api.flutter.dev/flutter/widgets/LayoutBuilder-class.html) support measuring the local container; [React Native FlatList](https://reactnative.dev/docs/flatlist) supports preserving multi-column row grouping, and [View](https://reactnative.dev/docs/view) documents local layout ownership. No library was needed.

Proof: read-only common CLI SHA256 `582d603d120b94208e3bb64ade3cfa0d9ca37065f38a65572d566ab743cddaee`, compiled source `87adfb949`, with this worktree's app/libs/providers. Original app check passes (103 files), final `.logs/stage-17-final-check/check.log`. The ephemeral fixture copies production components and explicitly rewrites service/state imports to in-memory providers (`.logs/fixture-v1/import-injection.json`); it does not run the app entrypoint, playback, discovery, mounting, device reads or network calls. Real rendering passes on the interpreter (`stage-19-final-vm-dispose`), QuickJS (`stage-15-quickjs`) and actual native AOT (`stage-16-native`, 31 units/link/run native, then same binary `stage-18-native-closure`). Native app, inputs and key are retained; no interpreter fallback counted.

The fixture proves 4→5 columns with seven albums/two rows and 3→4 columns with two albums/one row; empty/one/1000 albums, bounded mounted rows, bottom-scroll clamping after shrinking, remount and cover release; table boxes/alignment and retained Why/Time/download space; LCD fill/current seek endpoints/zero-width handling; final cover disposal and no layout work from disposed watchers. The inspected final capture is `.logs/stage-14-final-capture/shot.png`: actual layout constrained to 1180 px on a 1600×760 headless surface, not an OS window resized to 1180 px. No timing, RSS, whole-app, real-device or cross-platform claim.

All failed fixture/debug stages and preimages are retained. Early manifests include app/lib/plugins/include/runtime and compiler modules/archives; `src`/`third_party` header/font snapshots were added from stage17, before the final native re-execution and interpreter proof. Product source stayed unchanged outside the four app files. No suite, T1, golden, committed app test or pixel-comparison campaign was added or run.

**Proposed tests**

- Owner-selected existing `tests/run --only ipod_demo`: full demo session with actual startup and page interactions, roughly 10–30 seconds plus compilation; memory unmeasured. AC5 remains unchecked until the selected session passes.


2026-11-12 — original AC2 complete; task stays Backlog, AC1 stays checked and AC3–5 stay open.

The Devices page renders the existing `session.waiting` signal, including a long saved title, and removes the line reactively when it clears. Production `state.showOpened()` already reset navigation after successful local and remote opens; it is unchanged. The proof starts the real history, visits pages with searches/selections/scroll keys, then opens another local iPod and a remote one and verifies defaults plus no back/forward entries. Same-device and failed opens are separate controls. Listening history is untouched.

Artwork changes go through the existing `updateTracks`/`updateMany` provider and `patch.artworkFile`; no direct artwork API or remote mutation route was invented. Successful update/save invalidates the affected tracks at every cached size and album/track alias and refreshes surviving viewers. Unrelated tracks/photos remain cached. Four consumers own exact returned disposers, so old cleanup cannot release a replacement, disposed callbacks cannot fire, and late images are destroyed once. Load state/generation and retained errors distinguish cold/loading/ready/failed/closed; reentrant notifications, failed loads and callback exceptions are covered.

The genuine missing lock provider was supplied independently by ZN-1130. One per-iPod `fs.tryLock`/`unlock` critical section orders read→temporary PNG→freshness→atomic publication/decode against artwork update→save→old-PNG deletion. The app releases every acquired lock in `finally`; bounded asynchronous contention and pod cancellation do not block the UI. Captured directory/pod epoch and track revision reject old replies; prefetch stops across pod changes, including close/forget/failed remote open/successful remote eject. Existing disk filenames stay the same. Shared filename-component validation rejects empty/NUL/slash/backslash IDs before native artwork mutation or cache writes, retaining valid IDs verbatim. Editor/repair no longer repeat global cache deletion.

A cache deletion failure after a successful native save is explicitly different from a native update/save failure: the affected session entry is Blocked, old visible handles are cleared, rereads refuse the obsolete PNG, and the mutation caller receives “Artwork saved, but…”; unrelated entries remain usable and a later successful artwork mutation can recover. An unwritable disk cannot promise durable invalidation across restart. Native save failure can also retain unsaved in-memory database edits for a later save (inherited behavior): no rollback or whole-database transaction claim. Proposed later line: audit failed native artwork save followed by another save for transaction/cache coherence.

Research supplied before work: [React async cleanup](https://react.dev/learn/synchronizing-with-effects), [effect ownership](https://react.dev/reference/react/useEffect), and [Expo image memory/disk cache keys](https://docs.expo.dev/versions/v55.0.0/sdk/image/). They informed exact leases and revision ownership; no dependency was added. The app-specific instance/socket lock was rejected rather than repurposed.

Final proof uses read-only common CLI SHA256 `8848b04a673fad0fa4fae8bb6a73d10a60073af019619ffb70b3071619f00409`, compiled/source `6991e4d1c3a06b379929fc51a69bfc3d0d7e3776`, and this worktree's source/headers. TRUE first-reset base remains `fa05a53ce4447fc1b9bf91810e8c160a807a6612`; an approved fast-forward to the lock provider preserved all ten owned source hashes. Original app check passes (103 files; existing U0001 old-icon warning), `.logs/stage-19-final-checks`. Production provider/cache/leases/navigation/Devices fixtures pass on interpreter, QuickJS and actual native execution in `stage-20-final-vm`, `stage-21-final-qjs`, `stage-22-final-native`. Native apps, keys and inputs are retained, with no fallback counted. Deferred native/remote writers, filesystem, lock and graphics providers are injected before imports: these prove production app functions, not real device/network/audio/cache operations. Native filesystem locking is the independent ZN-1130 proof; its unclosed-VM-scope AC remains open.

The final controls include all size/alias loads, simultaneous same-alias/different-track, completed/pending/released/duplicate viewers, stale cleanup/reacquisition, cross-pod IDs/events/prefetch/eject, exact frees, native failures, post-save cache deletion failure, timeout/cancel, temporary cleanup and invalid IDs with no file/native call. Long-title and cleared-line captures `stage-05-waiting-capture/shot.png` and `stage-04-navigation-vm/shot.png` were inspected. Early incomplete fake Device, late render registration, mislabeled interpreter stage7, snapshot-only stages13/18, and fixture empty-array failure remain preserved and are not final proof. Early manifests omitted Objective-C++ provider source and provider binary preimages; final corrected source closures include `.mm`/JS/shader/header inputs before execution, with immutable compiler/recursive archive/provider closures and all native products. No suite, T1, committed app test, golden, pixel comparison or performance claim. Usage: n/a.

**Proposed tests**

- Owner-selected existing `tests/run --only ipod_demo`: full app startup, page/session/device interaction and AC5, roughly 10–30 seconds plus compilation; RSS unmeasured.
- Selected two-process artwork/cache ordering on a safe fake iPod with native filesystem locks, roughly 5–15 seconds plus compilation; RSS unmeasured.
- Selected read-only cache, slow remote cover and failed-artwork-save→later-save coherence cases, roughly 10–20 seconds; RSS unmeasured. These are proposed, not new committed app tests.


2026-11-12 — original AC3 complete in full; task stays Backlog, AC1–3 checked and AC4–5 open.

Both public toast APIs now return typed `update`/`close` handles. Updates change the existing title, description, actions and numeric progress (kit `progress`, Nuxt `value`, 0–100); only an explicit kit duration update changes its deadline. Old positional kit calls, singular action and Nuxt boolean expiry progress keep their meaning. Replacement actions use the existing keyboard controls. Serial checks, one close transition, owned detached subtrees, removal from parent child lists, cancelled timers and root teardown reject old handles. A one-shot root binder handles React's initial effects before `ui.mount`, then unregisters. Simultaneous due alarms cannot dismiss an entry that another callback already cleared.

The iPod's live cards and +N indicator consume those handles, with its last three full cards, persistent waiting/running/failures, cancellation, dismissal, hover/focus pause, success expiry and hidden-on-Transfers behavior retained. Show details stores the monotonic job ID before navigation clears ended toasts. The mounted row expands that exact job, checks its row/scroller generations and actual geometry, scrolls it into view and consumes the request only after reveal. Missing/cleared jobs and unmount clear the request; manual row expansion stays usable from pointer and keyboard.

Each download job carries ordered track membership and an explicit `DownloadState` enum with one transition boundary. Native copy events use the current ordered index and download completion advances that index, including skip/error entries; filenames are never identities. Final results settle each indexed member independently, so a partial job result does not turn a failed track into success. Latest queued membership wins for album, playlist and standalone requests, including a cancelled retry. Aggregate counts stay monotonic when final native results arrive. The existing native batch call is unchanged. The remote wrapper reports each track's start/end/result without inventing byte progress or changing its fetch/daemon protocol.

Research supplied before work: [Nuxt toast identity/update semantics](https://ui.nuxt.com/docs/composables/use-toast) and [WAI alerts without focus theft](https://www.w3.org/WAI/ARIA/apg/patterns/alert/). Existing UI ownership, generations, controls, watchers and scroll APIs suffice; no dependency, engine, host.ts, UI core, native iPod API or filesystem provider change.

Final proof uses read-only common CLI SHA256 `8848b04a673fad0fa4fae8bb6a73d10a60073af019619ffb70b3071619f00409`, compiled source `6991e4d1c3a06b379929fc51a69bfc3d0d7e3776`, with this tree's source/providers. TRUE first-reset base is `109e3741bbf6dfe3dc69273e7a00d441a557b9fd`. Original app (103 files), actual kit gallery (58), Nuxt UI (5) and both public test fixtures check cleanly, with only the inherited U0001 old album icon warning (`stage-25-before-final-checks`). Exact shared `kit_overlays` T0 passes interpreter and QuickJS in Solid and React. It covers card identity/progress/actions, callback replacement, keyboard activation, expiry/pause, simultaneous due callbacks, eviction/clear, parent effect/rerender ownership, destruction/recreation and stale handles; the React case creates handles through an actual event and useEffect before rerendering its parent. Both public fixtures also pass actual native AOT (`stage-29-final-api-solid-native`, `stage-30-final-api-react-native`).

The production fixture copies full actions/transfers/download wrapper/state/Toasts/DownloadMark/TransfersPage with explicit import injection before imports (`.logs/fixture-progress/import-injection.json`). Deferred in-memory native/remote/filesystem/log/dialog/opener providers prohibit actual discovery, device, network, audio, OS dialog/reveal and cache operations. It passes all six markers on interpreter (`stage-26-final-production-vm`), QuickJS (`stage-27-final-production-qjs`) and actual native AOT (`stage-28-final-production-native`, 29 units/link/run native). It inspects actual progress-ring values, duplicate filenames with distinct IDs, skip/error/partial/all-error/cancel/retry/overlap results, remote start/end/error, keyboard and pointer exact-row reveal after remount, request clearing, persistent dismissal and last-three/+N keyboard behavior. A separate small C++ harness runs the actual `runtime/zrt_jobs.h`/promise queue with the null runtime and observes all progress posts before final finish/promise (`stage-15-before-detached-close`). It does not read an iPod. Native capture `stage-31-final-row-native-capture/shot.png` was inspected: Exact failed row is expanded and fully visible near the bottom while Other failed row remains closed.

Native apps, keys and all cache inputs are retained before/after cache reuse. Final unchanged-source verification covers seven stages, 9,498 source/script/fixture inputs, all 100 recursive common compiler archives/dylibs including SDL, and 14,139 cached provider artifacts/stamps plus active generated headers/objects (`.logs/final-verification.json`). Immutable full compiler source/dependency closure remains referenced in archive103. All failed stages and preimages remain. The first check runner was written after stage01's snapshot but before execution (corrected from stage02); active generated provider headers/objects were added before final stages20–31. Earlier closures are not claimed complete. The extra nullable onAction-clearing extension was removed as unsolicited: its retained failure follows D18's shared null/undefined representation, distinct from D339 checked-conversion admission. Required actions:[] clearing and function callback replacement are proven; no nullable-field semantics fix is claimed. Later failures from early keyboard timing, wrong test button tag/layer assumptions, and the real detached-child/pre-mount-root ownership defects are preserved rather than overwritten.

No suite, T1/T2/demo script, new committed app test, golden, pixel comparison, benchmark, whole app startup, real device/network/cacheFS or OS-window session was run. No timing, RSS or cross-platform claim; no owned process remains.

**Proposed tests**

- Owner-selected existing `tests/run --only ipod_demo`: full startup, device/session/page interactions and remaining AC5, roughly 10–30 seconds plus compilation; RSS unmeasured.
- Owner-selected safe fake-iPod native download session: actual libgpod file copying/skip/error and album/playlist arrows, roughly 10–20 seconds plus compilation; RSS unmeasured. The production queue mapping and actual Jobs ordering already pass the bounded injected proofs.
