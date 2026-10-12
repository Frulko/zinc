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
zinc device run hero -f | stop hero | logs hero -f | apps | uninstall hero | install app.zapp
zinc device forward 9229 9229            # a port of the device on this machine: chrome://inspect sees the app running there
zinc device reverse 8080 3000            # a port of this machine on the device: an app there calls the server you develop here
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
| `connect` | `port` | `I` / `O` / `C` relayed to 127.0.0.1:`port` of the device |
| `listen` | `port` | the agent listens on 127.0.0.1:`port` of the device (0: any; the answer says which) and sends `{"accept": id}` for each connection it takes, until the client leaves |
| `accepted` | `id` | `I` / `O` / `C` relayed to that connection: the workstation opens this session for each `accept` and connects it to its own port |
| `unpair` | | the agent forgets this workstation |

A name in a transfer that is absolute or holds `..` is refused by whoever receives it (the device on `push`, the workstation on
`pull`); the receiver reads the sender to its last entry and reports the first error at the end.

## Files of the agent (`~/.zinc/agent`)

`agent.json` (the device's id and name), `clients.json`, `pairing.json` (the open pairing: `zinc agent pair` writes it, the daemon
reads it, so the two need no channel between them), `apps/<name>/` (`app.zapp`, or an export directory), `logs/<name>.log` (cut back
past 4 MiB: the last 1 MiB goes to `<name>.log.1`), `run/<name>.pid`.

## Known limits (each is a `ponytail:` comment in the code)

- IPv4 only, discovery and listener.
- mbedTLS is built without thread support, so the agent's sessions share one lock around its calls: fine for a few sessions, a limit for
  several large transfers at once.
- Links and special files are left out of transfers.
- A `.zapp` is read whole to check it at install.
- The writes to a shell's input block: a paste larger than the terminal's buffer into a program that prints as much without reading stalls
  that session.
- An app is known by its pid file alone.
- Linux and macOS (POSIX sockets, `forkpty`): the Windows client is part of the cross-platform pass.

## Next (ZN-729.03 to .06)

`zinc dev --device` (reload at every save, assets swapped live), the agent as a service with signed OTA updates and rollback, the
inspector, capture and telemetry (`inspect`, `shot`, `monitor`, `top`), and Atelier's devices panel.
