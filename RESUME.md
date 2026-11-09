# Resume — Zinc backlog coordinator, session2026-11-09

Continue zn-coordinate until main `.paused` exists or no startable work remains. Never ask the owner. This root is the only backlog coordinator; current claims/integrations are in docs/reports/backlog-review-2026-11-07/COORDINATOR.md. No push. New workers inherit the configured model after “on rebascule”; Fast remains in launchers, no global model setting change.

## Active work

| Work | Location | State |
| --- | --- | --- |
| Core batch1101/1104/1103/1102 | work/1101, .worktrees/1101 |1101/1104/1103 integrated;1102 ready ab4d4dd61, clean. Integrate then retire completed batch. Fresh core1105(text hit) then1106(nullable numeric widening); no sixth task in old batch. |
| Code13 | work/1078-code, .worktrees/1078-code | Five controls implemented via editor/Markdown/inspector providers. Earlier both-model/all3 proof passes; actual inline links await1105. Provider laziness improves unused import cost; final captures/gate remain. No core edits. |
| Tool panels14 | .worktrees/1078-panels-research | Primary research complete/clean, source copies in.logs. Task claimed. Persist research into task and start fresh implementation worktree/agent; do not resume researcher for implementation. |
| Data12 | integrated8f8478bd5 | Backlog AC2complete; root kit_data12-run all3 incl actual FS PASS with1101 candidate. Final combined gate/proofs close AC1/3. Eight inspected pictures. |
| Feedback11 | integratedc9be3d26a | Backlog AC1/2complete, AC3finalcombinedgate pending. Defaults without manifest, light/dark/action/360px proof allpass after1104. |

## Latest integrations and proofs

Session main has33 distinct Done tasks before family final closure:1078.03/.04/.05/.06/.07/.08/.09/.10 and1079–1101,1103,1104.1102 is still private/unintegrated. Inputs/Navigation/Pickers done; Data/Feedback finish after root final checks. Earlier details/known failures/proposed tests are archived losslessly in docs/reports/session-handover-2026-11-09.md.

-1101 cwd902de09c0: shared project working directory across all3, launchDir preserved, invalid/missing entries rejected. Root clean rebuild +project_cwd all3 PASS; actual combined Data12runs PASS. No engine-conditional app path.
-1104 reader8c31f5cb7: QuickJS optional icon probe had accepted sibling directories as empty files, losing PickersSection export. Two-line regular-file guard; actual Feedback gallery all defaults/action/narrow PASS and root clean library_icons PASS. No reachability-policy change or manifest workaround.
-1103 serialization20fc72043: lossless private SVG path constructor. Exact byte-equal canonical/alias/unknown/metadata oracle all3 PASS; library_icons and original Picker(interp)/Data(native)/Feedback(QJS) short smokes PASS. Actual unchanged combined gate: JS235400/238485/275177 B,4076 B/component,172 B strict total headroom; AOT5325320/5374848/5926624,61308 B/component.551 B ten saving; no feature/icon/budget cut. Cold helper/concatenation cost unmeasured.
-1102 readyab4d4dd61: private typed TS collection result snapshots, rawJS/packages/embeddedScript native, no prototype patches, optional/getter/this/async/yield/super/hashbang boundaries tested. Candidate gate JS235831/238916/275608 (same4076/component/172Bheadroom,431 B shared base); AOTunchanged. MquickJS retains existing ES5 unsupported-Map boundary. Integrate/rebuild/test exact collection_results.
-1100 nullable string keysbaf4c2d0f:160-string hash/rehash/delete/reinsert/null-vs-empty/reference cleanup all3+leak proof PASS. D18 typed nullish representation preserved; owner array WIP untouched.
-1088/1090/1093–1099 solved metadata size, host contract, library defaults, JSX IDs, flatMap, neutral ownership/virtual rows/reentrant disposal, pending scroll, constructor inference and nullable cleanup. Their original consumer proofs pass. DecisionsD270–273 and raw provenance are tracked; do not integrate obsolete private checkpoints.

## Next core tasks

-1105 claimed: ui.textOffsetAt(h,x,y), local coordinates, source-string glyph offset/-1 outside. Code13 real inline links are blocked. tsPosAt currently returns flattened displayed-line CARET units; rich runs lineAt keeps source offsets. Reuse geometry, preserve old selection units, handle plain wraps/whitespace/newlines/nonASCII/boundaries. Code worker prepared provider, no duplicate link buttons/layout copy. Primary Flutter/CSSOM references in task. Fifth slot was reserved in prior batch but no source started; use fresh context with1106 after old batch handoff.
-1106 claimed for NEXT fresh batch: baseline optional Map length i32→number|undefined creates invalid IR Box<i32>→Box<f64> refcast. Repro/log .worktrees/1101/.logs/1102/optional-length-original.ts and optional-length-baseline.log. Exact i32 annotation is a separate1102 test, no original-program workaround. Fix generic nullable numeric coercion with existing profile rules/ownership.

## Machine and clean binaries

- Retained clean tree .claude/worktrees/agent-aae96db4e67d4b8e6 is reset to20fc72043; current tools/build zinc completed through1103. Use read-only binary there with ZINC_ROOT=$worker_tree. New1102 still requires integration/rebuild. Frozen worker binaries .worktrees/1096/build/zinc and .worktrees/1100/build/zinc are obsolete after final handoffs; archive then remove completed clean trees/branches, notify remaining users first.
- Every heavy command uses absolute tools/work-run SECONDS COMMAND ARGS, one queued command per worker. Two building trees globally, one app/test at a time, bounded/headless or ZINC_BACKGROUND=1, no leftovers. Queue is healthy; cached static checks only outside it. Markdown/Discord plugin auto-builds also go through queue. No synthetic load.
- Main carries external WIP: ui.ts42add19del sparseFenwick, src/main.cpp12/0 display, rt.h137/1 array storage, rtcalls30/17, machine3/2, perf15/0, runtime/LVGL/host/changelog/affected edits. Preserve every hunk; tools/integrate restores them. Do not build main. Its unfinished prependRows still uses old array fields after hs became Map; known unrelated overlay failure, do not re-investigate.
- Stage only owned appended performance blocks via HEAD+block/hash-object/update-index. Main index is clean at checkpoint. Check conflict markers/affectedJSON and immutable stash IDs after integration.

## Tests to run — owner chooses milestones

Only exact T0/short feature proofs now; no suites/T1/T2/demo/pixelcompare/fuzz/fullbench. Proposed physical keyboard/VoiceOver/touch, Pi/Mojave glyphs, long virtual-scroll/churn/RC/energy and quiet-machine UI-work scaling remain in task notes/archived handover. Shared allocation/inlining and cold SVG costs unmeasured. Earlier paired Pi Script+SVG aarch64 proof10391584 B returned42, exit0, no remote process. CLI baker64MP/engine callback ABI unchanged; runtime image cap16MP.

Owner responsive/password gallery is Done, pictures docs/img/design/gallery-responsive.png and password-reveal.png. Run from retained clean tree: PICTURE=gallery ZINC_SIZE=1280x900 ZINC_ROOT="$PWD" build/zinc run docs/img/design/src --interp. Kit: ZINC_ROOT="$PWD" build/zinc run examples/ui/kit-gallery --interp; GALLERY selects actions/chrome/inputs/pickers-values/selection/navigation/overlays/feedback/data. Agent runs stay bounded/background.
