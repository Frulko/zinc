---
id: ZN-334
title: Cross builds fetch the pinned Linux sysroot by themselves
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-11-10 21:24'
labels:
  - distribution
  - toolchain
  - size-M
milestone: m-19
dependencies:
  - ZN-332
ordinal: 51900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Description: tools/linux-sysroot already pins Debian packages by sha256; make `zinc plugin-build`/`zinc export --target rpi|rpi1|linux` run that fetch when $ZINC_HOME/sysroots/<target> is missing and say so in `zinc doctor`. Criteria: (1) on a Mac with an empty ZINC_HOME `zinc export --target rpi` of a display-gl app succeeds with no manual step; (2) a changed archive is refused (test with ZINC_SYSROOT_MIRROR); (3) doctor lists the sysroots. Already there: tools/linux-sysroot, tools/linux-sysroot.lock (Debian bookworm snapshot, sha256 per package, EGL/GLES/GBM/DRM/X11); src/tc/plugin_build.cpp:400-445; docs/targets/linux.md:64.

zig gives the libc, not mesa or libdrm: display-gl for rpi/rpi1/linux cannot be cross built from macOS (pkg-config check fails). The toolchain manager fetches a pinned, checksum-verified sysroot per target (Debian bookworm and trixie: armhf, arm64, x86_64, with the -dev packages plugin.json `pkg` names), the same way as zig, and the plugin build points pkg-config at it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 on macOS with nothing installed, `zinc plugin-build display-gl` for rpi (aarch64) and rpi1 (armhf) succeeds
- [x] #2 the sysroots are pinned by sha256 in src/tc, listed in third_party/README.md style with their sources and licences, and a changed archive is refused
- [x] #3 `zinc export --target rpi` of a display-gl UI app succeeds on macOS
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12 (owner session, Pi 3B+ plugged in): stopgap in place. A cross build now points pkg-config at $ZINC_HOME/sysroots/<target> (src/tc/plugin_build.cpp) and links with --allow-shlib-undefined; the directory is filled by hand from the device (recipe in docs/reports/raspberry-pi.md, last section). hero (zinc:video, FFmpeg) exports for rpi and runs on the Pi with it. Still to do here: the pinned, checksum-verified sysroot fetched by the toolchain manager, and the EGL/GLES/GBM/DRM packages for display-gl (AC 1 to 3 unchanged).
Review 2026-10-25: done-partly. The pinned, checksum-verified sysroot exists as a script and plugin-build already points pkg-config at it. Left: the toolchain manager (zinc plugin-build / export) fetches it by itself when a cross build needs it, the pin lives where `zinc doctor` sees it, and display-gl for rpi/rpi1 exports on a Mac with nothing installed. Evidence: tools/linux-sysroot, tools/linux-sysroot.lock (Debian bookworm snapshot, sha256 per package, EGL/GLES/GBM/DRM/X11); src/tc/plugin_build.cpp:400-445; docs/targets/linux.md:64

2026-11-10 worker implementation (base d3fc22b57, including the coordinator’s ZN-1121 blocker fix): canonical Debian bookworm snapshot pins now live only in src/tc/linux-sysroot.lock, shipped with tools/linux-sysroot by the actual package payload. Cross plugin builds prepare missing/incomplete managed Linux roots before fast-stamp reuse, use the target pkg-config environment for build and dependency stamps, clear inherited PKG_CONFIG_PATH, and include pin identity/receipt in their caches. Existing unmarked manual roots remain supplied by the user. Doctor inventories roots without fetching (short and --details reports).

The existing Python fetcher retains archive SHA-256 verification and Debian copyright files. Installs take a per-architecture flock, extract into sibling generations, write a completed receipt, and atomically replace the managed root link. Existing generations and manual extras are retained; deterministic .previous recovers an interrupted first directory migration. Cached armhf installs repair the armv7 alias. Standard tarfile handles the archives; per-entry realpath containment also protects the stock Mac Python without extraction filters, and data_filter is additionally used where available. Absolute /usr symlinks are normalized before extraction; traversal and escaping/duplicate symlinks are refused. Managed readiness checks pin identity and expected file presence, not a full content hash of a trusted local tree on every build.

Research reused: https://snapshot.debian.org/ ; https://manpages.debian.org/bookworm/dpkg-dev/deb.5.en.html ; https://dyn.manpages.debian.org/bookworm/pkgconf/pkg-config.1.en.html ; https://docs.python.org/3/library/tarfile.html#extraction-filters ; https://www.debian.org/doc/debian-policy/ch-docs.html#copyright-information ; https://packages.debian.org/bookworm/libavformat-dev . Existing fetcher/pin machinery was preferred over a new downloader/parser/dependency. No target service or package resolver was added.

The real ZN-513 video blocker required FFmpeg: the exact 20261001 snapshot Packages.xz was saved for all four architectures, providing 5.1.9-0+deb12u1 hashes for libavformat/libavcodec/libavutil/libswscale and their libswresample pkg-config dependency (dev/runtime pairs). Each architecture has the same 51-package set; existing GL pins were retained. Extracted package copyright files include their GPL/LGPL notices. Static system archives are excluded; no FFmpeg dependency was added to the Zinc core build. Actual ARMv7 video.so has dynamic DT_NEEDED entries for libavformat.so.59, libavcodec.so.59, libswscale.so.6 and libavutil.so.57. The target OS still supplies these runtime shared libraries.

Proof so far: exact offline linux_sysroot T0 passes archive corruption through the real canonical mirror override, traversal/absolute/duplicate-final-symlink refusal, normalized /usr symlinks, static archive exclusion, concurrent flock/recheck, partial installation repair, retained manual data, alias repair, and actual read-only doctor readiness/malformed/missing-receipt cases. Actual fresh-home AArch64 display-gl and armhf rpi1-specific display-gl builds succeeded with automatic Zig/sysroot downloads; cache stamps contain target .pc files. Actual ARMv7 video plugin build succeeds after automatic FFmpeg fetch. The first separate fresh-home UI export exposed posix_spawn_file_actions_addchdir_np at the glibc 2.28 floor; coordinator fixed the shared engine in ZN-1121 (d3fc22b57). After fast-forwarding without duplicate commits and rebuilding normal header dependencies, the final second fresh-home display-gl UI export succeeds. Its actual ELF64 AArch64 binary uses the expected GL shared libraries and /lib/ld-linux-aarch64.so.1. All final source checks are in final-proofs.log/final-results.json; final-t0 includes the actual interrupted publication/retry case. The actual package payload contains byte-identical script/lock, and its relocated fetcher refuses a corrupt canonical archive.

Prerequisites actually present: macOS, host Python 3 and pkg-config; empty private ZINC_HOME is proven, literal bare-OS bootstrap is not claimed. Full initial engine build had existing third_party and src/agent/dev.cpp warnings; changed TC/CLI files rebuilt without new warnings. No physical Pi, GPU runtime, FPS, Windows, emulator, benchmark, suite or CI claim. Durable commands, receipts, archives and provenance: .logs/sysroot-334/.

Proposed tests: tests/run --only linux_cross_prebuilt (broader target/archive reuse, minutes cold, memory unmeasured); tests/run --tier t2 --only package and tests/run --tier t1 --only install_nocompiler (full distribution and relocated install, minutes, memory unmeasured); actual Pi display/input + video playback after deployment (seconds, memory unmeasured). Old managed generations are deliberately retained to preserve manual data; disk cleanup policy is deferred, not silently applied.

Final proof: the rebuilt engine on d3fc22b57 plus owned TC source passes every primary acceptance criterion. Fresh-home AArch64 and rpi1-specific armhf display-gl plugins build with all 51 canonical packages; a second empty ZINC_HOME exports the actual display-gl UI app for rpi. Doctor is read-only. Package script/lock identity and relocated checksum refusal pass. Both unchanged examples/hero builds (--target chip and --target pocketchip, ZINC_NATIVE_REQUIRED=1) now succeed through their normal current-source ARMv7 cross-library build. Both output ELFs independently show ARMv7, VFPv3, NEON, hard-float, /lib/ld-linux-armhf.so.3 and dynamic FFmpeg dependencies. No app/plugin/helper source was changed for these proofs. Final compiler SHA-256: 191d941bb299477c3fb99d2ce68cd7ad85631cde0e3b976218a9ce63b3400786; per-output bytes/SHA and exact source hashes are in .logs/sysroot-334/provenance.json. Cold/warm compilation durations in the logs are indicative feature compilation, not benchmark measurements.

Coordinator later proposal: - ZN-334: consider bounded cleanup of obsolete managed sysroot generations only after preserving manual additions; installs intentionally retain them today.
Usage: n/a (tools/usage).
<!-- SECTION:NOTES:END -->
