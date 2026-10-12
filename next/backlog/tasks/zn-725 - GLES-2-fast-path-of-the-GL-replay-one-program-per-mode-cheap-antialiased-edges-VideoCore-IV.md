---
id: ZN-725
title: >-
  GLES 2 fast path of the GL replay: one program per mode, cheap antialiased
  edges (VideoCore IV)
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-12 10:41'
labels:
  - perf
  - gl
  - size-L
milestone: m-21
dependencies: []
ordinal: 487410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request, 2026-10-12, with the Pi 3B+ plugged in: put the UI and the maps on the GPU of a GLES 2 tiler. Measured (docs/reports/raspberry-pi.md, last section): on VideoCore IV the GL replay takes 217 ms for hero's driving frame against 43 ms for the software bands, because one fragment shader holds every mode behind ifs (a GPU without branches runs all of them: 35 ms with one mode compiled in, ZINC_GL_ONLY) and because POLY's fringes are bounding-box quads with distance maths and discard (124 ms; ZINC_GL_FRINGE=0). Research: docs/reports/hardware/vc4-gles2-performance.md, docs/reports/gles2-2d-rendering-techniques.md. Device tool: next/tools/device (push, profile, shot, stacks). Desktop GL keeps its single program and its pixels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On GLES 2 every batch is drawn by a program compiled for its mode (ZMODE, without the gradient paint block unless a paint is set), compiled at first use; desktop GL is unchanged (its goldens and draw counts)
- [ ] #2 tests/native/gl_replay_es2 checks every program variant as GLSL ES 1.00 with glslang
- [ ] #3 The GLES 2 pixels of hero home, gallery and navigation are those of the single program (a capture before and after on the device or on a GLES 2 context of the Mac, tools/pngdiff)
- [ ] #4 POLY and STROKE edges on GLES 2 cost no distance maths per pixel over a bounding box: thin strips with the coverage in a vertex attribute, or 4x MSAA with plain triangles, chosen on measured numbers, the visible quality kept (captures compared with the software frame)
- [ ] #5 hero navigation driving on the Pi 3B+: present p50 below the software bands at the same clock (43 ms at 600 MHz, tools/device profile), home and gallery not slower than before; the first frame under 0.5 s
- [ ] #6 The mid-frame stalls VC4_DEBUG=perf reports (Blocking on resource BO for bo map) are attributed, and removed where the cause is the replay's (uploads into a texture or buffer in use, a clear after the first draw)
- [ ] #7 Numbers in docs/reports/raspberry-pi.md and docs/reports/zinc-next-perf.md; the default renderer of display-gl on GLES 2 follows them (gl when it wins, else cpu)
<!-- AC:END -->
