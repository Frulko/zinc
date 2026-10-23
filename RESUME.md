# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## 2026-10-23: Pi image builder presets and select overlays (ZN-778)

- Builder saves/loads named complete profile snapshots from private `presets.json` beside the autosaved profile. Latest edits and preset list return after reopening; unknown base/engine keys and credentials survive. Duplicate names are refused. Save dialog supports Enter, Escape and Cancel.
- Autosave now uses a private temporary directory, mode 0600 and atomic replacement; failed/corrupt reads and writes are visible. A profile that could not be saved never starts a build.
- Shared Nuxt Select uses the existing anchored layer/focus/dismiss APIs, so lists escape Card clipping and receive pointer hits above later fields. Escape/outside presses close them. No core engine change or rebuild.
- Proof: `build/zinc check image/builder`, `pi_image_presets`, `pi_image_builder_presets`, `pi_image_builder`, `nuxt_ui`; reviewed select/modal and updated builder goldens. Docker and cross-platform runs not done; nothing pushed. Usage: n/a for Codex.

## 2026-10-23: Pi player updates and network recovery (ZN-777)

- Owner requested a Pi update menu, available-version icon, architecture-aware upgrades/downgrades, then chose an independent player bundle. `player-source.tar.gz` stays unchanged; each chosen engine repacks it to `player.zapp` on the Pi. D164 and `image/README.md` describe the design.
- Root-owned Python/systemd updater reuses `zinc verify --key` with the image key, checks SHA-256/version/userspace architecture, rejects archive links/special files and compiles/draws as `zinc`. It activates engine/player together through `current`, waits for the first frame, retains the previous pair and uses a flushed journal + boot recovery unit for interrupted switches. Apps, settings and pairing stay outside generations. Stable release list covers the latest 100 release entries with matching downloads; unsigned releases fail closed.
- Updates UI: automatic/manual check, notification icon, version selection, explicit install confirmation, progress/errors and local rollback. Wi-Fi now has a confirmed Restart network action for NetworkManager/wpa_supplicant and a fresh scan.
- Proof: `build/zinc check image/player`; `pi_image_update` (five local signed/transaction cases including interrupted switch), `pi_image_updates` (actual .zapp and scripted UI, with network plugin sources absent from the runtime engine root), `pi_image_player`, `network_plugin`; Bash syntax; `git diff --check`. Wi-Fi and update goldens reviewed. No C++ change or engine build.
- Not run: image rebuild, ARM/Linux/QEMU or real Pi/systemd/sudo/DRM/power-cut tests. The Pi 3 B+ first boot and real network availability are NOT declared fixed; see existing pi-image entries and ZN-777 under Cross-platform pass in `backlog/later.md`. Existing Pi images do not acquire the new helper/menu until rebuilt/provisioned. Nothing pushed or released. Usage: n/a for Codex.

## Earlier known limits (unrelated)

- Prior resume recorded diagnostics, netlog and Windows pixel failures, plus an agent_ota CI flake; not re-investigated.
- Mobile follow-ups remain in their tasks and `backlog/later.md` (ZN-744/741, ZN-627, ZN-746, ZN-743; ZN-631 is in Review). Do not disturb the owner's music app on the tablet.
- Previous owner request ZN-775 (Kanban editing all displayed sections) was completed and tested on 2026-10-22; no changes to it here.

## Next

Current owner request completed on the development Mac; no unrelated backlog task started. Hardware verification remains the cross-platform pass.
