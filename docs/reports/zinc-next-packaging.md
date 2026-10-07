# Packaging (ZN-053)

One download per OS; nothing else to install. `tools/package` builds it from `build/zinc`.

| OS | Package | Contents | Size (budget) |
|---|---|---|---|
| macOS | `Zinc-<version>-macos-<arch>.zip` with `Zinc Atelier.app` | `Contents/MacOS/zinc` (the engine and CLI), `zinc-atelier` (launcher of the app on `~/Zinc`), `Frameworks/libSDL3.0.dylib`, `Resources/zinc/{next,lib,plugins}` | **4.4 MB** (40 MB), measured on arm64 |
| Linux | `zinc-<version>-linux-<arch>.tar.gz`, and the AppImage when `appimagetool` is installed (`tools/appimage`) | `bin/zinc`, `lib/` (SDL3), `share/zinc/{next,lib,plugins}` | budget 40 MB, not measured here (the script has not run on Linux yet) |
| Windows | with the Windows host (ZN-054) | | budget to set then |

`share/zinc/` (`Resources/zinc/` in the app) mirrors the repository: `next/include` and `next/src` and `next/third_party/mimalloc` (what a cross build compiles), `next/firmware/esp32/prebuilt`
(the core image), `next/app/atelier`, `lib/std`, `lib/fonts`, and the Zinc sources of the plugins. The binary finds it with `zn::tc::sourceRoot`: `$ZINC_ROOT`, else beside the executable
(`../share/zinc/next`, `../Resources/zinc/next`), else the checkout it was built in. `zinc --root` prints which. The pinned tools (zig, QEMU for ESP32, esptool) are not in the package: they are
downloaded on first use, checksum verified, into `~/.zinc` (`zinc-next-toolchain.md`), which keeps the package small.

## On a clean machine

`tests/t2/package.sh` unpacks the package with an empty HOME, `PATH=/usr/bin:/bin` and no `ZINC_*` variable, then: checks the engine files come from the package, runs a program, opens the app
headless and takes a frame, builds a program for a Raspberry Pi (`--target aarch64-linux`, zig downloaded), builds one for this machine **without a C++ compiler** (the pinned zig does it, no graphics
host in that path), and runs a program on the emulated ESP32 (QEMU downloaded). It passes on macOS arm64 (about 40 s with the downloads). Programs that draw still need a C++ compiler for
`zinc build` on the machine (the graphics host is built into the engine, not cross compiled), and say so.

## Signing, notarization, updates

- `tools/sign-macos [--dry-run] <zip>`: signs the dylibs, the binary and the bundle with the hardened runtime (`ZINC_SIGN_IDENTITY`), submits to Apple and waits (`ZINC_NOTARY_PROFILE`), staples
  the ticket, checks with `spctl`, and writes `...-notarized.zip`. `--dry-run` prints each command (tested by `tests/t0/package.sh`). It has **not** been run against Apple's service: it needs a
  Developer ID certificate and a notarytool profile, which this machine does not have. `tools/package` signs ad hoc (needed for arm64 to load the modified binary) so the unsigned package runs
  locally.
- `zinc update [--check] <manifest-url>` (or `ZINC_UPDATE_URL`): the manifest is `key=value` lines (`version`, `url`, `sha256`, `notes`). `--check` exits 10 when a newer release exists; without it the
  archive is downloaded to `~/.zinc/updates`, its SHA-256 compared to the manifest before it is kept (a mismatch is deleted), and the user is told how to install it. Replacing the running app
  is left to the user (drag the app, unpack the tar). The pins of zig, QEMU and esptool are compiled into each release, so a new release is how they update.

## Not covered

Windows and Linux packages have not been built or run (no such machine here); the Linux script is written to mirror the macOS one. SDL3 is bundled from the Homebrew install and not yet vendored
(`third_party/README.md`); a release build should link a pinned SDL3. The update manifest has no server yet and is not signed beyond the checksum of the download.

## TLS and crypto: binary size (ZN-089)

mbedTLS 4.0.0 with TF-PSA-Crypto (`next/third_party/mbedtls`, default configuration, TLS 1.2 and 1.3, X.509, PSA crypto) backs https in `zinc:net`, TLS in
`zinc:mqtt`, an https `serve()` and `crypto.subtle`. Measured on macOS arm64, release flags of the default CMake build, same tree, `-DZN_TLS=OFF` against ON:

| `zinc` binary | TLS off | TLS on | difference |
|---|---|---|---|
| as built | 4 414 136 B | 5 321 656 B | +907 520 B (+20.6 %) |
| `strip -x` | 4 038 488 B | 4 793 488 B | +755 000 B (+18.7 %) |

The library archive is 1.2 MB before the linker drops what is not used. `ZN_TLS=OFF` replaces the TLS and crypto entry points with stubs that fail with a message, so
a profile without a network (or without need of it) keeps the smaller binary. Programs compiled ahead of time link the host library when they use any host module and
get the same +750 KB until the host rows are split into separately linked parts (open item for ZN-136). The configuration is not trimmed yet: a stripped mbedTLS
configuration (client and server, ECDHE and RSA verification, AES-GCM and ChaCha20-Poly1305, SHA-2) is expected to save a third of that.
