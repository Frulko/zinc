# Backlog review 2026-11-07: later.md "Engine and tools"

681 bullet lines reviewed (lines 8-748). Verdicts: done 3, drop 87, keep 403, merge 11, promote 177. Promoted tasks: 31.

Method: probes with `build/zinc check` on the checker lines (void, EffectCallback, unions pass; default params, catch any, Promise<void> resolve, Map class to interface, tuple find, async arrow, top-level await still fail), grep of open task titles for duplicates (merges), then grouping by subject. "keep" lines are valid but device-bound, app-specific or without a consumer; they are not tasks now.

## Promoted tasks

- **Checker: function and generic assignability that TypeScript accepts** (M, m-13; lines 9, 46, 557, 590, 623, 723)
- **Async and generic inference gaps: async arrows, ternary await, top-level await, void generics** (M, m-13; lines 33, 34, 45, 48, 377, 420, 426, 427, 445, 567, 577, 713, 724, 422)
- **Methods and mutation on an `any` value (map, filter, join, push, sort, string methods)** (M, m-13; lines 602, 645, 682)
- **JSX gaps: all-optional props, `{list.map(fn)}` with a named or imported function, hyphenated attributes** (M, m-13; lines 257, 479, 484, 485, 627, 644, 679, 678, 722)
- **QuickJS agrees with the interpreter: typed JSON.parse, i32 truncation, Map.get, TOUCH, host events** (M, m-13; lines 32, 639, 686, 323, 416, 158)
- **QuickJS binary data: net bodies, u8 arguments to natives, large WebSocket messages, WebSocket and URL globals** (M, m-14; lines 31, 581, 566, 98, 525)
- **CLI polish: argument order, example suggestions, port 0, clear pairing and export messages** (S, m-10; lines 29, 530, 459, 469, 628, 341, 648, 543, 183, 533)
- **`zinc project --json` and `--json` output for check, steps and plugins** (S, m-10; lines 193, 297)
- **Say what to write: errors for silent no-ops in zinc:ui** (M, m-10; lines 18, 25, 26, 27, 51, 261, 311)
- **UI font fallback: CJK, Persian, arrows and emoji sequences draw as "?"** (M, m-17; lines 28, 270, 438, 475, 563)
- **Inspector polish: six small fixes and a stale test** (S, m-20; lines 480, 495, 501, 502, 503, 504, 481, 500)
- **Tests green on develop: stale goldens, a missing table row, an unbuilt test** (M, m-12; lines 62, 95, 223, 424, 432, 446, 538, 554, 558, 574, 578, 582, 607, 621, 625, 653, 706, 720, 740)
- **zinc:storage: one store per program, not one shared file** (S, m-14; lines 211, 466, 35)
- **Multi-window and worker follow-ups (ZN-864): async handler, window-all-closed, x/y, stale surfaces** (M, m-16; lines 505, 506, 508, 509, 511, 512, 513, 507)
- **First run: build the plugins concurrently, interpret at once while the native build continues** (M, m-12; lines 434, 436, 299)
- **Bulk byte reads and writes: readBytes, utf8Encode, appendBytes, bytes bodies** (M, m-21; lines 169, 395, 687, 419, 699, 378)
- **charCodeAt on a non-ASCII string is quadratic** (S, m-21; lines 80)
- **Allocation speed: JSON.parse in one block, mimalloc TLS slot, mimalloc upgrade** (M, m-21; lines 413, 414, 589)
- **Web dev bridge hardening and speed** (M, m-14; lines 515, 516, 517, 518, 521, 519)
- **zinc:net server limits and streaming bodies** (M, m-14; lines 365, 652, 650)
- **Translations: restamp guides and fill the doc theme strings** (S, m-19; lines 41, 528, 532, 535, 537)
- **Plugin docs: fill plugins/<name>/docs for the main plugins, links to source, site decision** (M, m-19; lines 36, 37, 39, 40, 42)
- **zinc lint and pack: plugin targets, host modules per profile, honest assets error** (S, m-11; lines 81, 83, 228, 335, 403)
- **A failed native plugin build fails loudly** (S, m-9; lines 300, 402)
- **Pointer and keyboard edge cases in zinc:ui** (M, m-17; lines 730, 731, 668, 312, 562, 205)
- **zinc lsp: completion in imports and JSX, auto-import, re-publish dependents, request order** (M, m-20; lines 180, 181, 182, 735)
- **React Native parity: ImageBackground, Image source uri, unstyled Switch/Modal/ActivityIndicator, Pressable hitSlop** (M, m-17; lines 153, 302, 310, 313, 314)
- **Classic layout: CSS conformance of 100% sizes, basis, shrink and flex-1** (M, m-17; lines 202, 203, 204, 497)
- **Headless runs: pace frames in real time on request** (S, m-10; lines 23, 208, 439, 476)
- **zinc dev loop: save-to-frame under 200 ms, side-effect imports, red box keeps state** (M, m-20; lines 215, 222, 224, 225, 226)
- **Open records and interfaces: structural assignment and writes** (M, m-13; lines 456, 462, 464, 483, 486)

## Merges

- ZN-794: line 49 (422 sits in the async group, which leaves flattening to ZN-794); ZN-796: 639 is in group quickjs-parity; ZN-664: 387; ZN-418.01: 685, 745; ZN-587: 429; ZN-569: 127, 128, 522; ZN-161.03: 17; ZN-894: 449, 634

## Done

- Lines 8, 560, 654 work on the current build (probe).

## Notes

- Line 639 stays in group quickjs-parity (ZN-796 owns numbers; the task says so).
- Drops are device tuning, tablet experiments, measure-only ideas and cosmetic items; the reason is on each line of the JSON.
