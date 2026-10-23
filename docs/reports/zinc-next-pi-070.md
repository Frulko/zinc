# v0.7.0 release checks and Pi player updates

2026-10-23, ZN-789. Native Mac implementation and targeted checks; no push, release, image build or device mutation.

## Failed release

[Run 39982002224](https://github.com/Frulko/zinc/actions/runs/39982002224) tested tag `v0.7.0`, commit
`24f5a12fcdccce568d3f8762f85740d8e9df1af5`: **523 passed, 4 failed, 31 skipped**. Build/package, Linux cross,
reproducibility, benchmarks and fuzz jobs passed. Publication was blocked correctly; the failed tag is not a published release.

| Check | Evidence and change |
|---|---|
| examples_all | All 113 listed entries ran successfully; the new glass-icon-reveal entry was absent from the inventory. Added it and ran its scoped check. |
| music_tree_responsive | The fixture let StatusBarNode read the host battery, differing from the charging/full golden. Freeze the fixture battery and timezone without changing the real app or its goldens; preserve actual/diff output on mismatch. |
| agent_deploy | The client stopped its logs loop on socket EOF before draining complete frames already buffered by fill(). Drain those frames first; a deterministic native fixture executes the actual client function with final output plus EOF in one read. |
| kanban | The initial failure had an empty log; the traced retry passed all three engines and hashes. The silent check/idle stages used unscaled 45-second limits. Honor ZN_WAIT_SCALE, and print the failed stage/output. The original stage/root cause was not proven; the local targeted test passes. |

The owner-disabled notify_relay integration remains skipped in CI. No complete suite was rerun locally.

## Display and input

Only the player's Linux size is removed; macOS keeps its development window. The existing native-size hook reads the framebuffer
before allocating the surface. The player already lays out against width()/height(): the official 800×480 screen stays native,
and a 1920×1080 framebuffer gets a 1920×1080 surface. This does not change the kernel's HDMI mode selection or implement live HDMI
mode switching. Native headless home/settings captures were inspected at 1920×1080.

The actual framebuffer driver now appends key down/up/repeat, modifiers, UTF-8 text, mouse button events and both wheels to HalInput.
It rescans evdev devices every second without resetting pointer/touch state, and releases keys on device removal. Escape remains
available to apps through escapeByApp(); internal display actions reuse HalDisplay.device, with no display ABI size change.

Layouts and compose/dead keys use [libxkbcommon's state API](https://xkbcommon.org/doc/current/structxkb__state.html)
and [compose API](https://xkbcommon.org/doc/current/group__compose.html), loaded through its stable C ABI. Layouts come from
/etc/default/keyboard (also reloaded after first-boot provisioning) or XKB_DEFAULT_*. The image already installs libxkbcommon0;
[Debian trixie's package depends on xkb-data](https://packages.debian.org/trixie/libxkbcommon0), so these changes need no extra apt step
on that image. A missing library/keymap is reported. Native Mac fixtures use a controlled XKB boundary; when the real library is
available the same fixture additionally asserts French AZERTY, UTF-8 and circumflex composition. That real-library path was not
executed on this Mac.

The cursor reuses display-gl's outlined arrow, at 2× size from 1280 surface pixels wide. It is composited during conversion and adds
old/new cursor damage without changing retained app pixels or rerasterizing idle frames. KMS damage history also includes it, with
the pointer kept opaque above video holes. Touch hides it. Cursor shapes all use the arrow for now.

## Updates and names

tools/package puts the exact player-source archive, zinc-session, zinc-agent.service, zinc-admin and zinc-shell.service inside the
engine archive, covered by its existing signed manifest/hash. The updater packs those sources with their engine as user zinc, tests
a frame against a virtual framebuffer file, snapshots the four system files and activates them together. Explicit ZINC_DISPLAY
loads a driver even headless, so the preparation probe must never open the running player's real framebuffer or USB input.
Failed activation/rollback/interrupted recovery
restore the old generation and system files. Older two-file payloads and source-less releases retain their fallback behavior;
old snapshots/baselines are extended atomically before switching, including retry after an interrupted snapshot migration.

An existing card needs this checkout's root-owned updater helper installed once by an administrator, then a **published signed
release containing these changes** selected in Updates. Exact bootstrap commands: image/README.md, “Updating an existing card”.
Updating the workstation alone does not change the Pi. OS/kernel firmware and Debian packages are outside this updater.

The default empty hostname creates a zinc-auto-name boot marker and tells cloud-init to preserve the hostname. The session's
root ExecStartPre runs zinc-admin identity: generate 15 random hexadecimal characters grouped 4-6-5, durably save the name in
root-owned /etc/zinc/device-name, set kernel/persistent hostname and hosts, consume the marker. No root identity state is written
inside user zinc's writable home. Saved names survive reboot; a fresh flash has no saved name. Explicit profile/Imager names win,
including when Imager replaces the cloud-config with YAML. The agent starts with --name "$(hostname)" and retains its internal id
and pairing keys. Updating an existing card neither generates a new identity nor clears pairing.

## Local proof

- Native incremental tools/build zinc and zinc check image/player, image/builder: passed.
- agent_logs_eof, agent_deploy, kanban, music_tree_responsive: passed. Existing music goldens unchanged.
- Scoped tools/examples-status --check glass-icon-reveal/src/main.ts: passed.
- fbdev_desktop: passed; actual driver at 1920×1080 in 16/24/32 bpp, cursor trails/idle retained frame, input/repeat/UTF-8/modifiers,
  late input-file attachment, removal, queue limits and the actual shared runtime Escape/fallback functions. Existing chip_fbdev format/letterbox/multitouch golden also passed.
- pi_image_update: signed downloads/trust boundary, actual packaged player/system payload, legacy fallback, interrupted snapshot
  migration, activation failures, downgrade, rollback and interrupted recovery: passed using temporary files/stubbed services.
- pi_image_bootstrap and pi_image_pipeline: passed; random first boot/reboot/reflash/explicit-name fixtures, login credentials,
  cloud-init failure cleanup, Etcher setup and signed payload requirements. No image was rebuilt.
- pi_image_player, pi_image_updates, pi_image_builder and pi_image_builder_presets: passed. The builder's options golden changes
  only its scroll indicator geometry after the longer automatic-name help text; other goldens are unchanged.
- ci_plan, shell syntax and git diff --check: passed.

## Next verification

The next CI run must confirm the release checks, including Kanban's previously unlocalized failure. Physical Pi proof remains:
native official/1080p display mode and KMS/video cursor composition, USB mouse/keyboard hotplug, AZERTY/dead keys, exclusive dev
handoff, real systemd update/rollback/power-loss recovery, SSH login and two fresh flashes/reboots for names. See backlog/later.md.
No release or site was published by this work.
