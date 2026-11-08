#!/bin/sh
# First-run polish (ZN-774.24): a zinc doctor line that is not ready links to its fix for this system, and every anchor the doctor names
# is a heading of docs/guide/01-getting-started.md (the site's slugs); zinc changelog prints this version's section of CHANGELOG.md
# (a build from the sources: Unreleased) or the one named.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
anchors=$(sed -n 's/.*fix("\([a-z0-9-]*\)"\( + os\)\{0,1\}).*/\1\2/p' src/cli_core.cpp | sed 's/ + os$/macos a-newer-zinc-on-linux a-newer-zinc-on-windows/')
[ -n "$anchors" ] || { echo "doctor_links: no fix(...) anchors found in src/cli_core.cpp"; fail=1; }
slugs=$(sed -n 's/^#\{1,6\} //p' docs/guide/01-getting-started.md | python3 -c '
import re, sys
for h in sys.stdin: print(re.sub(r"[^a-z0-9 -]", "", h.strip().lower()).replace(" ", "-"))')
for a in $anchors; do echo "$slugs" | grep -qx "$a" || { echo "doctor_links: #$a is not a heading of docs/guide/01-getting-started.md"; fail=1; }; done
mkdir "$t/root"
ZINC_ROOT="$t/root" ZINC_NO_UPDATE_CHECK=1 "$ZINC" doctor >"$t/o" 2>&1
grep -q 'getting-started/#the-engines-files-are-missing' "$t/o" || { echo "doctor_links: the missing engine has no link: $(cat "$t/o")"; fail=1; }
"$ZINC" changelog 0.11.5 | head -1 | grep -q '^## \[0.11.5\]' || { echo "doctor_links: zinc changelog 0.11.5 does not print its section"; fail=1; }
"$ZINC" changelog 0.0.0 >/dev/null 2>&1 && { echo "doctor_links: an unknown version does not fail"; fail=1; }
[ $fail -eq 0 ] && echo "doctor_links: ok"
exit $fail
