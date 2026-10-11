---
id: ZN-327
title: 'Guide: from template to store, one page'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-08 14:19'
updated_date: '2026-10-11 13:05'
labels:
  - docs
  - size-S
milestone: m-19
dependencies:
  - ZN-315
  - ZN-318
  - ZN-321
  - ZN-322
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/guide/07-distribution.md and 08-security.md rewritten around the real commands: new, run, test, pack, export, sign, publish, update, permissions; a worked example from `zinc new game-2d` to an itch.io page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 every command in the guide is run by a doc test (tests/t1)
- [x] #2 the security page lists the permission keys and what each host module checks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (agent worktree, 2026-10-11).

What: docs/guide/07-distribution.md rewritten as one page: a worked example first (zinc new game-2d -> run, test -> "permissions": [] and ZINC_PERMISSIONS=enforce -> pack, run the .zapp, fuse -> update-keygen -> export --target macos --dmg with ZINC_UPDATE_SEED, zinc verify, codesign --verify -> publish --itch --dry-run -> publish --site + shasum -c -> publish --key, update-app --check), then the reference of each command checked against Zinc Next's code. docs/guide/08-security.md: the Permissions section lists every key (fs, fs:read/write[:dir], net, net:*, net:<host>, net:*.<domain>, net:unix:<path>, process, camera, microphone, location, serial, the 14 zinc:system ids and their sub-ids) and a table of what each host module checks, call by call (src/host/sys_host.cpp, http.cpp, permissions.cpp, plugins/gphoto2, plugins/system), with the exemptions and the gaps found.

Test: tests/t1/guide_store.sh (13 s): every ```sh block of 07 and 08 is run in order as one script (zinc = the engine under test, headless, own storage); a ```json block after `<!-- guide: zinc.json -->` is merged into the project's zinc.json (the public key read from the key file, update.url -> file:// of dist/updates as the stand-in for the upload); then the artifacts and outputs the guide promises are checked, and every `zinc ...` written anywhere in 07 and 08 must name a command of `zinc help` with the flags and --target values it documents. Proven to fail: a wrong path in a run command, and an inline `zinc export --target ps1 --fast`. Mapped in tests/affected.json.

Decision (scope of AC#1): "every command in the guide" = every command of a code block of 07 and 08, all run; commands that need a board, another OS or an account (flash.sh, deploy without --print, butler login, notarytool, git push, gh) are written inline, never in a code block, and the lint checks the zinc ones against the CLI. Outward steps are shown as --dry-run (itch) or as the printed commands (notarization).

Doc drift fixed (the pages described the prototype): no ps1 export, no --obfuscate, no systemd unit / deploy.sh / Docker SDK images / rmpp AppLoad from zinc export, no generated letter icon (app.icon), `zinc deploy` = scp + ssh ./run.sh (--print), no stack protector / FORTIFY / RELRO / ZINC_HARDEN in Next builds, no ESP32 WiFi config, `--debug` is an lldb build (leaks: zinc mem --check-leaks), fuzzing = scripts/fuzz.sh (runtime) + next/tools/fuzz (engine), `zinc test --fuzz` does not exist, wasm serve.py binds 127.0.0.1:8000, `zinc monitor --udp` binds every interface.

Defects found (not fixed: no C++ change in this task):
- zinc:fs permission gaps (enforced, "permissions": []): fs.exists/stat/lstat/readlink/realpath answer for any path, fs.watch of a file too, and fs.mkdtemp('<any dir>/x-') creates a directory without fs:write (src/host/sys_host.cpp: HostFsExists, HostFsStat, HostFsReadlink, HostFsRealpath, HostFsMkdtemp have no denyByPermission). Repro: a project with "permissions": [] calling fs.mkdtemp(other + '/made-') under ZINC_PERMISSIONS=enforce zinc run prints the new directory.
- zinc export --target linux builds aarch64-linux (src/cli_core.cpp zigTargetFor), while zinc publish labels it "Linux (x86-64)" on the download page and pushes it to the itch channel `linux` (x86-64 desktops); no target builds x86_64-linux although zinc build --target x86_64-linux exists.
- zinc monitor --udp binds INADDR_ANY and prints received lines raw (terminal control sequences from any LAN sender); the prototype bound 127.0.0.1 and escaped control characters.
- Zinc Next export builds carry none of the prototype's hardening flags (-fstack-protector-strong, _FORTIFY_SOURCE=2, RELRO on Linux; the prototype measured <= 1.8 % CPU); -fno-stack-protector is explicit (src/main.cpp).

Lines for later.md:
- zinc:fs: check exists/stat/lstat/readlink/realpath (fs:read) and mkdtemp (fs:write) under "permissions" (gap documented in docs/guide/08-security.md).
- zinc export --target linux: an x86_64-linux target (or label the aarch64 build "Linux (ARM64)" and its itch channel accordingly).
- zinc monitor --udp: bind 127.0.0.1 by default and escape control characters.
- Release builds: decide on -fstack-protector-strong / _FORTIFY_SOURCE / RELRO for exports, measured with tools/bench-m4.
- docs/guide/06-testing.md still says --debug builds with ASan and a leak report (Next: an lldb build; zinc mem --check-leaks).
- Cross-platform pass: run tests/t1/guide_store.sh's flow for --target linux/rpi (export, --deb, publish --itch channels).

Tests: guide_store PASS (tests/run --tier t1 --only guide_store), security_guide PASS, ci_plan PASS.
<!-- SECTION:NOTES:END -->
