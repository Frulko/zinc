# later.md, "Engine and tools" (lines 7 to 554): review

532 lines reviewed. Result: `later-engine.json` (one object per line).

| Verdict | Lines |
|---|---|
| drop | 293 |
| keep | 212 |
| promote | 20 (in 7 tasks, 3.8% of the lines) |
| done | 5 |
| duplicate | 2 |

## Promoted tasks (7)

1. **Promise.then flattens a returned promise** (line 54, m-13, S). Checked: `Promise.resolve(1).then(x => Promise.resolve(x+1))` still types as Promise<Promise<number>> (Z0107 on `'' + ...`). The parity gate's most visible gap, hit by `fetch(u).then(r => r.text())`.
2. **Typed numbers agree on --engine quickjs** (line 141, m-13, M). `src/qjs/strip.cpp` blanks the types and emits no wrap or rounding, so i32/u8/f32 results differ from the interpreter.
3. **Five frontend defects a user program can hit** (lines 263, 392, 393, 406, 412, m-13, M). Map.get of a missing key returns null once the program uses `any` (reproduced: prints `false1`), a compiler SIGSEGV on the camera pattern, an IR verifier failure on `.map` returning JSX, name-keyed narrowing, lost errors in a lambda field initialiser.
4. **zinc monitor / zinc:fs watch hardening** (lines 71, 73, m-10, S). `zinc monitor --udp` still binds INADDR_ANY (src/cli_core.cpp:3635).
5. **Four export/build defects** (lines 159, 331, 382, 554, m-19, M): `--bundle` as last argument, relative `-o` with `--apk`, deterministic export compiling a fake plugin, ESP32 `flash.sh` erasing NVS.
6. **zinc check / zinc dev diagnostics for QuickJS and JavaScript projects** (lines 11, 13, 220, m-10, M).
7. **First-project polish** (lines 478, 479, 480, 497, m-17, M): `lib/ui.d.ts` is still a placeholder, `app.window` needs `app.id`, no kit Input/Textarea (lib/std/kit has none).

## Done (5)
- 55 (`-0` prints 0), 56 (array-pattern defaults work, run on build/zinc), 75 (docs/guide/06-testing.md already describes `zinc build --debug`), 178 (webgl hook in src/main.cpp:1932), 207 (for-of with await on a field of the loop variable runs).

## Notable drops
- 53: `zinc ui` and its Node tools died with the prototype (no `compiler/`, no `ui` command).
- 87, 121, 224: serve or describe the removed prototype / its parity gate.
- Most of the ZN-774 Atelier/i18n/site polish, ZN-742 Fast Refresh edge cases, ZN-729 agent edge cases, upstream reports and "needs a board / Apple account / owner's machine" items: drop, because nobody meets them and the owner's priority is Mac, UI and performance first.
- ESP32/mquickjs, console, iOS/Android lines that survive are `keep` for the cross-platform pass; the pure measures and hand checks are dropped.

## Duplicates
- 145 is line 39 (`font('mono')` returns -1); 296 is line 108 (host events on QuickJS).

## Notes
- Verdicts "keep" are deliberately generous for performance and UI items close to the owner's goal (ZN-731, 726, 746, 735, 774.18 pressable/RN items); the coordinator can thin them.
- Not checked against open task files line by line; lines whose id names an open task (ZN-772, ZN-742) may already be covered by its criteria.
