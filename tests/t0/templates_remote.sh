#!/bin/sh
# Templates from a directory or a git repository (ZN-316), no network: a local path and a file:// repository make projects, the git commit is recorded
# in zinc.json ("template"), a template.json with an unknown key or a template with a link to a file outside it is refused, and nothing of a hostile
# template runs (a post-checkout hook and a smudge filter in its repository, a setup script, an npm postinstall).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mark="$tmp/PWNED"
cp -R ../templates/cli "$tmp/tpl"
"$Z" new "$tmp/tpl" "$tmp/p1" >/dev/null || { echo "a local template directory fails"; fail=1; }
grep -q '"template": { "source": "'"$tmp"'/tpl" }' "$tmp/p1/zinc.json" 2>/dev/null || grep -q '"source": ".*/tpl"' "$tmp/p1/zinc.json" || { echo "the local source is not recorded"; fail=1; }
(cd "$tmp/p1" && "$Z" check >/dev/null 2>&1) || { echo "the project from a directory does not check"; fail=1; }
# a git repository with a hostile side: a hook and a smudge filter configured in the repository, scripts that a package manager would run
mkdir "$tmp/repo" && cp -R ../templates/cli/. "$tmp/repo/"
printf '#!/bin/sh\ntouch "%s"\n' "$mark" > "$tmp/repo/setup.sh"; chmod +x "$tmp/repo/setup.sh"
printf '{ "scripts": { "postinstall": "sh setup.sh" } }\n' > "$tmp/repo/package.json"
printf '*.ts filter=evil\n' > "$tmp/repo/.gitattributes"
(cd "$tmp/repo" && git init -q && git config filter.evil.smudge "sh -c 'touch $mark; cat'" && git config filter.evil.clean cat && git add -A && \
  git -c user.name=t -c user.email=t@t commit -qm template && printf '#!/bin/sh\ntouch "%s"\n' "$mark" > .git/hooks/post-checkout && chmod +x .git/hooks/post-checkout) || exit 2
commit=$(git -C "$tmp/repo" rev-parse HEAD)
"$Z" new "file://$tmp/repo" "$tmp/p2" >/dev/null || { echo "a file:// template fails"; fail=1; }
grep -q "\"commit\": \"$commit\"" "$tmp/p2/zinc.json" || { echo "the commit is not recorded: $(head -3 "$tmp/p2/zinc.json")"; fail=1; }
(cd "$tmp/p2" && "$Z" check >/dev/null 2>&1) || { echo "the project from git does not check"; fail=1; }
"$Z" new "$tmp/repo" "$tmp/p3" >/dev/null || { echo "a template directory that is a git work tree fails"; fail=1; }
[ -d "$tmp/p3/.git" ] && { echo "the template's .git was copied"; fail=1; }
[ -e "$mark" ] && { echo "a script of the template ran"; fail=1; }
# refused: an unknown key in template.json, a link to a file outside the template
cp -R ../templates/cli "$tmp/bad1" && sed -i.bak 's/"name": "cli"/"name": "cli", "postCreate": "sh setup.sh"/' "$tmp/bad1/template.json" && rm "$tmp/bad1/template.json.bak"
"$Z" new "$tmp/bad1" "$tmp/p4" >/dev/null 2>"$tmp/err"; [ $? -ne 0 ] && grep -q 'unknown key "postCreate"' "$tmp/err" && [ ! -e "$tmp/p4" ] || { echo "an unknown template.json key is accepted: $(cat "$tmp/err")"; fail=1; }
cp -R ../templates/cli "$tmp/bad2" && ln -s /etc/hosts "$tmp/bad2/hosts.txt"
"$Z" new "$tmp/bad2" "$tmp/p5" >/dev/null 2>"$tmp/err"; [ $? -ne 0 ] && grep -q 'outside the template' "$tmp/err" && [ ! -e "$tmp/p5" ] || { echo "a link out of the template is accepted: $(cat "$tmp/err")"; fail=1; }
"$Z" new "file://$tmp/missing" "$tmp/p6" >/dev/null 2>&1 && { echo "a missing repository is accepted"; fail=1; }
[ $fail -eq 0 ] && echo "templates remote: ok"
exit $fail
