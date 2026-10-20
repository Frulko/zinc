# zinc lint and zinc migrate: what to reuse, what to build

2026-10-16. The owner asked for (1) a migration tool, so that every language or API change ships with its codemod, (2) an analysis tool
that stops a defect like `class` in JSX before a compile and, per platform, stops a program from using what cannot work or weighs too
much there, and (3) existing tools first. This page holds the survey, the scores (`RULES.md` §4) and what was built
(`src/lint/`, user guide: [docs/guide/10-lint-migrate.md](../guide/10-lint-migrate.md)).

## The constraints that decide

- The users are teachers, makers and artists: one `zinc` binary and a pinned toolchain, **no Node, no npm, no browser** to install, a Mac
  with nothing on it. A Node tool can stay for the repository's own use, never on the user's path.
- The input is the Zinc subset (strict, typed TSX), and the questions are Zinc's: `targets/capabilities.json`, the profile table,
  `zinc.json` `requires` / `targets` / `ui` / `assets`, `plugin.json` `requires` / `targets`, `@requires` comments, the UI tiers T0..T4.
  No outside tool knows any of these.
- A tool we pin must be a single Rust or C binary, downloaded by `zinc toolchain` with its SHA-256 like zig (`src/tc/tc.cpp`), with a
  licence that allows it (MIT, BSD, Apache-2.0, zlib, ISC). Code linked into `zinc` counts against the archive budget (< 40 MB, ~28 now).

## Survey (facts checked on GitHub, 2026-10-16)

| Tool | What it is | Licence | Delivery | Notes for Zinc |
|---|---|---|---|---|
| ast-grep 0.51.0 | structural search and rewrite on tree-sitter, YAML rules with `fix:`, `sg scan` as a linter | MIT | one Rust binary, 8 MB zip (x86_64 and arm64 macOS, Linux, Windows) | the best general codemod tool for us; its own TSX grammar, not our lexer; no armv6/armv7 builds (Pi 1, CHIP) |
| jscodeshift, ts-morph | codemods on Babel / the TypeScript API | MIT | Node + npm | the industry standard for React codemods; Node |
| `tsc` quick fixes, `tools/jsx-migrate` | the TypeScript language service; our first codemod was written on it | Apache-2.0 / ours | Node + TypeScript (~20 MB) | right tree, wrong runtime for users |
| Comby 1.8.1 | language-agnostic structural rewrite | Apache-2.0 | OCaml binary, 36 MB on Linux; macOS needs Homebrew's pcre and libev | last release 2022-06 |
| Biome 2.5.15 | formatter + linter (GritQL plugins report diagnostics), `biome migrate` rewrites Biome's own config | MIT or Apache-2.0 | one Rust binary, 55-58 MB | heavy; no general codemod front end |
| oxlint 1.88.0 | 600+ rules, ports of eslint-plugin-react, react-perf, jsx-a11y, import, unicorn | MIT | one Rust binary, 5 MB tar.gz | `react/no-unknown-property` and `jsx-pascal-case` model React DOM (a lowercase tag is an HTML element, so `<view>` is legal there); knows no target |
| ESLint + eslint-plugin-react (`no-unknown-property`, `jsx-pascal-case`), react-native, jsx-a11y, typescript-eslint | the reference linters | MIT | Node | repository use only |
| `tsc --strict` | type checker | Apache-2.0 | Node | the engine's checker is the strict check of the subset; the reference `tsc` stays in `tools/oracle` |
| knip, depcheck | unused files, exports and dependencies | ISC, MIT | Node | the idea applies to `zinc.json` dependencies (the loader knows what is imported) |
| size-limit, bundlesize, Lighthouse budgets | size and performance budgets per bundle | MIT / Apache-2.0 | Node / Chrome | the idea is ours already: `assets.budgets` in `capabilities.json` and `zinc.json`, `zinc assets build` measures |
| expo-doctor, react-native doctor | project and environment checks | MIT | Node | `zinc doctor` checks the machine; the project-per-platform half is `zinc lint --all-targets` |
| Android lint (NewApi), Xcode / clang `-Wunguarded-availability`, Swift `@available` | API availability against the deployment target | Apache-2.0 / Apple | JVM / Xcode | the model we follow: a capability declared by the API (plugin.json, `@requires`) checked against the target, statically |
| bloaty, cargo-bloat, esp-idf-size | where the bytes of a built binary go | Apache-2.0 / MIT / Apache-2.0 | C++ / Rust (Rust only) / Python | after the build, for the engine's own size work; not a pre-build lint |

## Scores (§4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1; max 70)

Codemods:

| Option | fit | perf | size | maint | lic | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **codemods on the engine's lexer and JSX walk (`zinc migrate`)** | 5 | 5 | 5 | 4 | 5 | 5 | 3 | **66** |
| ast-grep, pinned like zig | 3 | 5 | 4 | 4 | 5 | 3 | 4 | 57 |
| vendored tree-sitter + tree-sitter-typescript in `zinc` | 4 | 5 | 2 | 3 | 5 | 5 | 2 | 54 |
| Biome / GritQL | 2 | 5 | 1 | 3 | 5 | 3 | 3 | 45 |
| Comby | 2 | 4 | 2 | 2 | 5 | 2 | 3 | 41 |
| jscodeshift, ts-morph, tsc, `tools/jsx-migrate` (Node) | 1 | 3 | 1 | 4 | 5 | 2 | 5 | 39 |

Lint:

| Option | fit | perf | size | maint | lic | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **a rule registry on the engine's lexer, loader and capability tables (`zinc lint`)** | 5 | 5 | 5 | 4 | 5 | 5 | 3 | **66** |
| oxlint, pinned | 2 | 5 | 4 | 4 | 5 | 3 | 4 | 54 |
| Biome lint | 2 | 5 | 1 | 4 | 5 | 3 | 4 | 48 |
| ESLint + plugins (Node) | 1 | 3 | 1 | 4 | 5 | 2 | 4 | 38 |

Why "fit 5" for our own: the codemod rewrites exactly the tokens the engine reads (the lexer that `src/frontend/jsx.cpp` lowers, so a
string, a comment or JSX text can never be a site), its ids are named by the engine's own errors, and the lint loads the program the
way `zinc run` does for each profile (its platform files `x.<target>.tsx`, the Z5005 plugin check of `modules.cpp`) and reads the tables no
outside tool has. The cost is small: about 300 lines for the codemods, 450 for the rules, no new dependency, nothing to download.

## Decisions

| Tool | Decision | Why |
|---|---|---|
| ast-grep | not now; the first tool to pin if users ever write their own structural rules | 8 MB, MIT, good; but it answers no Zinc question, and the two codemods need no second parser |
| oxlint | not now; candidate for an opt-in `zinc lint --js` of generic hygiene rules, pinned like zig | its JSX rules model the DOM, not Zinc; most of its correctness rules overlap the checker |
| Biome, Comby, tree-sitter in the binary | no | size (55 MB, 36 MB, ~2 MB in every `zinc`) or an unmaintained build |
| jscodeshift, ts-morph, tsc, ESLint, knip, size-limit | repository use only, if ever | Node |
| `tools/jsx-migrate` | **retired** for `zinc migrate` | same rewrites without Node; covers .tsx, .jsx and the code fences of .md files |
| Android lint, Xcode availability, size-limit, expo-doctor | the ideas, not the tools | availability = `requires` / `targets` / `@requires` against the profile; budgets = `assets.budgets`; doctor = `zinc doctor` + the matrix |
| bloaty, esp-idf-size | later, for the engine's own size (pinned like basisu) | measure after a build, not before |

What would make us revisit: users asking for their own rewrite rules (pin ast-grep, rules in the project), or a request for React-style
hygiene rules (pin oxlint behind `--js`).

## What exists (`src/lint/`, one header `lint.h`)

- `zinc migrate [--list] [--dry-run|--apply] [<codemod>...] [paths]`: the codemod table (`id`, `since`, the code it fixes, `scan`).
  `jsx-classname` (Z0006: the attribute, and the prop of components: `class?:` keys, `props.class`, `{ class: c }`) and
  `jsx-capitalised-tags` (Z0007: the tags of `jsxLowercaseTags()`, the table the error uses; an unknown lowercase tag is named for a person).
  A dry run (the default) prints a unified diff; a second run changes nothing. The two errors name their codemod in their fix line.
- `zinc lint [--target <profile>|--all-targets] [--json] [--rules] [path]`: 13 rules (`zinc lint --rules`), source rules on every
  .tsx/.jsx file of the path and target rules on the program loaded with each profile: `compile`, `plugin-requires` (Z5005),
  `project-requires`, `ui-layout`, `assets-flash` (errors); `plugin-targets`, `module-requires`, `ui-tier` (the static view of the three
  `tierWarn` cases of `lib/std/ui.ts`: conic below T3, gradients beyond two stops along an axis and repeated images at T0/T1),
  `screen-size` (fixed widths and heights against a fixed screen), `assets-memory`, `texture-size` (warnings, PNG sizes read from IHDR,
  texture bytes in the target's first format). `--all-targets` prints the matrix target x status. Exit 1 only for an error on the
  source or a target in force.
- Tests: `tests/t0/migrate.sh` (fixtures before/after, idempotent, dry run, the error fixtures compile once migrated),
  `tests/t0/lint.sh` (every rule on `tests/golden/lint/rules`, the matrices of `examples/hero` and `tests/golden/lint/esp32-app`).

## Not done, and why

- Shadows and blur have no tier rule: the renderer draws them on every tier today, so there is nothing to warn about yet.
- `boot` and `download` budgets are not estimated: which assets load before the first frame depends on `assets.groups` and the loader stage.
- JPEG and WebP count their file size, not their pixels (PNG only reads its header); `zinc assets build` gives the measure.
- Compile errors are reported for the project's own files only: lint builds no plugin, so a plugin's native part is absent and the
  loader would read the old simulator's stand-ins. `zinc check` remains the whole compile.
- The language server shows Z0006 and Z0007 already (they come from the loader); the target rules are not in the editor yet
  (`zinc lint --json` is the interface for that).
- Comments are never rewritten by `zinc migrate` (jsx-migrate rewrote them by pattern), nor `inline code` in Markdown prose, nor .ts files.
