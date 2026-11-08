---
id: ZN-793
title: zinc check and zinc dev diagnostics for QuickJS and JavaScript projects
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:54'
updated_date: '2026-11-08 19:11'
labels:
  - size-M
milestone: m-10
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- zinc check: a project on the QuickJS engine ("engine": "quickjs") is checked by the typed checker, which does not resolve `node_modules` packages (Z0119 on every `@nbe/...` import of examples/carnet-nbe, which runs): check it as the QuickJS loader resolves it (src/qjs/qjs.cpp quickjsLint), or say the check does not apply.
- ZN-772: `zinc check` and `zinc lint` fail on the plain-JavaScript web examples (js-three Z0002, js-gsap Z0106, js-pixi, js-spline): the typed frontend parses `await import(expr)` and the web globals as TypeScript; a `"web": true` JavaScript program should get the QuickJS loader's lint instead.
- zinc dev: the `compile error:` line prints the first stderr line (`plugin svg: cached native library`) instead of the diagnostic; print the diagnostic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc check` of a project with "engine": "quickjs" resolves node_modules like the loader (examples/carnet-nbe has no Z0119) or states that the check does not apply
- [x] #2 `zinc check` and `zinc lint` on the js-three, js-gsap, js-pixi, js-spline examples use the QuickJS loader's lint
- [x] #3 `zinc dev` prints the diagnostic, not the first stderr line, after `compile error:`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker branch). Research (QuickJS JS_EVAL_FLAG_COMPILE_ONLY | JS_EVAL_TYPE_MODULE https://github.com/quickjs-ng/quickjs/blob/master/quickjs.h; node --check is syntax only; esbuild/Vite resolve bare specifiers through package.json exports, then module/main https://esbuild.github.io/api/#main-fields): the engine already had the right check, zinc check --engine quickjs (the bundler's collect: QuickJS's own loader with node_modules, then quickjsLint), but discoverEntry broke it for a directory (it put --check in front) and never chose it. Now: (1) discoverEntry sends zinc check of a .js/.mjs entry or a zinc.json engine quickjs/jsc/v8/hermes project to the QuickJS check (--engine zinc keeps the typed check, any other option such as --json too); examples/carnet-nbe (linked with link.sh): '52 modules, 0 warning(s) for QuickJS', no Z0119. (2) zinc lint of such a program skips the typed loader and runs the QuickJS loader once (new zn::qjs::lintProgram, given to zn::lint::lint as a JsCheck hook: zn_lint does not link the engine): a load failure is a compile error at the loader's place, Q0001 a new 'quickjs' warning rule; js-three, js-gsap, js-pixi check and lint clean (js-spline keeps its real project-requires error on sim: gpu>=webgl2). (3) zinc dev prints the first diagnostic line (': error ' or 'Error: ') after 'compile error:' at its four sites, and its check of a JavaScript program uses the QuickJS check. Test: tests/t0/check_js.sh (fails on the previous binary: Z0119 and Z0106); tests/t0/lint.sh updated (14 rules, quickjs covered by check_js). Proof: check_js, lint PASS; zinc dev on a broken program printed the Z0103 line. Proposed tests: zinc dev on examples/carnet-nbe with an error saved (by hand, windowed).
<!-- SECTION:NOTES:END -->
