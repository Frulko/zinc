# One orchestrator for the Pi: the agent grows into the session (design, 2026-10-25)

The owner wants one daemon on the Pi to run the player and the apps, own the screen, show updates and errors, and offer one API
to the player, the apps and `zinc device`. This report maps what runs today, says where it breaks, looks at how other systems do
it, and proposes an architecture with phases. It changes no code. Companion reports, written in parallel: the compositor
(`docs/reports/pi-compositor-design.md`) and updates (`docs/reports/pi-updates-design.md`); this design works with or without
the first and leaves the update mechanics to the second.

**Recommendation in one paragraph.** Make `zinc agent` the session. One user process (`zinc agent --session`, user `zinc`), run
by the existing `zinc-shell.service` on tty1, always on, is the parent of the player and of every app: it starts, stops and
switches them, owns the screen because it is the only one that starts programs on it, restarts crashes with backoff, notices hangs,
keeps logs and crash records, and serves one API (the agent's own JSON frames) on a Unix socket for the player and the apps, and
over TLS on the network for `zinc device`. The network listener becomes a setting of that process instead of a second unit. Root
work stays where it is (the `zinc-admin` verbs and the `zinc-update@` jobs, run by systemd), called by the daemon. The bash
`zinc-session`, the lease files (`device-screen`, `screen-ready`) and the player's exit code 10 go away. A compositor, when there
is one, becomes the daemon's first child and "who owns the screen" becomes "who has focus"; nothing else in the API changes.

## 1. What runs today

### 1.1 Who starts what

```
systemd (PID 1)
├─ zinc-update-recover.service   root, oneshot, before the session: rolls back an interrupted engine switch (pending.json)
├─ zinc-shell.service            user zinc, tty1, Type=notify, Restart=always (1 s), DefaultDependencies=no, Nice=-10
│    ExecStartPre=+zinc-admin identity       (root: hostname at first boot)
│    ExecStartPre= wait up to 5 s for /dev/fb0 to be writable
│    └─ zinc-session (bash loop)
│         ├─ (sleep 2; systemd-notify --ready) &      READY=1 is a 2 s guess, not the first frame
│         ├─ the boot app /var/lib/zinc/app, or the app named in /run/zinc/next-app:
│         │     setsid bash -c 'zinc run <app> | tee /run/zinc/app.log'     (or run.sh)
│         └─ else the player: setsid zinc run /usr/lib/zinc/current/player.zapp
│               ZINC_PLAYER_READY_FILE=/run/zinc/player-ready (written after its first frame)
│               └─ zinc-admin <verb>  → sudo -n zinc-admin (root) for the verbs that change the system
├─ zinc-agent.service            user zinc, only if /var/lib/zinc/agent.enabled (or the boot-partition file), Restart=always,
│    KillMode=process (apps outlive a restart), ZINC_AGENT_SCREEN=/run/zinc
│    └─ zinc agent
│         ├─ apps started by `zinc device run/deploy`: fork, setsid, wait on a pipe for the screen, exec
│         │     log ~/.zinc/agent/logs/<name>.log, pid file ~/.zinc/agent/run/<name>.pid
│         └─ dev sessions (`zinc dev --device`): ~/.zinc/agent/dev/<pid>-<n>/, same gate, ZINC_DEV_BAR=1
├─ zinc-update@<version>.service root, oneshot, started by `zinc-admin update-install` (--no-block)
│    └─ zinc-player-update job: download, verify, prepare, then activate:
│         systemctl kill zinc-agent (all) → stop zinc-shell + zinc-agent → switch `current` → start zinc-shell
│         → wait for /run/zinc/player-ready (30 s) → start zinc-agent, or restore the old pair
├─ zinc-firstboot, zinc-report   root, oneshots
└─ NetworkManager, ssh, avahi, timesyncd, cron: ordered after zinc-shell (the 10-zinc-defer.conf drop-ins)
```

### 1.2 Who owns the screen

Two supervisors start programs on one screen, and they agree through files in `/run/zinc`:

| Step | zinc-session (bash) | zinc agent (C++, `src/agent/screen.cpp`) |
|---|---|---|
| Ask | | `handoffScreen`: SIGTERM then SIGKILL to the previous lease holder and to every pid of `~/.zinc/agent/run/*.pid` (up to 3 s each), then writes its child's pid to `device-screen` |
| Yield | polls every 100 ms; `screen_owner` reads `device-screen` and checks the pid with `kill -0`; stops its own foreground group (2 s, then SIGKILL) | waits up to 5 s (100 × 50 ms) for `screen-ready` to hold its child's pid |
| Acknowledge | writes the pid to `screen-ready` every 100 ms while the lease lasts, then sleeps 0.5 s | writes `1` on the gate pipe: the child may exec |
| Return | when `kill -0` fails, the loop starts the player again | `releaseScreen` removes `device-screen` when its child ends (a thread per app, a check in the dev session) |

An older agent without the lease is detected by scanning `/proc/<pid>/fd` of the agent's cgroup for `/dev/fb0` or a DRM card
(`legacy_has_screen`).

### 1.3 How state passes

| What | Where | Writer | Reader |
|---|---|---|---|
| start this app | `/run/zinc/next-app` (a folder) + exit code 10 | player | zinc-session |
| crash | `/run/zinc/crash.txt` (app, status, time, last 80 lines of `app.log`) | zinc-session, for an app only | player (crash page) |
| app output, player-started apps | `/run/zinc/app.log` (tmpfs, overwritten at each start) | `tee` | zinc-session |
| app output, agent-started apps | `~/.zinc/agent/logs/<name>.log` (+ `[exited n]`) | the app, the agent | `zinc device logs`, nobody on the Pi |
| running agent apps | `~/.zinc/agent/run/<name>.pid` (pid, inspector port) | agent | agent, `apps` |
| screen lease | `/run/zinc/device-screen`, `/run/zinc/screen-ready` | agent / session | session / agent |
| screenshot, live view | `/run/zinc/shot.request`, `/run/zinc/live.request` | agent | the program on screen (runtime/gfx.cpp, src/host/mirror.cpp) |
| player ready | `/run/zinc/player-ready` | player (first frame) | updater |
| update state | `/var/lib/zinc-update/status.json`, `pending.json`, `activating` | updater (root) | player, through `zinc-admin update-status` (bash + python each poll) |
| pairing, clients, installed apps | `~/.zinc/agent/pairing.json`, `clients.json`, `agent.json`, `apps/*/app.json` | agent | player (reads the agent's files directly) |
| system | `zinc-admin status` (key=value) | | player, every refresh |

### 1.4 Where it breaks

Found by reading the code; the ones marked *(Pi)* need a board to confirm.

1. **Two owners of the screen, glued by polling.** The session polls `device-screen` every 100 ms, acknowledges, then sleeps
   0.5 s; the agent polls `screen-ready` every 50 ms for up to 5 s. A remote start costs 0.1 to 0.7 s of pure waiting plus the
   player's stop, and a session busy for 5 s (a player slow to stop on SIGTERM: 2 s, then SIGKILL) fails the start with "the
   display session did not yield". `handoffScreen` runs under `displayMu` and can block it for 3 s per old pid plus 5 s.
2. **Pids as identity.** The lease and the agent's pid files name a process by its number and check it with `kill -0`. A
   recycled pid keeps a dead lease alive (the session would never take the screen back) or makes `stop` signal a stranger's
   group (the `ponytail:` comment in `startApp` already says so). Neither side is the parent of the other's children, so neither
   can `waitpid`.
3. **The agent kills more than the screen.** On the image, any new remote app ends every app in `run/*.pid`, including headless
   ones: the lease turned the agent into "one app at a time" without a way to keep a background service.
4. **Two kinds of app.** An app started from the player runs under zinc-session: its log is `/run/zinc/app.log` (lost at reboot,
   overwritten at the next start), `zinc device apps` says it is not running, `zinc device stop` cannot stop it, its inspector port
   is not given. An app started by the agent writes to the agent's logs and gets no crash page on the Pi: when it crashes, the
   player comes back and says nothing.
5. **A hung app has no way out.** No watchdog, no home key. The dev bar's X sets a flag the app's own frame loop reads, so it works
   only while the app still draws, and only in dev sessions (`ZINC_DEV_BAR=1`). A deployed app stuck in a loop holds the screen
   until someone runs `zinc device shell` and `kill`, or pulls the power.
6. **A player that cannot start shows nothing.** `crash.txt` is written for an app only (`is_app=1`). A player that crashes at
   start (a bad engine after an update, a damaged config) is restarted every second by the loop, for ever, with a black screen;
   the reason is only in the journal. The updater's 30 s readiness wait protects the switch itself, not a later crash.
7. **Exit code 10 is shared.** Any program that exits 10 makes the loop start `next-app` or the boot app again: an app that
   happens to use 10 relaunches itself or the boot app.
8. **No progress while an app runs.** The player is the only UI for updates and errors, and it is not running while an app is:
   an update started from the network, a low disk, a lost Wi-Fi, a crash of a background app are invisible until the app ends.
9. **Updates restart everything blind.** Activation stops both units (`systemctl kill --kill-whom=all` on the agent, because
   `KillMode=process` leaves its apps running), so a remote `zinc device` session drops without a word and an app loses its state
   without being asked. The updater waits on the player's ready file, not on systemd's READY, because READY is the 2 s guess.
10. **The agent is off by default.** The orchestrator cannot be today's agent: `zinc-agent.service` does not start unless the
    user turned remote access on. "Remote access" and "the thing that runs apps" are one switch today.
11. **The player reads other programs' files.** Pairing, clients, apps and their icons are read from the agent's directory, the
    update state through a root helper that runs python each poll: every format change in the agent is a player change, and every
    poll forks bash (and python for updates).
12. **Slow returns.** Each turn of the loop runs `zinc --version` (an engine start) before anything; the player is a cold
    `zinc run` of a `.zapp` each time it comes back, so returning home costs its whole start *(Pi: measure)*.
13. **`ZINC_RUN` means two things.** The session exports `ZINC_RUN=/run/zinc` (a directory, read by the player's `state.ts`), and
    the engine reads `ZINC_RUN` as its run mode (`interp` or `native`, `src/main.cpp` `runcache::wanted`). Harmless today because
    `/run/zinc` matches neither, but `ZINC_RUN=interp` on the session would point the player at a directory named `interp`.
14. **Agent apps have no terminal** *(Pi)*. The session holds tty1; an app the agent starts has no controlling tty, so SDL cannot
    mute the console keyboard (`KDSKBMODE`, `docs/reports/pi-os/07-kiosk-session-practices.md` §4): typed keys may echo onto
    the console under fbdev.
15. **Crash loop of the unit.** `Restart=always`, `RestartSec=1` and systemd's default start limit (5 starts in 10 s) mean a
    session that dies at once five times is left failed: a black screen until reboot.

## 2. How others do it

| System | Who runs apps | Who owns the screen | API | What we take |
|---|---|---|---|---|
| **Android** | `init` runs native services from `.rc` files (`restart`, `critical`: four crashes in four minutes reboot into recovery); `zygote` forks app processes; `ActivityManagerService` in `system_server` decides which runs, kills, restarts, raises an ANR when an app does not answer input for 5 s | SurfaceFlinger, a separate process, composes every app's surface; apps never touch the display | Binder | One process decides app lifecycle; screen composition is a separate concern; a hang is detected from outside (input not consumed) and offered to the user to close. A crash-loop limit that goes to a recovery screen. |
| **webOS** (the TouchPad: LunaSysMgr; OSE: SAM + LSM) | On webOS 3.x one process, LunaSysMgr, was app manager, compositor and system UI. webOS OSE split it into SAM (System and Application Manager: launch, close, running list, lifecycle events) and LSM (Luna Surface Manager, the compositor) | LunaSysMgr, then LSM | LS2 (luna-service2), a bus with subscriptions: `luna://com.webos.service.applicationmanager/launch`, `running` with `subscribe: true` | Start with one process, as the TouchPad did; split the screen part out when a compositor arrives, as OSE did. Lifecycle events as subscriptions on the same API as requests. |
| **ChromeOS** `session_manager` | Starts Chrome, restarts it when it dies, ends the session when it crash-loops; its liveness checker pings Chrome over D-Bus and aborts a browser that does not answer | Chrome (Ozone/DRM) | D-Bus | A supervisor that is the parent of the UI process, and a liveness ping from outside. |
| **balena supervisor** | A container on the host manages the app containers: start, restart, update, report to the cloud | the app (a privileged container) | HTTP on port 48484 with an API key (`BALENA_SUPERVISOR_ADDRESS`), `/v1/update`, `/v1/reboot`; update locks: a file `/tmp/balena/updates.lock` the app holds, downloads continue, the switch waits | An app can hold off an update; downloads and the switch are separate phases; one local API used by apps and by the cloud. |
| **Ubuntu Frame + snapd** | snapd turns each snap daemon into systemd units; the app is a daemon of its own, connected to Frame by the `wayland` interface | Ubuntu Frame (Mir), a system daemon | Wayland + snapd's REST API on `/run/snapd.socket` | Compositor and lifecycle are separate daemons; per-app systemd units give cgroups and logs but make switching a systemd job. Too heavy for a Pi 3 boot path. |
| **Steam Deck** (gamescope session) | The session script starts gamescope with Steam as its child; Steam is the shell and launches games inside gamescope; a recovery function runs when the session fails to start; `steamos-session-select` switches sessions | gamescope, a nested/DRM compositor | Steam's own IPC | The shell stays resident while a game runs on top, which needs a compositor; a failed start falls back to a known-good session. |
| **systemd** | User services, `systemd-run` transient units, socket activation (`ListenStream=`, `LISTEN_FDS`: clients connect while the daemon restarts) | | `sd_notify`: `READY=1`, `STATUS=`, `WATCHDOG=1` with `WatchdogSec=` (the manager kills and restarts a daemon that stops pinging) | READY at the real first frame; a watchdog for the daemon itself; a socket held by systemd so a restart loses no client. The notify protocol is a datagram to `$NOTIFY_SOCKET`, documented as stable for reimplementation: no libsystemd. |
| **D-Bus vs a Unix-socket JSON API** | | | D-Bus gives introspection, activation and policy, but needs dbus-daemon in the boot path (deferred on the image) and a binding (sd-bus is LGPL and Linux only; the agent also runs on macOS). docker, snapd and balena chose HTTP/JSON on a Unix socket | A Unix socket speaking the agent's existing frames. |

Sources:
[Android init](https://android.googlesource.com/platform/system/core/+/master/init/README.md),
[Android graphics, SurfaceFlinger](https://source.android.com/docs/core/graphics),
[Android ANRs](https://developer.android.com/topic/performance/vitals/anr),
[webOS OSE 1.0: SAM and LSM split from SysMgr](https://www.webosose.org/about/overview/webos-ose-initial-release/),
[webOS OSE architecture](https://webosose.org/docs/guides/core-topics),
[luna-service2](https://webosose.org/docs/reference),
[SAM recipe](https://layers.openembedded.org/layerindex/recipe/299970),
[ChromeOS login_manager](https://chromium.googlesource.com/chromiumos/platform2/+/HEAD/login_manager/),
[balena supervisor API](https://docs.balena.io/reference/supervisor/supervisor-api/),
[balena update locks](https://docs.balena.io/learn/deploy/release-strategy/update-locking/),
[Ubuntu Frame interfaces](https://ubuntu.com/frame/docs/24/reference/ubuntu-frame-snap-interfaces/),
[Ubuntu Core services](https://documentation.ubuntu.com/core/how-to-guides/using-ubuntu-core/),
[gamescope-session (ChimeraOS)](https://github.com/ChimeraOS/gamescope-session),
[steamos-session-select](https://linuxcommandlibrary.com/man/steamos-session-select),
[sd_notify](https://www.freedesktop.org/software/systemd/man/latest/sd_notify.html),
[systemd.service WatchdogSec](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html),
[systemd.socket](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html),
[D-Bus specification](https://dbus.freedesktop.org/doc/dbus-specification.html),
and the kiosk practice already gathered in `docs/reports/pi-os/07-kiosk-session-practices.md`.

The pattern every one of them shares: **the process that decides what runs is the parent of what runs** (init, zygote,
session_manager, the balena supervisor, gamescope-session), and **composition is a separate concern that arrives with a
compositor** (SurfaceFlinger, LSM, Frame, gamescope). Zinc today has neither: two peers decide, and nobody is the parent of both.

## 3. Options, scored

RULES §4 scoring (fit ×3, performance ×3, size ×2, maintainability ×2, licence ×2, portability ×1, effort ×1; 1 to 5).

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **A. `zinc agent --session`: the agent becomes the session (one user process), root verbs stay in zinc-admin/systemd** | 5 | 5 | 5 | 4 | 5 | 4 | 3 | **65** |
| B. Two new daemons: a root `zincd` (updates, system) and a user session | 4 | 5 | 4 | 3 | 5 | 3 | 2 | 56 |
| C. Keep zinc-session and the agent, harden the lease (inotify, pidfds) | 3 | 3 | 5 | 2 | 5 | 3 | 5 | 50 |
| D. One systemd unit per app (`systemd-run`), systemd as the supervisor | 3 | 3 | 5 | 3 | 5 | 1 | 3 | 45 |

A wins because the agent already does most of it (start, stop, logs, pid tracking, inspector ports, OTA with trial and
rollback, screen/live capture, dev sessions) and runs on macOS too; what it lacks is being the parent of the player. B adds a
root daemon the image does not need: the root work is a handful of short verbs and one long job, both already well served by
sudo/systemd. C keeps two owners. D makes every switch a systemd job, has no macOS story and gives no faster path.

For the API:

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **The agent's frames (`wire.h`: type byte, length, JSON) on a Unix socket, the same ops as the network** | 5 | 5 | 5 | 5 | 5 | 5 | 4 | **69** |
| HTTP/JSON on a Unix socket (llhttp is vendored), events by chunked stream | 4 | 4 | 4 | 4 | 5 | 5 | 3 | 58 |
| D-Bus (sd-bus) | 3 | 4 | 4 | 3 | 4 | 1 | 2 | 46 |

## 4. The architecture

### 4.1 Processes

```
systemd
├─ zinc-update-recover.service  (unchanged)
├─ zinc-shell.service           user zinc, tty1, Type=notify, WatchdogSec=30, Restart=always, KillMode=mixed
│    └─ zinc agent --session    the orchestrator: one process, threads as today
│         ├─ the player          (child; foreground when nothing else is)
│         ├─ the foreground app  (child; at most one owns the screen)
│         ├─ background apps     (children without the screen: services, a headless sensor logger)
│         ├─ dev sessions        (children, as today)
│         ├─ [the compositor]    (first child, only in compositor mode: §5)
│         ├─ /run/zinc/agent.sock   local API, mode 0660, group zinc
│         └─ :7733 TLS + mDNS    the network API, opened and closed by the "remote access" setting
├─ zinc-admin (sudo, root verbs)  and  zinc-update@.service (root jobs)   called by the orchestrator
└─ NetworkManager, ssh, avahi...  after READY (unchanged)
```

`zinc-agent.service` leaves the image: its `Condition` becomes the setting `remote` in `~/.zinc/agent/agent.json` (the boot
partition's `zinc-agent` file still turns it on, consumed by `ExecStartPre=+`). On a plain Linux machine or a Mac, `zinc agent`
without `--session` stays what it is (the user unit or the launchd agent of `zinc agent install`); `--session` is the image's mode.

### 4.2 App lifecycle

One function in the daemon starts every program, whoever asks (the boot config, the player, an app, the network, a dev session):
`launch(app, args, env, {screen: foreground|background, origin})`.

- **Start.** fork, setsid, exec, as `startApp` does now; stdout/stderr to the app's log through the existing bounded files
  (`~/.zinc/agent/logs/<name>.log`), so player-started apps get the same logs, inspector port and `apps` entry as remote ones.
  The pid file stays for tooling, but the daemon knows its children by `waitpid` (and a pidfd on Linux), never by `kill -0`.
- **Switch.** A foreground launch stops the current foreground group (SIGTERM, 3 s, SIGKILL: today's `endGroup`), waits for it
  (it is a child: `waitpid`, no polling), then starts the new one. The player is stopped the same way. Background apps are not
  touched. One mutex orders switches; nothing waits on another process's acknowledgement.
- **Return.** When the foreground app ends, the player starts (or, in kiosk mode, the boot app again, with backoff).
- **Crash.** Exit status ≠ 0 or a signal: a crash record `~/.zinc/agent/crashes/<app>-<time>.txt` (app, status or signal, time,
  engine version, the last 80 lines of its log; the last 10 records kept), an event `app.crashed`, and the player shows it (its
  crash page reads the record over the API instead of `/run/zinc/crash.txt`). Kiosk/boot app: restart after 1, 2, 4... up to
  60 s; five crashes in two minutes stop the restarts and show the player with the record. This is Android init's `critical`
  rule moved from a reboot to a screen.
- **Player crash.** Recorded the same way. Three crashes in a minute: the daemon stops starting it and runs the built-in safe
  screen (§4.4); it does not roll back the engine itself (that is the updater's call, pi-updates-design.md).
- **Hang.** Every foreground program gets a heartbeat channel: an inherited descriptor (`ZINC_AGENT_FD`, as `ZINC_DEV_FD` is
  today) on which the engine's frame loop writes one byte per second, non-blocking (runtime/gfx.cpp, next to the shot request
  check). No byte for 15 s (`ZINC_AGENT_HANG_S`; a calibration knob: a Pi 3 loading a large model may need more) while the
  program owns the screen: event `app.hung`, SIGTERM, then SIGKILL, record "stopped responding". A program that never drew (a
  console tool) never armed the heartbeat and is not watched: only a program that once sent a byte is.
- **Home.** The daemon reads the input devices itself, read-only and without `EVIOCGRAB`, and watches for one chord: the
  `KEY_HOMEPAGE` key, or Escape held 3 s, or four fingers held 2 s on a touch screen. It brings the player back by stopping the
  foreground app, even a hung one. Kiosk mode can turn it off (with the PIN of `00-synthesis.md` §3c). This is the Home key of
  Android, handled outside the app. Ctrl+Alt+Del is not usable: systemd maps it to a reboot.
- **The daemon's own health.** `READY=1` when the first foreground program sends its first heartbeat byte (the first frame: no
  more 2 s guess; `backlog/later.md` already asks for it), `WATCHDOG=1` from the main loop every 10 s, `STATUS=` with what is in
  front. A few lines writing to `$NOTIFY_SOCKET`, no libsystemd.

### 4.3 The screen

Without a compositor, the screen is exclusive: the foreground program opens `/dev/fb0` or the DRM card; the daemon guarantees
there is never a second one because it starts them all. The lease files, the gate pipe, `handoffScreen`, `releaseScreen` and
`legacy_has_screen` are deleted. The daemon holds tty1 (it is the unit's process), so every child inherits a controlling terminal
and SDL can mute the console keyboard (issue 14).

Screenshots and the live view keep their mechanism (`shot.request`, `live.request` read by the program on screen); the daemon
knows which program that is, so `screen` can fail at once with "nothing on the screen" instead of after 5 s.

### 4.4 The safe screen

When the player cannot run, something must still say why. The engine already draws text; `zinc agent --session` carries a small
built-in program (embedded like the red box of `zinc dev`) that shows the last record, the device's name and address, the
pairing code when remote access is on, and three buttons: try again, restore the previous version (`zinc-admin update-rollback`),
reboot. It is the gamescope-session "recover" step and Android's recovery menu, without leaving the session.

### 4.5 Launcher list, updates, system state, logs

- **Launcher.** The daemon owns `apps/` (it already writes `app.json`) and serves `apps` with title, icon path, dev flag,
  running/foreground, last crash. The player stops reading the agent's directory.
- **Updates.** The daemon is the client of the root updater: `update.check`, `update.install`, `update.rollback` call the
  existing `zinc-admin` verbs; it follows `/var/lib/zinc-update/status.json` with inotify instead of the player polling python,
  and broadcasts `update.progress {phase, percent, message}` to the player, the foreground app (which can show a banner) and
  network clients. Before activation it shows the player with "Installing Zinc x.y.z, the screen restarts" and stops the apps
  cleanly, so the updater no longer needs `systemctl kill --kill-whom=all`. An app may hold an update lock (`hold`, balena's
  update lock): the download goes on, the switch waits until the app ends or the user confirms. The updater waits on systemd's
  READY of `zinc-shell.service` (now the real first frame) instead of `player-ready`. Everything else (generations, signatures,
  A/B, OS packages) is `pi-updates-design.md`.
- **System state.** Read-only, collected once a few seconds and sent as `system` events: storage (statvfs of `/` and the home),
  time synchronised (`adjtimex` status), network up and address (`/sys/class/net`, default route), battery where
  `/sys/class/power_supply` has one, temperature, the Wi-Fi SSID through `zinc:network` (NetworkManager stays the writer).
  Changes stay with `zinc-admin` (root) and `zinc:network` (NetworkManager over polkit), which the daemon calls for clients;
  `zinc-admin status` becomes a fallback.
- **Logs.** Per app as today; the daemon's own lines and every app's start, end and crash go to the journal through its
  stderr, so `journalctl -u zinc-shell` tells the whole story; `zinc device logs --system` reads it.

### 4.6 The API

One dispatch table, two doors:

- **Local:** `/run/zinc/agent.sock` (Linux; `~/.zinc/agent/agent.sock` elsewhere), stream socket, mode 0660, the agent's
  frames without TLS. Every caller already runs as `zinc`, so the socket grants nothing the caller does not have; `SO_PEERCRED`
  names the calling pid, which the daemon maps to its child (an app's `notify` is attributed to it, and an app may only `hold`
  updates or `home` for itself). Optional later: `zinc-shell.socket` holds it across a daemon restart (socket activation).
- **Network:** port 7733, TLS with pairing (D116), unchanged, when remote access is on.

| Op | New? | What |
|---|---|---|
| `info`, `apps`, `run`, `stop`, `logs`, `install`, `uninstall`, `screen`, `live`, `top`, `update`... | existing | unchanged; `run` gains `foreground` (default true on the image) |
| `subscribe` | new | events until the client leaves: `app.started`, `app.ended`, `app.crashed`, `app.hung`, `foreground`, `update.progress`, `system`, `notify`, `pairing` |
| `home` | new | back to the player (the dev bar's X calls it too) |
| `crashes` | new | the crash records, newest first; `forget` one |
| `notify` | new | a notification from an app or the system (title, text, level), shown by the player or the foreground app's banner |
| `system` | new | the state of §4.5 now |
| `admin` | new | a `zinc-admin` verb (Wi-Fi country, SSH, hostname, reboot...), local callers only |
| `remote` | new | remote access on/off and a pairing code (replaces `zinc-admin agent on/off` and `pair`), local callers only |
| `hold`, `release` | new | an update lock for the calling app |

`zinc device events` prints the same stream on the workstation; Atelier's devices panel can use it instead of polling `top`.

The player uses `zinc:socket`'s `connectUnix` (it exists) and a small client module in `lib/std` (requests and an event
callback), which any app may import to show its own status bar, battery, update banner or to go home.

## 5. With a compositor, or without

The compositor report decides whether and which. The orchestrator is shaped so either works:

| | Without (today) | With a compositor |
|---|---|---|
| Who opens the display | the foreground program | the compositor, started first by the daemon, as a child (readiness: its socket) |
| Foreground switch | stop the old program, start the new one | tell the compositor which client is focused and full screen; the old one may keep running |
| Player | started again on return (cold) | stays resident, hidden: return is instant (the Steam Deck model) |
| Overlays (notifications, update banner, volume) | drawn by the foreground program from events, or the player when it is in front | a layer of the compositor or a surface of the player |
| Hang | heartbeat, then kill | the same, plus the compositor's own "client not answering pings" |
| Home chord | the daemon reads input | the compositor owns input and sends `home` to the daemon |

The seam in the daemon is three calls: `show(app)`, `home()`, and "who is in front". The exclusive form is written in phase 2;
the compositor form only when the compositor exists. The API of §4.6 does not change: `foreground` events mean focus. This is the
step webOS took from LunaSysMgr (one process) to SAM + LSM (two), and it is why the lifecycle is not put inside a compositor:
the device must run without one.

## 6. Phases

Smallest useful first; each phase ships alone and keeps the image working.

**Phase 0: the cheap fixes (no new architecture).**
- `zinc-session`: write a crash record for the player too, and show it; treat exit 10 as "start next-app" only from the player
  (`is_app=0`); back off (1, 2, 4... 30 s) after repeated player crashes instead of 1 s for ever.
- `zinc-shell.service`: `StartLimitIntervalSec=0`, so a crash-looping session is retried, not left failed.
- Rename the session's `ZINC_RUN` to `ZINC_RUN_DIR` (the player reads both for one release).
- Files: `image/files/usr/lib/zinc/zinc-session`, `image/files/etc/systemd/system/zinc-shell.service`,
  `image/player/src/state.ts`, `image/player/src/constants.ts`. Test: extend `tests/agent_screen.py` (fake zinc that crashes as
  the player, exits 10 as an app). Pi: a player that crashes shows its record after the backoff.

**Phase 1: the agent always on, remote access a setting, the local socket.**
- `zinc agent` opens `agent.sock`; `remote` on/off opens and closes the TCP listener and mDNS at run time (`00-synthesis.md` §3
  already asks for that toggle). New ops `subscribe`, `system`, `remote`, `crashes`; events for the apps the agent starts.
- `zinc-agent.service` loses its conditions; `zinc-admin agent on|off` writes the setting and calls `remote`.
- The player reads pairing, apps and update progress from the socket (`image/player/src/services/pairing.ts`, `apps.ts`,
  `updates.ts`, `system.ts`), with the files as fallback for one release.
- Files: `src/agent/server.cpp` (listener toggle, socket accept loop sharing the op table), a new `src/agent/local.cpp`,
  `src/agent/wire.h`, `src/agent/agent.h`, `lib/std` client module, `image/files/etc/systemd/system/zinc-agent.service`,
  `image/files/usr/lib/zinc/zinc-admin`, `docs/reports/zinc-next-agent.md`.
- Tests on the Mac: a new `tests/t1/agent_local.sh` (an agent on 127.0.0.1 with `ZINC_HOME` in a temp dir and the socket in it:
  `remote off` refuses a TCP pair, `remote on` accepts; `subscribe` sees `app.started`/`app.ended`/`app.crashed` of an app run
  over TCP; `system` answers). `tests/t1/player_launcher.sh` against a local agent instead of hand-written `app.json` files.

**Phase 2: the session inside the agent.**
- `zinc agent --session`: the supervisor of §4.2 (launch, switch, return, crash records, backoff), READY from the first
  heartbeat, WATCHDOG; the player started by it; `run` from the player through the socket instead of exit 10 (exit 10 with
  `next-app` still honoured for one release, for players of older engines during a rollback).
- `zinc-shell.service` runs `zinc agent --session` (`KillMode=mixed`, `WatchdogSec=30`); `zinc-session` becomes a two-line
  `exec` kept for the updater's snapshots of older generations; `zinc-agent.service` is removed by the system payload of the
  updater (`prepare_system`/`apply_system` list).
- `src/agent/screen.cpp` deleted; `startApp` (server.cpp) and `launch` (dev.cpp) call the supervisor.
- The updater: no `systemctl kill` of the agent, one unit to stop and start, readiness from systemd.
- Files: new `src/agent/session.cpp`, `src/agent/server.cpp`, `src/agent/dev.cpp`, `src/agent/screen.cpp` (removed),
  `runtime/gfx.cpp` (the heartbeat byte on `ZINC_AGENT_FD`), `image/files/...` (units, session), `image/files/usr/lib/zinc/zinc-player-update`,
  `image/check.sh` (unit checks), `tests/affected.json`.
- Tests on the Mac: `tests/agent_screen.py` rewritten against `zinc agent --session` with its fake engine (a test switch,
  `ZINC_AGENT_RUNNER=<path>`, names the program that runs apps instead of `self`, as `ZINC_AGENT_AS` fakes the machine): boot app
  then player; a remote `run` replaces the player with no lease file; the player comes back when it ends; a crash gives a record
  and an event; five crashes stop the restarts; `pi_image_update`'s fixture with one unit. All on the loopback interface and
  headless (`ZINC_HEADLESS=1`), no window.

**Phase 3: hangs, home, notifications, update lock, safe screen.**
- Heartbeat watchdog, home chord (evdev reader; on the Mac the test sends `home` through the socket, the chord is proven on the
  Pi), `notify` and the banner, `hold`/`release`, the safe screen.
- Tests on the Mac: a fake app that stops its heartbeat is killed after `ZINC_AGENT_HANG_S=1` and recorded; a player that crashes
  three times leaves the safe screen running (headless, scene dump with `tools/scene-texts`); an update job (stubbed as in
  `tests/data/pi-image/test_updates.py`) waits while an app holds the lock.

**Phase 4, only if needed:** the compositor form of §5 (when `pi-compositor-design.md` lands one), a resident player, the
root helper behind a socket-activated unit instead of sudo (`zinc-admin.socket`, `Accept=yes`, one verb per connection: no sudo
fork, no sudoers file), socket activation of `agent.sock`.

## 7. What only a Pi can prove

- READY at the first frame and the boot order of the deferred units after it; the time from power to the player (before, after).
- A switch player → app → player on fbdev and on KMS: the time it takes (today's lease adds 0.1 to 0.7 s plus the stop), and
  that no frame of two programs ever mixes.
- vc4/v3d and DRM master when the daemon's children take turns on the card; the controlling tty: typed keys no longer echo on the
  console under an app started remotely (issue 14).
- The home chord on a USB keyboard and on the official 7" touch panel (ft5x06 multitouch), with an app that grabs nothing and
  with a hung app.
- The heartbeat threshold on a Pi 3 B+ with heavy apps (a large three.js scene, video): no false "stopped responding".
- An update from the Updates page while an app runs: progress shown, the app stopped cleanly, the switch, the rollback.
- `WatchdogSec=30`: a stopped daemon (SIGSTOP) is restarted by systemd and the screen comes back.
- Memory: one process instead of bash + agent (RSS before and after, `tools/device <host> status`).

Each of these is one line under "Cross-platform pass" in `backlog/later.md` when the phase that needs it is done.

## 8. Decisions this report proposes

For the coordinator to record (the next free D number):

- The image's session is `zinc agent --session`: one user process is the parent of the player and every app, and the only
  starter of programs on the screen; remote access is a setting of that process, not a unit. Scored 65 against two daemons 56,
  a hardened lease 50, one systemd unit per app 45.
- The local API is the agent's frames on a Unix socket with the network's op table, plus `subscribe` events. Scored 69 against
  HTTP on a Unix socket 58 and D-Bus 46.
- Revisit when a compositor lands (then the screen becomes focus, §5) or when a second user or seat appears on the device.
