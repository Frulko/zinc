#!/bin/sh
# A grown row child narrower than its content is measured again (tests/data/ui-grow-wrap): the row holds its wrapped cards. The
# frame hash is the golden's on the interpreter, QuickJS and the compiled program.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=200x150 ZINC_FRAMEHASH=last
p=tests/data/ui-grow-wrap want=$(cat $p/frame.hash) fail=0
h=$("$ZINC" run --interp $p 2>&1 | grep framehash); [ "$h" = "$want" ] || { echo "interpreter: $h"; fail=1; }
h=$("$ZINC" run $p --engine quickjs 2>&1 | grep framehash); [ "$h" = "$want" ] || { echo "QuickJS: $h"; fail=1; }
if "$ZINC" build $p -o "$tmp/app" >"$tmp/log" 2>&1; then h=$("$tmp/app" 2>&1 | grep framehash); [ "$h" = "$want" ] || { echo "compiled: $h"; fail=1; }
else echo "the program does not build: $(tail -c 300 "$tmp/log")"; fail=1; fi
exit $fail
