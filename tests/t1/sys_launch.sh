#!/bin/sh
# zinc:sys launchDir and locale (ZN-687). Run from another directory, `zinc run <project>` starts the program in the project (cwd) and
# launchDir is where the user was, interpreted and compiled; a built program started elsewhere gives that directory. locale(): LC_ALL,
# LC_MESSAGES then LANG as a BCP 47 tag, and without them the system's first preferred language (macOS: AppleLanguages, what an app started
# from the Finder gets). execPath: the built program's own file, zinc when interpreted.
cd "$(dirname "$0")/../.." || exit 2
root=$PWD
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/where" "$tmp/else"
where=$(cd "$tmp/where" && pwd -P)
fail=0
want() { echo "$2" | grep -qx "$3" || { echo "$1: no line '$3' in: $(echo "$2" | tr '\n' '|')"; fail=1; }; }
for r in interp native; do
  out=$(cd "$tmp/where" && env -u ZINC_LAUNCH_DIR ZINC_RUN=$r "$ZINC" run "$root/tests/data/sys_launch" 2>&1)
  want "$r" "$out" "launch $where"
  want "$r" "$out" "cwd $root/tests/data/sys_launch"
done
"$ZINC" build "$root/tests/data/sys_launch/main.ts" -o "$tmp/app" >/dev/null 2>&1 || { echo "build failed"; exit 1; }
out=$(cd "$tmp/else" && env -u ZINC_LAUNCH_DIR "$tmp/app" 2>&1)
want built "$out" "launch $(cd "$tmp/else" && pwd -P)"
want built "$out" "exe $(cd "$tmp" && pwd -P)/app"
out=$(cd "$tmp/where" && ZINC_RUN=interp "$ZINC" run "$root/tests/data/sys_launch" 2>&1)
want interp "$out" "exe $(cd "$(dirname "$ZINC")" && pwd -P)/$(basename "$ZINC")"
out=$("$ZINC" run "$root/tests/data/sys_launch" --engine quickjs 2>&1)
want quickjs "$out" "exe $(cd "$(dirname "$ZINC")" && pwd -P)/$(basename "$ZINC")"
out=$(env -u LANG -u LC_MESSAGES LC_ALL=de_DE.UTF-8 "$tmp/app" 2>&1); want LC_ALL "$out" "locale de-DE"
out=$(env -u LC_ALL -u LC_MESSAGES LANG=pt_BR.UTF-8 "$tmp/app" 2>&1); want LANG "$out" "locale pt-BR"
if [ "$(uname)" = Darwin ]; then
  sys=$(defaults read -g AppleLanguages 2>/dev/null | sed -n '2s/[ ",]//gp')
  out=$(env -u LANG -u LC_ALL -u LC_MESSAGES "$tmp/app" 2>&1); [ -n "$sys" ] && want system "$out" "locale $sys"
fi
exit $fail
