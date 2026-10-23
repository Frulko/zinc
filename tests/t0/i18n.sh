#!/bin/sh
# The languages of the tooling (D159, src/i18n): tools/i18n-check passes on i18n/ and catches a broken translation; the release archive
# carries i18n/; i18n_test (plurals, the order of the language sources, the English fallback); the first messages of zinc in the five
# languages (--lang, ZINC_LANG, the settings file, LANG), English when a catalog is missing, and zinc config set lang keeping the other keys.
cd "$(dirname "$0")/../.." || exit 2
fail=0
unset LANGUAGE LC_ALL LC_MESSAGES
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

tools/i18n-check >"$tmp/check" 2>&1 || { echo "i18n-check fails on i18n/: $(grep -v '^warning' "$tmp/check" | head -5)"; fail=1; }
# a broken copy: a missing message, a renamed placeholder, a changed command, a plural without _one, an extra key
mkdir -p "$tmp/repo/tools" && cp -R i18n "$tmp/repo/i18n" && cp tools/i18n-check "$tmp/repo/tools/"
python3 - "$tmp/repo/i18n" <<'EOF'
import json, sys
d = sys.argv[1]
def edit(lang, f):
    p = f"{d}/{lang}/cli.json"; c = json.load(open(p)); f(c); json.dump(c, open(p, "w"), ensure_ascii=False)
edit("en", lambda c: c.update({"cli.check.files_one": "{count} file", "cli.check.files_other": "{count} files"}))
edit("fr", lambda c: (c.pop("cli.usage"), c.update({"cli.usage.more": "(zinc aide {cmd} en dit plus)", "cli.check.files_other": "{count} fichiers", "cli.extra": "x"})))
for l in ("es", "it", "de"): edit(l, lambda c: c.update({"cli.check.files_one": "{count} x", "cli.check.files_other": "{count} xs"}))
EOF
python3 "$tmp/repo/tools/i18n-check" "$tmp/repo" >"$tmp/broken" 2>&1; rc=$?
[ $rc -eq 1 ] || { echo "i18n-check passes a broken catalog (exit $rc)"; fail=1; }
for want in "fr/cli.json: cli.usage: missing" "fr/cli.json: cli.usage.more: placeholders \['cmd'\]" "cli.usage.more: 'zinc help' of the English text" \
            "fr/cli.json: cli.check.files_one: missing" "fr/cli.json: cli.extra: not in English"; do
  grep -q "$want" "$tmp/broken" || { echo "i18n-check does not report: $want"; fail=1; }
done
grep -q '"i18n"' tools/package || { echo "tools/package does not put i18n/ in the release archive (install.sh and Homebrew unpack it)"; fail=1; }

BUILD=$(dirname "$ZINC")
if [ -x "$BUILD/i18n_test" ]; then "$BUILD/i18n_test" >/dev/null || { "$BUILD/i18n_test" 2>&1 | head -5; fail=1; }
else echo "i18n_test is not built (tools/build i18n_test)"; fail=1; fi

# the first messages, in the five languages
export ZINC_HOME="$tmp/home"
for l in "en:unknown command" "fr:commande inconnue" "es:comando desconocido" "it:comando sconosciuto" "de:unbekannter Befehl"; do
  lang=${l%%:*} want=${l#*:}
  out=$(ZINC_LANG=$lang "$ZINC" rnu 2>&1); case "$out" in *"$want 'rnu'"*"'zinc run'"*) ;; *) echo "$lang: zinc rnu says: $out"; fail=1 ;; esac
  out=$(ZINC_LANG=$lang "$ZINC" new nope "$tmp/x.$lang" 2>&1 | head -1); case "$out" in *nope*) ;; *) echo "$lang: zinc new nope says: $out"; fail=1 ;; esac
done
out=$(ZINC_LANG=en "$ZINC" --lang de rnu 2>&1); case "$out" in *"unbekannter Befehl"*) ;; *) echo "--lang does not win over ZINC_LANG: $out"; fail=1 ;; esac
out=$("$ZINC" --lang=es rnu 2>&1); case "$out" in *"comando desconocido"*) ;; *) echo "--lang=es: $out"; fail=1 ;; esac
"$ZINC" --lang pt rnu >/dev/null 2>&1; [ $? -eq 2 ] || { echo "--lang pt is not refused"; fail=1; }
out=$(env -u ZINC_LANG LANG=fr_CA.UTF-8 "$ZINC" rnu 2>&1); case "$out" in *"commande inconnue"*) ;; *) echo "LANG=fr_CA is not French: $out"; fail=1 ;; esac
out=$(env -u ZINC_LANG LC_ALL=C LANG=fr_CA.UTF-8 "$ZINC" rnu 2>&1); case "$out" in *"unknown command"*) ;; *) echo "LC_ALL=C does not win over LANG: $out"; fail=1 ;; esac
out=$(env -u ZINC_LANG LC_MESSAGES=de_DE.UTF-8 LANG=fr_CA.UTF-8 "$ZINC" rnu 2>&1); case "$out" in *"unbekannter Befehl"*) ;; *) echo "LC_MESSAGES does not win over LANG: $out"; fail=1 ;; esac
out=$(ZINC_LANG=fr ZINC_I18N_DIR="$tmp/none" "$ZINC" rnu 2>&1); case "$out" in "zinc: unknown command 'rnu'"*) ;; *) echo "no French catalog: not English: $out"; fail=1 ;; esac
out=$(ZINC_LANG=it "$ZINC" new cli "$tmp/app" 2>&1); case "$out" in *"creato (cli)"*) ;; *) echo "it: zinc new says: $out"; fail=1 ;; esac

# zinc config: the language saved for the next commands, the keys of others kept
mkdir -p "$ZINC_HOME" && printf '{"atelier.theme": "dark"}\n' > "$ZINC_HOME/config.json"
out=$(env -u ZINC_LANG LANG=C "$ZINC" config set lang fr-FR 2>&1); [ "$out" = "Désormais, Zinc vous parle en français." ] || { echo "zinc config set lang fr: $out"; fail=1; }
[ "$("$ZINC" config get lang)" = fr ] && grep -q '"atelier.theme": "dark"' "$ZINC_HOME/config.json" || { echo "config.json lost a key or the language: $(cat "$ZINC_HOME/config.json")"; fail=1; }
out=$(env -u ZINC_LANG LANG=de_DE.UTF-8 "$ZINC" rnu 2>&1); case "$out" in *"commande inconnue"*) ;; *) echo "the saved language does not win over LANG: $out"; fail=1 ;; esac
"$ZINC" config set lang pt >/dev/null 2>&1; [ $? -eq 2 ] || { echo "zinc config set lang pt is not refused"; fail=1; }
"$ZINC" config unset lang && ! "$ZINC" config get lang >/dev/null && grep -q atelier.theme "$ZINC_HOME/config.json" || { echo "zinc config unset lang"; fail=1; }
[ $fail -eq 0 ] && echo "i18n: ok"
exit $fail
