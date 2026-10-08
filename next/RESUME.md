# Zinc Next: resume

Overwritten at the end of every session. Run `next/tools/status` (or `/zn-resume`) for the live state. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## State (2026-10-08)

- Done: M0 to M6, the first parity round, and today: the simulator chain (ZN-295.01, 296, 297, 299), the WebGL validation with glslang (link checks, std140 blocks, call depth limit 256, macro depth bound; conformance 695 of 787, no regression), display-gl's GPU renderer committed (f44420e, LINE/POLY), ZN-282 (host layout interface).
- Order of work (`backlog/priority.json`): UI, desktop, rendering, 3D/WebGL, then simulators. The GL renderer tasks (R2/R3, ZN-178..186, 201, 202) and the layout chain (ZN-282..291) are unparked: display-gl and lib/std/ui.ts have no uncommitted work left.
- Parity plan, audits and decisions: `docs/reports/parity/01..04`, `docs/reports/zinc-next-decisions.md`.
- Parked: boards, Windows, Linux-only runs (ZN-054, 055, 133, 134, 137, 245) and the measurement-parked ZN-177, 190, 191.

## Next

`/loop /zn-start` runs the backlog; `tools/next-task --list 10` shows what is startable. ZN-298 (hw.h remote backend) was started and put back: its plan and an untested hw.h draft are in its notes (`next/.logs/zn-298-hw-remote.patch`).

## Watch out

- The working tree may hold uncommitted changes of others (lib/std, docs): never `git add .`, commit with explicit paths.
- Tasks are created in bulk with `tools/tasks-import file.json` (keys in `backlog/keys.json`).
- `ZN_TRAP_TRACE=1` names the function of a trap; `ZN_DUMP_JSX=<name>` prints lowered JSX; `tools/oracle --available` says whether Node's tsc can run.
- The machine has 16 GB: build with `-j3`, run the WebGL conformance with `WGC_JOBS=2 WGC_RSS=1` (largest child 483 MB now); two heavy jobs at once exhausted memory on 2026-10-08.
- Broken: the AOT build of examples/hero cannot find its assets (ZN-314). Usage: `tools/usage` reports n/a this session.

