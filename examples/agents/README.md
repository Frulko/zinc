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
- **Settings of the next turn**, as the CLIs offer them, above the message field: the mode, the model (Claude's
  aliases, Codex's own catalog from `codex debug models`, `opencode models`), the effort the model accepts, and fast
  mode where the model has it. Each answer says what it ran with (`opus · high · fast · Edit files`).
- **Motion**: a message fades in from below, three dots pulse while the agent thinks, menus open with a short fade,
  hovers change colour smoothly. All are engine tweens that stop when they end: a still window paints nothing.

## How the streaming works

One process per turn, no SDK and no API key: the CLIs use the login they already have.

| CLI | Command | What streams |
|---|---|---|
| Claude Code 2.1 | `claude -p <prompt> --output-format stream-json --verbose --include-partial-messages --permission-mode <mode> [--model m] [--effort e] [--settings '{"fastMode":true}'] [--resume <id>]` | token deltas |
| Codex 0.162 | `codex exec --json --skip-git-repo-check -c sandbox_mode=… -c service_tier=… [-c model=…] [-c model_reasoning_effort=…] [resume <id>] <prompt>` | whole messages |
| opencode 2.0 | `opencode run --format json --agent plan\|build [--auto] [--model provider/model] [--session <id>] <prompt>` | whole text parts |

The three modes, in each CLI's words:

| Mode | Claude Code | Codex | opencode |
|---|---|---|---|
| Read only (the default) | `--permission-mode plan` | `sandbox_mode="read-only"` | `--agent plan` |
| Edit files | `acceptEdits` | `workspace-write` | `--agent build` |
| Full access (red in the bar) | `bypassPermissions` | `danger-full-access` | `--agent build --auto` |

Fast off is said too (`CLAUDE_CODE_DISABLE_FAST_MODE=1`, `service_tier="default"`), so a fast mode turned on in the
user's own settings does not apply behind the bar's back.

`zinc:process` hands stdout over line by line; `services/agents.ts` reads each CLI's JSON lines and `services/chat.ts`
appends them to the last message, whose text is a signal: only that text is laid out again while it streams, and a
window with nothing streaming paints nothing.

Every agent starts **read-only**: nothing is edited until the mode says so.

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
    ├── SettingsBar.tsx      # mode, model, effort and fast of the next turn, with their menus
    ├── motion.tsx           # the entrance and the thinking dots
    └── FileViewer.tsx       # a configuration file or folder, read-only
```

## Limits (it is a demo)

- Codex and opencode print whole messages, not tokens: their answers arrive paragraph by paragraph.
- Closing the window during a turn leaves that CLI running until it finishes its answer.
- Chats live in memory; the agents keep their own sessions, so a chat can be resumed from the CLI itself.
- A Claude project whose path holds `-` or `.` is not offered in the folder list (Claude's folder names do not decode
  back); add it with the field.

Test: `next/tests/t1/agents_chat.sh` (fake CLIs that answer in each format, headless).
