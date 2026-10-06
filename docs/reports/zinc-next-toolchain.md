# Zinc Next: the toolchain manager

`zinc build` writes C++ from the bytecode and a C++ compiler turns it into a program. The user never installs that compiler: `zig c++` is
a hidden toolchain, pinned and downloaded on demand.

```
zinc build prog.ts -o prog                          # this machine: the compiler found as `c++` ($CXX)
zinc build --target aarch64-linux prog.ts -o prog   # another machine: the pinned zig, downloaded the first time
zinc toolchain targets | install | path | sha256 <file>
```

Targets: `aarch64-linux`, `armhf-linux` (32-bit Raspberry Pi OS, `-mcpu=arm1176jzf_s`, so it runs on the first Pi too), `x86_64-linux`,
`aarch64-macos`, `x86_64-macos`. The program is linked dynamically against the glibc of the target (zig brings the headers and stubs).

## How the download is trusted

1. The version (0.15.2) and the SHA-256 of the archive of each host (macOS and Linux, aarch64 and x86_64) are in `src/tc/tc.cpp`, taken
   from <https://ziglang.org/download/index.json>.
2. The archive is fetched with `curl` into a `.part` file, hashed (`third_party/sha256`, public domain), and compared with the pin. On a
   mismatch it is deleted and nothing is unpacked (`tests/t0/tc.sh` checks this with a tampered archive from a local mirror).
3. Only then is it unpacked (`tar`) into `~/.zinc/toolchains/zig-<host>-0.15.2/` and moved into place; the checked hash is recorded next
   to the binary in `SHA256`.

The runtime for the target (`src/rt`, `src/zbc`, mimalloc) is compiled by that zig and cached as objects in `~/.zinc/cache/<target>/`,
keyed by the hash of each source and the sizes of the headers: the first build of a target takes about 20 s, later ones are the program only.

Environment: `ZINC_HOME` (default `~/.zinc`), `ZINC_ZIG` (a zig of your own, for development), `ZINC_TC_MIRROR` (a base URL or `file://`
directory for the downloads: an offline mirror, or the test).

## Checked

`tests/t2/cross.sh` builds `fib` for `aarch64-linux` on a clean home (download, checksum, cross build) and checks the ELF header
(AArch64). The result also ran in an arm64 Linux container (Docker only to run it, never to build it). The sources of the engine are read
from the repository (`ZN_SOURCE_DIR`); shipping them with a packaged `zinc` belongs to the single-app packaging decision (ZN-031).

## Not covered yet

Windows hosts and targets, musl (static) programs, ESP-IDF, PS1 and PS2 (their own toolchains), the graphics host for a target (the
runtime that draws is built for the machine running `zinc`), signing of the pins beyond the checksum, and an offline bundle.
