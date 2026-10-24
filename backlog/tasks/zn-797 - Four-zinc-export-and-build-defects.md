---
id: ZN-797
title: Four zinc export and build defects
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-M
milestone: m-19
dependencies: []
ordinal: 6200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-728: `zinc build <dir> --bundle` prints the usage when `--bundle` is the last argument (the loop in src/main.cpp stops one short): it only works before the folder; and a Zinc Atelier.app that carries the engine (zinc, lib, plugins, examples) instead of pointing at a checkout through LSEnvironment (app/atelier/package-macos.sh), with the prebuilt engine of ZN-718; an app has no way to learn its own path (no `sys.exePath()`), so it cannot find files beside itself.
- ZN-751: a zinc export run with ZINC_DETERMINISTIC=1 silently compiles a plugin's fake (video.next.ts) instead of its native code: the export should ignore it.
- ZN-755: zinc export --apk with a relative -o fails after gradle at the 16 KB check (checkPages in cli_core.cpp runs unzip inside the output directory with the relative APK path; the APK is built): use an absolute path; the recipe in zinc-next-android.md uses a relative -o.
- ESP32 mquickjs: the `flash.sh` of `zinc export --target esp32` still writes the merged image from 0x0, so flashing an update over a board erases its NVS (touch map, Wi-Fi networks, zinc:storage); write it around 0x9000-0x10000 as `zinc run` does (src/cli_mqjs.cpp flashFirmware), tests/t0/mquickjs_esp32.sh compares firmware.bin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc build <dir> --bundle` works with --bundle last
- [ ] #2 `zinc export --apk -o relative/path` passes the 16 KB check
- [ ] #3 an export run with ZINC_DETERMINISTIC=1 uses the native plugin code, not the fake
- [ ] #4 the esp32 flash.sh keeps NVS (writes around 0x9000-0x10000 as zinc run does)
- [ ] #5 t0 tests for each
<!-- AC:END -->
