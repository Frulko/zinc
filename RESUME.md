# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## 2026-10-23: Pre-release CI failures (ZN-781, Review)

- Owner asked to fix all failures of run 39939275942 (b7b1a3e4): 511 passes, nine failures, 30 skips, plus both Mac packaging jobs. Full evidence and changes: `docs/reports/ci-pre-release-2026-10-23.md`.
- Eight failing checks have concrete fixes: isolate locale overrides in i18n/Atelier tour tests; fix the real tour save/check race; fix guide help parsing and restore mem help; keep frozen lexer input separate from the styled UI execution fixture; assert device API/network table additions separately against unchanged baselines; honor project entry/engine in examples-status and register Fatty/Kanban as OK.
- All nine originally failing tests PASS locally: i18n, atelier_tour, tour, guide_store, lexer, native_gen, plugin_manifest, examples_all (complete inventory), notify_relay. Also PASS examples_status, cli_core and ci_plan; native zinc rebuilt, hostile locale environment tested, syntax/JSON checks and frozen-source identity verified. No historical golden/conformance/corpus file edited.
- notify_relay also passed unchanged with the exact native binary from CI's build-macos-arm64 artifact. Its archived capture stall is NOT declared fixed. The harness now isolates the Messages DB, stops at the first failure and prints fixture DB counts plus relay/tablet logs (forced failure path tested), replacing minutes of cascading failures. ZN-781 stays in Review for a fresh hosted run; no speculative product patch or test skip.
- No push, workflow dispatch, publication, full T2 repeat or cross build. An owner-started ESP32 board process was observed and left untouched. Research agents were read-only; no real notification/tablet/app was touched. Usage: n/a for Codex.

## Earlier commits in this session

- `276fdb10` (ZN-780): installed-game creation smoke checks the project instead of the old one-line CLI message; English pinned inside clean environments. Rebuilt native package and install_nocompiler PASS without a compiler. Package check artifacts: `/tmp/zinc-ci-install.ICztah/current`.
- `682c43c6` (ZN-779): release notes read the tagged CHANGELOG, survive failed/unwatched attempts, and archive only after confirmed publication while retaining new entries. Repeated publication upload/edits existing releases. release_tool, release_workflow/actionlint, ci_plan PASS. Existing public release bodies remain unchanged; old tags keep their old workflow.
- `5e3bbf58` (ZN-778): Pi image builder named presets, atomic autosave/errors, shared Select anchored layers. pi_image_presets, pi_image_builder_presets, pi_image_builder, nuxt_ui and checker PASS.
- `6642076f` (ZN-777): Pi player architecture-aware signed engine install/downgrade, same source bundle repacked on Pi, startup rollback/journal recovery, update menu/icon and confirmed network restart. pi_image_update, pi_image_updates, pi_image_player, network_plugin and checker PASS. D164 and image/README.md explain it.
- ESP32 changes, JSC/V8 and Spline are present in develop; CHANGELOG contains their entries (older JSC/V8 announcements remain in historical sections).

## Known limits and next step

- Owner next: `git push && gh workflow run zinc-next --ref develop`. Rerunning the old run keeps b7b1a3e4; a new dispatch tests the pushed fixes and publishes neither site nor release. The hosted notification-capture result is still needed before claiming that CI failure resolved.
- Pi image not rebuilt here. Pi 3 B+ first boot and real network availability, systemd/sudo/DRM/power-cut rollback remain unverified; old images need rebuilding/provisioning for the updater/menu. See `backlog/later.md`, Cross-platform pass.
- Pre-existing Native::iram initializer warning recorded in backlog/later.md; unrelated diagnostics/netlog/Windows pixel/agent_ota limits not reopened. Leave the owner's music app/tablet and board process alone.
