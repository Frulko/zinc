---
id: ZN-278
title: 'Style levels: warning on ignored properties'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-07 12:58'
updated_date: '2026-11-09 05:34'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-175
  - ZN-183
  - ZN-251
ordinal: 12300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Mac part: a program using blur/extended keys on a small profile builds with a named warning (error with "style":"strict") and `zinc doctor` lists ignored properties; esp32 size check goes to later.md.

From docs/reports/ui-style-system.md (section 6, ST-29). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An esp32 build of hero-lite without extended keys: `size` of the image within +-1% of the baseline (recorded).
- [x] #2 A program using `blur` on esp32 builds with a named warning, fails under `"style": "strict"`.
- [x] #3 `zinc doctor` prints the style level and the properties ignored by the last build.
- [ ] #4 the B10 feature-matrix scene renders at forced T0, T1, T2 and T3 against per-tier goldens (from ZN-277: no tier switch exists yet)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Style capability levels / strict mode are cross-profile work; keep the Mac-checkable part (doctor line, named warning) and take AC3 of ZN-277. Evidence: no style level in zinc doctor; tools/build for esp32 is cross

ZN-278 (2026-11-09), the Mac part: AC2 and AC3 done, AC1 and AC4 left (handover below).

Research (web, sonnet sub-agent): React Native documents platform-only style props (https://reactnative.dev/docs/shadow-props: elevation Android-only, shadowOffset iOS-only) and enforces nothing at build time; CSS drops unknown properties silently and leaves @supports to the author; stylelint-no-unsupported-browser-features (https://unpkg.com/stylelint-no-unsupported-browser-features@8.0.4/README.md, doiuse + browserslist) names the feature and the target in each message, takes its severity from the rule (warning or error) and has an ignore list; Qt QSS warns at run time ('Unknown property', https://forum.qt.io/topic/90120/unknown-property-in-qt-css); Unity USS drops the whole rule on an unknown property (https://issuetracker.unity3d.com/issues/uss-file-parsing-stops-when-it-encounters-an-unknown-css-parameter), the failure mode to avoid; LVGL gates features in lv_conf.h at compile time (https://docs.lvgl.io/master/common-widget-features/styles/overview.html). Kept: the stylelint shape (property + target + stable code, warning by default, error by a setting), one token at a time.

Done: src/frontend/style_level.{h,cpp}: the style level is the profile's tier of targets/capabilities.json (T0 core, T1-T2 extended, T3+ full), the same TIER zinc:ui's painter reads, so the build and the run-time line agree; the table of tokens follows ui.ts paintGradient: conic (bg-conic*, conic-gradient()) needs T3, gradients beyond two stops along an axis (via-*, bg-radial*, radial/repeating gradients, bg-linear-<angle off the axes>, from-N%/to-N%, bg-[linear-gradient(..)] with 3+ stops, a corner or an angle off the axes) need T2. The loader scans the string literals of each project file after the JSX and StyleSheet lowering (class tokens and the @bg-[..] tokens of style objects), skips lib/std and plugins, and only with a profile (--profile). Warning: 'path:line:col: warning U0005: 'bg-conic' is not drawn as written on esp32 (tier T0, style level core; T3 draws it): a conic gradient is drawn as the average of its stops (zinc explain U0005)'. zinc.json "ui": {"style": "warn"|"strict"|"off"}: strict makes each one an error U0005 at the token (the U-code title is now printed by the formatter), off silences them. The build (loadChecked) writes $ZINC_HOME/cache/style.json (app, profile, each token and place), replaced by a rename; zinc doctor has a row 'UI styles: level full on macos (tier T4); the last build for esp32 (<app>) draws these simpler: bg-conic (src/main.tsx:4:32), ...' (four tokens, then +N), in the five languages. zinc explain U0005. docs/ui.md Gradients, CHANGELOG (UI, New).

Not done here: blur, backdrop-blur and the other filters do not exist in zinc:ui yet (ST-16, they are unknown classes on every profile), so the proof uses the extended keys that exist and that ui.ts draws simpler below T3/T2 (conic, multi-stop, radial, angled gradients). When ST-16 lands, its blur tokens get a row of styleTokenTier with the painter's fallback.

Proof: tests/t0/style_level.sh (esp32 warns with file:line for bg-conic and an angled linear-gradient style, not for a two-stop axis gradient; rpi1 warns for conic only; a desktop check says nothing; strict fails at src/main.tsx:4:32; off silences; a bad value is refused; doctor shows the level and the last build; zinc explain U0005). T0 run: style_level, checker, jsx_style, diagnostics, doctor_friendly, project, i18n, ui_say_what pass. Build warning-free (the V8 SDK and nanosvg header warnings are third-party, as before).

Handover:
- AC1 (esp32 image size of hero-lite within 1%): there is no hero-lite example; nothing of this task changes what an esp32 image holds (the check is in the compiler, zinc:ui is unchanged), and the zinc:ui/fx module split of ST-29 is not done. One bounded try: build/zinc export --target esp32 examples/esp32-widgets stops at the firmware: ESP-IDF's Python environment ~/.zinc/esp-tools/python_env/idf5.5_py3.15_env is missing (log ~/.zinc/esp32/firmware/866aa9017efd6f5d/build.log). Next: install it (idf tools), then zinc export --target esp32 <a zinc:ui app without extended keys> and record size of core.bin/app.bin before and after the fx split.
- AC4 (B10 feature-matrix scene at forced T0-T3 against per-tier goldens, from ZN-277): no forced render tier exists. Next: a ZINC_TIER override read by zinc:platform's TIER (modules.cpp platformModuleSource) and the renderer, then tests/golden/ui-style/feature-matrix-T0..T3.png.

Proposed tests: tests/t0/style_level.sh (written, ~5 s, <100 MB) in the milestone T0 run; tools/style-neutrality (proto compare, the change draws nothing new, ~1 min) at the next UI milestone.
<!-- SECTION:NOTES:END -->
