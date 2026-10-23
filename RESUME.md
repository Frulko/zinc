# Zinc Next: resume

Binding rules: RULES.md, ARCHITECTURE.md, TESTING.md.

## 2026-10-23

- CI fixes ZN-780/781 are confirmed by owner-dispatched run 39952451514 at e1161467: 520 passed, 0 failed, 30 skipped; notify_relay PASS33s. All package/test/fuzz/benchmark/repro jobs successful; publication jobs skipped. Commit 8cb40a2b records that confirmation. The original relay stall remains unexplained; diagnostics retained.
- ZN-782 complete on native fixtures: State-owned display coordination before exec, one Pi remote app at a time, player/boot-app handoff and return, PID-bound Ctrl-C/session cleanup. Pi deploy sends source projects to the installed engine (QuickJS honored), explicit native exports remain available and report full build duration. Remote dev sends no workstation-native libraries.
- Pi updater now installs session/agent files from signed engine packages and restores their snapshots with engine/player rollback and recovery. Existing cards need the updated helper once through an administrator, then a signed release with the new engine. See image/README.md for exact commands. No Pi operation/image/cross build, push or publication performed.
- Verified native build, agent_screen, agent_deploy, agent_dev, agent_apps, pi_image_update, cli_core, ci_plan, native fbdev stub model and syntax/JSON checks. Screen/VT/network/power-cut and throughput still need the physical Pi; backlog/later.md records them. Sources expose code on paired device; typed source mode trades AOT throughput for iteration; cold plugins can compile once on Pi.
- Next: ZN-783 (owner): adapt music-tree to native/compact/portrait screen sizes. Task reserved in Backlog; no UI changes yet. User's actual Pi/music app/tablet/ESP32 process have not been touched.
- Earlier commits: 276fdb10 compiler-free install smoke; 682c43c6 release-note lifecycle; 5e3bbf58 image-builder presets/autosave/select layers; 6642076f architecture-aware signed Pi engine/player updates. ESP32, JSC/V8 and Spline integrations remain in develop and the changelog. Usage: n/a for Codex.
