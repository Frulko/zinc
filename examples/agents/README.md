# Agents

A small ADE (agent development environment), written as a feasibility demo. It finds the **Claude Code**, **Codex** and
**opencode** CLIs on the computer and the configuration each one reads, and opens chats in folders: every message runs
the agent's CLI in that folder and its answer streams into the window as it arrives.

```sh
zinc run examples/agents                       # the folders Claude Code already knows
zinc run examples/agents -- ~/code/project     # that folder first
```

## What it shows

- **Agents**: each CLI found in `PATH` (or where its installer puts it: an app opened from the Finder does not get the
  shell's `PATH`), its version, and its configuration under `~` (settings, memory files, agents, commands, skills).
  Files that hold credentials (`~/.claude.json`, `auth.json`) are listed and never opened.
- **Folders**: the ones given on the command line, the projects Claude Code has seen, and any folder typed in the field.
  The folder's own configuration for the selected agent (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.mcp.json`,
  `opencode.json`) shows above the chat; a click opens a file read-only.
- **Chats**: one per agent and folder. The first message starts a session; the next ones resume it.

## How the streaming works

One process per turn, no SDK and no API key: the CLIs use the login they already have.

| CLI | Command | What streams |
|---|---|---|
| Claude Code 2.1 | `claude -p <prompt> --output-format stream-json --verbose --include-partial-messages --permission-mode plan [--resume <id>]` | token deltas |
| Codex 0.162 | `codex exec --json --skip-git-repo-check -s read-only [resume <id>] <prompt>` | whole messages |
| opencode 2.0 | `opencode run --format json --agent plan [--session <id>] <prompt>` | whole text parts |

`zinc:process` hands stdout over line by line; `services/agents.ts` reads each CLI's JSON lines and `services/chat.ts`
appends them to the last message, whose text is a signal: only that text is laid out again while it streams, and a
window with nothing streaming paints nothing.

Every agent runs **read-only** (plan mode, read-only sandbox, the plan agent): this demo reads folders, it never edits
them.

## Layout of `src/`

```text
src/
├── main.tsx                 # mounts the window, the frame hook that keeps the chat scrolled to its end
├── theme.ts                 # colours and the class helpers
├── state.ts                 # what was found, what is selected, the chats; the actions the components call
├── services/
│   ├── agents.ts            # the three CLIs: configuration paths, arguments of a turn, parser of their stream
│   ├── discovery.ts         # finds the CLIs, their versions, configuration files and folders
│   └── chat.ts              # Chat and Message: one process per turn, streamed into signals
└── components/
    ├── Sidebar.tsx          # agents with their configuration, folders
    ├── ChatPane.tsx         # agent tabs, the folder's configuration, messages, the composer
    └── FileViewer.tsx       # a configuration file or folder, read-only
```

## Limits (it is a demo)

- Codex and opencode print whole messages, not tokens: their answers arrive paragraph by paragraph.
- Closing the window during a turn leaves that CLI running until it finishes its answer.
- Chats live in memory; the agents keep their own sessions, so a chat can be resumed from the CLI itself.
- A Claude project whose path holds `-` or `.` is not offered in the folder list (Claude's folder names do not decode
  back); add it with the field.

Test: `next/tests/t1/agents_chat.sh` (fake CLIs that answer in each format, headless).
