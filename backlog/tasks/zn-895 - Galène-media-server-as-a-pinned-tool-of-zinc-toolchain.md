---
id: ZN-895
title: Galène media server as a pinned tool of zinc toolchain
status: Review
assignee: []
created_date: '2026-10-30 22:57'
updated_date: '2026-11-10 04:10'
labels:
  - net
  - media
  - toolchain
  - size-M
milestone: m-28
dependencies: []
ordinal: 15300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
D-record: Galène (MIT, Go/Pion) is the SFU of self-hosted calls (webrtc-selfhost-design.md §3). Upstream ships no binaries: tools/build-galene builds a pinned tag (galene-1.2.1) with the pinned Go, CGO_ENABLED=0 -ldflags='-s -w', for darwin-arm64, linux-arm64, linux-armv7, linux-amd64, with sha256 and LICENCE; zinc toolchain knows the tool (URL of the Zinc release asset, checksum) and installs it under ZINC_HOME. Publishing the assets is the owner's step (exact command in the notes).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tools/build-galene builds the four targets reproducibly and prints their sha256 and sizes
- [x] #2 zinc toolchain install galene installs and verifies it from a local file URL in the test (no network in tests)
- [ ] #3 Binary sizes and idle RSS on the Mac recorded; decision record written with the scores of §3.2
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (2026-11-10, work/895):
- Reused the existing tc.cpp pin table, fetchTool/fetchArchive locking, checksum-before-extract and cache; no second installer, engine dependency, system installation, client assets or server configuration. There is no src/tc/registry or existing pinned-Go builder in develop. tools/build-galene fetches its SDK/source through zinc toolchain fetch.
- tools/build-galene pins upstream galene-1.2.1 (MIT), source SHA256 230db9843995f6776b885cf7cb88d7de241abefc634e7845e20ce001fcdefd1a, and maintained Go 1.26.10 (upstream go.mod minimum 1.24.0). Exact compiler version checked; CGO_ENABLED=0, GOTOOLCHAIN=local, GOENV=off, GOWORK=off, GOAMD64=v1, GOARM=7, GOARM64=v8.0; -mod=readonly, -trimpath, -buildvcs=false, -p=2, -ldflags=-s -w. GOMAXPROCS=2 bounds the compiler. Modules follow the pinned upstream go.sum and sum.golang.org. No Homebrew/system Go used.
- Each tar.gz includes the server, LICENCE, Go and all 27 linked module licence notices, and PROVENANCE.json. Fixed tar/gzip metadata and sorted entries. --verify builds twice from different source paths with the shared Go cache and compares the complete archive. A separate cold cache or different-host rebuild has not been measured.
- zinc toolchain install galene installs below ZINC_HOME/toolchains/galene-<host>-1.2.1, with production SHA256 pins and https://github.com/Frulko/zinc/releases/download/galene-1.2.1/<archive>. ZINC_TC_MIRROR supports the existing local mirror workflow. The release does not exist yet: publishing is the owner's step; --latest=false keeps this tool release from replacing the latest Zinc engine release.
- CLI wiring is limited to src/main.cpp toolchain install conditional around3558 and usage around3593; cli_core.cpp toolchain help around137. No display, runtime, HAL or other dispatch touched.

Proof:
- tools/work-run 1800 tools/build-galene --verify: all four targets PASS, each complete archive byte-identical after the second-path rebuild. Logs .logs/galene-895/build.log. SDK SHA256 checks, source pin and module downloads verified through existing tools/Go.
- tools/work-run 1800 tools/build zinc PASS. Initial fresh build emitted pre-existing V8 SDK/nanosvg warnings; no warnings introduced by this change. Final incremental tools/work-run 120 tools/build zinc PASS warning-free. Final Zinc SHA256 c63d4cf31de3192ddbc9abae8f0d5718524b77012f3c4223527a1d5a533e3eae.
- ZINC=$PWD/build/zinc ZINC_ROOT=$PWD ZINC_GALENE_TEST_ARCHIVE=$PWD/dist/galene/galene-1.2.1-darwin-arm64.tar.gz tools/work-run 60 tests/run --only galene_toolchain: PASS (1 passed,0 failed). Deterministic archive ordering/permissions/timestamps, invalid target, corrupt pinned archive refused before extraction and .part removed, real file:// install and recorded checksum, cache without source, missing source error. ZINC_OFFLINE=1 throughout installs; no network in test. Without the matching locally supplied artifact, the positive install proof exits77 instead of downloading.
- Installed native binary -help PASS, flag.Parse exits before server setup; no socket/server started. .logs/galene-895/help-proof.log.
- Optional actual Linux -help: OptiPlex LAN SSH timed out10s, Tailscale SSH timed out15s; Pi SSH agent refused ED25519 signing (exit255). Neither reached binary deployment; no remote server started. Linux binary execution remains unproven. Logs .logs/galene-895/remote-help.log.
- No server, fixed port, idle/RSS benchmark, suite, T1/T2/demo, pixel comparison, fuzz, conformance or CI run. AC1 and AC2 proven; AC3 remains open for the coordinator's decision record and an owner-chosen quiet Mac RSS run. Review, not Done.

Measured artifacts (bytes; SHA256 archive / binary):
| Target | Archive bytes | Binary bytes | Archive SHA256 | Binary SHA256 |
|---|---:|---:|---|---|
| darwin-arm64 | 4775137 | 12166626 | b57156481610a6e0255972a18428291864946942b2da9c95b7c825ab384905b4 | 9c3d77bc35fead52d80db1e7a7488e6d8c1dc48db168eb9f6a260cbc2a86d0a4 |
| linux-arm64 | 4595643 | 11862178 | 5c93c048b8b25fd1b51a90945abf0d73e3fe933a6d3487306a060fbb83cd595a | 55c49e726670cd393f6d2a1da85b4f695042d6424d538425bc6320846cfe81e0 |
| linux-armv7 | 4819905 | 12058786 | 96f368db4a3e67c95a5f8e5a3d1404ef8356bd174a10fe5ad2000ad184e22a2c | ff41027f72f81f47659dddcf29a87d67d25f7807705f77ae37b1d2c4165b3d82 |
| linux-amd64 | 5110858 | 12812450 | 45bd7351e5e85003c1d63663a7c19cc43c9aed10c88e230ccebec95b74c7eeb6 | d38d99c8dfde915c41e4e8b799ee4524975ad8672d2852477a7d35e17e50b9e3 |

Research (primary-source lookup; sonnet unavailable in this runtime, parent supplied first findings):
- https://galene.org/galene-install.html: upstream CGO_ENABLED=0, stripped link and GOOS/GOARCH cross builds; deployment also needs web assets, deliberately outside this binary-only task.
- https://github.com/jech/galene/tree/galene-1.2.1 and raw tag go.mod/LICENCE: minimum Go1.24.0, module pins and MIT terms.
- https://go.dev/dl/?mode=json&include=all: official Go1.26.10 SDK hashes (all four build hosts pinned in script); maintained previous series, not the latest stable series.
- https://go.dev/doc/toolchain and https://pkg.go.dev/cmd/go: disable automatic compiler switching and user/workspace configuration; trimpath removes source/build paths, buildvcs=false removes VCS metadata.

Proposed decision text for coordinator (no D number allocated):
Use the Zinc control plane with Galène as a separate MIT server, following webrtc-selfhost-design.md §3.2. A separately downloaded 11.86–12.81 MB binary keeps its Go/Pion implementation out of the engine and preserves the existing tool trust boundary. One server, existing invite/admin JSON protocol and built-in web client fit small self-hosted groups. No performance/call-quality or idle-memory claim follows from this build-only proof. Revisit if quiet RSS is excessive on the Pi/Mac, maintenance stops, or transport-cc, RED, TURN/TLS443 or multi-node scale becomes necessary (then LiveKit).
Scores (fit x3, perf x3, size x2, maintenance x2, licence/supply x2, portability x1, effort x1; copied from §3.2, size now backed by artifact bytes, performance/RSS still unmeasured):
| Option | Fit | Perf | Size | Maint | Licence/supply | Port | Effort | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Zinc + Galène |5|4|4|4|4|4|4|59|
| Zinc + LiveKit |4|5|3|3|5|4|2|55|
| Mesh + TURN |3|2|5|5|5|5|5|55|
| LiveKit protocol/SDKs |3|5|3|4|5|4|2|54|
| SRS |2|4|4|3|5|3|2|47|
| mediasoup |2|5|2|3|5|3|1|45|
| SFU in Zinc |3|2|5|2|4|4|1|42|
| Janus |3|4|3|3|2|3|2|42|
| Jitsi |2|4|1|2|5|2|2|38|
| ion-sfu (archived) |2|3|4|1|1|4|2|33|

Owner publication command (NOT executed; run from the integrated checkout after the owner's normal push, only after the quiet RSS decision):
gh release create galene-1.2.1 dist/galene/galene-1.2.1-darwin-arm64.tar.gz dist/galene/galene-1.2.1-linux-arm64.tar.gz dist/galene/galene-1.2.1-linux-armv7.tar.gz dist/galene/galene-1.2.1-linux-amd64.tar.gz dist/galene/SHA256SUMS --repo Frulko/zinc --target develop --latest=false --title 'Galène 1.2.1 toolchain' --notes 'Galène galene-1.2.1 (MIT), built with pinned Go 1.26.10, CGO disabled. Each archive includes licence notices and provenance; SHA256SUMS lists the verified archives. No web client assets.'

Proposed later.md line for coordinator:
- ZN-895: run the pinned Galène binaries on the Pi (arm64/armv7) and OptiPlex and measure idle RSS on a quiet Mac before publication; local install/rebuild is proven, server startup/call quality is not.

Proposed tests:
- ZINC_GALENE_TEST_ARCHIVE=<matching local archive> ZINC=build/zinc tools/work-run 60 tests/run --only galene_toolchain: checksum, file URL, cache and errors; ~2s, modest memory, no network.
- ZINC=build/zinc tools/work-run 1800 tools/build-galene --verify: four targets rebuilt twice, source-path-independent archives; a few minutes warm/first run longer, two Go workers, SDK/module/build cache on disk. Independent Linux build host/cold cache remains unproven.
- On a quiet Mac only: owned temporary groups/data/static directories, start the installed galene with -insecure -http 127.0.0.1:0 -turn '' and those directories; wait3s, sample ps -o rss=,pcpu= -p <pid> once/second for10s, terminate and wait. Wrap whole command in tools/work-run25; report steady RSS (KiB), not -help or wrapper RSS. ~13s, memory unknown until measured. Do not run while another worker builds/tests.
- After SSH is available, copy only the appropriate built binary to ~/zn/codex-895-20261110/ and run timeout10 <binary> -help plus sha256sum; ~2s, no listening socket, no service/system installation.

Usage: n/a (tools/usage).

Exact proposed quiet-Mac RSS command (NOT run; owner chooses; supplied GALENE_BIN is the absolute installed binary):
```sh
GALENE_BIN="$PWD/.logs/galene-895/proof-home/toolchains/galene-aarch64-macos-1.2.1/galene" tools/work-run 25 python3 - <<'RSS'
import os, pathlib, subprocess, tempfile, time
with tempfile.TemporaryDirectory(prefix='galene-idle-') as scratch:
    dirs = [pathlib.Path(scratch) / x for x in ('groups', 'data', 'static')]
    for directory in dirs:
        directory.mkdir()
    command = [os.environ['GALENE_BIN'], '-insecure', '-http', '127.0.0.1:0', '-turn', '', '-groups', str(dirs[0]), '-data', str(dirs[1]), '-static', str(dirs[2])]
    with subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as process:
        try:
            time.sleep(3)
            for _ in range(10):
                if process.poll() is not None:
                    raise RuntimeError('Galène exited before RSS sample')
                subprocess.run(['ps', '-o', 'rss=,pcpu=', '-p', str(process.pid)], check=True, timeout=2)
                time.sleep(1)
        finally:
            process.terminate()
            process.wait(timeout=5)
RSS
```
Report the ten steady-process RSS samples in KiB and the machine/OS/date, then the coordinator can complete AC3 with its decision record. This binds one ephemeral loopback HTTP port; no TURN listener or web assets/calls. It is intentionally not part of T0 and has not been run while workers are active.
Durable artifacts/logs copied to /Users/mowmow/Lab/zinc/.logs/galene-895-20261110 (artifacts/ contains all four archives and SHA256SUMS); worktree removal will not discard them.
<!-- SECTION:NOTES:END -->
