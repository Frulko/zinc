---
id: ZN-1039
title: 'Pinball editor: rules and scene follow-ups'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:38'
updated_date: '2026-11-12 10:52'
labels:
  - pinball
  - ui
  - size-M
milestone: m-27
dependencies: []
ordinal: 17500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small features and defects of the table editor listed under ZN-649.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-649.14: a rule of a pinball table can listen to the plunger, so a skill shot needs no hidden sensor.
- ZN-649.14: narrow a rule's `event` by its `on` (and multiball's `jackpotOn`/`jackpotEvent`); it changes every session that chooses an event.
- ZN-649.14: a deletion could hand the rules to another thing of the same kind; a list `do` on a mission; lights or elements chosen by a click on the top view; a renamed counter is not renamed in the rules that use it; the scores grid needs a horizontal scroll under 1440 wide.
- ZN-649.17: a table or package dropped on the window could join the list (zinc:system `drop`); free the scene and sounds of the table that leaves.
- ZN-649.16: keep the editor's mirror axis and view with the table folder; today they are recomputed at each open.
- ZN-649.16: Save as and Open a package have no button (a button changes every golden frame of the top bar); the file-dialog path and the refusal of entry names that leave the folder (`..`, absolute) have no test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A rule can listen to the plunger; a rule event is narrowed by its on; deleting a thing hands its rules to a same-kind thing
- [ ] #2 A renamed counter is renamed in the rules; the scores grid scrolls under 1440 px
- [ ] #3 Dropping a table or package on the window joins the list; the leaving table frees scene and sounds
- [ ] #4 The editor mirror axis and view are saved with the table folder; Save as / Open package have a path test
<!-- AC:END -->


## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-12 — Resource lifetime increment of AC3 only, reviewed and proven after the try-flow blocker ZN-1124. All four original compound criteria remain open: this does not implement the dropped-table chooser, plunger/event/deletion rules, counter renaming/grid, or persisted view/package dialog path coverage. The coordinator retains the claim until integration; resume the original criteria rather than create a follow-up task.

Need → provider → gap: scene geometry and camera target → existing Mesh.dispose/Camera.dispose in zinc:3d → app ownership and rollback; sound samples → existing Sound.unload in zinc:audio → app owners previously only stopped playback. No new dependency or native/core change. Source research is archived in MAIN .logs/research-apps-j.txt: [three.js cleanup](https://threejs.org/manual/pages/cleanup.html) and [separate resource ownership](https://threejs.org/manual/pages/how-to-dispose-of-objects.html) support explicit geometry/target disposal without destroying shared textures.

TableScene and TableAudio each have an explicit Building/Ready/Closed lifecycle, constructor rollback, idempotent close and closed-use rejection. Scene mesh ownership includes the unused ball mesh and the mesh shared by multiple balls. Player replacement prepares the next resources before retiring the current owner; partial failure rolls back. Editor drop/rebuild frees scene, audio and physics; failed unpublished game construction frees physics. Sound stop affects its owner only; soundcheck uses finally to unload. Explicit Refresh closes the scene before invalidating images. Shared table-image cache remains retained and is never cleared per scene; the editor top view and replacement scenes can share it. The editor play-window camera remains separately owned by its existing window lifetime.

Proof: read-only common CLI from source 8975a1c6df5b7b073e2b6871acc035eb924aa94f, SHA256 e6d849aae62e3dca2075a49b3bb7086c5241fb26d0984c7bbac1fdb7ba9916c7; own ZINC_ROOT, real native providers, deterministic/headless/background, every heavy command bounded through MAIN tools/work-run. No CLI build. Player 19-file and editor 36-file checks passed. Exact tests/t0/pinball_lifetime.sh passed interpreter, native and QuickJS: native mesh/target baseline restoration, construction rollback, shared/unused geometry, repeated disposal after replacement, closed use, unrelated sound survival, and 260 bounded unload/reuse cycles. Audio has no native byte counter: slot reuse proves the reclamation path, not RSS or total byte stability.

Actual player: 15 interpreter frames, three Tab switches (Twilight Fair → Tidal Lock → Twilight Fair), captured and visually inspected. Actual editor: 15 interpreter frames, 3D pane then play/stop/play/stop, two start logs, captured and inspected. Ephemeral .logs/editor-lifecycle.ts passed on all three engines: three actual state.setField document edits replace/close old scenes; game restart and stop/rebuild return native mesh/target counts to baseline. Its first invocation omitted the editor's dialog permission; that failed log is preserved, then a proof-only zinc.json declared the existing editor permissions. No engine or app workaround. Original minimal failed checker proof, ten parked source snapshots/hashes, final scripts/logs/captures and freeze manifest remain under this tree's .logs. Archival loss: reusing the parked check script overwrote its original failed full-player check-player.log with the current PASS; the coordinator found no backup. That full log is unrecoverable. The original minimal try-init.ts, failed try-init.log and proof script remain authoritative; no failure was reconstructed. No process left running.

Remaining limits / proposed later line: ZN-1039: bound or explicitly own the shared table-image cache across many distinct tables; preserve top-view/panel sharing before reclaiming images. Native VM unload and raw plugin-handle generations are outside this app fix. No whole-app memory stability claim, GPU proof, long session, suite, benchmark or cross-platform run.

Next work: inspect examples/pinball3d/src/chooser.ts and existing editor drop handling before adding dropped table/package choices; continue AC1/2/4 in this same task. No new task or decision number. usage: n/a (tools/usage transcript unavailable).

**Proposed tests**
- Existing tests/demo/pinball3d_chooser.sh: chooser/input compatibility after cleanup, roughly seconds, modest app memory; owner-selected milestone only.
- Existing editor demo sessions for edit/undo/refresh/play and package paths: shared-image and document interaction, roughly seconds to a minute, one app at a time; owner-selected milestone only.
- A bounded repeated-table memory run on a quiet machine: separately measure shared cache retention and native audio bytes; no duration/RSS result claimed here.
<!-- SECTION:NOTES:END -->
