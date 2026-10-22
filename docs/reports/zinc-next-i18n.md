# src/i18n: the languages of the tooling

Decision D159, research `docs/reports/onboarding-i18n-research.md`, shared terms `i18n/glossary.md`.

- **Catalogs**: `i18n/<lang>/<area>.json` for en, fr, es, it, de; areas `cli` (the command line), `diag` (diagnostics), `atelier` (the app,
  read by its own Zinc code). Flat JSON, every key starting with its area; `{name}` placeholders, `{{` a literal brace; a message about a
  number has `_one` and `_other` (and `_many` in fr, es, it, for exact millions).
- **English is compiled in**: CMake reads `i18n/en/cli.json` and `diag.json` into `build/gen/i18n/en.inc` (a change reconfigures), so a
  missing file or key prints English. The other languages are read from `<engine>/i18n` on first use (`ZINC_I18N_DIR` for a translator).
  `tools/package` puts `i18n/` in the release archive, which `install.sh` and Homebrew unpack.
- **API** (`src/i18n/i18n.h`): `tr("cli.x", {{"name", v}})`, `trn("cli.x", count)`, `plural(lang, n)` (CLDR cardinals), `language()`.
- **The language**: `--lang` (sets `ZINC_LANG`, so the zincs it starts follow), `ZINC_LANG`, `lang` of `$ZINC_HOME/config.json`
  (`zinc config set lang fr`, the first-run welcome, Atelier), `LANGUAGE`, `LC_ALL` / `LC_MESSAGES` / `LANG` (C means English), the macOS
  preferred languages, English. Codes, commands, flags, JSON and logs stay English; `tests/run` pins `ZINC_LANG=en`.
- **Check**: `tools/i18n-check` (T0 `tests/t0/i18n.sh`): same messages, placeholders, codes, commands and flags in every language, plurals,
  NFC, and every `tr("...")` of `src/` and `t('atelier...')` of `app/atelier` present in English.
- Adding a language: a directory `i18n/<tag>/` with every area file, its plural rule in `plural()`, its tag in `kLanguages`.
- **Diagnostics** (ZN-774.04): the registry `include/zn/diagnostics.h` stays the English source; `i18n/en/diag.json` repeats its title, why
  and fix (`zinc explain --catalog` prints them, `tests/t0/diagnostics.sh` keeps the two the same) and the other languages translate them.
  The frequent details are keys `diag.detail.*`: a `Diag` keeps its English text (`detail`, what tools read) and its `key` and `args`, which
  `format()` prints in the person's language. The start of a line, `file:line:col: error Z0103: `, stays English in every language on
  purpose (Zinc Atelier and scripts parse it); `zinc lsp`, `zinc lint` and `zinc check --json` run in English. The other details stay English.
