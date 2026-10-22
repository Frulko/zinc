#!/bin/sh
# The translated docs (D159, tools/i18n-docs-check): the real tree passes, and a scratch repo shows what the check catches:
# a translated code block, a changed link, a bad source (errors), a stale page (warning only), missing pages (info).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tools/i18n-docs-check >"$tmp/real" 2>&1 || { echo "i18n-docs-check fails on docs/i18n: $(grep '^error' "$tmp/real" | head -5)"; fail=1; }
R="$tmp/r"; mkdir -p "$R/docs/learn" "$R/docs/i18n/fr/learn"; git -C "$R" init -q
printf '# A\n\nText [x](b.md).\n\n```sh\nzinc run\n```\n' >"$R/docs/learn/01-a.md"
git -C "$R" add -A; git -C "$R" -c user.name=t -c user.email=t@t commit -qm one
printf '# A fr\n\nTexte [x](b.md).\n\n```sh\nzinc run\n```\n' >"$R/docs/i18n/fr/learn/01-a.md"
tools/i18n-docs-check --repo "$R" --stamp "$R/docs/i18n/fr/learn/01-a.md" >/dev/null
run() { python3 tools/i18n-docs-check --repo "$R" >"$tmp/out" 2>&1; echo $?; }
[ "$(run)" = 0 ] || { echo "a good translation fails: $(cat "$tmp/out")"; fail=1; }
grep -q '^info: fr: 5 of 6' "$tmp/out" || { echo "the missing pages are not reported: $(cat "$tmp/out")"; fail=1; }
printf '\nMore.\n' >>"$R/docs/learn/01-a.md"; git -C "$R" -c user.name=t -c user.email=t@t commit -qam two
[ "$(run)" = 0 ] && grep -q '^warning: .*stale' "$tmp/out" || { echo "stale is not a warning: $(cat "$tmp/out")"; fail=1; }
sed -i.bak 's/zinc run/zinc lancer/' "$R/docs/i18n/fr/learn/01-a.md"
[ "$(run)" = 1 ] && grep -q 'code blocks differ' "$tmp/out" || { echo "a translated code block passes"; fail=1; }
sed -i.bak 's/zinc lancer/zinc run/; s/b\.md/c.md/' "$R/docs/i18n/fr/learn/01-a.md"
[ "$(run)" = 1 ] && grep -q 'link and image targets differ' "$tmp/out" || { echo "a changed link passes"; fail=1; }
sed -i.bak 's/c\.md/b.md/; s/^source: .*/source: 0123456789abcdef0123456789abcdef01234567/' "$R/docs/i18n/fr/learn/01-a.md"
[ "$(run)" = 1 ] && grep -q 'not a commit' "$tmp/out" || { echo "a bad source passes"; fail=1; }
[ $fail -eq 0 ] && echo "i18n_docs: ok"
exit $fail
