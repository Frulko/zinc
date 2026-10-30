#!/bin/sh
# The graded examples (ZN-774.33): learn/catalog.txt is the one list. Every line is well formed and names a folder that exists, every lesson
# sample of docs/learn/samples is in it (so the lessons and Atelier cannot drift apart); zinc examples lists it by style and stars,
# zinc run example:<name> runs one, zinc new --from example:<name> copies one, and a misspelt name gets the closest.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1

grep -v '^#' learn/catalog.txt | awk -F'|' '
  NF != 7 { print "learn/catalog.txt: not 7 fields: " $0; bad = 1 }
  $2 !~ /^[1-4]$/ { print "learn/catalog.txt: " $1 ": stars are 1 to 4, not " $2; bad = 1 }
  $3 !~ /^(drawing|scene|canvas|interface)$/ { print "learn/catalog.txt: " $1 ": no module " $3; bad = 1 }
  seen[$1]++ { print "learn/catalog.txt: " $1 " is listed twice"; bad = 1 }
  END { exit bad }' || fail=1
grep -v '^#' learn/catalog.txt | cut -d'|' -f4 | while read -r p; do [ -d "$p" ] || echo "learn/catalog.txt: no folder $p"; done > "$tmp/missing"
for d in docs/learn/samples/*/; do grep -q "|${d%/}|" learn/catalog.txt || echo "learn/catalog.txt: the lesson sample ${d%/} is not listed"; done >> "$tmp/missing"
[ -s "$tmp/missing" ] && { cat "$tmp/missing"; fail=1; }

# the list: four styles, the stars, the way to run and copy
"$Z" examples > "$tmp/list" || fail=1
for want in '^drawing$' '^scene$' '^canvas$' '^interface$' '^  ★☆☆☆ hello  ' '^  ★★★★ breakout  ' 'zinc run example:<name>'; do
  grep -q "$want" "$tmp/list" || { echo "zinc examples: no line '$want'"; fail=1; }
done
[ "$(grep -c '^  [★☆]' "$tmp/list")" = "$(grep -vc '^#' learn/catalog.txt)" ] || { echo "zinc examples does not list every entry once"; fail=1; }
"$Z" examples scene | grep -q '^scene$' && ! "$Z" examples scene | grep -q '^drawing$' || { echo "zinc examples scene lists more than the scene style"; fail=1; }

# run one by name, from anywhere
out=$(cd "$tmp" && ZINC_FRAMES=2 "$Z" run example:breakout 2>&1) && [ "$out" = "breakout ready: 40 bricks" ] || { echo "zinc run example:breakout: $out"; fail=1; }
# copy one to change
(cd "$tmp" && "$Z" new --from example:breakout >/dev/null && "$Z" new mine --from example:01-window-and-shape >/dev/null) || fail=1
[ -f "$tmp/breakout/src/main.ts" ] && [ -f "$tmp/breakout/assets/kenney/ballGrey.png" ] && [ -f "$tmp/mine/zinc.json" ] && [ ! -e "$tmp/mine/build" ] \
  || { echo "zinc new --from example: did not copy: $(ls "$tmp" "$tmp/breakout")"; fail=1; }
(cd "$tmp/mine" && ZINC_FRAMES=2 "$Z" run >/dev/null 2>"$tmp/err") && [ ! -s "$tmp/err" ] || { echo "the copied lesson does not run: $(head -3 "$tmp/err")"; fail=1; }
# a misspelt name: the closest, exit 2, nothing run or written
out=$(cd "$tmp" && "$Z" run example:brekout 2>&1); rc=$?
[ $rc -eq 2 ] && [ "$out" = "zinc: no example named 'brekout': did you mean 'example:breakout'? (zinc examples lists them)" ] || { echo "zinc run example:brekout: exit $rc, $out"; fail=1; }
(cd "$tmp" && "$Z" new --from example:helo >/dev/null 2>"$tmp/err"); rc=$?
[ $rc -eq 2 ] && grep -q "did you mean 'example:hello'" "$tmp/err" && [ ! -e "$tmp/helo" ] || { echo "zinc new --from example:helo: exit $rc, $(cat "$tmp/err")"; fail=1; }

[ $fail -eq 0 ] && echo "examples catalog: ok"
exit $fail
