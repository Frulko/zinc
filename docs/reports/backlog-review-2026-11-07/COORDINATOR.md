# Coordinator loop, 2026-11-07 (owner: close as many tasks as possible by tomorrow, in full autonomy)

Each iteration (a wake-up or an agent's notification):

1. `.paused` exists: stop the loop.
2. **Review** (once): when the six `shard-*.json` and the two `later-*.json` are written and `applied.json` is not, start one apply agent
   (default model) that merges them as the 2026-10-25 review did (`docs/reports/backlog-review-2026-10-25.md`): verdicts applied, later.md
   lines promoted into tasks (commit trailer `New-task: owner backlog review 2026-11-07`), new ordinals (score of BRIEF.md, effort counted
   twice, maturity mark added), `applied.json`, `docs/reports/backlog-review-2026-11-07.md`. Tasks claimed by workers are left alone.
3. **Workers**: keep two building worker agents (worktree, default model), each on a chain of one module from `tools/next-task --list 10`,
   claimed first (`tools/next-task --claim`, commit the task files). Never two in the shared core (IR, runtime, raster, layout, text, ui.ts).
   Non-building agents (docs, tests, research) may run beside them.
4. **A worker reports**: `git cherry-pick develop..<branch>`, `tools/build zinc`, one short smoke run of the integrated feature, write its
   decisions, later.md lines and numbers, `git worktree remove`, `git branch -D`, then start the next worker.
5. Tests: never a suite (AGENTS.md "Move fast"); heavy tests go to "Tests to run" in `RESUME.md`.
6. Fallback wake-up 1800 s; notifications wake the coordinator first.

## State

- Review: all 8 results in (shards A-F, later-engine 31 tasks, later-demos-cross 34 tasks). Apply agent running.
- ZN-863.02/.05/.07 integrated (07eae3e87, a2df0d896, 8217555a5). Worker 3: ZN-774.21/.23/.22/.27/.24 (docs, onboarding). Worker 4: ZN-1007, ZN-802 (CLI polish). Network outage 2026-11-07 evening: agents resumed.
- ZN-799 integrated (a8a1f93f1). Worker 2: ZN-699, ZN-794, ZN-793 (checker / Promise / QuickJS diagnostics).

## Pending writes (after the apply agent, which edits later.md)

- later.md: ZN-799: an outer box-shadow on a bg-transparent box paints under the whole box (CSS paints it only outside the border box); shadcn's shadow-xs stays off the kit fields until fixed.
- later.md: ZN-799: `zinc tsconfig` writes no paths for zinc:ui/solid, zinc:ui/kit and the other std modules, and omits the zinc-ts-plugin entry docs/guide/01 describes.
- later.md: ZN-863.02: a removed project file comes back (nothing hides the read-only layer); a folder index for apps that write thousands of files; readTextAsync/writeTextAsync in the page.
- later.md: ZN-863.05: the web demo bar is English only (zinc:i18n exists); a plugin-level replay of recorded native answers for samples.
- later.md: ZN-863.07: pin the resolved address in serve.py's proxy (DNS rebinding); list the hosts of examples/music and maps/explorer in their zinc.json.
- Decisions to record (ZN-863): web files persist in IndexedDB with an in-memory copy, not OPFS (sync handles only in workers, old Safari); web settings live under targets.web (files, demo, proxy, proxyUrl) since top-level `web` is the QuickJS web environment; the proxy is a GET/HEAD host allow-list with ?url=.
- RESUME Tests to run: web_real --matrix (carnet, kanban, zed-editor, ipod, museum-table, music), web_export, web_bridge, web_video, music and maps/explorer exported with their hosts (ZN-863).
- RESUME Tests to run: tests/t1/cli_tools.sh, tests/t1/system_manifest.sh, platform_look, ui_kit_sections, an AOT run of kit_input (ZN-799).

## Test machines (owner, 2026-11-07)

- Cross lane open: the Pi 3B+ player spark@192.168.2.31 and the Mojave Intel Mac mowmow@192.168.2.215 (AGENTS.md "The test machines"). One worker lane may take cross tasks these machines can prove; cross builds count as a building tree.
