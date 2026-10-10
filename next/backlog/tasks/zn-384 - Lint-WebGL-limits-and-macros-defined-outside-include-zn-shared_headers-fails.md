---
id: ZN-384
title: >-
  Lint: WebGL limits and macros defined outside include/zn (shared_headers
  fails)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-08 19:36'
updated_date: '2026-10-10 17:06'
labels:
  - webgl
  - cleanup
  - size-S
milestone: m-17
dependencies: []
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/t0/shared_headers.sh fails since 0c2ddcde (three.js renders): src/gl/webgl1.cpp defines kMaxAttribs, kMaxUnits, src/gl/webgl1.h kMaxVertexAttribs, and ZN_UNIFORM_CHECK / ZN_UNIFORM_OK macros plus generated #define ZN_<ext> lines. Move the limits to include/zn (one header), and rename or allow-list the local macros and the generated GLSL defines (they are shader text, not engine constants). Found by the T0 run of ZN-367.03 (.logs/zn367-03-t0.log). Also seen: plugin_manifest fails on another developer's uncommitted plugin.json changes (display-fbdev, display-rmpp) and the untracked plugins/remarkable: not to touch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/t0/shared_headers.sh passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
State found: since 9e64ae08 (2026-10-09) the test skipped the whole of src/gl ("grep -v '^src/gl/'"), so the lines of this task no longer failed it; it failed again on main for another line, src/host/netlog.cpp:22 (constexpr size_t kMaxEntries, added by 09ecc91f on 2026-10-10).
Done: (1) the WebGL limits are defined once, in the new include/zn/webgl_limits.h (zn::gl): kMaxVertexAttribs 16, kMaxTextureUnits 32, kMaxShaderCallDepth 256. kMaxAttribs (webgl1.cpp) and kMaxVertexAttribs (webgl1.h) were the same limit defined twice; kMaxUnits is now kMaxTextureUnits; essl_check's kMaxCallDepth is now kMaxShaderCallDepth (zn::kMaxCallDepth of zn/limits.h is the VM's 10000). The literals that restated them use the names: the attribute arrays and the per-unit texture arrays of webgl1.h, the three unit checks (x >= 32, v[i] >= 32, min(v, 32)), getVertexAttribOffset in webgl_js.cpp, the 256 of the error message. (2) The two local macros lose the shared prefix: ZN_UNIFORM_CHECK -> UNIFORM_CHECK, ZN_UNIFORM_OK -> UNIFORM_OK (src/gl names its local macros without a prefix: SELF, NEED, LOC). (3) The lint matches a #define only as a directive at the start of a line, so the GLSL preamble the module writes ("#define ZN_GL_ES 1\n" inside C++ strings) is not taken for a macro of ours, and the exclusion of src/gl is removed: the module is checked like the rest of src. (4) src/host/netlog.cpp (another agent's file, 5 lines): kMaxEntries -> kEntryCap, kMaxFrames -> kFrameCountCap, the naming of the three other bounds on the same line (kBodyCap, kQueueCap, kFrameCap); they are bounds private to the network log, not shared limits.
Decisions: a header of its own, not zn/limits.h, which the compiler and the VM include (no WebGL names in the core, RULES 7); rename the two macros rather than allow-list them (a ZN_ macro under src/ is what the lint is for); anchor the #define rather than list the GLSL lines (a directive cannot start in the middle of a line, so nothing real escapes); rename the netlog bounds rather than move them to include/zn (nothing else uses them).
Left as they are: genericType_[16] in webgl1.h (16 initializers written out: a named size would fill with zeros silently if the limit grew), the two identical bodies of UNIFORM_CHECK and UNIFORM_OK (one per file, as before), the draw buffer literals 16 of webgl_js.cpp (another limit, MAX_DRAW_BUFFERS, no constant today).
Not touched: plugin_manifest and the plugin.json files named in the description.
Follow-up to file (not created here, worktree rule): none needed. Optional clean-up, size S: one definition for the uniform check of webgl1.cpp and webgl1_more.cpp (a member function of WebGL1) and a constant for the 16 draw buffers.
Usage: usage: n/a
<!-- SECTION:NOTES:END -->
