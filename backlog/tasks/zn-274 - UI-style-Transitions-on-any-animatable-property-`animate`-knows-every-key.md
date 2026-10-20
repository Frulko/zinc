---
id: ZN-274
title: 'UI style: Transitions on any animatable property; `animate()` knows every key'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-07 12:57'
updated_date: '2026-10-11 10:40'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-273
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-25). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Virtual-clock samples at 0, 50, 100% for opacity, translate, rotate, colour, width.
- [x] #2 Opacity and transform transitions are paint-only: no layout runs while they move (layout counter). Their 'record nothing per frame' half (no re-record through property slots) moved to ZN-364.01 #4 with the parked ZN-191, as the backlog review of 2026-10-10 (section 7.2) proposes.
- [x] #3 esp32 caps at 8 concurrent tweens and jumps beyond (test).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done (lib/std/ui.ts, docs/ui.md "Transitions"): Tailwind's transition, transition-all/colors/opacity/shadow/transform/none, duration-N, delay-N, ease-linear/in/out/in-out (default cubic-bezier(0.4, 0, 0.2, 1)) on any animatable property; the change can come from any writer: classes applied again (rebuildStyle), a state variant (syncState), a style number (applyProp/setNumber), a theme switch. animate() knows every key of the style table (propValue: the inverse of applyProp), colours channel by channel as i32 (fx12-safe), keyword keys switch half way (CSS discrete rule), the spring easing ends exactly on its value; new ui.getNumber(h, key) reads any key, while it moves too. New style keys shadowLevel, colorAlpha, borderAlpha (what the classes set without a key) so transitions reach them. Test: tests/t1/ui_transition.sh (golden tests/golden/ui-transition, interpreter + QuickJS + --profile esp32 main.esp32.out); the prototype's sim (node compiler/bin/zinc.mjs run --target sim) prints the same main.out. ui-tokens golden gains the 16 transition tokens (runtime and the JSX check agree).
AC #1: 0/50/100% of 200 ms linear transitions on opacity (1, 0.75, 0.5), translateY (0, 4, 8), rotate from a style number (0, 45, 90), text and border colour (0, 0x808080, 0xffffff), width (80, 120, 160); plus first style (no transition), retarget from the shown value (0.625), a group moves only its properties, animate() on 69 numeric, 18 keyword and 9 colour keys at 40/50/100%.
AC #2: a data-[state=open]: opacity and translate transition moves over frames with 0 layouts (ui.layoutCount). The "records nothing per frame" half needs the property slots of ZN-191 (parked on a measurement); moved to ZN-364.01 #4 as the backlog review of 2026-10-10 (7.2, split table) proposes (RULES 6: nothing in the main chain waits on a parked task).
AC #3: under --profile esp32 (HEAP_BYTES 160 KiB) nine properties changed at once: eight move, the ninth (margin-top) and a tenth tween (animate) take their end at once; on the desktop all ten move (main.out vs main.esp32.out).
Decisions (RULES 4, reversible): (1) no record per node: each writer notes what the properties it changes show (one shared scratch array) and starts, retargets or skips their tweens at once; a first version kept a per-node record of the last shown value of every transitioned property and measured about +0.8 KB per transition-colors node and +2.4 KB per transition-all node (zinc mem, 100 nodes: peak 198,821 B of objects against 170,789 B before, plus about 52 KB of array storage); the snapshot design measures +52 B per node (peak 176,029 B: InterX 136 -> 184 B, the only growth; array storage +1.1 KB once, the static tables). (2) The tween budget is 8 on heaps of 256 KiB or less (esp32 160 KiB, ps1 256 KiB: style report section 3, T0 rule), 100000 elsewhere; animate() and transitions share it. (3) duration-N alone transitions every property (CSS's initial transition-property: all), as Tailwind's output does. (4) The background keeps easing where it is painted (effectiveBg, it also eases the opaque hover:/focus:/active: background colours that live there), now on the node's curve and delay, retargeting from the colour shown (it jumped to the old end before); the opaque hover:/focus:/active:/focus-within: text and border colours, resolved at paint time, still switch at once (docs/ui.md says so). (5) A node's first style does not transition (CSS): a node transitions from the frame or tick after it got its transition classes. (6) zinc:platform now gives the profile in force under --profile (PROFILE, HEAP_BYTES, NUMBERS, FPU and its capability row), as the prototype's platformModule does: it said macos / 512 MiB / f64 under --profile esp32 (separate fix commit).
Tests run (this Mac, load 2.5 to 4.5 with other agents): tests/run --tier t1 --only for ui, ui_style, ui_tokens, jsx_style, ui_font, ui_textlayout, ui_alloc_text, ui_alloc_layout, ui_sides, ui_media, ui_docs, ui_virtual, ui_theme, ui_state, ui_transition, ui_a11y, ui_alloc, ui_select, ui_kbd_inset, ui_kbd_reveal, ui_kbd_mode, ui_kit_sections, ui_cmds, webgl_surface, layout_iface, layout_rn, classic_rewrap, rn_showcase, style_flex, style_size, scroll_axis, layout_anim, animated, style_shadow, style_transform, pan_responder, react_native, style_border, layout_compat, layout_conformance, rn_port, rtl, style_dynamic, react_native_imports, ui_layout_option, host, profile, zbc_cache, nuxt_ui, nuxt_theme: 50/50 PASS; tools/proto-capture compare --canary 4/4 and --all 40/42 (3d/model 3 pixels, three/cubes 5 pixels: the same with the main tree's engine and its ui.ts, so not this change; not in RESUME.md's known list); prototype sim run of tests/golden/proto-devtools (ui.ts compiles with the prototype). Not measured: the cost of the applyProp/rebuildStyle guard on a quiet machine (bench-render).
Later (later.md lines): ease the opaque hover:/focus:/active: text and border colours at paint time like the background (or route them through the state overlay); reversing shortening of CSS (a transition sent back mid-way takes the shorter time); transition-property/duration keys in style objects (Reanimated 4's CSS transitions); duration-[2s] arbitrary values; real ESP32 check of the 8-tween cap (cross-platform pass); bench-render before/after of the applyProp guard on a quiet machine.
<!-- SECTION:NOTES:END -->
