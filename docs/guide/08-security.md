# 8. Security

This chapter is deliberately honest about what Zinc protects and what it does not. Treat a Zinc binary like any other
native C++ program with the properties below, not like a sandboxed script. The audit behind it, with every finding and
its status, is [reports/security-audit.md](../reports/security-audit.md). To report a vulnerability, see
[SECURITY.md](../../SECURITY.md).

## Threat model

A Zinc program is typed TypeScript compiled ahead of time: `zinc export` and `zinc build` write C++ (AOT) linked with a small runtime,
`zinc run` and a `.zapp` run its bytecode on the interpreter. There is no `eval` (a compile error, `Z1003`), no dynamic `import()`
(`Z1009`), and no reflection or prototype mutation; regular expressions run on QuickJS-ng's libregexp, a backtracking engine (a pattern
built from input can take exponential time). The program is fixed at build time: input is data, never code. The exception is
`zinc run --engine quickjs`, which runs plain JavaScript on QuickJS-ng, a JavaScript engine. What an attacker can reach is the data a
program reads and the services it opens. Per deployment:

| Deployment | Who can attack | What they control | What Zinc does |
| --- | --- | --- | --- |
| **Desktop app** (macOS, Linux) | the author of a file, a web response, a document the app opens | bytes given to parsers (JSON, SVG, Lottie, glTF, PNG/JPEG, fonts, vector tiles) and to `zinc:fs` paths | memory-checked runtime; parsers bounds-checked, depth- and size-limited, fuzzed (below); nothing listens on the network unless the program asks |
| **Kiosk** (Pi with a screen) | people on the LAN, people at the device | the network services the app opens; the touch screen | the systemd unit runs it unprivileged; remote display on loopback, token when exposed |
| **Headless service** (Pi, server) | anyone who can reach its ports | HTTP requests, MQTT packets from the broker, OSC datagrams | size, connection and time limits on `net.serve`; bounded MQTT/OSC parsing; `ZINC_BIND` to restrict listeners; unprivileged hardened unit |
| **ESP32 device** | the network (WiFi), whoever holds the device | fetch responses, MQTT, OSC; the flash chip | the same bounded parsers with smaller limits (JSON depth 32, 16 KiB stack); no MMU, no ASLR: a bug is worse here |
| **Dev mode** (`zinc dev`, `--devtools`) | web pages open in the developer's browser, the LAN | the inspector port, the `serve.py` of a wasm export, `zinc monitor --udp` | the inspector and `serve.py` bind loopback; the inspector rejects foreign `Host` (DNS rebinding) and `Origin` (other web pages) headers; `zinc monitor --udp` listens on every interface (below) |

Out of scope: a local user with the same OS account (they can read the process's memory), physical access to an
unencrypted device, and the build machine and toolchain (trusted, see supply chain).

## Memory safety: what is guaranteed

The runtime turns most memory errors into a clean **panic** (the message JS would print) instead of undefined behaviour:

- **Array bounds** are checked on every indexed access; a non-integer or out-of-range `number` index panics before any
  conversion. Size computations (`new` arrays, growth, strings, runtime images) are checked for overflow; a string is at
  most 2^30 bytes (`RangeError: Invalid string length`), a runtime image at most 16384 pixels per side.
- **Null dereference** through an object reference panics; reading a property of `null`/`undefined` through a `Dyn`
  panics with the `TypeError` text. **Downcasts** out of `Dyn` are checked (ADR 0014).
- **Integer division by zero** panics; `i32` arithmetic wraps (defined once in `include/zn/ops.h`, the same in the interpreter and
  the AOT; no UB).
- **Reference counting** is exact for pooled and weakly referenced objects together (a pooled object freed by its last
  `@weak` goes back to its pool), and an `Arena` disposed while a newer one is open leaves the arena chain.
- **Drawing** takes any numbers: NaN, infinities, huge sizes and bad contour counts in `gfx` calls draw nothing wrong
  (float-to-int conversions saturate, counts are validated where the rasterizer reads them).
- **Parsers of untrusted input** are bounds-checked, limit nesting and work, and are fuzzed with ASan + UBSan
  (`tests/fuzz/`): JSON (`JSON.parse`), the `net.serve` HTTP request parser, MQTT, OSC, the DevTools HTTP/WebSocket
  endpoint, the remote-display stream (RLE), SVG, Lottie, glTF/GLB, PNG/JPEG (stb_image), TrueType, vector tiles and map
  styles, and the whole `gfx` drawing path.

Check with `zinc mem <file> --check-leaks` throughout development (live objects at exit, by class; it exits 4 when some are left); aim
for 0 live objects at exit.

## Memory safety: known limits

- **Reference cycles leak.** RC is RAII, not a tracing GC (ADR 0001). A cycle you don't break with `@weak` is a leak,
  caught by `zinc mem --check-leaks`.
- **Bounds checks are runtime, not proved away**, and `unchecked<T>()` opts out of one: it reintroduces UB on violation.
- **Arena escape is checked at runtime** (a panic at dispose), not at compile time.
- **Native plugins are C++.** Anything a plugin does in its own code is as safe as that code; the plugins shipped here
  are covered by the audit and the fuzzers above, a third-party plugin is not.
- **Stack depth.** Recursion in *your* program is not bounded (a deep recursion overflows the stack like in C). The
  runtime's own recursive parsers are bounded (JSON 512 levels, 32 on esp32/ps1; SVG 256; map styles 64). Releasing
  a long chain of objects is sliced (256 levels, then a 4096-entry queue): only a graph both deeper and wider than
  that recurses further.
- **Crash = exit.** A panic ends the program (or restarts it, `"crash": "restart"`): a hostile input can still stop a
  service, it cannot corrupt it. Put systemd's restart behind it (below).
- **No isolation between the program and the device.** `zinc:fs`, `zinc:sys`, `zinc:net`, `zinc:gpio`,
  `zinc:process` do what the OS user can do; `zinc:fs` has no root directory (a path from outside must be checked by
  the program: a path containing a NUL byte is refused). Run services as an unprivileged user (the `service` template's unit does).

## Permissions

`zinc.json` `"permissions"` lists what the program may do through the host modules. Without the key, files, network and processes are not
checked (a script, an app from before permissions). With it, even empty, every call of the table below is checked: while developing
(`zinc run`) a call the list does not cover works but warns once per permission on stderr; enforced (an app built by `zinc build` or
`zinc export`, or `ZINC_PERMISSIONS=enforce zinc run`) it fails with an `EACCES` error that names the permission to add. The desktop
modules of `zinc:system` are stricter: they need their permission whether the key is there or not. An unknown id is an error when zinc.json
is read.

```json
{ "permissions": ["fs:read:data", "fs:write:out", "net:api.example.com", "net:*.cdn.example.com", "tray"],
  "targets": { "linux": { "permissions": ["process", "-tray"] } } }
```

`targets.<target>.permissions` adjusts the list for one target: an id adds a permission, `-id` removes one. A build or a run on a Mac takes
the `macos` list, on Linux and for the Linux targets the `linux` list.

### The permission keys

| Key | Allows |
| --- | --- |
| `fs` | every file: reading and writing |
| `fs:read`, `fs:write` | every file: reading only, writing only (writing includes remove, mkdir, rename, chmod, symlink) |
| `fs:read:<dir>`, `fs:write:<dir>` | the files under `<dir>` (relative to the project, or absolute; links are resolved before the check) |
| `net`, `net:*` | every host, and listening (a server, a listening or UDP socket, OSC) |
| `net:<host>` | requests and connections to that host only |
| `net:*.<domain>` | requests and connections to the hosts of that domain (not the domain itself) |
| `net:unix:<path>` | the Unix socket at that path |
| `process` | starting child processes |
| `camera` | cameras; on macOS the camera entitlement and `NSCameraUsageDescription` |
| `microphone`, `location` | accepted, and on macOS their entitlement and usage strings; no module of the engine checks them yet |
| `serial` | accepted; no module of the engine checks it yet |
| `notification`, `menu`, `tray`, `dialog`, `window`, `shortcut`, `instance`, `deep-link`, `autostart`, `dock`, `power`, `clipboard`, `opener`, `update` | the module `zinc:system/<id>` (`zinc:system/deeplink` for `deep-link`): every op of it |
| `window:state`, `notification:notify`, `notification:permission`, `clipboard:rich` | the ops of a module that need that id only (`window:state`: saving and restoring the window's frame; `notification:notify`: notify, cancel, delivered; `clipboard:rich`: html, images and files) |

### What each host module checks

| Module | Call | Needs |
| --- | --- | --- |
| `zinc:fs` | `readText`, `readBytes`, `readDir`, `list`, `stat`, `lstat`, `readlink`, `realpath`, the source of `copyFile`; `watch` of a directory (it lists it); `exists` (false when refused) | `fs:read` covering the path |
| `zinc:fs` | `writeText`, `appendText`, `writeBytes`, `mkdir`, `mkdtemp`, `remove`, `rename` (both paths), `symlink` (the link), `chmod`, the destination of `copyFile` | `fs:write` covering the path |
| `zinc:fs` | `tmpdir`; `watch` of a file | not checked (see the gap below) |
| `zinc:assets` | reading the app's own assets | nothing (a path that leaves `assets/` with `..` is checked as any file); writing there through `zinc:fs` needs `fs:write` |
| `zinc:storage` | the app's own key-value file | nothing |
| `zinc:net` | `fetch` (and `fetch` of `zinc:web/fetch`, built on it): each request, and each redirect again with its new host | `net:<host>` |
| `zinc:net` | `serve` | `net` or `net:*` |
| `zinc:socket` (plugin) | connecting | `net:<host>` |
| `zinc:socket` | listening, UDP | `net` or `net:*` |
| `zinc:socket` | Unix sockets (connect, listen) | `net:unix:<path>` |
| `zinc:mqtt` | connecting (plain or TLS) | `net:<broker host>` |
| `zinc:osc` | sending | `net:<host>` |
| `zinc:osc` | listening | `net` or `net:*` |
| `zinc:process` (plugin) | starting a process (`spawn`, `run`) | `process` |
| `zinc:gphoto2` (plugin) | detecting and opening a camera | `camera` |
| `zinc:system/<id>` | importing the module (else compile error `Z5006`), then each op (else a `SystemError` with the code `denied`) | its id |
| `zinc:sys`, `zinc:gfx`, `zinc:ui`, `zinc:audio`, the other modules | | nothing |

**Exempt.** Files the user picked in a dialog (`zinc:system/dialog`) count as granted. With `"scopes": {"fs": "user-picked"}` the scope, which
is stricter, decides for files instead of the list: only picked files, and what is under a picked directory, can be read, written or listed.
`"scopes": {"opener": {"allow": [...]}}` limits what `zinc:system/opener` may open.

**Gap** (found while writing this page, ZN-327): `watch` of a file reports its changes without `fs:read`. The other calls this page found
unchecked (`exists`, `stat`, `lstat`, `readlink`, `realpath` and `mkdtemp`) are checked since.

**Exported apps enforce them.** `zinc build` and `zinc export` of a project with `"permissions"` compile a program that enforces the list from
its first instruction; `zinc export` prints the list. Cross builds for the Linux targets do the same with the `linux` list (proven on macOS
only so far: `next/tests/t1/permissions_export.sh`). On macOS `camera`, `microphone` and `location` add the usage strings
(`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription`) the system shows when it asks the user,
and the entitlements of the hardened runtime follow the list ([distribution](07-distribution.md#signing)).

**Plugins.** A plugin's `plugin.json` `"permissions"` is something else: the capabilities the plugin asks for, pinned in `zinc.lock` when it is
added (below, "Plugin distribution"). A plugin's native code is checked only where it asks the engine, as `zinc:gphoto2` does.

## Network services: defaults

| Service | Default bind | Authentication | Limits |
| --- | --- | --- | --- |
| `zinc:net` `serve(port, …)` | all interfaces (`ZINC_BIND=127.0.0.1` restricts) | none: put a reverse proxy in front for TLS and auth | 16 KiB headers, 1 MiB body (`ZRT_HTTP_MAX_BODY`), 32 connections, 10 s per request, 2 s per reply |
| `zinc:osc` `listen(port, …)` | all interfaces (`ZINC_BIND`) | none; UDP senders can be spoofed | 2048-byte datagrams |
| `zinc:mqtt` client | outbound, plaintext TCP | the broker's | 1 MiB packets (`ZRT_MQTT_MAX_PACKET`), fields checked against the packet |
| `zinc:telemetry` | outbound UDP / stdout / file, plaintext | – | – |
| DevTools inspector (`zinc dev`, `--devtools`) | `127.0.0.1:9229` | loopback + `Host` and `Origin` checks | 64 KiB frames, 4 clients |
| display-remote (`display: "remote"`) | `127.0.0.1:7700` | token (`ZINC_REMOTE_TOKEN`) when exposed; a warning without | 64-byte viewer messages; PONG stops when a viewer does not read |
| zinc:remote viewer (ZincStudio devices) | outbound; beacons on UDP 7701 (unauthenticated) | sends the token | messages bounded by the screen size |
| `serve.py` of a wasm export | `127.0.0.1:8000` (its argument is the port) | – | serves its own folder only |
| `zinc monitor --udp <port>` | all interfaces | none: any host that reaches the port writes lines | lines are printed as received, control characters included: use it on a trusted network only |
| mapping web companion | `127.0.0.1:8080` (`--host`) | per-run token in the editor URL (header `x-zinc-token`) | 1 MiB requests |

There is no built-in TLS anywhere: across an untrusted network use a tunnel (`ssh -L`, WireGuard) or a reverse proxy.
The HTTP server is minimal (one connection at a time on the event loop): it is for control and telemetry APIs, not a
public web server. The mapping plugin's OSC commands `/save` and `/load` take a plain file name, never a path.

## Deploying on Linux and Raspberry Pi

`zinc export --target linux` (or `rpi`, `rpi1`, ...) writes the executable, `run.sh` and a `.desktop` file, and `zinc deploy` copies the
export to the device with scp and starts `./run.sh` with ssh, as the user you log in as. A service that runs at boot needs a systemd unit:
the `service` template carries one, `deploy/<id>.service`, which runs the program as a transient unprivileged user (`DynamicUser=yes`) with
`NoNewPrivileges=yes`, `ProtectSystem=strict` (the system is read-only) and `ProtectHome=yes`, and restarts it on failure. Install it as
root: the executable under `/opt/<id>/`, owned by root (the service cannot rewrite its own binary), the unit under `/etc/systemd/system/`,
then `systemctl enable --now <id>`.

- **Harden it further** in the unit: `CapabilityBoundingSet=` (no capabilities), `PrivateTmp=yes`, `ProtectKernelTunables=yes`,
  `ProtectKernelModules=yes`, `ProtectControlGroups=yes`, `ProtectClock=yes`, `ProtectHostname=yes`, `RestrictSUIDSGID=yes`,
  `RestrictNamespaces=yes`, `LockPersonality=yes`, `SystemCallArchitectures=native`, `UMask=0077`.
- **State** lives in `/var/lib/<id>`: `StateDirectory=<id>`, `WorkingDirectory=/var/lib/<id>` and
  `Environment=ZINC_STORAGE=/var/lib/<id>/storage` (the file `zinc:storage` writes).
- **Devices** are reached through groups: `SupplementaryGroups=` with the groups the device has (systemd refuses a unit naming a missing
  group). Raspberry Pi OS gives `/dev/fb0` and `/dev/dri` to `video`/`render`, `/dev/input` to `input`, `/dev/gpiochip*` to `gpio`, SPI and
  I2C to `spi`/`i2c`, USB cameras (gphoto2) to `plugdev`. No udev rules are needed there; on another distribution, give the device nodes you
  use to a group (e.g. `SUBSYSTEM=="gpio", GROUP="gpio", MODE="0660"` in `/etc/udev/rules.d/99-zinc.rules`) and add the group to the unit.
- **Relaxing it** (in a drop-in, `systemctl edit <id>`): a port below 1024 needs `AmbientCapabilities=CAP_NET_BIND_SERVICE` and the same
  in `CapabilityBoundingSet=`; writing under `/sys` (backlight) needs `ReadWritePaths=/sys/class/backlight/...` and
  `ProtectKernelTunables=no`; `RestrictRealtime=no` for realtime audio.
- **Secrets**: `EnvironmentFile=/etc/<id>.env` (root-owned, mode 600), never the unit file.

`zinc export` refuses a project name that is not a plain word (`[A-Za-z0-9._-]`): it becomes file names, shell words and unit lines.

## Build hardening

Release builds (`zinc build`, `zinc export`) compile with `-O2`, drop local symbols (`-Wl,-x`; `ZN_KEEP_SYMBOLS=1` keeps them for
profilers) and on macOS strip unreferenced code and export nothing (`-dead_strip`, `-no_exported_symbols`). They are built without a stack
protector (`-fno-stack-protector`: the generated code indexes its frames with constants only), without `_FORTIFY_SOURCE` and without RELRO:
the prototype's hardening flags (and its `ZINC_HARDEN` switch) are not applied by Zinc Next. Array bounds, null references and sizes are
checked by the runtime (above), not by the compiler. ESP32 uses the ESP-IDF defaults.

## Secrets handling

- **Do not bake secrets into the binary or assets.** Embedded assets and string literals are recoverable from the
  executable (nothing in Zinc hides them, below). Read secrets at runtime from the environment
  (`sys.env('API_KEY')`), a file with restricted permissions, or `zinc:storage`: its file is written owner-only (0600)
  and atomically (a crash or power cut during a write keeps the previous contents). On ESP32 it is NVS: enable flash
  encryption if the device is physically exposed.
- **ESP32**: the program (`app.bin`) and its strings sit in the flash in clear; enable flash encryption if the device is
  physically exposed. There is no OTA update.
- **Hidden files are never assets**: files and directories starting with `.` under `assets/` (`.env`, `.git`) are not
  embedded. Symbolic links are followed: whatever they point to is embedded.
- Keep secrets out of logs: `console.*` and telemetry are plaintext.

## Supply chain

- The toolchains zinc downloads (the pinned zig, esptool, Espressif's QEMU) are checked against SHA-256 pins compiled into
  zinc before anything is unpacked; a mirror or proxy that serves other bytes is refused (see below).
- Vendored libraries are listed with their licences and versions in `next/third_party/components.json`; every
  `zinc export` writes an SPDX SBOM of what the app links (ZN-323).
- Builds are reproducible (`-DZN_REPRODUCIBLE=ON`, docs/reports/zinc-next-reproducible.md): a release can be rebuilt and
  compared byte for byte, and the CI does so for zinc and three plugins.
- Plugins are source by default and nothing of a plugin runs while it is fetched (no hooks, no install scripts); how they are
  published, signed, logged and trusted is the next section.

## Plugin distribution: threat model and guarantees

**Who is trusted for what.** The index's top-level role (the Zinc release key) signs what is official and the delegations to
verified publishers; a verified publisher's key signs only the paths delegated to it; a community publisher is trusted only
for its own plugin, by the key pinned on first use; mirrors, proxies, CDNs and the network are trusted for nothing: they may
serve bytes, every byte is checked against a signature or a hash before it is used.

| Attack | What zinc does | Test |
| --- | --- | --- |
| Freeze: a mirror keeps serving an old index | the timestamp expires after 7 days (republished daily); an expired role is refused | `tuf_index` (expired timestamp) |
| Rollback: an older, vulnerable index or version | versions never go down against the cached trusted metadata; the snapshot pins every role's version | `tuf_index` (rolled-back snapshot) |
| Arbitrary package / mix and match: other bytes under a signed name | every target's length and SHA-256 come from the signed metadata; a mirror that serves other bytes is refused and the next one tried | `tuf_index` (target hash), `mirrors`, `plugin_fetch` (tampered archive) |
| A stolen key, below threshold | a role needs its threshold of distinct valid signatures | `tuf_index` (below threshold) |
| A publisher signing what is not theirs | a delegated role is consulted only for its paths, and only its delegated keys count | `tuf_index` (not delegated, another key), `plugin_tiers` |
| A signed but malicious release, slipped in quietly | with a log key pinned, an artifact must be in the transparency log, whose history cannot be rewritten without every client noticing | `tlog` (unlogged artifact, rewritten history), `plugin_fetch` |
| A key or version found bad later | the index's `revocations.json` revokes it: installs refuse it, `zinc run` warns, a revoked key signs nothing | `revocation` |
| A verified publisher's binary built from other sources | used only after the policy's number of matching independent rebuilds, else built here | `plugin_tiers`, `trust_policy` |
| A community plugin taken over (new key) | the key pinned on first use is required; a new one is refused until `zinc trust` | `plugin_community`, `plugin_sign` |
| An update that quietly asks for more | capabilities are pinned in `zinc.lock`; a new one needs `zinc add --accept` | `plugin_lock`, `plugin_cli` |
| A changed archive, a moved git ref | `zinc.lock` pins the SHA-256 or the commit; `zinc install --frozen` refuses any drift | `plugin_add`, `plugin_lock` |
| A cloned project loosening a company's rules | the trust policy can only be tightened by the project | `trust_policy`, `policy` |

**Mirrors and proxies** (`ZINC_MIRRORS`, `HTTPS_PROXY`, the policy's `mirrors`) can delay or withhold downloads, and see what
is fetched; they cannot make zinc use bytes the index, the lock or the pins do not name, roll it back past what it has seen,
or keep a frozen index alive for more than a week.

**Publishing a plugin.** 1. Write the plugin in its own repository (`zinc new plugin <dir>`, the starter): `plugin.json` with
`version`, `permissions` and, for a community plugin, `publisher { name, publicKey }` from `zinc update-keygen`. 2. Release an
archive and sign it: `zinc sign plugin-1.0.tar.gz <seed>` writes the `.sig` beside it; users `zinc add <url>` (community, the
key pinned). 3. To be verified, ask for a delegation in the index (your public key for `<you>/*/*` and `<you>/*/*/*`); your CI
publishes `<you>/plugins/<name>/<version>.json` and, per target, `zinc plugin-build <name> --pack` archives signed by your
key; the starter's CI runs the reusable workflow `.github/workflows/plugin.yml`, which builds, packs and signs them (their
publication into the index under the delegation is ZN-338). 4. Rebuilders rebuild the archives (`-DZN_REPRODUCIBLE`, the pinned zig)
and the index records `rebuilds/<sha256>.json`; your binaries are used once the policy's number of rebuilds match.

**A private index and mirror for a company.** Run `next/tools/index-repo` with the company's keys over its plugins, publish it
on any static host, and set on every machine `ZINC_INDEX_URL`, `ZINC_INDEX_ROOT` (the company's root), `ZINC_MIRRORS` (an
internal mirror of `index/` and of the toolchains, laid out as described in [distribution](07-distribution.md)) and a
system policy (`/etc/zinc/policy.json`: tiers, `prebuilt`, `transparency`, `mirrors`) that projects cannot loosen.
`zinc install --offline` then works from the content cache on machines without network.

**Key rotation.** The index root: publish `N+1.root.json` signed by the old and the new root keys; clients walk the chain.
Top-level role keys change through a new root; a publisher's key through a new delegation (and the old one revoked); a
community publisher's through `zinc trust` by each user, on purpose. The log key and the root shipped with zinc change
with a zinc release.

**Incident response.** A compromised publisher key: revoke it in `revocations.json` and remove its delegation; republish.
A bad version: revoke the version with a reason and a replacement; `zinc install` refuses it and `zinc run` warns where it is
still locked. A compromised index key: rotate the root (above) and revoke what it signed. Every published artifact stays in
the transparency log, so what was served can be audited afterwards. Report vulnerabilities as described at the end of this
page.

## Fuzzing

Two sets of libFuzzer harnesses run with ASan and UBSan. `scripts/fuzz.sh 60` fuzzes, 60 s each, the parsers of untrusted input of the
runtime Zinc Next links (`tests/fuzz/`: JSON, the HTTP request parser, MQTT, OSC, the DevTools endpoint, the remote-display stream, SVG,
Lottie, glTF, PNG/JPEG, TrueType, vector tiles and map styles, the `gfx` path); `scripts/fuzz.sh --replay` runs their checked-in corpora
once. `next/tools/fuzz all 60` fuzzes the engine's own inputs: programs through the parser and the checker, ZBC files through the decoder
and verifier, the native ABI and ZPK packs; `next/tests/t0/fuzz_regress.sh` replays every input that once failed (`next/tests/fuzz/regress`).
A crash leaves its input (`tests/fuzz/build/crash-<harness>-*`, `next/tests/fuzz/crashes/<target>-<hash>`): fix it, then add the file to the
corpus or to the regressions. Both need a clang with libFuzzer: LLVM's, or Apple's with the libFuzzer `next/tools/libfuzzer` builds.

## Obfuscation: what a native build hides

Zinc Next has no `--obfuscate`: that option of the prototype's export (string literals XOR-encoded in the generated C++) is not carried
over. What a native build hides anyway, compared with a JavaScript bundle: an exported executable holds no source and no bytecode (a
`.zapp` and a fused executable do carry the bytecode, `program.zbc`), and local names, types, comments and local symbols are gone. What
stays readable: the string literals (`strings` finds them), the names the program prints or serializes (classes, JSON keys), the embedded
assets and the runtime's messages. None of it stands against a debugger, a disassembler or tampering: macOS code signing detects a
modified signed bundle at load time (the OS, not Zinc), and `zinc verify` a modified artifact. The only reliable protection for a secret is
to not ship it.

## Reporting a vulnerability

See [SECURITY.md](../../SECURITY.md): report privately, with a reproducer (a fuzz input is ideal).
