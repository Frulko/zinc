# Zinc Next: the toolchain manager

`zinc build` writes C++ from the bytecode and a C++ compiler turns it into a program. The user never installs that compiler: `zig c++` is
a hidden toolchain, pinned and downloaded on demand.

```
zinc build prog.ts -o prog                          # this machine: the compiler found as `c++` ($CXX)
zinc build --target aarch64-linux prog.ts -o prog   # another machine: the pinned zig, downloaded the first time
zinc toolchain targets | install | path | sha256 <file>
```

Targets: `aarch64-linux`, `armhf-linux` (32-bit Raspberry Pi OS, `-mcpu=arm1176jzf_s`, so it runs on the first Pi too), `armv7-linux`
(`-mcpu=cortex_a8+neon`, ARMv7, NEON and VFPv3, hard-float calls), `x86_64-linux`,
`aarch64-macos`, `x86_64-macos`. The program is linked dynamically against the glibc of the target (zig brings the headers and stubs).

## How the download is trusted

1. The version (0.15.2) and the SHA-256 of the archive of each host (macOS and Linux, aarch64 and x86_64) are in `src/tc/tc.cpp`, taken
   from <https://ziglang.org/download/index.json>.
2. The archive is fetched with `curl` into a `.part` file, hashed (`third_party/sha256`, public domain), and compared with the pin. On a
   mismatch it is deleted and nothing is unpacked (`tests/t0/tc.sh` checks this with a tampered archive from a local mirror).
3. Only then is it unpacked (`tar`) into `~/.zinc/toolchains/zig-<host>-0.15.2/` and moved into place; the checked hash is recorded next
   to the binary in `SHA256`.

The runtime for the target (`src/rt`, `src/zbc`, mimalloc) is compiled by that zig and cached as objects in `~/.zinc/cache/<target>/`,
keyed by each source hash, compiler flags and the sizes of the headers: changing a target's CPU features rebuilds its runtime objects.
Zig 0.15.2's [NEON feature depends on VFPv3](https://github.com/ziglang/zig/blob/0.15.2/lib/std/Target/arm.zig#L867-L873), so `+vfp3` is redundant.
The deferred `cross_linux` check uses GNU `readelf -A` (`READELF` selects its path) to verify ARMv7, VFPv3 and NEONv1,
and `-h` for the executable's EABI5 hard-float flag. LLD can omit `Tag_ABI_VFP_args` from linked output;
on objects, `Tag_ABI_VFP_args: VFP registers` identifies the hard-float calling convention.

Environment: `ZINC_HOME` (default `~/.zinc`), `ZINC_ZIG` (a zig of your own, for development), `ZINC_TC_MIRROR` (a base URL or `file://`
directory for the downloads: an offline mirror, or the test).

## Checked

`tests/t2/cross.sh` builds `fib` for `aarch64-linux` on a clean home (download, checksum, cross build) and checks the ELF header
(AArch64). The result also ran in an arm64 Linux container (Docker only to run it, never to build it). The sources of the engine are read
from the repository (`ZN_SOURCE_DIR`); shipping them with a packaged `zinc` belongs to the single-app packaging decision (ZN-031).

## Not covered yet

Windows hosts and targets, musl (static) programs, ESP-IDF, PS1 (its own toolchain; the PSP, Vita, PS2 and 3DS SDKs are pinned in src/tc/consoles.cpp, ZN-456), the graphics host for a target (the
runtime that draws is built for the machine running `zinc`), signing of the pins beyond the checksum, and an offline bundle.

## Galène server (ZN-895)

`zinc toolchain install galene` installs the server binary under
`$ZINC_HOME/toolchains/galene-<host>-1.2.1/` and prints its executable path. It uses
`fetchTool`'s existing SHA-256 check, file lock, atomic directory move and cache.
`ZINC_TC_MIRROR=file:///absolute/path` substitutes the release directory;
`ZINC_OFFLINE=1` refuses network sources. The pins and the Zinc release URL
(`https://github.com/Frulko/zinc/releases/download/galene-1.2.1/`) are in
`src/tc/tc.cpp`. The owner publishes those assets separately; until then use a
local mirror of the build output. There is no server, account or service setup.

```sh
ZINC=build/zinc tools/build-galene --verify
ZINC_OFFLINE=1 ZINC_TC_MIRROR="file://$PWD/dist/galene" build/zinc toolchain install galene
ZINC=build/zinc ZINC_GALENE_TEST_ARCHIVE="$PWD/dist/galene/galene-1.2.1-darwin-arm64.tar.gz" tests/run --only galene_toolchain
```

The builder cross-compiles `darwin-arm64`, `linux-arm64`, `linux-armv7` (`GOARM=7`)
and `linux-amd64` (`GOAMD64=v1`) sequentially. Targets may be named after the
options to build only those; `--out DIR` changes the output directory. A build
host may be Darwin/Linux arm64/amd64. Python 3, an existing Zinc and network
access on the first build are sufficient: the existing `toolchain fetch`
installs the pinned Go SDK and sources in Zinc's toolchain/cache directories.
Nothing is installed system-wide or vendored into the engine.

Source: upstream MIT tag [`galene-1.2.1`](https://github.com/jech/galene/tree/galene-1.2.1),
source tar SHA-256 `230db9843995f6776b885cf7cb88d7de241abefc634e7845e20ce001fcdefd1a`.
Its `go.mod` requires Go 1.24.0. The compiler is pinned to maintained Go 1.26.10
with [official archive checksums](https://go.dev/dl/?mode=json&include=all).
The builder checks its exact version, disables user Go settings/workspaces and
[automatic toolchain downloads](https://go.dev/doc/toolchain), and uses the
upstream `go.sum` with `-mod=readonly` and the Go checksum database for modules.

The [upstream build](https://galene.org/galene-install.html) uses
`CGO_ENABLED=0 -ldflags='-s -w'`. We add `-trimpath` to remove machine/source
paths and `-buildvcs=false` to remove checkout metadata. Go parallelism is
bounded to two processes/threads. `--verify` rebuilds from two separate source
paths (with the shared Go build cache) and compares the complete archives.
Tar entries have fixed ordering, ownership, mode and timestamps; gzip has no
filename or timestamp. Each archive contains `galene`, upstream `LICENCE`, the
Go and linked module licence notices, and `PROVENANCE.json` (source/compiler
pins, flags, module versions and binary hash/bytes). No web client assets are
included. `SHA256SUMS` and per-binary/archive byte counts are printed/written.

The local-only T0 test checks deterministic archive metadata, target validation,
a corrupt archive rejected before extraction, the real pinned archive installed
from a file URL, cache reuse after removing the source and a missing local source.
It needs the matching release archive from `--verify` (`ZINC_GALENE_TEST_ARCHIVE`,
else `dist/galene/<host archive>`); without it the install proof is skipped with
exit 77, never downloaded. Server startup, idle RSS and call quality require
separate, owner-chosen runs on a quiet machine.
