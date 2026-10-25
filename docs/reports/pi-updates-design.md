# Updating the Zinc Pi image: easy, fast, tracked

Research and design, 2026-10-25. The owner wants updates of the Raspberry Pi image ("firmware": the engine, the player, the agent and
the system files) to be easy, fast and tracked. Today the player shows almost nothing while an update runs. This report reads what
exists, says exactly where progress and errors are lost, compares the reference updaters, and proposes a design in six phases, the first
of which is small. No code was changed for it.

Measured for this report on the M1 Pro (no Pi was touched): the v0.8.0 `zinc-0.8.0-linux-aarch64.tar.gz` is 25.1 MB, unpacks to
81.4 MiB in 4,192 entries (3,553 files), of which `share/zinc/plugins` is 44.5 MiB and `bin/zinc` 18.6 MiB. Between v0.7.6 and v0.8.0
only 14 files changed (19.2 MiB, almost all of it `bin/zinc`). `zstd -19 --patch-from` of the whole tar against the previous tar gives a
1.34 MB patch (5% of the download); of `bin/zinc` alone, 1.15 MB, applied with 44 MB of resident memory (191 MB for the whole tar with
`--long=27`).

## 1. What exists today

The pieces, as they stand on develop (259d78e6):

| Piece | What it does for updates |
|---|---|
| `image/files/usr/lib/zinc/zinc-player-update` (Python, 467 lines) | The updater. `catalog` lists the latest 100 GitHub releases that carry `zinc-linux-<arch>.manifest` and the archive. `install <v>` downloads the manifest, verifies its Ed25519 signature with `/etc/zinc/update.pub` through `zinc verify`, downloads the archive, checks SHA-256, version and architecture, extracts it safely into `versions/<v>-XXXX/engine`, runs `zinc --version`, rebuilds the player from `share/zinc/image/player-source.tar.gz` with `zinc pack` as the `zinc` user, draws a two-frame smoke test into a fake framebuffer, snapshots and stages four system files, fsyncs every file, then `activate`: stops `zinc-shell` and `zinc-agent`, swaps the `current` symlink, installs the system files, starts the session, waits 30 s for `/run/zinc/player-ready`, and restores everything on failure. A `pending.json` journal plus `zinc-update-recover.service` (before the session) undo an interrupted switch at the next boot. Generations kept: `current` and `previous`. |
| `zinc-update@.service` | Root oneshot job `zinc-player-update job <version|rollback>`, 20 min timeout. |
| `zinc-admin` + `/etc/sudoers.d/zinc` | The player's only door to root: `update-status`, `update-check` (as `zinc`), `update-install X.Y.Z` and `update-rollback` (as root, `systemctl start --no-block zinc-update@...`). |
| `image/player/src/services/updates.ts`, `state.ts`, `pages/settings/updates-section.ts` | Polls `zinc-admin update-status`, shows `phase` and `message` (`idle`, `queued`, `preparing`, `activating`, `done`, `error`), a version list, Install, Restore. Checks once a day while connected. |
| `src/agent/ota.cpp` (`otaUpdate`) | `zinc device <pi> update` with no app: runs `zinc-admin update-check`, then `update-install <latest>`, and answers "installing ... in a few minutes". |
| `src/agent/server.cpp` `opEngine` / `handOver` | `zinc device update --local`: a workstation build unpacked into `~/.zinc/agent/engine`; the agent re-executes on it, with an `engine.trial` mark that is removed once the new agent listens. A trial mark still present at the next start means that engine never got there: it is moved to `engine.failed` and the installed engine serves. This is the agent only; the session and player still run the installed engine. |
| `tools/package` | Puts `zinc-session`, `zinc-agent.service`, `zinc-admin`, `zinc-shell.service` and `player-source.tar.gz` under `share/zinc/image/` of every Linux archive. |
| `.github/workflows/zinc-next.yml` `linux-cross` | Cross-builds aarch64 and armhf with zig, starts them under qemu-user, writes `zinc-linux-<arch>.manifest` signed with `ZINC_UPDATE_SEED`. The job is `continue-on-error` and gated by `vars.ZINC_LINUX_JOBS`. |
| `src/tc/tuf.cpp`, `tools/index-repo`, `pages.yml` | A TUF 1.0 client and repository for the plugin index (D41), which already carries engine packs (V8) as targets. Engine releases do not use it. |
| Tests | `tests/t0/pi_image_update.sh` (`tests/data/pi-image/test_updates.py`: trust, payload, transaction, rollback, recovery), `tests/t1/pi_image_updates.sh` (the player's Updates page against `image/player/dev/zinc-admin`, goldens in `tests/golden/pi-image-updates/`), `tests/t1/agent_ota.sh` (agent updates with a fake `ZINC_ADMIN`), `tests/t1/agent_local_engine.sh`. |

The foundation is good: signed manifests, generation directories switched by one atomic symlink, a journal for power loss, a health
check (the player's first frame), local rollback without download. This is the OSTree pattern ("deployments" plus a symlink) at the scale
of one directory, and it already avoids a reboot. What is missing is visibility, speed and coverage, not a new architecture.

## 2. Where progress and errors are lost today

1. **Download without numbers.** `fetch()` reads 1 MiB chunks and counts them only to enforce a limit. `status.json` says
   `preparing` / "Downloading and checking Zinc X…" for download, verification, extraction, `--version`, player rebuild and smoke test
   together. Nothing reports bytes, total, speed or time left. The manifest's size is not used.
2. **No resume.** The archive goes into a `TemporaryDirectory`, deleted on any error. A Wi-Fi drop at 90% starts again from zero; a
   retry after a later failure (the player build) downloads again too. `urlopen(timeout=30)` is the only timeout.
3. **Two coarse phases.** The player knows `preparing` and `activating`. The longest step on a Pi is probably the player rebuild
   (`zinc pack` on the Pi, not measured) and it has no phase of its own beyond a message change.
4. **The player hides the work.** `updates-section.ts` returns early when `isBusy()`: one message line, no bar, no step list. The state
   is polled at the settings' refresh pace, and only the Updates section and the top-bar icon look at it. On the home page, or while an
   app runs instead of the player, nothing shows that an update runs.
5. **The activation gap.** `activate` stops `zinc-shell.service`: the player disappears and the screen goes to whatever fbdev or the
   console shows until the new player draws (up to 30 s, then a rollback). The new player starts on its home page; the `done` message is
   only visible if someone opens Updates.
6. **Errors are cut and flattened.** `report('error', ...)` keeps the last 300 characters of the error with whitespace collapsed: the
   output of a failed `zinc pack` or smoke test loses its first lines, usually the cause. A failed health check says "The player did not
   start; the previous version was restored." without the player's output, which went to the journal of `zinc-shell`. `status()` turns
   a dead job into "The update was interrupted" without reading the unit's `Result` or exit status.
7. **The workstation is told nothing.** `zinc device <pi> update` returns as soon as `zinc-admin update-install` has queued the job, with
   "the engine, the player and the agent restart in a few minutes". The agent is then stopped by `activate`; no op lets the client read
   the job's state; the outcome is only in `journalctl -u 'zinc-update@*'` on the Pi.
8. **No history.** `status.json` is overwritten by the next job. Which version was installed when, from what, by whom (player or
   workstation), how long it took and whether it rolled back is not kept anywhere.
9. **The updater cannot update itself.** `SYSTEM_FILES` covers four files. `zinc-player-update`, its units, the sudoers and polkit rules,
   `zinc-report`, `zinc-firstboot` and `update.pub` only change with a reflash or the manual `scp` + `sudo install` of `image/README.md`.
10. **Release side.** The Pi assets come from a `continue-on-error` job: a release can ship without them, and the Pi then silently does
    not list it. The catalog uses the unauthenticated GitHub API (60 requests per hour per IP: a classroom behind one NAT pressing
    "Check again" runs into it).

## 3. What "firmware" means here

Five layers, updated at very different rates, by different mechanisms. The word "firmware" in the UI should mean "Zinc system" (layers
3 and 4 plus the Zinc system files); the boot firmware and the OS are named as such.

| Layer | Contents | Who changes it | How often | Needs a reboot | Mechanism |
|---|---|---|---|---|---|
| 1. Boot firmware | Pi 4/5 SPI EEPROM bootloader (`rpi-eeprom`); `bootcode.bin`/`start*.elf`/`fixup*.dat` on the boot partition (Pi 1-3, Zero) | Raspberry Pi | A few times a year; rarely needed | Yes | `rpi-eeprom-update` (Pi 4/5, opt-in); the `raspi-firmware` package for the boot partition |
| 2. OS | Kernel, DTBs and overlays, Debian 13 userland, Wi-Fi firmware | Raspberry Pi OS / Debian | Weekly security fixes, a kernel every few weeks | Kernel and firmware: yes; userland: usually no | apt today; A/B images only for new cards (phase 6) |
| 3. Zinc engine | `versions/<g>/engine` (bin, plugins, std) | Zinc releases | Several times a week now (0.7.4 to 0.8.0 in one day) | No | Generations + `current` symlink (exists) |
| 4. Player and Zinc system files | `player.zapp`, `zinc-session`, units, `zinc-admin`, the updater, sudo/polkit rules, `update.pub` | Zinc releases, with the engine | With the engine | No (systemd reload, session restart) | Same generation (exists for four files) |
| 5. Apps | `/var/lib/zinc/app`, the agent's apps | The user, app publishers | Any time | No | Agent `install`/`update` with app `trial` (exists, `ota.cpp`) |

Layers 3 and 4 are what changes often and what the owner feels. They must be fast, need no reboot, and are where the effort goes. Layers
1 and 2 are rare and risky; they get progress reporting and a safe path, not speed work.

## 4. What the reference updaters do

| Tool | Model | Delta | Progress reporting | What we take |
|---|---|---|---|---|
| [Mender](https://docs.mender.io/) | A/B rootfs + "update modules" for files/apps; [state scripts](https://docs.mender.io/artifact-creation/state-scripts) around Download, ArtifactInstall, ArtifactReboot, ArtifactCommit, ArtifactRollback; Pi support via [mender-convert](https://docs.mender.io/operating-system-updates-debian-family/convert-a-mender-debian-image) | Binary delta (paid add-on) | Per-deployment status to the server; the device has no local UI contract | The state names; "commit only after a health check"; a server is not needed for us |
| [RAUC](https://rauc.readthedocs.io/) | Signed bundles (X.509 / CMS), slots, A/B, boot selection by U-Boot, GRUB, barebox, EFI or custom | [Adaptive updates](https://rauc.readthedocs.io/en/latest/advanced.html#adaptive-updates) (`block-hash-index`, since 1.8) and casync; HTTP streaming without local storage | D-Bus property `Progress` = (percentage, message, nesting depth), plus `Operation` and `LastError` ([D-Bus API](https://rauc.readthedocs.io/en/latest/reference.html#progress-property)) | Nested progress steps with a message; `LastError` kept separately; the right tool for a future whole-OS A/B (already chosen in `zinc-next-pi-image-pipeline.md`) |
| [SWUpdate](https://sbabic.github.io/swupdate/) | One `.swu` with handlers per image/file/script; A/B or rescue system | [Delta handler with zchunk](https://sbabic.github.io/swupdate/delta-update.html) | A progress socket (`swupdate-progress`, `progress_msg`: status, `dwl_percent`, `dwl_bytes`, `nsteps`, `cur_step`, `cur_percent`, image and handler name, info) | The progress message fields: download bytes separate from step percent, step i of n |
| [OSTree / rpm-ostree](https://ostreedev.github.io/ostree/) | Content-addressed object store, hardlinked deployments, one switch at boot | [Static deltas](https://ostreedev.github.io/ostree/formats/#static-deltas) between commits | `OstreeAsyncProgress` (fetched/requested objects, bytes) | Hardlinks from the current deployment for unchanged files; deltas computed server side between known pairs |
| [balenaOS / supervisor](https://docs.balena.io/) | Host OS A/B ("hostapp"), apps as containers | [Container deltas](https://docs.balena.io/learn/deploy/delta/) (rsync-style) | Download percent per service shown in the dashboard | Deltas against the version the device has, fall back to full |
| Raspberry Pi | [`tryboot`](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#fail-safe-os-updates-tryboot): a one-shot flag (`reboot '0 tryboot'`) that loads `tryboot.txt` instead of `config.txt`; cleared before the firmware starts, so a crash or reset boots the old configuration. "All Raspberry Pi models support tryboot" (Pi 4B rev 1.0/1.1: EEPROM not write-protected). [`autoboot.txt`](https://www.raspberrypi.com/documentation/computers/config_txt.html#autoboot-txt) with `boot_partition` and `tryboot_a_b=1` switches whole boot partitions; the documentation describes it for the EEPROM bootloader and gives no model list, so on Pi 1-3 and Zero it must be proven, not assumed. [rpi-image-gen](https://github.com/raspberrypi/rpi-image-gen) has A/B layers and OTA examples; [rpi-eeprom](https://github.com/raspberrypi/rpi-eeprom) updates the Pi 4/5 bootloader at the next boot | None | None | `tryboot.txt` + `os_prefix` is the one rollback mechanism that works on every model, including Pi 1/Zero/3 |
| [casync](https://github.com/systemd/casync) / [desync](https://github.com/folbricht/desync) | Content-defined chunks in a chunk store over HTTP; seed from the local copy | Implicit: only missing chunks are fetched | Chunks/bytes | Too much machinery for 3,553 files where 14 change; worth it only for a whole rootfs (RAUC uses it) |
| [zchunk](https://github.com/zchunk/zchunk) | One compressed file of independent chunks with a header index; HTTP Range for missing chunks | Chunk-level | Bytes | A good fit if we ever want single-file deltas without per-pair patches |
| [bsdiff](https://www.daemonology.net/bsdiff/) | Binary diff | Very small patches | n/a | Memory `max(17n, 9n+m)` to create and `n+m` to apply; slow. Rejected for a Pi Zero |
| [zstd `--patch-from`](https://github.com/facebook/zstd/wiki/Zstandard-as-a-patching-engine) | The old file as dictionary | 1.15 MB for `bin/zinc` 0.7.6 to 0.8.0 (measured) | n/a | Chosen: zstd is already vendored (`third_party/zstd`), applying is fast and needs about old+new size in memory (44 MB measured) |
| [TUF](https://theupdateframework.github.io/specification/latest/) | Signed roles (root, targets, snapshot, timestamp), expiry, version monotonicity, key rotation | n/a | n/a | Already in the engine (`src/tc/tuf.cpp`) for plugins: the Pi channel's metadata moves there in phase 6 |
| [Android A/B](https://source.android.com/docs/core/ota/ab) and [Virtual A/B](https://source.android.com/docs/core/ota/virtual_ab) | Write the inactive slot while the system runs; reboot; mark successful after boot | Block-level deltas in the payload | `UpdateEngine` callback `onStatusUpdate(status, percent)` with `IDLE, CHECKING_FOR_UPDATE, UPDATE_AVAILABLE, DOWNLOADING, VERIFYING, FINALIZING, UPDATED_NEED_REBOOT, REPORTING_ERROR_EVENT, ATTEMPTING_ROLLBACK, DISABLED, NEED_PERMISSION_TO_UPDATE, CLEANUP_PREVIOUS_UPDATE` ([update_status.h](https://android.googlesource.com/platform/system/update_engine/+/HEAD/client_library/include/update_engine/update_status.h)) and `onPayloadApplicationComplete(errorCode)` | One enum of phases plus one percent; a separate final result code; "needs reboot" as a phase, not an error |
| ChromeOS [update_engine](https://chromium.googlesource.com/aosp/platform/system/update_engine/) | Same engine as Android, A/B root partitions | Deltas | The same statuses over D-Bus, shown in Settings with a percentage and "Restart to update" | The UI waits for the user to restart; installing never interrupts work |
| Tesla ([software updates](https://www.tesla.com/support/software-updates); behaviour from public owner documentation, not verified here) | Two banks, download in the background, install scheduled or now | Deltas | A progress bar and time left on the car's screen and in the phone app; the car cannot be driven during the install | Progress shown on the device and on the remote client at once; the install waits for the owner |
| Steam Deck / SteamOS 3 ([Collabora, SteamOS 3.6](https://www.collabora.com/news-and-blog/news-and-events/steamos-3-6-how-the-steam-deck-atomic-updates-are-improving.html)) | A/B images applied with RAUC and casync (`steamos-atomupd`) | casync chunks | Download percent and speed in Settings, then "Apply" restarts | casync for whole images; the "download now, apply when idle" split |

Common ground: one ordered list of phases, a byte counter during download, a separate step counter after it, a final result that
survives the restart, a commit only after a health check, and an install that never interrupts what the user is doing.

## 5. Recommended design

### 5.1 Principles

- Keep the engine generation model (layers 3 and 4): it is atomic, needs no reboot, and rolls back locally. Make it visible, resumable,
  smaller and self-updating. Do not bring RAUC or Mender into this layer: they swap whole partitions and would add a reboot to every
  engine release.
- One progress protocol, written by the updater, read by the player, the runtime overlay and the agent. The workstation prints the same
  phases the screen shows.
- Delta where it pays: per-file, against the releases a device is likely to have, with the full archive as fallback. Unchanged files are
  hardlinked from the current generation, so they cost neither download nor SD writes.
- A reboot only for layers 1 and 2, and then through `tryboot`, which every Pi model has.

### 5.2 The progress protocol

The updater writes one JSON document, replaced atomically (`os.replace`), at most twice a second, to `/run/zinc/update.json` (tmpfs: no
SD wear). Terminal states are also written to `/var/lib/zinc-update/status.json` (as today) and appended as one line to
`/var/lib/zinc-update/history.jsonl` (bounded to the last 200 lines). The full output of the job goes to
`/var/lib/zinc-update/logs/<id>.log` (last 5 kept), so an error message can stay short and point to the whole text.

```json
{"id": "20261025T101500-0.8.0", "from": "0.7.6", "to": "0.8.0", "by": "player|device:<workstation>|auto",
 "phase": "download", "step": 2, "steps": 7, "kind": "delta|full|rollback|local",
 "bytes": 812000, "total": 1338273, "rate": 412000, "eta": 1.3,
 "message": "Downloading Zinc 0.8.0 (update from 0.7.6)", "error": "", "detail": "", "log": "/var/lib/zinc-update/logs/....log",
 "started": 1761387300, "time": 1761387302}
```

Phases, in order (the Android/ChromeOS list, cut to what applies):

| Phase | What happens | Numbers |
|---|---|---|
| `check` | Read the signed manifest (and later the TUF metadata), choose delta or full | none |
| `download` | Fetch with HTTP Range into `/var/lib/zinc-update/cache/<sha256>.part` | bytes, total, rate, eta |
| `verify` | Signature (already done on the manifest), SHA-256 of the download, then of every file of the new tree | files done / total |
| `install` | Hardlink unchanged files, unpack or patch the others into `versions/<g>` | files done / total |
| `prepare` | `zinc --version`, the player (prebuilt or rebuilt), the smoke frame | step text |
| `activate` | Stop session and agent, switch `current`, install system files | none |
| `health` | Player first frame, agent socket when it was on | seconds left of the 30 s |
| `reboot` | Only for layers 1 and 2: `reboot '0 tryboot'` | none |
| `done` / `rolled-back` / `error` | Terminal; `error` carries `error` (one sentence for a person) and `detail` (4 KB tail of the cause) | duration |

`zinc-admin update-status` returns this document merged with what it returns today (`current`, `previous`, `architecture`), so the
player keeps one call. `queued` stays a player-local state between the button and the first write.

### 5.3 On the Pi's screen

- **In the player**: while a job runs, every page shows a strip under the top bar ("Updating to Zinc 0.8.0 · 62% · 4 s left"); a tap
  opens the Updates page, which becomes a progress screen: the step list with a check mark per finished phase, a bar for the current
  one (bytes during download, files during verify/install), speed and time left, and the error with "Show details" (the log tail) on
  failure. The player polls `update.json` directly (it is world-readable on tmpfs; no `sudo` call needed) every 250 ms while busy.
- **Across the activation gap**: before `activate` stops the session, the updater sets the phase and waits up to 2 s for the player to
  write `/run/zinc/update-ack` after drawing a full-screen "Restarting with Zinc 0.8.0…" frame; the fbdev framebuffer keeps that frame
  while nothing draws. The new player reads `update.json` at start: during `health` it shows "Checking Zinc 0.8.0…", then a toast
  "Zinc 0.8.0 is installed (from 0.7.6, 38 s)" or "Zinc 0.8.0 did not start; 0.7.6 is back" with Details. Whether fbcon repaints the
  console over the kept frame on vc4 must be checked on a Pi; if it does, `zinc-session` draws the frame with the old engine as a
  tiny program instead.
- **Over any app**: an app started by the session or the agent does not run the player, so the engine shows the state itself. The
  runtime already draws overlays over any program (`runtime/gfx.cpp`: the red box, the banner, the dev bar of ZN-822). A fourth one, a
  thin strip at the bottom, reads the file named by `ZINC_SYSTEM_STATUS` (set by `zinc-session` and the agent service to
  `/run/zinc/update.json`) at most once a second, compares its mtime, and draws nothing when the phase is idle or terminal for more
  than 10 s. Policy, as ChromeOS and Tesla do it: a job started from the workstation or by the automatic check never interrupts a
  running app; it downloads, verifies, installs and prepares, then stops at `ready` ("Update ready: return to the player to install")
  unless the request said `--now`. The player's Install button means now.

### 5.4 From the workstation

`zinc device <d> update [--version X.Y.Z] [--now] [--no-follow]` keeps its current behaviour of choosing the newest stable release,
then follows the job and prints the same phases:

```
zinc 0.7.6 -> 0.8.0 on pi-kitchen (delta from 0.7.6, 1.3 MB)
  check      ok
  download   1.3 MB  412 kB/s  ok (3 s)
  verify     3553 files  ok
  install    14 files changed  ok
  prepare    player 0.8.0  smoke frame ok
  activate   the agent restarts...
  health     player ready in 2.1 s
done: zinc 0.8.0 on pi-kitchen (38 s); previous 0.7.6 kept
```

The agent gets one op, `update-status` with `follow`: it sends the current document, then a `J` frame each time `update.json`
changes (poll its mtime every 250 ms), until a terminal phase. The client knows the agent stops during `activate`: when the session
ends there, it reconnects with the same pairing every second for up to two minutes and asks `update-status` again with the job `id`; the
terminal state is in `status.json` and `history.jsonl`, so nothing is missed across the restart. Exit status 0 for `done`, 1 for
`error` and `rolled-back`. `zinc device <d> update --history` prints `history.jsonl`; `zinc device info` adds the versions of every
layer (engine, player payload, system payload, image build, OS, kernel, EEPROM where present). `update --local` uses the same
printer for its transfer and trial.

### 5.5 Fast

What makes it fast, in the order of what it saves:

1. **Deltas per file.** The release publishes, per architecture, `zinc-<v>-linux-<arch>.files.json` (path, SHA-256, size, mode of every
   file) and, for each of the previous three stable releases P, `zinc-<v>-linux-<arch>-from-<P>.tar.zst`: a tar of the files that are
   new or changed, each larger than 256 KiB as a `zstd --patch-from` against P's file, the rest plain. The signed manifest gains
   `files=<sha256>` and one `delta.<P>=<file> <sha256> <size>` line per patch. Measured 0.7.6 to 0.8.0: about 1.3 MB instead of
   25.1 MB, 14 files written instead of 3,553. The Pi applies with `zstd -d --patch-from` (add the `zstd` package to
   `image/scripts/10-packages.sh`; without it the full archive is used), hardlinks every unchanged file from `current/engine`, and
   verifies every file of the new tree against `files.json`, which is a stronger check than the archive hash alone.
2. **No player rebuild on the Pi.** A `.zapp` is ZBC bytecode in a deterministic ustar (`src/zapp.h`), not machine code. The release job
   packs `image/player` with the engine it just built (the `linux-cross` job already runs that binary under qemu-user) and ships
   `share/zinc/image/player.zapp`; the Pi only runs the two-frame smoke test. A release without it (all of today's) falls back to the
   current rebuild. This removes the slowest unmeasured step on a Pi 3 or Zero.
3. **Resume and cache.** HTTP Range on GitHub's release assets, `.part` file named by the expected SHA-256, kept across failures and
   retries; a verified download is reused by the next attempt. Read timeout 30 s, five retries with backoff, then `error` with
   "Wi-Fi was lost at 62%; Try again resumes".
4. **One sync instead of thousands.** Today every file and directory is fsynced in turn (3,553 files). Write the tree, then one
   `os.sync()` (or `syncfs` on the generation's file system) before the symlink switch; the journal and the switch keep their own
   fsyncs. The difference on a slow SD card must be measured on a Pi, but the per-file pattern is the known slow case for ext4 on SD.
5. **Right-sized space check.** Replace the fixed 2 GB with the manifest's unpacked size plus the download, times 1.5 (about 150 MB for a
   full install, much less for a delta with hardlinks).
6. **No reboot** for layers 3 and 4 (already true), and the agent restarts in place.

For Pi 1 and Zero (ARMv6, 512 MB, one slow core): the image is 64-bit only today (`image/catalog.json` lists Pi 3, Zero 2 W, 4, 5),
while the armhf engine archive exists. The same design works there unchanged once an armhf image exists; it was shaped for them:
no bsdiff, per-file patches (44 MB of memory, not 191 MB for the whole tar), no on-device player build, hardlinks to spare the SD.

### 5.6 Signed, and kept signed

- The manifest stays the root of trust for layers 3 and 4 (Ed25519, `/etc/zinc/update.pub`, verified before anything is run). The new
  fields (`files`, `delta.*`, `player`) are inside the signed body.
- The updater, its units, `zinc-update-recover.service`, the sudoers and polkit rules, `zinc-report`, `zinc-firstboot` and the image's
  `update.pub` join the system payload (`SYSTEM_FILES`, `tools/package`). The updater is installed last, after `health`, and the new
  one must read the journals of the old one (the code already tolerates older journals). Each payload carries a `payload-version`, and
  `/etc/zinc/image.json` records the image build (commit, date, base Pi OS) so `zinc device info` can say what a card is.
- A key change ships the next `update.pub` in the payload, signed by the current key: the TUF root rotation of the plugin index does this
  properly, which is why the Pi channel moves there in phase 6.
- The release job must fail, not continue, when the Pi assets (archive, manifest, `files.json`, deltas) are missing for aarch64 and
  armhf: drop `continue-on-error` for those two architectures once the job has passed twice.

### 5.7 Layers 1 and 2: the OS and the boot firmware

- **Debian userland** (`apt`): an opt-in "System updates" row in the player, run by the same job runner as a `system` kind, with progress
  from apt's own machine-readable channel (`apt-get -o APT::Status-Fd=3`: `dlstatus:` and `pmstatus:` lines with percent and text;
  [apt's progress-reporting document](https://salsa.debian.org/apt-team/apt/-/blob/main/doc/progress-reporting.md)) mapped onto
  `download` and `install`. Kernel and boot packages are held by default (`apt-mark hold`) so a userland update never needs a reboot.
- **Kernel and boot firmware**: a trial boot with `tryboot`, which every model supports: stage the new kernel, DTBs, overlays and
  firmware in `/boot/firmware/next/`, write `tryboot.txt` (`os_prefix=next/` plus the current lines), `reboot '0 tryboot'`; the health
  service after the first frame (the same check) reads `/proc/device-tree/chosen/bootloader/tryboot`, then promotes `next/` (copy over,
  then `config.txt` last, fsynced). A hang is covered by the hardware watchdog (`dtparam=watchdog=on`, systemd `RuntimeWatchdogSec`):
  the reset boots the untouched `config.txt`. Not before a power-cut test on a Pi 3 B+ and a Zero.
- **EEPROM** (Pi 4/5 only): `rpi-eeprom-update -a` as an explicit, separate action with its state shown; never automatic.
- **Whole-OS A/B**: RAUC with two root slots and `autoboot.txt` `tryboot_a_b=1`, for newly flashed cards only, as
  `zinc-next-pi-image-pipeline.md` already proposes. It needs `autoboot.txt` to work on the Pi 3 B+, which the documentation does not
  promise; prove it first or use `tryboot.txt` with `cmdline` pointing at the other root.

## 6. Phases

Each phase is useful alone and testable on the Mac. Tests that need a Pi are listed as such (one line each in `backlog/later.md`
under "Cross-platform pass" when the phase is done).

### Phase 1: progress of the current updater, shown in the player (smallest useful step)

- `zinc-player-update`: `report()` writes the document of 5.2 to `/run/zinc/update.json` (rate-limited) and terminal states to
  `status.json` and `history.jsonl`; `fetch()` takes a progress callback and the expected size; `prepare`/`activate` report the phases
  `check`, `download`, `verify`, `install`, `prepare`, `activate`, `health`; errors keep `error` (sentence) and `detail` (4 KB tail),
  and the job's output goes to `logs/<id>.log`; `status()` reads the unit's `Result` when a job died.
- `zinc-admin`: `update-status` unchanged in shape, more fields.
- Player: `services/updates.ts` (new fields, `progress()`), `state.ts` (250 ms polling while busy), `pages/settings/updates-section.ts`
  (step list, bar, speed, time left, Details), a busy strip in `components/top-bar.ts` on every page, the post-update toast.
- Tests (Mac): `tests/data/pi-image/test_updates.py`: a `LocalUpdater` whose `fetch` serves a file in chunks; assert the sequence of
  phases, monotonic bytes, a terminal entry in `history.jsonl`, the error detail of a failing pack. `image/player/dev/zinc-admin`: a
  `ZINC_FAKE_UPDATE_SCRIPT` that steps through phases; `tests/t1/pi_image_updates.sh`: two new frames (download at 40%, error with
  details) in `tests/golden/pi-image-updates/`.
- Changelog: "The Pi player shows each step of an update with a progress bar, the download speed and the time left, and the full error
  when it fails."

### Phase 2: the workstation follows; the activation gap is covered

- `src/agent/server.cpp`/`ota.cpp`: op `update-status` (`follow`, `id`); `otaUpdate` returns the job `id`.
- `src/agent/client.cpp`: `zinc device <d> update` follows by default, prints the phase lines, reconnects across the agent restart,
  exits 0/1; `--no-follow`, `--history`, `--version`; the CLI table in `src/cli_core.cpp`; `docs/reports/zinc-next-agent.md` op table.
- Updater and player: the `update-ack` handshake and the "Restarting…" frame; the new player's `health` screen and toast.
- Tests (Mac): `tests/t1/agent_ota.sh` with a fake `ZINC_ADMIN` that writes a phase sequence to a temporary `update.json`, kills and
  restarts the agent at `activate`; assert the client's printed lines and exit status. Pi: the kept frame across the gap on vc4.

### Phase 3: fast without changing the release format

- `zinc-player-update`: Range resume and SHA-256-named cache; one `os.sync()`; the computed space check; retries with backoff.
- `tools/package` + `linux-cross`: build and ship `share/zinc/image/player.zapp` (packed under qemu-user by the arch's engine); the
  updater uses it when present and its smoke frame passes, else rebuilds.
- Tests (Mac): `test_updates.py`: a fetch that fails at half and resumes (the bytes requested the second time start at the offset); a
  payload with `player.zapp` does not call `zinc pack` (`TransactionUpdater` records the commands); `tests/t0/pi_image_update.sh`
  checks the package contains a `player.zapp` whose `manifest.json` names the package's version. Pi: time of a full update on a Pi 3 B+
  over Wi-Fi before and after, logged in `docs/reports/zinc-next-perf.md`.

### Phase 4: deltas

- A new `tools/release-delta <new.tar.gz> <old.tar.gz>... -o dir` (Python, `zstd` CLI): writes `files.json` and the `-from-<P>.tar.zst`
  bundles; the `linux-cross` release step downloads the previous three stable archives (`gh release download`) and adds the lines to the
  manifest before signing it.
- `zinc-player-update`: choose the delta for `current`'s version, hardlink, patch, verify the whole tree against `files.json`, fall back
  to the full archive on any mismatch.
- `image/scripts/10-packages.sh`: `zstd`.
- Tests (Mac): `tests/t0/release_delta.sh`: two synthetic trees, a delta, applied by the updater's code into a third tree equal to the
  new one; a corrupted patch falls back to full; a modified file in `current` (hardlink safety) is detected by the per-file check.
  Once, by hand: the real 0.7.6 to 0.8.0 pair gives about 1.3 MB.

### Phase 5: the updater updates itself; the overlay over any app; never interrupt

- `SYSTEM_FILES` and `tools/package`: the updater and every Zinc system file, `payload-version`, `/etc/zinc/image.json` written by
  `image/build.sh`. The README's manual helper upgrade becomes a one-time step for cards made before this phase.
- `runtime/gfx.cpp`: the system strip overlay reading `ZINC_SYSTEM_STATUS` (beside `devbar`), `zinc-session` and `zinc-agent.service`
  set it; the `ready` phase and the `--now` rule; the automatic daily check may then download and prepare in the background.
- Tests (Mac): a T1 headless run of a small program with `ZINC_SYSTEM_STATUS` pointing at a file the test rewrites, `ZINC_SHOT` frames
  with and without the strip (one golden); `test_updates.py`: a payload that replaces the updater, then a recovery run by the new
  updater of a journal written by the old one.

### Phase 6: OS, boot firmware, TUF

- The `system` job kind with apt and `APT::Status-Fd`; kernel hold; the `tryboot` trial for kernel and firmware bundles with the
  watchdog; EEPROM as an explicit action; the Pi channel metadata (`files.json`, deltas, manifests) as targets of the signed TUF index
  (`tools/index-repo`, `pages.yml`), fetched by the engine's TUF client instead of the GitHub API, which also removes the 60-per-hour
  limit of the catalog; RAUC A/B for new cards after a power-cut test.
- Tests (Mac): parsing of `dlstatus`/`pmstatus` lines into the protocol; generation of `tryboot.txt` and the promotion into a fake boot
  directory; the TUF attack tests (`tests/t1/tuf_index.sh`) extended with a Pi target. Pi: a kernel trial that hangs (watchdog
  returns to the old kernel), a power cut during promotion, `autoboot.txt` on a Pi 3 B+.

## 7. Decisions taken here (reversible)

- Layers 3 and 4 keep the generation + symlink model; no partition A/B for them. Reason: no reboot, local rollback, already proven by
  the tests; A/B only buys protection for the OS, which changes rarely.
- zstd `--patch-from` per file over bsdiff, casync or zchunk. Reason: measured 95% smaller on a real release pair, low memory, already
  vendored, no new service; casync/zchunk pay off for whole images, not for 14 changed files.
- One JSON file on tmpfs as the progress channel, over D-Bus or a socket. Reason: the player, the runtime and the agent read files
  already, the updater is a oneshot job, and atomic replace gives consistent reads; RAUC's and SWUpdate's fields are kept so a later move
  to RAUC can feed the same document.
- An update started remotely never interrupts a running app; it stops at `ready`. Reason: kiosks and classrooms (ChromeOS, Tesla,
  Steam Deck all wait for the user to apply).

Not proven by this report: anything on a Pi (times, the fbdev frame across the gap, `tryboot` on a Pi 3 B+, SD fsync costs). The
numbers above are from the Mac on the published v0.7.6 and v0.8.0 aarch64 archives.
