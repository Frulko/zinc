# 8. Security

This chapter is deliberately honest about what Zinc protects and what it does not. Treat a Zinc binary like any other
native C++ program with the properties below — not like a sandboxed script.

## Threat model

- **Native code, no interpreter.** Zinc compiles to C++17 and links a small runtime; there is no JavaScript engine and
  no `eval` (it's a compile error, `Z1003`), no dynamic `import()` (`Z1009`), no regex engine, no reflection or
  prototype mutation. There is no script-injection surface because there is no script loaded at runtime — the program
  is fixed at build time. Input is data, never code.
- **What runs is what you shipped.** Assets are embedded and code is compiled in; a Zinc app does not download or
  execute code. (If *you* add a plugin that does — e.g. fetching and interpreting content — that is your surface.)
- **The usual native risks remain.** Logic bugs, exposed network services, secrets in the binary, and supply-chain
  trust in the toolchain are all still on you. The rest of this chapter covers each.

## Memory-safety properties and limits

Zinc inserts runtime checks so most memory errors become a clean **panic** (the message JS would print), not
undefined behaviour:

- **Array bounds** are checked on every indexed access (`array index out of bounds`); a non-integer index panics too.
- **Null dereference** through an object reference panics (`null dereference`); reading a property of `null`/`undefined`
  through a `Dyn` panics with the `TypeError` text.
- **Downcasts** out of `Dyn` and `instanceof`-style conversions are checked (`invalid downcast`) — this is what makes
  the gradual profile memory-safe (ADR 0014).
- **Integer division by zero** panics; `i32` arithmetic wraps deterministically (no UB).

Limits, stated plainly:

- **Reference cycles leak.** RC is RAII, not a tracing GC and not compiler-inserted with cycle detection (ADR 0001).
  A cycle you don't break with `@weak` is a memory leak, caught by the `--debug` leak report, not by the runtime.
- **Bounds checks are runtime, not proved away.** There is no static bounds/escape analysis yet; the checks cost a
  compare-and-branch. The `unchecked<T>()` intrinsic *opts out* of a check — use it only where you have proven the
  invariant, because it reintroduces UB on violation.
- **Arena escape is checked at runtime**, not at compile time — a value that outlives its `Arena.frame()` panics when
  detected, it is not a type error.
- **No isolation between the program and the device.** `zinc:fs`, `zinc:sys`, `zinc:net`, `zinc:gpio` do what the OS
  user can do; there is no capability sandbox. Run services as an unprivileged user.

Build with `--debug` (ASan + UBSan + leak report) throughout development; aim for 0 live objects at exit.

## Network service exposure defaults

Know what binds where before you deploy:

- **`zinc:net` `serve(port, …)`**, and the **`zinc:osc`** / **`zinc:mqtt`** listeners, bind `0.0.0.0` (`INADDR_ANY`) —
  reachable from any interface. There is no built-in TLS, auth, rate limiting or request-size cap beyond a
  `Content-Length` read. Put a reverse proxy (TLS, authentication, limits) in front, or bind the host to a private
  network / firewall the port. The HTTP server is minimal (one connection at a time on the event loop) — it is for
  control/telemetry APIs on a trusted network, not a public web server.
- **`zinc:telemetry`** sends to wherever `ZINC_TELEMETRY` / `telemetry.connect()` points; it is plaintext JSON over UDP
  (or stdout/file). Don't send it across an untrusted network without a tunnel.
- **The dev inspector (`plugins/devtools`)** binds **loopback only** (`127.0.0.1:9229`); remote access is via
  `ssh -L` (which `zinc dev --device` sets up). It is a dev-only build feature (`zinc dev` / `--devtools`), not in a
  release build unless you ask for it.
- **Optional display/companion/remote plugins** (e.g. a mapping web companion over OSC, or a remote-display plugin) set
  their own bind address and allowlist — consult that plugin's own docs and treat any IPC/remote channel as a trust
  boundary. If a plugin exposes a webview IPC bridge, keep its message allowlist tight (only the calls the UI needs)
  and validate every argument on the native side; anything a webview can reach is attacker-reachable if the page loads
  remote content.

## Secrets handling

- **Do not bake secrets into the binary or assets.** Embedded assets and string literals are recoverable from the
  executable (obfuscation only raises the effort — see below). Read secrets at runtime from the environment
  (`sys.env('API_KEY')`), a file with restricted permissions, or `zinc:storage` (a local key/value store; on ESP32 it
  is NVS — encrypt the flash on hardware if the device is physically exposed).
- Keep secrets out of logs. `console.*` and telemetry are plaintext; scrub before logging.
- For `systemd`, pass secrets via `EnvironmentFile=` (mode `600`), not the unit file in git.

## Supply chain

- Cross builds run in **pinned SDK Docker images** (`docker/sdk-*`, e.g. `espressif/idf:v6.0`), so the toolchain is
  fixed and reproducible rather than "whatever is on the build machine". Rebuild them from the checked-in Dockerfiles.
- Zinc has a tiny dependency surface: Node runs the compiler, and the runtime links only what a program uses (libcurl
  for `zinc:net`, SDL3 for windows, plugin-declared libraries). Review a plugin's `plugin.json` `packages`/`pkg`/`libs`
  to see exactly what it pulls in.
- Third-party plugins are source you compile into your program — read them like your own code. There is no registry
  and no post-install scripts; distribution is by directory (chapter 5).

## Obfuscation — what it does and does not protect

`zinc export --obfuscate` XOR-encodes every string literal in the generated C++ with a per-literal keystream and
decodes the pool once at startup, plus `-fvisibility=hidden`. Symbol stripping is already on for export builds
(`strip`, dead-strip / `--gc-sections`, `-Wl,-x` / `-s`). Verified effect:

```sh
zinc export --target macos --obfuscate myapp
strings myapp.app/Contents/MacOS/myapp | grep -c MySecretKey   # 0  (plain build: 1)
```

**What a native binary already hides** (vs a JS bundle): there is no source, no readable bytecode and no symbol-rich
AST — an attacker gets machine code, which is far more work to understand than minified JS. Local variable names, types
and comments are gone after compilation regardless of obfuscation.

**What symbol stripping and `--obfuscate` add:** function/symbol names are removed from the symbol table; string
literals no longer appear in a `strings` dump or a casual hex view, so grepping the binary for an endpoint, a key
format or a message won't find them.

**What none of it protects against — be honest:**

- **A debugger or disassembler.** The XOR key and decoder are in the binary; anyone running the program under a
  debugger, or reading the decoded pool in memory after `zinc_lits_decode()`, recovers every string. This raises
  effort, it does not create secrecy.
- **Extracting embedded secrets.** A key compiled into the app is extractable, obfuscated or not. Obfuscation is not a
  substitute for keeping secrets off the device (see above).
- **Tampering / patching.** There is no anti-tamper, no integrity self-check, no anti-debug. On macOS, code signing
  (chapter 7) detects modification of a *signed* bundle at load time, but that is the OS, not Zinc, and it does not
  stop someone re-signing their own copy. Byte-identical program output is a design requirement, so obfuscation never
  changes behaviour and never adds runtime integrity checks.

Use `--obfuscate` + stripping to keep honest people honest and to avoid trivially leaking strings — not as a security
boundary. The only reliable protection for a secret is to not ship it.
