# Backlog review 2026-11-07: shard A (66 tasks)

Verdicts: 1 done, 3 done-partly, 6 rewrite, 21 keep, 35 park, 0 drop, 0 merge.

## Findings
- ZN-147 (fuzzing) is done: `tools/fuzz`, `tools/libfuzzer`, the T2 gate `tests/t2/fuzz.sh`, ten-minute runs in `docs/reports/zinc-next-fuzzing.md`.
- Most of the shard is parked work: the 15-task bare-metal Pi chain (ZN-207 to ZN-222), PS1/PS2 (ZN-121, 137, 156, 195-197), ESP32 raster, Linux D-Bus and tray, the Windows host, the Linux/ARM runner. None is workable on the Mac now; the Pi runs the Linux image.
- ZN-257 (border model) is mostly shipped (dashed, per-side colour, per-corner radius, `tests/t1/style_border.sh`): left are the GL-tier compare and `box-border-layout`. ZN-243 (macOS deep links) and ZN-249 (vibrancy) are also partly there.
- ZN-203.06 and ZN-203.09 ask "every conformance page passes", which cannot close in one session: rewritten to a bounded batch plus recorded exceptions. They overlap ZN-701/702 on five pages.
- ZN-158 (typed arrays) is not in the language beyond web shims; it is also a `later.md` line (ZN-typed-arrays, line 685). Keep one, the task.
- ZN-161.03 (Intl) overlaps the zinc:i18n line of `later.md`. ZN-263.02 supersedes ZN-361.01 (other shard).
- ZN-184 (instancing) may already be done (`runtime/gl_replay.cpp:35,106`); the verdict asks for a quick check.
- ZN-162: the TDZ part is done; only the closure-cycle leak remains (deep runtime work).
- ZN-1002 is kept, parked by the owner. No assignees in this shard.

## The ten that matter most
1. ZN-158 typed arrays: games, web APIs and speed all need them.
2. ZN-182 glyph atlas pages and eviction: a crash-class gap when the atlas fills.
3. ZN-183 GL quirks table and `ZINC_GL_QUIRK` fallback: safety on odd GPUs.
4. ZN-275 keyframes and `animate-*`, with the reduced-motion hold (accessibility).
5. ZN-291 Layout modes page: docs only, one short session.
6. ZN-164 host library split and size gate (Mac part): smaller programs everywhere.
7. ZN-263.02 transform origin and rotate goldens.
8. ZN-179 hash-diff damage joining (S) and ZN-184 instancing check (S): quick wins.
9. ZN-257 finish: GL golden and `box-border-layout`.
10. ZN-143 Atelier profile view, and ZN-221 device repl (unparked, doable on device-sim).

## Surprises
Several UI-style tasks (ZN-260, 264, 265, 275, 263.02) show no trace in `lib/std/ui.ts` or `src/`: they are real to-do items, not stale. Marks for parked tasks are left empty by design.
