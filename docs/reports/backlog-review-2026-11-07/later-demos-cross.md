# Later lines review: Demos and Cross-platform pass (2026-11-07)

Lines reviewed: 447 bullets of `backlog/later.md`, from `## Demos` to the end. Verdicts: promote 292, keep 112, drop 43, merge 0. Promoted tasks: 34 (24 on the Mac lane, 10 for the cross-platform pass).

## Findings

- Already done: `arr.sort()` without a comparator and `x instanceof C` on `string[] | C` both pass `zinc check` now; `plugins/3d/native/render3d.sim.ts` type-checks, so the two tokyo fallback lines are stale. Dropped with that evidence. `toLocaleString` and `JSON.stringify` with a replacer are still refused (promoted in ts-lib-gaps).
- Engine gaps found by demos (fix, never work around) are gathered in four tasks: ts-lib-gaps, ui-gaps, qjs-webenv, canvas2d. They come first among the Mac tasks because they unblock correct demos.
- The iPod, Discord and museum/pinball follow-ups are split per demo and sized S or M so one agent closes each in a session. Lines that need a real account, a real call or by-hand runs stay `keep` (valid, not a task).
- Dropped (43): by-hand runs, measurements taken at milestones, tests over a minute (run at milestones), owner-key steps, ideas with no user (WebGPU, WASI, OSC relay, labs API), duplicates.
- Cross-platform lines are grouped per target: windows-pass (depends on ZN-714), cross-linux, cross-pi, cross-consoles-hw, cross-remarkable, cross-mobile, cross-esp32, cross-android-webos, plus tokyo-psp and tokyo-consoles (console code that PPSSPP, Vita3K and Azahar can partly prove). The Mac-provable shell fixes (ZN-884/888) became a Mac task, shell-fixes.
- The line for the installer (`install.sh` absent from the tree, ZN-711) stays `keep`: it is the largest first-run gap but belongs to the packaging task, not to a later line.

## Promoted tasks

| key | lane | size | lines | title |
|---|---|---|---|---|
| ipod-daemon | mac | M | 11 | iPod daemon: parity with the Mac app for a remote iPod |
| ipod-polish | mac | M | 13 | iPod demo: layout and small usability fixes on the Mac |
| ui-gaps | mac | M | 9 | zinc:ui, JSX and web API gaps found by demos |
| pinball-editor | mac | M | 6 | Pinball editor: rules and scene follow-ups |
| museum-editor | mac | M | 14 | Museum editor: usability gaps |
| qjs-webenv | mac | S | 7 | QuickJS web environment: honour zinc.json and import maps |
| canvas2d | mac | M | 7 | Canvas 2D fidelity and speed for p5 and Phaser sketches |
| audio-gamepad | mac | M | 6 | Web audio and gamepad gaps for the JS games |
| install-update | mac | S | 3 | zinc doctor, zinc update and plugin install polish |
| tokyo-consoles | cross | M | 14 | Tokyo on 3DS and Vita: loading, selection and memory |
| tokyo-psp | cross | M | 12 | Tokyo and zinc:3d on PSP: memory, streaming, CLUT8 |
| world3d | mac | M | 3 | zinc:3d World: shadows switch and glTF night lights |
| sonos | mac | S | 6 | zinc:sonos and iPod Sonos: queue, ports, docs |
| ipod-tests | mac | S | 6 | iPod demo tests: deterministic and independent of the machine |
| ts-lib-gaps | mac | M | 6 | TypeScript and runtime library gaps found by demos |
| zinc-ipod | mac | M | 6 | zinc:ipod plugin: tag and smart-rule gaps |
| ipod-perf | mac | M | 10 | iPod For you and Genius: keep the UI thread free at 10k songs |
| discord-ui | mac | M | 13 | Discord client: layout and message polish at real window sizes |
| discord-session | mac | S | 7 | Discord client: session and login safety |
| cross-pi | cross | M | 20 | Raspberry Pi verification pass |
| cross-android-webos | cross | M | 7 | Android, webOS and TV box device checks |
| windows-pass | cross | M | 11 | Windows pass: locks, capture, secure store, doc server, link |
| cross-linux | cross | M | 23 | Linux pass: backends, decoders, tests |
| cross-esp32 | cross | S | 4 | ESP32: ESP-IDF drivers and workers |
| cross-mobile | cross | S | 6 | Android and iOS lifecycle checks |
| cross-remarkable | cross | M | 9 | reMarkable Paper Pro: app and ink checks |
| cross-consoles-hw | cross | M | 22 | Real PSP, Vita and 3DS measurements |
| tnum | mac | M | 1 | Text: tabular figures through HarfBuzz |
| lint-more | mac | S | 3 | zinc lint: more rules |
| mobile-feel | mac | S | 2 | Mobile feel: canvas alpha and the RN Modal host |
| web-gaps | mac | S | 5 | Web target: dev server and DOM-mode gaps |
| hermes-v8 | mac | M | 8 | Hermes and V8 projects: export, pack, bytecode |
| shell-fixes | mac | M | 9 | zinc:shell: touch routing, lazy listen, ABI check |
| hamlet | mac | S | 3 | Hamlet follow-ups: atlas test and sprite rects |

## Top 10 for the owner's aim (usable, finished on the Mac)

1. ts-lib-gaps, 2. ui-gaps, 3. qjs-webenv (engine gaps behind demos).
4. ipod-perf (a 1.4 s UI freeze at 10k songs), 5. ipod-polish, 6. discord-ui, 7. museum-editor.
8. shell-fixes (the Pi shell), 9. canvas2d, 10. tnum (tabular figures for any UI).

Note: group membership is by line number of `later.md` as of this review; the coordinator should remove the promoted lines and keep or delete the others.
