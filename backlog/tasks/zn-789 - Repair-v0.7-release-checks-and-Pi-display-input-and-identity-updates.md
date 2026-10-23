---
id: ZN-789
title: Repair v0.7 release checks and Pi display input and identity updates
status: Done
assignee: []
created_date: '2026-10-23 17:04'
labels:
  - bug
  - pi
  - ci
  - size-L
dependencies: []
ordinal: 522490
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The v0.7.0 failed checks have concrete fixes and relevant local regressions pass without publishing
- [x] #2 Pi player uses native display resolution and supports USB keyboard and mouse including visible cursor and hotplug through targeted native fixtures
- [x] #3 Signed updates carry the matching player sources and required system changes with rollback so an existing card can receive fixes without reflashing
- [x] #4 Fresh images generate a xxxx-xxxxxx-xxxxx device name once and preserve it on reboot while reflashing generates a new identity and explicit names remain supported
- [x] #5 Document native verification and the remaining release, helper bootstrap and physical Pi checks
<!-- AC:END -->

## Implementation Notes

- Audited failed v0.7.0 run 39982002224 at 24f5a12f: 523 pass, four failures. Inventory, host-dependent battery fixture and final-log EOF race corrected. Kanban now honors CI wait scaling and reports formerly silent failed stages; original empty-log failure did not reproduce, so its stage/root cause is not claimed proven.
- Player Linux surface follows the framebuffer size; actual native driver fixture verifies 1920x1080 at 16/24/32 bpp and existing 800x480/letterbox/multitouch behavior. evdev now feeds desktop keyboard/text via libxkbcommon, mouse events/wheels, hotplug, visible idle cursor and app-owned Escape, without changing the display ABI.
- Signed packages include matching player sources and four system files; preparation probes a virtual framebuffer instead of competing for the active display/input; updater retains old-release compatibility, extends older snapshots atomically and restores the files with the engine/player on rollback. Interrupted snapshot migration has a deterministic retry regression.
- Empty hostname means generated first-boot name. Root-owned /etc/zinc/device-name persists across boot; explicit profile/Imager names win. Existing-card update and pairings keep their identity. New agent unit supplies the hostname explicitly.
- Native build/checks, agent_logs_eof, agent_deploy, kanban, music_tree_responsive, scoped glass-icon-reveal inventory check, fbdev_desktop (including prior chip golden), pi_image_update, pi_image_bootstrap, pi_image_pipeline, pi_image_player, pi_image_updates, pi_image_builder, pi_image_builder_presets and ci_plan passed. 1920x1080 player captures inspected. Only the builder options scroll-indicator golden changed with the longer name help text.
- No full suite, cross compilation, image build, device mutation, push, workflow dispatch or release. Real XKB/USB/KMS/systemd/physical boot proof remains in backlog/later.md. Existing cards need the administrator-installed updater helper once and a newly published signed release containing the fixes.
- Detailed evidence, exact CI failure limits and next physical checks: docs/reports/zinc-next-pi-070.md. Bootstrap commands: image/README.md.
