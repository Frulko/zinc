---
id: ZN-149
title: 'Packaging: updater, signed manifests, Linux package verified'
status: Backlog
assignee: []
created_date: '2026-10-06 23:03'
labels:
  - packaging
  - size-M
milestone: m-12
dependencies:
  - ZN-118
ordinal: 40910
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Verify tools/package on Linux in the container (never done), AppImage with zsync, Sparkle 2.10 on macOS for the app update, `zinc update` with a signed manifest (Ed25519 via mbedTLS or libsodium-style verify) and pins refresh; sign/notarize scripts exist (tools/sign-macos) and stay as the release recipe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the Linux tarball passes tests/t2/package.sh in the container; a signed manifest with a bad signature is refused (T0)
<!-- AC:END -->
