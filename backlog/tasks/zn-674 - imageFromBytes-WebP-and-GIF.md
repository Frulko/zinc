---
id: ZN-674
title: Test imageFromBytes with WebP and GIF and record the size
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 19:21'
updated_date: '2026-11-09 07:14'
labels:
  - gfx
  - assets
  - size-S
dependencies: []
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Decoding exists; a WebP and GIF test on interpreter and AOT plus the size note remain.

**What is left (review 2026-10-25):** Add the runtime test (interpreter and AOT) and the size measure; no engine change expected. Already there: src/res/res.cpp:762-775; third_party/README.md:13.

(Follow-up of ZN-432, D73.) imageFromBytes decodes PNG and JPEG only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a WebP and a GIF decode at run time on the interpreter and the AOT (test)
- [x] #2 the size added to a built program is measured
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Decoding exists: decodeRgba handles WebP (libwebp) and GIF (stb_image has GIF enabled), and imageFromBytes uses decodeRgba. Left: a test with a WebP and a GIF on interpreter and AOT, and the size note. Evidence: src/res/res.cpp:762-775; third_party/README.md:13
Review 2026-11-07: done-partly. Decoding exists; a WebP and GIF test on interpreter and AOT plus the size note remain. Evidence: src/res/res.cpp:762-775 decodeRgba; tests/t*/webp.sh exists

Done 2026-11-09. The review was wrong on GIF: codec.cpp compiled stb_image with STBI_ONLY_PNG/JPEG, so imageFromBytes returned -1 for every GIF. Fix: STBI_ONLY_GIF (first frame via stbi_load_from_memory; the animation API stbi_load_gif_from_memory, home of CVE-2023-45666/45667, is not used; the existing 2^24-pixel guard reads the GIF header first). Test: tests/t0/webp_bytes.sh now also decodes tests/data/images/fixture.gif (GIF87a 32x24), tests/data/imageio/anim.gif (GIF89a animated 12x6, first frame) and a truncated GIF (-1), on the interpreter, QuickJS and the AOT build: PASS.
Size (macOS arm64, Release, zinc build of tests/data/webp_bytes/main.ts): __text 3,179,876 -> 3,186,932 B (+7,056), __cstring +114, __unwind_info +16, sections total 4,064,087 -> 4,071,273 B (+7,186 B, 7.0 KB); the file grows 16 B (4,316,248 -> 4,316,264) because __TEXT stays within its 16 KB page. libwebp's decoder was already linked (D73: +50.7 KB for stb then).
Web search (sonnet): stb_image GIF decodes the first frame with stbi_load_from_memory, interlace and transparency handled; known CVEs (CVE-2023-45666/45667) are in the animation API, CVE-2026-5313 is a DoS in stbi__gif_load_next up to stb 2.30 (vendored: 2.30) https://vuldb.com/cve/CVE-2026-5313 ; Skia/Chrome decode GIF with Wuffs (memory-safe, 2x giflib) https://github.com/google/wuffs .
later.md line (coordinator): - ZN-674: GIF in imageFromBytes goes through stb_image 2.30's GIF path, which has a known DoS (CVE-2026-5313): fuzz decodeRgbaAlloc with GIFs (tools/fuzz) or move GIF to Wuffs as Skia did, since programs decode downloaded bytes.
Proposed tests: none beyond the T0 webp_bytes (20 s, ~150 MB, already extended).
<!-- SECTION:NOTES:END -->
