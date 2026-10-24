---
id: ZN-674
title: 'Test imageFromBytes with WebP and GIF and record the size'
status: Backlog
assignee: []
created_date: '2026-10-10 19:21'
labels:
  - gfx
  - assets
  - size-S
dependencies: []
ordinal: 5700
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Add the runtime test (interpreter and AOT) and the size measure; no engine change expected. Already there: src/res/res.cpp:762-775; third_party/README.md:13.

(Follow-up of ZN-432, D73.) imageFromBytes decodes PNG and JPEG only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a WebP and a GIF decode at run time on the interpreter and the AOT (test)
- [ ] #2 the size added to a built program is measured
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Decoding exists: decodeRgba handles WebP (libwebp) and GIF (stb_image has GIF enabled), and imageFromBytes uses decodeRgba. Left: a test with a WebP and a GIF on interpreter and AOT, and the size note. Evidence: src/res/res.cpp:762-775; third_party/README.md:13
<!-- SECTION:NOTES:END -->
