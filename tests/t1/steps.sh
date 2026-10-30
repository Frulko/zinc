#!/bin/sh
# Command steps (ZN-720): all engines report stages, also into a pipe (zinc run and zinc dev with ZINC_STEPS=1 or -v: they print one line by default, ZN-774.32); -q explicitly hides progress.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
unset ZINC_STEPS
export ZN_AOT_PART_BYTES=1000   # exercise object-cache and multi-unit progress on a small program
ZINC_STEPS=1 "$ZINC" build tests/data/run_compiled/main.ts -o "$t/app" 2>"$t/b" >/dev/null || { echo "build failed"; cat "$t/b"; exit 1; }
for s in "zinc build" "  compile " "  resources " "  C++ " "  native " "  cache " "  link " "  done "; do grep -q "^$s" "$t/b" || { echo "build: no '$s' line"; fail=1; }; done
grep -q 'completed, .* running' "$t/b" || { echo 'build: no live C++ progress'; fail=1; }
ZINC_STEPS=1 ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" --interp run tests/data/run_compiled/main.ts 2>"$t/r" >/dev/null
grep -q "^  run        interpreter" "$t/r" || { echo "run: no interpreter step"; cat "$t/r"; fail=1; }
"$ZINC" build tests/data/run_compiled/main.ts -o "$t/app" 2>"$t/p" >/dev/null
[ -s "$t/p" ] || { echo "no steps printed into a pipe"; fail=1; }
ZINC_STEPS=1 "$ZINC" -q build tests/data/run_compiled/main.ts -o "$t/app" 2>"$t/q" >/dev/null
[ -s "$t/q" ] && { echo "-q did not hide the steps"; fail=1; }
printf 'console.log("js output");\n' > "$t/main.js"
ZINC_STEPS=1 "$ZINC" run "$t/main.js" > "$t/jsout" 2> "$t/jslog" || fail=1
[ "$(cat "$t/jsout")" = 'js output' ] || { echo 'QuickJS stdout changed'; fail=1; }
for s in 'zinc run' '  engine ' '  prepare ' '  context ' '  load ' '  run ' '  exit '; do
  grep -q "^$s" "$t/jslog" || { echo "QuickJS: no '$s' line"; cat "$t/jslog"; fail=1; }
done
"$ZINC" run -q "$t/main.js" > /dev/null 2> "$t/quietjs"
[ ! -s "$t/quietjs" ] || { echo 'QuickJS -q is not quiet'; fail=1; }
ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" run --native -q tests/data/run_compiled/main.ts > /dev/null 2> "$t/quietnative" || fail=1
[ ! -s "$t/quietnative" ] || { echo 'native -q is not quiet'; cat "$t/quietnative"; fail=1; }
"$ZINC" run --log-format json -v "$t/main.js" > /dev/null 2> "$t/json"
python3 - "$t/json" <<'PY'
import json, sys
lines = open(sys.argv[1]).read().splitlines()
assert lines
for line in lines:
    assert {'t', 'module', 'level', 'msg'} <= json.loads(line).keys(), line
PY
[ $? -eq 0 ] || fail=1
[ $fail -eq 0 ] && echo "steps: ok"
exit $fail
