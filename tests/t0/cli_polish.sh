#!/bin/sh
# First-run messages of the CLI (ZN-1007): options before or after the entry, a bare word that names an example, an export of a project whose
# zinc.json name is no file name, and a folder named as the project looking no higher for a zinc.json. (A wrong pairing code: tests/t0/agent.sh;
# the inspector on port 0: tests/t1/dev_mode.sh.)
cd "$(dirname "$0")/../.." || exit 2
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
export ZINC_LANG=en ZINC_HEADLESS=1
fail=0
cd "$t" || exit 2
printf 'console.log("sum " + (1 + 2));\n' > a.tsx
for order in "--engine quickjs a.tsx" "a.tsx --engine quickjs"; do
  out=$("$Z" run $order 2>&1); case "$out" in *"sum 3"*) ;; *) echo "zinc run $order: $out"; fail=1 ;; esac
done
# a bare word: example:<name> when the catalogue has it, the plain missing-file error otherwise
out=$("$Z" run breakout 2>&1); rc=$?
[ $rc -eq 2 ] && case "$out" in *"did you mean the example 'example:breakout'?"*"zinc run example:breakout"*) true ;; *) false ;; esac || { echo "zinc run breakout (exit $rc): $out"; fail=1; }
out=$("$Z" check no-such-example 2>&1); case "$out" in *"'example:"*) echo "a word the catalogue lacks names an example: $out"; fail=1 ;; esac
# the parent's zinc.json stops at the folder named as the project
mkdir -p parent/sketch && printf '{ "name": "parent", "entry": "main.ts", "requires": ["heap>=1G"] }\n' > parent/zinc.json
printf 'console.log("p");\n' > parent/main.ts; printf 'console.log("s");\n' > parent/sketch/main.ts
"$Z" check --profile esp32 parent/sketch/main.ts >/dev/null 2>&1 && { echo "a sketch with no zinc.json no longer takes its parent's"; fail=1; }
ZINC_PROJECT_ROOT="$t/parent/sketch" "$Z" check --profile esp32 parent/sketch/main.ts >/dev/null 2>&1 || { echo "ZINC_PROJECT_ROOT does not stop the search for zinc.json"; fail=1; }
# zinc export --target web of "My Game": its files are named after app.id
mkdir -p spaced && printf '{ "name": "My Game", "app": { "id": "dev.example.mygame" }, "entry": "main.ts" }\n' > spaced/zinc.json
printf 'console.log("g");\n' > spaced/main.ts
out=$("$Z" export spaced --target web 2>&1) && [ -f spaced/dist/mygame-web/index.html ] || { echo "export of \"My Game\": $out"; fail=1; }
grep -q '<title>My Game' spaced/dist/mygame-web/index.html 2>/dev/null || { echo "the page lost its title My Game"; fail=1; }
[ $fail -eq 0 ] && echo "cli_polish: ok"
exit $fail
