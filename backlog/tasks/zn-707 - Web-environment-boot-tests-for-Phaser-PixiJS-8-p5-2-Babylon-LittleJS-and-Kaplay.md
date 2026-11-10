---
id: ZN-707
title: >-
  Web environment: boot tests for Phaser, PixiJS 8, p5 2, Babylon, LittleJS and
  Kaplay
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 22:50'
updated_date: '2026-11-10 13:15'
labels:
  - js
  - qjs
  - testing
  - size-M
milestone: m-22
dependencies:
  - ZN-565
  - ZN-569
ordinal: 20700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Boot tests for PixiJS 8, Phaser, p5 2.3 only; log goldens; Babylon, LittleJS, Kaplay become later.md lines.

(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) PixiJS 8 and Phaser run in scratch once the WebGL defects of ZN-565 are worked around; p5 2.3, Babylon 9 and LittleJS ran in probes; Kaplay stops at `new AudioContext` (ZN-573). A T1 boot test each, the library vendored when its licence allows and fetched pinned otherwise (tools/test-lib).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each library boots to a first frame headless with a log golden
- [x] #2 the PixiJS 8 half of webenv_pixi runs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Six library boot tests is a lot; do PixiJS 8, Phaser and p5 first (one test each), the rest as later lines; Kaplay waits for AudioContext (ZN-573).
<!-- SECTION:NOTES:END -->


2026-11-10 worker proof (branch work/707):

- Reused the existing PixiJS 8.22.0 and Phaser 3.90.0 harnesses and fixtures. Added only p5 2.3.4 to `tools/test-lib`, the existing sequential two-version `webenv_p5` harness, and `page-v2.out`; p5 1.11.13 pin/golden retained. Neither LGPL build is vendored. Internal test coverage only, no user-facing behaviour/changelog change.
- Official research: https://pixijs.com/8.x/guides/components/application describes `await app.init()` and ticker setup; https://docs.phaser.io/phaser/concepts/game describes normal Game/scene boot; https://p5js.org/tutorials/v2_transition/ documents v2 input/asset changes, so v1 coverage remains separate. https://registry.npmjs.org/p5/2.3.4 independently confirms LGPL-2.1 and the official archive. Independently downloaded and checked archive SHA256 `af29afdfa8c5d1096fb1335d6160f7b17be12d1eb21e69782f47c57c05893a48`, member `package/lib/p5.min.js` (990638 bytes) SHA256 `bb8b82b97fcbcd5bb2d5475d1b6a3904f3ab4ed01b821134fd8f1e7710fce559`.
- Scope: `tools/test-lib`, its existing p5 harness/page/goldens, this task and `docs/reports/zinc-next-webenv.md`. Existing `tests/affected.json` maps the tool and webenv golden directory; no new mapping/module/library wrapper. Other p5 consumers keep 1.11.13. No native/compiler build or library source modification.
- Actual direct proofs, one at a time through `/Users/mowmow/Lab/zinc/tools/work-run 30`, all headless deterministic scale1, `ZINC_ROOT` this tree and common read-only compiler SHA256 `e5206875f798939a9c36115ef6d8df44be782b8e1e32aaef2dafe5439eae3461` (built from3e0925d48): Pixi8 `page.js`10 frames with `pointer.input` and `picture.js`4 frames exactly match both existing log goldens; p5 existing `page.js`8 frames with each cached unmodified build exactly matches its version golden. Both p5 versions run setup320x240, preserve native Promise, render frame1/5 centre255,120,0,255 and corner20,40,60,255 with GLerror0. Pixi8 ticker/input/worker-loaded image pixels match existing logs; AC2 passes.
- AC1 remains open: Phaser existing `page.js`12 frames with `game.input` boots and all frame2/8 pixel/GL checks match, but pointerdown logs scene frame4 versus golden5, keydown5 versus6 and frame5 leftDown true versusfalse. A second identical run reproduces exactly. The input file schedules down at hostframe4/key at5; mapping to scene updates needs review before deciding whether the golden is stale or engine scheduling regressed. Fixture, library and golden unchanged; no workaround. Logs `.logs/707/phaser{,-repeat}.{out,err}`. Next command (from this tree): `/Users/mowmow/Lab/zinc/tools/work-run 30 env ZINC_ROOT="$PWD" ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=12 ZINC_INPUT=tests/golden/webenv/phaser/game.input /Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc run tests/golden/webenv/phaser/page.js --engine quickjs`; inspect frame callback/input ordering against the preserved golden.
- Static checks passed: `sh -n tools/test-lib tests/t1/webenv_p5.sh`, `git diff --check`; direct outputs checked with exact byte comparisons and no `Uncaught`. No T1 harness/suite or native build run. All started runs exited; no leftover process. RSS/time were not measured, so no memory or performance claim.
- No new decision number or later.md line: external p5 cache and fixture reuse follow existing policy; Babylon/LittleJS/Kaplay already deferred in later.md. Proposed decision text if needed: retain each p5 major's hash and output, reusing one unmodified WEBGL sketch rather than duplicating boot fixtures.
- Usage: n/a (`tools/usage`).

Proposed tests (owner milestone only):
- `tests/run --only webenv_p5`: both pinned p5 major versions, setup/rAF/WEBGL flat-colour logs and no uncaught rejection; ~2s with warm cache, downloads can take up to120s/version, RSS unmeasured (estimate<300MB).
- `tests/run --only webenv_pixi`: both supported Pixi major versions, ticker/input and worker ImageBitmap pixels; ~2s, RSS unmeasured (estimate<300MB).
- `tests/run --only webenv_phaser`: full boot/image/render/input golden, currently known scene-frame mismatch; ~1s, RSS unmeasured (estimate<300MB).
