# Zinc Next: the device agent (`zinc agent`, `zinc device`)

What adb is to Android, for a machine that runs Zinc, over the network (ZN-729, owner 2026-10-12). `zinc agent` is a daemon without a
UI on a Linux or macOS machine: the device. `zinc device` is the client on the workstation; Atelier will drive the same client
(ZN-729.06). Code: `src/agent/` (`agent.h` is the public header); its discovery (`src/net/dnssd.cpp`) and frames (`src/net/frame.h`) are shared with `zinc:link` ([docs/plugins/link.md](../plugins/link.md)), which speaks the same protocol between two programs. Tests: `tests/t0/agent.sh` and, in `tests/t1/`,
`agent_apps.sh`, `agent_dev.sh`, `agent_inspect.sh`, `agent_ota.sh`, all on the loopback interface. Decision record: D116.

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
zinc device deploy                       # this project built for the device (a .zapp, or the export for its target: below), installed,
                                         # started there, its log followed (Ctrl-C leaves it running); --pack, --target rpi decide
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

## What `deploy` builds (ZN-729.08)

`zinc device deploy [dir]` asks the device what it is (`info`: `os`, `arch` as `uname` says it, `kind`) and builds for it. A `.zapp` holds
the program for the device's engine and the native libraries of this machine's plugins, so it goes only to a machine of the
workstation's system and architecture. Any other device gets the export of `zinc export --target <t>`, cross built on the workstation
with the pinned zig: a directory with the executable and `run.sh`, which the agent installs and starts as it is (no engine needed for
it there). What is sent and why is a note, said before the build as a step line of the command, where the build's own steps go
(stderr; `-q` hides them), and the transfer says its progress the same way (ZN-734): percent, sent and whole size, speed, rewritten in
place in a terminal, a line every half second on a pipe (`ZINC_PROGRESS_MS` sets the pause), then the whole with its duration.
`install` and `push` print the same `send` lines:

```
  device     spark is linux aarch64 (Raspberry Pi 3 Model B Plus Rev 1.3): exporting for rpi
  device     mini is macos x86_64 (Macmini8,1), as this machine: packing a .zapp
  send       45%  16 MiB of 35 MiB  2.1 MiB/s
  send       100%  35 MiB of 35 MiB  2.2 MiB/s                    16.1 s
```

`deploy --inspect` builds the program with the inspector in front, as `zinc dev` does on the workstation: an entry in
`build/.zinc-dev` that imports `zinc:devtools`, then the program (`zinc pack --inspect`, `zinc export --inspect`); a project that
never names `zinc:ui` has nothing to inspect and is built as it is. `zinc device inspect <app>` then opens it.

| `os` | `arch` | `kind` | Sent |
|---|---|---|---|
| the workstation's | the workstation's (`arm64` and `aarch64` are one) | | the `.zapp` of `zinc pack` |
| `linux` | `aarch64` | holds `Raspberry Pi` | the export for `rpi` |
| `linux` | `aarch64` | anything else | the export for `linux` |
| `linux` | `armv7l`, `armv8l` | | the export for `rpi2` (`--target chip` or `pocketchip` for those boards) |
| `linux` | `armv6l` | | the export for `rpi1` |
| `linux` | `x86_64` | | the export for `x86_64-linux` |
| anything else (a Mac of the other architecture, `riscv64`...) | | | refused: `<name> is <os> <arch>: zinc export has no target for it` |

- `--target <t>` sends the export for `<t>` and `--pack` the `.zapp`, whatever the device says; `info` is then not asked.
- The export is the one of `zinc export`: it is written in the project's `dist/<name>-<target>/` and stays there. The app takes the
  project's name on the device (`--name` gives another), as with a `.zapp`.
- A Raspberry Pi target (`rpi`, `rpi1`, `rpi2`) and a project whose zinc.json names no display for Linux (no `board`, no `display`, no
  `targets.linux.display`: a sketch without zinc.json): the export is built with `ZINC_DISPLAY=fbdev`, as the prototype's Pi targets
  draw on the framebuffer, and the line says so. Without a driver the program would run with no screen and leave after 60 frames.
  `ZINC_DISPLAY` in the environment of `zinc device deploy` chooses another driver.
- A directory that holds `run.sh` and a `.zapp` file are sent as they are, as before.
- Atelier's Run on a device is this command (`zinc device <name> deploy . --name <sketch>`): it needed no change.

Test: `tests/t1/agent_deploy.sh`, on the loopback interface with agents that say they are another machine (`ZINC_AGENT_AS="os arch
kind"`, a test switch of the agent): the `.zapp` for an agent of this machine, `rpi` and the framebuffer chosen for one that says it is
a Pi 3B+ (the export stops at once on a directory that is no project: nothing is cross built in the test), the refusal for `linux
riscv64`, and for that same agent `--pack`, then `--target macos`: the real `zinc export`, its directory installed, the app started,
its log read. Not run yet: a cross export deployed on a real Pi (the cross-platform pass).

## Inspector, frame, telemetry, load (ZN-729.05)

The agent gives every app it starts a port for its inspector: `ZINC_DEVTOOLS_PORT`, a free port of the device unless `run --env` names
one. A program listens there when it imports `zinc:devtools`. The port is the second line of the app's pid file, and a running app's
entry in `apps` (and in `info`) holds it with what the app costs: `inspector`, `cpuMs` and `rss` (the CPU time and the resident memory of
the app's process group, summed), `at` (the device's monotonic clock at the reading, in ms). No new kind of session carries any of
this: the four commands are a forwarded port, the followed log and `top`.

| Command | What it does |
|---|---|
| `zinc device [<d>] inspect <app> [--port n]` | forwards the app's inspector to a port of this machine (any free one, or `n`) and prints `ws://127.0.0.1:<port>/zinc` with the address for Chrome DevTools; until Ctrl-C. An app that is stopped, or has no inspector, is said so |
| `zinc device inspect --all` | the same for every running app of every paired device: a line `<port> <device> <app>` each, then `ready`; it ends with the program that started it. Zinc Inspector (`app/inspector`) runs it and lists these apps with the programs of this machine, named `<app> on <device>` |
| `zinc device [<d>] shot <app> [file.png]` | the frame the app shows (`Page.captureScreenshot` of its inspector), written as `<app>.png` or the file named. The DevTools protocol is spoken by a few lines of Zinc run by the engine (the WebSocket of `zinc:socket`), not by a second implementation in the agent |
| `zinc device [<d>] monitor <app>` | the app's log, followed, through `zinc monitor`: the `zinc:telemetry` lines of an app that called `telemetry.connect('stdout')` in its words, the other lines as they are |
| `zinc device [<d>] top [-n count] [--json]` | every second the machine's line (load, free memory, temperature where the system gives one) and, per running app, its pid, its share of one core since the sample before and its memory. `--json`: each sample as the agent sends it, one per line |

Test: `tests/t1/agent_inspect.sh` (a DevTools client and Zinc Inspector attached through `inspect`, the frame of `shot` against the
same program run on the workstation, the lines of `monitor`, the numbers of `top`). Not covered: the debugger of a program on a device
(`zinc debug --cdp` there is reached with `zinc device forward`, as any port), and the per-app numbers on Linux (read from
`/proc/<pid>/stat`, written and not run: the cross-platform pass).

## The agent as a service, and signed updates (ZN-729.04)

Code: `src/agent/ota.cpp`. Test: `tests/t1/agent_ota.sh` (loopback, a test key, `file://` channels).

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
`tests/t1/agent_dev.sh`.

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
The bytecode is compiled on the workstation, so the versions matter (2026-10-23, `tests/t1/agent_dev_versions.sh`): the workstation
asks the device's version first (`info`). The same version, or another release of the same series (0.6.x, a note says so), runs: a
patch reads the same bytecode, and a format that changed is refused by the device's loader with its reason (`ZBC version n is newer
than...`). Another series is refused with the two ways out, `zinc device <name> update` and `--force`, which tries anyway at the risk
of a crash. When it goes on, the request carries the device's version, which the agent compares with its own: agents of 0.6.2 and
before refuse any other, so a newer workstation still works with them. `ZINC_AGENT_ENGINE` makes an agent say another version (tests).

Measured on the loopback interface (2026-10-12, the M1 Pro, other trees building, load average 7 to 10, so an upper bound): the new
version's first line is read back on the workstation 211 to 250 ms after the save of a source file (six runs of the test; the figure
includes up to 40 ms before `zinc dev` sees the save, the 30 ms it lets a save settle, and the test's own polling). `zinc dev` itself reports the new version started
77 to 85 ms after the save (17.8 kB sent), the red box 112 to 119 ms (525 kB: its baked font), an asset sent 35 ms after its save.

Limits (each a `ponytail:` comment or a choice in the code):

- The pack is made for the workstation: its asset packs are those of the workstation's target and the native libraries of its plugins are
  built for the workstation's machine. A device of another kind runs programs without native plugins, and needs the engine built for
  it (ZN-729.07); `zinc device deploy` has no such limit since ZN-729.08 (it sends the export for the device's target).
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

## Atelier's devices panel (ZN-729.06)

Zinc Atelier (`app/atelier`) drives the commands above through `zinc:process`, as it drives `zinc run`: no protocol in the app.
The pill that says where the sketch runs lists the paired devices under the engines, and "Devices…" (Sketch > Run on a Device…) opens
the panel. State: `app/devices.ts`; view: `components/Devices.tsx`; the run itself: `app/tools.ts`; the JSON read: `model.ts`.

| In the panel | Command |
|---|---|
| the list, at opening and at "Look again": the agents the network shows and the paired devices | `zinc device list --json` |
| the form: a name or an address, the code, Pair. A device that shows a code is a press away from the form | `zinc device pair <name or host[:port]> <code>` |
| a press on a paired device: Run goes there (again: back to this computer). Its kind, system, processor, load, free memory, temperature and apps, renewed every second while the panel is open | `zinc device <name> top --json` |
| Run | `zinc device <name> deploy . --name <the sketch's folder>`: the steps and the app's log in the console |
| Stop | `zinc device <name> stop <app>`; the follower ends at the log's `[exited n]` line, which is also how a sketch that ends by itself is seen |
| Debug | Run with `--inspect` (the inspector in front of the sketch, no import to write), then at the app's `zinc devtools:` line `zinc device <name> inspect <app>`, and Zinc Inspector on the port it gives |

The first run is written for someone who has never paired: an empty list says to start `zinc agent` on the device and what to type; a
wrong code, a closed pairing and an address where nothing answers have their own sentence, any other refusal is the CLI's. A device that
goes away during a run is "Lost <name>: the sketch may still run there".

Test: `tests/t1/atelier_devices.sh`, one scripted session against an agent on the loopback interface (a wrong code, the right one typed
in its field, the figures, Run, the log, Stop, what the device then says of the app) and one golden of the panel, compared without its right column:
addresses and figures change with the machine and the moment, and the session's own lines prove them. The session waits on what the app
says (`wait:<text>` in `ZINC_ATELIER_SCRIPT`), not on a number of frames. The parsing of a list with a device found on the network is in
`tests/t0/atelier.sh`.

Choices and limits:

- Debug on a device is Run with the inspector, not `zinc dev --device`: a dev session is not an app of the device, so `inspect` has
  nothing to forward. The deploy of a debug run puts the inspector in front of the sketch (`deploy --inspect`, ZN-734), and Tools >
  Open the Inspector on a plain run starts the sketch again in debug. The console shows the deploy's notes and the transfer's
  progress as steps (one `send` line that updates, repeated on the status line), and its lines can be selected and copied.
- A sketch started from Atelier keeps running on the device when Atelier quits, as after `zinc device deploy` and Ctrl-C.
- The test's workstation home is new, with links to the pinned tools and the plugin cache of the real one: Atelier's native plugins
  would otherwise download a compiler. With `--no-mdns` the list of the test holds paired devices only (`ZINC_ATELIER_BROWSE=0`).
- The test's agent is started without `ZINC_DETERMINISTIC`, which `tests/run` exports: its apps would inherit the virtual clock, and a
  sketch's timer then fires without a pause (a whole core, thousands of lines). Any test that runs a Zinc program through an agent
  has to do the same, or pass `ZINC_REALTIME=1` to the app.
- Not there: forgetting a device (`zinc device unpair`), the app's share of a core in the list of apps, a device chosen kept for the
  next session.

## The agent on a Linux device: a Raspberry Pi (ZN-729.07)

A device gets exported apps, not the engine, so nothing ran `zinc agent` there. The engine for it is built on the workstation, in a
container that has the device's system and architecture, and copied as it is: no compiler and no build on the device (a Pi 3 has
905 MB of memory).

```sh
tools/linux-build                                   # Debian trixie arm64 in Docker: build-linux-arm64/, then the package; the last line is its path
tools/linux-build --test agent --test agent_apps    # the same, and these tests run in the container, as a plain user
tools/device pi@192.168.2.107 engine dist/linux-arm64/zinc-0.0.1-linux-aarch64.tar.gz    # unpacked in ~/zinc-engine, nothing started
tools/device pi@192.168.2.107 agent                 # the agent (re)started detached; prints its log: name, port, pairing code
tools/device pi@192.168.2.107 agent stop
```

On the device itself the same start is `(setsid nohup ~/zinc-engine/bin/zinc agent >/tmp/zinc-agent.log 2>&1 </dev/null &)`, then
`cat /tmp/zinc-agent.log` for the code (`~/zinc-engine/bin/zinc agent pair` gives a new one), and `pkill -f 'zinc-engine/bin/zinc agent'`
stops it. The engine finds its files in the package around it (`bin/zinc`, `share/zinc`): no `ZINC_ROOT`, no other variable; the agent keeps
its state in `~/.zinc/agent`. Then, on the workstation, `zinc device list` and `zinc device pair <name> <code>` as in "Use".

`tools/linux-build` builds from the checkout it is in, through `tools/build`, in `build-linux-<arch>` (never `build`), with 4
jobs and 4 CPUs unless `--jobs n` says more, as the user `zinc` (the agent refuses root). ccache and the pinned tools live in the Docker
volume `zinc-linux-build-<arch>`. `--arch amd64` builds for a PC; `ZN_LINUX_IMAGE=debian:bookworm` for an older system (a binary built
on trixie needs glibc 2.41). `tools/package` then writes the same package as a release: `bin/zinc`, `bin/libzn_webgl.so`, `share/zinc`
(lib/std, the plugins and their libraries built with the pinned zig). It links nothing outside libc, libm, libstdc++ and libgcc: SDL3
is static and loads X11, KMS/DRM and EGL when a window opens.

Measured 2026-10-12 on the Apple Silicon Mac (OrbStack), 4 jobs: the image in about 1 min, the engine in about 9 min (summed over runs
that were interrupted, not one clean run), the package in 2 min 30 s; `zinc` is 18 MB, the package 42.7 MB packed (146 MB on the Pi),
over the 40 MB budget of a release, which `linux-build` reports without failing. In the container `agent` (discovery over mDNS
included) and `agent_apps` pass. On the Pi 3B+ (aarch64, Debian trixie): `zinc --version`, `zinc run` of a console program and
`zinc agent pair` work from `~/zinc-engine`.

What Linux needed: `runtime/gl_replay.cpp` included no `<math.h>` (libc++ brings it in through other headers, libstdc++ does not);
proof: the container build. `src/agent` compiled and passed its tests unchanged. Wayland is left out of the container: `third_party/SDL3`
is vendored without its `wayland-protocols`, so with `libwayland-dev` installed its configure turns on a backend that cannot be built.

Not proven yet: the agent running on the Pi and a workstation paired with it (discovery beside avahi, which holds port 5353 there;
info, shell, push and pull, an export installed and started); `zinc agent install` (the systemd user unit) on the Pi.

## Next

Open: the start of the service at login run for real (ZN-729.04, in review), and
everything on Linux, a Raspberry Pi and a second machine (the cross-platform pass in `backlog/later.md`).
