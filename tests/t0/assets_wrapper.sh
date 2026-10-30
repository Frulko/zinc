#!/bin/sh
# zinc:assets reads the project's assets (zinc.json "assets") when the entry is another file of the project: zinc dev's wrapper,
# build/.zinc-dev/main.ts, above which lies build/assets (the packs), not the project's assets. On the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
mkdir -p "$t/p/src" "$t/p/art" "$t/p/build/assets" "$t/p/build/.zinc-dev"
printf '{"name":"p","entry":"src/main.ts","assets":"art"}\n' > "$t/p/zinc.json"
printf 'from art' > "$t/p/art/hello.txt"
printf 'from build' > "$t/p/build/assets/hello.txt"
printf "import { readText } from 'zinc:assets';\nconsole.log('asset: ' + readText('hello.txt'));\n" > "$t/p/src/main.ts"
printf "import '../../src/main.ts';\n" > "$t/p/build/.zinc-dev/main.ts"
fail=0
for e in --interp --native "--engine quickjs"; do
  out=$("$ZINC" run "$t/p/build/.zinc-dev/main.ts" $e 2>&1 | grep '^asset:')
  [ "$out" = "asset: from art" ] || { echo "$e: '$out' (wanted the project's assets)"; fail=1; }
done
exit $fail
