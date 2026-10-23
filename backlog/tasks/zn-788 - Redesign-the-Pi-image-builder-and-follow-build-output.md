---
id: ZN-788
title: Redesign the Pi image builder and follow build output
status: Done
assignee: []
created_date: '2026-10-23 16:00'
labels:
  - ui
  - size-M
dependencies: []
ordinal: 522480
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Builder has a coherent visual hierarchy, hardware illustrations and icons while preserving every setting, presets and save errors
- [x] #2 Build output follows its bottom while attached, allows reading older output and can return to the latest line
- [x] #3 Targeted native interaction and visual checks pass for settings, presets, build success and failure, and log following
- [x] #4 Build activity animates while running, progress eases between actual steps, stops on completion/failure and respects reduced motion.
<!-- AC:END -->

## Implementation Notes

Light ivory settings workspace, original SVG board/screen illustration and existing Lucide icons, numbered sections and green build panel with hardware/network/login summary (no passwords). Existing Nuxt controls/presets/profile and process logic retained. LogView uses existing ScrollView stickToBottom plus a Latest output pointer action; no custom scrolling algorithm or dependency.

Native `build/zinc check image/builder` passes (17 files). `pi_image_builder` passes success/failure and 960x720 action/progress reachability with the real workspace and fake build tool. Existing form/built/failed goldens updated and pass strict pixel comparison without regeneration. The fixture quits on verified completion instead of always rendering 8000 frames; waits 100 settled frames for transitions and the 1.2 s scrollbar fade before capture. Obsolete coordinate inputs removed.

`pi_image_builder_presets` passes real pointer menu selection above neighbouring sections, Escape/outside dismissal, preset save/load, duplicate refusal, autosave failure/recovery and cold restart; its two UI goldens updated and inspected. `pi_image_presets` passes. New `pi_image_builder_log` proves following appended output, preserving a scrolled-up position, actual pointer resume and subsequent following. UI captures inspected under /tmp/zinc-builder-redesign. No shared runtime change, engine build, Docker/image build, hardware action, CI dispatch, push or release. README, affected-test map and Unreleased changelog updated.

Owner visual follow-up: replace the four mobile-style switches in this builder with existing flat desktop checkboxes and reduce the panel corner radii. No shared kit or platform look changed. Extend the preset scenario to assert no switch roles remain, toggle Bluetooth with the real pointer and verify its saved value; add an options golden. This exposed a stale save error left in the build panel after a successful save: clear it only when it exactly matches the previous save error, preserving unrelated build errors. The same scenario asserts recovery clears both messages. Inspect options capture as well as refreshed builder visuals.

Owner animation follow-up: the loading glyph was static. Promote the existing agents Spinner unchanged in shape/timing to zinc:ui/kit and re-export it from agents/motion; mount it only during the build. Ease the progress fill's widthPercent over 280 ms using native animate(), clamp it to actual steps and apply it immediately for reduced motion. Native pi_builder_motion PASS verifies time-separated rotation, intermediate/settled progress values, failure and success cleanup, and reduced motion. Native builder and agents checker PASS; pi_image_builder PASS against unchanged final-state goldens. No running owner process, Docker build or CI touched.
