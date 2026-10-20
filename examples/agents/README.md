# Agents

A small ADE (agent development environment), written as a feasibility demo. It finds the **Claude Code**, **Codex** and
**opencode** CLIs on the computer and the configuration each one reads, and holds conversations in folders: every
message runs the agent's CLI in that folder, and its answer, its tool calls and its subagents stream into the window as
they arrive. However long a conversation runs, the app's memory stays flat.

```sh
zinc run examples/agents                       # the folders Claude Code already knows
zinc run examples/agents -- ~/code/project     # that folder first
```

## What it shows

The window is laid out like VS Code: an **activity bar** of icons on the far left, the **side panel** of the activity
picked, the conversation in the centre with its **tabs**, a **detail panel** on the right and a **status bar** at the
bottom. Light and dark follow the system (or Settings); with reduced motion nothing moves.

- **Conversations** (the first activity), organised like Orca: each folder, then its conversations with the agent's
  colour, a title (the first message), a status dot (running, idle, failed, interrupted) and how long ago it changed; a
  search box; « + » starts a new conversation in the folder with the selected agent. They are kept on disk and come
  back at the next start.
- **Folders**: the ones given on the command line, the projects Claude Code has seen, and any folder typed in the field.
  The folder's own configuration for the conversation's agent (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.mcp.json`,
  `opencode.json`) shows above the conversation; a click opens a file read-only.
- **Agents**: each CLI found in `PATH` (or where its installer puts it: an app opened from the Finder does not get the
  shell's `PATH`), its version, and its configuration under `~` (settings, memory files, agents, commands, skills).
  Files that hold credentials (`~/.claude.json`, `auth.json`) are listed and never opened.
- **Tools, live and in detail.** Each tool call is a card: its icon and name, a one-line summary of its input (the
  command, the file, `−3 +5` for an edit), a live status (a spinner while it runs, then done, failed or interrupted) and
  its duration. Opened, it shows the input (the command, the diff, the JSON) and the start of the output, with « Show
  all » for the rest. Claude's tool inputs fill in while the model writes them.
- **Subagents.** A call of Claude's Agent (or Task) tool is an agent card that counts its subagent's calls and says what
  it does; the subagent's own calls and text hang under it, indented, one level per agent.
- **The detail panel** lists the turn's agents and its latest tools, live; a card's panel button (or a row) opens one
  in full.
- **Escape stops the running turn at any time** (as does the Stop button), even while the message field has the focus:
  the CLI gets SIGINT, then SIGTERM and SIGKILL after 1.5 s each if it is still there, the turn is marked interrupted,
  and the next message resumes the session. Checked with Claude Code 2.1.304: on SIGINT it ends with an error result
  (exit 0), and `--resume` then knows what it had written before the stop.
- **Settings of the next turn**, as the CLIs offer them, above the message field: the mode, the model (Claude's
  aliases, Codex's own catalog from `codex debug models`, `opencode models`), the effort the model accepts, and fast
  mode where the model has it. Each answer says what it ran with (`opus · high · fast · Edit files`). The status bar
  repeats them, with the turns running and the app's memory.
- **Motion**: an item fades in from below, three dots pulse while the agent thinks, a spinner turns while a tool runs,
  menus open with a short fade, hovers change colour smoothly. All are engine tweens that stop when they end: a still
  window paints nothing.

## Long conversations: memory that never grows

CLIs and desktop tools tend to keep a whole conversation in memory, so a long one grows without end. Here:

- **The context is the agent's, not the app's.** Each CLI keeps the conversation in its own session (`--resume`,
  `exec resume`, `--session`): the app sends only the new message, so it never needs the history in memory to keep the
  context. Nothing is summarised or dropped on the agent's side.
- **Everything goes to disk.** Every finished item (a message, a paragraph, a tool call with its output) is appended as
  one JSON line to the conversation's transcript, `~/.zinc-agents/chats/<id>/seg-<n>.jsonl` (64 items a file;
  `AGENTS_DATA` moves the folder).
- **A window in memory.** The conversation shown holds at most 120 items and 512 KB of text, in memory and in the UI
  tree; the ones not shown hold none, only what is still running. Scrolled near its top, the list reads the 40 items
  before from disk, and gives up its end once over the budget; scrolling back down does the opposite. The item on screen
  keeps its place.
- **Big texts stay on disk.** A paragraph keeps 16 KB in memory and a tool's output 2 KB; the whole is written to part
  files of 1 MB and « Show all » reads one part at a time.
- **A bounded line buffer.** The output is read in raw chunks and split into lines with a buffer of 4 MB at most; a
  longer line (a huge tool result) goes to disk as it arrives, unparsed, and its first 16 KB tell which tool it belongs
  to.
- **Flat, measured.** `next/tests/t1/agents_memory.sh` sends a turn of 20 000 tool calls carrying 200 MB of output, then
  scrolls back a thousand items and down again, and checks what the app holds against fixed ceilings the whole time.
  Measured on an M-series Mac: at most 240 items (the window and the next frame's), 4 open, 494 KB of text, 4 700 UI
  nodes and 68 000 live objects, against ceilings of 240, 16, 1 MB, 8 000 and 120 000; a resident peak of 115 to 150 MB
  (ceiling 224 MB) that falls back to about 25 MB once the turn ends. The status bar shows the resident memory.

## How the streaming works

One process per turn, no SDK and no API key: the CLIs use the login they already have.

| CLI | Command | What streams |
|---|---|---|
| Claude Code 2.1 | `claude -p <prompt> --output-format stream-json --verbose --include-partial-messages --permission-mode <mode> [--model m] [--effort e] [--settings '{"fastMode":true}'] [--resume <id>]` | token and tool-input deltas; a subagent's whole messages with `parent_tool_use_id` |
| Codex 0.162 | `codex exec --json --skip-git-repo-check -c sandbox_mode=… -c service_tier=… [-c model=…] [-c model_reasoning_effort=…] [resume <id>] <prompt>` | items: `command_execution` started then completed, `file_change`, `mcp_tool_call`, `reasoning`, whole messages |
| opencode 2.0 | `opencode run --format json --agent plan\|build [--auto] [--model provider/model] [--session <id>] <prompt>` | whole text parts; a tool part once it is done (no live status) |

The three formats were checked against the CLIs on 2026-10-20 (Claude Code 2.1.304, codex-cli 0.162.1, opencode
2.0.32), each on a small prompt in a temporary folder, read-only; `tests/fixtures/` keeps what they printed and
`tests/parse.test.ts` reads it.

The three modes, in each CLI's words:

| Mode | Claude Code | Codex | opencode |
|---|---|---|---|
| Read only (the default) | `--permission-mode plan` | `sandbox_mode="read-only"` | `--agent plan` |
| Edit files | `acceptEdits` | `workspace-write` | `--agent build` |
| Full access (red in the bar) | `bypassPermissions` | `danger-full-access` | `--agent build --auto` |

Fast off is said too (`CLAUDE_CODE_DISABLE_FAST_MODE=1`, `service_tier="default"`), so a fast mode turned on in the
user's own settings does not apply behind the bar's back.

Every agent starts **read-only**: nothing is edited until the mode says so.

## Layout of `src/`

```text
src/
├── main.tsx                 # mounts the window, Escape, the frame hook
├── theme.ts                 # the dark and light schemes and the class helpers
├── state.ts                 # what was found, the conversations, what is shown; the actions the components call
├── services/
│   ├── agents.ts            # the three CLIs: configuration paths, arguments of a turn, parsers of their streams
│   ├── tools.ts             # a tool call's icon, summary and detail, whatever the CLI calls it
│   ├── discovery.ts         # finds the CLIs, their versions, configuration files and folders
│   ├── stream.ts            # the bounded line reader, texts spilled to disk in parts
│   ├── transcript.ts        # items and the transcript on disk
│   ├── turn.ts              # the stop state machine (SIGINT, SIGTERM, SIGKILL)
│   └── chat.ts              # a conversation: one process per turn, its window of items
└── components/
    ├── ActivityBar.tsx      # the icons on the far left
    ├── SidePanel.tsx        # conversations by folder, folders, agents, settings
    ├── ChatPane.tsx         # tabs, the folder and agent, the items, the composer
    ├── ItemView.tsx         # a message, an answer's header, a paragraph, a tool card
    ├── DetailPanel.tsx      # the turn's agents and tools, one in full
    ├── StatusBar.tsx        # agent, model, mode, turns running, memory
    ├── SettingsBar.tsx      # mode, model, effort and fast of the next turn, with their menus
    ├── motion.tsx           # the entrance, the thinking dots, the spinner
    └── FileViewer.tsx       # a configuration file, or a long text from disk, read-only
```

## Limits (it is a demo)

- Codex and opencode print whole messages, not tokens: their answers arrive paragraph by paragraph. opencode prints a
  tool once it is done, and neither of them links a subagent's calls to its parent: the tree is Claude's.
- Closing the window during a turn leaves that CLI running until it finishes its answer.
- How Codex and opencode take SIGINT was not tried on the real CLIs (the escalation to SIGTERM and SIGKILL covers a CLI
  that ignores it), nor were their subagents and MCP calls: their parsers follow their documented items.
- A text is cut in characters, which are about bytes for code and logs; « Show all » on a line too long to parse shows
  it as the CLI wrote it (JSON).
- A Claude project whose path holds `-` or `.` is not offered in the folder list (Claude's folder names do not decode
  back); add it with the field.

Tests: `zinc test examples/agents/tests` (the parsers against the real CLIs' streams, the stop state machine, the
bounded reader); `next/tests/t1/agents_chat.sh` (fake CLIs that answer in each format, headless) and
`next/tests/t1/agents_memory.sh` (the flood).
