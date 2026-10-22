# First-run audit of the `zinc` CLI

Date 2026-10-22. Binary: `build/zinc` (`zinc-next 0.6.0+5.g46036a72`, read-only), macOS Intel/arm Mac, `ZINC_HOME` fresh in
`/private/tmp/claude-501/onboarding-cli/home` (nothing big downloaded: pinned zig was already seen as installed by doctor, esbuild
"will be downloaded"), `ZINC_HEADLESS=1 ZINC_FRAMES=30`. Not walked: the real install (no network step run), a windowed `zinc run`,
`zinc dev` longer than 8 s. Already covered by `tests/t1/first_run.sh` (every template runs headless, six mistakes have golden
messages): the basic path works; the problems below are about orientation, not about crashes.

## Ranked friction points

### 1. Nothing explains the kinds of program, so the first choice is blind
`zinc new --list` prints 13 templates, each with a long sentence and a list of targets, e.g.
`game  A window, the arrow keys and a square: the smallest game loop (zinc:gfx). (macos, linux, rpi)`.
The answer to "gfx or ui? kit or nuxt? React Native style? three.js? service? board?" is only in module names in parentheses
(`zinc:gfx`, `zinc:ui/nuxt`, `zinc:sys`). A newcomer cannot tell what `zinc:ui/nuxt` is, and the README table of 83 `examples/` is
not reachable from the CLI. The list also prints a second block "from the index:" repeating the same 13 names (duplicate noise).
Fix: group the list by what you want to make ("a game", "an app with windows and buttons", "a command-line tool / server", "a
board", "3D"), one short line each (under 70 chars, no target list unless the machine cannot run it), and print the
`zinc new <t> <dir>` line plus "docs: zinc docs ui" at the end. Remove the duplicated index block unless the index has extra names.

### 2. `zinc new` with no argument silently scaffolds a game into the current directory
`zinc new` -> `created . (game); next: cd . && zinc run`. No question, no name, files dropped in `$PWD` (README title "app").
`zinc new x` creates a game called x (the name is taken as the dir, the template is implicit). Two-argument form is the only way
to choose, and `--help` says "Default template: game".
Fix: with a TTY and no arguments, ask (see the wizard below); without a TTY, print the usage and exit 2. Never write into a
non-empty cwd without asking (it refuses non-empty already; good).

### 3. No first-run welcome, no "what now" after `zinc new`, no pointer to docs anywhere
`zinc new game x` ends with `created x (game); next: cd x && zinc run` and nothing else. A new project's README says
"A Zinc app (game template). zinc run / build / check" (no mention of `zinc dev`, of where to edit, of the docs, of `zinc explain`).
`zinc` / `zinc help` never mention docs, the guide, Atelier, the examples or the website. `grep` of the help text: no URL.
Fix: end `zinc new` with 3 lines: edit `src/main.ts`; `zinc dev` (edits show at once); docs path or URL. The template README
should start with "Edit src/main.ts, save, and see it change (zinc dev)" and link the guide chapter of its kind.

### 4. `zinc help` is a 40-command wall and `zinc help <command>` is one dense paragraph
Bare `zinc` prints 42 commands in flat order (`run, debug, build, bundle, check, test, new, pack, assets, fuse, publish,
update-app, init, doctor, toolchain, ... update-pubkey, update-keygen, sign, verify ...`), engine-author commands (`lex`, `parse`,
`bake`, `infer`) and signing keys are mixed with `run`. `zinc help dev` is a single ~2000-character paragraph (Fast Refresh,
`--device`, `--lan`, DevTools port...). `zinc help run` lists `--profile` values `ps1, ps2, psp, vita, n3ds, chip` before the
basic case. The first-run user cannot find "the 5 commands I need".
Fix: print "Start here" (`new`, `run`, `dev`, `check`, `doctor`, `explain`) first, then "Build and ship" (`build`, `pack`, `export`,
`publish`), then "More" as a one-line pointer (`zinc help --all`). In `help <cmd>` put 2 lines of usage and 2 examples first;
options after; long prose last.

### 5. `zinc hlep` suggests the wrong command
`zinc hlep` -> `did you mean 'zinc lsp'?`. `zinc version` -> `unknown command 'version'` (only `--version` works),
`zinc --help` prints the full list without saying `-h`/`help <cmd>` exist (it does say it at the end). Fix: add aliases `help`
typos (edit distance to `help` must win over `lsp`: rank candidates by edit distance, prefer the commands of "Start here"),
accept `version`.

### 6. Diagnostics are good but leak internal type names and give no way back to the browser/JS world
- `let n: number = "hello"` -> `error Z0103: Type is not assignable: 'string' to 'f64'`. The user wrote `number`; `f64` is the
  internal kind. A beginner does not know that `number` is f64 here. Fix: print `'string' to 'number'` (and mention `f64` only
  in explain).
- `document.title = 'x'` -> `Z0106: Property does not exist: 'title' on 'Document'` and `window.alert('hi')` ->
  `Z0101: Cannot find name: 'window'`. These are the first things a web developer types. Nothing says "Zinc has no DOM; use zinc:ui
  / zinc:gfx, or `--engine quickjs` for plain JS". Fix: special-case `document`, `window`, `alert`, `localStorage`-less globals:
  "Zinc draws without a browser: there is no DOM. See `zinc explain Z0101`."
- Plain JS: `function add(a, b)` -> `Z0109: Cannot infer a type: parameter 'a'`; `var x` -> `Z1001: var is not supported`. The fix
  line says "Add a type annotation" (ok) but not that `zinc run file.js` runs plain JavaScript on QuickJS (which works:
  `zinc run a.js` printed `hi from js`). Fix: on Z0109/Z1001 in a `.ts`, add "or run it as JavaScript: zinc run file.js".
- Unknown module: `Z0119` for `zinc:nope` is excellent (points to `zinc plugins`, `zinc add`). For `fs` / `react` it only says "no
  tsconfig.json paths entry maps it": no hint that Zinc has `zinc:sys` / `zinc:fs`-like modules or that `react` is replaced by
  `zinc:ui`, nor `zinc add npm:<pkg>`. Fix: add "node modules: see docs; npm packages: zinc add npm:react".
- `zinc explain` prints "Why / Fix / Example" (good) but the Example is often a bare code line without the output, `zinc explain
  z0103` (lower case) -> `unknown diagnostic code`, no suggestion. `zinc explain` with no code prints a usage and "(zinc help
  explain says more)" instead of listing codes (`--codes` exists in main.cpp but is not documented in the usage). Fix: accept
  lower case, bare number (`103`), and list the common codes when asked with none.
- Errors print a path of 4 directories deep (`/private/tmp/.../m/src/main.ts:2:17`): relative to the cwd is easier to read.
Good as is: `Z0007` (`<view>`) and `Z0006` (`class`) say exactly what to write and the codemod command.

### 7. `zinc run` mixes progress chatter with the program output, and a UI program says nothing when it ends
A headless run prints `engine / cache / compile / run interpreter` lines then the program output; a game with no console output
ends with `run  interpreter` and nothing else: the user cannot tell "it ran" from "it did nothing". The first desktop-app run
printed 13 `plugin  the C++ compiler on ...` lines and took 19.8 s (10.5 s for the 3d template) with no sentence saying "first
time only, plugins are compiled once and cached". `no saved build inputs; compiling` reads like a warning.
Fix: one line before a long step ("building the plugins this program uses (system, svg), once: about 20 s"), `-q` summary
"ok, ran 30 frames" at the end of a headless run, and a plain `cache  first build` wording.

### 8. `zinc doctor` is friendly but cannot say "you are fine" in one glance, and shows engine-author noise
Output (excerpt): `[✓] Zinc 0.6.0+5.g46036a72 /Users/.../zinc`, `[•] Updates not checked`, `[•] Native builds (zig 0.15.2) downloaded
the first time you build natively`, `[•] iPhone 4S (ios-legacy) no iPhoneOS SDK with armv7 stubs: download Xcode 13.4.1 ...`,
`[•] Plugins 0 of 44 plugins with native code are ready`, `[•] Console SDKs ready: psp, n3ds`. The final `Nothing blocks you: start with
zinc new game hello && cd hello && zinc run` is right, but the "iPhone 4S", "Console SDKs", "Rust (cargo)" rows are rows a beginner has
no idea about, and "0 of 44 plugins ... ready" sounds like a failure while the "Worth doing" list says it is fine. The binary
prints its version as `0.6.0+5.g46036a72` while CHANGELOG is at 0.6.2 (this build is old; with a release it would be clean).
Fix: hide rows for targets the user has not asked for (legacy iOS, consoles, cargo) unless `--details` or `zinc doctor --all`; rename
"0 of 44 plugins ready" to "plugins: built on first use (about 5 to 20 s each)"; one top line "Ready to go" in green.

### 9. The guide README is stale and contradicts the product
`docs/guide/README.md` (the index of the guide) starts with `pnpm install` + `alias zinc="node $PWD/compiler/bin/zinc.mjs"`
(the Node prototype, removed 2026-10-20), says `zinc doctor # checks cmake, a C++17 compiler, SDL3, docker, emscripten`, and its
"one-minute tour" uses `--target sim` "on Node (the oracle)" and `zinc init myapp --template game # or cli | server | iot |
remarkable`. `docs/guide/06-testing.md` also uses `--target sim` and `sim/zinc.mjs`. A newcomer who follows the index lands in a
dead end; chapter 01 is correct but is not what the README links first.
Fix: replace the README setup and tour with the chapter 01 content (install, `zinc new`, `zinc dev`); delete the Node alias.

### 10. The install scripts end well but the user learns one path only
`tools/install.sh` ends with `next: zinc new game my-game && cd my-game && zinc run` (or "in a new terminal: ..." when it changed
the PATH). Good. Gaps: it never mentions `zinc doctor`, the docs or Atelier (when `--atelier` is not given), and it appends to
`~/.zprofile` (a bash user on macOS gets `~/.profile`, which a login bash does not always read; fish is not handled).
`tools/install.ps1` ends with `open a new terminal, then run: zinc doctor` (different advice from install.sh; no `zinc new`).
The Homebrew formula (`tools/homebrew-formula`, `def caveats`) prints only how to update and a link to Atelier: no "zinc new" line.
Fix: one common final block for the three: `Installed zinc <v>. Try: zinc doctor | zinc new game hello && cd hello && zinc dev |
zinc tour`. The README Quick start puts "From the sources (CMake...)" before "brew install": a newcomer reads a compile recipe first.
Put the release install first, the build-from-source in a "Contributing" section.

### 11. `zinc dev` in a project exits quietly in headless; in a window the first run compiles natively with unexplained waiting
`zinc dev` printed `zinc dev: v1 started (0 ms after the save)` (odd for a first start: "after the save"), then
`program exited (0), waiting for changes...`. For a beginner it should say what to do: "edit src/main.ts and save". The headless
case is mine, but the line `v1 started (0 ms after the save)` is confusing in any case.
Fix: on start print `watching src/ - edit a file and save; Ctrl+C stops` and drop "v1 ... after the save" unless `-v`.

### 12. Smaller points
- Windows: `install.ps1` exists but README says only macOS is built and tested; `install.sh` on other OS says "build from sources".
  The first-run user on Windows gets contradictory signals (WARNING block in README is honest, but the CLI does not repeat it).
- `zinc check` success is silent except two `plugin ... cached native library` lines (exit 0): say `ok, 0 errors`.
- The README WARNING ("Nothing here is stable") is good; `zinc --version` should show the channel (`0.6.2 preview`).
- Two docs files, `docs/guide/12-*` numbered twice (12-js-engines and the npm line "12.").

## Discoverability answers
(a) kind of program: only via template names and the module in parentheses; no decision page, no `zinc new` wizard text.
(b) syntax subset: `docs/guide/02-language.md` and `zinc explain Z....`; no `zinc lint`-style "what is not allowed" summary from the CLI;
the errors teach one at a time (good) but the first mistakes (`document`, `var`, untyped params) say nothing about "this is a
subset".
(c) docs: no command prints a path or URL. `zinc help` has none; templates' READMEs have none; install scripts none.
Atelier is mentioned by the installer and README only.

## Comparison: what fits
- `npm create vite` / `create astro`: interactive wizard (name, template with arrow keys, then "Done. Now run: cd x; npm install;
  npm run dev"). Fits: the wizard for `zinc new`, and the exact three "Now run" lines.
- `create-expo-app`: a single default template, then a clear "Your project is ready" with the next commands and a QR for the
  phone; Zinc already has `zinc dev --lan`: mention it.
- `rustup` / `cargo new`: `cargo new` prints one line ("Created binary package") and `cargo run` prints the output; Rust's errors
  end with `For more information about this error, try rustc --explain E0xxx`: Zinc already does this (keep). `rustup show` /
  rustlings: a guided exercise set (see tour).
- Deno/Bun: `deno`/`bun` with no argument opens a REPL; `bun create` shows a template picker; `deno init` prints exactly the
  three commands to try. Idea: `zinc` with no argument on a TTY on first run shows the welcome, not the full help.
- Godot project manager / Arduino IDE: a window with examples you open and run; Atelier is that: the CLI should say so
  (`zinc atelier` or a line in the tour that opens it).

## Design: first-run mode, `zinc tour`, interactive `zinc new`

### First run (the very first `zinc` that is not a script)
Trigger: no `$ZINC_HOME/first-run.json`, stdout and stdin are a TTY, no `CI`, `ZINC_NO_WELCOME`, `NO_COLOR` unaffected. Commands
that are scripted (`zinc run`, `build`, `--version`, `doctor --json`) never show it; it appears for a bare `zinc` and after
`zinc new`. It prints once, then writes `{"welcomed":"0.6.2","lang":"en"}`:

```
Welcome to Zinc 0.6.2: apps, games and boards from one typed TypeScript.
Language for messages: [E]nglish  [F]rancais   (Enter = English; zinc config lang <en|fr> changes it)

Three steps:
  1. zinc new            pick a kind of program and make a project
  2. zinc dev            run it; every save shows up at once
  3. zinc tour           a 10-minute guided walk (zinc docs opens the guide)
```
Language: ask once, store in `first-run.json`, only if the message catalogue has more than English (today it has none: ship the
prompt only when a second catalogue exists; until then print the 3 steps only). The same block is the end of `install.sh`,
`install.ps1` and the Homebrew caveats (one text source).

### `zinc tour` (alias `zinc learn`)
Vimtutor/rustlings style: a numbered series of small steps in a real project created in `~/zinc-tour` (or a dir the user names),
each step prints what to do, waits, checks it, and moves on. Steps:

1. Make a project: the tour runs the wizard (below) with `game` preselected. Check: `zinc.json` exists.
2. Run it: "run `zinc run` in a second terminal, or press Enter and the tour runs 30 headless frames and shows the first frame
   path". Check: the tour itself runs `zinc run` with `ZINC_HEADLESS=1 ZINC_FRAMES=3` and expects exit 0.
3. Change a line: "change `'arrows to move'` to your name". Check: poll the mtime/content hash of `src/main.ts` (stat every 300 ms),
   then run `zinc check`; if it passes, say what changed (diff of one line).
4. Make a mistake: tour writes nothing; says "change `isDown` to `isDwon` and save". Check: `zinc check` must fail with `Z0101`;
   then "now run `zinc explain Z0101`": check that the user's shell history is not needed: the tour itself prints that command and
   accepts Enter. Then "undo it": check passes again.
5. Fast Refresh: "start `zinc dev`, save a change, see it without restart". Check: the tour starts `zinc dev --background` itself
   (headless when no TTY window is possible), changes a constant in the file with the user's consent, and waits for the
   `zinc dev: swapped` line on its stdout (the dev log already exists), then stops it.
6. Pick a kind of program: show the 5 families (draw with gfx; UI with JSX and kits; command-line / server; 3D; board) with one
   example each, from `zinc new --list`'s grouped text, and ask which to try: creates it beside the tour project and runs it.
7. Find the docs: print the guide path (`$engine/share/zinc/docs/guide`) or URL, the examples dir, `zinc explain`, `zinc help`.
8. Open Atelier: if installed (`/Applications/Zinc Atelier.app` or the linux desktop entry), offer to open the tour project in it
   (`open -a`), else print the install line `install.sh --atelier`.

Step checks are plain functions (file hash changed, `zinc check` exit code, a child process output line); no step needs a window
(except step 8, which is optional and skipped in CI/non-TTY).

Progress: `$ZINC_HOME/tour.json` `{"project":"/path","done":[1,2,3],"version":"0.6.2"}`, written after each step; `zinc tour` resumes at
the first step not done, `zinc tour --list` prints the steps with ticks, `zinc tour --reset` forgets, `zinc tour 5` jumps. A step
whose check no longer holds (project moved) is shown as not done again.

Not a TTY or CI (`!isatty(0)`, `CI`, `ZINC_NO_WELCOME`, `--yes`): never prompts. `zinc tour` prints the list of steps and the first
command and exits 0; `zinc new` with no argument prints usage and exits 2; the first-run block is never printed.
`zinc tour --auto` (for the test): runs every step with the scripted edits, no prompts, exits 1 at the first failing check.

### Interactive `zinc new` (no argument, TTY)
```
? What do you want to make?
  > A game                 draw and move things on a canvas        (game)
    A 2D game to grow from  scenes, sprites, saved score           (game-2d)
    An app with windows     sidebar, pages, dark mode              (desktop-app)
    A dashboard             cards and charts                       (dashboard)
    A 3D scene              three.js, drag to orbit                (3d)
    A command-line tool     arguments, no window                   (cli)
    A web server / service  HTTP JSON API                          (server, service)
    A board                 ESP32, Raspberry Pi GPIO               (iot-board, iot)
    More...                 e-ink, plugin starter, a git template
? Name: my-game   (directory, must be new or empty)
created my-game (game)
  cd my-game && zinc dev        edit src/main.ts, save, see it change
  zinc tour                     a guided walk;  docs: <guide path>
```
Arrow keys with raw terminal mode (termios, `read` of escape sequences; fall back to numbered choice `1-9` when raw mode is not
available or `TERM=dumb`). Each row's one-line description is the first sentence of `templates/<t>/template.json`
"description" cut at 60 chars (add a `"blurb"` field for the short text so the long one stays for `--list`). `zinc new <t> <dir>`
keeps working unchanged (scripts, tests).

### Source files it would touch
- `src/cli_core.cpp`: the command table (`kCommands`, add `tour`, `docs`, help grouping "Start here"), `zn::cli::init` (the `new`
  logic, line ~407: the `pos.empty()` branch becomes the wizard on a TTY, usage otherwise), `listTemplates` / `printTemplates`
  (grouped output, `blurb`), the unknown-command guess (line ~378: ranking), the `Paint` colour helper (line ~572, reuse for the
  wizard), `findCommand`.
- `src/main.cpp`: dispatch at lines ~1693 (`init|new`), ~1741 (`doctor`), ~3038 (`explain`: lower case, bare numbers, list);
  the first-run call for a bare `zinc`; `zinc tour` dispatch.
- New `src/cli_tour.cpp` / `src/cli_tour.h` (the steps, `tour.json`, the checks; keeps `cli_core.cpp` from growing: it is 3,600 lines).
- Diagnostics text: wherever Z0103 prints type names (frontend; the display of `f64` as `number`) and the hints for `document`
  and `Z1001` (`src/frontend/`, the explain catalogue that `zinc explain` reads).
- `templates/*/template.json` (blurb), `templates/*/README.md` (first lines), `tools/install.sh`, `tools/install.ps1`,
  `tools/homebrew-formula` (`caveats`): the same final text.
- Docs: `docs/guide/README.md` (replace the stale setup and tour), `docs/guide/01-getting-started.md` (mention `zinc tour`).

### Test that proves it headless
New `tests/t1/tour.sh`, given `$ZINC`, in the pattern of `tests/t1/first_run.sh`: a temp `ZINC_HOME` and project dir;
(1) `zinc tour --auto` exits 0 and `tour.json` lists all steps; the scripted mistake step sees `Z0101` and the undo restores a
clean `zinc check`; (2) `zinc tour` with stdin from `/dev/null` and with `CI=1` prints the step list, never blocks (wrap in
`timeout 5`, exit 0), and writes no `first-run.json`; (3) `zinc new` with no argument and no TTY exits 2 with usage, and does not
create files (the current behaviour, `created . (game)`, is the regression this fixes); (4) wizard: drive it with `script -q /dev/null`
or a pty helper feeding `Down Down Enter my-app Enter` and assert `my-app/zinc.json` has the third template; (5) resume: run
with `--auto --until 3`, then `zinc tour --auto` finishes from step 4. Add the mapping in `tests/affected.json` for
`src/cli_core.cpp`, `src/cli_tour.cpp`, `templates/**`.

## Quick wins (under a day each)
1. `zinc new` with no argument: usage when not a TTY, never write into `.` silently (cli_core.cpp, init).
2. End `zinc new` with 3 lines: `zinc dev`, the docs path, `zinc explain`.
3. Fix the "did you mean" ranking (`hlep` -> `help`) and accept `zinc version`.
4. Print `number` not `f64` in Z0103; accept `zinc explain z0103` / `103`.
5. Add the `document`/`window` hint ("no DOM; Zinc draws without a browser") and the "or run it as JavaScript" hint on Z0109/Z1001.
6. Group `zinc help` into "Start here / Build and ship / More" and move `--profile` console values after the basic flags in `help run`.
7. Replace the stale `docs/guide/README.md` setup and tour (Node alias, `--target sim`).
8. Group `zinc new --list` by intent, drop the duplicate "from the index" block when identical, add the `zinc new <t> <dir>` line.
9. Same final "next steps" block in `install.sh`, `install.ps1` and Homebrew `caveats`.
10. Doctor: hide legacy iOS, consoles and cargo rows unless `--details`; reword "0 of 44 plugins ready"; one "Ready to go" line.
11. Say "first build of this program's plugins, once, about N s" before the 10-20 s compile; `zinc check` prints `ok`.
12. `zinc dev` prints "watching src/: edit and save" instead of `v1 started (0 ms after the save)`.
