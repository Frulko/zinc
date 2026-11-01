#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"$ZINC" check examples/murdoku > "$tmp/check"
ZINC_HEADLESS=1 ZINC_SIZE=1320x900 ZINC_FRAMES=1 "$ZINC" run tests/data/murdoku/input.ts --engine quickjs > "$tmp/session.input"
for engine in interp aot quickjs; do
 case "$engine" in interp) set -- --interp;; aot) set -- --native;; quickjs) set -- --engine quickjs;; esac
 ZINC_HEADLESS=1 ZINC_FRAMES=3 "$ZINC" run tests/data/murdoku/actions.ts "$@" > "$tmp/actions"
 test "$(cat "$tmp/actions")" = 'actions ok'
 ZINC_HEADLESS=1 ZINC_FRAMES=8 ZINC_SHOT="$tmp/$engine.png" "$ZINC" run examples/murdoku "$@" > "$tmp/out"
 test -s "$tmp/$engine.png"
 ZINC_HEADLESS=1 ZINC_SIZE=1320x900 ZINC_FRAMES=26 ZINC_INPUT="$tmp/session.input" "$ZINC" run tests/data/murdoku/ui.ts "$@" > "$tmp/keyboard"
 test "$(cat "$tmp/keyboard")" = 'keyboard ok'
done
ZINC_HEADLESS=1 ZINC_SIZE=390x844 ZINC_FRAMES=1 "$ZINC" run tests/data/murdoku/phone-input.ts --engine quickjs > "$tmp/phone.input"
ZINC_HEADLESS=1 ZINC_SIZE=390x844 ZINC_FRAMES=16 ZINC_INPUT="$tmp/phone.input" ZINC_SHOT="$tmp/phone.png" "$ZINC" run tests/data/murdoku/phone.ts --engine quickjs > "$tmp/phone"
test "$(cat "$tmp/phone")" = 'phone ok'
# "Nouvelle affaire" clicked in a burst: the plan must never render a new grid with the old notes (array index out of bounds on the bounds-checked engine).
spam=$(ZINC_HEADLESS=1 ZINC_SIZE=1320x900 ZINC_FRAMES=90 ZINC_INPUT=tests/data/murdoku/spam-input "$ZINC" run examples/murdoku 2>&1 || true)
case "$spam" in *"runtime error"*) echo "murdoku new-case burst: $spam"; exit 1;; esac
