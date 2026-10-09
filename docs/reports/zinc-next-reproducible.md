# Reproducible builds of zinc and of plugins (ZN-333)

Goal: the same commit gives the same bytes, wherever and whenever it is built, so a rebuilder (ZN-341) or a binary cache
(ZN-337) can compare by hash. Checked on macOS arm64 (Apple clang for zinc, the pinned zig 0.15.2 for plugins) and in an
arm64 `ubuntu:24.04` container for the plugin keys (ZN-332).

## What is identical today

| Artifact | How it is built | Checked by |
| --- | --- | --- |
| `zinc`, `libzn_webgl.dylib` | `cmake -DCMAKE_BUILD_TYPE=Release -DZN_REPRODUCIBLE=ON`, two checkouts in two directories, built one after the other | the `reproducible` job of `.github/workflows/zinc-next.yml` |
| plugin libraries (`plugin.dylib` / `.so`, `plugin.a`, `vendor.a`) | `zinc plugin-build <p>`, two directories, two `ZINC_HOME`s, a second apart | `tests/t1/plugin_repro.sh` (device, svg), the CI job (device, sqlite, svg) |
| plugin archive | `zinc plugin-build <p> [project] --pack <file.tar>`: `<target>/plugin.*`, `<target>/vendor.a`, `<target>/key` | the same |

## The flags and choices

| Where | What | Why |
| --- | --- | --- |
| every target of `next/CMakeLists.txt` | `-ffile-prefix-map=<build dir>=build`, `-ffile-prefix-map=<checkout>=zinc` | `__FILE__` (mbedTLS's debug and assert strings, SDL3) named the checkout; the compiler compares prefixes as text, so the checkout is passed without `..` |
| `zinc` | `-DZN_REPRODUCIBLE=ON`: `ZN_SOURCE_DIR` is empty | a build-tree zinc finds its engine files through the path of the checkout compiled in; a release finds them in its package (`share/zinc`, `Resources/zinc`) or `$ZINC_ROOT`. Off by default: the dev build and its devapp copy (ZN-231) keep finding the checkout |
| `zinc` | `ZN_HOST_LIBS` writes the vendored `libSDL3.a` as `@bin@/third_party/SDL3/libSDL3.a`, `ZN_SDL_INCLUDE` as `@root@/third_party/SDL3/include` | filled in at run time with the directory of zinc and with the engine files |
| plugins (zig) | `-ffile-prefix-map` for the plugin directory (`plugins/<name>`), the cache entry (`cache`), the checkout (`zinc`) and the toolchains (`toolchains`) | object files named their source and the generated thunk by absolute path |
| plugins (macOS link) | `-Wl,-install_name,@rpath/plugin.dylib` | the install name was the absolute path of the cache entry, and the UUID and signature followed it |
| plugins (macOS link) | `-Wl,-S` | the linker's debug map (`N_OSO` stabs) named each object with its path and modification time |
| plugins | the pinned zig, `zig ar` (deterministic: no timestamps, owner 0) | the system compiler and `ar` differ per machine (ZN-332) |
| plugins (Linux) | every zig call runs with `ZIG_LIB_DIR=/tmp/zinc-zig-<version>-lib`, a link to the pinned zig's `lib/` | zig compiles libc++, libc++abi and libunwind into each Linux `.so` and writes their source paths (assert and `__PRETTY_FUNCTION__` strings) under its lib directory, which sits in `ZINC_HOME`; through the fixed link the bytes no longer depend on it. macOS plugins link the system libc++ and carry none of it |
| archives | ustar written by `src/zapp.cpp`: sorted names, mtime 0, uid/gid 0, mode 0644 / 0755 | the same writer as `.zapp` (ZN-318) and `.deb` (ZN-320.01) |

The plugin cache key (ZN-332) already names nothing of the machine: sources by relative path and content, flags as
written, the ABI headers, the zig version and the target triple.

## What breaks reproducibility

- A path of this machine in a compile command that is not under one of the mapped prefixes (a `-I` to a directory outside the
  checkout, a system library's `pkg-config --cflags`): plugins that need system libraries (`pkg`) are reproducible only
  against the same sysroot (ZN-334).
- `__DATE__`, `__TIME__` or a build timestamp: none in zinc or the plugins today; `SOURCE_DATE_EPOCH` is honoured by the SBOM
  (ZN-323).
- A different compiler: zinc is built by the system C++ compiler, so two machines with different Xcode or GCC versions give
  different zinc binaries; plugins use the pinned zig and do not depend on it.
- Parallel or unordered inputs: directory listings are sorted wherever they feed a build (plugin headers in the key, the
  archive members).
- The macOS code signature: the linker's ad-hoc signature is deterministic; a Developer ID signature (`tools/sign-macos`)
  carries a timestamp and is not, so compare before signing.
- Debug builds: `-g` writes the object paths again (the prefix maps cover the source paths, not the debug map of the macOS
  linker); compare Release builds.

## Not covered yet

- zinc itself built twice on two different machines (the CI job builds twice on one runner).
- Linux builds of zinc in CI (the Linux job needs SDL3's X11 packages, ZN-331) and `ZN_HOST_GFX=OFF` (ZN-395).
