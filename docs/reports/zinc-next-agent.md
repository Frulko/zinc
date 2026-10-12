# Zinc Next: the device agent (`zinc agent`, `zinc device`)

What adb is to Android, for a machine that runs Zinc, over the network (ZN-729, owner 2026-10-12). `zinc agent` is a daemon without a
UI on a Linux or macOS machine: the device. `zinc device` is the client on the workstation; Atelier will drive the same client
(ZN-729.06). Code: `next/src/agent/` (`agent.h` is the public header). Tests: `next/tests/t0/agent.sh`, `next/tests/t1/agent_apps.sh`,
both on the loopback interface. Decision record: D113.

## Use

On the device:

```sh
zinc agent                 # listens on port 7733, announces itself; with no workstation paired yet it prints a pairing code
zinc agent pair            # a new code later: 6 digits, 5 minutes, three tries, one workstation
zinc agent clients         # the paired workstations; zinc agent forget <name|id> removes one
```

On the workstation:

```sh
zinc device list                         # the agents of the network and the paired devices
zinc device pair spark 482913            # by its name, or by address: zinc device pair 192.168.2.107:7733
zinc device info                         # kind of machine, system, CPU, memory, load, temperature, disk, engine, apps (--json)
zinc device shell                        # a terminal on the device; zinc device shell uname -a: one command, its exit status
zinc device push build/ data             # a file or a tree to the device (paths from its home directory); pull the other way
zinc device deploy                       # this project packed, installed, started there, its log followed (Ctrl-C leaves it running)
zinc dev --device spark                  # the dev loop with the program there: a save restarts it, an asset is swapped in, an error is a red box
zinc device run hero -f | stop hero | logs hero -f | apps | uninstall hero | install app.zapp
zinc device forward 9229 9229            # a port of the device on this machine: chrome://inspect sees the app running there
zinc device reverse 8080 3000            # a port of this machine on the device: an app there calls the server you develop here
zinc device inspect hero | shot hero | monitor hero | top    # its inspector here, its frame, its telemetry, the machine's load (below)
```

`<device>` goes after `device` when several are paired (`zinc device spark info`); its name or the start of its id.

## What a paired workstation can do

Everything the agent's user can: a shell, files, apps. Deploying a program is already running code on the device, so the shell adds
no power, only convenience. Two consequences are built in: the agent refuses to run as root (`--allow-root` insists), and
`--no-shell` turns the shell off for devices where only apps should arrive. Forwarded ports reach the device's own ports
(127.0.0.1) and nothing behind it; a reversed port listens on the device's own address only, for as long as the workstation's
command runs.

## Security

| Step | How | Why |
|---|---|---|
| Discovery | mDNS / DNS-SD, service `_zinc._tcp`, TXT `id`, `kind`, `os`, `pair` | A hint for the list. Nothing here is trusted: who a device is gets proven by its key. |
| Pairing | TLS 1.2 with EC J-PAKE (`TLS-ECJPAKE-WITH-AES-128-CCM-8`), the code as the password | A PAKE: a wrong code fails the handshake and leaves nothing to try codes against off line, so an attacker gets one guess per connection. The agent counts three tries (counted when they start) and closes the pairing; a code is valid 5 minutes and for one workstation. Odds of a blind attacker: 3 in 1,000,000 per code. |
| Key | Inside that session the device gives the workstation an identity (8 random bytes) and a key (32 random bytes) | Each workstation has its own key: `zinc agent forget` revokes one without touching the others. |
| Sessions | TLS 1.3, pre-shared key with an ephemeral ECDHE exchange (`psk_dhe_ke`) | Both ends prove the key (a device that moved to another address is recognised by it, an impostor at its old address is not); forward secrecy: a key stolen later does not open recorded sessions. |
| Storage | `~/.zinc/agent/clients.json` on the device, `~/.zinc/devices.json` on the workstation, both mode 0600 | The keys are the access. |

All of it is mbedTLS (already vendored); no cryptography was written. What this does not cover: a workstation or a device whose
files are read by someone else (the keys are in clear on disk); an attacker on the network can make pairing fail (three bad tries
close it) but not succeed; the mDNS parser reads packets from anyone on the network (mjansson/mdns, fuzzed upstream). The agent logs
who did which operation, never the text of a command.

## Protocol

TCP, port 7733. The client sends one line in clear, `ZNA1 pair` or `ZNA1 sess`; the agent answers `ZNA1 ok` (or `ZNA1 closed` when no
pairing is open) and TLS starts. Inside TLS, frames: one byte of type, four bytes of length (big endian, at most 1 MiB), the payload.

| Type | Payload |
|---|---|
| `J` | JSON: a request `{"op": ...}`, an answer `{"ok": true, ...}` or `{"ok": false, "error": "..."}`, an entry of a file transfer |
| `I` / `O` / `E` | bytes for the remote input / of its output / of its stderr |
| `X` | the stream is over; the exit status in decimal |
| `W` | the terminal's size, `rows cols` |
| `C` | no more bytes in this direction |

One request per connection: a shell, a file transfer or a forwarded connection is a session of its own (35 ms on the loopback
interface, measured 2026-10-12 on the M1 Pro), so nothing is multiplexed.

| `op` | Request | Then |
|---|---|---|
| `info` | | the answer holds everything `zinc device info --json` prints |
| `shell` | `cmd`, `tty`, `rows`, `cols`, `term` | `I`, `W`, `C` from the client; `O`, `E`, then `X` from the agent. `tty`: a pseudo-terminal; else three pipes. The command runs as `$SHELL -lc`, from the home directory |
| `push` | `path`, `base` | the client sends entries (`{"dir": rel}`, `{"file": rel, "mode", "size"}` followed by `O` frames, `{"end": true}`); the agent answers with `files`, `bytes`, `root`. Into an existing directory the tree lands under `base`, as `cp` does |
| `pull` | `path` | the answer has `base` and `dir`; the agent sends the same entries |
| `install` | `name`, `base` | entries as for `push`; a file is checked as a `.zapp` (every member against its SHA-256, the engine version), a directory must hold `run.sh` (what `zinc export` writes) |
| `run` | `name`, `args`, `env` | the app starts in a session of its own, output appended to `logs/<name>.log`; it outlives the agent |
| `stop`, `uninstall`, `apps` | `name` | SIGTERM to the app's process group, SIGKILL after 3 s |
| `logs` | `name`, `follow` | `O` frames, `X` at the end; with `follow`, until the client leaves |
| `dev` | `engine` | a dev session, until the client leaves: see "`zinc dev --device`" below |
| `connect` | `port` | `I` / `O` / `C` relayed to 127.0.0.1:`port` of the device |
| `listen` | `port` | the agent listens on 127.0.0.1:`port` of the device (0: any; the answer says which) and sends `{"accept": id}` for each connection it takes, until the client leaves |
| `accepted` | `id` | `I` / `O` / `C` relayed to that connection: the workstation opens this session for each `accept` and connects it to its own port |
| `top` | | the answer of `info` now and every second, until the client leaves |
| `unpair` | | the agent forgets this workstation |

A name in a transfer that is absolute or holds `..` is refused by whoever receives it (the device on `push`, the workstation on
`pull`); the receiver reads the sender to its last entry and reports the first error at the end.

## Inspector, frame, telemetry, load (ZN-729.05)

The agent gives every app it starts a port for its inspector: `ZINC_DEVTOOLS_PORT`, a free port of the device unless `run --env` names
one. A program listens there when it imports `zinc:devtools`. The port is the second line of the app's pid file, and a running app's
entry in `apps` (and in `info`) holds it with what the app costs: `inspector`, `cpuMs` and `rss` (the CPU time and the resident memory of
the app's process group, summed), `at` (the device's monotonic clock at the reading, in ms). No new kind of session carries any of
this: the four commands are a forwarded port, the followed log and `top`.

| Command | What it does |
|---|---|
| `zinc device [<d>] inspect <app> [--port n]` | forwards the app's inspector to a port of this machine (any free one, or `n`) and prints `ws://127.0.0.1:<port>/zinc` with the address for Chrome DevTools; until Ctrl-C. An app that is stopped, or has no inspector, is said so |
| `zinc device inspect --all` | the same for every running app of every paired device: a line `<port> <device> <app>` each, then `ready`; it ends with the program that started it. Zinc Inspector (`next/app/inspector`) runs it and lists these apps with the programs of this machine, named `<app> on <device>` |
| `zinc device [<d>] shot <app> [file.png]` | the frame the app shows (`Page.captureScreenshot` of its inspector), written as `<app>.png` or the file named. The DevTools protocol is spoken by a few lines of Zinc run by the engine (the WebSocket of `zinc:socket`), not by a second implementation in the agent |
| `zinc device [<d>] monitor <app>` | the app's log, followed, through `zinc monitor`: the `zinc:telemetry` lines of an app that called `telemetry.connect('stdout')` in its words, the other lines as they are |
| `zinc device [<d>] top [-n count] [--json]` | every second the machine's line (load, free memory, temperature where the system gives one) and, per running app, its pid, its share of one core since the sample before and its memory. `--json`: each sample as the agent sends it, one per line |

Test: `next/tests/t1/agent_inspect.sh` (a DevTools client and Zinc Inspector attached through `inspect`, the frame of `shot` against the
same program run on the workstation, the lines of `monitor`, the numbers of `top`). Not covered: the debugger of a program on a device
(`zinc debug --cdp` there is reached with `zinc device forward`, as any port), and the per-app numbers on Linux (read from
`/proc/<pid>/stat`, written and not run: the cross-platform pass).

## The agent as a service, and signed updates (ZN-729.04)

Code: `next/src/agent/ota.cpp`. Test: `next/tests/t1/agent_ota.sh` (loopback, a test key, `file://` channels).

```sh
zinc agent install [--port n] [--bind a] [--name s] [--no-shell] [--no-mdns]   # on the device: the agent starts with the machine
zinc agent install --print [--os macos|linux]                                  # the file and the commands, nothing touched
zinc agent uninstall
zinc sign app.zapp <seed>                # on the workstation: app.zapp.sig, which install sends with the archive
zinc device install app.zapp             # refused over a signed app unless signed with its key and newer
zinc device update hero [--url u]        # the device fetches hero from its channel (what zinc publish wrote)
zinc device update [--url u]             # the engine: checked and downloaded on the device, as zinc update does
```

**The service** runs as the user, never as root (the agent refuses root). macOS: a launchd agent, `~/Library/LaunchAgents/dev.zinc.agent.plist`
(`RunAtLoad`, `KeepAlive`), loaded with `launchctl bootstrap gui/<uid>`: it starts at login, in the user's session, so the apps it
starts can open windows; its log is `~/.zinc/agent/logs/.agent.log`, bounded like the logs of the apps. Linux: a unit of the user's
systemd, `~/.config/systemd/user/zinc-agent.service` (`Restart=always`, `KillMode=process` so the apps outlive a restart of the
agent, as they do without systemd), enabled with `systemctl --user enable --now` and `loginctl enable-linger <user>`: it starts at
boot, before anyone logs in. `ZINC_HOME` is carried into the service when it is set.

**A signed app** is one whose `zinc.json` has `update.publicKey` (`zinc update-keygen`). Once it is on a device:

| It arrives | It is accepted when |
|---|---|
| pushed: `zinc device install` | the request carries `sig`, the detached Ed25519 signature of the archive (`zinc sign`, read from `<file>.sig`), it verifies with the installed app's key, and the archive's `app.version` is higher. An unsigned archive (what `deploy` packs is one), another key, an equal or older version, an export directory: refused with a message, nothing changed |
| from its channel: `zinc device update <app>` | the device fetches `<update.url>/<channel>.manifest`, verifies its signature with the installed app's key, refuses an older version, downloads the archive and checks it against the manifest's SHA-256 (the functions of `zinc update-app`), then checks it as any `.zapp` |

The key that decides is the installed one: an update may carry a new key, which then decides for the next. The first install of an app
needs no signature (nothing on the device says who its publisher is yet), and `uninstall` followed by `install` starts over: a paired
workstation already has everything the agent's user has, so the signature guards the app against a wrong or stale build, not against
its owner.

**Rollback.** The version an update replaces stays beside it (`apps/<name>/previous.zapp`, a second name of the same file, not a
copy) and the file `trial` holds its version. At the next `run`, the agent watches the update for 5 s (`ZINC_AGENT_TRIAL_MS`: a
slow board may need more to get through its start): still running, or ended with status 0, it holds and the previous version is
removed; ended with an error, `previous.zapp` takes its place again, the previous version is started with the same arguments, and
the client gets the refusal, with the end of what the update printed (`zinc device run` and `deploy` exit 1). An update stopped
during its trial (`stop`, a new `run`) stays on trial. An update over one that was never started keeps the older previous version:
the one known to start. `update` leaves a running app alone (it keeps the files it opened); the new version is the one its next
`run` starts.

| `op` | Request | Then |
|---|---|---|
| `install` | adds `sig` | the refusals above |
| `update` | `name` (none: the engine), `url` | `{"ok": true}` at once, then `{"ok": true, "text": ...}` or the refusal when the download is done |

**The engine**: `zinc device update` runs what `zinc update` runs, on the device: the manifest of `--url` (or the device's
`ZINC_UPDATE_URL`) verified with the keys the device trusts (`ZINC_UPDATE_PUBKEY`, `~/.zinc/update-keys`, the release key), a newer
version downloaded into `~/.zinc/updates` and checked. Like `zinc update`, it stops there: putting the package in place and
restarting the agent is still done by hand (or by the service, once the binary is replaced).

## `zinc dev --device` (ZN-729.03)

`zinc dev [dir] --device <name>` is the loop of `zinc dev` with the program on a paired device. The watching, the asset rebuild and the
red box are those of `zinc dev` (`src/cli_core.cpp`), which runs the program through three hooks (`zn::cli::DevRemote`: start, assets,
poll); `src/agent/dev.cpp` fills them with one session of the agent, and holds the agent's side of it (`opDev`). Test:
`next/tests/t1/agent_dev.sh`.

- **A save** packs the project on the workstation (`zinc pack`: the program compiled there, its baked resources, `zinc.json`, its assets
  and packs, the native libraries of its plugins). The pack is the check: when it fails, what it printed is the diagnostics. The members
  whose SHA-256 changed since the last start are sent, the others stay on the device; a save of one source file sends `program.zbc`.
- **On the device** the members are files in `~/.zinc/agent/dev/<agent pid>-<n>/`, laid out as an unpacked `.zapp`, and the program is
  `zinc run program.zbc` there. The version that runs is stopped before its files change (its packs are mapped). Its output comes back
  as `O` frames and is printed by `zinc dev`; its exit status as an `X` frame.
- **A compile error** packs a project of one file, the red box with the diagnostics (file names relative to the project), and starts it
  over the project's files: it has the project's `zinc.json`, so its window is the program's, and the fix sends only what changed.
- **A saved asset** of a project that packs its assets is rebuilt on the workstation and its entries are sent as `I` frames: the bytes
  are the messages of ZN-450 (`src/host/assets_host.h`), which the agent writes to the program's dev socket (`ZINC_DEV_FD`, descriptor
  3). The program swaps them in and keeps its state, as under `zinc dev` on one machine. When no program runs, the save restarts it.
- **The end**: the program ends with the session (Ctrl-C on the workstation, a lost connection) and its directory is removed; an agent
  that stops ends the programs of its dev sessions. `zinc device deploy` is what leaves a program on a device.

Inside the session the client sends `{"start": true, "files": bool, "remove": [names], "args": [...]}`, followed when `files` is set
by entries as for `push`; the agent answers `{"ok": true, "pid", "files", "bytes"}` or an error, and the session goes on either way.
The request carries the workstation's engine version and the agent refuses another one than its own: the bytecode is compiled on the
workstation.

Measured on the loopback interface (2026-10-12, the M1 Pro, other trees building, load average 7 to 10, so an upper bound): the new
version's first line is read back on the workstation 211 to 250 ms after the save of a source file (six runs of the test; the figure
includes up to 40 ms before `zinc dev` sees the save, the 30 ms it lets a save settle, and the test's own polling). `zinc dev` itself reports the new version started
77 to 85 ms after the save (17.8 kB sent), the red box 112 to 119 ms (525 kB: its baked font), an asset sent 35 ms after its save.

Limits (each a `ponytail:` comment or a choice in the code):

- The pack is made for the workstation: its asset packs are those of the workstation's target and the native libraries of its plugins are
  built for the workstation's machine, as with `zinc device deploy`. A device of another kind runs programs without native plugins.
- No inspector is added to a UI program (`zinc dev` on one machine imports `zinc:devtools`): import it and use `zinc device forward`.
- A deployed app of the same project keeps running beside the dev session: `zinc device stop <app>` first on a device with one screen.
- The first start sends every member; the device's directory does not outlive the session.
- One thread of the agent relays both ways: megabytes of output while megabytes of assets arrive could stall a session.
- A program whose child keeps its output open after it ended is not reported as ended until the child closes it.

## Files of the agent (`~/.zinc/agent`)

`agent.json` (the device's id and name), `clients.json`, `pairing.json` (the open pairing: `zinc agent pair` writes it, the daemon
reads it, so the two need no channel between them), `apps/<name>/` (`app.zapp`, or an export directory), `logs/<name>.log` (cut back
past 4 MiB: the last 1 MiB goes to `<name>.log.1`), `run/<name>.pid` (the pid, then the port of its inspector).

## Known limits (each is a `ponytail:` comment in the code)

- IPv4 only, discovery and listener.
- mbedTLS is built without thread support, so the agent's sessions share one lock around its calls: fine for a few sessions, a limit for
  several large transfers at once.
- Links and special files are left out of transfers.
- A `.zapp` is read whole to check it at install.
- The writes to a shell's input block: a paste larger than the terminal's buffer into a program that prints as much without reading stalls
  that session.
- An app is known by its pid file alone.
- The inspector's port is found free by the agent, then given to the app: another program can take it in between (the app's log then
  says the port is unavailable).
- `zinc device inspect --all` forwards the apps that run when it starts; Zinc Inspector renews the list at "Find programs", unless it is
  attached to a device's app.
- An app's CPU and memory are those of the first 256 processes of its group (macOS).
- Linux and macOS (POSIX sockets, `forkpty`): the Windows client is part of the cross-platform pass.

## Next (ZN-729.03 to .06)

`zinc dev --device` (reload at every save, assets swapped live), the agent as a service with signed OTA updates and rollback, the
inspector, capture and telemetry (`inspect`, `shot`, `monitor`, `top`), and Atelier's devices panel.
