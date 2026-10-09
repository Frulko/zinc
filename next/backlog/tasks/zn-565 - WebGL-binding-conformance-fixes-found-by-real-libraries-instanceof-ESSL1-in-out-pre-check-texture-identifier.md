---
id: ZN-565
title: >-
  WebGL binding conformance fixes found by real libraries (instanceof, ESSL1
  in/out pre-check, 'texture' identifier)
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies: []
ordinal: 344270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three defects found by running PixiJS v8, Phaser 3 and three.js unchanged. (1) WebGL2RenderingContext.prototype inherits from WebGLRenderingContext.prototype (src/gl/webgl_js.cpp install: gProto2 = JS_NewObjectProto(c, proto)), so a WebGL 2 context is instanceof WebGLRenderingContext: PixiJS v8 takes its WebGL 1 path and throws 'Vertex Array Objects are not supported', three.js r186 refuses a WebGL 2 context passed as `context`. Give WebGL2RenderingContext its own prototype with the shared methods copied (browsers make the interfaces siblings). (2) essl1Violation (src/gl/webgl1.cpp:124) rejects `in`/`out` declarations with a regex before the preprocessor runs, so `#ifdef GL_ES / #define in attribute` (every PixiJS v8 shader) fails: check the preprocessed text. (3) The ESSL 1.00 -> GLSL 3.30 translation defines texture2D as texture; Phaser 3's batch shader declares `vec4 texture;` and fails 'Invalid call of texture': rename user identifiers that are GLSL 3.30 built-ins (and audit the others). The same validation and translation layer serves ZN-562 (zinc:gl for AOT code), which gets these fixes too. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gl2 instanceof WebGLRenderingContext === false, gl2 instanceof WebGL2RenderingContext === true, gl1 instanceof WebGLRenderingContext === true
- [ ] #2 new THREE.WebGLRenderer({canvas, context: gl2}) succeeds
- [ ] #3 a shader with #ifdef GL_ES / #define in attribute / #define out varying compiles in WebGL 1 and 2
- [ ] #4 an ESSL 1.00 shader declaring vec4 texture; and calling texture2D compiles
- [ ] #5 PixiJS 8.22 and Phaser 3.90 boot with no shader workaround
- [ ] #6 Khronos conformance not lower than 695/787; a T0/T1 test per fix
<!-- AC:END -->
