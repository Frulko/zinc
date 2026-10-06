# Zinc Next: resume

Overwritten at the end of every session. Run `next/tools/status` (or `/zn-resume`) for the live state. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## State (2026-10-07)

- Done: M0 to M6 and the first parity round (examples hero, dashboard, notes, navigation and 13 more run headless; QuickJS engine; packaging; Atelier app; interpreter 5x QuickJS; AOT within 1.4x of native except nbody).
- The plan now is **parity with the prototype**: every demo of `examples/*` runs unchanged, plugins through the native-module ABI and simulators, profiles and targets validated by simulators (no hardware, no Windows).
  Audits: `docs/reports/parity/01..04`. Decisions D1 to D15: `docs/reports/zinc-next-decisions.md` section 7.
- Backlog: 104 tasks ZN-058 to ZN-161 in milestones M7 to M15 (`backlog/milestones`), dependencies recorded; `next/tools/next-task --list 10` shows what is startable, `tools/status` the progress per milestone.
- Parked (needs a board or Windows): ZN-054, ZN-055.

## Next

`/loop /zn-start` runs the backlog: one task per invocation, the lowest ordinal whose dependencies are Done or Review. First tasks: ZN-058 (crash fixes), 059 (plugin entry), 060 (std pack).

## Watch out

- The working tree may hold uncommitted changes of others (lib/std, docs): never `git add .`, commit with explicit paths.
- Tasks are created in bulk with `tools/tasks-import file.json` (keys in `backlog/keys.json`).
- `ZN_TRAP_TRACE=1` names the function of a trap; `ZN_DUMP_JSX=<name>` prints lowered JSX; `tools/oracle --available` says whether Node's tsc can run.
