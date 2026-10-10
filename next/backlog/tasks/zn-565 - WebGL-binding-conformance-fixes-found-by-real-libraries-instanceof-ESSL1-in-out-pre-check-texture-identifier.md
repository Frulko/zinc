---
id: ZN-565
title: >-
  WebGL binding conformance fixes found by real libraries (instanceof, ESSL1
  in/out pre-check, 'texture' identifier)
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
updated_date: '2026-10-11 01:20'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies: []
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three defects found by running PixiJS v8, Phaser 3 and three.js unchanged. (1) WebGL2RenderingContext.prototype inherits from WebGLRenderingContext.prototype (src/gl/webgl_js.cpp install: gProto2 = JS_NewObjectProto(c, proto)), so a WebGL 2 context is instanceof WebGLRenderingContext: PixiJS v8 takes its WebGL 1 path and throws 'Vertex Array Objects are not supported', three.js r186 refuses a WebGL 2 context passed as `context`. Give WebGL2RenderingContext its own prototype with the shared methods copied (browsers make the interfaces siblings). (2) essl1Violation (src/gl/webgl1.cpp:124) rejects `in`/`out` declarations with a regex before the preprocessor runs, so `#ifdef GL_ES / #define in attribute` (every PixiJS v8 shader) fails: check the preprocessed text. (3) The ESSL 1.00 -> GLSL 3.30 translation defines texture2D as texture; Phaser 3's batch shader declares `vec4 texture;` and fails 'Invalid call of texture': rename user identifiers that are GLSL 3.30 built-ins (and audit the others). The same validation and translation layer serves ZN-562 (zinc:gl for AOT code), which gets these fixes too. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 gl2 instanceof WebGLRenderingContext === false, gl2 instanceof WebGL2RenderingContext === true, gl1 instanceof WebGLRenderingContext === true
- [x] #2 new THREE.WebGLRenderer({canvas, context: gl2}) succeeds
- [x] #3 a shader with #ifdef GL_ES / #define in attribute / #define out varying compiles in WebGL 1 and 2
- [x] #4 an ESSL 1.00 shader declaring vec4 texture; and calling texture2D compiles
- [ ] #5 PixiJS 8.22 and Phaser 3.90 boot with no shader workaround
- [ ] #6 Khronos conformance not lower than 695/787; a T0/T1 test per fix
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11, parallel agent (worktree), Intel Mac (AMD GPU, Apple's GL 4.1 driver). All three fixes are in the binding where it was wrong against the specification; no library is named in the code.

DEFECT 1, the interfaces (src/gl/webgl_js.cpp install): WebGL2RenderingContext.prototype was made with the WebGL 1 prototype as its parent. It is now an object of its own that carries the shared methods and constants itself (WebGLRenderingContextBase is a mixin of both interfaces), so the two are siblings.
DEFECT 2, `#define in attribute` (src/gl/webgl1.cpp essl1Violation): the regex that refused a global `in` or `out` read the source before the preprocessor. It is deleted, not moved: the GLSL ES validator (glslang, essl_check.cpp) parses the text after the preprocessor and already refuses a real global `in` in ES 1.00 ("'in for stage inputs' : not supported for this version"), which the test checks in both contexts.
DEFECT 3, `texture` as a name (src/gl/webgl1.cpp translate, textureHelpers): the prelude no longer says `#define texture2D texture`. For each ES 1.00 texture function the shader names it emits a helper compiled before the shader's first line (`vec4 zn_texture2D(sampler2D s, vec2 c) { return texture(s, c); }`, the bias forms in fragment shaders, the Lod forms in vertex shaders, the LodEXT and GradEXT forms with EXT_shader_texture_lod) and `#define texture2D zn_texture2D`. A built-in reached from inside a helper cannot be hidden by a name the shader declares later.

DECISION (RULES 4), helpers and not the renaming the description proposed. Scores 1-5: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1.
(A) Rename the shader's identifiers that are GLSL 3.30 built-ins and map the names back at the API: 4,5,5,3,5,5,3 = 61. It needs a complete list of built-in names, rewrites the page's own `#define texture texture2D`, and a uniform named `texture` (common in old shaders) then has another name in the driver, so every call that takes or returns a name must translate it.
(B) Helper functions in the prelude: 5,5,5,4,5,5,5 = 68. The page's names stay the page's. Measured on the baseline build, all four of these failed: a local `vec4 texture;` and a `uniform sampler2D texture;` ("Invalid call of 'texture'"), a function `texture(sampler2D, vec2)` that calls texture2D ("Recursive function call to texture" at link), and PixiJS's header; all four draw the texture's colour now.
(C) ANGLE's translator, or glslang to SPIRV-Cross (D30): 5,3,2,3,5,4,1 = 49. A second compiler per shader and megabytes, for three names.
CHOICE: B. Revisit with C if a driver is found that does not accept a sampler as a function parameter.

AUDIT of the other names ("and audit the others"), what was checked:
- the six GLSL 3.30 functions the prelude made a shader call (texture, textureProj, textureLod, textureProjLod, textureGrad, textureProjGrad): all inside helpers now.
- FOUND AND FIXED: the words desktop GLSL keeps for itself and ES 1.00 does not (desktopOnlyWord: filter, sample, active, common, shared, resource, patch, layout, uint... and the sampler, image and vector type names) were already renamed by macro so the shader compiles, but the name was then unknown to the API: on the baseline build `uniform float filter` gave getUniformLocation(p, 'filter') === null and getActiveUniform(...).name === 'zn_filter'. Names are now mapped where they cross the API (WebGL1::toDriver / fromDriver): bindAttribLocation, getAttribLocation, getUniformLocation, getActiveUniform, getActiveAttrib, getUniformIndices, transformFeedbackVaryings, getTransformFeedbackVarying. Ceiling, marked in the code: a page's own name that is zn_ + such a word (zn_filter) would come back without its prefix.
- NOT FIXED, found by reading, no library and no conformance page hits it: dFdx, dFdy and fwidth are all defined to one name when OES_standard_derivatives is off, so a shader that declares two of them as its own names would redeclare.
- NOT FIXED, known before: getActiveUniform and getActiveAttrib read names into 256 bytes (the failing page glsl/misc/glsl-long-variable-names); a renamed word is three characters longer in the driver.
- The same WebGL1 class serves zinc:gl (ZN-562), so the typed binding has fixes 2 and 3 and the name mapping by construction; no zinc:gl program was written for them (zinc_gl_api_tour was not run in this task).

TESTS: tests/t1/webgl_libs.sh, one page per defect in tests/golden/webgl with its .out: sibling_interfaces.js (9 lines), essl1_define_in_out.js (8 lines, WebGL 1 and 2, drawn and read back 0,255,0,255, and a real global `in` refused), essl1_texture_name.js (10 lines: a local, a uniform, a function of the built-in's signature, a cube map beside a variable named textureLod, uniforms filter and sample[1] and an attribute named active found and listed under the page's names, each drawn and read back), and tests/golden/webenv/three/context.js (three.js r186 on a WebGL 2 context the page made: "three 186 on the page's context true centre 255,0,0,255 corner 16,32,48,255 error 0"). tests/t1/webenv_pixi.sh now runs its PixiJS 8.22 page always (its page and golden were committed by ZN-568 and are unchanged). tests/golden/webgl/webgl2.out: `instanceof true false true` (was `true true true`).
Passed on the final code: webgl_libs, webenv_pixi, webgl_js, webgl2_js, webgl1_core, webenv_canvas, webenv_three, webenv_p5, three (t1), webenv, qjs (t0).
NOT RUN: tests/t1/webgl_conformance.sh, the gate tests/affected.json maps to src/gl/: it is the whole Khronos suite (see criterion 6); webgl_surface, webgl_gizmo, webgl_studio, webgl_module, zinc_gl_api_tour (mapped to src/gl/ too); qjs_robust and quickjs (this diff is in src/gl only).

STATE OF THE CRITERIA:
#1 done: "gl2 instanceof WebGLRenderingContext false", "gl2 instanceof WebGL2RenderingContext true", "gl1 instanceof WebGLRenderingContext true" (sibling_interfaces.out).
#2 done: the context.js line above.
#3 done: "webgl compiled true true", "webgl drawn 0,255,0,255 0", "webgl2 compiled true true", "webgl2 drawn 0,255,0,255 0" (essl1_define_in_out.out).
#4 done: "webgl a local variable: 0,255,0,255 uniforms s attribute active 0 error 0", the same for webgl2 (essl1_texture_name.out).
#5 HALF, left unticked. PixiJS 8.22.0 boots with no workaround (PASS webenv_pixi, the v8 page equal to its golden: renderer webgl, WebGL 2, the square read back 255,0,0 at frames 2 and 8, five pointer events). Phaser 3.90.0 needs no shader workaround any more but DOES NOT BOOT: asked through its own renderer, unmodified, "multi pipeline: fragment compiled true program linked true | declares `vec4 texture;` true | calls texture2D 16 times" (nine pipelines built, the sixteen 'Invalid call of texture' errors gone), then it stops in its renderer's boot with "TypeError: cannot read property 'glTexture' of undefined": its three default textures are data: PNGs set as Image.src and nothing decodes images yet. That is ZN-569, whose Phaser test is the proof of this criterion.
#6 PARTLY, left unticked. The test per fix exists. The Khronos number was not measured on the 787 pages: the task was run with the instruction to re-run a targeted subset only. Of the 787, 679 were run before and after (glsl, context, programs, uniforms, extensions, textures, rendering and their conformance2 directories): 592 pass before, 593 after, no page lost, one gained. The 108 pages of the other directories (attribs, buffers, limits, misc, reading, renderbuffers, state, typedarrays; conformance2 attribs, buffers, misc, query, reading, renderbuffers, samplers, state, sync, transform_feedback, vertex_arrays) were not run; their shaders go through the same translation, so they are not proven. The gained page is conformance2/textures/misc/angle-stuck-depth-textures.html (4 pass 3 fail before, 26 pass 0 fail after): its blit shader says `uniform sampler2D texture;` and calls texture2D, defect 3 in the suite itself. It moved from conformance-failures.txt to conformance-pass.txt by hand (696 and 91 lines; the lists were not rewritten from a run). The 679 pages were run three times on the fixed code, the last on the code as committed, through the gate with the edited pass list: "webgl-conformance: 593 of 679 pages pass", no REGRESSION line, exit 0, the same pages page by page each time (the last run ended at a load average of 13). The one timeout in it, extensions/khr-parallel-shader-compile.html, timed out in the baseline run too. To close the criterion: `cd next && tools/webgl-conformance` (the whole suite; the 679 pages took about 4 minutes with WGC_JOBS=3).

MEASURED (Intel Mac i7-9750H, release build, headless, 320x240, real clock; scratch pages outside the repository: the library imported after the first line, then 300 animation frames of update + render + gl.finish; "first frame" is performance.now() at the end of the first one, so it counts from the JavaScript context's start; 3 runs each).
Before (commit c60e9e27, load average 5.6 to 5.9): three.js r186 import 66 to 71 ms, first frame 331 to 351 ms, frame median 0.35 to 0.66 ms (p95 0.78 to 1.27); PixiJS 7.4.3 import 40 to 41 ms, first frame 245 to 250 ms, frame 0.27 to 0.41 ms (p95 0.78 to 0.83); p5.js 1.11.13 evaluated in 132 to 138 ms, first frame 326 to 348 ms, frame 0.62 to 0.67 ms (p95 1.05 to 2.30). PixiJS 8.22 and Phaser 3.90 did not boot.
After (the fixed code, twenty minutes later, load 5.1 to 5.5 over one minute and 6.6 over five, the machine having just been at 9): three.js import 66 to 73 ms, first frame 344 to 375 ms, frame 0.67 to 0.68 ms (p95 3.0); PixiJS 7 import 42 to 43 ms, first frame 268 to 273 ms, frame 0.61 to 0.70 ms (p95 3.6 to 4.2); p5.js evaluated in 138 to 150 ms, first frame 341 to 376 ms, frame 0.62 to 0.63 ms (p95 3.7 to 6.1); PixiJS 8.22.0, new: import 120 to 121 ms, first frame 351 to 361 ms, frame 0.72 ms (p95 3.3 to 4.5).
READ WITH CARE: the second set is 4 to 9 % slower at first frame and up to twice slower at the frame median, but so is what this change cannot reach (the imports, pure JavaScript: +3 to +9 %), and the frame time of one scene on this machine has two modes, about 0.3 and about 0.7 ms, whatever the shader text. So the two sets do not tell a cost from the machine. The paired measure does: helpers against the old macros on one binary (a switch kept only for the measure), alternated in the same minutes, PixiJS 7 (its batch shader calls texture2D once per sampler), 5 pairs at load 6.2 to 6.7: frame median 0.70 ms against 0.70 ms in four pairs of five (one helper run at 0.34, one macro run at 0.73); first frame 352 to 400 ms (median 374) against 334 to 405 ms (median 376), the first run after the relink (677 ms) left out. No measurable cost of the helper functions.
A guess that did not hold: the two std::regex matches desktopOnlyWord makes for every identifier of every shader looked like a large part of the first render. A substring test before them, measured the same paired way: PixiJS 7 first frame 344 to 389 ms (median 353) with it, 351 to 390 ms (median 361, and one run at 577) without; p5.js 478 to 561 against 478 to 568. At most 2 %, inside the noise: the test was not kept. (The switch itself showed that the path is long: with a getenv per identifier in both arms, p5.js's first frame was 478 to 561 ms, against 341 to 376 ms on the build without the switch; an unpaired comparison, but ten times the drift seen elsewhere that hour.)
Not measured: the library numbers on the code exactly as committed (the "after" set was taken with the substring test in); Phaser (it does not reach a frame).
<!-- SECTION:NOTES:END -->
