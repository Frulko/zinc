# Zinc Next: rules of engagement

Binding for every session, next to `ARCHITECTURE.md` (layout) and `TESTING.md` (tiers). The aim of these rules: the backlog runs to the end without waiting for a person.
Owner's instructions of 2026-10-07 are the source; if a rule here and a task disagree, the rule wins.

## 1. The goal that every task serves

Every demo of the prototype (`examples/*`, every entry of every `zinc.json`) runs on this engine **without changing its source**, on the interpreter, the AOT and (where it applies) `--engine quickjs`, with the plugins of `plugins/*`
working through their simulators. The engine stays **agnostic** (no target or plugin special cases in the core), **pluggable** (modules, plugins, HALs, engines behind one ABI each), **maintainable**, **readable** and **fast**
(measured, never assumed). The parity matrix is `docs/reports/parity/` (audit of 2026-10-07); the backlog is derived from it.

## 2. Never stop, never wait

A task never ends in "needs a person". When something seems to block, apply the first line that fits:

| Obstacle | What to do |
|---|---|
| No hardware (ESP32, Pi, reMarkable, panels, PS1/PS2, camera, IMU) | Use the **simulator or emulator** as the prototype did: QEMU, Espressif QEMU, PCSX-Redux, the in-process panel emulators, fake camera/IMU, `zinc device-sim`. A task is Done on the simulator. A real-board run is a separate task labelled `needs-board`, parked (see §6), never a dependency. |
| Windows | Out of scope until the owner says otherwise (label `windows`, parked). Keep code portable (no new POSIX-only assumptions in `include/zn`, `src/frontend`, `src/ir`, `src/zbc`, `src/vm`). |
| A decision (library, design, trade-off) | **Decide it yourself**: research (§3), score the options (§4), write the decision record (§5), proceed. Do not ask. |
| A task is too big | Split it into subtasks with `backlog task create --parent <id>`, each with precise acceptance criteria, and do the first one. |
| A test fails twice | Write the failing case as a test, find the root cause (not the symptom), fix it once where all callers route through. If it is a prior bug in another module, fix it there in its own commit. |
| Missing third-party code | Vendor a proven library (§3). Never write a regex engine, a TLS stack, a font rasterizer, an SQL engine, a video decoder, a JSON parser or similar from scratch. |
| An unclear requirement | The prototype is the specification: read its code and docs, run it (`node compiler/bin/zinc.mjs ...`) and match its observable behaviour. |
| Budget overrun (>1.5x size) | Re-plan: split and continue; record the cost in the task notes. Not a stop. |
| Uncommitted changes of others | Never touch or commit them; work around them with explicit paths. |

The only reasons to end a session without a next task are: the backlog has no startable task left, or the owner said stop. Then print `STOP: <reason>`.
Irreversible or outward-facing actions (publishing, pushing, deleting data, spending money, sending messages) still need the owner: do everything up to that step and record the exact command in the task notes.

## 3. Proven libraries first, with research

Before writing any non-trivial component: (1) read what the prototype did (`runtime/`, `plugins/*/native`, `compiler/src`) and reuse its code through its existing headers when it is good; (2) search the web and the owner's sources
(`docs/reports/research-2026-09-30/`, `docs/reports/parity/04-library-choices.md`) for a mature library; (3) vendor it under `third_party/<name>/` with its licence, a pinned version or commit, the checksum of the archive, a
`third_party/README.md` row, a build that works with clang and `zig c++` and needs no install step. Licences: MIT, BSD, Apache-2.0, zlib, ISC, public domain; LGPL/GPL only as a separately loaded plugin library, never linked into the core.
Wrap the library behind a small interface owned by us (one header per module) so it can be replaced.

## 4. Decisions: weighted, written, quick

Score each option 1-5 on: **fit** with the goal (§1) x3, **performance** x3, **size/footprint** x2 (embedded targets matter), **maintainability/readability** x2, **licence and supply risk** x2, **portability** x1, **effort** x1.
Take the highest total; on a tie take the one with fewer moving parts. A decision takes at most one session. Reversible choices are made at once; keep them behind an interface.

## 5. Decision records

Each decision is a section in `docs/reports/zinc-next-decisions.md` (next number): the question, the options with the scores, the choice, the evidence (URLs, measurements, commands), what would make us revisit. Link it from the task notes.
Measurements beat opinions: when speed or size is the criterion, measure with `tools/bench-m4`, `tools/resmon`, `size`, not estimates.

## 6. Parking

A task that truly cannot proceed (needs a real board, Windows, a paid account) gets the label `parked` and the reason in its notes, and its `ordinal` moves to 90000+. `tools/next-task` skips `parked` tasks and tasks whose dependencies are not Done or Review.
Nothing in the main chain may depend on a parked task.

## 7. Quality bar for every commit

- Warning-free builds (`-Wall -Wextra`) on clang and `zig c++` (and gcc in the Linux container); one T0 test per new module; behaviour changes have a golden or an expectation test; a fix of a bug gets a regression test.
- No target, plugin or demo names inside the core (`src/frontend`, `src/ir`, `src/zbc`, `src/vm`, `src/rt`): they go through tables, the plugin ABI or the host library.
- Public headers small, one per module; no globals; the dependency direction of `ARCHITECTURE.md`.
- Performance-relevant changes ship with a before/after number in the commit body or the task notes. A regression of more than 15% in `tools/bench-m4 --check-regressions` is fixed before moving on.
- Comments say why, not what; names carry the meaning; a function that needs a comment to be understood is split.
- Docs in English, one short page per module under `docs/reports/zinc-next-*.md`, updated in the same commit.
- Commits: English, conventional, no co-author, explicit paths, never `git add .`.

## 8. Working loop

`/loop /zn-start` picks the next task (`tools/next-task`), works it start to end, then `/zn-end`. Use sub-agents for research and for independent investigations (several at once when the questions are independent); keep their findings in `docs/reports/`.
Run only the tier that proves the change; run T2 before closing a milestone. Keep `RESUME.md` short and true.


## Testing is targeted (owner, 2026-10-08)

A task ends with its own test and `tests/run --changed`, nothing else. The 42 demos (`tools/proto-capture compare --all`), `examples_all`, T2, benchmarks, fuzz and full profile runs are milestone jobs, started in the background, never waited for. Details and the reasons: `TESTING.md`, "What to run".
