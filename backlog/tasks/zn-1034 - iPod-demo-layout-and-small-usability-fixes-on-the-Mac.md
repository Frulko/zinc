---
id: ZN-1034
title: 'iPod demo: layout and small usability fixes on the Mac'
status: Backlog
assignee: []
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
- [ ] #2 Devices page shows the waiting-for-the-iPod line; history resets when another iPod opens; covers cache invalidated after setArtwork
- [ ] #3 kit toast()/addToast return an updatable handle (title, progress, actions); the failed toast "Show details" opens the job row; album rows show per-track progress
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
