---
id: ZN-712
title: 'Examples that show the JavaScript libraries: three.js, Phaser, PixiJS, p5.js'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 11:38'
updated_date: '2026-10-11 17:14'
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
- [x] #1 examples/js-three: a lit scene with a loaded model and a camera moved by the pointer, run by zinc run --engine quickjs; one frame golden from a scripted session
- [x] #2 examples/js-phaser: a small game that is played (sprites, arcade physics, keyboard, a score, sound); a scripted input session ends on a known score
- [x] #3 examples/js-pixi: sprites in a container tree, a filter or a mask, pointer events; one frame golden
- [x] #4 examples/js-p5: a WEBGL sketch that reacts to the pointer; p5.js comes from its pinned download (tools/test-lib), never vendored (LGPL); the 2D sketch waits for Canvas 2D (ZN-570)
- [x] #5 each example has a short README and a screenshot and appears in tools/examples-status; what a library needs and the engine lacks is given as lines for next/backlog/later.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 (parallel agent): four examples in examples/js-three, js-phaser, js-pixi, js-p5, each with README, screenshot.png (the test's golden) and a T1 test (example_js_three, example_js_phaser, example_js_pixi, example_js_p5: PASS on the main binary, no engine change). tools/examples-status runs a .js entry with --engine quickjs; the four entries are in tests/examples.lst.
Open: criterion 2, the sound. The web environment has no audio (ZN-573): js-phaser loads and plays catch.wav and crash.wav the Phaser way and Phaser falls back to its silent manager (cache.audio is empty). Everything else of criterion 2 passes (sprites, arcade physics, keyboard, score; the scripted session ends on 'game over: 3 stars'). Next step once ZN-573 is done: run examples/js-phaser, hear the two sounds, tick criterion 2; nothing to change in the example is expected.
Not proven: frame rates (js-p5 took about 80 ms a frame headless while other trees were building: to measure alone), a real window and a real keyboard (headless runs only), other GPUs (the goldens are compared with a tolerance).
Lines for later.md: (1) zinc run --engine quickjs ignores the window size of zinc.json (targets.<os>.width/height, app.window): the JS examples open at 320x240. (2) importmap.json maps exact names only: a prefix such as "three/addons/" is not resolved, so each addon needs its line. (3) ZINC_INPUT has no key release: a scripted key stays down for the web environment (no keyup), so a test cannot hold then release a key. (4) js-p5: 144 lit boxes took about 80 ms a frame on QuickJS under load; measure on a quiet machine and profile p5's WEBGL path. (5) Canvas 2D (ZN-570) done: add Text to js-pixi and js-phaser, a 2D sketch to js-p5. (6) A JS project could say its engine in zinc.json so that zinc run <dir> needs no --engine quickjs.

Canvas 2D text in the JS examples: js-pixi labels the planets (Text, clicked one larger), js-phaser has Text title/score/game over (no bitmap font), js-p5 has sketch2d.js (P5_SKETCH=sketch2d.js) with screenshot2d.png; READMEs, screenshots and the three t1 tests updated.

2026-10-11 (ZN-573 agent): criterion 2 ticked. The web environment has Web Audio on zinc:audio; next/tests/t1/webenv_audio.sh PASS: in the scripted game Phaser decodes catch.wav and crash.wav, plays three catches then the crash, and the rendered mix holds sound after each start; the session still ends on 'game over: 3 stars' (example_js_phaser PASS). No change in the example. Nobody listened (headless, null backend): hear it once with cd next && build/zinc run ../examples/js-phaser. All five criteria are ticked; the status is left to the coordinator.
<!-- SECTION:NOTES:END -->
