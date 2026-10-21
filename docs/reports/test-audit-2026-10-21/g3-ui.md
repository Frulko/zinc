# Test audit g3: T1 UI tests (89 tests)

Context: the v0.4.2 CI run passed all of these except oklab_tints and window_live_resize (SKIP). Windows do open on the hosted macOS runner (pixel_scale, window_resize and window_renderer PASS there). Every other test is headless and deterministic.

Verdict counts: KEEP 82, MERGE 2, DELETE-DUP 0, DELETE-WEAK 0, LOCAL-ONLY 2, SHORTEN 3 (rn_showcase, style_image, damage_sig trim). Total 89.

Note on the GL halves: gfx_transform, xform_plain, text_scaled, style_gradient, style_image and style_shadow each end with a GL replay compare. On a runner with no GL window (`gl.bmp` empty) these halves silently pass, with only an echo. The software half of each stays valuable, so they are KEEP, but the GL half proves nothing when it silently passes. Make it exit 77 for the GL part only if it can be split, or accept it.

| test | verdict | target | reason |
|---|---|---|---|
| animated | KEEP | | RN Easing/spring/decay numbers vs golden (animated.sh:7-8). |
| classic_rewrap | KEEP | | 400 random trees, overflow counts 0 (classic_rewrap.sh:15). Distinct from classic_shrink (different tree generator). |
| classic_shrink | KEEP | | flex-shrink text in narrow rows; own golden. |
| damage_sig | SHORTEN | | Real: signature damage vs full diff on 3 apps (damage_sig.sh:35-38). But line 41 re-runs `framehash.sh` in full, which CI already runs as its own test: drop that line. |
| devtools_styles | KEEP | | CDP Styles panel via node + cdp-check.mjs; localhost only, skips 77 without node. |
| fonts_runtime | KEEP | | Runtime font raster = baked frame (interp and native), typed Greek/Cyrillic golden, fs:read permission enforcement (fonts_runtime.sh:97-102). |
| framehash | KEEP | | FRAMEHASH contract plus board demo goldens (framehash.sh:110-117). Check the board demos are not also hashed in a board test (cross-group). |
| gfx_transform | KEEP | | Software goldens for interp and native (gfx_transform.sh:135-136). GL half silently skipped without GL. |
| icons | KEEP | | Icon subset, frame hash, 1848 icons parse (icons.sh:155-157). |
| input_touch | KEEP | | Multi-touch ZINC_INPUT reaches gfx, interp and native. |
| input | KEEP | | Scripted click/type goldens, clipboard, text commands, baked resources, SDL dummy-driver frame. The last check (input.sh:195-196) is the same frame 1 as `ui` (ui.sh:283-285) but through the SDL HAL, so it is distinct. |
| inspector | KEEP | | Inspector app vs devtools target and `zinc debug --cdp` (breakpoint, step, locals). Python servers on free ports; fine on CI. |
| keyboard_avoid | KEEP | | Real geometry assertion on a11y boxes: focused field between safe area and keyboard (keyboard_avoid.sh:287-294). |
| kit_menubar | KEEP | | Click/accelerator/context menu behaviour, native=true, light/dark goldens. |
| layout_anim | KEEP | | LayoutAnimation values for classic and rn. |
| layout_bridge | KEEP | | Host layout engine through interp, QuickJS and AOT (layout_bridge.sh:344-347). 7s, mostly the AOT build. |
| layout_compat | KEEP | | classic vs Yoga for the RN subset, with the two known lines (layout_compat.sh:364-367). |
| layout_conformance | KEEP | | 548 Yoga cases, rn must pass all. The only broad layout oracle. |
| layout_rn | KEEP | | rn mode re-measure/paint-only, scroll and layers vs the frozen output, hero hash, percent lengths. |
| navigation | KEEP | | Frame-hash scenarios per platform for stack, swipe, predictive back, sheet. |
| nuxt_ui | KEEP | | 17 gallery/dashboard hashes plus 4 scripted interaction goldens. 14s, acceptable. |
| oklab_tints | LOCAL-ONLY | | SKIPs on CI: needs Chrome and PIL (oklab_tints.sh:481-482). It proves nothing there. Either freeze Chrome's expected values into cases.txt and compare without Chrome (then KEEP), or run it only in the nightly with PIL installed. t0/nuxt_theme covers the token values. |
| pan_responder | KEEP | | PanResponder/Animated.event golden. |
| perf_hud | KEEP | | Overlay bbox equals panel rect, drag, collapse, key toggle, zinc.json option, QuickJS. It compares strings from the same run, with no timing threshold. |
| pixel_compare | KEEP | | Tests the pixel comparator itself (edge noise passes, 3px move fails). The tool gates other tests. |
| pixel_scale | KEEP | | Needs a GUI session (exit 77 without Aqua). It ran on CI (PASS 2s). Environment-sensitive, but a real assertion on pixelScale. |
| platform_look | KEEP | | 9 hashes plus the forced-look switch plus haptics. 39s, borderline but under 60. |
| pointer_kind | KEEP | | A mouse drag does not scroll, a touch drag does (pointer_kind.sh:674-675). |
| react_native_imports | KEEP | | Preset import resolution; own golden. |
| react_native_input | KEEP | | TextInput/Keyboard/KAV; own golden. |
| react_native_lists | KEEP | | FlatList/SectionList/RefreshControl; own golden. |
| react_native_modal | KEEP | | Modal/Alert; own golden. |
| react_native | KEEP | | RN primitives plus a frame hash. |
| rn_idle | KEEP | | Idle RN screen paints nothing and allocates nothing (rn_idle.sh:41-42). Counts, not time. |
| rn_port | KEEP | | rn-port frame hash plus layout facts. |
| rn_showcase | SHORTEN | | 95s is the slowest of the group. Cut: (a) the 4 dark rows of hashes.txt; dark is covered by rn_tester (hashes.txt dark rows) and nuxt_ui; (b) the idle loop over 5 screens at 400 frames (rn_showcase.sh:94-98) down to 1 screen, since rn_idle and ui_alloc cover it; (c) run the 5 sessions in parallel; (d) the grep for `className`/`class=` over the source at :72 is a policy check (`t0/jsx_banned` territory): drop it. Keep forms/feed/notes/camera sessions, which are unique. |
| rn_tester | KEEP | | 15 pages, hashes. 6s. |
| rn_text_defaults | KEEP | | 14px default and hairline at scales 1/2/3 vs the plain case. |
| rtl | KEEP | | ltr/rtl boxes mirrored, rn = classic, hashes. |
| scale_push | KEEP | | Frame hashes at pixel scales 2 and 4, golden recorded from the former pass. |
| scene_dump | KEEP | | Replay equals the live frame, bit-identical (scene_dump.sh:186). Shares the hero/navigation runs with damage_sig but asserts something else. |
| scroll_axis | KEEP | | alwaysBounceHorizontal=false semantic; own golden. |
| scroll_end | KEEP | | Last child reachable by code, wheel, finger, keyboard. |
| scroll_platform | KEEP | | Numeric trajectories per platform plus structural checks (scroll_platform.sh:224-229). |
| shadow_mirror | KEEP | | 300 shadows at 2 scales, golden of the pre-optimisation code (refactor guard). |
| solid_props | KEEP | | Signal-driven props after a click, interp and compiled. |
| stroke_tables | KEEP | | `capture --stroke-check`, bit-identical to the reference. |
| style_border | KEEP | | Objects = classes pixels, one hash. |
| style_dynamic | KEEP | | Runtime enum keys plus the clear build error (style_dynamic.sh:284). |
| style_flex | KEEP | | rn and classic goldens. Related to layout_compat, but a different fixture. |
| style_gradient | KEEP | | check.py asserts pixel geometry; GL half skips silently on CI. 12s. |
| style_image | KEEP | | check.py pixel assertions plus AOT. 21s, mostly the AOT build; GL half silent skip. |
| style_shadow | KEEP | | Hash; the GL compare is silently skipped without GL (style_shadow.sh:399). |
| style_size | KEEP | | min/max/aspect, classic and rn. |
| style_transform | KEEP | | Hash, hit tests, 3D refusal. |
| text_scaled | KEEP | | Ruler/ssim/font-count assertions are real. 8s. GL half silent skip. |
| text_shaped | KEEP | | HarfBuzz/SheenBidi goldens, AOT link check by `strings`. Emoji part conditional on the macOS font. |
| text_touch | KEEP | | IME/long-press/handles golden per platform. |
| touch_finger | KEEP | | Finger slop, focus on lift, cover (touch_finger.sh:549-556). |
| touch_marks | MERGE | touch_spread | Same fixture (`tests/golden/ui/spread.tsx` + `spread.input`) and the same finger-script run. Fold the 5-shot ZINC_TOUCHES mark check (touch_marks.sh:567-573) into touch_spread as a second assertion. |
| touch_spread | KEEP | | Absorbs touch_marks. Pinch factors 2.0/1.25/0.5. |
| ui_a11y | KEEP | | `ui.inspect()` tree. t0/ui_a11y_bridge covers the host bridge, a different layer. |
| ui_alloc_layout | KEEP | | Allocator counter over 600 layouts (ui_alloc_layout main.out `frames 600 allocations 0`). Its three-program family (with ui_alloc, ui_alloc_text) could be one script; no duplicated assertion. |
| ui_alloc_text | KEEP | | Allocation ratios by text class, counts only. |
| ui_alloc | KEEP | | 600 repainted frames, 0 allocations. |
| ui_cmds | KEEP | | Draw-command cost per style. |
| ui_font | KEEP | | Font fallback/weight/slant. |
| ui_kbd_inset | KEEP | | env(keyboard-inset) values plus hash. |
| ui_kbd_mode | KEEP | | mode=touch vs ZINC_KEYBOARD=never. Writes `/tmp/zn-kbd-env.tsx` (fixed path); use mktemp. |
| ui_kbd_reveal | KEEP | | Focused field scrolled above the keyboard (zinc:ui layer; keyboard_avoid is the RN layer). |
| ui_kit_sections | MERGE | ui_theme | Only one frame hash of the kit gallery at 480x2400; the title says "no overlap" but that is checked by eye when recorded. Kit gallery is hashed in ui_theme (dark) and platform_look (3 profiles). Move the 480x2400 hash row into one of those and delete the script. |
| ui_media | KEEP | | Media/container query flips. |
| ui_modal_motion | KEEP | | Per-frame pixel checks of scrim/sheet motion. Strong. |
| ui_press | KEEP | | Pressed feedback values plus held-pixel colour (ui_press.sh:159-162). |
| ui_rotate_icon | KEEP | | 0/90/360 hashes: differ, differ, equal. Small but real. |
| ui_runs | KEEP | | Text runs; no final echo, the pipeline exit status carries the result. |
| ui_select | KEEP | | Selectable text drag/copy. |
| ui_state | KEEP | | hover:/disabled: variants without layout. |
| ui_style | KEEP | | 30 style scene hashes in one loop. 9s. |
| ui_textlayout | KEEP | | Exact wrapped lines. Distinct from t0/text_layout (shaping fixtures). |
| ui_theme | KEEP | | Scheme switch counts plus dark gallery hash. |
| ui_tokens | KEEP | | Runtime vs compile-time class grammar parity, hit test, snap, colours, `--profile ps1`. A multi-topic test, but each part is distinct. |
| ui_transition | KEEP | | interp, QuickJS and esp32-profile goldens. |
| ui_virtual | KEEP | | 100k-row virtual list, rows in view only. |
| ui | KEEP | | M5 pixel goldens (clock, ui.tsx), AOT frame, unknown-module diagnostic. |
| window_live_resize | LOCAL-ONLY | | Explicit SKIP on CI via ZINC_CI (window_live_resize.sh:1); also drives AppKit live resize and `lsregister`. Never proves anything on a hosted runner. Keep it as a local/nightly test. |
| window_renderer | KEEP | | Opens a real window; PASS 5s on CI. Checks only the renderer-selection log line plus "GL replayed frames > 0". Exit 77 when there is no window. Overlaps with t1/gl_renderer (cross-group, see below). |
| window_resize | KEEP | | Real window, 5 runs plus a `zinc build` (20s). Passes on CI, but is the likeliest flake of the group (window server). Candidate to move to nightly if it flakes. |
| xform_plain | KEEP | | Command list byte-equal, matrix vs direct, 54 commands. GL half silent skip. |

## Cross-group duplicates and overlaps noticed

- `window_renderer` (this group) vs `t1/gl_renderer`, `t1/tiles`, `t1/gl_occlusion`: renderer selection and GL replay are all tested on `tests/data/tiles`. Check that gl_renderer does not assert the same log line.
- `framehash` (board demo goldens `examples/boards/*/*/framehash.golden`) vs the board and simulator tests of other groups (`sim_board`, `hardware_*`): the same demos are hashed twice if those run them with ZINC_FRAMEHASH.
- `damage_sig.sh:41` runs the whole `framehash` test again: a pure duplicate execution inside CI.
- `scene_dump` and `damage_sig` both render hero and navigation with ZINC_SCENE_DUMP (same inputs, different assertions). The runs could be shared, but the saving is small.
- `text_shaped` goldens (`tests/golden/shaped`) are also read by `t0/res_subset` and `t1/webp`. Different assertions; ok.
- `t0/ui_a11y_bridge` vs `ui_a11y`: different layers, not a duplicate.
- `t0/scroll_move` and `t0/damage_tap` (rn-showcase scroll damage) vs `scroll_platform`: different assertions.
- `oklab_tints` vs `t0/nuxt_theme`: token values are covered in T0, so oklab_tints only adds the Chrome comparison, which is unavailable on CI.
- Silent GL halves (`style_gradient`, `style_image`, `style_shadow`, `gfx_transform`, `xform_plain`, `text_scaled`) appear in other groups too (gl_*, webgl_*): check whether any T1 GL test passes with a bare echo and no exit 77 when no GL window is available.
- Tiny same-fixture families that could become one script each, with no assertion lost: `ui_alloc*` (3), `ui_kbd_*` (3), `react_native_*` (4 plus `react_native`), `scroll_axis`/`scroll_end`, `classic_rewrap`/`classic_shrink`. These are all 0 to 1 s; the gain is fewer processes only, so I did not mark them MERGE.
