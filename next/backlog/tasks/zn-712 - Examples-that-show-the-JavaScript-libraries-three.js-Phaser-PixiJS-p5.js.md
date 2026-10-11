---
id: ZN-712
title: 'Examples that show the JavaScript libraries: three.js, Phaser, PixiJS, p5.js'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 11:38'
labels:
  - js
  - demo
  - size-M
milestone: m-8
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-11): the pages that prove the libraries (`next/tests/golden/webenv/`) show a red square; the owner wants examples that show what a user can make. Four small examples in `examples/`, written in plain JavaScript and run by `zinc run --engine quickjs` on the web environment (`lib/std/webenv.js`): a lit three.js scene, a Phaser mini-game, a PixiJS scene, a p5.js sketch. three.js, PixiJS and Phaser are vendored in `next/third_party`; p5.js is LGPL and is only fetched (`next/tools/test-lib`).

Third lane of the parallel agents (owner's order, `next/backlog/priority.json`). PixiJS and p5.js text need Canvas 2D (ZN-570): use what works today and say what is missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/js-three: a lit scene with a loaded model and a camera moved by the pointer, run by zinc run --engine quickjs; one frame golden from a scripted session
- [ ] #2 examples/js-phaser: a small game that is played (sprites, arcade physics, keyboard, a score, sound); a scripted input session ends on a known score
- [ ] #3 examples/js-pixi: sprites in a container tree, a filter or a mask, pointer events; one frame golden
- [ ] #4 examples/js-p5: a WEBGL sketch that reacts to the pointer; p5.js comes from its pinned download (tools/test-lib), never vendored (LGPL); the 2D sketch waits for Canvas 2D (ZN-570)
- [ ] #5 each example has a short README and a screenshot and appears in tools/examples-status; what a library needs and the engine lacks is given as lines for next/backlog/later.md
<!-- AC:END -->
