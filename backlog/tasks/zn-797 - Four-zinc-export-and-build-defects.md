---
id: ZN-797
title: Four zinc export and build defects
status: Done
assignee: []
created_date: '2026-10-24 23:55'
updated_date: '2026-11-08 21:32'
labels:
  - size-M
milestone: m-19
dependencies: []
ordinal: 5500
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
- [x] #1 `zinc build <dir> --bundle` works with --bundle last
- [x] #2 `zinc export --apk -o relative/path` passes the 16 KB check
- [x] #3 an export run with ZINC_DETERMINISTIC=1 uses the native plugin code, not the fake
- [x] #4 the esp32 flash.sh keeps NVS (writes around 0x9000-0x10000 as zinc run does)
- [x] #5 t0 tests for each
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Web search (2026-11-08, sonnet): esptool merge_bin pads the gaps (NVS 0x9000-0xF000, phy_init) with 0xFF, so an image written from 0x0 wipes settings; write the pieces around NVS (https://docs.espressif.com/projects/esptool/en/latest/esptool/basic-commands.html). 16 KB check: zipalign -c -P 16 needs build-tools 35+, objdump/ELF check is separate (https://developer.android.com/tools/zipalign); scripts that cd elsewhere need absolute APK paths. argv loops: a trailing flag needs `k < argc`, not `k + 1 < argc`.

Done:
- --bundle last: the strip loop in src/main.cpp ran `k + 1 < argc`, so a trailing --bundle (which cli_core appends after `-o build/<name>`) stayed and the build printed the usage. Now `k < argc`. Proof: `zinc build hb --bundle` writes hb/build/hb.app, its program prints. T0: tests/t0/cli_polish.sh (both orders, a project without app.id stops on the app.id message, not the usage).
- --apk relative -o: checkPages (src/cli_core.cpp) makes its folder and package absolute before step() cds into the folder (unzip -d was also relative, so the ELF check found no library and passed vacuously). T0: tests/t0/export_packages.sh, a relative -o from another cwd.
- ZINC_DETERMINISTIC in exports: gNativeLive/gNativePreferred (src/main.cpp) take the stand-ins only when ZINC_NATIVE_REQUIRED is not set; zinc export and zinc pack set it, so they always ship native code. T0: tests/t0/video_phone.sh now exports with ZINC_DETERMINISTIC=1 (it used to unset it as a workaround).
- esp32 flash.sh (--engine mquickjs, src/cli_mqjs.cpp exportTo): dd cuts firmware.bin into head (< 0x9000) and tail (>= 0x10000) in a temp dir, esptool writes 0x0 head, 65536 tail, 0x320000 app.img, as flashFirmware does. firmware.bin stays whole in the export (factory image). The core esp32 export (core.bin, src/cli_core.cpp) is left: the core firmware uses no NVS. T0: tests/t0/mquickjs_esp32.sh runs the exported flash.sh with a stand-in esptool and checks the cut.
- Not in the criteria, left as written in the description: an Atelier.app carrying the engine and `sys.exePath()` (ZN-728 tail).

Proposed tests: tests/t1/macos_bundle.sh (a real --bundle build, 30 s, <1 GB); a real `zinc export --apk -o rel` with the Android SDK (minutes, 2-3 GB, Gradle); ./flash.sh on a board with saved Wi-Fi (needs-board).
<!-- SECTION:NOTES:END -->
