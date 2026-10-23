---
id: ZN-777
title: Update and switch the Pi player engine from its settings
status: Done
assignee: []
created_date: '2026-10-23 08:19'
updated_date: '2026-10-23 08:44'
labels:
  - ui
  - tooling
  - size-M
dependencies: []
ordinal: 513460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: show available engine updates in the Pi player; list releases compatible with its userspace architecture; install a newer or older release on the Pi, rebuild its player, and retain a working installation on failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The player checks for compatible published versions, indicates an available update on screen and provides an Updates settings page with explicit install confirmation.
- [x] #2 The updater verifies the release signature and checksum, selects the userspace architecture, prepares and tests the player before activating engine and player together, and supports older versions and local rollback.
- [x] #3 Targeted Mac tests cover release selection, failed preparation, activation and rollback, plus the player UI; device-only checks are recorded for the cross-platform pass.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the owner-selected independent player bundle: player-source.tar.gz stays unchanged; the chosen signed engine repacks it into player.zapp on the Pi. Python/systemd helper uses existing zinc verify --key, SHA-256, dpkg userspace architecture, strict extraction and a root-owned update state. Candidate pack and headless frame run as zinc before atomic activation; a first-frame readiness signal, saved previous pair and flushed recovery journal cover failed or interrupted activation. D164 records the choice. Updates UI provides the available-version icon, stable release selection, confirmation, progress/error and offline local restoration. Owner also requested recovery for an unavailable network: Wi-Fi now confirms and restarts NetworkManager/wpa_supplicant and scans again. Proof on development Mac: build/zinc check image/player; tests/run --only pi_image_update (five cases, real Ed25519 signatures over local archives and simulated service/activation failures and interrupted switch); tests/run --only pi_image_updates (real .zapp, icon/menu, older version, cancel/confirm, restore, network restart, first-frame signal; no zinc:network source in the runtime engine root); tests/run --only pi_image_player (idle rendering bound and reviewed Wi-Fi goldens); tests/run --only network_plugin; Bash syntax and git diff --check. No engine code changed or engine rebuild needed. Real image build, Pi boot/network/systemd/sudo/fbdev/power-cut checks were not run; the existing first-boot issue remains unresolved and the exact cross-platform validation is in backlog/later.md. Nothing pushed or published. Usage: n/a for Codex.
<!-- SECTION:NOTES:END -->
