# 07 - Running the fullscreen app as a systemd service: upstream practice and our two bugs

Date: 2026-10-22. Scope: `zinc-shell.service`, `zinc-firstboot.service`, the SDL3 KMSDRM session on Pi OS Lite (trixie, systemd 257).
Tags: [V] verified in a source I read (URL given), [U] unverified or inferred.

## Recommendations

1. Bug 1 is confirmed from the systemd and kernel sources: `TTYVHangup=` (and `TTYReset=`, `StandardInput=tty-force`) run for every `Exec*=` command, so `ExecStartPost=/bin/sleep 2` hangs up tty1 under the running session. Remove `ExecStartPost`. Your plan (Type=notify, NotifyAccess=all, `systemd-notify --ready`) is right. `systemd-notify` 257 waits for the manager to process the message (barrier), so the exit-right-after-send race does not bite.
2. Bug 2 is confirmed: upstream `cloud-final.service` has `After=multi-user.target`, so anything that is `WantedBy=multi-user.target` and `After=cloud-final.service` is a cycle. `WantedBy=cloud-final.service` is cycle-free (a Wants edge with no ordering back).
3. No logind session (`PAMName`) is needed for a single owner app: groups `video,render,input,tty` are enough for DRM master (first opener on a card with no master gets it) and evdev. LibreELEC/Lakka (Kodi GBM) run with no PAM and no TTY directives at all. Weston and cage need `PAMName` only because wlroots/weston talk to logind/libseat; SDL KMSDRM does not.
4. Keep the TTY directives: SDL opens `/dev/tty` for the keyboard (`KDSKBMODE K_OFF`, `VT_SETMODE VT_PROCESS`), so the session needs tty1 as controlling terminal; without it keys leak to the console.
5. Add `SDL_KMSDRM_DEVICE_INDEX` only if a probe shows SDL picking the wrong card; the default scan already skips cards without a connected connector (v3d render-only node) and cards where it cannot get master.

Corrected `zinc-shell.service`:

```ini
[Unit]
Description=Zinc session (the app, or the player)
DefaultDependencies=no
After=systemd-remount-fs.service systemd-tmpfiles-setup-dev.service systemd-udevd.service systemd-modules-load.service
Conflicts=getty@tty1.service shutdown.target
Before=shutdown.target

[Service]
Type=notify
NotifyAccess=all
TimeoutStartSec=30
User=zinc
RuntimeDirectory=zinc
Environment=ZINC_RUN=/run/zinc SDL_VIDEO_DRIVER=kmsdrm
ExecStartPre=/bin/sh -c 'for i in $(seq 250); do for c in /dev/dri/card*; do [ -w "$c" ] && exit 0; done; sleep 0.02; done'
ExecStart=/usr/lib/zinc/zinc-session
Nice=-10
Restart=always
RestartSec=1
StandardInput=tty-force
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

In `zinc-session`, before the loop (the subshell is a child of the main bash, in the unit cgroup, `systemd-notify` blocks until PID 1 has the message):

```sh
( sleep 2; systemd-notify --ready --status="session up" ) &   # later: the engine sends READY=1 after its first frame
```

Corrected `zinc-firstboot.service`:

```ini
[Unit]
Description=Zinc: end the first boot
After=cloud-final.service zinc-shell.service
ConditionPathExists=!/var/lib/zinc/firstboot.done
RequiresMountsFor=/boot/firmware

[Service]
Type=oneshot
ExecStart=/usr/lib/zinc/zinc-firstboot

[Install]
WantedBy=cloud-final.service
```

`systemctl enable zinc-firstboot.service` creates `cloud-final.service.wants/`; the build script needs no change. Test both offline with `systemd-analyze verify` on the unit files in the image rootfs (it reports ordering cycles) [U: not run here]. If cloud-init is disabled in some image variant, `cloud-final` never starts and firstboot never runs [U]; the image keeps cloud-init for the first boot, so this is fine.

## 1. TTY settings apply to every Exec command; vhangup kills the main process

- [V] systemd.exec man page (v257): `TTYReset=` "Reset the terminal device specified with TTYPath= before and after execution", `TTYVHangup=` "Disconnect all clients which have opened the terminal device ... before and after execution", `TTYVTDisallocate=` likewise. The man page says "execution" of the command, not of the service. https://raw.githubusercontent.com/systemd/systemd/v257/man/systemd.exec.xml
- [V] Code: `exec_invoke()` (the one function that starts every `ExecStartPre/ExecStart/ExecStartPost/ExecStop*` command) calls `exec_context_tty_reset()` right after `setsid()`; that function does `terminal_reset_defensive` (TTYReset), `terminal_vhangup_fd` = `ioctl(TIOCVHANGUP)` (TTYVHangup) and `vt_disallocate` (TTYVTDisallocate). Then it opens stdin per `StandardInput=`, so `tty-force` also makes the post command the controlling process. https://raw.githubusercontent.com/systemd/systemd/v257/src/core/exec-invoke.c (line ~4411), https://raw.githubusercontent.com/systemd/systemd/v257/src/core/execute.c (`exec_context_tty_reset`, line 145), https://raw.githubusercontent.com/systemd/systemd/v257/src/basic/terminal-util.c
- [V] Kernel: `TIOCVHANGUP` -> `__tty_hangup()` -> `tty_signal_session_leader()` sets `p->signal->tty = NULL` for every process of the session and sends SIGHUP and SIGCONT to the session leader. So the main process gets SIGHUP and, if it survives, has lost its controlling tty (SDL's `/dev/tty` open then fails). https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/tty/tty_jobctrl.c (line 196), https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/tty/tty_io.c (line 571, 691)
- [V] `StandardInput=tty-force`: "the executed process is forcefully and immediately made the controlling process of the terminal, potentially removing previous controlling processes". The post command steals tty1 from the session. Same man page.
- [V] Upstream units that carry the same directives: Cage's `cage@.service` has `TTYReset/TTYVHangup/TTYVTDisallocate=yes`, `StandardInput=tty-fail` and also an `ExecStartPost=+sh -c "... chvt ..."`. It works there for reasons I could not verify (cage may survive SIGHUP, and `tty-fail` makes the post command fail to take the tty) [U]. Do not copy that pattern with `tty-force`. https://github.com/cage-kiosk/cage/wiki/Starting-Cage-on-boot-with-systemd
- [V] Consequence for `ExecStartPre`: it also hangs up tty1, but before the main process exists, so it is harmless. `ExecStop*` would hit the main process during shutdown, also harmless.
- [V] With `Type=notify`, `ExecStartPost=` only runs after `READY=1` ("the execution of ExecStartPost= is taken into account for Before=/After= ordering"), so even a "sleep" there would delay dependents; use none. https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html

## 2. How proven projects start a fullscreen KMS app

| Project | Type | User / PAM | TTY directives | Notes |
|---|---|---|---|---|
| cage `cage@.service` [V] | simple | `User=cage`, `PAMName=cage` (pam_unix + pam_systemd, logind session) | `TTYPath=/dev/%I`, `StandardInput=tty-fail`, `TTYReset/VHangup/VTDisallocate=yes`, `UtmpIdentifier=%I`, `UtmpMode=user` | `Conflicts+After=getty@%i`, `After=systemd-user-sessions plymouth-quit-wait`, `Wants/After=dbus.socket systemd-logind`, `Restart=always`, `ConditionPathExists=/dev/tty0`. Needs logind because wlroots uses libseat. |
| Weston system service (docs) [V] | `ExecStart=systemctl --wait --user start ...` | `User=`, `PAMName=login` ("Weston requires") | `TTYPath=/dev/tty7`, `tty-fail`, same three yes, `UtmpIdentifier=tty7` | `After=systemd-user-sessions`. Weston user service form uses `Type=notify` with `--modules=systemd-notify.so`, `WatchdogSec=20`. https://wayland.pages.freedesktop.org/weston/toc/running-weston.html |
| LibreELEC / Lakka Kodi (GBM) [V] | simple (default) | root, no PAMName | none | `Restart=always`, `RestartSec=2`, `StartLimitInterval=0`, `TimeoutStopSec=30`, `ExecStop=kill -TERM $MAINPID`. Kodi opens the DRM card itself as root. https://raw.githubusercontent.com/LibreELEC/LibreELEC.tv/master/packages/mediacenter/kodi/system.d/kodi.service |
| Debian/Ubuntu Kodi standalone (third-party wiki) [V] | simple | `kodi` user, `PAMName=login` | `TTYPath=/dev/tty1`, `Conflicts=getty@tty1` | Mirror of a wiki, not official. https://phabricator.keithzg.ca/phriction/diff/46/?l=7&r=9 |
| Arch Linux ARM Kodi GBM unit [V] | simple | not read in detail | not read | `Restart=on-abort`, `ExecStop=killall kodi.bin`. https://archlinuxarm.org/forum/viewtopic.php?p=68525 |
| balena browser block [V] | container | `privileged: true`, Weston owns outputs and input | none (no VT) | No systemd unit; shows that the "no seat manager" route is common in appliances. https://github.com/balena-labs-projects/browser |
| Qt eglfs (docs) [V] | n/a | not covered | Qt installs SIGINT/SIGTERM handlers that restore the console and `_exit()`; no restore after SIGSEGV/SIGABRT; `QT_QPA_PRESERVE_CONSOLE_STATE` | Device via `QT_QPA_EGLFS_KMS_CONFIG` json `"device": "/dev/dri/card1"`. Input: opens every `/dev/input/event*`, kernel/udev permissions decide. https://doc.qt.io/qt-6/embedded-linux.html |
| Batocera, RetroArch/Lakka launcher, FullPageOS, Home Assistant OS, Cog/WPE on Pi, Boot to Qt units | - | - | - | [U] Searches returned no unit I could read (Batocera uses its own init scripts; FullPageOS uses getty autologin + X; Cog docs only say the FDO/DRM backend is kiosk-only, https://github.com/Igalia/meta-webkit/wiki/RPi). Not used as evidence. |

Patterns that repeat: compositors that go through logind/libseat (cage, weston) use `PAMName` + `tty-fail` + `Utmp*` + the three TTY resets; engines that open the DRM node themselves (Kodi on LibreELEC) run with no PAM and no TTY directives. Our SDL case is the second kind, plus the keyboard/VT use of `/dev/tty`.

`tty-fail` vs `tty-force`: `tty-fail` is upstream's choice (refuse to steal a busy tty). `tty-force` also works for us because getty@tty1 never runs (a drop-in condition; a mask breaks Pi OS's user rename, see 00-synthesis) and the kernel console is on tty3; it recovers from a stale controlling process. [U] if a later image variant keeps a getty on tty1, switch to `tty-fail`.

Ordering: cage orders `After=systemd-user-sessions.service` (logins permitted). That is only needed with PAM. We use `DefaultDependencies=no` and order after udevd/modules-load; correct for an app that needs `/dev/dri` only. [U] `dev-dri-card0.device` ordering: the device unit exists only if udev tags the node `systemd`; nothing I read says it does for DRM. Keep the `ExecStartPre` writable-wait loop. `systemd-udev-settle` is called out as a hidden boot bottleneck by Raspberry Pi's own paper [V]: never wait on it.

## 3. Non-root without a logind session: DRM master and input

- [V] Kernel `drm_master_open()`: when a card has no master, the first opener's fd becomes master, no privilege needed. `drmSetMaster` from an fd that is not already master needs `CAP_SYS_ADMIN`, except for an fd that was master earlier in the same process (`was_master` and same tgid). When another master exists it returns `-EBUSY`. https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/gpu/drm/drm_auth.c (lines 163-351)
  Consequence: a non-root app works if nothing else holds master (no compositor, no leftover process); SDL's probe `open -> drmSetMaster -> close` then reopens and gets master again.
- [V] udev default rules: `/dev/dri/card*` -> group `video`; `renderD*` -> group `render`; `/dev/input/*` -> group `input`; `/dev/tty[0-9]*` -> group `tty`, mode 0620. https://raw.githubusercontent.com/systemd/systemd/v257/rules.d/50-udev-default.rules.in The nodes are `root:root 0600` until udev processes the event (already handled by our wait loop; see 05-pios-fast-boot.md).
- [V] Without a session, device ACLs (`uaccess`, "access ... tied to an active seat") do not apply: access is by the groups only. https://www.freedesktop.org/software/systemd/man/latest/sd-login.html Our groups cover it.
- [V] What `PAMName=` adds: `pam_systemd` registers a logind session, creates `/run/user/$UID`, sets `XDG_SESSION_*`, `XDG_SEAT`, `XDG_VTNR`. https://www.freedesktop.org/software/systemd/man/latest/pam_systemd.html `PAMName=` only works with `User=` [V, systemd.exec man page].
- [U] What breaks without it: no `XDG_RUNTIME_DIR` (set `RuntimeDirectory=zinc`, already done), no logind `TakeDevice` arbitration (nobody revokes DRM master or evdev fds on a VT switch; harmless while Ctrl-Alt-Fn is blocked), `loginctl` shows no session. Doc 04 argued the same (fbcon does not hold master on current kernels) [U, marked there as [M]].
- [U] Cost of adding `PAMName=login`: starts `pam_systemd` -> needs dbus + systemd-logind in the boot path and `After=systemd-user-sessions.service`; contrary to the fast-boot goal. Add it only if the engine later uses libseat or the app needs `/run/user/UID` services (PipeWire, dbus user bus).
- Recommendation: plain groups now; `seatd` (or logind) only if we add a Wayland client or several apps.

## 4. SDL3 KMSDRM specifics (SDL main, `src/video/kmsdrm`)

- [V] Needs GBM and EGL: `KMSDRM_GBMInit()` calls `gbm_create_device(drm_fd)` and fails with "Couldn't create gbm device." There is no dumb-buffer window path (the word "dumb" appears only in a comment). The only non-GBM route is a Vulkan window. https://raw.githubusercontent.com/libsdl-org/SDL/main/src/video/kmsdrm/SDL_kmsdrmvideo.c (line ~1534)
- [V] Device choice: `SDL_KMSDRM_DEVICE_INDEX` (hint, "0 to 99", set before SDL_Init) wins; otherwise SDL scans `/dev/dri/card*`, opens each, requires connectors, encoders and CRTCs > 0, a connected connector with modes, and (unless `SDL_KMSDRM_REQUIRE_DRM_MASTER=0`) that `drmSetMaster` + `drmAuthMagic(0)` does not return `-EACCES`. https://raw.githubusercontent.com/libsdl-org/SDL/main/include/SDL3/SDL_hints.h and the C file above (line 77)
  So on Pi 4/5 the render-only v3d node (no connectors) is skipped without the hint; card numbering varies (a Pi 4 report had v3d as card0, vc4 as card1; Qt docs use card1 in examples) [V that numbering varies: https://doc.qt.io/qt-6/embedded-linux.html; Pi 5 numbering U, check `ls -l /dev/dri/by-path/` on the board]. Our `ExecStartPre` accepts any writable `card*`: it can pass on the wrong card while vc4 loads later [U]. Safer: wait for the card that has a connector, or retry in the session script.
- [V] `SDL_KMSDRM_REQUIRE_DRM_MASTER=0` exists for apps that render to DRM overlays themselves; do not set it.
- [V] `SDL_KMSDRM_ATOMIC` (default 1, since SDL 3.4) switches atomic modesetting. Keep the default.
- [V] No logind, libseat or `KD_GRAPHICS` call in the KMSDRM video files I read. [V] The keyboard code (`src/core/linux/SDL_evdev_kbd.c`) opens `/dev/tty`, sets `KDSKBMODE K_OFF` (hint `SDL_HINT_MUTE_CONSOLE_KEYBOARD`, default true) so keystrokes do not reach the console, and `VT_SETMODE VT_PROCESS` to get VT switch signals; if `/dev/tty` fails ("e.g. on the Steam Link") it continues without. https://raw.githubusercontent.com/libsdl-org/SDL/main/src/core/linux/SDL_evdev_kbd.c Without a controlling tty: the app still gets evdev input, but typed keys echo into tty1 (cursor, text) [U].
- [V] On crash, SDL registers an emergency cleanup to restore the keyboard mode unless `SDL_HINT_NO_SIGNAL_HANDLERS`; after SIGKILL or SIGSEGV the console keyboard may stay muted [U]. systemd `TTYReset=yes` after execution resets it [V, man page].
- [V] Input is evdev via udev (`SDL_EVDEV_udev_callback`), so `input` group and hotplug work without logind.

## 5. Readiness: Type=notify vs Type=exec

- [V] `Type=exec`: started once `execve()` of the main binary succeeded. `Type=notify`: started when the service sends `READY=1`; `NotifyAccess=` defaults to none (forced to `main` for notify). https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
- [V] Units ordered `After=zinc-shell.service` wait until it is "started": with Type=notify, until READY (or failure/timeout). Our `10-zinc-defer.conf` drop-ins (NetworkManager, ssh, avahi, timesyncd, cron...) therefore start after the first frame, which `Type=exec` could not give. `After=` alone does not require success [U: standard `After=` semantics, if the session fails they still start].
- [V] The race: a notification is attributed only if the sender is still alive when PID 1 reads it, or if the manager forked it (main/exec processes). A short-lived helper under `NotifyAccess=all` can be ignored. systemd-notify fixes this by waiting for the message to be processed ("will wait until the notification message has been processed"; `--no-block` disables that). It tries to spoof the parent PID first (needs privilege; fails for user `zinc`) and falls back to its own PID, which is fine with `NotifyAccess=all`. https://raw.githubusercontent.com/systemd/systemd/v257/man/systemd-notify.xml (code: `sd_pid_notify_barrier`, `src/notify/notify.c`, 5 s timeout). pidfd is not what fixes it: pidfd appears in `MAINPIDFD=1`/`MAINPIDFDID=` (to change the main PID race-free), not in plain `READY=1` [V: https://www.freedesktop.org/software/systemd/man/latest/sd_notify.html].
- [V] The engine sending `READY=1` itself (long-lived process, `NotifyAccess=all`, descendant of the session through `tee`) has no race. It must not leave `NOTIFY_SOCKET` for its children [U]. Then drop the 2 s timer in the script. Bash's loop restarts the app: later `READY=1` messages are ignored once the unit is started [U].
- Set `TimeoutStartSec=` (done, 30): a Type=notify service that never sends READY fails after the default 90 s and is restarted by `Restart=always`. The script must send READY even when no app exists (the player shows), which the timed `systemd-notify` does.
- Optional [U]: `WatchdogSec=` + `WATCHDOG=1` from the engine to restart a hung render loop; not needed now.
- `Restart=always` with `RestartSec=1` has no limit issue only if start rate stays low: default `StartLimitBurst=5` in 10 s would stop a crash loop. LibreELEC sets `StartLimitInterval=0` [V]; for us a hard stop after a crash loop leaves a black screen, so consider `StartLimitIntervalSec=0` in `[Unit]` [U] (the player is the visible fallback, the bash loop already absorbs app crashes).

## 6. Ordering cycle: zinc-firstboot vs cloud-final

- [V] Upstream `cloud-final.service`: `After=network-online.target time-sync.target cloud-config.service rc-local.service`, `After=multi-user.target`, `Before=apt-daily.service`, `Wants=network-online.target cloud-config.service`, `[Install] WantedBy=cloud-init.target`. https://raw.githubusercontent.com/canonical/cloud-init/main/systemd/cloud-final.service (checked on main, not on Debian's packaged version [U])
- [V] Cycle: firstboot `WantedBy=multi-user.target` puts it before multi-user.target is reached; `After=cloud-final.service` plus cloud-final's `After=multi-user.target` closes the loop. systemd breaks it by deleting a job at boot, nondeterministically.
- Fix: `WantedBy=cloud-final.service` (a Wants edge, no ordering). Alternative, `WantedBy=cloud-init.target`. Both start only when cloud-init runs [U], which matches the intent (first boot only).
- Note: cloud-final waits for `network-online.target` and `time-sync.target` [V]. `NetworkManager-wait-online` is masked in our image, so `network-online` returns early [U]; the first boot may still wait for `time-sync.target` when there is no network [U]. The Pi paper warns against gating services on time sync, and notes kiosk browsers as the exception [V]. https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-010196-WP-1-Optimising%20boot%20time%20on%20Raspberry%20Pi%20single-board%20computers.pdf
- Since `zinc-firstboot` is `After=zinc-shell.service` (Type=notify), the first boot waits for the first frame before ending: wanted.

## 7. Fast-boot practices we may have missed

- [V] Raspberry Pi's 2026 boot-time white paper (RP-010196): measure with `systemd-analyze critical-chain`; mask unused units; `systemd-udev-settle` is a "common hidden bottleneck"; shrink or remove the initramfs; do not gate services on time sync. Same URL as section 6.
- [V] Official Touch Display 2 is brought up by the kernel, not the firmware: expect about 15 s of blank panel on that display, unlike HDMI and Touch Display 1 (third-party article, https://industrialmonitordirect.com/blogs/knowledgebase/raspberry-pi-touch-display-2-boot-delay-fix). Matters if we support it; [U] whether it holds on Pi 5.
- [V] Boot to Qt on Pi 4: userspace trimming alone gave about 13% (https://qt.io/blog/boot2qt-/-how-to-optimize-boot-time-in-user-space-on-a-raspberry-pi-4); small, so the big wins are firmware, kernel and initramfs, as in 03/05.
- [U] Things to check on the board: `systemd-analyze plot` after the fix; that `vc4` is loaded early (modules-load, listed in our `After=`); that `Nice=-10` does not starve udev during the first seconds; that `RuntimeDirectory=zinc` is removed on every restart (`RuntimeDirectoryPreserve=restart` keeps `crash.txt` and `app.log` across `Restart=always`; the script itself relies on `$RUN/crash.txt` surviving the player start, which is the same process, so it is fine, but the player is not a restart).
- [U] Seat/VT: with `TTYVTDisallocate=yes` the VT is cleared before the app; set `vt.global_cursor_default=0` (already in cmdline) so fbcon does not draw a cursor between the units.
