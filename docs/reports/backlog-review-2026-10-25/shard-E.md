# Shard E review: rendering and media (m-8), UI style system (m-17), developer tools (m-20)

55 tasks, none assigned. Verdicts: drop 11, review-close 10, keep 12, park 7, rewrite 5, done-partly 4, done 4, merge 2.
Details per task are in `shard-E.json`. Evidence for some verdicts is a grep, not a run; no test was executed.

## Notable findings

- **WebGL is finished.** `tests/golden/webgl/conformance-pass.txt` lists 696 pages; the failures file records the rest. The umbrella ZN-203 and its three Review children (203.05, .06, .09) can close. What is left is the AMD-driver list (ZN-701 keep, ZN-702 drop).
- **Agent and Inspector are finished.** ZN-729 and ZN-373 have all Mac subtasks Done. ZN-729.04 waits only for the owner to run `zinc agent install` once; close it and keep the command in `later.md`. ZN-373.06 (Linux, Pi) is mostly covered by the agent.
- **Old R-series render roadmap is dead weight.** ZN-177, 190, 191 were parked on measurements (ranks and slots save almost nothing); ZN-200 is superseded by D30; ZN-187/188 (JS WebGL replay of the Scene) were never needed since the web target draws with Canvas 2D. 191 is merged into ZN-364.01, which is its only real user. The PS1/PS2/ESP32 backends (194-197) are parked for the cross pass or later.
- **Instancing (ZN-184) exists** in `runtime/gl_replay.cpp` with caps detection.
- **UI transforms are mostly in:** `lib/std/ui.ts` already paints rotate, skew and uneven scale through `setTransform`. ZN-361.01 merges into ZN-263.02, which now only needs transform-origin and goldens.
- **Prototype leftovers:** ZN-641 and ZN-642 only serve the removed Node prototype: drop.
- **Review tasks to close:** 179, 189, 203.05, 203.06, 203.09, 257, 268, 277, 371.06, 729.04. Open leftovers go to ZN-278 or `later.md`.
- **Duplicates:** 191 into 364.01; 361.01 into 263.02. 704 and 709 are close cousins (real DevTools frontend) but separate domains; they could be one session.
- **Not done in the UI style set:** group opacity/blend (264), blur (265), keyframes and `animate-*` presets (275), layered/inset shadows (260). `clip-path` (266) is dropped: no user.

## The 10 that matter most

1. ZN-275 keyframes and `animate-spin/pulse/ping`: spinners and skeletons are everywhere in kits.
2. ZN-265 blur and backdrop-blur: modern overlays in Nuxt UI and shadcn.
3. ZN-260 layered and inset shadows: fidelity for ported UIs.
4. ZN-364.01 native-driver animation (with slots): smooth on slow devices.
5. ZN-263.02 transform origin and goldens: small, finishes a feature.
6. ZN-264 group opacity and blend modes: a CSS fidelity gap.
7. ZN-644 and ZN-643 output ordering and leaking: small real bugs touching `zinc mem --json` and prompts.
8. ZN-640 and ZN-639: masking secrets in the HAR, and a flaky parallel test.
9. ZN-709 Sources panel in the real Chrome DevTools: a strong story for JS users.
10. ZN-703 identical Math bits on every CPU: removes tolerance hacks in goldens; risky and large.

## Surprises

- ZN-291: `rn` is already `true` for wasm, rpi1 and ps2 in `capabilities.json`, yet the "Layout modes" page in `docs/ui.md` does not exist, and nothing says those values were measured.
- ZN-371.06 is blocked only by macOS developer mode (`DevToolsSecurity`), not by code.
