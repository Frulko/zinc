---
name: zn-coordinate
description: Coordinate the Zinc backlog team - choose and claim task chains, brief worker agents in their own worktrees, integrate each finished branch on develop, record decisions, later.md lines, numbers and RESUME.md. Use when running the backlog loop with several agents (Claude Code /loop, or tools/codex-loop with Codex).
---

# Coordinate the backlog team

You are the coordinator: you never work a task a worker holds; you choose, claim, brief, integrate and record. AGENTS.md "Several tasks at once" is binding; the running log is the State section of `docs/reports/backlog-review-2026-11-07/COORDINATOR.md`. Only one coordinator runs at a time, whatever the agent (Claude or Codex): check that log and `git worktree list` before starting.

Each iteration (a wake-up, a worker's report, or one run of `tools/codex-loop`):

1. `.paused` exists: stop (answer `STOP: paused`).
2. Integrate every worker that reported (section "Integrate").
3. Fill the available worker slots with independent chains, at most two that build; TypeScript-only, document and research workers build nothing. Section "Choose and claim", then "Brief".
4. Tests: never a suite (AGENTS.md "Move fast"); heavy tests go to "Tests to run" in `RESUME.md`.

## Choose and claim

- `tools/next-task --list 25`: take a chain of one module (the first task and up to four that share its parent, module or labels), none In Progress, claimed or waiting, none parked.
- Never two chains in the shared core at once (IR, frontend checker, runtime `src/rt` and `runtime/`, raster, layout, text, `lib/std/ui.ts`). Avoid files another session holds uncommitted (`git status` in the main tree: leave those modules to that session).
- Two trees building at most on the machine, counting other sessions (`git worktree list`, the load average). A chain that changes only TypeScript, documents or tests builds nothing: it runs against an existing binary read-only.
- Claim: `tools/next-task --claim ZN-a ZN-b` (refuses a task already worked, claimed, parked or waiting), then commit the task files with one State line (`chore(backlog): claim ZN-a, ZN-b`).
- A defect that stops a demo or a test of develop becomes a task with `New-task: blocks <what>` and goes to a worker next.

## Brief

Each worker gets its own worktree and branch on develop: Claude Code `Agent` with `isolation: "worktree"` in the background; with Codex `git worktree add -b work/<id> .worktrees/<id> develop` and `codex exec -C .worktrees/<id>` (`tools/codex-loop` does both). The brief is the worker's only context; give it:

- First commands: `git reset --hard develop` (a fresh worktree may start from an older base), `git config core.hooksPath .githooks`.
- The task ids in order, one commit per task (code, test, task file, changelog line), worked as the zn-start skill says; read `AGENTS.md` and `CLAUDE.md` once.
- What you know that the task file does not: the decisions just made (D numbers), the files another worker or session holds, an engine fix just landed that it must keep working, which binary to use if it does not build (a recent develop build that runs UI programs; the main tree's may carry another session's work).
- Heavy commands queue themselves: `tools/work-run SECONDS COMMAND [ARG...]` locks across worktrees and bounds the command with the existing timeout helper. Workers run their authorized builds and feature checks through it without waiting for a coordinator token; reading, editing and cheap static checks continue independently. Use one such command at a time per worker. This queue conservatively serializes builds too; the two-building-tree ceiling still applies to every other session.
- The rules: build only through `tools/build zinc` (or nothing); `timeout` on every run, headless or `ZINC_BACKGROUND=1`, one heavy process, kill what it started; no suites, only short runs and seconds-long T0 `--only`; timing taken while trees build is indicative; leave alone `RESUME.md`, `backlog/priority.json`, `backlog/keys.json`, `docs/reports/zinc-next-decisions.md`, `docs/reports/zinc-next-perf.md`, `backlog/later.md`, `AGENTS.md`, `CLAUDE.md`; no new task, no decision number; a failing criterion keeps the task open (Backlog with a handover note, Review when it needs a person or machine); no push.
- The final report it must return: branch, commits (hash, subject), status and criteria ticked per task, proposed decision text, later.md lines, numbers (marked indicative), proposed tests (command, what it proves, duration), anything left running or unproven.

## Integrate

When a worker reports:

1. `tools/integrate <branch>`: cherry-picks develop..branch onto develop in the main tree, keeps other sessions' uncommitted work (stashed under a unique tag, restored), merges CHANGELOG.md and tests/affected.json conflicts by keeping both sides. Another conflict: resolve it when it is a few lines (keep both features), else send the task back to a fresh worker on the updated develop.
2. Smoke on develop in a clean tree (a kept worktree reset to develop: `git reset -q --hard develop`, `tools/build zinc`, then `ZINC=<tree>/build/zinc tests/run --only <the task's T0s>` and one short run of the feature: `zinc check` of the demo, a few headless frames). Skip the build when no building slot is free, and note it as a pending write.
3. Record, in one commit `docs(resume): integrate ZN-a, ZN-b, D<n>`:
   - the next D number in `docs/reports/zinc-next-decisions.md` (after the last row) from the worker's proposed decision;
   - the later.md lines (engine items before `## Demos`, demo items before `## Cross-platform pass`, cross-platform checks at the end);
   - measured numbers appended to `docs/reports/zinc-next-perf.md` (if the file carries another session's uncommitted lines, stage only your appended block: write HEAD's version plus your block with `git hash-object -w` and `git update-index --cacheinfo`, then append the block to the working file too);
   - `RESUME.md`: one "Integrated:" line before "- New tasks for the owner:", the proposed tests under "## Tests to run (the owner picks)" with the commit they apply since;
   - one State line in COORDINATOR.md;
   - `tools/next-task --release <ids>` and the task files.
4. `git worktree remove --force <path>`, `git branch -D <branch>`; then choose the next chain.

## The loop

- Claude Code: `/loop` with the prompt "Coordinate the Zinc backlog team: follow the zn-coordinate skill" (dynamic mode); worker reports wake you; fallback wake-up 1800 s.
- Codex, live: `tools/codex-live` opens an interactive Codex as the coordinator, with up to five sub-agents in `.worktrees/` (`codex agents` shows them). This configures new CLI sessions; an existing session keeps its runtime capacity.
- Codex, headless: `tools/codex-loop` (lanes of claim, worker, integrate; one fresh `codex exec` per step, logs in `.logs/codex-loop/`).
