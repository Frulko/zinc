# Onboarding: the simplest, fastest path from nothing to an app (2026-10-30)

The owner's question (in French): how should Zinc handle onboarding so it is the simplest, fastest and most effective possible:
something that asks no questions and lets people learn Zinc little by little until they can make apps. Ideas to study: raylib,
Godot, and others.

This report builds on the 2026-10-22 series (`onboarding-benchmark.md` and its four sources, `onboarding-cli-audit.md`,
`onboarding-atelier-audit.md`, `onboarding-docs-audit.md`) and on the ZN-774 epic that came out of it (18 subtasks Done, 14 open).
It does not repeat their tool-by-tool notes; it re-checks the claims that matter here against current sources, adds raylib (not
covered before), measures today's real first run, and turns all of it into one ordered plan.

Method: `build/zinc` of the main tree (`zinc-next 0.9.1+559.g84795cd89`), read-only, `ZINC_HOME` and the working folders in the
scratchpad, every window with `ZINC_BACKGROUND=1`, nothing left running. Web pages fetched on 2026-10-30; claims not confirmed on
a fetched page are marked *(memory)*.

## 1. What Zinc has today

| Piece | Where | State |
|---|---|---|
| Install | `README.md`, `docs/guide/01-getting-started.md`, `tools/install.sh` | One command (`brew install frulko/zinc/zinc` or `curl ... install.sh \| sh`), ~27 MB archive, no compiler needed (`tests/t1/install_nocompiler.sh` proves it). `--atelier` adds the app. |
| `zinc` alone | `src/cli_core.cpp` | A short "Start here" list (new, run, dev, check, doctor, explain, tour) and links to the lessons and the guide. Good. |
| `zinc doctor` | `src/cli_core.cpp` `doctor()` | One verdict line ("Ready"), nine lines, then `Start with zinc new game hello && cd hello && zinc dev`. 1.6 s. Good. |
| `zinc new` | `src/cli_core.cpp`, `templates/` (15) | `zinc new my-app` asks nothing and makes the `game` template. **Bare `zinc new` in a terminal asks three questions** (what, which style, folder name: ZN-774.02 and .15). |
| Examples | `examples/` (87 projects, 6.9 GB on disk with their build folders) | Demos and engine proofs, not a learning path. **Not in the release archive**, so the guide's `zinc run examples/breakout` fails for an installed user. Some READMEs are stale (`examples/bouncing-ball/README.md` still lists `--target sim`, "Node, headless"). No difficulty grading anywhere. |
| Atelier | `app/atelier` | A Processing-style start view: four "new sketch" styles, six template chips, 13 example cards with thumbnails (`app/atelier/examples/index.txt`: `folder\|Title\|line\|style`, `thumbs/`), opened as a copy. First-launch tour of 11 steps (`app/atelier/app/tour.ts`). Shipped in the archive. This is already 80% of a raylib-style gallery, minus grading and minus the lessons. |
| Lessons | `docs/learn/` (20 lessons), `docs/learn/samples/` (20 tested projects, 168 KB) | Good progression (drawing, interface, scene, canvas). The samples are **not in the archive**: the README says "download that folder from GitHub". |
| `zinc tour` | `src/cli_core.cpp` | Eight self-checking steps in the terminal, keeps its place. |
| Cheat sheets | `docs/reference/syntax.md` (language), `docs/reference/gfx.md` (254 lines, hand-written), `site/src/pages/cli.astro` | Hand-written, so they can drift from `lib/gfx.d.ts` (225 lines) and `lib/modules.d.ts` (345 lines). No one-page API card. |
| Doc generator | `zinc doc` (`docs/guide/14-doc.md`), `zinc doc --std` | Already reads exports and doc comments of `.ts` and the plugins: the parser a generated cheat sheet needs exists. |
| `zinc explain` | `include/zn/diagnostics.h` (44 codes: title, why, fix, one example) | Prints why and fix, and **only the wrong example**, not the fixed one. |
| Error messages | frontend | Good wording and "did you mean". Rough: absolute paths, no source line with a caret, a cascade of follow-on errors, compile chatter printed before them (below). |
| `zinc dev` | `src/dev/` | Fast Refresh, red box, Chrome DevTools inspector on port 9229, `--lan` QR for Zinc Go. |
| Web | `targets/wasm`, `tools/build-wasm`, `site/public/play/` | The interpreter as `vm.wasm` (5.8 MB); two precompiled demos (bouncing-ball, breakout) on the site, not editable. No compiler in the browser. `zinc export --target web` exists. |

## 2. Today's first run, transcribed

Fresh `ZINC_HOME`, Apple M1 Pro, Xcode command line tools present. The install itself was not walked (it needs a published release);
the archive is ~27 MB.

| # | Command | Questions | Wall time | Downloads | What the person sees |
|---|---|---|---|---|---|
| 1 | `zinc` | 0 | < 0.01 s | none | "Start here" list, links to lessons and guide |
| 2 | `zinc doctor` | 0 | 1.6 s | the update check only | `✓ Ready`, nine lines, `Start with zinc new game hello && cd hello && zinc dev` |
| 3a | `zinc new my-game` | 0 | 0.03 s | none | `Created my-game (game).` and three next steps |
| 3b | `zinc new` (no name, in a terminal) | **3** | as long as the person reads | none | "What do you want to make?" (13 choices), "How do you want to write it?" (3), "Name of the new folder" |
| 4 | `zinc run` (window, first time) | 0 | 2.8 s, of which 1.6 s native compile and link | none (uses the system `c++`; without one it interprets) | **14 lines of build progress**, then the window |
| 5 | `zinc run` (again) | 0 | 0.64 s | none | 3 lines, the window |
| 6 | `zinc run` headless (`ZINC_HEADLESS=1 ZINC_FRAMES=5`) | 0 | 0.10 s first, 0.01 s cached | none | interpreter |
| 7 | `zinc dev` | 0 | first frame at 0.96 s (compile of 27 files, 830 functions: 569 ms, mostly the inspector) | none | 12 lines, including `plugin Cdp: using Next implementation` and `plugin Socket: using Next implementation` |
| 8 | edit the text, save | 0 | refreshed **671 ms** after the save (the guide promises "96 ms") | none | `zinc dev: v1 refreshed src/main.ts` |
| 9 | save a type error | 0 | red box 186 ms after the save | none | the error line, then 6 lines of the red-box program's own build |
| 10 | Atelier, from the source tree | 0 | 26 s cold (the `system` plugin is built once; the release ships it prebuilt), 0.09 s warm | none | the start view (above) |

Steps to a moving square on screen: **2 commands after the install** (`zinc new my-game`, `cd my-game && zinc run`), zero questions,
about 3 seconds. That is already on par with LÖVE and PICO-8 and faster than every SDK in the table below. The time is not the
problem; what comes after the square is.

### Rough edges found on the way

1. **Bare `zinc new` asks three questions.** The owner's bar is none. The help line even says "make a project (it asks what to make)".
2. **Examples and lessons are not installed.** An installed user cannot run `zinc run examples/breakout` (the guide says to) nor
   `zinc run docs/learn/samples/01-window-and-shape` (the lessons README says to download the folder from GitHub). Atelier's 13 small
   examples are the only ones that ship.
3. **No way to name an example.** `zinc run bouncing-ball` and `zinc run example:bouncing-ball` both answer
   `error Z0119: Cannot find module: no file ...` after three lines of compile progress; `zinc examples` and `zinc learn` are unknown
   commands.
4. **Progress chatter.** The first windowed run prints 14 lines (`resources`, `C++ generated`, `link 0/1 completed, 1 running`...);
   `zinc dev` prints internal plugin lines (`Cdp: using Next implementation`); the red box prints the build of `redbox.ts`. A beginner
   cannot tell which line matters.
5. **Errors.** A typo in an import (`isDwon`) gives five errors with absolute paths 130 characters long; the four after the first are
   consequences. No source excerpt with a caret. `zinc explain Z0103` shows the wrong program (`let a: i32 = "x";`) and no fixed one.
6. **Fast Refresh is slower than written.** 671 ms measured against "96 ms" in the guide (one sample, the machine was idle; the first
   `zinc dev` compile includes the inspector's 800 functions). Worth a measure before a claim.
7. **Two example lists drift apart**: Atelier's `examples/index.txt` (13) and the lessons' `samples/` (20) teach overlapping things
   (Shapes vs lesson 1, Keys vs lesson 3, Pointer vs lesson 4, Sound vs lesson 6) with different code.
8. **`examples/` mixes audiences**: the Pi image player, PS2 hardware probes and a 3D pinball editor sit beside `hello`. Fine for a
   repository, wrong as a gallery.

## 3. What the others do (re-checked 2026-10-30)

| Tool | Time to the first pixel | Questions | How learning progresses | Worth copying |
|---|---|---|---|---|
| **raylib** | seconds on the web examples; a one-click Windows installer bundles a compiler and editor *(memory)* | 0 | **223 examples** in 7 modules (core 49, shapes 45, textures 33, text 17, models 32, shaders 36, audio 11), graded **★☆☆☆ to ★★★★**; filter by module or by the functions an example uses; each opens a live wasm build with its source *(source panel: memory, the loader page did not render in a fetch)*. One page **cheatsheet** per module (v6.2, also a PDF, translated) | The catalogue is **one data file** (`examples/examples_list.txt`: `category;name;stars;created;updated;year;reviewed;author;github`) that the site, the build and the `rexm` tool all read. Examples are tiny, one file, one idea, and they are the docs. |
| **Godot** | ~1 min download, then the Project Manager (name, folder, renderer) *(memory)* | ~3 fields per project | "Your first 2D game": **7 parts**, a zip of the art, the finished project on GitHub in two languages; assumes the "Step by step" introduction | One complete game grown across parts; the assets given up front so the lesson is only code; F1 class reference in the editor *(memory, 2026-10-22 report)* |
| **LÖVE** | seconds | 0 | wiki, one page per function with examples | **A folder is a program**: drop it on the runtime. (Wiki fetch blocked, 403; from the 2026-10-22 report.) |
| **PICO-8 / TIC-80** | boot into a prompt | 0 | `INSTALL_DEMOS`, `LOAD JELPI`, `RUN`; **SPLORE** browses local and online carts, favourites with F | The examples are inside the tool and a command away; Ctrl-U gives help on the word under the cursor; a cart is one PNG |
| **p5.js** | seconds in the web editor | 0 | tutorials by theme; a reference page per function (`circle(x, y, d)` with parameters) | The editor opens on a running `setup`/`draw` sketch. (Today's fetch of `p5js.org/reference/p5/circle/` showed the examples heading with no inline sketch: the runnable examples are not confirmed.) |
| **Processing, Arduino IDE** | a minute (install), then File > Examples > Blink, Run | 0 (Arduino: board and port) | the examples menu *is* the curriculum, by category | File > Examples, opened as a copy you save elsewhere: Atelier already does this |
| **Scratch** | seconds in the browser | 0 | tutorials as cards beside the editor, one step at a time, then the next tutorial | The lesson sits beside the work, one step visible at a time |
| **Svelte tutorial** | seconds | 0 | lesson text, editor and live result side by side; a **Solve** button | The exercise is the lesson; nobody stays stuck |
| **Expo** | minutes: `npx create-expo-app@latest`, `npx expo start`, scan the QR in Expo Go (same Wi-Fi; iOS needs the same Expo account) | 0 with defaults *(the project-name prompt: memory)* | an 8-chapter tutorial on one app | The phone is the fastest wow; Zinc has `zinc dev --lan` and Zinc Go already |
| **Flutter** | minutes: VS Code extension clones the SDK ("may take a few minutes"), `flutter doctor` | 0 for `flutter create` *(memory)* | codelab pathway; DartPad in the browser | `doctor` with fixes; a browser pad for zero install |
| **Bevy** | rustup, Xcode tools, `cargo add bevy`, then a first build that "will take some time" | 0 | `cargo run --example <name>` and a web examples page *(memory)* | Examples runnable by name from the CLI |

What the best of them share, for this question:

1. **The first pixel needs no decision.** Every tool here creates or runs something with no question; choices come later, as flags or
   menus. Zinc's `zinc new my-game` meets this; bare `zinc new` does not.
2. **The examples are the curriculum.** raylib, Processing, Arduino and PICO-8 have no separate tutorial for the basics: a graded,
   browsable list of tiny programs, each one idea, opened and changed. Godot and Expo add *one* long project for the step to an app.
3. **One list, many views.** raylib's single catalogue file feeds the web gallery, the build and the cheat sheet links. Nothing drifts.
4. **Reference at hand.** One page (raylib), or help on the word under the cursor (PICO-8 Ctrl-U, Godot F1).

## 4. The proposal

### The main choice: where the graded examples live

The heart of the plan is a raylib-style graded catalogue. The question is where it lives and how a person reaches it. Scored as
`RULES.md` §4 says (1 to 5; fit x3, performance x3, size x2, maintainability x2, licence and supply risk x2, portability x1, effort x1):

| Option | Fit | Perf | Size | Maint. | Licence | Port. | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **A. One catalogue file, the examples shipped in the archive; `zinc examples`, `zinc run example:<name>`, Atelier and the site all read it** | 5 (15) | 5 (15) offline, instant | 4 (8) ~250 KB | 4 (8) one list | 5 (10) | 5 (5) | 4 (4) | **65** |
| B. A web gallery only (wasm build + source per example) | 3 (9) needs a browser with SharedArrayBuffer, no local edit | 4 (12) | 5 (10) | 3 (6) a site build per example | 5 (10) | 3 (3) | 3 (3) | 53 |
| C. Download examples on demand (`zinc new gh:...`, the index) | 3 (9) classrooms without network | 3 (9) | 5 (10) | 3 (6) | 5 (10) | 4 (4) | 3 (3) | 51 |
| D. Status quo: Atelier's 13 + lessons on GitHub | 2 (6) | 5 (15) | 5 (10) | 3 (6) two lists | 5 (10) | 5 (5) | 5 (5) | 57 |

**Choice: A.** It is offline (schools, modest machines), one file to keep, and B becomes a cheap later view of the same catalogue
rather than a rival. Reversible: the catalogue is data.

### The pieces, ranked by value against cost

| Rank | Piece | Value | Cost | Reuses | Missing |
|---|---|---|---|---|---|
| 1 | **Zero questions by default** | high: the owner's explicit bar | hours | `zinc new` code, the `game` template | bare `zinc new` makes `my-game` (or `my-game-2`...) with no prompt and prints the next step; the wizard moves behind `zinc new --pick` (or `-i`); the help line says "make a project" |
| 2 | **One graded catalogue, shipped** | high: answers "what next" for months of learning | 1 to 2 days | Atelier's `examples/index.txt`, `thumbs/`, `docs/learn/samples/`, `tools/package` | `learn/catalog.txt` (`name;stars;style;title;line;lesson`) merging the 13 Atelier examples and the 20 lesson samples (one program per idea, the duplicates folded); `tools/package` copies the folders (~250 KB); Atelier reads the new file; `examples/` stays the demo shelf, listed separately with a ★★★★ "show-off" row (hero, breakout, js-three) only where the archive can carry them |
| 3 | **`zinc examples` and `example:` names** | high | 1 day | `zinc new <path>` (copy), `zinc run` | `zinc examples` prints the list grouped by style and stars (PICO-8 `ls`); `zinc run example:bouncing-ball` runs it read-only; `zinc new my-ball --from example:bouncing-ball` (or `zinc examples open <name>`) copies it to edit; an unknown name says "did you mean"; Z0119's message on a bare word suggests `example:` |
| 4 | **Quiet output by default** | medium-high: the first screen is the first impression | hours | the progress printer | first run: one line (`compiling for this machine, once: 2 s`); `--verbose` (or `ZINC_VERBOSE=1`) shows today's lines; the `plugin X: using Next implementation` lines go; the red box's own build is silent |
| 5 | **Errors that teach** | high for education | 2 to 4 days, part content | `include/zn/diagnostics.h`, the 44 entries, `tests/t1/first_run.sh` goldens | paths relative to the project; the source line with a caret (Elm/rustc style); drop the follow-on errors of a name whose import failed; `zinc explain` prints the wrong **and** the fixed program, with a test that the first fails and the second passes (the 2026-10-22 idea 8); a Z0101 on an engine name prints that function's cheat sheet line |
| 6 | **A generated cheat sheet** | medium-high | 1 to 2 days | the `zinc doc` reader, `lib/gfx.d.ts`, `lib/modules.d.ts` | `zinc doc --cheatsheet` (or a `tools/` script on the same reader) writes `docs/reference/cheatsheet.md`: per module, one line per export (signature + first sentence of its doc comment) and the catalogue examples that import it (raylib's "filter by function"); the site renders it as one printable page; a T0 test regenerates and diffs it so it never drifts; `zinc help gfx.rrect` prints one entry (TIC-80 `help`) |
| 7 | **Lessons as one path with checks** | high, already half built | 3 to 5 days | the 20 lessons, the `zinc tour` checker, `zinc dev` watch, Atelier | `zinc learn` continues `zinc tour` into the lessons: unpacks lesson N, watches the file, checks the step on save, `zinc learn --solve` shows the answer (Svelte); Atelier shows the same lesson text in a side panel; the catalogue's `lesson` field links an example to the lesson that explains it |
| 8 | **The step to a real app** | high for "until they can make apps" | content, 1 week | `templates/game-2d`, `templates/desktop-app`, the later.md line "one real app grown across the lessons" | lessons 21 to 26: grow `game-2d` (or a small desktop app) chapter by chapter, assets given up front and the final project in the catalogue as ★★★★ (Godot's "first 2D game", Expo's tutorial) |
| 9 | **The web gallery** | medium: try before install, the share link | 3 to 5 days | `site/public/play/`, `zinc export --target web`, `vm.wasm`, the catalogue | one page per catalogue entry: the running program, its source beside it, stars, "run it at home: `zinc run example:<name>`"; built by the site from the catalogue; the edit-and-run playground (compiler to wasm) stays the later spike of the 2026-10-22 plan |
| 10 | **`zinc dev` and the inspector in the path** | medium | hours, plus a measure | `zinc dev`, the inspector | the lessons and next steps say `zinc dev` (already); the inspector line prints once, as a hint, after the first refresh ("inspect the screen: chrome://inspect"); measure the refresh time and correct the guide's "96 ms" or load the inspector's 830 functions only when a client connects; Atelier's Run uses `zinc dev` so the beginner never meets two modes |

### The plan, in small steps

Each step stands alone and ships something a beginner sees.

1. **Bare `zinc new` asks nothing** (rank 1). Test: `tests/t1/first_run.sh` runs `zinc new` in a pseudo-terminal with no input and
   expects `my-game` and no `?` line.
2. **Quiet first run** (rank 4). Test: the golden of the first `zinc run` and `zinc dev` holds one progress line.
3. **The catalogue file** (rank 2): write `learn/catalog.txt` from Atelier's index and the lesson samples, grade each with stars,
   point Atelier at it, ship it in `tools/package`. Test: every entry checks (`zinc check`) and runs 5 headless frames; Atelier's
   selftest reads it.
4. **`zinc examples`, `example:` names, `--from example:`** (rank 3). Test: list, run, copy, "did you mean".
5. **Errors, first pass** (rank 5): relative paths, caret excerpt, no cascade. Update the six goldens of `first_run.sh`.
6. **`zinc explain` with the fixed program** (rank 5): one field in `ZN_DIAGNOSTICS`, a test that wrong fails and fixed passes.
7. **Generated cheat sheet** (rank 6) with its drift test; the site page; `zinc help <module>.<name>`.
8. **`zinc learn`** (rank 7), the tour continued into the lessons, with `--solve`; then the Atelier side panel.
9. **The real-app chapters** (rank 8).
10. **The web gallery** from the catalogue (rank 9).
11. **The `zinc dev` measure and the inspector hint** (rank 10).
12. Fix the docs on the way: `docs/guide/01-getting-started.md` and the lessons README use `example:` names instead of repository
    paths; `examples/bouncing-ball/README.md` loses `--target sim`.

Steps 1, 2 and 12 are under a day together and remove every question and most of the noise. Steps 3 and 4 give the raylib-style
path. 5 to 8 make the learning curve. 9 and 10 are the reach.

### What not to do

More tour steps (the 2026-10-22 reports and NN/g: tours do not raise success; examples do); accounts, badges or telemetry on the first
run; a block editor; a server that compiles code; shipping all of `examples/` (6.9 GB with builds, mixed audiences); a second example
list beside the catalogue.

## 5. Candidate `backlog/later.md` lines

For the coordinator to add under their headings (the backlog is frozen; these are lines, not tasks):

- ZN-774: bare `zinc new` makes `my-game` with the game template and no question; the three-question wizard moves behind `zinc new --pick`, because the owner wants onboarding that asks nothing.
- ZN-774: one graded catalogue `learn/catalog.txt` (name, stars, style, title, line, lesson) that merges Atelier's 13 examples and the 20 lesson samples, read by Atelier and shipped in the archive, because examples and lessons are not installed today and the two lists drift.
- ZN-774: `zinc examples`, `zinc run example:<name>` and `zinc new <dir> --from example:<name>`, because an installed user has no way to name or run an example and the guide's `zinc run examples/breakout` fails outside the repository.
- ZN-774: one progress line on the first `zinc run` and `zinc dev` (today 14 and 12), `--verbose` for the rest, no `plugin X: using Next implementation` lines, because a beginner cannot tell which line matters.
- ZN-774.04: diagnostics with paths relative to the project, the source line and a caret, and no follow-on errors after a failed import (one `isDwon` gives five errors today), because the first mistake is where beginners give up.
- ZN-774.04: a fixed program beside the wrong one in each `zinc explain` entry, with a test that the wrong one fails and the fixed one passes.
- ZN-774.10: a one-page API cheat sheet generated from `lib/*.d.ts` by the `zinc doc` reader, each line linked to the catalogue examples that use it, with a drift test, and `zinc help <module>.<name>`, because the hand-written `docs/reference/gfx.md` can drift from `lib/gfx.d.ts`.
- ZN-774.12: `zinc learn`, the tour continued into the lessons (watch, check on save, `--solve`), then the same lesson in an Atelier side panel.
- ZN-774: a web gallery page per catalogue entry (running program and its source, stars, the `zinc run example:` command), built by the site from the catalogue, as raylib's examples page.
- ZN-774: measure `zinc dev`'s refresh after a save (671 ms measured once against the guide's "96 ms") and load the inspector only when a client connects, since it is most of the 569 ms first compile.
- ZN-774.09: `examples/bouncing-ball/README.md` still documents `--target sim` as "Node, headless"; the getting-started guide and the lessons README point installed users at repository paths.

## Sources

- raylib examples page and grading: https://www.raylib.com/examples.html ; catalogue file and counts: https://raw.githubusercontent.com/raysan5/raylib/master/examples/examples_list.txt ; cheat sheet v6.2: https://www.raylib.com/cheatsheet/cheatsheet.html
- Godot "Your first 2D game": https://docs.godotengine.org/en/stable/getting_started/first_2d_game/index.html
- PICO-8 manual (INSTALL_DEMOS, SPLORE, .p8.png, Ctrl-U): https://www.lexaloffle.com/dl/docs/pico-8_manual.html
- p5.js reference: https://p5js.org/reference/p5/circle/
- Expo: https://docs.expo.dev/get-started/create-a-project/ , https://docs.expo.dev/get-started/start-developing/
- Flutter quick start: https://docs.flutter.dev/get-started/quick
- Bevy setup: https://bevy.org/learn/quick-start/getting-started/setup/
- LÖVE (fetch refused, 403), Processing, Arduino, Scratch, Svelte, TIC-80: `docs/reports/onboarding-benchmark-creative.md`, `onboarding-benchmark-frameworks.md`, `onboarding-benchmark-docs.md` (2026-10-22).
