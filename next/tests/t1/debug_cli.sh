#!/bin/sh
# zinc debug on the command line (ZN-371.01): scripted sessions on tests/data/debug_cli/main.ts give the recorded transcripts (tests/golden/debug_cli):
# the first stop, step into a call and a constructor, step over, step out, breakpoints set, hit in a loop and deleted, the stack with lines, the
# locals (numbers, a string, an array, an object, this), print; q ends the program at once with exit 0. In a .tsx file (ZN-371.03) the lines
# inside a JSX element and after it are the file's own, and a compile error inside an element names its line and column.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for s in session quit; do
  got=$("$ZINC" debug tests/data/debug_cli/main.ts < tests/data/debug_cli/$s.txt 2>&1); rc=$?
  [ $rc -eq 0 ] || { echo "$s: exit $rc"; fail=1; }
  printf '%s\n' "$got" | diff -u tests/golden/debug_cli/$s.out - || { echo "$s: transcript differs"; fail=1; }
done
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=2 "$ZINC" debug tests/data/debug_cli/app.tsx < tests/data/debug_cli/tsx.txt 2>&1)
printf '%s\n' "$got" | diff -u tests/golden/debug_cli/tsx.out - || { echo "tsx: transcript differs"; fail=1; }
"$ZINC" check tests/data/debug_cli/bad.tsx 2>&1 | grep -q "bad.tsx:7:8: error Z0101: Cannot find name: 'missing'" || { echo "bad.tsx: not at 7:8: $("$ZINC" check tests/data/debug_cli/bad.tsx 2>&1 | head -2)"; fail=1; }
# a run without the debugger is unchanged by the debug build of zinc debug: the same output
[ "$("$ZINC" run --interp tests/data/debug_cli/main.ts 2>&1)" = "$(printf 'zinc 6 1\ndone')" ] || { echo "the plain run differs"; fail=1; }
exit $fail
