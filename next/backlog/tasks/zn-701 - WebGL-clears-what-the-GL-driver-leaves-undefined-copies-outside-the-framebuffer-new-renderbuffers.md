---
id: ZN-701
title: >-
  WebGL clears what the GL driver leaves undefined: copies outside the
  framebuffer, new renderbuffers
status: Backlog
assignee: []
created_date: '2026-10-10 22:03'
labels:
  - webgl
  - bug
  - size-S
milestone: m-8
dependencies: []
ordinal: 472410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-612 on the Intel Mac's AMD driver: misc/uninitialized-test fails (copyTexImage2D and copyTexSubImage2D with a source rectangle partly outside the framebuffer: WebGL says the outside texels are zeros, GL leaves them undefined, src/gl passes the call through) and conformance2/renderbuffers/multisampled-renderbuffer-initialization fails (a new renderbuffer, multisampled or not, must read as zeros before its first draw: WebGL implementations clear it lazily). Apple's GL driver hands over zeroed memory, so both pass on Apple Silicon by luck. Clip the copy to the framebuffer and zero the rest; clear a renderbuffer (and a texture attached through framebufferTexture2D without data, if any case is left) before its first use, as browsers do. Then drop both pages from tests/golden/webgl/conformance-known-amd.txt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 misc/uninitialized-test and multisampled-renderbuffer-initialization pass on the Intel Mac's AMD driver
- [ ] #2 the pass list holds 695 pages or more on Apple Silicon, no regression
<!-- AC:END -->
