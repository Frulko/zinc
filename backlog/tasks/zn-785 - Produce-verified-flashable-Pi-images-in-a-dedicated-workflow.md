---
id: ZN-785
title: Produce verified flashable Pi images in a dedicated workflow
status: Done
assignee: []
created_date: '2026-10-23 15:00'
updated_date: '2026-10-23 15:13'
labels:
  - pi
  - ci
  - size-M
dependencies: []
ordinal: 521460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A manual image workflow pins and verifies a published arm64 engine, builds and checks a flashable image, and offers public download artifacts without credentials or release/site publication.
- [x] #2 Etcher users can apply their saved builder profile before first boot without rebuilding the image; native tests cover configuration and image workflow preparation.
- [x] #3 Document current engine updates versus a future signed A/B system firmware path, including Pi 3 compatibility and remaining hardware proof.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented manual pi-image.yml on ubuntu-24.04-arm with exact stable engine input, existing updater manifest/name/version/hash validation and host OpenSSL Ed25519 verification before execution; rejects missing Pi system payload. Build/check precedes read-only Actions artifact upload, no release/site changes. Public image has no personal credentials; tools/pi-image configure reuses firstboot writer with saved private builder settings, refuses consumed cards and clears prior enabled markers/WiFi on reconfiguration. Fixed image-check environment literal and ldd false success; final fsck now runs before loop detach and fails closed. Native pi_image_pipeline and pi_image_bootstrap pass (real signatures/rejections/config/reconfiguration/library/fsck errors); pi_image_update and ci_plan pass; actionlint, YAML and shell syntax/diff checks pass. Image workflow and physical boot not run; new signed arm64 engine release with payload and default-branch workflow registration needed before dispatch. Current latest 0.6.2 rejected intentionally. No ARM/image build, push, dispatch, flash or remote mutation. Future RAUC A/B proposal researched with primary sources, no implementation; details in docs/reports/zinc-next-pi-image-pipeline.md. Usage: n/a for Codex.
<!-- SECTION:NOTES:END -->
