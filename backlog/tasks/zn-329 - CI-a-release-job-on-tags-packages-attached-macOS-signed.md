---
id: ZN-329
title: 'CI: a release job on tags (packages attached, macOS signed)'
status: Done
assignee: []
created_date: '2026-10-08 14:20'
updated_date: '2026-10-09 02:23'
labels:
  - ci
  - distribution
  - size-S
milestone: m-19
dependencies:
  - ZN-331
ordinal: 55210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
.github/workflows/zinc-next.yml builds and packages on linux-x86_64, linux-aarch64 and macos-arm64 and uploads run artifacts, but nothing makes a release. Add a job on `v*` tags that attaches the packages to a GitHub Release, calls tools/sign-macos with the Developer ID certificate and notarization credentials from secrets, and writes the update manifest. Pushing a tag and adding the secrets are the owner's steps: the task records them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the workflow passes actionlint and a dry run (act or a tag on a fork) shows the release job and its steps
- [x] #2 without the signing secrets the job still releases unsigned packages and says so
- [x] #3 the steps the owner must take (secrets names, tag command) are in docs/guide/07-distribution.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zinc-next.yml: push on branches ** and tags v*; on a tag each OS job packages with ZINC_VERSION from the tag (tools/package reads it), the macOS job imports MACOS_CERTIFICATE_P12 into a temporary keychain, stores notarytool credentials and runs tools/sign-macos (the notarized zip replaces the unsigned one, dist/.signed marks it), each job writes zinc-<os>-<arch>.manifest signed with ZINC_UPDATE_SEED (zinc update-sign); the release job (ubuntu, contents: write, needs test) downloads the artifacts and gh release create with notes saying when the macOS package is unsigned or manifests are missing (::warning:: in the log too). actionlint clean; act -n (act 0.2.x, every runs-on mapped to catthehacker/ubuntu:act-latest) lists the release job: download-artifact then Release. tests/t0/release_workflow.sh runs the manifest step with a test key (zinc update follows and verifies it) and the release step with a stand-in gh (unsigned / signed cases). Owner steps (secrets, tag) in docs/guide/07-distribution.md 'Releases of Zinc itself (CI)'. Note: act with -P macos-14=-self-hosted runs steps on the host even in -n mode: map to a container. usage: n/a
<!-- SECTION:NOTES:END -->
