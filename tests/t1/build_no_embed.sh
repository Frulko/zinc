#!/bin/sh
# The baked fonts and images out of the executable: zinc build --no-embed writes them to <out>.res beside the program, and zinc build --bundle
# always to Contents/Resources/<exe>.res of the .app (its signature seals them). The sprite program of tests/data/image_rect gives its golden
# output and frame hash from both, and the plain one stops with a clear line when its .res is gone (it reads the file, nothing is embedded).
cd "$(dirname "$0")/../.." || exit 2
[ -n "$CXX" ] || command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
d=tests/data/image_rect
want=$(cat $d/golden.txt)
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=400x180 ZINC_FRAMES=2 ZINC_FRAMEHASH=last"
unset ZINC_ASSETS
fail=0
same() { [ "$2" = "$want" ] || { printf 'build_no_embed: %s:\n%s\nwant:\n%s\n' "$1" "$2" "$want"; fail=1; }; }
mkdir -p "$t/app" "$t/out"
cp $d/main.ts "$t/app/" && cp -R $d/assets "$t/app/"
printf '{"name":"noembed","entry":"main.ts","app":{"id":"dev.zinc.test.noembed","name":"No Embed"}}\n' > "$t/app/zinc.json"
"$ZINC" build --no-embed "$t/app/main.ts" -o "$t/out/app" >"$t/log" 2>&1 || { echo "build_no_embed: build --no-embed failed: $(tail -3 "$t/log")"; exit 1; }
[ -s "$t/out/app.res" ] || { echo "build_no_embed: no app.res beside the program"; fail=1; }
same "--no-embed" "$(cd "$t" && env $env ZINC_ASSETS="$t/app/assets" "$t/out/app" 2>&1 | sed 's/^zinc: framehash [0-9]* //' | sort)"
mv "$t/out/app.res" "$t/app.res.away"
out=$(cd "$t" && env $env ZINC_ASSETS="$t/app/assets" "$t/out/app" 2>&1); rc=$?
[ $rc -ne 0 ] && case "$out" in *"app.res is missing"*) true ;; *) false ;; esac || { echo "build_no_embed: without app.res (exit $rc): $out"; fail=1; }
if [ "$(uname)" = Darwin ]; then
  "$ZINC" build --bundle "$t/app/main.ts" -o "$t/App.app" >"$t/log" 2>&1 || { echo "build_no_embed: build --bundle failed: $(tail -3 "$t/log")"; exit 1; }
  exe=$(ls "$t/App.app/Contents/MacOS")
  [ -s "$t/App.app/Contents/Resources/$exe.res" ] || { echo "build_no_embed: no Contents/Resources/$exe.res in the .app"; fail=1; }
  codesign -v "$t/App.app" 2>/dev/null || { echo "build_no_embed: the .app's signature is not valid"; fail=1; }
  same "--bundle" "$(cd "$t" && env $env "$t/App.app/Contents/MacOS/$exe" 2>&1 | sed 's/^zinc: framehash [0-9]* //' | sort)"
fi
[ $fail -eq 0 ] && echo "build_no_embed: ok"
exit $fail
