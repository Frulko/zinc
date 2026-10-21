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
- **One activity line per turn**, as in Claude Code. While the agent works, a line under the answer's header says what it
  does, with a spinner: a verb that turns every few seconds while it thinks (« Cogitating… »), or the running tool
  (« Reading src/app.ts… », « Running npm test… »), the seconds and the tool count. Once over it reads « Used 12 tools ·
  3 agents · 41 s », with a red marker and « 1 failed », « interrupted » or « error » when it applies; the answer's text
  is always shown. A click on the line unfolds the tool and subagent cards (folded by default; the choice is kept per
  conversation); the detail panel lists them either way. Folded cards are not even read: the window holds only what is
  shown, so a turn of 20 000 calls is a few rows.
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
  aliases, Codex's own catalog from `codex debug models`, opencode's from its local server), the effort the model
  accepts (opencode: the model's variants), and fast mode where the model has it. **The model picker searches**: type
  to filter (case and accents aside, anywhere in the name, the id or the provider, every word: `go glm`), ↑ ↓ to move,
  Enter or Tab to pick, Escape to close, or click; « Default » stays first. opencode's models come under their
  providers (« OpenCode Go », « Default / OpenCode », « LM Studio (local) ») with their context window and price per
  million tokens in and out, or « free ». Each answer says what it ran with (`opus · high · fast · Edit files`). The status bar
  repeats them, with the turns running and the app's memory.
- **Answers in markdown.** A paragraph streams in as plain text and is drawn as markdown once it ends: headings, lists
  (nested, numbered), **bold**, *italic*, `inline code` and links in their colours, quotes, rules, fenced code blocks
  in monospace under their language, tables. A paragraph stays one text with style runs (`ui.setTextRuns`), so
  **any part of an answer selects with the mouse and copies with Cmd+C**, marks and all; so do the messages, the tool
  inputs and outputs.
- **Copy buttons.** The icon at the right of an answer's header copies the answer's markdown source (« Copy answer »,
  then « Copied » for a moment), read back from disk for an answer longer than what memory keeps; a code block's own
  icon copies its code.
- **Files, images and folders as references.** Drop them on the window: each becomes a chip above the message field
  (its × takes it away) and a reference in the message, written as Claude Code and Codex write them: an image
  `[Image #1]`, a file `@src/app.ts`, a folder `@src/`, relative to the conversation's folder when inside it, absolute
  otherwise (quoted when it holds a space). Typing `@` lists the folder's files that hold what follows (↑ ↓, Enter or
  Tab, a click; Escape closes it). Each CLI gets them its own way, below.
- **Tokens, context and cost, live.** Each answer's header shows its turn's tokens in and out (cache included), the
  share of the model's context window the last call filled, and its cost: `↑12.4k ↓1.8k · ctx 23% · $0.042`. The status
  bar shows the conversation's, live during a turn, and its hover splits it by model with the cache reads and writes.
  The totals are kept with the conversation and come back after a restart.
- **Plan limits.** The Agents panel shows each CLI's usage windows (the 5-hour session, the week, a model's own week):
  a bar, the share used and when it resets, « unknown » when the CLI does not tell them; the status bar shows the
  current agent's (`5h 13% · wk 24%`, each window and its reset on hover, a click checks again). OpenCode Go's 5-hour,
  week and month windows come from opencode.ai with the Go key (below), a rate-limited one in red; when that is off in
  Settings or refused, they are « unknown » with the reason and a link to [opencode.ai/console](https://opencode.ai/console).
  They are checked at start and every 5 minutes (Settings: 1 to 60), and a Claude turn's own report updates them in between.
- **Motion**: an item fades in from below, a spinner turns while a turn or a tool runs, menus open with a short fade,
  hovers change colour smoothly. All are engine tweens that stop when they end: a still window paints nothing. With
  reduced motion nothing moves, and the spinners stand still beside words that say what runs.

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
- **Flat, measured.** `tests/t1/agents_memory.sh` sends a turn of 20 000 tool calls carrying 200 MB of output, then
  scrolls back a thousand items and down again, and checks what the app holds against fixed ceilings the whole time.
  Measured on an M-series Mac: at most 240 items (the window and the next frame's), 4 open, 494 KB of text, 4 700 UI
  nodes and 68 000 live objects, against ceilings of 240, 16, 1 MB, 8 000 and 120 000; a resident peak of 115 to 150 MB
  (ceiling 224 MB) that falls back to about 25 MB once the turn ends. The status bar shows the resident memory.

## How the streaming works

One process per turn, no SDK and no API key: the CLIs use the login they already have.

| CLI | Command | What streams |
|---|---|---|
| Claude Code 2.1 | `claude -p <prompt with @references> --output-format stream-json --verbose --include-partial-messages --permission-mode <mode> [--model m] [--effort e] [--settings '{"fastMode":true}'] [--resume <id>]` | token and tool-input deltas; a subagent's whole messages with `parent_tool_use_id` |
| Codex 0.162 | `codex exec --json --skip-git-repo-check -c sandbox_mode=… -c service_tier=… [-c model=…] [-c model_reasoning_effort=…] [resume <id>] [-i <image>…] -- <prompt>` | items: `command_execution` started then completed, `file_change`, `mcp_tool_call`, `reasoning`, whole messages |
| opencode 2.0 | `opencode run --format json --agent plan\|build [--auto] [--model provider/model[#variant]] [--session <id>] [-f <file or image>…] <prompt>` (and `PWD` set to the folder: opencode takes its folder from it) | whole text parts; a tool part once it is done (no live status) |

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

References, as each CLI takes them (checked read-only on the same versions, 2026-10-20, with a small image and a file in a
temporary folder):

| | Claude Code | Codex | opencode |
|---|---|---|---|
| Image | `@path` in the prompt (the field's `[Image #1]` is written as its path): read without a tool call | `-i <path>` (on `exec` and on `exec resume`; `-i` takes several values, hence the `--`) | `-f <path>` |
| File | `@path` in the prompt, resolved by the CLI (`@"a b/c.ts"` too) | `@path` stays in the prompt: the model reads it with its tools | `-f <path>`, and `@path` in the prompt |
| Folder | `@path/` in the prompt, listed by the CLI | `@path/` in the prompt: the model lists it with its tools | `@path/` in the prompt: the model lists it with its tools |

## Usage, cost and limits: where the numbers come from

Only from what each CLI prints or answers itself, and for OpenCode Go one read of opencode.ai's usage route. The app
never opens a login file (`~/.claude/.credentials.json`, `auth.json`: listed, never read) and never reads the keychain;
each CLI asks its own backend with its own login. No check of the limits starts a model turn. Checked on the real CLIs on 2026-10-20,
read-only, in a temporary folder (`tests/fixtures/usage-*`, `limits-*`, ids redacted):

| | Claude Code 2.1.304 | Codex 0.162.1 | opencode 2.0.32 |
|---|---|---|---|
| Tokens | each call: `message_start`, `message_delta`; the turn: `result.modelUsage` (subagents included) | `turn.completed.usage` once per turn (its input counts the cached part) | `step_finish` per step while it runs; the turn's, by model, from its session's messages once it ends (`opencode api GET /api/session/<id>/message`, a local read: the last step has no `step_finish`) |
| Cost | `total_cost_usd`, `costUSD` per model | none: ≈ from a few list prices, none for a model outside them | the messages' `cost` (an OpenCode Go turn: its dollars, $0.002 for a short one; a free model: none) |
| Context window | `modelUsage[model].contextWindow` | `context_window` of `codex debug models` (the default is the model `config.toml` names) | `limit.context` of `opencode api GET /api/model`; the default model: the previous turn's, else a small table |
| Plan limits | `claude -p /usage --output-format json --no-session-persistence` (a local command: no turn, no cost) and the stream's `rate_limit_event` | `codex app-server`, `account/rateLimits/read` over stdio (no model call) | OpenCode Go: `GET https://opencode.ai/zen/go/v1/usage` with the Go key (below); « unknown » and a link to the console otherwise |

OpenCode Go is opencode's subscription (provider `opencode-go`, models `opencode-go/<id>`). Its limits are dollar
amounts: over 5 hours 20 %, over a week 50 % and over a month 100 % of a monthly limit, each model its own
([opencode.ai/docs/go](https://opencode.ai/docs/go/)), and its usage shows only in the
[console](https://opencode.ai/console). opencode 2.0.32 has no command and its server no route for them (its OpenAPI
document has no usage, quota or billing route). opencode.ai has one, in opencode's repository but not in its docs:
`GET https://opencode.ai/zen/go/v1/usage` with `Authorization: Bearer <Go key>` answers
`{"usage": {"rolling" | "weekly" | "monthly": {"status": "ok" | "rate-limited", "percent", "resetsAt"}}}`
([anomalyco/opencode#16513](https://github.com/anomalyco/opencode/pull/16513), closing #16017). With Settings' « Read
OpenCode Go usage with my Go key » on (the default), each check runs `opencode auth export` in the temporary folder,
takes from its output the key of the active `opencode-go` entry only (OAuth tokens and other providers are left
alone), and sends it in that one request's header to opencode.ai over https, then drops it: the key is never written,
logged, shown or passed to a program, a redirect does not carry it to another address, and an answer from off
opencode.ai is refused. A refused key (revoked, expired), no
Go key, or an answer the app does not know (the route is undocumented and may change) shows as « unknown » and why.

## Layout of `src/`

```text
src/
├── main.tsx                 # mounts the window, the frame hook
├── theme.ts                 # the dark and light schemes and the class helpers
├── state.ts                 # what was found, the conversations, what is shown; the actions the components call
├── services/
│   ├── agents.ts            # the three CLIs: configuration paths, arguments of a turn, parsers of their streams
│   ├── tools.ts             # a tool call's icon, summary and detail, whatever the CLI calls it
│   ├── discovery.ts         # finds the CLIs, their versions, configuration files and folders
│   ├── stream.ts            # the bounded line reader, texts spilled to disk in parts
│   ├── transcript.ts        # items and the transcript on disk
│   ├── turn.ts              # the stop state machine (SIGINT, SIGTERM, SIGKILL)
│   ├── usage.ts             # tokens, context, cost and plan limits as each CLI reports them; the activity line's texts
│   ├── markdown.ts          # an answer's markdown as blocks, inline marks as style runs
│   ├── attach.ts            # dropped files and images: references, the @ completion, how each CLI takes them
│   ├── pick.ts              # the model picker's search (case and accents aside) and its grouping by provider
│   └── chat.ts              # a conversation: one process per turn, its window of items
└── components/
    ├── ActivityBar.tsx      # the icons on the far left
    ├── SidePanel.tsx        # conversations by folder, folders, agents, settings
    ├── ChatPane.tsx         # tabs, the folder and agent, the items, the composer (chips, @ completion), Escape
    ├── ItemView.tsx         # a message, an answer's header and activity line, a paragraph, a tool card
    ├── Markdown.tsx         # an answer's blocks as views, the copy button and its tooltip
    ├── DetailPanel.tsx      # the turn's agents and tools, one in full
    ├── StatusBar.tsx        # agent, model, mode, turns running, tokens and cost, plan limits, memory
    ├── SettingsBar.tsx      # mode, model, effort and fast of the next turn, their menus, the model picker
    ├── motion.tsx           # the entrance, the spinner
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
- Markdown is a line-based subset of CommonMark (no HTML, no reference links, no setext headings); links are coloured
  and underlined but do not open. A paragraph is drawn as markdown once it ends; the head kept in memory (16 KB) is what
  is drawn.
- A selection stays inside one text (a paragraph, a list item, a code block): to take a whole answer, use its copy
  button.
- A drop lands anywhere on the window, in the conversation shown. Not tried on the real CLIs: a file outside the folder
  (an absolute `@path`) in read-only mode, several images in one turn. The `@` list reads up to 5 000
  paths of the folder (no hidden folders, no `node_modules`, `build`, `dist`…) once per conversation shown.
- Usage: Codex reports one figure per turn, so its context is the turn's whole input (a turn of several calls
  overstates it); a model the CLI gives no window for borrows the previous turn's; the price table behind « ≈ » holds a
  few OpenAI list prices and nothing else. Claude's `/usage` resets are read in local time, as it prints them.
  Not tried on the real CLIs: Codex with a 5-hour window reported, a Claude plan over its limit. opencode's turn is
  read from the first page of its session's messages (newest first): a turn longer than a page would be undercounted.
  A Go model the workspace keeps out (« This Go model requires Global regions »: the console's Privacy settings) fails
  with opencode's message. OpenCode Go's usage route is undocumented: checked once on 2026-10-20 (200, three windows
  « ok »); a rate-limited window and the refusals were tried against made-up answers only.
- The picker folds the accents of Latin letters only.
- Unfolding the cards in the middle of a long conversation reads the same stretch again: the view may move.
- A Claude project whose path holds `-` or `.` is not offered in the folder list (Claude's folder names do not decode
  back); add it with the field.

Tests: `zinc test examples/agents/tests` (the parsers against the real CLIs' streams, the stop state machine, the
bounded reader, the markdown parser, the references and each CLI's arguments for them, the usage and limits of each CLI,
opencode's models and a Go turn's usage, cost, context, the activity line's texts, the refresh interval, the picker's
search and grouping); `tests/demo/agents_chat.sh` (fake CLIs that answer in each format, headless, the model
picker typed in and driven by keys), `tests/demo/agents_markdown.sh` (drops, chips, the markdown drawn,
copy, selection, the `@` list), `tests/demo/agents_usage.sh` (the spinners turn, or stand still with reduced motion,
the activity line folds and unfolds, the summary, tokens and limits in the status bar, a restart, the interval),
`tests/demo/agents_go.sh` (OpenCode Go's windows from a fake `opencode auth export` and made-up answers of the route,
the toggle, each refusal, and the fake key found nowhere: data, output, scenes, a child's arguments or environment) and
`tests/t1/agents_memory.sh` (the flood).
