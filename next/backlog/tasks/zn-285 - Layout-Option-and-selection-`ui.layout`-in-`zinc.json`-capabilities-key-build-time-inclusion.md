---
id: ZN-285
title: >-
  Layout: Option and selection: `ui.layout` in `zinc.json`, capabilities key,
  build-time inclusion
status: Done
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 14:28'
labels:
  - ui
  - layout
  - size-S
milestone: m-17
dependencies:
  - ZN-282
  - ZN-283
ordinal: 50750
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-6). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `"ui": {"layout": "rn"}` selects Yoga; `classic` default; `auto` follows `targets/capabilities.json` `ui.layout`.
- [x] #2 `rn` on esp32 or ps1 fails the build with a diagnostic naming the reason.
- [x] #3 A `classic` ESP32 build contains no Yoga symbol (`nm` check in a T0 test).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: zinc.json "ui": {"layout": classic|rn|auto, "preset": "react-native"} (fatal error on other values; preset sets rn unless layout is given); targets/capabilities.json gains a "ui" group per profile (layout, rn, why; esp32 and ps1 refuse rn); capsFromFile flattens groups to ui.layout/ui.rn/ui.why; resolution in loadManifestPermissions for every compile, against the profile, --target esp32 or build --target (rpi read as rpi1); zinc:platform exports UI_LAYOUT (groups are skipped as constants). tests/t0/ui_layout_option.sh: defaults, rn, preset, auto, override, bad value, rn refused on --profile esp32/ps1 and --target esp32 with the reason, and no Yoga in the ESP32 core (xtensa nm on the ELF when present, Yoga's messages absent from the committed image, with a probe that finds them in libzn_yoga.a). Linking zn_yoga into the host and AOT when rn is chosen comes with ZN-284.01/ZN-286 (nothing links it yet). The prototype reads capabilities.json too: it now sees a UI constant (an object counts as available), harmless.
<!-- SECTION:NOTES:END -->
