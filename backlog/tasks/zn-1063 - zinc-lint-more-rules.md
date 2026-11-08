---
id: ZN-1063
title: 'zinc lint: more rules'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:42'
updated_date: '2026-11-08 22:07'
labels:
  - cli
  - size-S
milestone: m-20
dependencies: []
ordinal: 5100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opt-in checks users would meet in zinc lint.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-718: zinc lint: a rule for zinc.json dependencies that nothing imports (the knip idea).
- ZN-718: zinc lint: JPEG and WebP pixel sizes in the asset estimate (only PNG reads its size from the header).
- ZN-718: zinc lint: target rules in the LSP (`--json` is the hook), and a `boot` budget estimate from assets.groups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A rule for zinc.json dependencies nothing imports
- [x] #2 JPEG and WebP sizes in the asset estimate
- [x] #3 boot budget estimate from assets.groups; target rules in the LSP
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet sub-agent, 2026-11-08): knip walks the import graph from entries and counts type-only, side-effect and dynamic imports and subpaths as uses (https://knip.dev/typescript/unused-dependencies); depcheck is archived (2025-06) and points to knip. JPEG size: scan markers to SOF0..SOF15 minus C4/C8/CC, height before width; WebP: VP8 14-bit at 26/28, VP8L 14-bit w-1/h-1 after 0x2f, VP8X 24-bit canvas. Decision: no hand-written header parser: zn::res::imageSize (stb_image's stbi_info, libwebp's WebPGetInfo, already vendored and used by the baker) reads PNG, JPEG and WebP; zn_lint links zn_res and zn_assets (zinc links both already).
Done: unused-dependency (source rule, warning): zinc.json dependencies whose plugin (installed, not a display plugin) has its module quoted or as a subpath in no .ts/.tsx/.js/.jsx/.mjs of the project outside plugins/, node_modules, build...; a text search, so a comment naming the module counts as a use (a missed warning, never a false one); reported at the key in zinc.json. Asset estimate: JPEG and WebP sizes from their headers, hidden files skipped as zinc assets build does, files sorted (texture-size order was the file system's). assets-boot (target rule, warning): files of loading.groups, else of the boot group (zn::assets::groupOf, the same globs and first-match rule as zinc assets build, new in assets.h), images in the target's first texture format, the rest as they are, against the target's boot budget (every profile has one in targets/capabilities.json). LSP: textDocumentSync asks for save; on first open of a document of a project whose zinc.json names targets, and on each save, zinc lsp runs `zinc lint --json <project>` (its own executable) and adds the target findings (not compile: the checker reports those) to each file's diagnostics, severity error 1 / warning 2, code = rule, message '[targets] ... (fix: ...)'; a save republishes every open document of the project.
Proof: tests/golden/lint/rules gains a JPEG (400x240), a WebP (330x12), a boot group and an unused lottie dependency: zinc lint prints the four new findings (rules.expect re-blessed: 7 errors, 12 warnings, 16 rules, 19 JSON diagnostics). tests/run --only lint: rules.expect, esp32-app.matrix, --rules, --json, migrate pass; hero.matrix differs from its golden by the first reason per target and the profile order (svg/citymap): the known stale lint matrix goldens of ZN-1014 (RESUME), not touched by this change (no dependency or asset finding in hero). LSP probed by hand (scratch project, esp32): on open screen-size and ui-tier at line 2, severity 2, '[esp32] ...'; on save the same. tests/lsp/lsp_test.py gains case 12b (open, then save after the fix clears it), not run (T1).
Proposed tests: tests/run --only lsp (T1, ~10 s, <200 MB): the new 12b case; re-bless tests/golden/lint/hero.matrix with ZN-1014.
<!-- SECTION:NOTES:END -->
