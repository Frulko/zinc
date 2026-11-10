# Packaging (ZN-053)

One download per OS; nothing else to install. `tools/package` builds it from `build/zinc`.

| OS | Package | Contents | Size (budget) |
|---|---|---|---|
| macOS | `Zinc-<version>-macos-<arch>.zip` with `Zinc Atelier.app` | `Contents/MacOS/zinc` (the engine and CLI), `zinc-atelier` (launcher of the app on `~/Zinc`), `Frameworks/libSDL3.0.dylib`, `Resources/zinc/{next,lib,plugins}` | **4.4 MB** (40 MB), measured on arm64 |
| Linux | `zinc-<version>-linux-<arch>.tar.gz`, and the AppImage when `appimagetool` is installed (`tools/appimage`) | `bin/zinc`, `lib/` (SDL3), `share/zinc/{next,lib,plugins}` | budget 40 MB, not measured here (the script has not run on Linux yet) |
| Windows | with the Windows host (ZN-054) | | budget to set then |

`share/zinc/` (`Resources/zinc/` in the app) mirrors the repository: `include` and `src` and `third_party/mimalloc` (what a cross build compiles), `firmware/esp32/prebuilt`
(the core image), `app/atelier`, `lib/std`, `lib/fonts`, and the Zinc sources of the plugins. The binary finds it with `zn::tc::sourceRoot`: `$ZINC_ROOT`, else beside the executable
(`../share/zinc/next`, `../Resources/zinc/next`), else the checkout it was built in. `zinc --root` prints which. The pinned tools (zig, QEMU for ESP32, esptool) are not in the package: they are
downloaded on first use, checksum verified, into `~/.zinc` (`zinc-next-toolchain.md`), which keeps the package small.

## On a clean machine

`tests/t2/package.sh` unpacks the package with an empty HOME, `PATH=/usr/bin:/bin` and no `ZINC_*` variable, then: checks the engine files come from the package, runs a program, opens the app
headless and takes a frame, builds a program for a Raspberry Pi (`--target aarch64-linux`, zig downloaded), builds one for this machine **without a C++ compiler** (the pinned zig does it, no graphics
host in that path), and runs a program on the emulated ESP32 (QEMU downloaded). It passes on macOS arm64 (about 40 s with the downloads). Programs that draw still need a C++ compiler for
`zinc build` on the machine (the graphics host is built into the engine, not cross compiled), and say so.

## Opening archives (ZN-391)

`tools/package` compiles `src/app/atelier_launcher_macos.m` with the system AppKit and the engine's deployment floor. Its delegate receives `application:openFiles:` and launches the sibling `zinc` with the argument array `run`, archive path. The initial document event suppresses the ordinary Atelier launch; subsequent events launch their archives while the launcher tracks actual `NSTask` objects. One enum controls startup, running and stopping; child completion is handled on the main thread, and application termination stops its children. Direct file arguments and headless Atelier launches use `execv`, preserving exit codes and standard streams. The bundle exports `dev.zinc.zapp` (conforming to `public.data`) and a Viewer/Owner document claim.

Linux packages carry `tools/desktop/zinc-zapp.xml` and `zinc-zapp.desktop`. Installation copies them to the user's XDG data directory independently of `--atelier`, writes an escaped absolute engine path in `Exec`, and runs available cache tools. No default application is overwritten. AppImage's `AppRun` forwards file arguments to its bundled engine.

The exact T0 is `tests/run --only zapp_desktop`: plist/MIME/desktop expectations, a temporary installer release, literal file arguments, native exit codes, invalid transitions and child cleanup. It also uses `xmllint`, `desktop-file-validate` and `update-mime-database` when installed. The bounded macOS feature proof used a disposable bundle with a unique ID, `NSWorkspaceOpenConfiguration.appleEvent` for a cold open, two PID-targeted later events, real packed programs and marker files. LaunchServices resolved the filename UTI and listed the bundle as a Viewer; unregistering it left the previous default unchanged. The disposable bundle must be outside `NSTemporaryDirectory`: macOS delivered events there but excluded it from the handler inventory.

## Signing, notarization, updates

- `tools/sign-macos [--dry-run] <zip>`: signs the dylibs, the binary and the bundle with the hardened runtime (`ZINC_SIGN_IDENTITY`), submits to Apple and waits (`ZINC_NOTARY_PROFILE`), staples
  the ticket, checks with `spctl`, and writes `...-notarized.zip`. `--dry-run` prints each command (tested by `tests/t0/package.sh`). It has **not** been run against Apple's service: it needs a
  Developer ID certificate and a notarytool profile, which this machine does not have. `tools/package` signs ad hoc (needed for arm64 to load the modified binary) so the unsigned package runs
  locally.
- `zinc update [--check] <manifest-url>` (or `ZINC_UPDATE_URL`): the manifest is `key=value` lines (`version`, `url`, `sha256`, `notes`). `--check` exits 10 when a newer release exists; without it the
  archive is downloaded to `~/.zinc/updates`, its SHA-256 compared to the manifest before it is kept (a mismatch is deleted), and the user is told how to install it. Replacing the running app
  is left to the user (drag the app, unpack the tar). The pins of zig, QEMU and esptool are compiled into each release, so a new release is how they update.
- **Signed manifests (ZN-149):** the manifest carries `sig=<128 hex>`, an Ed25519 signature (RFC 8032, Monocypher 4.0.2 in `third_party/monocypher`; checked against OpenSSL) of the manifest text without that line. `zinc update` refuses an unsigned manifest, a changed line, a signature of another key and a malformed signature, and refuses everything when no key is trusted: the trusted public keys are `$ZINC_UPDATE_PUBKEY`, the lines of `~/.zinc/update-keys` and the release key compiled in (`kReleaseKeys` in `src/tc/tc.cpp`, empty until the first signed release). A release is signed with `zinc update-keygen` (once; the seed stays secret) and `zinc update-sign manifest.txt <seed>`. `tests/t0/update_sign.sh` covers the cases.

## Not covered

Windows and Linux packages have not been built or run (no such machine here); the Linux script is written to mirror the macOS one. SDL3 is bundled from the Homebrew install and not yet vendored
(`third_party/README.md`); a release build should link a pinned SDL3. The update manifest has no server yet and is not signed beyond the checksum of the download.

## TLS and crypto: binary size (ZN-089)

mbedTLS 4.0.0 with TF-PSA-Crypto (`third_party/mbedtls`, default configuration, TLS 1.2 and 1.3, X.509, PSA crypto) backs https in `zinc:net`, TLS in
`zinc:mqtt`, an https `serve()` and `crypto.subtle`. Measured on macOS arm64, release flags of the default CMake build, same tree, `-DZN_TLS=OFF` against ON:

| `zinc` binary | TLS off | TLS on | difference |
|---|---|---|---|
| as built | 4 414 136 B | 5 321 656 B | +907 520 B (+20.6 %) |
| `strip -x` | 4 038 488 B | 4 793 488 B | +755 000 B (+18.7 %) |

The library archive is 1.2 MB before the linker drops what is not used. `ZN_TLS=OFF` replaces the TLS and crypto entry points with stubs that fail with a message, so
a profile without a network (or without need of it) keeps the smaller binary. Programs compiled ahead of time link the host library when they use any host module and
get the same +750 KB until the host rows are split into separately linked parts (open item for ZN-136). The configuration is not trimmed yet: a stripped mbedTLS
configuration (client and server, ECDHE and RSA verification, AES-GCM and ChaCha20-Poly1305, SHA-2) is expected to save a third of that.


## Native host split: partial Mac gate (ZN-164, 2026-11-10)

The existing lite system host already omitted TLS, llhttp and pack writing. It now
also contains the loop compiled without Zinc OSC/DNS transport callers. OSC rows
(including a close-only call or calls in nested workers) select the full host.
Archive names, native plugin host declarations and mobile host source cloning stay
unchanged. OSC receiver liveness uses the loop's existing active counter.

Same-source native arm64 artifacts, Apple clang 17, normal `-O2` and dead strip,
with `ZN_KEEP_SYMBOLS=1` in both columns:

| Program | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| `console.log('hello')` (no host) | 285,992 B | 285,992 B | 0 B |
| `Date.now()` and a one-shot timer | 4,797,832 B | 4,778,520 B | 19,312 B |
| File write/read and child-process output | 4,798,736 B | 4,795,936 B | 2,800 B |

The retained-symbol Mac arm64 gates in `tests/t0/lite_host.sh` are 300,000 B for
hello and 5,000,000 B for the hosted timer. It checks that Zinc OSC/DNS entry points,
`uv_getaddrinfo`, llhttp and Mbed TLS are absent; its fetch program retains TLS.
These are scoped transport-reference gates, **not a socket-free host claim**.

Link maps change `loop.cpp.o` from `libzn_host_gfx.a` to
`libzn_host_sys_lite.a`; `osc.cpp.o` and libuv's `getaddrinfo.c.o` disappear.
`nm` confirms the Zinc OSC codec/transport and DNS resolver symbols disappear.
`otool -L` dependencies are unchanged, including existing graphics frameworks in
the hosted artifacts. Static dependency removal is not a dynamic-library saving.

AC2 remains open: libuv's `uv_close` in `src/unix/core.c` directly references
`uv__tcp_close` and `uv__udp_close`; its common stream code references TCP helpers.
The resulting hosted binaries still contain `uv__tcp_*` and `uv__udp_*` internals,
including UDP send helpers. Splitting the Zinc objects cannot remove that edge.
No weak stand-in, alternate scheduler or patched libuv was introduced. Separate
regexp/crypto/etc. row selection and the no-POSIX-sockets option remain unfinished.
AC1 remains open: no armv6 or ESP32 build or size gate was run in this Mac pass.

Compatibility proof: the original Hero native executable is 7,978,168 B and its
57 generated C++ units, shared header and PCH driver total 9,537,290 B, below the
unchanged 8,000,000/10,000,000 B gates. Its four headless frame hashes match the
existing reference. Timers and file/process output pass before and after. OSC
repeated listen on ephemeral port 0, repeated close, DNS send and enforced network
permission refusal pass on native AOT, interpreter and QuickJS. Fetch still links
TLS/llhttp and reports refusal from localhost port 1. No timing claim is made.

Baseline: source `0e8bd9b90` (engine sources identical to base `d35a8eef7`),
read-only common compiler SHA-256
`3ec59faa23598f799be9caf7f1263cdf7fc52780ced417991d2c50607f50d8d5`.
Worker evidence: `.logs/164/{before,after}/provenance.json`, maps, nm/size/otool
outputs and bounded execution logs. The exact `aot_embedded_blob` T0 passes with
all three OSC rows and nested-worker classification. The expanded `lite_host`
script is proposed for integration; equivalent artifact checks passed directly.

References: [CMake archive object linking](https://cmake.org/cmake/help/latest/command/target_link_libraries.html#linking-object-libraries),
[ld64 atom/dead-strip model](https://github.com/apple-oss-distributions/ld64/blob/main/doc/design/linker.html),
[libuv handle close semantics](https://docs.libuv.org/en/stable/handle.html).
