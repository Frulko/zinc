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
| `process`, `serial`, `camera`, `microphone`, `location` | checked by their modules (ZN-322.02) |

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

- Cross builds run in SDK Docker images whose base images are **pinned by digest** (`docker/sdk-*`, and
  `espressif/idf:v6.0@sha256:…` for ESP32), rebuilt from the checked-in Dockerfiles. The packages installed in them
  come from the distribution at build time (not pinned).
- The runtime links only what a program uses (libcurl for `zinc:net`, SDL3 for windows, plugin-declared libraries).
  Vendored code and system libraries, with versions and advisories: [security/third-party.md](../security/third-party.md).
- Third-party plugins are source you compile into your program: read them like your own code. There is no registry
  and no post-install scripts.

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
