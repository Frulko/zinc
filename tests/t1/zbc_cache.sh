#!/bin/sh
# The cached program of an interpreted run (ZN-415): a second `zinc run --interp` of an unchanged program starts from the ZBC compiled the first time, and a
# changed source, another profile, another engine binary or an engine module of lib/std makes it compile again.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
unset ZINC_DETERMINISTIC   # test runs are never cached: this one plays a user's run
export ZINC_HOME="$tmp/home" ZINC_RUN=interp
mkdir -p "$tmp/app" && printf 'console.log("one");\n' > "$tmp/app/main.ts"
run() { "$1" -v run "$tmp/app/main.ts" $2 >"$tmp/out" 2>"$tmp/log"; }
cached() { grep -q "cached program, no compile" "$tmp/log"; }
expect() {   # what: whether this run came from the cache, and what it printed
  if [ "$2" = hit ]; then cached || { echo "$1: compiled although nothing changed"; fail=1; }; else cached && { echo "$1: started from the cache"; fail=1; }; fi
  [ "$(cat "$tmp/out")" = "$3" ] || { echo "$1: printed '$(cat "$tmp/out")', expected '$3'"; fail=1; }
}
run "$ZINC"; expect "first run" miss one
run "$ZINC"; expect "second run" hit one
printf 'console.log("two!");\n' > "$tmp/app/main.ts"
run "$ZINC"; expect "after a source change" miss two!
run "$ZINC"; expect "then" hit two!
run "$ZINC" "--profile esp32"; expect "another profile" miss two!
run "$ZINC"; expect "the host profile again" hit two!
ZN_NO_OPT=1 run "$ZINC"; expect "another compiler option" miss two!
cp "$ZINC" "$tmp/zinc-other"
run "$tmp/zinc-other"; expect "another engine binary" miss two!
mkdir -p "$tmp/app/lib" && printf 'export const word = "three";\n' > "$tmp/app/lib/word.ts" && printf 'import { word } from "./lib/word";\nconsole.log(word);\n' > "$tmp/app/main.ts"
run "$ZINC"; expect "an imported file" miss three
printf 'export const word = "four!";\n' > "$tmp/app/lib/word.ts"
run "$ZINC"; expect "after the imported file changed" miss four!
run "$ZINC"; expect "unchanged again" hit four!
std=lib/std/assert.ts   # an engine module read at every compile: its time changes, its bytes do not, and its time is put back after
touch -r "$std" "$tmp/stamp" && touch "$std"
run "$ZINC"; expect "after a lib/std module changed" miss four!
touch -r "$tmp/stamp" "$std"
ZINC_NO_CACHE=1 run "$ZINC"; expect "ZINC_NO_CACHE" miss four!
[ $fail -eq 0 ] && echo "zbc cache: ok"
exit $fail
