# Backlog review: importance and order of every open task (2026-10-10)

Asked by the owner on 2026-10-10. Scope: every task of `backlog/tasks` that is not Done (381 tasks when this was written), read in full
(description, acceptance criteria, notes where they mattered). Nothing was built or run; statements marked "checked" were read in the code or in a
file named beside them. The machine-readable result is `docs/reports/backlog-review-2026-10-10.json`: one line per task (rank, new ordinal, class,
six marks, score, lane, action, reason) and the new `groups` for `backlog/priority.json`. This page explains it.

The backlog moved while it was reviewed: the loop closed seven tasks, one agent finished zinc:audio (ZN-390), and the owner asked for two showcase
demos, filed as M27 (15 tasks). All of it is in the result.

## 1. Verdict

1. **The order itself made the loop do reinforcement.** The performance group stood first and refilled itself: today the loop worked ZN-592.01,
   .03, .05, .06, .07, ZN-648 and ZN-654, one follow-up filing the next. The first steps paid (zinc's own launch from 29 ms to about 8.5 ms, a
   compiled console program from 14.3 to 7.0 ms); two of them (.05, .07) were closed on their own measurement as not worth the change, and the
   last two concerned a benchmark of 1 ms of work. The group ran dry of Mac work only this evening. Meanwhile **none of the 12 UI style tasks of M17 that are Mac work could start**: each
   is listed behind a renderer task that later work made obsolete, or behind a parked task (section 7).
2. **New order.** First the two showcase demos (M27) with the two engine tasks they wait on; then four small defects a user hits; then the
   debugging tools the owner asked about; then what a kiosk needs to ship, the parity gate, the UI style features and the JavaScript library
   lane; the hardening and follow-up tasks as one batch at the end of the Mac work; then the cross-platform pass; then the parked tasks.
3. **Housekeeping the order depends on:** 21 tasks to close, 5 to merge, 29 to split, 14 dependency lines to drop and 3 to add (section 8).
   Without the dependency edits the order still works (the tool skips what waits), but the UI features stay unreachable.
4. **The simulated order of `tools/next-task` equals the ranked list** for the 294 tasks the tool can return (section 12).

## 2. Method

- A throwaway script dumped every open task into one text file; all of it was read. A second script holds one line of judgement per task and
  computes the rest (scores, order, ordinals, the simulation of the tool).
- **Class**: feature, parity, perf, defect, hardening, tooling, docs, research; `cross` for everything in the cross-platform pass; `parked`.
- **Score**, the weights of `RULES.md` section 4 adapted to tasks, each mark 1 to 5: value to the goal and to what the owner asked x3,
  user-visible novelty x3, what it unblocks x2 (counted from the dependency graph: 0, 1, 2-3, 4-7, 8 or more open tasks behind it), confidence that
  it can be finished and proven on the development Mac x2, effort x1 (S 5, M 3, L 1), risk to the shared core x1 (5 isolated, 1 deep in IR,
  runtime, raster, layout, text or `lib/std/ui.ts`). Maximum 60.
- **Order**: by score, a task never before one it depends on. A blocker inherits the score of the best task it unblocks minus 2 per step, so
  a feature behind a long chain ranks below the same feature standing free. Three rules are applied on top, each stated here because the score
  alone does not give them: the M27 block first (owner, this evening); S defects of value 5 next (the owner's own exception: a defect a user
  hits may lead); then the debugging tools (the owner's question of today). ZN-612 is placed with the defects because it decides how M27
  records its frames.
- **Lane**: `agent` for a new module, plugin, app or self-contained subsystem; `loop` for what touches the shared core, one at a time.
- **Sections**: `now` (Mac work), `deferred` (the cross-platform pass), `parked` (the label), `review` (status Review: the tool never returns
  these). The brief named three sections; `review` is a fourth, because those 46 tasks are neither startable nor parked.

## 3. Where the owner's statements pull apart, and how it was settled

The most recent statement wins.

| Statements | Settled as |
|---|---|
| 2026-10-10 evening: two showcase demos. Earlier the same day: the debugging tools. | M27 first, with its engine prerequisites inside the block. The debugging tools come right after it and the small defects. |
| 2026-10-09: performance first, every ms tracked. 2026-10-10: too much reinforcement, not enough novelty. | The performance group is dissolved. What is left of M21 on the Mac is two speculative tasks (ZN-423, ZN-418) and the QuickJS call boundary (ZN-596, ZN-597, ZN-601): they rank on merit, in the hardening batch. Numbers stay tracked in `zinc-next-perf.md`; chasing the last 2 ms does not lead. The owner can overrule (question 4). |
| 2026-10-07/08: UI first, then packaging, developer tools, desktop, rendering, 3D, games. 2026-10-10: visible novelty; demos written in Zinc. | UI style features get value 5 and lead the loop's lane after M27's prerequisite and the debugging tools. The JavaScript game-library lane (run PixiJS, Phaser, three unchanged) gets value 2 to 3: it is the compatibility tier, and both new demos are native Zinc. It still ranks in the 30s because it is isolated work with many tasks behind it. |
| Hardening must happen, but must not lead unless it blocks something or is a real defect. | Four S defects lead (ZN-645, ZN-646, ZN-609, ZN-566) with the doc that rides with them; ZN-612 leads because it blocks M27's goldens; everything else of that kind is batched (section 9). |
| 2026-10-10: the development Mac first. M26 (iOS, Android) is in the last group, though five of its tasks are provable on the Mac. | Left last, as the owner grouped it. Question 1. |

## 4. The showcase demos (M27)

The first block holds 17 tasks: the 15 of M27, ZN-432 (in flight) and ZN-263.

**Existing tasks the two demos pull up**

| Task | Rank | Why the demos need it |
|---|---|---|
| ZN-263 2D transforms | 2 | Checked: `lib/std/ui.ts` paints only an even scale (`tfK`) and `runtime/gfx.cpp` has no rotation. The museum table turns photo cards under two fingers (ZN-650.03) and turns panels toward the side of the table a visitor stands at (ZN-650.06). It was unreachable (listed behind the parked ZN-191). It is the loop's first task. |
| ZN-432 images from bytes | 1 | In flight. The museum player reads photos from a project folder at run time. |
| ZN-583.02 zinc:physics3d | 3 | The Jolt half of ZN-583, now in M27: the owner chose complete 3D physics for the pinball. The Box2D half (ZN-583.01), filed for the pinball and moved back to the games milestone the same evening, is at rank 37: no demo waits on it. |
| ZN-645, ZN-646 | 18, 19 | An exported `.app` carries no assets today; the museum app is mostly assets. |
| ZN-612 goldens across machines | 23 | Both demos record 3D frames on this Mac; `three_3d` already differs between Apple Silicon and Intel by a few pixels. Decide the tolerance first. |
| ZN-321 signing, ZN-430 `.zapp` launch, ZN-652 plugins inside packed apps | 28, 29, 30 | What a kiosk needs: Gatekeeper refuses an unsigned app; a collection is a 100 MB archive that takes 2 s and 500 MB to start; a packed app builds its native plugins for 50 s at first start (ZN-652, filed today from ZN-390). |
| ZN-274 transitions, ZN-275 keyframes | 41, 42 | Links between sequences, timed appearances, the attract loop. |
| ZN-581 GPU sprites | 43 | 30 photo cards moving at the display rate are rotated, scaled images. It overlaps ZN-263 in the renderer: do ZN-263's matrix first and send the sprites through it. |
| ZN-262 object-fit, ZN-264 group opacity | 47, 75 | Photos as cover or contain; a panel that fades shows its overlapping children through each other today. |
| ZN-446 splash, ZN-447 loader, ZN-436 zinc:assets v2, ZN-429 `.incbin` | 55, 57, 56, 81 | A kiosk never shows a white window; a collection loads by group, decoding off the frame thread; an AOT build carries tens of MB of photos. |
| ZN-440 audio streaming, ZN-441 model importer, ZN-439 texture importer | 72, 65, 64 | zinc:audio decodes whole files into memory (minutes of narration); scanned objects come as heavy glTF; photos scaled down want mipmaps. |
| Cross-platform pass: ZN-552, ZN-563.01, ZN-651, ZN-392, ZN-592.04 | in the pass | A touch table is not a Mac. Multi-touch from evdev, zinc:3d on the GPU on Linux, audio on Linux, a fused player for Linux: the Linux desktop phase leads the pass (section 11). |

**What the demos need and no task carries** (to file; not ranked here)

1. **Scripted touches.** Checked: `ZINC_INPUT` (`src/host/hal_dispatch.cpp`) reads `move`, `down`, `up`, `wheel`, `key`, `text`; no touch.
   The scripted multi-touch sessions of ZN-650.03, .04 and .06 cannot be written. S, and it should be the first task of the museum chain.
2. **Quality of the GPU renderer of zinc:3d.** Checked: `plugins/3d/native/render3d.gl.cpp` samples textures at the nearest texel (to match the
   software renderer) and has no multisampling. A textured object seen up close and a pinball table in 3D are the main picture of both demos.
   ZN-576 is the WebGL sibling only.
3. **Pitch per sound in zinc:audio.** ZN-649.03 asks for pitch variation; the module shipped today has volume and loop. S.
4. **Kiosk delivery.** Launch at login exists (`zinc:system/autostart`); relaunch after a crash and the system kiosk presentation (no Dock, no
   menu bar) do not. ZN-650.06 covers what is inside the app.

**On the M27 tasks themselves**

- The two epics (ZN-649, ZN-650) have no dependency: unless they stay claimed, the tool would hand them out as work. ZN-203 carries the
  `parked` label for that reason.
- ZN-583 is now the parent of two subtasks in two milestones, unclaimed and without dependency: the same remark applies.
- The two editors (ZN-649.04, ZN-650.07) are the largest tasks of the milestone: a split in two each is proposed in the JSON.
- glTF is within reach for ZN-650.04: checked, `plugins/three/addons/GLTFLoader.ts` exists and `examples/three/gltf-viewer` is in the list of
  running examples.

## 5. The first 40

Scores are out of 60. "claimed" means an agent holds the task. A bold word is the proposed action when it is not "keep".

| Rank | Task | Title | Class | Size | Score | Lane | Why |
|---|---|---|---|---|---|---|---|
| 1 | ZN-432 | zinc:gfx source rectangles and images from bytes; the b... | feature | M | 47 | agent (claimed) | In flight (agent). Images from bytes: the museum table reads photos from a project folder; ZN-581 and the atlases wait on it too. |
| 2 | ZN-263 | UI style: 2D transforms: rotate, skew, `scaleX/Y`, orig... | feature | L | 48 | loop | The museum table needs it twice: cards turned by two fingers, panels turned toward a side of the table. Only an even scale paints today. Listed behind the parked ZN-191, which it does not need. **split** |
| 3 | ZN-583.02 | zinc:physics3d: 3D rigid bodies on Jolt | feature | L | 52 | agent (claimed) | M27. Jolt as a plugin (the owner chose full 3D physics): flippers as hinges, continuous collision for the ball. Nothing before it. |
| 4 | ZN-649.01 | Pinball 3D: the table format and its loader | feature | M | 50 | agent (claimed) | M27. Everything about a table as data; the game, the sounds and the editor read it. |
| 5 | ZN-650.01 | Museum table: the project format (sequences, media, lin... | feature | M | 50 | agent (claimed) | M27. Sequences, media, links, texts in several languages; the player and the editor read it. |
| 6 | ZN-650.02 | Museum table: a sample collection from open-access sources | feature | S | 50 | agent (claimed) | M27. A dozen open-access photographs and one or two models, licences recorded, under 8 MB. |
| 7 | ZN-650.04 | Museum table: a 3D object viewer with touch orbit and a... | feature | M | 52 | agent (claimed) | M27. A textured object turned by touch on the GPU renderer of zinc:3d, points of interest. |
| 8 | ZN-649.02 | Pinball 3D: the game, a table played in real 3D | feature | L | 50 | agent (claimed) | M27. The table played in real 3D with zinc:physics3d, landscape and portrait; the visible result of the pinball chain. |
| 9 | ZN-649.03 | Pinball 3D: sounds and music from the table file | feature | S | 49 | agent (claimed) | M27. Sounds per event and music through zinc:audio (done today); asks for pitch, which it lacks. |
| 10 | ZN-650.03 | Museum table: photos on a light table with multi-touch... | feature | M | 49 | agent (claimed) | M27. Photo cards under several hands. Waits on ZN-263, ZN-432 and on scripted touches that ZINC_INPUT does not have. |
| 11 | ZN-650.05 | Museum table: sequences, links and guided presentations | feature | M | 51 | agent (claimed) | M27. The Klynt part: timed media, hotspots, storyboard, guided presentation with narration. |
| 12 | ZN-649.04 | Pinball 3D: the table editor | feature | L | 47 | agent (claimed) | M27. A table made without touching code or JSON: top view, palette, properties, rules, 3D preview, undo. **split** |
| 13 | ZN-650.07 | Museum table: the storyboard editor | feature | L | 45 | agent (claimed) | M27. A museum builds its own installation: storyboard, sequence editor, points of interest on a model. **split** |
| 14 | ZN-649.05 | Pinball 3D: a second table made with the editor only | feature | M | 45 | agent (claimed) | M27. A second table made in the editor only, and the guide: the proof that tables are data. |
| 15 | ZN-649 | Pinball 3D: a Space Cadet style table in real 3D, data-... | feature | L | 46 | agent (claimed) | M27 epic: closes when its five parts are Done. |
| 16 | ZN-650.06 | Museum table: table mode (any side, several visitors, i... | feature | M | 42 | agent (claimed) | M27. Any side of the table, several visitors, idle reset, kiosk behaviour. Waits on ZN-263. |
| 17 | ZN-650 | Museum table: an interactive mediation app for a touch... | feature | L | 46 | agent (claimed) | M27 epic: closes when its seven parts are Done. |
| 18 | ZN-645 | The macOS .app of zinc export carries its assets | defect | S | 45 | agent | An exported .app holds no assets: started from Finder it finds none. The museum app cannot ship without it. |
| 19 | ZN-646 | The assets exemption of the permissions is read-only | defect | S | 39 | agent | Security hole: the assets exemption also covers writes, so a symlink there reads any file. Same files as ZN-645. |
| 20 | ZN-647 | Guide: where a built program finds its assets | docs | S | 31 | agent | Three guide pages still say assets are compiled into the executable. With ZN-645. |
| 21 | ZN-609 | zinc test runs on a stock macOS: no GNU timeout needed | defect | S | 45 | agent | `zinc test` shells out to GNU timeout: on a stock macOS every test file fails for a new user. |
| 22 | ZN-566 | QuickJS engine robustness for libraries (stack limit, r... | defect | S | 53 | agent | Deep recursion is a SIGSEGV, rejected promises vanish, onFrame after an await never runs. 17 tasks behind it. |
| 23 | ZN-612 | Pixel goldens and the WebGL baseline hold on x86_64 and... | hardening | M | 35 | agent | three_3d, video and webgl_conformance fail on this Mac with goldens from Apple Silicon. Decide the tolerance before the two demos record 3D frames. |
| 24 | ZN-369 | Inspector: edit spacing, sizes and colours live from th... | feature | M | 50 | loop | Owner asked. Edit padding, sizes, colours live from DevTools and get the patch to paste back. |
| 25 | ZN-371 | A real debugger: breakpoints, stepping, stack, locals,... | feature | L | 44 | loop | Owner asked. The IR carries no source position yet (checked), so it starts with a line table: file:line in errors, then breakpoints, CDP, DAP. **split** |
| 26 | ZN-373 | Zinc Inspector: a Zinc app that inspects and debugs pro... | feature | L | 46 | agent | Owner asked. A Zinc app that inspects Zinc programs; its first part needs nothing that is not there. **split** |
| 27 | ZN-576 | MSAA default framebuffer for WebGL (antialias: true) | defect | S | 47 | agent | antialias: true is answered false: every WebGL and three.js demo has jagged edges. |
| 28 | ZN-321 | Code signing and notarization | feature | M | 46 | agent | Hardened runtime, entitlements from the permissions, notarization up to the owner's step. A kiosk Mac refuses an unsigned app. |
| 29 | ZN-430 | Launch a .zapp without reading or hashing the whole arc... | defect | M | 46 | agent | A .zapp with 100 MB of assets takes 2 s and 500 MB to start; map and verify on first read. |
| 30 | ZN-652 | Fused apps and .zapp archives carry the native plugins... | defect | M | 46 | agent | A packed app builds its native plugins at first start (50 s, a toolchain download). Both demos use native plugins. |
| 31 | ZN-565 | WebGL binding conformance fixes found by real libraries... | defect | M | 46 | agent | A WebGL 2 context is instanceof the WebGL 1 class; two shader checks reject valid code. PixiJS 8, Phaser 3, three fail on them. |
| 32 | ZN-154 | Examples: video, camera, maps, svg, lottie, mapper, rem... | parity | M | 38 | agent | Its criterion holds (69 entries, all OK); blocked for ever by a parked task. Close. **close** |
| 33 | ZN-155 | Parity gate: all 63 example entries OK, conformance 61/... | parity | S | 45 | agent | The gate of the goal. The list proves the interpreter only: add an AOT and a QuickJS column, then the audits. **split** |
| 34 | ZN-568 | Web environment module for QuickJS contexts (DOM/BOM, e... | feature | L | 45 | agent | window, DOM subset, events, rAF, fetch, storage: what nine JS libraries lack to run unchanged. **split** |
| 35 | ZN-569 | Image, ImageBitmap and FontFace in the web environment | feature | M | 46 | agent | Image and createImageBitmap on the vendored decoders: the textured truck of webgl-studio, real pixels for every library. |
| 36 | ZN-574 | Gamepad for JS libraries: W3C standard mapping and type... | feature | S | 45 | agent | Gamepads through SDL3 with the W3C mapping. Listed behind an evdev task of the Pi SDK that macOS does not need. **split** |
| 37 | ZN-583.01 | zinc:physics2d: 2D rigid bodies on Box2D v3 | feature | M | 44 | agent | Box2D v3 as a plugin. No demo waits on it since the pinball moved to Jolt; the physics of 2D games. |
| 38 | ZN-567 | WebGL binding fast paths (typed arrays, draw validation... | perf | M | 40 | agent | Typed-array arguments cost 1.3 us instead of 0.1; the PixiJS demo's frame gates need the fix. |
| 39 | ZN-570 | Canvas 2D, text-first tier | feature | L | 41 | agent | Canvas 2D for QuickJS, text first: the text of every WebGL game library. **split** |
| 40 | ZN-578 | Demo: PixiJS v8 sprite demo with FPS gates | feature | M | 46 | agent | First unmodified JS game library with FPS gates: PixiJS 8 bunnymark. |

Reading it by lane, with both agents on M27: the loop's path is ZN-263, the small defects, ZN-612, ZN-369, ZN-371, then the tasks from rank
27 on in order, whatever their lane. When an agent frees up, hand it the first unclaimed `agent` task: ZN-373 (after its split), the
kiosk packaging (ZN-321, ZN-430, ZN-652), ZN-155, then the JavaScript library lane.

## 6. What moved most

Positions are among the 294 tasks the tool can return, under this morning's groups and ordinals against the new ones.

**Up**

| Task | From, to | Why |
|---|---|---|
| ZN-609 `zinc test` on a stock macOS | 132 to 21 | An S defect every new user on a Mac hits; it sat in the tail no group claimed. |
| ZN-155 parity gate (with ZN-154) | 122 to 33 | The measure of the project's goal; unreachable behind a parked task. |
| ZN-566 QuickJS robustness | 103 to 22 | A crash, S, 17 tasks behind it; it was in the last Mac group. |
| ZN-581 GPU sprites | 115 to 43 | The native bunnymark and the museum's photo cards. |
| ZN-430 `.zapp` launch | 81 to 29 | 2 s and 500 MB to start a packed app with assets; the kiosk. |
| ZN-576 MSAA for WebGL | 77 to 27 | Jagged edges in every WebGL demo; S. |
| ZN-565 WebGL binding defects | 75 to 31 | Three libraries fail on them. |
| JS library lane: ZN-568, ZN-574, ZN-578 | 104 to 34, 110 to 36, 113 to 40 | From the last Mac group to the 30s: isolated work an agent can take, with a visible demo at the end. |
| ZN-160, ZN-158 language forms, typed arrays | 125 to 59, 123 to 66 | Everyday TypeScript the checker rejects; they waited behind the blocked parity gate. |
| ZN-376 function identity | 127 to 73 | `f === f` is false: wrong output in the language core. |

ZN-263 moves less in position (24 to 2) but goes from unreachable to the loop's first task. The other UI style tasks keep roughly their place
(ZN-274 28 to 41, ZN-275 29 to 42, ZN-261 22 to 44, ZN-262 23 to 47); what changes is that they can start.

**Down**

| Task | From, to | Why |
|---|---|---|
| ZN-418 packed numeric arrays | 16 to 113 | L, deep in the runtime, memory nobody asked for; it stood early by ordinal while blocked by a parked task. |
| ZN-596 QuickJS fast calls | 18 to 91 | 40 to 28 ns per call: the `perf` label put it at the head. |
| ZN-597 three.js math accelerators | 19 to 92 | Same; it belongs with the three.js demo it lifts. |
| ZN-601 QuickJS binding rules | 20 to 87 | A doc and a gate. |
| ZN-278 style capability levels | 30 to 125 | Its criterion is an ESP32 image size. |
| ZN-364.01 Animated native driver | 31 to 116 | Nothing a user sees; needs the parked property slots. |
| ZN-266 clip-path | 27 to 105 | Few apps need it; after the other style features. |
| Renderer leftovers ZN-180, 182, 183, 184, 185, 186, 202 | 58 to 114 and alike | Overtaken by ZN-412 and ZN-590 (section 7.2); four of them close or merge. |
| ZN-260, ZN-264, ZN-265 box-shadow, group opacity, filters | 21 to 74, 25 to 75, 26 to 67 | Still features, behind transforms, transitions, gradients and object-fit. They were early by ordinal in a group where nothing could start. |
| ZN-640, ZN-641, ZN-642, ZN-634 developer-tool follow-ups | 49 to 102 and alike | Filed with ordinals inside the developer tools group, so ahead of every feature behind it. |

## 7. Why the old order starved the features

### 7.1 A leading group that refills itself

`priority.json` takes the first group with a startable task. Every follow-up of a performance task carries `m-21` or the `perf` label, so it
entered the leading group. The launch thread ran ZN-592, .01, .03, .05, .06, .07, ZN-648 and ZN-654, and the loop itself judged two of its
steps not worth doing. The new `groups` have no leading group except M27: a follow-up filed with a default ordinal (above 125000) lands
behind the ranked Mac tasks and before the cross-platform pass; to put it earlier, give it an ordinal between two ranked tasks (the steps of
1000 leave room).

### 7.2 The UI group had nothing to start

Of the 125 Mac tasks, 46 can start with the files as they are, and none of them is a UI style task. The style tasks were filed
on 2026-10-07 with dependencies on the renderer roadmap (R2, R3, R5). Since then:

| Dependency | State | Blocks | Proposal |
|---|---|---|---|
| ZN-178 batch planner | Superseded. Checked: `plugins/display-gl/src/gl_renderer.cpp` no longer exists; batching lives in `runtime/gl_replay.cpp` (ZN-412). | ZN-260, ZN-264, ZN-265 | Read hero's draw calls per frame in the replay's statistics; close. |
| ZN-181 LINE/POLY on the GPU | Done by ZN-590.01/.02 (D61, D62). | ZN-266 | Close. |
| ZN-180 direct replay | Superseded by ZN-412. | none | Close. |
| ZN-182 atlas manager | Not needed by its dependents: checked, the replay computes gradient paints in the shader (ZN-590.04) and images are textures already. | ZN-261, ZN-262 | Drop the two dependencies; ZN-182 goes to the hardening batch. |
| ZN-183 capability table and quirks | Matters for Pi and Mali drivers; `ZINC_RENDERER=cpu, gl, auto` covers the Mac. | ZN-265, ZN-278 | Drop it from ZN-265. |
| ZN-191 property slots | **Parked** on a measurement. RULES section 6: nothing in the main chain may depend on a parked task. | ZN-263, ZN-274, ZN-364.01, and through them ZN-275, ZN-361.01 | Drop it from ZN-263 (it needs a 2D matrix, not slots) and from ZN-274 (move its "records nothing per frame" criterion to ZN-364.01). ZN-364.01 keeps it. |

The same pattern outside the UI: ZN-321 and ZN-325 wait on the parent ZN-320, which is parked for its AppImage part while its macOS part is
done; ZN-154 waits on the parked ZN-134; ZN-574 waits on an evdev task of the Pi SDK; ZN-354 waits on a CI workflow for one of its three
criteria; ZN-418 waits on the parked ZN-145. With the edits, 52 Mac tasks can start.

### 7.3 Cross-platform tasks outside the last groups

Under this morning's groups 16 tasks of the cross-platform pass were not in a last group. Nine sat in "3D and WebGL" through its title
pattern (ZN-536, ZN-537, ZN-540, ZN-542 of the Pi milestone, ZN-489, ZN-493, ZN-495, ZN-479 of the handhelds, ZN-530 of the CHIP); ZN-536 was
startable and the loop would have taken it as Mac work. Six were the plugin CI chain behind the Linux sysroots, one the RGB565 raster. And one
Mac task was deferred by accident: the pattern `[Cc]ross` matches "a**cross**" in ZN-423 ("LTO across runtime, host and program").

### 7.4 What the Review column hides

46 tasks are in Review; the tool counts them as done for their dependents and never returns them. Most wait on the cross-platform pass
or on the owner. 14 can be closed now (section 8). Some hold open work that no task carries: it is listed in section 10.

## 8. Close, merge, split, and the dependency edits

**Close (21)**

| Task | Reason |
|---|---|
| ZN-154 | Its criterion holds: `tests/examples.lst` has 69 entries, all OK; pixel rows are in the proto manifest (33 equal, 9 known, 22 without a prototype frame). |
| ZN-178, ZN-180, ZN-181 | Superseded or done (7.2). ZN-178 after one reading of hero's draw calls. |
| ZN-202 | Path renderer research: answered by D61 and D62. |
| ZN-387 | Probably fixed: `hostSys` is now an inline variable in `include/zn/host.h`. Build the target `native_plugins_test` once to confirm. |
| ZN-320 | Parent whose parts are done or parked on their own; its `parked` label blocks ZN-321 and ZN-325. |
| Review: ZN-593.01, ZN-593.02, ZN-593.03 | Every criterion ticked, or landed (d3fbd202, 6f75cf27). |
| Review: ZN-295, ZN-295.01, ZN-299 | The simulator chain is done according to RESUME. |
| Review: ZN-063, ZN-077, ZN-086, ZN-150, ZN-192, ZN-193 | The open criterion moved to another task, is met since (inferno-todo and sensor-hub are OK in the list), or was answered by a decision (D36). |
| Review: ZN-239, ZN-244 | The open criterion was refused on purpose (D27: NSOpenPanel over SDL_DIALOG, IOKit over SDL_POWER). |

**Merge (5)**: ZN-330.03 into ZN-592.04 (macOS is done by ZN-592.01 and .06; Linux is what is left). ZN-185 into ZN-416 (the same pipelining of
script and raster). ZN-485 into ZN-480 (the PSP AOT spike is the PSP part of the handheld AOT task). ZN-517 into ZN-549 (the GPIO v2 backend,
filed once for the CHIP and once for the Pi). ZN-527 into ZN-552 (evdev gamepads, same).

**Split (29)**, one line each; the JSON has the same text per task.

| Task | Split |
|---|---|
| ZN-371 debugger | .01 line table from the frontend through IR to ZBC, errors print file:line; .02 interpreter hook: breakpoints, stepping, stack, locals; .03 CDP Debugger and Runtime; .04 DAP `zinc debug`; .05 watches, conditional breakpoints. |
| ZN-373 Zinc Inspector | .01 discovery, Elements, styles, Console, Network, screencast on today's protocol (no dependency); .02 live editing after ZN-369; .03 Sources after ZN-371; .04 Linux and the Pi over ssh (cross-platform pass). |
| ZN-263 transforms | .01 the 2D matrix in the raster and the GL replay; .02 style keys, origin, hit testing. |
| ZN-649.04, ZN-650.07 editors | Each in two: the structural view with save, load, undo; then the property panels, preview and the rest. |
| ZN-581 GPU sprites | .01 the row and the software reference; .02 the GL batches. |
| ZN-261 gradients | .01 linear with angle and N stops; .02 radial, repeating, conic. |
| ZN-265 filters | .01 software blur, brightness, grayscale; .02 backdrop-blur and the GL pass; the Pi 3 criterion to the pass. |
| ZN-274 transitions | Move the "records nothing per frame" criterion to ZN-364.01. |
| ZN-155 parity gate | .01 AOT and `--engine quickjs` columns in `tools/examples-status`, a task per failing demo; .02 the audits as scripts. |
| ZN-568, ZN-570, ZN-573 | By milestone: first the part that makes PixiJS and three boot; first bitmap and images, then text; first the graph, then the Web Audio nodes. |
| ZN-574 gamepad | .01 macOS through SDL3 with the W3C mapping; .02 Linux evdev with ZN-552. |
| ZN-434, ZN-436, ZN-440 | Asset graph: importers first, then font baker and packs. zinc:assets v2: mounts and groups, then budgets and threads. Audio: streamed decode from files now, packs later. |
| ZN-354 plugin starter | .01 `zinc new plugin` now; .02 its CI after ZN-338. |
| ZN-161 | By family; Object statics first. |
| Criteria that need another machine: ZN-429, ZN-439, ZN-444, ZN-445, ZN-446, ZN-571, ZN-278 | Keep the Mac half; move the Linux, ARM, Pi 3 or ESP32 criterion to a task of the cross-platform pass. ZN-583's AC4 the same. |
| Deferred by one word of the title: ZN-391, ZN-143, ZN-164 | ZN-391: the macOS half of double-click `.zapp` is S. ZN-143: the Atelier's editor, run and profiler views are Mac work and a visible app; simulators stay deferred. ZN-164: the per-program link split is Mac work; the armv6 and ESP32 size gates stay. |

Thresholds written "on the M1 Pro" (ZN-567, ZN-596, ZN-597) must be restated for the Intel Mac, as ratios.

**Dependency edits** (`deps_drop` and `deps_add` in the JSON)

| Task | Drop | Add |
|---|---|---|
| ZN-263, ZN-274 | ZN-191 | |
| ZN-261, ZN-262 | ZN-182 | |
| ZN-260, ZN-264 | ZN-178 | |
| ZN-265 | ZN-178, ZN-183 | |
| ZN-321, ZN-325 | ZN-320 | |
| ZN-154 | ZN-134 | |
| ZN-574 | ZN-552 | |
| ZN-354 | ZN-338 | |
| ZN-418 | ZN-145 | |
| ZN-650.03 | | ZN-263, ZN-432 |
| ZN-650.06 | | ZN-263 |

**Overlaps to settle before the work starts**

- A player without the compiler (the VM and the host only) is asked three times: ZN-392 (fuse for Linux), ZN-620 (mobile), ZN-455 (handheld
  cores). Design it once.
- The two hardware reports filed overlapping 3D paths per console: ZN-476 and ZN-491 (PSP), ZN-470, ZN-477 and ZN-493 (Vita, where ZN-493
  assumes the answer of the spike ZN-470), ZN-469, ZN-478 and ZN-495 (3DS). ZN-453's decision record is the place.
- ZN-453, ZN-512 and ZN-513 are partly done by ZN-414 (the profiles and the armv7 target exist): re-scope them.
- Device-only tasks should carry `needs-board` and be parked (RULES section 6): the eight iPhone 4S tasks (ZN-461, 462, 466, 475, 479, 483,
  497, 498: no emulator exists), ZN-488 (PSP), ZN-515, ZN-525, ZN-526 (CHIP), ZN-534, ZN-548, ZN-561 (Pi).

## 9. The hardening pass, batched

These rank from about 70 to 125. Do them as one pass of a few sessions after M27, the debugging tools and the first UI features, or
earlier only when one blocks a feature.

- Launch, size and memory: ZN-423, ZN-418, ZN-330.04, ZN-653.
- Renderer leftovers: ZN-182, ZN-183, ZN-184, ZN-186.
- QuickJS boundary and engine: ZN-596, ZN-597, ZN-601, ZN-575, ZN-445, ZN-582, ZN-587, ZN-586.
- Developer-tool follow-ups: ZN-634, ZN-639, ZN-640, ZN-641, ZN-642.
- Tests and build: ZN-394, ZN-395.
- Architecture: ZN-396, ZN-591, ZN-278, ZN-364.01.

Kept out of the batch, because a user hits them: ZN-376 (function identity), ZN-643 and ZN-644 (output before a blocking call), ZN-610 (MQTT
over TLS 1.3 hangs), ZN-388 and ZN-389 (React Native layout and typing gaps).

## 10. Tasks to file

Besides the four of section 4:

| What | Where it comes from | Kind |
|---|---|---|
| The 30 style scenes through the GL replay | ZN-277 AC3, ZN-257 AC1. The window draws with the GL replay by default since ZN-412; the style suite is checked on the software raster only. | A check that can find wrong frames. S to M. |
| Duplicate nested and top-level names give invalid IR | ZN-147: found by the fuzzer, fixture in `tests/fuzz/regress`, never filed. | Defect. |
| A closure that refers to itself is never freed | ZN-162 AC2, ZN-063 (`const poll = () => setTimeout(poll)`). | Defect (leak). |
| Multiple windows | ZN-249: the second half was to be split out and never was. | Feature; against Tauri and Electron it would rank in the first 30. |
| MQTT will, auth, QoS 2; ReadableStream; the `@frame` lint; the `sys_process` race | ZN-086, ZN-095, ZN-192, ZN-312 | Small; hardening batch. |
| Demos under AOT and QuickJS | No table says which of the 69 entries run compiled or under `--engine quickjs`; hero's AOT build found no assets until today (ZN-314). | ZN-155.01 above. |

## 11. The cross-platform pass and the parked tasks

169 tasks, from rank 126, none moved forward. Inside the pass the order is by phase, then by dependency and score:

1. **Linux desktop** (and the three re-measures that need the Apple Silicon Mac): ZN-391, ZN-334, ZN-392, ZN-563.01, ZN-651, the plugin CI
   chain (ZN-338 and five behind it), ZN-592.04, ZN-246. The museum table makes this phase worth more: its real machine is a touch table.
2. **Raspberry Pi**: the SDK (ZN-535 first: its modules wait on it), three.js on vc4, the Pi halves of today's GPU work.
3. **ESP32, simulators, Arduino**: ZN-611 (the pinned QEMU archive holds an arm64 binary: ESP32 runs fail on this Mac), the Atelier, the
   Arduino interop.
4. **iOS and Android** (M26).
5. **Handhelds** (M23): the Mac-provable groundwork first (ZN-453, ZN-454, ZN-455, ZN-467, ZN-489, ZN-490), the eleven showcase demos with
   hardware receipts last.
6. **NTC CHIP** (M24).
7. **PS1, PS2, wasm leftovers.**

Seven dependencies of deferred tasks point at a parked one (ZN-246, ZN-560, ZN-419 twice, ZN-143, ZN-530, ZN-156).

Parked (41, from rank 295) stay parked. Three notes: ZN-320 should close (above). ZN-191 is parked on a measurement, not on
a missing board: unpark it, narrowed to transform and opacity, only when ZN-364.01 is wanted. ZN-187, ZN-188 and ZN-200 were parked while the GL
renderer was another developer's uncommitted work; that reason is gone, so they are candidates to unpark with the wasm and iOS work.

## 12. Groups, ordinals and the simulation

Ordinals are the rank times 1000, over all 381 tasks: Mac work 1 to 125, the pass from 126, parked from
295, Review from 336.

The new `groups` are three:

1. **The showcase group**, as the coordinator wrote it (milestone `m-27`), plus a title pattern that claims the two engine tasks the demos wait
   on (ZN-432, ZN-263), so that they rank inside the block and not behind it.
2. **The cross-platform pass**: the owner's deferred group with three changes, all extensions. Its first pattern is `\b[Cc]ross` (ZN-423 comes
   back to the Mac). Its patterns gain the plugin CI chain and `RGB565` (seven tasks it missed). Its milestones gain M23 to M26, and it stands
   before the handheld group.
3. **The handheld and board group**, unchanged. With the change above it claims nothing today and stays as a net.

Why the third change: the tool lets a last group claim by title before any milestone, so this morning the pass was already two buckets cut
by an accident of wording (ZN-454 "Console system host" in one, ZN-453 "Handheld targets", which it depends on, in the other, later). One
bucket in ordinal order keeps every dependency in order. Which tasks are last does not change. To undo it, list the handheld group first and
remove M23 to M26 from the other; the ordinals still hold.

The eight groups in between (performance, ui, packaging, developer tools, desktop, rendering, 3D, games) are gone: everything they held is in
ordinal order.

**Simulation.** The script reproduces `group_of` and the sort of `tools/next-task` with the new groups and ordinals: the simulated order
equals the ranked list for the 294 tasks of the `now` and `deferred` sections (parked and Review tasks are never returned). After the
dependency edits no Mac task ranks before a task it depends on, with one exception kept on purpose: ZN-364.01 depends on the parked ZN-191.

## 13. Open questions for the owner

1. **Mobile on the Mac.** M26 is in the last group by your grouping. Five of its tasks are proven on the development Mac without Xcode or the
   Android SDK (ZN-618 profiles, ZN-619 vendoring, ZN-620 static engine library, ZN-621 and ZN-623 project generators as golden trees); the
   simulator runs need Xcode installed. Do these five move to the Mac work, or does mobile wait whole?
2. **The machine of the museum table.** A Mac has no touch screen; Linux is in the cross-platform pass; Windows is parked (ZN-054). Which one
   drives the table decides whether the Linux desktop phase starts before the rest of the pass.
3. **Multiple windows.** Not in the backlog (section 10). Wanted now?
4. **Every millisecond.** The launch thread stopped at 7.0 ms against 4.9 for an empty program, by the loop's own measurements. Is tracking
   enough, or must tasks of that kind still lead when they are filed?
5. **The agents after M27.** The list gives them the Inspector app, the kiosk packaging and the parity gate, then the JavaScript library lane.
   If you would rather see the native game tier first (physics2d, atlases, zinc:game), say so: it is a change of five value marks.

## 14. Counts

- Open: 381. Mac work 125 (the M27 block 17), cross-platform pass 169, parked 41, Review 46.
- Mac work by class: feature 68, hardening 15, perf 15, defect 12, parity 5, docs 4, research 3, tooling 3.
- Mac work by size: M 62, L 34, S 29. By lane: agent 82, loop 43.
- Review by class: cross 16, feature 9, tooling 5, hardening 5, parity 4, defect 3, research 2, perf 2.
- Actions over all tasks: keep 326, split 29, close 21, merge 5.

## 15. What was not assessed

- Nothing was built or run: "probably fixed" (ZN-387) and "superseded" (ZN-178) each need the one check named.
- The 46 Review tasks were judged from their text and notes, not by re-running their criteria.
- Marks inside the cross-platform pass are coarse (family by family); the order there is by phase and dependency first.
- The backlog changed during the review; the JSON is the state at the last run. A task filed after it has no line.
