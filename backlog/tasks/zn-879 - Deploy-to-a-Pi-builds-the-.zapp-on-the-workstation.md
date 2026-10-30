---
id: ZN-879
title: Deploy to a Pi builds the .zapp on the workstation
status: Done
assignee: []
created_date: '2026-10-30 18:47'
updated_date: '2026-10-30 19:12'
labels:
  - tooling
  - pi
  - size-M
dependencies: []
ordinal: 573460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc pack --target rpi|rpi1|rpi2|<linux target> packs a .zapp with its plugins cross-built for that machine
- [x] #2 zinc device deploy to a Pi sends that .zapp by default; --source keeps the sources mode; an older engine is noted, and a program it cannot run says so at load with update --local as the way out
- [x] #3 agent_deploy covers the Pi .zapp and --source
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner 2026-10-30: build on the Mac, as for the ESP32; replaces ZN-782's source default. zinc pack --target cross-builds each plugin (setCrossTarget shared) into native/linux-<arch>/, exports from the host's library. Verified: agent_deploy PASS (Pi .zapp runs, --source kept); on zinc-player marble packed here in 3.5 s, refused at load by the 0.9.1 engine ('unknown runtime call'), hence the exact-version check. Not done here: resources.bin bakes photos raw (museum-table 87 MB), upload at ~1 MiB/s for one file.

Photos: zinc pack and build --target bake no JPEG/WebP (o.leave); gfx_host.cpp photoFromAssets decodes the file at the first image() call. museum-table .zapp 99.5 MB -> 24 MB, frame identical to the baked run; zapp_photos T0. tests/t0/zapp.sh was already failing (program.info added by 0c1bfb2b5, and its corrupt byte fell in padding): fixed.

Transfer: the agent received at ~1 MiB/s on the Pi 3 (600 MHz under-voltage), 65% of a core: tls.cpp recvCb and net::takeFrame erased the consumed bytes from the front of the buffer per 16 KB record / 32 KB frame (quadratic with a backlog). Now a read position, compacted when half is taken. tls, tls_ticket, agent*, net_slow_reply PASS; Pi measure after update --local.

Version: an exact-version refusal blocked every develop commit (the version carries the hash); rows are append-only, so deploy only notes the difference and the ZBC loader's 'unknown runtime call' now names the cause and the way out. Exports link with -Wl,-S: museum-table 139 MB -> 26 MB (binary 130 -> 17.9 MB).
<!-- SECTION:NOTES:END -->
