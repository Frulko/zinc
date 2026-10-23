---
id: ZN-784
title: Apply Pi image login passwords to renamed users
status: Done
assignee: []
created_date: '2026-10-23 14:52'
updated_date: '2026-10-23 14:59'
labels:
  - bug
  - pi
  - size-S
dependencies: []
ordinal: 520460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Image first-boot data applies the configured password to both new and existing users, without storing it as plaintext.
- [x] #2 A native regression covers generated cloud-config and the existing-card recovery limitation is documented.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read-only paired-device identity/SSH fingerprint confirmed current address .32; spark uid1000 exists, saved profile retains intended password. One SSH password attempt failed. Pi boot report records all four cloud-init stages failed, yet old cleanup disabled cloud-init and marked done; protected logs/password state unavailable, original failure remains unproven. Fix users[].passwd to hashed_passwd for renamed/existing accounts; require cloud-init status success before destructive firstboot cleanup. Native pi_image_bootstrap PASS (real jq/OpenSSL config generation for password/key/no-user and successful/error/degraded cleanup); ci_plan PASS; shell syntax/diff checks pass. Docs/report/changelog updated. No image/cross build or Pi mutation; existing card requires owner-controlled recovery or corrected reflash. User now requests a downloadable Etcher/Imager CI image and future firmware OTA design; continue separately. Usage: n/a for Codex.
<!-- SECTION:NOTES:END -->
