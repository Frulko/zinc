#!/bin/sh
# Command steps (owner 2026-10-09): build and run say what they do, one line per step with its duration, in a terminal (forced here with ZINC_STEPS=1);
# nothing when stderr is a pipe or with -q.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
ZINC_STEPS=1 "$ZINC" build tests/data/run_compiled/main.ts -o "$t/app" 2>"$t/b" >/dev/null || { echo "build failed"; cat "$t/b"; exit 1; }
for s in "zinc build" "  compile " "  resources " "  C++ " "  native " "  done "; do grep -q "^$s" "$t/b" || { echo "build: no '$s' line"; fail=1; }; done
ZINC_STEPS=1 ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" --interp run tests/data/run_compiled/main.ts 2>"$t/r" >/dev/null
grep -q "^  run        interpreter" "$t/r" || { echo "run: no interpreter step"; cat "$t/r"; fail=1; }
"$ZINC" build tests/data/run_compiled/main.ts -o "$t/app" 2>"$t/p" >/dev/null
[ -s "$t/p" ] && { echo "steps printed into a pipe:"; cat "$t/p"; fail=1; }
ZINC_STEPS=1 "$ZINC" -q build tests/data/run_compiled/main.ts -o "$t/app" 2>"$t/q" >/dev/null
[ -s "$t/q" ] && { echo "-q did not hide the steps"; fail=1; }
[ $fail -eq 0 ] && echo "steps: ok"
exit $fail
