---
id: ZN-779
title: Keep release notes until successful publication and publish the changelog
status: Done
assignee: []
created_date: '2026-10-23 09:16'
updated_date: '2026-10-23 09:33'
labels:
  - tooling
  - ci
  - size-M
dependencies: []
ordinal: 515460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: releases must display the real changelog; retries must retain all pending notes until a release is successfully published. Verify recent changes are committed and documented.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GitHub release notes come from the changelog snapshot even if checkout has a lightweight tag, and rerunning publication preserves the complete notes.
- [x] #2 Unreleased entries stay visible through failed, unwatched and retried releases and are archived only after confirmed publication; concurrent newer notes remain pending.
- [x] #3 Local isolated release and workflow regressions cover failures, retries and success; changelog structure, docs and committed state are verified without pushing or publishing.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed on GitHub: v0.6.2 notes contain docs(changelog): 0.6.2; checkout log peels the annotated tag to its commit. Publication now reads the tagged CHANGELOG snapshot, uses notes-file, and reruns upload/edit idempotently. Release preparation leaves Unreleased pending (including edited/drafted notes and retries without code commits); CI archives only after a non-draft publishedAt, preserving concurrent/edited entries and retrying non-fast-forward pushes. Changelog duplicate Added/Changed headings merged without losing entries; missing website translation note added. Proof: tests/run --only release_tool; tests/run --only release_workflow (includes actionlint); tests/run --only ci_plan. Fake gh and scratch local bare origins only, no real push or publication. Old GitHub release bodies are unchanged; rerunning an old tag still uses its old workflow, so the fix starts with tags containing this change.
<!-- SECTION:NOTES:END -->
