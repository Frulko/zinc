#!/bin/sh
# zinc run chooses the engine and the window (ZN-719): a .js or .mjs file, a project whose entry is one, or zinc.json "engine": "quickjs" runs
# on QuickJS-ng without --engine quickjs; "engine": "zinc" keeps the typed engines; another value is refused. The window size of zinc.json
# is the one a QuickJS program sees, and the four examples/js-* open at theirs with a plain `zinc run` (the size of the first frame).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
is() { [ "$2" = "$3" ] || { echo "run_js_engine: $1: got '$2', expected '$3'"; fail=1; }; }
js="console.log(typeof globalThis.window, [1, 2].map(function (x) { return x * 2 }).join())"   # an untyped callback: the typed engines refuse it
echo "$js" > "$tmp/a.js"; echo "$js" > "$tmp/b.mjs"
is "a .js file" "$("$ZINC" run "$tmp/a.js" 2>&1)" "undefined 2,4"
is "a .mjs file" "$("$ZINC" run "$tmp/b.mjs" 2>&1)" "undefined 2,4"
printf "import { args } from 'zinc:sys';\nconsole.log(args().join());\n" > "$tmp/args.js"
is "the program's arguments" "$("$ZINC" run "$tmp/args.js" -- x y 2>&1)" "x,y"

mkdir -p "$tmp/p" "$tmp/q" "$tmp/t"
echo '{ "name": "p", "entry": "main.js", "web": true, "targets": { "sim": { "width": 500, "height": 300 } } }' > "$tmp/p/zinc.json"
echo "console.log(window.innerWidth, window.innerHeight)" > "$tmp/p/main.js"
is "a project with a .js entry, at its window size" "$(ZINC_HEADLESS=1 ZINC_FRAMES=2 "$ZINC" run "$tmp/p" 2>&1)" "500 300"
is "the same from inside the project" "$(cd "$tmp/p" && ZINC_HEADLESS=1 ZINC_FRAMES=2 "$ZINC" run 2>&1)" "500 300"
is "ZINC_SIZE wins" "$(ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_SIZE=200x100 "$ZINC" run "$tmp/p" 2>&1)" "200 100"

# a TypeScript entry: the typed engines by default (they say `number`), QuickJS when zinc.json names it
echo "const f = (x: any) => typeof x; console.log(f(1));" > "$tmp/q/main.ts"
echo '{ "name": "q", "entry": "main.ts", "engine": "quickjs" }' > "$tmp/q/zinc.json"
is "engine quickjs on a .ts entry" "$("$ZINC" run "$tmp/q" 2>&1)" "number"
"$ZINC" run "$tmp/q" -v 2>&1 | grep -q "engine QuickJS" || { echo "run_js_engine: zinc.json \"engine\": \"quickjs\" did not choose QuickJS"; fail=1; }
echo '{ "name": "t", "entry": "main.js", "engine": "zinc" }' > "$tmp/t/zinc.json"
echo "console.log([1, 2].length)" > "$tmp/t/main.js"
"$ZINC" run "$tmp/t" --interp -v 2>&1 | grep -q "engine interpreter" || { echo "run_js_engine: zinc.json \"engine\": \"zinc\" did not keep the typed engines"; fail=1; }
"$ZINC" run "$tmp/t" --engine quickjs -v 2>&1 | grep -q "engine QuickJS" || { echo "run_js_engine: --engine quickjs does not win over zinc.json"; fail=1; }
echo '{ "name": "t", "entry": "main.js", "engine": "v8" }' > "$tmp/t/zinc.json"
"$ZINC" run "$tmp/t" > "$tmp/out" 2>&1; rc=$?
[ $rc -eq 2 ] && grep -q '"engine" must be "quickjs" or "zinc"' "$tmp/out" || { echo "run_js_engine: an unknown engine in zinc.json is not refused ($rc): $(head -c 200 "$tmp/out")"; fail=1; }

for e in three:800x500 pixi:800x500 p5:800x500 phaser:320x240; do   # the examples, a plain run: the first frame has the size of their zinc.json
  n=${e%%:*}; want=${e##*:}
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=1 ZINC_SHOT="$tmp/$n.png" "$ZINC" run ../examples/js-$n > "$tmp/out" 2>&1
  got=$(file "$tmp/$n.png" 2>/dev/null | sed -n 's/.*PNG image data, \([0-9]*\) x \([0-9]*\),.*/\1x\2/p')
  is "examples/js-$n opens at its size" "$got" "$want"
done
exit $fail
