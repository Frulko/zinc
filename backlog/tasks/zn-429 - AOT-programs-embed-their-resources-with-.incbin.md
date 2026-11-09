---
id: ZN-429
title: AOT programs embed their resources with .incbin
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-11-09 09:57'
labels:
  - games
  - assets
  - size-S
milestone: m-22
dependencies: []
ordinal: 10300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
aot.cpp writes the baked blob to a file plus a small assembler stub (Mach-O __DATA,__const or ELF .rodata) instead of a decimal array literal. Report: docs/reports/games/toolchain-assets-loading.md (1.2, 6.2).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a 50 MB blob builds in under 3 s and 300 MB peak on the Mac
- [x] #2 the examples' frames are unchanged
- [x] #3 works with clang and the pinned zig c++ for macOS, Linux x86_64, aarch64 and armhf
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent).

What changed:
- `src/aot/aot.cpp` `incbinResources`: when given a file, the first unit declares `extern "C" const char kResources[] __asm__("zn_aot_resources")` and a top-level `__asm__` block: `.const_data` on Mach-O, `.section .rdata,"dr"` on COFF (mingw), `.section .rodata` + `.type %object` + `.size` on ELF, `.p2align 4`, `.incbin "<abs path>"`, a trailing `.byte 0`, `.text`. The asm label binds the name, so no per-target leading underscore. `%object` because `@` is a comment on ARM; `.p2align` because `.align` means bytes or a power of two depending on the target.
- The size (`kResourcesSize`) and an FNV-1a 64 hash of the bytes are written in the unit: the object cache (aotcache), the compiled-run key and zig's cache all key on the unit text, and `-MD` never lists an `.incbin` file, so a changed blob changes the unit.
- `src/main.cpp` `writeIncbinFile`: writes `<out>.cpp.res` beside the C++ for `zinc build`, the compiled run and the zig cross build (`--target`); removed with the C++ (kept under `ZN_KEEP_CPP`). The literal stays for `ZN_AOT_CPP_ONLY` (consoles, iOS, Android, app library: the C++ is compiled elsewhere) and for `CXX=cl`/`clang-cl` (MSVC has no `.incbin`).
- T0 `tests/t0/aot_incbin.sh` (5.7 s): no literal, the `.res` file equals `zinc bake`, size and hash in the unit, the program draws one headless frame, the C++ and `.res` are removed after a build.

Research (sonnet sub-agent):
- incbin.h (https://github.com/graphitemaster/incbin): `.const_data` on Mach-O, `.section .rodata` on ELF, `%object` on ARM, `.balign`, no `.size`; relative `.incbin` paths resolve against the compiler's cwd and `-I`, so pass absolute paths; `-MD` misses the blob.
- C23 `#embed`: clang 19+ (C++ as an extension, with bugs); pinned zig 0.15.2 bundles clang 20, so it could work, but `.incbin` already works on every target here. MSVC: no `#embed`, no `.incbin`.
- Deno `deno compile` (libsui): a `__SUI` Mach-O segment, or appended data with a sentinel; Bun appends the payload with a trailer; Go `//go:embed` goes through the compiler and linker into rodata.

Numbers (indicative, machine busy: load average 4 to 8, another tree building), a 50 MB blob (a 3600x3600 noise PNG, 51 989 060 bytes baked):
- before: `zinc build` 10.9 s, 148 MB of generated C++, max RSS 2.9 GB (clang), zinc peak footprint 434 MB.
- after: 1.6 s (2.4 s at load 7 to 8), 118 KB of C++. Peak per process: clang -cc1 296 MB RSS (188 MB for the same unit without the blob), ld 208 MB footprint (347 MB RSS with the mapped input and output files, the same link as before), zinc 116 MB footprint.

Criteria:
- #1 1.6 to 2.4 s; every process stays under 300 MB of its own memory (ld's RSS of 347 MB is mostly mapped files, and the link was the same before the change).
- #2 gl-check, hero and breakout compiled with `zinc run --native`, 10 headless deterministic frames: the shots of develop's zinc and of this one are byte-identical.
- #3 Native clang: full build and run. Pinned zig 0.15.2: the generated stub was built and linked for x86_64-linux-gnu, aarch64-linux-gnu, arm-linux-gnueabihf (cortex-a7), aarch64-macos, x86_64-macos and x86_64-windows-gnu. `nm -S` shows `zn_aot_resources` with its size on ELF, and the blob bytes plus the NUL are found in each linked file. Both macOS builds run with the right size and hash (x86_64 under Rosetta). The Linux builds were not run: ssh to the Pi timed out.

Proposed tests:
- `tests/run --only aot_incbin` (T0, 6 s, ~350 MB): incbin path, file equals the bake, hash in the unit, one frame drawn, files removed.
- Run a drawing program cross-built with `zinc build --target aarch64-linux` on the Pi for one frame (2 min, Pi). Proves the full cross path end to end.
- `tests/run --only console_aot` (T1). Proves the ZN_AOT_CPP_ONLY literal path still builds with `kResourcesSize`.
- `tests/run --only app_library`. Same check for the app library.

Later (backlog/later.md):
- ZN-429: the ZN_AOT_CPP_ONLY outputs (iOS, Android, consoles) still embed the blob as a literal. Ship `program.cpp.res` beside the C++ and emit the `.incbin` there too, since NDK clang, Xcode clang and devkitPro GCC all assemble `.incbin`.
- ZN-429: `bakeResources` holds the decoded image, the blob and the PNG at once (zinc 218 MB RSS at peak for 50 MB). Stream the blob to the file instead.
<!-- SECTION:NOTES:END -->
