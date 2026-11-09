---
id: ZN-444
title: 'Shader validation at build, program binary cache on device'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-11-09 07:02'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
ordinal: 12200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Keep: invalid shader fails the build with file and line (glslang vendored). Drop the Pi 3 second-start measurement.

Validate each GLSL ES variant (D29 prelude) with glslang at build time, strip comments and whitespace, store per profile. Cache program binaries on the device where GL_OES_get_program_binary exists. Report: docs/reports/games/toolchain-assets-loading.md (4.7).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 an invalid shader fails the build with file and line
- [ ] #2 the second start on the Pi 3 skips the compile (measured)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Shader validation at build is Mac-provable; the Pi 3 program-binary cache measurement moves to the cross pass.

Done 2026-11-09 in a parallel worktree (chain ZN-678, ZN-444).

AC #2 (second start on the Pi 3 skips the compile, measured): left unticked, dropped by the 2026-11-07 review (the Pi 3 measurement and the program-binary cache move to the cross pass); #1 is the only criterion kept, so Done.

Web search (sonnet sub-agent): #line semantics differ by version (ES 3.00: the number of the next line; Vivante refused #line 0 in #version 100: https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/18176321/is-line-0-valid-in-glsl), so the build shifts glslang's line by what it put before the file instead of emitting #line; Shader Minifier (https://github.com/laurentlb/shader-minifier) keeps # lines and only squeezes their spaces, and warns on macro-heavy code (hence: the minified text is checked again and the source ships as written if it fails); Filament's glslminifier strips comments, blank lines and indentation only. Program binaries: Mesa exposes 0 or 1 format (GL_PROGRAM_BINARY_FORMAT_MESA, https://lists.freedesktop.org/archives/mesa-dev/2017-November/178530.html), a count of 0 is legal; Qt keys its cache on GL_RENDERER + GL_VERSION (https://code.qt.io/cgit/qt/qtbase.git/tree/src/gui/opengl/qopenglprogrambinarycache.cpp) and Chromium's goes stale on a Mesa update with the same renderer string: key = vendor + renderer + version + format + engine + source hash, drop the entry on a failed load. Unverified: whether VC4 on the Pi 3 reports a binary format.

How: importer `shader` (src/assets/shader.cpp, shader.h), built-in rule `**/*.{vert,frag,vs,fs}`; the stage from the extension or the rule option `stage`. Variants (D29): no #version: GLSL ES 1.00 with `#define ZN_ES2` and display-gl's default precision, then GLSL ES 3.00 (`#version 300 es` before the file, line shift 1) with `ZN_ES3` and the 1.00 keywords renamed by the prelude (attribute/varying -> in/out, texture2D/textureCube -> texture, gl_FragColor -> an out); `#version 100`: 1.00 only; `#version 300 es`: 3.00 only; another version is refused. glslang stays out of zinc: libzn_webgl (which already carries it) exports `zn_essl_check` (src/gl/essl_check.cpp, esslValidate's log), zinc opens it at the first shader (zn::cli::webglModule, the main.cpp loader) through `assets::Options::glsl`; without the module (ZN_WEBGL off) shaders are stored unchecked with one line on stderr. Error: `zinc assets: fx/bad.frag: line 4: 'undefinedThing' : undeclared identifier (GLSL ES 1.00)`. Per profile: dev stores the file as written (the driver's lines are the file's), release minifies (`minify` option, set from the profile, part of the key): comments out, # lines kept as lines with their spaces cut to one, the code between them on one line with only the spaces two words or two operators need; the minified text is checked again (a minifier defect ships the source as written).

Proof: tests/t0/shader_assets.sh (new): a valid vertex + fragment pair (comments, #ifdef ZN_ES3 branches) builds; an undeclared identifier fails with `fx/bad.frag: line 4: ... (GLSL ES 1.00)`; a 1.00-valid shader using the 3.00 keyword `uint` as a name fails with `line 3: ... (GLSL ES 3.00)`; the release build stores wave.frag in 200 of its 236 bytes. PASS shader_assets, PASS assets. By hand: a #version 100 file with block and line comments, function-like and object-like macros and `- -k`, `+ +G` minifies to valid GLSL keeping those (`#define G (k)`, `a= - -k`, `k+ +G`).

Decision to record (proposed text): Shader validation at build: the `shader` importer checks each GLSL ES variant of D29 with glslang from libzn_webgl (an exported C entry, opened at the first shader) rather than linking glslang into zinc (3.4 MB static library; the 2.5 MB module already ships beside zinc); dev stores the source as written, release minified (comments, blank lines, spaces) and checked again. Rejected: linking zn_glslang into zinc (the size of every zinc for a build-time check), #line in the checked text (version-dependent semantics, Vivante refuses #line 0), renaming identifiers in the minifier (macros and the program's uniform names must stay).

later.md lines:
- ZN-444: program-binary cache on the device (GL_OES_get_program_binary / glGetProgramBinary) for zgl_program and WebGL programs: key vendor + renderer + version + binary format + engine build + source hash, the entry dropped when glProgramBinary fails; first check on the Pi 3 whether VC4 reports a format (GL_NUM_PROGRAM_BINARY_FORMATS), then measure the second start (the dropped AC #2).
- ZN-444: the shader importer has no desktop GLSL 3.30 core variant (glslang's ES profile only): check it with ECoreProfile when a target runs user shaders through zgl_program's GLSL 1.50 prelude.
- ZN-444: a user WebGL 1 fragment shader without a precision statement passes the build (the D29 prelude gives one) but fails in a browser: a `webgl` rule option that checks without the prelude.
- Cross-platform pass: ZN-444 tests/t0/shader_assets.sh on Linux (libzn_webgl.so) and a build with ZN_WEBGL off (shaders stored unchecked, one line).

Proposed tests: tests/run --only shader_assets (T0, about 2 s, under 100 MB: valid pair, 1.00 and 3.00 errors with file and line, release minify); tests/run --only assets (T0, about 20 s: the asset build unchanged with the new built-in rule).
<!-- SECTION:NOTES:END -->
