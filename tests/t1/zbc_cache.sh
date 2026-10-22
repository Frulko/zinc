#!/bin/sh
# The cached program of an interpreted run (ZN-415, ZN-774.16): a second `zinc run --interp` of an unchanged program starts from the ZBC compiled the first time, and a
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
# A zinc:ui program (ZN-774.16): the second start, headless and under zinc dev, compiles neither it nor lib/std; an edit of a copy of lib/std/ui.ts
# (an engine root of its own, ZINC_ROOT) compiles it again
unset ZINC_NO_CACHE ZN_NO_OPT   # sh keeps the assignments made before a call of a function above
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
mkdir -p "$tmp/root" && cp -R lib "$tmp/root/lib"
for e in *; do [ "$e" = lib ] || ln -s "$PWD/$e" "$tmp/root/$e"; done
cp -R docs/learn/samples/12-a-small-app "$tmp/ui"
ui() { ZINC_ROOT="$tmp/root" ZINC_HEADLESS=1 ZINC_FRAMES=3 "$Z" -v run "$tmp/ui" >"$tmp/out" 2>"$tmp/log"; }
uiexpect() { if [ "$2" = hit ]; then cached || { echo "$1: compiled although nothing changed"; fail=1; }; else cached && { echo "$1: started from the cache"; fail=1; }; fi; }
ui; uiexpect "zinc:ui, first run" miss
ui; uiexpect "zinc:ui, second run" hit
printf '\n// edited\n' >> "$tmp/root/lib/std/ui.ts"
ui; uiexpect "zinc:ui, after lib/std/ui.ts changed" miss
ui; uiexpect "zinc:ui, then" hit
z=$(ls -t "$ZINC_HOME"/cache/zbc/*/program.zbc | head -1)   # the entry compiled last: damaged in place, its size and time kept
touch -r "$z" "$tmp/stamp" && dd if=/dev/zero of="$z" bs=1024 seek=1 count=8 conv=notrunc 2>/dev/null && touch -r "$tmp/stamp" "$z"
ui || { echo "zinc:ui, damaged entry: the run failed: $(tail -3 "$tmp/log")"; fail=1; }; uiexpect "zinc:ui, damaged entry" miss
dev() {   # one start of zinc dev's child, until the program ends (3 frames)
  (cd "$tmp/ui" && ZINC_ROOT="$tmp/root" ZINC_HEADLESS=1 ZINC_FRAMES=3 exec "$Z" -v dev --no-devtools) >"$tmp/log" 2>&1 &
  pid=$!; n=0
  while [ $n -lt 400 ] && ! grep -q "program exited" "$tmp/log"; do sleep 0.05; n=$((n+1)); done
  kill $pid 2>/dev/null; wait $pid 2>/dev/null
}
dev; uiexpect "zinc dev, first start" miss
dev; uiexpect "zinc dev, second start" hit
[ $fail -eq 0 ] && echo "zbc cache: ok"
exit $fail
