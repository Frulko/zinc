#!/bin/sh
# Emoji in text (ZN-868). Without the shaping tier (zinc.json "text": "shaped", D32) an emoji is drawn as '?' and the run says once what to
# add, instead of a silent '?'. With ZINC_TEXT=shaped the emoji are drawn in colour, and the compiled run (ZINC_RUN=native: zinc run's
# cached executable) links the tier as the interpreter has it, and QuickJS installs it (from ZINC_TEXT or zinc.json): both drew '?'. The
# same frame on the interpreter, QuickJS and the compiled run, both ways.
cd "$(dirname "$0")/../.." || exit 2
[ -n "$CXX" ] || command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_SIZE=240x40 ZINC_SCALE=1 ZINC_FRAMEHASH=last
prog=tests/data/emoji_text/main.ts
fail=0
run() {   # run <name> <text tier> <engine flags...>: the frame hash, and the hint lines in $tmp/<name>
  name=$1 tier=$2; shift 2
  env ZINC_TEXT="$tier" "$@" > "$tmp/$name" 2>&1
  sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' "$tmp/$name" | tail -1
}
for tier in simple shaped; do
  i=$(run "i-$tier" $tier "$ZINC" run --interp $prog)
  q=$(run "q-$tier" $tier "$ZINC" run $prog --engine quickjs)
  n=$(run "n-$tier" $tier ZINC_RUN=native "$ZINC" run $prog)
  [ -n "$i" ] || { echo "emoji_text $tier: no frame"; cat "$tmp/i-$tier"; exit 1; }
  [ "$i" = "$q" ] || { echo "emoji_text $tier: QuickJS draws $q, the interpreter $i"; fail=1; }
  [ "$i" = "$n" ] || { echo "emoji_text $tier: the compiled run draws $n, the interpreter $i"; tail -3 "$tmp/n-$tier"; fail=1; }
  eval "hash_$tier=\$i"
  for e in i q n; do
    hints=$(grep -c "zinc: text has U+1F600 (emoji or a complex script), drawn as '?': add \"text\": \"shaped\" to zinc.json" "$tmp/$e-$tier")
    want=1; [ $tier = shaped ] && want=0
    [ "$hints" = $want ] || { echo "emoji_text $tier/$e: $hints hint lines, want $want"; cat "$tmp/$e-$tier"; fail=1; }
  done
done
# zinc.json "text": "shaped" on QuickJS (a project on the JavaScript engine never installed the tier)
mkdir "$tmp/p" && cp $prog "$tmp/p/main.ts" && printf '{ "name": "emoji", "entry": "main.ts", "text": "shaped" }\n' > "$tmp/p/zinc.json"
p=$(run p-shaped simple "$ZINC" run "$tmp/p" --engine quickjs)
[ "$p" = "$hash_shaped" ] || { echo "emoji_text: a shaped project on QuickJS draws $p, want $hash_shaped"; fail=1; }
[ "$hash_simple" != "$hash_shaped" ] || { echo "emoji_text: the shaped frame is the '?' frame"; fail=1; }
exit $fail
