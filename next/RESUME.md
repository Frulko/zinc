# Zinc Next: resume

Overwritten at the end of every session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## State (2026-10-12, 16:30)

- Owner request: a zinc daemon and an adb equivalent over the network. ZN-729 is the epic (six subtasks, at the head of the queue); ZN-729.01 and ZN-729.02 are Done. Commits `6ae32770`, `6fbd3d15`, `4d7369f8` (and `eff57b45` for the tasks). Local main only; no push.
- `zinc agent` (the daemon on a Linux or macOS device) and `zinc device` (the client) are in `build/zinc`: mDNS discovery (`_zinc._tcp`), pairing by a 6-digit code (EC J-PAKE, three tries), TLS 1.3 sessions with a key per workstation, then `list`, `pair`, `unpair`, `info`, `shell` (a command or a terminal), `push`, `pull`, `install`, `deploy`, `run`, `stop`, `uninstall`, `apps`, `logs`, `forward`, `reverse`. Code `src/agent/`, page `../docs/reports/zinc-next-agent.md`, decision D113.
- PASS: agent (T0, 9 s), agent_apps (T1, 4 s), tls, net, cli_core, security_guide. Everything was proven on the loopback interface of this Mac: no Linux run, no second machine (lines of `backlog/later.md`, cross-platform pass).
- Changes outside the module: `src/host/tls.{h,cpp}` (PSK and PAKE sessions; `tls::read` no longer returns after a TLS 1.3 session ticket with bytes unread), `MBEDTLS_KEY_EXCHANGE_ECJPAKE_ENABLED` on in the vendored mbedTLS config (the whole of `zn_mbedtls` was rebuilt), `third_party/mdns` added.
- Usage: n/a (tools/usage reads no transcript for this session).

## Next

`tools/next-task` selects ZN-729.03 (`zinc dev --device`: reload at every save, assets swapped live), then ZN-729.04 (the agent as a service, signed OTA with rollback) and ZN-729.05 (inspect, shot, monitor, top): one module, one batch for a fresh session. ZN-729.06 (Atelier's devices panel) waits for ZN-728, which another agent holds.

## Watch out

- The agent's tests start processes that outlive a shell function: in a test, `$!` must be the process itself (start `"$Z" agent` or `"$Z" device forward` directly, not through a function), and `wait` takes pids, never nothing (the agent is a background job too).
- mbedTLS is built without thread support: every call into it from the agent's threads goes through the lock of `src/agent/wire.cpp`. New agent code calls the wrappers of `wire.h`, never `zn::tls` directly.
- Existing worktrees from other sessions remain; respect task claims and the shared build limit. `apps/studio/samples/hello-flow.zproj/project.json` is someone else's uncommitted change.
- Earlier machine-specific failures, not re-investigated here: tls (ZN-610), macos_window fullscreen readback (ZN-394), macos_vibrancy; system_instance can fail under load (ZN-613). Screen locking can block non-Apple executables in the kernel; leave the development session unlocked for builds/tests.
- Distribution is rebuilt with `build/zinc build --bundle <entry> -o <app>` then `tools/package --app <app>` before Developer ID signing/notarization. The museum's app identity is now declared in zinc.json; source runs with permissions may use the existing macOS dev-bundle path.

## Raspberry Pi session (2026-10-12, a second session, the owner at the Pi)

- hero and museum-table are cross built on the Mac for the Pi 3B+ and run there (`5dd7b278`: the display driver linked into a cross build, a sysroot for plugins that need system libraries in `~/.zinc/sysroots/aarch64-linux`, filled by `tools/device <pi> sysroot`). Recipe, measurements and causes: the 2026-10-12 sections of `../docs/reports/raspberry-pi.md`. Device tool: `tools/device` (status, sysroot, push, run, stop, shot, capture, profile, stacks).
- The Pi now has a supply that holds 1400 MHz (it ran at 600 MHz, under-voltage, for every number taken before 13:56); with no heatsink it reaches the soft temperature limit under the software renderer (1200 MHz). `spark.local` did not resolve after the reboot: `pi@192.168.2.107`.
- ZN-725 (GL replay on GLES 2: a program per mode, edges as strips; D111) is integrated, back in Backlog with criteria 5 to 7 open: navigation 181 to 25 ms on the GPU against 19 ms for the software bands, at a fifth of the CPU. Open points are lines of `backlog/later.md` under "Cross-platform pass".
- Touch: a tap that lands and lifts between two polls is kept (`2ad9f0f5`, display-fbdev); two fingers over an onWheel node arrive as a trackpad pinch (`a3e0952a`, lib/std/ui.ts). display-gl's own input code (`plugins/display-gl/src/kms.cpp`) has neither the tap latch nor been checked for it.
- Touch, later the same day, all tried by the owner on the Pi ("parfait"): the fingers are drawn where they press (`82158dcc`, runtime overlay, `ZINC_TOUCHES=0` hides them); the default focus ring is for the keyboard only (`d570b891`, three goldens refreshed in `81ca1ace`); a finger reaches a small control (44 px), gives a field the focus at the lift, and a covered scroll area leaves its drags to what covers it (`4b9cc042`, corrected by `69bfa6ab` after it stopped every page of hero from scrolling: `tests/t1/touch_finger.sh` now stacks a transparent layer); the decimal and phone pads have their hide key (`35b76baa`); hero's tasks are renamed in place and its compact menu rows are 56 px wide.
- Tests left failing, not from this session: museum_details and museum_editor (the editor shows new sections its goldens lack), museum_update (`probe.ts` cannot find `plugins/devtools/native/cdp.spec` when packed elsewhere), pinball3d (3 to 5 pixels off by one).
- Asked and not done: the on-screen keyboard goes under hero's command palette; its retract handle is 18 px high; a key in zinc.json for the touch marks.
- ZN-726 (text under a scaling matrix, and museum-table's cards) is with a worktree agent, claimed; integrate its branch when it reports.
- Not done, asked by the owner: a touch calibration tool (the screen reports 0..799 x 0..479 and the mapping is 1:1, so wait for the owner's verdict after the tap fix); the map as a GPU layer under a software UI (a line of later.md).
