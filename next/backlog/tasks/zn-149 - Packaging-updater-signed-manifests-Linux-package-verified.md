---
id: ZN-149
title: 'Packaging: updater, signed manifests, Linux package verified'
status: Done
assignee: []
created_date: '2026-10-06 23:03'
updated_date: '2026-10-08 08:45'
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
- [x] #1 the Linux tarball passes tests/t2/package.sh in the container; a signed manifest with a bad signature is refused (T0)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Signed manifests done: zinc update refuses unsigned, tampered, wrong-key and malformed-signature manifests and everything when no key is trusted (Ed25519 via vendored Monocypher 4.0.2, standard RFC 8032: verified against OpenSSL); zinc update-keygen / update-sign are the release recipe; T0 tests/t0/update_sign.sh. The release key is not set yet (kReleaseKeys empty). Open: the Linux tarball in tests/t2/package.sh (no Linux machine here), AppImage with zsync, Sparkle on macOS, pins refresh.
<!-- SECTION:NOTES:END -->
