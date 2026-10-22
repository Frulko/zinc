# Onboarding benchmark: synthesis (2026-10-22)

Four research reports, asked by the owner ("voir ce que proposent les apps et technos phares niveau onboarding"):
`onboarding-benchmark-products.md` (VS Code, Figma, Notion, Linear, Raycast, Blender...), `onboarding-benchmark-creative.md`
(Processing, p5, Arduino, Scratch, MakeCode, PICO-8, LÖVE, Godot, Unity...), `onboarding-benchmark-frameworks.md` (Flutter, Expo,
Tauri, Electron, Rust, Go, Astro, Vite, Svelte, Elm, Kotlin, Swift) and `onboarding-benchmark-docs.md` (MDN, React, Vue, Tailwind,
Stripe, freeCodeCamp, Exercism, playgrounds, and the options to run Zinc in a page). This page merges their ideas and ranks them.
The claims and their sources are in the four reports; several are marked unverified there.

## What the best ones share

1. **Try before installing.** Nearly every framework has a page that runs code (DartPad, Snack, Go Playground, Svelte, Kotlin,
   p5 editor, MakeCode). Zinc has none for a newcomer: `site/public/play/` runs two precompiled demos, nobody can edit them.
2. **The lesson is the exercise.** Code runs where it is explained, a check says what is wrong, a solution is one click away
   (Svelte, freeCodeCamp, Rustlings, MakeCode, Unity learning templates).
3. **A link is a program.** The URL holds the code (TS and Vue playgrounds, Go, MakeCode): it is the unit of help, of sharing and of
   a class handout.
4. **A real first artifact, not a tour.** NN/g found that tutorials do not raise task success; example files whose comments teach
   (Figma, Notion, Arduino Blink) do better. Keep Atelier's tour as it is, do not grow it.
5. **Help at hand, offline.** Reference on F1 or `help <name>` (TIC-80, Godot, Processing), errors that point to the fix and the
   reference (Rust error index, Elm, p5 Friendly Errors), docs bundled for classrooms (Go tour binary, Godot).
6. **Docs for two readers.** People and AI assistants: `llms.txt`, a Markdown copy of each page (Stripe, Mintlify, React).

Already done in Zinc and not proposed again: the translated pages carry their English `source:` commit and show a stale notice
(Vue and MDN do the same); five languages; the CLI welcome, `zinc tour`, the Atelier tour, the four styles, the 20 lessons with
tested samples.

## Ideas, ranked by value for the users against effort

| # | Idea | Who does it | Effort | Builds on |
|---|---|---|---|---|
| 1 | `llms.txt`, `llms-full.txt` and a `.md` copy of every docs page, with a test that every page is listed | Stripe, Mintlify, React | hours | `site/docs-map.mjs` |
| 2 | Site search per language (Pagefind) with a check of ten known queries per language | Astro Starlight, MDN | 1 day | the site build |
| 3 | A teaching first sketch: its comments are the lesson, 3 or 4 "change this" places, opened as a copy; the same first result per style in `zinc new`, the tour and the docs | Figma, Notion, Arduino Blink, Processing | small | the start view, `examples/index.txt` |
| 4 | Small first-run polish: empty panels that say what to do, "what's new" once per version from `CHANGELOG.md`, a keyboard and screen-reader pass on the tour, each `zinc doctor` line links to a per-OS fix | NN/g, VS Code, Tauri, Flutter doctor | small each | Atelier, the changelog, doctor |
| 5 | A Run button beside every tested lesson sample on the site (precompiled `.zbc`, the existing wasm glue); falls back to the picture | Tailwind, Rust by Example | 3 to 5 days | `site/public/play/`, `targets/wasm/glue` |
| 6 | Lessons with a check per step, a hint and a solution: in an Atelier side panel and offline with `zinc learn` (watch the file, re-check on save), progress kept locally | MakeCode, Unity, Rustlings, Kotlin Koans | medium | `zinc tour`'s checker, `zinc dev` watch, the lessons |
| 7 | Help at hand: F1 in Atelier and `zinc help <name>` from the comments of `zinc.d.ts`, the docs bundled in the app, one search box over lessons, docs, error codes and commands | TIC-80, Godot, Raycast, VS Code | medium | `zinc explain`, idea 2's index |
| 8 | Errors that teach: each `zinc explain` page gets a wrong program, two or three fixes and a link to the lesson; a test proves the wrong one fails and the fixes pass | Rust error index, Elm, p5 | small to medium, mostly content | `zinc explain`, the diagnostics |
| 9 | Edit-and-run playground: the compiler built to wasm (a size spike first), CodeMirror 6, the program in the URL, then one starter link per template and the lessons editable in the page | DartPad, Go, TS, Svelte, `vite.new` | 2 to 4 weeks | `tools/build-wasm`, idea 5 |
| 10 | Share a sketch: one file (`.zapp` with its picture) from Atelier, then a link once idea 9 exists | PICO-8, MakeCode | small to medium | `zinc pack` |

Later, worth keeping in `backlog/later.md`: a step and variable view with live number editing in Atelier (Thonny, Swift
Playgrounds; large, high value for teaching), one real app grown across the lessons (Next.js Learn, Expo), printable cards for
classrooms (Scratch), short looping captures per lesson generated by `zinc capture`, a first-steps checklist on the start view
(VS Code walkthroughs; only if the start view still leaves people lost after ideas 3 and 4), a translation guide and a
missing-strings report before a sixth language (Astro).

Rejected by the reports: more tour steps, accounts, XP and badges, a block editor (Zinc is typed text), WebContainers or Sandpack
(wrong runtime, a company dependency), compiling on a server (hosting and abuse), Monaco (size), telemetry on by default.

## Suggested order

Ideas 1 and 2 first (a day, no risk), then 3 and 4 (the first ten minutes in Atelier), then 5 (a newcomer sees a program run
before installing anything), then 6 and 8 (learning by doing, offline), then 7. Idea 9 starts with its size spike, alone, since it
builds the whole frontend for wasm; 10 follows it.
