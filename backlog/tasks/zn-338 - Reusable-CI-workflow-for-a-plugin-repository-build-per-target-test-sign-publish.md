---
id: ZN-338
title: 'Plugin workflow: publish to the index and run a fixture repository'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - ci
  - distribution
  - size-M
milestone: m-19
dependencies:
  - ZN-335
  - ZN-333
  - ZN-334
  - ZN-336
ordinal: 10500
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Keep .github/workflows/plugin.yml. Add: (1) an index entry published on a tag under the publisher delegation (tools/index-repo); (2) a fixture plugin repository that runs the workflow green on the four targets; (3) fix the zinc-engine/zinc reference to the real repository. Provenance stays in ZN-342, sysroots in ZN-334.

A `workflow_call` workflow any plugin repository uses: matrix macos-arm64, linux-x86_64, linux-aarch64, linux-armhf (rpi1); pinned zig and sysroots; the plugin's own tests; artifacts `<target>/<name>-<cachekey>.tar` named by the plugin cache key; provenance (D-attestations) and signature; publication to the index (D-index) on a tag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a fixture plugin repository runs the workflow green on all four targets
- [ ] #2 each artifact name equals the cache key the client computes for the same sources and target
- [ ] #3 a tag publishes the artifacts and an index entry; without the signing secret the job stops before publishing and says why
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. The reusable workflow exists since ZN-354 (written there because this one was Backlog). Left: provenance (ZN-342), publishing an index entry on a tag, sysroots (ZN-334) and a fixture run on GitHub. The workflow still names zinc-engine/zinc but origin is Frulko/zinc. Evidence: .github/workflows/plugin.yml (workflow_call, 4-target matrix, tools/plugin-pack, tag release, signing stops without secret); tests/t1/plugin_starter.sh
<!-- SECTION:NOTES:END -->
