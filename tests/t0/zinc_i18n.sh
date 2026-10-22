#!/bin/sh
# zinc:i18n (ZN-774.06, D159): the language (ZINC_LANG, then `lang` of $ZINC_HOME/config.json, then the system's), the tags, the CLDR plural
# categories of en, de, fr, es and it, placeholders, the fallbacks (fr-CA to fr, a missing key or file to English, a key English lacks to
# itself) and the saved language that keeps the other keys of config.json. ZINC_I18N_BLESS=1 rewrites main.expected.
cd "$(dirname "$0")/../golden/zinc-i18n" || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
printf '{"lang":"it_IT.UTF-8"}' > "$tmp/config.json"
env -u ZINC_LANG ZINC_HOME="$tmp" ZINC_I18N_DIR="$PWD/i18n" "$ZINC" run --interp main.ts > "$tmp/out" 2> "$tmp/err" || { echo "zinc_i18n: main.ts failed: $(tail -3 "$tmp/err")"; exit 1; }
[ -n "$ZINC_I18N_BLESS" ] && cp "$tmp/out" main.expected
diff main.expected "$tmp/out" > "$tmp/d" || { echo "zinc_i18n: main.ts printed:"; head -20 "$tmp/d"; fail=1; }
# ZINC_LANG before the saved language; the system's when neither says one
first=$(ZINC_LANG=de_DE.UTF-8 ZINC_HOME="$tmp" ZINC_I18N_DIR="$PWD/i18n" "$ZINC" run --interp main.ts 2>/dev/null | head -1)
[ "$first" = "language de-DE" ] || { echo "zinc_i18n: ZINC_LANG=de_DE.UTF-8 gave '$first'"; fail=1; }
rm -f "$tmp/config.json"; mkdir -p "$tmp/none"
first=$(env -u ZINC_LANG -u LC_ALL -u LC_MESSAGES LANG=es_ES.UTF-8 ZINC_HOME="$tmp/none" ZINC_I18N_DIR="$PWD/i18n" "$ZINC" run --interp main.ts 2>/dev/null | head -1)
[ "$first" = "language es-ES" ] || { echo "zinc_i18n: LANG=es_ES.UTF-8 with no setting gave '$first'"; fail=1; }
exit $fail
