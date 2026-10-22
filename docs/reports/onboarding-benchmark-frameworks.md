# Onboarding benchmark: how frameworks get a newcomer to a running app

Research date 2026-10-22. Method: WebFetch and WebSearch on the live sites. "(unverified)" marks a claim that is from memory or from a source I could not confirm. Several pages returned only partial text (Snack, Tour of Go, Rustlings README, Bun init, Elm blog), so those parts are thin.

Zinc already has: first-run welcome and language choice, `zinc doctor` verdict, `zinc new` wizard, `zinc tour`, translated diagnostics and `zinc explain`, `zinc dev` Fast Refresh with QR and Zinc Go, Atelier with a tour, 20 lessons, a "choose your kind of program" page, a cheat sheet, a five-language site. Nothing below repeats those.

## Per tool

### Flutter
- Install: docs.flutter.dev/install offers "Quick start" (VS Code or another Code OSS editor does the SDK install) or "Custom setup" (manual SDK, PATH). https://docs.flutter.dev/install
- `flutter doctor` is in the CLI table as "Show information about the installed tooling"; the per-category check/warn/error output with a suggested fix is from general knowledge, not from the fetched page (unverified). https://docs.flutter.dev/reference/flutter-cli
- Learning path is a numbered pathway: set up, Dart tutorial, Flutter tutorial (three small apps), then a video series on how Flutter works. https://docs.flutter.dev/get-started/codelab
- Remarkable: DartPad (https://dartpad.dev) runs single-file Flutter apps in the browser with no install, and the install page itself points to it as the zero-setup option. The pathway page does not embed it.
- Docs translations and telemetry: could not verify (search returned only app-localisation results).

### React Native and Expo
- `npx create-expo-app@latest`; `--template` picks a template, `--example` with no name opens an interactive list of examples. New projects ship an `AGENTS.md`. https://docs.expo.dev/get-started/introduction/
- Environment page: Expo Go is described honestly as "a playground app, so it's limited and not useful for building production-grade projects", with development builds as the production path. Pressing `i` or `a` after `npx expo start` opens the simulator and installs Expo Go automatically. https://docs.expo.dev/get-started/set-up-your-environment/
- Tutorial: 8 chapters, self-paced, up to two hours, changed code highlighted in green with hover explanations, full code on GitHub. https://docs.expo.dev/tutorial/introduction/
- Snack ("React Native in the browser", https://snack.expo.dev/) runs the app in the browser and on a phone; sharing and embedding are from memory (unverified, page text was empty).
- Remarkable: the phone is the fastest first success (scan, see). Same pattern as Zinc Go.

### Tauri
- Prerequisites page is one long guide with per-OS tabs (Linux distro tabs for Debian, Arch, Fedora, NixOS and more; macOS Xcode or command line tools only; Windows C++ Build Tools and WebView2), then Rust, optional Node, optional mobile; ends with "Next steps". https://v2.tauri.app/start/prerequisites/
- `create-tauri-app` asks: project name, bundle identifier, frontend language (Rust, TypeScript/JavaScript, .NET), package manager, UI template and flavor. Docs advise "vanilla" when unsure. https://v2.tauri.app/start/create-project/ and https://github.com/tauri-apps/create-tauri-app
- Docs exist in at least fr, de, es, it (URLs seen in search results); translation tooling not verified.
- Remarkable: prerequisites are the hard part, and they are documented per OS rather than hidden.

### Electron
- Six-part tutorial: prerequisites, first app, preload scripts, adding features, packaging with Forge, publishing and updating. Docs offered in en, de, es, fr, ja, pt, ru, zh. https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites
- Electron Fiddle (https://www.electronjs.org/fiddle): a desktop app that opens on a runnable template; switch Electron version; built-in API examples; add npm packages with autocomplete; Monaco editor with types; save locally or as a GitHub Gist that anyone opens by URL; package with Forge; export as a project.
- Remarkable: sharing by Gist URL, and "export as a real project" to graduate out of the sandbox.

### Rust
- Learn page lists four doors: the Book, Rust by Example (code first, exercises), Rustlings (CLI course on your machine), the Playground. `rustup doc` gives the docs offline. Site in 10 languages. https://www.rust-lang.org/learn
- Rustlings: exercises are broken programs you fix; watch mode reruns on save, a `hint` command, progress in `list`. Details come from older commit logs and a 2022 article, not from the current README, so verify v6 behaviour (unverified). https://github.com/rust-lang/rustlings
- Error codes: each `Exxxx` has a page with a one-line definition, a minimal erroneous example, then several fixes (borrow, clone, Copy, shared ownership), then a link to the Book chapter. https://doc.rust-lang.org/error_codes/E0382.html
- Translations: the Book's translations live in separate repos, listed in an appendix; mdbook cannot build translations, so each community owns its repo. https://rust.googlesource.com/rust-lang/book/+/refs/heads/rust-1.97/src/appendix-06-translation.md
- Remarkable: four formats of the same content (prose book, example-first, exercises, playground) and error pages that offer more than one fix.

### Go
- A Tour of Go, https://go.dev/tour/: in-browser lessons; localized copies are separate deployments that translators host themselves (Chinese, Korean, Japanese, Ukrainian and others per commit history). https://go.googlesource.com/website/+/master/tour/TRANSLATE
- The editable, runnable snippets and the Playground share link are from memory (unverified, the fetched page was empty).
- Remarkable: no account, no install, one page per concept, and the playground link is the standard way to ask a question.

### Deno and Bun
- Deno: one-line installer, `deno --version`; `deno init my_project` creates `deno.json`, `main.ts` (a tiny `Deno.serve` server) and `main_test.ts`; run with `deno -N main.ts`, which prints `Listening on http://localhost:8000/`. https://docs.deno.com/runtime/getting_started/first_project/
- Bun: `bun run file.tsx` runs TS and JSX with no config; `--watch`; `bun run` with no argument lists scripts. The `bun init` prompts could not be fetched (unverified). https://bun.sh/docs/runtime
- Remarkable: the scaffold already contains a test and a runnable thing, and the first run prints a URL you can click.

### Astro
- `npm create astro@latest` wizard: creates the folder, "Install dependencies?", Git, integrations; Houston animation can be skipped by a flag; `--template` takes an official example or `user/repo#branch`; `astro.new` opens a starter in the browser. https://docs.astro.build/en/install-and-setup/
- Docs translations are volunteer, in the same GitHub repo as the English docs, with a Translation Guide. Languages: ar, pt-BR, zh-CN, zh-TW, fr, de, hi, it, ja, ko, pl, ru, es. No machine translation accepted; a new language needs a group ready to translate the whole site. https://contribute.docs.astro.build/guides/i18n/ and https://astro.build/blog/astro-i18n/
- Telemetry: opt-out, anonymous, lists exactly what is collected (command names, versions, general machine info, sanitised errors), debug logging prints events locally, `ASTRO_TELEMETRY_DISABLED=1` (this env var is from a third-party list). https://astro.build/telemetry/
- Remarkable: a mascot personality in the wizard, and a published list of what telemetry sends.

### Vite
- `npm create vite@latest`; templates vanilla, vue, react, preact, lit, svelte, solid, qwik, each with a `-ts` variant; `--no-interactive` skips prompts. https://vite.dev/guide/
- `vite.new/{template}` opens the same template on StackBlitz in the browser, almost identical to a local setup. Same page.
- Remarkable: a URL per template. It is the cheapest "try it" and the usual way bug reports are shared.

### Next.js Learn
- Landing page: one project (the Acme dashboard), 16 chapters from creating the app through styling, data, rendering, streaming, mutations, errors, accessibility, auth, metadata. Each chapter adds one feature to the same app, with a live example. https://nextjs.org/learn
- Quizzes, progress tracking and certificates are not on the fetched page (unverified).
- Telemetry: opt-out via `NEXT_TELEMETRY_DISABLED=1`, from a third-party list; check https://nextjs.org/telemetry (unverified).
- Remarkable: one real app grown over the course, so the learner ends with something that looks like a product.

### Svelte interactive tutorial
- https://svelte.dev/tutorial/svelte/welcome-to-svelte (was learn.svelte.dev): lesson text on one side, file tree and editor on the other, a `solve` button that reveals the answer (the page advises using it sparingly), previous/next links, four parts (Basic Svelte, Advanced Svelte, Basic SvelteKit, Advanced SvelteKit). Runs fully in the browser; the WebContainers detail is from search results (unverified). https://webcontainers.io/community-projects/sveltekit
- Translations: only a community fork (svelte-jp, Japanese) found; no official programme (unverified).
- Remarkable: exercise plus solve button is the whole mechanic. No server grading.

### Elm
- Compilers as Assistants (Elm 0.16, 2015): errors are written to help, with examples and links; "compilers should be assistants, not adversaries" is quoted by GCC's UX guidelines, and Flix reworked all its messages after Elm. https://elm-lang.org/blog/compilers-as-assistants and https://blog.flix.dev/blog/making-flix-compiler-errors-helpful-and-delightful/
- Elm also tied error work to user reports: confusing-message reports drove the releases. I could not fetch the full text (partial).
- Zinc already translates diagnostics and has `zinc explain`, so what is left from Elm is process (see ideas).

### Kotlin
- Kotlin Koans: each exercise is a failing unit test you make pass; run online at https://play.kotlinlang.org/koans or in the JetBrains Academy IDE plugin; "Show answer" or "Peek solution". Source on GitHub. https://kotlinlang.org/docs/koans.html
- Remarkable: exercise equals a failing test, the same file works in the browser and in the IDE.

### Swift
- Getting started page: install and `swift --version`, then a tour, a command-line tutorial, a web service tutorial, a library tutorial, an iOS/macOS app tutorial. https://www.swift.org/getting-started/
- Swift Playground app (iPad and Mac): interactive lessons ("Get Started with Code", "Get Started with Apps"), challenges, then SwiftUI app building and App Store submission. https://developer.apple.com/swift-playgrounds
- Remarkable: a dedicated learning app aimed at young people and educators, a close fit with Zinc's education audience.

## Patterns across all of them

- A zero-install way to try it exists nearly everywhere (DartPad, Snack, Fiddle, Playground, Tour, StackBlitz, Svelte, Kotlin). Zinc has none.
- The share link is the unit of support: Gist (Fiddle), `vite.new`, Playground, Snack.
- Exercises come as broken code to fix (Rustlings, Koans, Svelte solve). Checking is a test, not a grader.
- Translations are almost always volunteer, in the docs repo or in per-language repos; Astro forbids machine translation. Nobody found uses a vendor tool for the first-run path.
- Telemetry is opt-out, anonymous and documented (Astro); I found no tool that uses it to measure onboarding drop-off in public.
- Diátaxis: I found no tool in this set that states it follows Diátaxis (not verified for Flutter, Tauri, Deno). Rust is the clearest example of the four-door split (Book, by Example, exercises, reference) without naming it.

## Ideas for Zinc, ranked (value for users against effort)

1. Browser playground on the wasm target, with a share link. Who: DartPad, Snack, Go Playground, Vite (`vite.new`), Svelte. It is the biggest gap and the one every tool has. Take: a static page with an editor (Monaco or CodeMirror) and the existing wasm build; compile in the browser or a small build service; encode the program in the URL fragment so sharing needs no server; a "Run in Zinc Go" QR and an "Export as project" button (Fiddle). Large, but the wasm target exists.
2. Starter URLs per template: `play.<site>/new/<template>` that opens a playground with the same template `zinc new` would make. Who: `vite.new`, `astro.new`. Take: reuse `templates/` as the source for both; one route per template. Small once idea 1 exists.
3. Interactive lessons in the browser with a solve button. Who: Svelte tutorial, Kotlin Koans, Tour of Go. Take: turn the 20 existing lessons into steps (text left, editor right, `solve`); the check is a Zinc test run in the wasm build. Start with 5 lessons. Medium.
4. Exercises as failing programs, run locally. Who: Rustlings, Kotlin Koans. Take: `zinc learn` (or a mode of `zinc tour`) that unpacks broken programs, watches the file, reruns the check on save, prints a hint on request (`zinc hint`), shows progress. It reuses `zinc tour` checks and `zinc dev` watch. Medium-small.
5. Error pages with several fixes and a runnable example. Who: Rust error index, Elm. Take: extend `zinc explain` entries with sections: definition, minimal wrong program, two or three fixes, link to a lesson; publish them on the site; test that the "wrong" example fails and the "fixed" ones pass in CI. Small to medium, mostly content.
6. A "grow one real app" course. Who: Next.js Learn (Acme dashboard), Expo tutorial (8 chapters, highlighted changed code). Take: pick one project that fits makers and artists (a small game or a board display), turn it into chapters across the 20 lessons, highlight the changed lines on each step, keep the final source in `examples/`. Medium, content only.
7. Learning app mode for education: guided challenges in Atelier. Who: Swift Playground. Take: Atelier opens a lesson pack (same format as idea 3) with run-and-check in the editor; teachers can hand a pack as a file. Medium-large, after 3 and 4.
8. Per-OS prerequisites that `zinc doctor` links to. Who: Tauri's per-distro tabs; Flutter's `doctor` suggesting a fix. Take: each not-ready line in `zinc doctor` prints a doc URL anchor, and the doc has OS tabs with copy-paste commands. Small; partly done if the verdict already names the fix.
9. A published telemetry page and an opt-in, anonymous first-run funnel (wizard finished, first run succeeded, tour step reached), with local inspection. Who: Astro (what is collected, debug mode prints events, env var opt-out). Take: a short policy page, `zinc config telemetry off`, `ZINC_TELEMETRY_DEBUG=1` printing events; the first-run welcome asks once. Medium; weigh against the audience (schools, privacy) and default to off.
10. Translation process like Astro's: a Translation Guide, no machine translation, a review queue, a new language needs a group that commits to the whole onboarding set. Who: Astro; Rust's per-language repos for the Book. Take: write `docs/i18n/CONTRIBUTING.md`, a script that lists strings missing per language (CLI, diagnostics, docs), and a status table on the site. Small.
11. Prefer a mascot-light wizard tone and a skip flag for non-interactive use. Who: Astro (Houston), Vite (`--no-interactive`). Take: confirm `zinc new` has `--yes` and `--no-interactive`, and optionally a small recurring character for classrooms. Small, low priority.
12. A short video or animated capture on the site: first run to window in 60 seconds. Who: Flutter's video series (how it works). Take: one scripted `zinc capture` GIF per template. Small; I did not find strong evidence of the effect.

Order of work: 1, 2 first (unlock 3 and 7); 5, 8, 10 are small and can go in parallel; 4 and 6 are content with little engine work.
