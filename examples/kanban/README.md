# Zinc Project Room

A native Trello-style Kanban board over **all local Zinc backlog tasks**, including completed tasks and subtasks. Five columns follow the project's statuses. Cards show labels, criteria progress and declared assignees; a modal reads the description, criteria, dependencies, parent, plan and implementation notes from Backlog.md.

## Run

From the repository root, with the `backlog` CLI installed and available in `PATH` (also searched in `~/.local/bin`):

```sh
ZINC_BACKGROUND=1 build/zinc run examples/kanban
```

`KANBAN_REPO=/absolute/path/to/zinc` selects another checkout. Otherwise the app finds the repository above its project folder. The source is local; no network, browser, server or AI request is involved. macOS is the currently verified target. The board scrolls horizontally in a narrower window; every column scrolls vertically, with virtual rows and vertical drag auto-scroll.

## Interact

- Drag a card to another column or above/below another card to reorder it. A preview follows the pointer; the destination is highlighted. Touch uses the same drag path.
- Click a card, or focus it with Tab and press Enter, to read its detail. Escape, the close button or a click outside closes the modal and restores focus.
- Shift+Left/Right moves a focused card between columns. Shift+Up/Down reorders it inside its filtered column. The modal's status buttons provide another keyboard and pointer alternative.
- Search by ID, title, label, milestone or assignee. Cmd/Ctrl+K focuses search. The sidebar filters open tasks, declared work in progress, assignments and milestones. All filters combine.
- **Moves are local to this session.** The footer and modal say so. Reset restores source order and statuses. Closing the app discards moves. It never edits task files or executes backlog mutations.

## Watch agents take tasks

The app consumes `backlog task list --json --watch`: an initial complete state, then replacements when files change. New tasks appear, removed tasks disappear, and status/assignee changes are recorded in the Activity panel with their observation time (UTC, latest 24). A real status/assignment change overrides a local move of that task. Details refresh when the selected task's update stamp changes. Reconnect restarts a stopped feed; errors remain visible and the last readable board stays available.

The sidebar shows tasks declared `In Progress`. An assignee alone on a pending task means **reserved**. An unassigned task in progress says **agent not specified**. Existing `@parallel` claims say **identity unknown**: they do not identify Codex or Claude, and no process heartbeat is inferred.

To identify future work, an agent/coordinator can use the existing CLI, in the checkout being watched, after claiming through the project's normal workflow:

```sh
backlog task edit ZN-123 -a '@codex/worker-name'
backlog task edit ZN-123 -s 'In Progress'
```

Use a stable worker/session name for each agent. A different worktree is a separate source: changes there are seen when that checkout is selected or its task file is integrated. A future coordinator heartbeat could add actual running/stale presence; this demo deliberately reports only what Backlog.md declares. It starts no agents.

## Offline snapshot

Export `backlog task list --json > /absolute/path/snapshot.json`, then set `KANBAN_SNAPSHOT` to that file. The app reads it synchronously and watches changes to the file. For details, put the output of `backlog task view ZN-123 --json` in `details/ZN-123.json` beside the snapshot. A missing detail produces an explicit read error.

The test fixture uses nine real task titles, descriptions and criteria. Statuses, ordering and one named assignee are fixed for the interaction scenario; they are **test data**, not a live agent session.

## Source and checks

`src/main.tsx` mounts the app and shortcuts; `constants.ts` holds shared values; `models.ts` validates the CLI JSON; `state.ts` owns filtering, local moves and source reconciliation; `services/backlog.ts` owns processes/files; `components/` owns cards, sidebar and modal layers; `pages/board/` owns virtual columns and drag routing. The UI uses `zinc:ui`/Solid, the existing `zinc:ui/dnd`, kit dialogs and Lucide icons. No engine changes or new dependencies.

```sh
build/zinc check examples/kanban
tests/run --only kanban
tests/run --only kanban_logic
```

The T1 session checks mouse/touch dragging, reordering, keyboard movement, task details, search, milestone filtering, reset and modal dismissal against feature goldens; AOT and QuickJS get one short frame-hash smoke check. A separate 300-frame idle run checks paint p99. The demo test checks state rules and an actual CLI watcher against a temporary backlog, including a named external assignment and detail read. No full-platform, screen-reader or physical touch-device claim is made.
