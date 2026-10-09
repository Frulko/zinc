# 8. Security

This chapter is deliberately honest about what Zinc protects and what it does not. Treat a Zinc binary like any other
native C++ program with the properties below, not like a sandboxed script. The audit behind it, with every finding and
its status, is [reports/security-audit.md](../reports/security-audit.md). To report a vulnerability, see
[SECURITY.md](../../SECURITY.md).

## Threat model

Zinc compiles to C++17 and links a small runtime. There is no JavaScript engine and no `eval` (a compile error,
`Z1003`), no dynamic `import()` (`Z1009`), no regex engine, and no reflection or prototype mutation. The program is fixed
at build time: input is data, never code. What an attacker can reach is the data a program reads and the services it
opens. Per deployment:

| Deployment | Who can attack | What they control | What Zinc does |
| --- | --- | --- | --- |
| **Desktop app** (macOS, Linux) | the author of a file, a web response, a document the app opens | bytes given to parsers (JSON, SVG, Lottie, glTF, PNG/JPEG, fonts, vector tiles) and to `zinc:fs` paths | memory-checked runtime; parsers bounds-checked, depth- and size-limited, fuzzed (below); nothing listens on the network unless the program asks |
| **Kiosk** (Pi with a screen) | people on the LAN, people at the device | the network services the app opens; the touch screen | the systemd unit runs it unprivileged; remote display on loopback, token when exposed |
| **Headless service** (Pi, server) | anyone who can reach its ports | HTTP requests, MQTT packets from the broker, OSC datagrams | size, connection and time limits on `net.serve`; bounded MQTT/OSC parsing; `ZINC_BIND` to restrict listeners; unprivileged hardened unit |
| **ESP32 device** | the network (WiFi), whoever holds the device | fetch responses, MQTT, OSC; the flash chip | the same bounded parsers with smaller limits (JSON depth 32, 16 KiB stack); no MMU, no ASLR: a bug is worse here |
| **Dev mode** (`zinc dev`, `--devtools`) | web pages open in the developer's browser, the LAN | the inspector port, the wasm dev server, `zinc monitor` | loopback binds; the inspector rejects foreign `Host` (DNS rebinding) and `Origin` (other web pages) headers |

Out of scope: a local user with the same OS account (they can read the process's memory), physical access to an
unencrypted device, and the build machine and toolchain (trusted, see supply chain).

## Memory safety: what is guaranteed

The runtime turns most memory errors into a clean **panic** (the message JS would print) instead of undefined behaviour:

- **Array bounds** are checked on every indexed access; a non-integer or out-of-range `number` index panics before any
  conversion. Size computations (`new` arrays, growth, strings, runtime images) are checked for overflow; a string is at
  most 2^30 bytes (`RangeError: Invalid string length`), a runtime image at most 16384 pixels per side.
- **Null dereference** through an object reference panics; reading a property of `null`/`undefined` through a `Dyn`
  panics with the `TypeError` text. **Downcasts** out of `Dyn` are checked (ADR 0014).
- **Integer division by zero** panics; `i32` arithmetic wraps (`-fwrapv`, no UB).
- **Reference counting** is exact for pooled and weakly referenced objects together (a pooled object freed by its last
  `@weak` goes back to its pool), and an `Arena` disposed while a newer one is open leaves the arena chain.
- **Drawing** takes any numbers: NaN, infinities, huge sizes and bad contour counts in `gfx` calls draw nothing wrong
  (float-to-int conversions saturate, counts are validated where the rasterizer reads them).
- **Parsers of untrusted input** are bounds-checked, limit nesting and work, and are fuzzed with ASan + UBSan
  (`tests/fuzz/`): JSON (`JSON.parse`), the `net.serve` HTTP request parser, MQTT, OSC, the DevTools HTTP/WebSocket
  endpoint, the remote-display stream (RLE), SVG, Lottie, glTF/GLB, PNG/JPEG (stb_image), TrueType, vector tiles and map
  styles, and the whole `gfx` drawing path.

Build with `--debug` (ASan + UBSan + leak report) throughout development; aim for 0 live objects at exit.

## Memory safety: known limits

- **Reference cycles leak.** RC is RAII, not a tracing GC (ADR 0001). A cycle you don't break with `@weak` is a leak,
  caught by the `--debug` leak report.
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
  the program: a path containing a NUL byte is refused). Run services as an unprivileged user (the exported unit does).

## Permissions

`zinc.json` `"permissions"` says what the program's host modules may do. Without the key nothing is checked (as before); with it, every
call is checked: while developing (`zinc run`) a call the list does not cover works but is warned about once per permission on stderr, and
when enforced (exported apps, or `ZINC_PERMISSIONS=enforce`) it fails with an `EACCES` error that names the permission to add.

```json
{ "permissions": ["fs:read:data", "fs:write:out", "net:api.example.com", "net:*.cdn.example.com"] }
```

| Entry | Allows |
|---|---|
| `fs`, `fs:read`, `fs:write` | every file, reading only, writing only (also remove, mkdir, rename, chmod, symlink) |
| `fs:read:<root>`, `fs:write:<root>` | under that directory (relative to the project, or absolute) |
| `net`, `net:<host>`, `net:*.<domain>`, `net:*` | fetch to any host, one host, a domain's hosts; listening (`serve`) needs `net` or `net:*` |
| `net` also covers sockets (`zinc:socket`: connect to the host, listening and UDP need `net` or `net:*`, Unix sockets `net:unix:<path>`), `zinc:mqtt` and `zinc:osc` (send to the host, listen) | |
| `process` | child processes (`zinc:process`) |
| `camera` | `zinc:gphoto2` (detect, open) |
| `serial`, `microphone`, `location` | accepted; no module of the engine reaches them yet |

Exported apps enforce them: `zinc build` / `zinc export` of a project with `"permissions"` (for this machine and for the Linux targets) compiles a program that
enforces the list from its first instruction, `zinc export` prints the list, and on macOS `camera`, `microphone` and `location` add the usage
strings (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription`) the system shows when it asks the
user.

Exempt: the app's own `assets/` (zinc:assets), and files the user picked in a dialog. With `"scopes": {"fs": "user-picked"}` the scope, which
is stricter, decides for files. Redirects are checked against the new host.

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
| `zinc run/dev --target wasm` server | `127.0.0.1:8080` (`HOST=0.0.0.0` for the LAN) | – | serves the build directory only |
| `zinc monitor` | `127.0.0.1` (`ZINC_MONITOR_HOST=0.0.0.0` for devices) | – | control characters are escaped before printing |
| mapping web companion | `127.0.0.1:8080` (`--host`) | per-run token in the editor URL (header `x-zinc-token`) | 1 MiB requests |

There is no built-in TLS anywhere: across an untrusted network use a tunnel (`ssh -L`, WireGuard) or a reverse proxy.
The HTTP server is minimal (one connection at a time on the event loop): it is for control and telemetry APIs, not a
public web server. The mapping plugin's OSC commands `/save` and `/load` take a plain file name, never a path.

## Deploying on Linux and Raspberry Pi

`zinc export --target linux|rpi1` writes `<name>.service` and `deploy.sh`:

- **The program runs unprivileged.** `DynamicUser=yes` (a transient user), `CapabilityBoundingSet=` (no capabilities),
  `NoNewPrivileges=yes`, `ProtectSystem=strict` (the system is read-only), `ProtectHome=yes`, `PrivateTmp=yes`, the
  kernel, clock, cgroup and hostname protections, `RestrictSUIDSGID`, `RestrictNamespaces`, `LockPersonality`,
  `SystemCallArchitectures=native`, `UMask=0077`.
- **State** lives in `/var/lib/<name>` (`StateDirectory`): the working directory, and `ZINC_STORAGE` points there.
- **Devices** are reached through groups: `SupplementaryGroups=video render input tty gpio spi i2c audio plugdev`,
  reduced by `deploy.sh` to the groups the device has (systemd refuses a unit naming a missing group). Raspberry Pi OS
  gives `/dev/fb0` and `/dev/dri` to `video`/`render`, `/dev/input` to `input`, `/dev/gpiochip*` to `gpio`, SPI and I2C
  to `spi`/`i2c`, USB cameras (gphoto2) to `plugdev`. No udev rules are needed there; on another distribution, give
  the device nodes you use to a group (e.g. `SUBSYSTEM=="gpio", GROUP="gpio", MODE="0660"` in
  `/etc/udev/rules.d/99-zinc.rules`) and add the group to the unit.
- **Install**: `deploy.sh` copies into a fresh `mktemp -d` directory on the device (never a predictable `/tmp` path),
  installs into `/opt/<name>` owned by root (the service cannot rewrite its own binary), then enables the unit.
- **Relaxing it** (in a drop-in, `systemctl edit <name>`): a port below 1024 needs
  `AmbientCapabilities=CAP_NET_BIND_SERVICE` and the same in `CapabilityBoundingSet=`; writing under `/sys` (backlight)
  needs `ReadWritePaths=/sys/class/backlight/...` and `ProtectKernelTunables=no`; `RestrictRealtime=no` for realtime
  audio.
- **Secrets**: `EnvironmentFile=/etc/<name>.env` (root-owned, mode 600), never the unit file.

`zinc export` refuses a project name that is not a plain word (`[A-Za-z0-9._-]`) for these targets: it becomes shell
words run with `sudo` on the device and unit lines. On the reMarkable (AppLoad), apps run as root: that is the
tablet's model, not something the export can change.

## Build hardening

Release builds for macOS, Linux, rpi1 and rmpp add `-fstack-protector-strong -D_FORTIFY_SOURCE=2`, and full RELRO
(`-Wl,-z,relro,-z,now`) on Linux. Measured on the bench kernels and a raster benchmark
([audit](../reports/security-audit.md#hardening-flags-overhead)): within noise on rendering and most kernels, 1.8 %
CPU on a tight array-permutation loop. `ZINC_HARDEN=0` builds without them. Linux executables are PIE (the compiler's default); rpi1 and rmpp
export builds are linked statically (no PIE, so no ASLR of the main image). ESP32 uses the ESP-IDF defaults.

## Secrets handling

- **Do not bake secrets into the binary or assets.** Embedded assets and string literals are recoverable from the
  executable (obfuscation only raises the effort, below). Read secrets at runtime from the environment
  (`sys.env('API_KEY')`), a file with restricted permissions, or `zinc:storage`: its file is written owner-only (0600)
  and atomically (a crash or power cut during a write keeps the previous contents). On ESP32 it is NVS: enable flash
  encryption if the device is physically exposed.
- **ESP32 WiFi** credentials (`targets.esp32.wifi` in zinc.json) are compiled into the firmware; keep the password out
  of the committed zinc.json with `ZINC_WIFI_PASSWORD=... zinc build --target esp32`. There is no OTA update.
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

**Publishing a plugin.** 1. Write the plugin in its own repository (`zinc-engine/plugin-starter`, ZN-354): `plugin.json` with
`version`, `permissions` and, for a community plugin, `publisher { name, publicKey }` from `zinc update-keygen`. 2. Release an
archive and sign it: `zinc sign plugin-1.0.tar.gz <seed>` writes the `.sig` beside it; users `zinc add <url>` (community, the
key pinned). 3. To be verified, ask for a delegation in the index (your public key for `<you>/*/*` and `<you>/*/*/*`); your CI
publishes `<you>/plugins/<name>/<version>.json` and, per target, `zinc plugin-build <name> --pack` archives signed by your
key; the reusable workflow that does this is ZN-338. 4. Rebuilders rebuild the archives (`-DZN_REPRODUCIBLE`, the pinned zig)
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

```sh
scripts/fuzz.sh 60              # every harness in tests/fuzz for 60 s (libFuzzer + ASan + UBSan)
scripts/fuzz.sh 300 svg lottie  # some of them
zinc test --fuzz                # replay the checked-in corpora (regressions), no fuzzing
```

A crash leaves `tests/fuzz/build/crash-<harness>-*`; fix it and add the file to `tests/fuzz/corpus/<harness>/`.
`CXX` selects the compiler: it needs libFuzzer (LLVM clang; Apple's Xcode clang does not ship it).

## Obfuscation: what it does and does not protect

`zinc export --obfuscate` XOR-encodes the program's string literals in the generated C++ with a per-literal keystream,
decodes the pool once at startup, and builds with `-fvisibility=hidden`. Symbol stripping is already on for export
builds (`strip`, dead-strip / `--gc-sections`, `-Wl,-x` / `-s`). Verified effect:

```sh
zinc export --target macos --obfuscate myapp
strings myapp.app/Contents/MacOS/myapp | grep -c MySecretKey   # 0  (plain build: 1)
```

**What stays readable** even with `--obfuscate`: class names, field and JSON key names, the window title, embedded
assets, and the runtime's own messages. **The keystream is not a secret**: its seed is a fixed function of the
literal's position, so one script decodes the pool of any Zinc binary without running it. And anyone running the
program under a debugger reads the decoded pool in memory.

What a native binary already hides (vs a JS bundle): there is no source, no bytecode, no symbol-rich AST; local names,
types and comments are gone. What none of it protects against: a debugger or disassembler, extracting an embedded key,
tampering. There is no anti-tamper or integrity self-check; macOS code signing (chapter 7) detects modification of a
signed bundle at load time, which is the OS, not Zinc. Use `--obfuscate` and stripping to avoid trivially leaking
strings, not as a security boundary: the only reliable protection for a secret is to not ship it.

## Reporting a vulnerability

See [SECURITY.md](../../SECURITY.md): report privately, with a reproducer (a fuzz input is ideal).
