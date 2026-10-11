#!/bin/sh
# First five minutes (ZN-711), the path of docs/guide/01-getting-started.md:
# - every template of templates/ makes a project in an empty directory that `zinc run` runs headless for a few frames (exit 0, nothing on
#   stderr; the two servers listen until the timeout stops them);
# - a first change (the text of the game template) changes the frame on screen;
# - six beginner mistakes each print the file, the line and what to do next: tests/golden/first-run/<mistake>.txt, the project directory
#   written <project> (FIRST_RUN_UPDATE=1 rewrites them);
# - a bare `zinc`, `zinc --help` and a misspelt command lead to the list of commands.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold="$PWD/tests/golden/first-run"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tmp=$(cd "$tmp" && pwd -P)
fail=0
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
for d in ../templates/*/; do
  t=$(basename "$d")
  p="$tmp/$t"
  "$Z" new "$t" "$p" >/dev/null || { echo "zinc new $t failed"; fail=1; continue; }
  (cd "$p" && ZINC_STORAGE="$tmp/storage.$t" ZINC_FRAMES=3 timeout 5 "$Z" run >"$tmp/out.$t" 2>"$tmp/err.$t")
  rc=$?
  case "$t" in
    server|service) [ $rc -eq 124 ] && grep -q 'listening on http' "$tmp/out.$t" || { echo "$t: zinc run exits $rc without listening: $(head -3 "$tmp/err.$t")"; fail=1; } ;;
    *) [ $rc -eq 0 ] || { echo "$t: zinc run exits $rc: $(head -3 "$tmp/err.$t")"; fail=1; } ;;
  esac
  [ -s "$tmp/err.$t" ] && { echo "$t: zinc run writes on stderr: $(head -3 "$tmp/err.$t")"; fail=1; }
done

# a first change: another text in src/main.ts, another frame
g="$tmp/game"
cp "$g/src/main.ts" "$tmp/main.ts"
frame() { (cd "$g" && ZINC_FRAMES=2 ZINC_FRAMEHASH=last "$Z" run 2>&1 | grep framehash | awk '{print $5}'); }
before=$(frame)
sed 's/arrows to move/hello from me/' "$tmp/main.ts" > "$g/src/main.ts"
grep -q 'hello from me' "$g/src/main.ts" || { echo "the game template has no 'arrows to move' text to change (the guide changes it)"; fail=1; }
after=$(frame)
[ -n "$before" ] && [ -n "$after" ] && [ "$before" != "$after" ] || { echo "a changed text does not change the frame: $before, $after"; fail=1; }

# the six mistakes: mistake <name> <project> <zinc arguments...>, after the files were edited
mistake() {
  name=$1; proj=$2; shift 2
  (cd "$proj" && ZINC_FRAMES=2 "$Z" "$@" 2>&1 >/dev/null | sed "s|$proj|<project>|g") > "$tmp/$name.txt"
  [ -n "$FIRST_RUN_UPDATE" ] && { mkdir -p "$gold"; cp "$tmp/$name.txt" "$gold/$name.txt"; }
  cmp -s "$tmp/$name.txt" "$gold/$name.txt" || { echo "mistake $name: $(diff "$gold/$name.txt" "$tmp/$name.txt" 2>&1 | head -6)"; fail=1; }
  # every golden names a file and a line, and says what to do
  grep -Eq '^(<project>/)?src/[a-z.]+:[0-9]+:[0-9]+: error Z[0-9]+: ' "$tmp/$name.txt" || { echo "mistake $name: no file:line:col: error line"; fail=1; }
  grep -Eq '^zinc: [0-9]+ errors?[.,].*zinc explain Z' "$tmp/$name.txt" || { echo "mistake $name: no closing line with the fix and zinc explain"; fail=1; }
}
# 1. a misspelt import: a name of a module, then the path of a file of the project
sed 's/isDown, Btn/isDwon, Btn/' "$tmp/main.ts" > "$g/src/main.ts"
mistake import-name "$g" run
echo 'export const speed = 120;' > "$g/src/config.ts"
{ echo "import { speed } from './confg';"; cat "$tmp/main.ts"; } > "$g/src/main.ts"
mistake import-path "$g" run
# 2. a type error
{ cat "$tmp/main.ts"; echo 'let score: number = "ten";'; } > "$g/src/main.ts"
mistake type-error "$g" run
# 3. a zinc: module that does not exist
{ echo "import { get } from 'zinc:stoarge';"; cat "$tmp/main.ts"; } > "$g/src/main.ts"
mistake unknown-module "$g" run
# 4. a plugin that is not installed
{ echo "import { burst } from 'zinc:confetti';"; cat "$tmp/main.ts"; } > "$g/src/main.ts"
mistake plugin-missing "$g" run
# 5. a JSX tag left open (the title of the remarkable template loses its </text>)
r="$tmp/remarkable"
cp "$r/src/main.tsx" "$tmp/main.tsx"
sed 's|My app</text>|My app|' "$tmp/main.tsx" > "$r/src/main.tsx"
cmp -s "$tmp/main.tsx" "$r/src/main.tsx" && { echo "the remarkable template has no 'My app</text>' to break"; fail=1; }
mistake jsx-open "$r" run
# 6. a file that is not there
cp "$tmp/main.ts" "$g/src/main.ts"
mistake missing-file "$g" run src/mian.ts

# lost at the first command: the list of commands, the closest command
"$Z" 2>/dev/null | grep -q '^  new  *create a project from a template' || { echo "a bare zinc does not list the commands"; fail=1; }
"$Z" --help | grep -q '^  run  *run a program or project' || { echo "zinc --help does not list the commands"; fail=1; }
[ "$("$Z" rnu 2>&1)" = "zinc: unknown command 'rnu': did you mean 'zinc run'? (zinc help lists the commands)" ] || { echo "zinc rnu: $("$Z" rnu 2>&1)"; fail=1; }
[ $fail -eq 0 ] && echo "first run: ok"
exit $fail
