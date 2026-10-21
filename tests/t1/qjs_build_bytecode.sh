#!/bin/sh
# QuickJS bytecode at zinc build and zinc export (ZN-773.09): zinc build of a project on "engine": "quickjs" writes build/<name>.js, its map and
# build/<name>.qbc; zinc run build/<name>.qbc runs the bytecode (a source edited since, with the .qbc touched newer, is not what runs), a trace from
# it names the user's file even after the build moved; a damaged .qbc and one older than its bundle fall back to the source with no error; the
# macos export's .app carries app.qbc and starts from it. Skips (77) without the pinned esbuild in ZINC_HOME (never downloaded here).
cd "$(dirname "$0")/../.." || exit 2
ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1 || { echo "skip: no esbuild in ZINC_HOME (zinc toolchain esbuild fetches it)"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p"
printf '{ "name": "qb", "entry": "main.js", "engine": "quickjs", "app": { "id": "dev.zinc.test.qb" } }\n' > "$tmp/p/zinc.json"
printf "console.log('from the source');\n" > "$tmp/p/main.js"
mkdir -p "$tmp/t" && sed 's/"qb"/"qt"/' "$tmp/p/zinc.json" > "$tmp/t/zinc.json"
printf "function boom() { throw new Error('boom'); }\nboom();\n" > "$tmp/t/main.js"

out=$("$ZINC" build "$tmp/p" 2>&1) || { echo "zinc build failed: $out"; exit 1; }
for f in qb.js qb.js.map qb.qbc; do [ -s "$tmp/p/build/$f" ] || { echo "zinc build wrote no build/$f: $out"; fail=1; }; done
echo "$out" | grep -q "zinc run .*qb.qbc" || { echo "zinc build does not say how to run it: $out"; fail=1; }

# the bytecode runs, not the source: the bundle edited after the build (the .qbc kept newer) still prints what was compiled
sed -i.bak 's/from the source/edited after the build/' "$tmp/p/build/qb.js" && touch "$tmp/p/build/qb.qbc"
got=$(ZINC_STEPS=1 "$ZINC" run "$tmp/p/build/qb.qbc" 2>&1)
echo "$got" | grep -q "^from the source$" && echo "$got" | grep -q "bytecode .*qb.qbc instead of the source" || { echo "zinc run build/qb.qbc did not run the bytecode: $got"; fail=1; }
got=$(ZINC_STEPS=0 "$ZINC" run "$tmp/p/build/qb.js" 2>&1)
[ "$got" = "from the source" ] || { echo "zinc run build/qb.js does not load the .qbc beside it: $got"; fail=1; }

# a trace from the bytecode names main.js, also once the build has moved (an exported app is copied elsewhere)
"$ZINC" build "$tmp/t" >/dev/null 2>&1 && mv "$tmp/t/build" "$tmp/tmoved"
got=$(ZINC_STEPS=0 "$ZINC" run "$tmp/tmoved/qt.qbc" 2>&1)
echo "$got" | grep -q "main.js:1:29" || { echo "a trace from the moved bytecode does not name main.js: $got"; fail=1; }
mv "$tmp/p/build" "$tmp/moved"

# damaged (the checksum QuickJS checks) and stale (older than the bundle): the source, no error
printf 'garbage' | dd of="$tmp/moved/qb.qbc" bs=1 seek=40 conv=notrunc 2>/dev/null; touch "$tmp/moved/qb.qbc"
got=$(ZINC_STEPS=0 "$ZINC" run "$tmp/moved/qb.qbc" 2>&1); rc=$?
[ $rc = 0 ] && [ "$got" = "edited after the build" ] || { echo "a damaged .qbc does not fall back to the source (rc $rc): $got"; fail=1; }
"$ZINC" build "$tmp/p" -o "$tmp/p/build/qb" >/dev/null 2>&1 && echo "console.log('newer bundle');" > "$tmp/p/build/qb.js"
got=$(ZINC_STEPS=0 "$ZINC" run "$tmp/p/build/qb.qbc" 2>&1)
[ "$got" = "newer bundle" ] || { echo "a .qbc older than its bundle still runs: $got"; fail=1; }

# the macos export: the .app carries app.qbc and starts from it
if [ "$(uname)" = Darwin ]; then
  "$ZINC" export "$tmp/p" --target macos -o "$tmp/dist" >/dev/null 2>&1 || { echo "zinc export --target macos failed"; fail=1; }
  r="$tmp/dist/qb.app/Contents/Resources/app"
  [ -s "$r/app.qbc" ] && [ -s "$r/app.js" ] && [ "$(cat "$r/engine")" = quickjs ] || { echo "the exported app carries no app.qbc: $(ls "$r" 2>&1)"; fail=1; }
  echo "console.log('not the bytecode');" > "$r/app.js" && touch "$r/app.qbc"
  got=$(ZINC_HEADLESS=1 "$tmp/dist/qb.app/Contents/MacOS/zinc" 2>&1)
  [ "$got" = "from the source" ] || { echo "the exported app does not start from app.qbc: $got"; fail=1; }
fi
exit $fail
