#!/bin/sh
# The differential runner finds a difference: with an interpreter that prints one line too many, both programs are reported;
# with the real one they agree.
cd "$(dirname "$0")/../.." || exit 2
fail=0
bad=$(mktemp); trap 'rm -f "$bad"' EXIT
printf '#!/bin/sh\n"%s" "$@"; rc=$?\n[ "$1" = run ] && echo extra\nexit $rc\n' "$ZINC" > "$bad"; chmod +x "$bad"
ZINC=$bad tools/diff-matrix run:records >/dev/null 2>&1 && { echo "diff-matrix missed a difference"; fail=1; }
tools/diff-matrix run:records bench:fib >/dev/null 2>&1 || { echo "diff-matrix reports a difference between identical engines"; fail=1; }
exit $fail
