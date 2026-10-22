# Internationalisation of Zinc's onboarding and tooling: research and recommendation

Date 2026-10-22. Scope: the CLI and its diagnostics, Zinc Atelier, docs and site, and (briefly) what Zinc gives to app authors.
Method: the repository was read (counts below are measured with grep/wc, rough); outside facts are marked **[web]** (fetched in this session) or **[memory]** (recalled, to verify before a decision record is written).

## 1. Inventory: what exists and what needs translating

| Area | Where | What is there now | Rough size |
|---|---|---|---|
| CLI help | `src/cli_core.cpp` lines 67-372: `struct Command { name, usage, summary, detail }`, 44 commands, plain C string literals | `zinc help`, `zinc help <cmd>`, "unknown command" and usage errors (`std::fprintf(stderr, ...)`) | about 6,700 words in the table; about 270 printf/puts calls in `cli_core.cpp`, 280 in `main.cpp`, 12 in `test_cmd.cpp`, 15 in `lint.cpp`, 6 in `cli_pm.cpp` |
| `zinc doctor`, `zinc new` | `cli_core.cpp` `doctor()` (line 583) and `doctorDetails()` (line 498); the new/init code from line 408 | the first-run messages: colour check-up, the `xcode-select --install` offer, next steps | about 50 string literals in `doctor()`, about 30 in `new` |
| Diagnostics registry | `include/zn/diagnostics.h`: the X-macro `ZN_DIAGNOSTICS(code, title, why, fix, example)`, the only place a code is written. `src/frontend/diagnostics.cpp` (67 lines) formats, `explain()` and `markdown()` generate `zinc explain` and `docs/diagnostics.md` from it | 42 codes (Z0001...), each with title, why, fix and a code example | 42 x 3 translatable strings (about 126; the examples are code and stay) |
| Diagnostic details | `Checker::diag(code, node, detail)` in `src/frontend/check.cpp` (line 108) and `jsx.cpp`, `modules.cpp`, `parser.cpp`, `lint.cpp` | the message after the title is built by concatenation: `"a function passed as DynFunction takes ... (parameter " + std::to_string(k + 1) + " is '" + name(p) + "')"` | 245 `diag(k...)` call sites, about 190 with prose; plus `hint()` (the line after the diagnostics) |
| Atelier | `app/atelier` (Zinc/TSX, about 4,900 lines): `app/commands.ts` (menu and palette: `add('File','open','Open Sketch...', 'CmdOrCtrl+O', fn)`), `components/*.tsx`, `app/*.ts` status messages via `say('Saved')`, dialogs, `examples/index.txt` (`folder|Title|one line`, 8 examples) | English literals in code, no string table | about 250-350 strings (about 245 `label:`/`title:`-like and sentence literals found by grep, plus 19 JSX text nodes and the status messages) |
| Templates | `templates/*` (11 templates, 122 files), 10 `README.md` | README prose, comments in sources | about 2,000 words of README; comments are code-adjacent and stay English |
| Docs | `docs/guide/01..12` (about 27,900 words), `docs/ui.md`, plugin/target docs; top-level `docs/*.md` about 65,000 words; `docs/reports` (159 files, internal) | English only. `01-getting-started.md` is tested by `tests/t1/first_run.sh` | onboarding subset to translate: guide 01 (370 lines), the site's `get-started`, `cli`, `about` pages: about 6,000 words |
| Site | `site/`: Astro `^7.3.5`, no integrations, `src/content.config.ts` has one `docs` collection with a `glob` loader over `../docs` (`guide/*.md`, `plugins/*.md`, `targets/*.md`, `reports/*.md`, ...); `src/pages/docs/[...slug].astro`; hand-written `.astro` pages (index, get-started, cli, demos, about, philosophy, plugins, uses, embedded); `astro.config.mjs` has `base: '/zinc'`, `trailingSlash: 'always'` and a rehype plugin that rewrites doc links | one language | 9 hand-written pages |
| App-author i18n | `lib/std`, `include/zn`, `src/rt` | `locale()` in `zinc:sys` (ZN-687: host `systemLocale()` in `src/host/sys_host.cpp` reads LC_ALL, LC_MESSAGES, LANG, else macOS `CFLocaleCopyPreferredLanguages`; returns BCP 47); `navigator.language` in the web env; `String.localeCompare` is root collation, the locale argument is ignored; `Date.toLocale*String` ignores the locale (en-US, stated in `lib/zinc.d.ts`); `Intl.Segmenter` exists (ZN-165). **No** `Intl.NumberFormat`, `PluralRules`, `DateTimeFormat`, no message catalog, no plural rules | nothing to translate; a gap |
| Prior art inside the repo | `examples/museum-table/editor/strings.ts` (511 lines), `examples/pinball3d-editor/src/strings.ts` (443 lines) | one table, `S(en, fr)` returns an int key, `t(k)`, `f(k, a, b)` with `{0}`, a language signal, a `complete()` self-test that every key exists in both languages, an env override (`MUSEUM_EDITOR_LANG`), the owner's decision in D76 ("French and English from one string table, typed keys") | the pattern to generalise |
| Decisions | `docs/reports/zinc-next-decisions.md` | no decision about i18n, Intl or locale for the engine or the tooling (only D76 for one app, and ZN-687 for the locale getter) | the question is open |

Facts that shape the design:

1. Diagnostic **codes and registry already exist** and are the stable, searchable identifier. A translation changes the title/why/fix text, never the code. Tests and goldens (`tests/golden/*/errors/*.expect`, `tests/t1/first_run.sh`) compare English output, so tests must pin the language to English.
2. Locale detection exists host-side already (`systemLocale()`); it lacks `LANGUAGE`, Windows, and an override.
3. The engine is one binary, about 11.7 MB, that must run on small and old machines; the C++ side already links yyjson (JSON reader) and has lz4/zstd decoders.
4. Text already goes through HarfBuzz and SheenBidi, so Arabic/Hebrew shaping and bidi are not blocked. **Fonts are the real constraint** for CJK, Thai, Devanagari, Arabic in the Atelier and in `zinc:ui` (a CJK font is megabytes; check the font strategy before promising those languages in the Atelier).

## 2. How comparable tools do it

- **TypeScript (`tsc --locale fr`)** [memory]: closest precedent for Zinc. Compiler messages are generated from one JSON table, with `{0}` placeholders, translated into about a dozen languages by Microsoft's localisation pipeline; the error code (`TS2322`) is unchanged, so searching the code works in any language. Users search the English text or the code on Stack Overflow, which is why the code is always printed.
- **rustc** [web: the rustc-dev-guide page "Translation" says the Fluent infrastructure is waiting for a redesign that has not been proposed, contributors are not required to use it; tracking issue 132181]: Fluent-based diagnostic translation was built, then stalled; the compiler is effectively English-only. Lesson: converting thousands of dynamic compiler messages to a message-resource system is expensive and has stalled even with a big team. Do the stable 20% first (titles, explanations, fixes), keep dynamic details English.
- **git, GCC, GNU tools** [memory]: gettext (`_("...")`, `.po`, `.mo`), English source string as the key, `LANGUAGE`/`LC_MESSAGES`. Well-proven, but needs libintl on non-glibc (macOS, Windows, musl, zig cross builds), the LGPL runtime, and `msgfmt` at build time. Git keeps plumbing/machine output untranslated.
- **Godot** [memory]: gettext `.po` or CSV for projects and for the editor; the editor is translated into about 40 languages through Weblate; the documentation too (Weblate). A maker/artist audience like Zinc's.
- **Arduino IDE 2** [memory]: translated through Transifex into about 40 languages; the user base that most resembles Zinc's makers/education users.
- **Flutter** [memory]: ARB (JSON with ICU MessageFormat plurals) plus `intl` codegen; docs translated by community in separate repos (often stale).
- **Deno, Bun, Go tools** [memory]: English only; messages are not translated, errors are searchable in English. Not a model for an audience of beginners.
- **Fluent** (Mozilla) [memory]: strong grammar features (terms, variants), reference implementations in JS and Rust; no maintained C or C++ implementation I know of. It would need a parser written by Zinc, which RULES forbids; and Zinc's CLI messages do not need Fluent's grammatical power.
- **ICU MessageFormat 1/2** [memory]: ICU4C is a multi-MB library with data (tens of MB of CLDR in full); ICU4X has C/C++ FFI and small data slices, but MessageFormat 2 is not in its stable API to my knowledge. Too heavy for a 27 MB CLI that targets small boards, for what is "pick a string, fill `{name}`, choose one/other".
- **Docs**: [web] Starlight has built-in i18n routing, fallback to the default locale's page with a translation notice (`i18n.untranslatedContent`), RTL support, and about 40 UI languages. Astro itself has native i18n routing (`i18n: { locales, defaultLocale, routing }`, `getRelativeLocaleUrl`) [memory], which Starlight builds on.
- **Weblate** [web, via a directory; verify on weblate.org]: free hosted tier for libre projects with a free licence, paid plans by source-string count; repository-based (it commits to a branch or opens PRs), supports PO, i18next JSON, ARB, Markdown-ish via other tools. Weblate is what Godot uses [memory]. Crowdin and Transifex have free OSS plans too [memory]. Pontoon is Mozilla-specific (Fluent/PO) and needs self-hosting.

Good practice, consistent across these: translate the human text, **keep codes, flags, command names, file names, JSON keys and machine formats (JSON, LSP, DAP, logs for bug reports) in English**; always print the code; allow forcing English (`--lang en`) so a user can paste an error that maintainers can read.

## 3. Locale detection and override

Order, first hit wins: (1) `--lang <tag>` option; (2) `ZINC_LANG` env; (3) `lang` in `~/.zinc/config.json` (set by `zinc config set lang fr`, and by the Atelier settings, so both agree; `zinc config` does not exist today, so this is new: a 100-line command using yyjson); (4) `LANGUAGE` (colon list, GNU convention, new), `LC_ALL`, `LC_MESSAGES`, `LANG` (exists; `C`, `POSIX`, `C.*` mean English); (5) macOS `CFLocaleCopyPreferredLanguages` (exists, needed for apps started from Finder); Windows `GetUserDefaultLocaleName` / `GetUserPreferredUILanguages` (new, the Windows HAL opens the cross-platform pass); (6) English.

Match by language, then script/region: `fr-CA` falls back to `fr`, `pt-PT` to `pt-BR` only if the latter is the one translation, `zh-TW` is not `zh-CN`; always end at `en`. Never call `setlocale()` for this: it changes printf decimals and sorting. `NO_COLOR` and similar flags are unrelated. The LSP server uses the `locale` field of `InitializeParams` (LSP 3.16) [memory]; the Atelier calls the same code with its own setting. Existing function `systemLocale()` stays the one source; `src/frontend/modules.cpp:270` has a second copy of the comment/idea to merge.

## 4. Options, scored per RULES section 4

Weights: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1 (1-5 each; maximum 70; effort 5 = cheapest).

### (a) CLI and diagnostics

| Option | fit | perf | size | maint | licence | port | effort | Total |
|---|---|---|---|---|---|---|---|---|
| 1. GNU gettext libintl at run time, `.po`/`.mo` | 4 | 4 | 2 | 3 | 2 | 2 | 3 | 43 |
| 2. JSON catalogs (id to text, `{name}` placeholders, CLDR plural suffixes), English embedded, other languages as files read with the vendored yyjson, tiny `tr()` and a CLDR plural function | 5 | 5 | 5 | 4 | 5 | 5 | 3 | **66** |
| 3. Same as 2 but every language embedded in the binary | 5 | 5 | 3 | 4 | 5 | 5 | 3 | 60 |
| 4. Fluent (own C++ parser) | 3 | 3 | 3 | 2 | 4 | 3 | 1 | 40 |
| 5. ICU4C or ICU4X MessageFormat | 3 | 3 | 1 | 3 | 5 | 3 | 2 | 41 |
| 6. Do nothing for the CLI (translate docs, site and Atelier only) | 1 | 5 | 5 | 5 | 5 | 5 | 5 | 58 |

Choice: **option 2**. The format and tool choices are reversible and sit behind `tr()`.

- Message ids, not English-as-key (gettext style): `tr("doctor.engine.ready")`. The English source is `i18n/en.json`; a T0 test fails when a `tr("id")` in the sources is missing from it. Ids keep translators' context (`doctor.xcode.offer`) and survive rewording of English.
- Format: flat JSON, i18next v4 conventions for plurals (`files_one`, `files_other`, CLDR categories `zero/one/two/few/many/other`) and `{name}` placeholders. Weblate, Crowdin and Transifex read this format [memory], and it is the same format as (b) and (d), so there is one workflow, one checker, one reader (yyjson in C++, `JSON.parse` in Zinc).
- Delivery: English is embedded (a generated `.inc`, no file read, no cost). Other languages are `i18n/<lang>.json` in the engine folder, found like `lib/` is; at 6,700 help words plus doctor/new/diagnostics, about 40-60 KB raw per language, so embedding six languages would add about 300 KB to a 11.7 MB binary (option 3 scores lower only on size and could be revisited with lz4, already vendored). A missing file or key falls back to English, never to an empty string.
- `help`: the `Command` table keeps `name` and `usage` (syntax, English) and moves `summary` and `detail` to ids `help.<cmd>.summary` and `help.<cmd>.detail`. Do **not** start with all 44 details: the 8-10 onboarding commands first (`new`, `run`, `doctor`, `check`, `build`, `dev`, `help`, `explain`, `add`).
- Diagnostics, three tiers. Tier 1: the registry; `title`, `why`, `fix` move to catalog keys `diag.Z0001.title|why|fix` (the macro still holds English as the source and the default); `format()`, `explain()`, `hint()` look them up; the example stays code. The first line stays `file:line:col: error Z0001: <title>`; `zinc explain Z0001` prints the localised text and, last, the English title so that searching works. Tier 2: the 20-30 most common `detail` strings (not found, not assignable, missing import, JSX capital letter and `className`) become ids with placeholders (`diag.detail.notFound` = `'{name}' not found. Did you mean '{guess}'?`). Tier 3 (never, or on demand): the remaining 160 or so details stay English; identifiers and types in them are code anyway. rustc's stalled effort is the warning against attempting all of them.
- `--json`, LSP/DAP messages' `code`, logs written to files, and the test goldens stay English. Tests run with `ZINC_LANG=en` (set in `tests/run`, as `ZINC_BACKGROUND` is); one T0 test per language checks that `zinc explain Z0001` loads and contains `Z0001`.
- Plurals: the CLI has few (N errors, N files). CLDR plural rules for the shipped languages are a switch of about 40 lines (fr: 0 and 1 are `one`; es/pt/it have `many` for millions; ru has `one/few/many/other`; ja/zh/ko only `other`); data from CLDR's `plurals.json` (Unicode licence, permissive), checked by a test against a few known numbers.

### (b) Zinc Atelier

| Option | fit | perf | size | maint | licence | port | effort | Total |
|---|---|---|---|---|---|---|---|---|
| 1. A `zinc:i18n` module (see (d)) plus `app/atelier/i18n/<lang>.json`, `t('menu.file.open')`, loaded at start, shared catalog format with the CLI | 5 | 5 | 5 | 5 | 5 | 5 | 3 | **68** |
| 2. The museum editor's pattern copied: `S(en, fr)` int keys, languages in source | 3 | 5 | 5 | 2 | 5 | 5 | 4 | 56 |
| 3. Embed i18next/Lingui npm packages in QuickJS | 3 | 2 | 2 | 3 | 4 | 3 | 2 | 38 |

Choice: option 1. The museum editor proved the pattern (one table, typed key, a language signal, a completeness check, env override) but `S(en, fr)` does not scale to eight languages or to Weblate. Specifics: the menu (`menu.item(id, title)`) and the command palette titles are built from `add(group, id, title, accel, fn)`: the `id` is already a stable key, so the catalog key is `cmd.<id>`; the accelerators and ids stay untranslated; `say(...)` status messages get ids with `{name}`; the examples list (`examples/index.txt`, `folder|Title|one line`) gets titles from the catalog keyed by folder (`example.<folder>.title|text`), the file stays the English default; the user's code and the console output are never translated. Add a language entry to the settings and the same `lang` key in `~/.zinc/config.json`, effective at restart first (live switch with a signal, as the museum editor does, when cheap). A pseudo-language `en-XA` (accented, +35% length) goes into CI screenshots to catch unextracted strings and clipped buttons; German and French run about 20-35% longer than English. Fonts: confirm the bundled font covers the Latin extended, Cyrillic and Greek ranges before listing es/pt/de/ru; CJK waits for the font strategy.

### (c) Docs and site

| Option | fit | perf | size | maint | licence | port | effort | Total |
|---|---|---|---|---|---|---|---|---|
| 1. Keep Astro; native i18n routing (`/zinc/fr/...`), translations in `docs/i18n/<lang>/...` mirroring the English path, a frontmatter `source: <git sha>` per translated file, stale/untranslated notice, English fallback; a `site/src/i18n/<lang>.json` for page chrome | 4 | 5 | 5 | 4 | 5 | 5 | 3 | 64 |
| 2. Move the whole site to Starlight (i18n built in) | 3 | 5 | 4 | 4 | 5 | 5 | 1 | 55 |
| 3. Translate docs only on GitHub, in `docs/<lang>/`, no site routing | 2 | 5 | 5 | 3 | 5 | 5 | 4 | 52 |
| 4. An external docs-translation platform (Crowdin docs, Weglot) | 3 | 4 | 4 | 2 | 2 | 5 | 3 | 46 |

Choice: option 1. Reasons: the site is nine hand-made pages plus a `glob` collection over `../docs`; a move to Starlight would restyle everything for a feature Astro already gives as routing; the site's `rehypeDocLinks` and `BASE='/zinc'` need adjusting for a locale prefix either way (a few lines: keep the locale when rewriting `.md` links). Scope and sync:

- Translate only the **onboarding set**, not the 65,000 words: site `get-started`, `cli`, `about`; `docs/guide/01-getting-started.md`, `02-language.md` and `03-ui-apps.md`; `docs/diagnostics.md` is generated from the catalogs (a localised `zinc explain --markdown --lang fr`); templates' READMEs (`README.fr.md` next to `README.md`, `zinc new` copies the one for the active language and falls back to English). `docs/reports` and decisions are internal: never.
- Add `locales` to `astro.config.mjs` and a second `glob` pattern (`i18n/*/guide/*.md`) in `content.config.ts`; the page route picks the locale entry and falls back to the English entry with a banner "This page is not translated yet".
- Stale detection: each translated file has `source: <sha of the English file at translation time>`; a CI script (`tools/i18n-docs-check`) runs `git log -1 --format=%H -- <english file>` and marks the page stale when the English file changed after that sha (banner "the English page changed on <date>", with a link). Stale does not break the build; a translation missing for a language that claims "complete" in `i18n/languages.json` does.
- `tests/t1/first_run.sh` walks guide 01 with real commands and English output: it stays English. Code blocks, command names and error code text in translations are not translated; only prose, and the sample output blocks that show localised errors get a note.
- `zinc.json`/`package.json` keys, file names and URLs stay English; the site language switcher sets a cookie-free `localStorage` hint and never forces a redirect.

### (d) App-level i18n (secondary)

What the references do [memory]: Expo: `expo-localization` (device locale, RTL, calendar) plus i18next or Lingui; Nuxt: `@nuxtjs/i18n` (vue-i18n, ICU-like messages, routes with locale prefix); Flutter: `intl` and ARB, generated typed getters; web: `Intl`.

Gap today: no `Intl.PluralRules/NumberFormat/DateTimeFormat`, `toLocale*` ignores the locale, no catalog. Consequences: libraries that call `Intl.PluralRules` (i18next does, with a fallback) misbehave on the QuickJS engine; the typed engine has nothing.

| Option | fit | perf | size | maint | licence | port | effort | Total |
|---|---|---|---|---|---|---|---|---|
| 1. `zinc:i18n` (catalogs, `t()`, plural, number and date helpers) plus a small `Intl` subset (`PluralRules`, `NumberFormat`, `DateTimeFormat`, `getCanonicalLocales`) on both engines, data generated from CLDR for a short list of languages | 5 | 4 | 4 | 4 | 5 | 5 | 2 | 63 |
| 2. Docs only: "use i18next or Lingui from npm" on the QuickJS engine | 2 | 3 | 5 | 4 | 5 | 4 | 5 | 51 |
| 3. ICU4X FFI for full `Intl` | 5 | 3 | 1 | 3 | 5 | 3 | 1 | 49 |

Choice: option 1, after the tooling, and kept small. `zinc:i18n`: `locale()` (exists), `setLocale(tag)`, `loadCatalog(json)`, `t(key, params?)` with `{name}` and `_one/_other` plural suffixes, `plural(n, locale)` (the same function the CLI uses, one implementation shared by the C++ and the Zinc side through the runtime table rule: `include/zn/` is the only place a constant is defined), `formatNumber`, `formatDate` for the shipped languages (decimal and thousands separators, month and weekday names, 24 h or 12 h: a few KB of CLDR data per language, generated at dev time; the `Intl` objects and `toLocale*String` call the same data). Message format stays `{name}` + plural suffixes, not ICU syntax: the same catalogs work in the CLI, the Atelier and apps. Gate: the small `Intl` subset is justified by compatibility (i18next, date libraries), not by new features. The templates get an optional `i18n/` folder in the `game` and `desktop-app` templates only when this exists.

## 5. Owner decision (2026-10-22): five languages from the start, one file per language

Shipped together: **English (source and fallback), French, Spanish, Italian, German** (en, fr, es, it, de). The earlier question "which languages first" is closed; later languages (pt-BR, zh-Hans, ja...) follow the same machinery, CJK waiting for fonts (section 1, fact 4). A language is listed as supported only when every key of the core set is present and a person who reads it has reviewed it; machine drafts carry a `draft` flag in `i18n/languages.json` (shown by `zinc help --langs`).

### 5.1 One file per language, shared by the CLI and the Atelier

Format recommended: **flat JSON, one file per language** (`fr.json`), keys are stable ids, values are strings with `{name}` placeholders and CLDR plural suffixes. Compared on the same scale as section 4 for "one file for C++ and Zinc":

| Format | fit | perf | size | maint | licence | port | effort | Total |
|---|---|---|---|---|---|---|---|---|
| JSON, flat, i18next-v4 plural suffixes (read by vendored yyjson in C++, `JSON.parse` in Zinc) | 5 | 5 | 5 | 4 | 5 | 5 | 4 | **67** |
| gettext `.po` (needs a reader on both sides; Zinc side has none; plural expressions are C-like code to evaluate) | 4 | 4 | 4 | 4 | 4 | 3 | 2 | 52 |
| Fluent `.ftl` (a parser to write on both sides; no maintained C++ one) | 3 | 3 | 3 | 3 | 4 | 3 | 1 | 40 |
| ARB (JSON plus ICU message syntax inside the values: a message parser on both sides) | 3 | 3 | 4 | 3 | 5 | 4 | 2 | 46 |

JSON wins because no new parser is written (RULES: never write a parser): yyjson is already linked and `JSON.parse` exists in Zinc; Weblate, Crowdin and Transifex all read it [memory]. Its weakness (no comment, no "fuzzy" state) is covered by a sibling `en.meta.json`: per key a description for translators and the `{name}` meaning, used by Weblate and by the CI check; review state lives in Weblate and in `languages.json`.

Keys are grouped by dot prefix so one file serves every consumer without collisions: `cli.*` (help, doctor, new, errors), `diag.Z0001.title|why|fix`, `atelier.*`, `tour.*` (5.4), `site.*` (page chrome). The C++ reads the keys it needs on first use (parse once, lazily, only when the language is not English); the Atelier loads the same file. Atelier and CLI therefore ship one `fr.json`, not two.

### 5.2 Placeholders and plurals for the five languages

- Placeholders: named, `{name}`, `{count}`, never positional, so word order can change (`'{name}' not found` in German or Italian can move the name). Escape a literal brace as `{{`. Values are plain text; no HTML or markdown in values except the backticks of the English source, which must be kept.
- Plural keys: `key_one`, `key_many`, `key_other` (and the bare `key` for a message without a number). The runtime picks the CLDR category of `{count}` and falls back `many` to `other`, `other` to the bare key, then to English.
- CLDR cardinal categories for these five (CLDR 42 and later, from memory, verify against `plurals.json` when the table is generated): **en and de**: `one` (integer 1, no decimals) and `other`. **fr**: `one` (0 and 1, and decimals from 0 up to but excluding 2), `many` (a million, a billion... exact integers that are a multiple of 10^6 with no remainder, introduced for compact notation), `other`. **es** and **it**: `one` (1), `many` (the same millions rule), `other`. So the required categories are `one` and `other` for en/de and `one`, `many`, `other` for fr/es/it, but `many` only matters for counts of 1,000,000 and more: a CLI file count never gets there, so the check requires `one` and `other` for all five and only warns when `many` is missing in fr/es/it; the plural function still implements `many` so that the table is correct if a language needs it later. Differences to keep in the tests: `0 fichier` (fr, `one`) against `0 files` (en, `other`); `1,5 fichier` (fr `one`) against `1.5 files` (en `other`).
- Plural function: about 40 lines of C++ (and the same table read by Zinc through the runtime table in `include/zn/`), data generated from CLDR `plurals.json`, tested on 0, 1, 1.5, 2, 21, 1,000,000.
- Number and date formatting inside messages is done by the caller with `formatNumber` (comma or dot, from the locale) and then passed as a string placeholder; no formatting syntax inside messages.
- Gender, case and formality: French and Spanish and Italian use `vous`/`usted`/`Lei` or `tu`: pick one register for the product ("tu" for education and makers in all four, decided once in `i18n/glossary.json`, which also fixes the translation of: sketch, project, target, plugin, build, run, device) and keep it. German: `du`. No grammar machinery needed for the strings in scope.

### 5.3 Where the files live

- Repository: `i18n/en.json` (source), `i18n/en.meta.json`, `i18n/fr.json`, `es.json`, `it.json`, `de.json`, `i18n/languages.json` (list, status `supported|draft`, native name, plural rule id), `i18n/glossary.json`. One directory at the root, beside `templates/` and `devices/`, so there is no per-app copy to keep in sync. The generated `src/i18n/en_embedded.inc` (English as a C++ literal, produced by `tools/i18n-embed` at build) is the only generated file.
- Installed package: `~/.zinc/engine/i18n/*.json`, found through `engineRoot` exactly as `engineRoot/templates` and `engineRoot/devices` are found today (`listTemplates(engineRoot)`, `simulate()`). The release packaging (`tools/package`, `make release`, the Homebrew formula and `install.sh` tarball) copies `i18n/` into the engine folder. The five files together are about 150-300 KB; the Atelier, when packaged as an app (`app/atelier/package-macos.sh`), copies the same directory into its resources and finds it the way it finds `examples/` (`APP_HOME`).
- Overrides for translators: `ZINC_I18N_DIR=<dir>` reads a directory instead of the engine's (a translator tests a file without building), and a project-level `i18n/` folder is the app author's own catalogs (section 4(d)), never mixed with Zinc's.
- English is embedded in the binary and in the Atelier's source, so a broken or missing install still prints readable English: the file for English is `en.json` only for the tools (check, drafts, Weblate).

### 5.4 Tours read their text from the same files

Neither tour exists yet (the only "tour" in the repo is the language-conformance example `examples/lang`). Design, so that they are written once:

- A tour is data plus text: `tours/<id>.json` (steps: `id`, the action or highlight (`{"target": "run-button"}`, `{"cmd": "zinc new game demo"}`), the expected check) holds **no prose**; each step's words are the keys `tour.<id>.<step>.title` and `.body` (plurals and `{name}` work the same) in the language files. Code samples and commands inside a step are not translated (`{cmd}` placeholder: `Type {cmd} and press Enter` with `cmd` = `zinc run demo`).
- `zinc tour [name]`: the CLI walk reads `tours/<id>.json`, resolves each text with `tr()`, prints the step, runs or shows the command, waits for Enter (not when not a terminal), and supports `--lang`. The Atelier's first-launch tour reads the same `tours/<id>.json`, resolves the text with `t()` from the same `fr.json`, and highlights UI nodes by the stable command id of `commands.ts` (the id is already stable: `cmd.<id>`).
- The two tours may share steps (install, new, run, first error) and differ in surface; the CI check treats `tour.*` like every other key, so a step added in English without a translation is reported.
- `tests/t1/first_run.sh` already walks the same commands in English; `zinc tour --lang en --dry-run` prints the steps for a test, one golden for the English tour.

### 5.5 CI check, the one the owner asked for

`tools/i18n-check` (T0, no network, seconds) runs on every language file of `i18n/` against `en.json`:

1. the key set of each file equals English's (missing key is an error for `supported` languages, a warning for `draft`; extra key is always an error); plural keys are compared as one message (`files_one/files_other`): each language must have its required categories (`one` + `other`);
2. the set of `{placeholders}` of each key equals English's (names and number, order free), per plural form;
3. error codes `Z\d{4}`, backticked code, command names and flags in the English value appear in the translation unchanged;
4. every id used in `src/`, `app/atelier` and `tours/*.json` exists in `en.json`; keys unused for one release are reported;
5. valid UTF-8 JSON, NFC, no empty values, no leading or trailing space unless English has it;
6. length ratio above 150% of English on `atelier.*` keys: warning.

It also builds the `en-XA` pseudo file for the screenshot test. The same script runs inside Weblate's pre-commit hook [memory], so a bad translation is stopped at the source.

## 6. Workflow, with no budget, and CI checks

- **Source of truth in the repository**: `i18n/en.json` (CLI), `app/atelier/i18n/en.json`, `site/src/i18n/en.json`, `docs/i18n/<lang>/`. English is written by the developers; nobody edits other languages in the repo by hand except through the tool.
- **Weblate hosted, free libre plan** [web: verify the current terms]: one component per catalog file, translators work in the browser, Weblate pushes to a branch and opens a PR (a PR on `develop`; the owner's merge step stays the owner's). If the plan is refused: Crowdin's open source plan [memory], or plain PRs against the JSON files (a translator can edit JSON; the CI check below is the safety net). The tool is replaceable because the files are plain JSON.
- **LLM first drafts, human review**: a script (`tools/i18n-draft <lang>`) asks an LLM to translate missing keys with the glossary (zinc, sketch, plugin, project, target... decided once in `i18n/glossary.json`) and the context comment of each key, writes them as Weblate suggestions, or as commits marked with a `draft` list in `languages.json` until a person approves. A native speaker reviews the onboarding set first. Never auto-merge a language to "supported".
- **Context for translators**: every key has a `_comment`/description (where it shows, what `{name}` is). Weblate shows it. This is the single most useful thing for quality.
- **CI and T0 checks** (`tools/i18n-check`, a T0 test, fast, no network):
  1. same key set as `en.json` (missing key: warning for a beta language and error for a supported one; extra key: error);
  2. placeholder parity: the set of `{name}` and plural variables equals English's; no stray `{`;
  3. required plural categories per language (CLDR): `fr` one/many/other, `ru` one/few/many/other, `ja` other;
  4. error codes `Z\d{4}`, command names, flags and backticked code in an English value appear unchanged in the translation;
  5. every `tr("id")` / `t('id')` in `src/` and `app/atelier` exists in `en.json`; keys unused for a release are reported;
  6. length ratio over 150% of English for Atelier keys: warning;
  7. valid JSON, UTF-8, NFC, no trailing spaces, no control characters;
  8. docs: stale/missing check described in (c); the code blocks of a translated page equal the English ones (the fence content is compared).
- **Pseudo-language `en-XA`** generated from `en.json` (brackets and accents, +35%): run the Atelier screenshot test under it to find unextracted and clipped text; run `zinc doctor` and `zinc help` under it to find hard-coded strings.
- **Releases**: `CHANGELOG.md` gets one line when a language is added ("Zinc speaks French"); the changelog itself stays English.

## 7. Plan, step by step, with rough sizes

(S = a session, M = 2-3 sessions, L = a week of sessions; the backlog is frozen: these are lines for `backlog/later.md` or a task created on the owner's request.)

1. **Decision record D-next** with this scoring: ids + flat JSON + CLDR plural suffixes; English embedded, languages as files; codes always in English; tests pinned to English. (S)
2. **`src/i18n` module and `tr()`**: loader (yyjson), language resolution (the order of section 3, reusing `systemLocale()`, adding `LANGUAGE`, `ZINC_LANG`, `--lang`, `~/.zinc/config.json`, and Windows detection written but proven later), CLDR plural function, fallback chain, T0 test; `zinc config get|set lang`. (M)
3. **Extract the onboarding CLI**: `help` (summary of 44, detail of 9 commands), `doctor`, `new`, error lines (`unknown command`, `usage`), `hint()`; keep one `en.json`; `ZINC_LANG=en` in `tests/run`; pseudo-locale. (M)
4. **Diagnostics tier 1 and 2**: registry strings to catalogs (42 x 3), `format/explain/markdown/hint` lookups, the 20-30 most frequent details to placeholders; `zinc explain --markdown --lang`; golden `.expect` files unchanged (English). (M)
5. **The five languages**: translate steps 3 and 4 into fr, es, it, de (LLM draft with glossary, then review: fr by the owner, the others by a reader each, or flagged `draft`); `i18n/*.json` in the engine package and the release packaging. First user-visible result: `zinc doctor` and `zinc new` in five languages. Changelog line. (M)
6. **`tools/i18n-check` and `tools/i18n-draft`** and the Weblate component (the repository connection is an outward step: leave the exact commands and settings in the task notes for the owner). (M)
7. **`zinc:i18n` and Atelier**: module (catalog, `t`, `plural`, `formatNumber`, `formatDate`), extract the Atelier's menu, palette, status messages and examples; settings entry; French catalog; an Atelier screenshot test under `en-XA`. Migrate `museum-table/editor` and `pinball3d-editor` onto it afterwards (they keep their int keys until then). (L)
8. **Docs and site**: Astro i18n routing, `docs/i18n/fr/` with guide 01-03 and the site pages, the stale-check script, the locale-aware `rehypeDocLinks`, language switcher, translated template READMEs and `zinc new` choosing by language. (L)
9. **Tours**: `tours/<id>.json`, `zinc tour`, the Atelier first-launch tour (5.4). (M) Later languages (pt-BR, then the font strategy for CJK and zh-Hans, ja): one S of engineering each, the human review is the cost.
10. **Small `Intl` subset** (PluralRules, NumberFormat, DateTimeFormat) from CLDR data, wired to `toLocale*String` and `localeCompare(locale)`; document i18next/Lingui compatibility. (L, after steps 1-8 and only when an app author asks)

Cross-platform note: Windows locale detection, CJK/Arabic fonts on the handhelds and ESP32 (no `i18n/` folder on the board: the board gets no CLI, and device displays are the app's business) go under "Cross-platform pass" in `backlog/later.md`.

## 8. What would make us revisit

- A hosted platform drops the libre plan or the JSON format: files are plain JSON, change the tool.
- Translators or maintainers need real grammar (gender, case, nested selects): then score Fluent or MessageFormat 2 again; `{name}` plus plural suffixes will not do it.
- Usage data shows a language we did not list leads: reorder section 5.
- Diagnostic details turn out to matter for beginners more than titles do: extend tier 2 by frequency taken from the telemetry-free error logs users paste in issues.
- The rustc team publishes a working translation design; compare before extending tier 3.

## Sources

- [web] https://rustc-dev-guide.rust-lang.org/diagnostics/translation.html (the Fluent translation infrastructure awaits a redesign; contributors not required to use it; English Fluent bundle is the fallback; tracking issue rust-lang/rust#132181).
- [web] https://starlight.astro.build/guides/i18n (routing, fallback content, translation notice key `i18n.untranslatedContent`, RTL).
- [web] Weblate pricing/hosting listings (free hosted tier for libre projects, plans by source-string count): https://weblate.org and https://apis.io/plans/weblate/weblate-plans-pricing/ (secondary, verify).
- [memory] items (TypeScript `--locale`, git/GCC gettext, Godot and Arduino on Weblate/Transifex, Flutter ARB, Fluent implementations, ICU4X MessageFormat 2 status, LSP `locale`, Astro native i18n API, i18next v4 JSON support in Weblate) were not re-fetched: confirm before writing the decision record.
