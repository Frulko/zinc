#!/bin/sh
# Compiled run (ZN-398, D43): `zinc run --native` builds the program once into the run cache and starts it; the second run reuses it; the output, the frame
# hash and the program arguments match the interpreter's; --interp interprets; a changed source rebuilds.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
cp tests/data/run_compiled/main.ts "$t/main.ts"
export ZINC_HOME="$t/home" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_FRAMEHASH=last
fail=0
"$ZINC" --native run "$t/main.ts" -- a b >"$t/n1" 2>"$t/e1" || { echo "first compiled run failed"; cat "$t/e1"; fail=1; }
grep -q "compiling main.ts" "$t/e1" || { echo "the first run did not compile"; fail=1; }
"$ZINC" --native run "$t/main.ts" -- a b >"$t/n2" 2>"$t/e2" || fail=1
grep -q "compiling" "$t/e2" && { echo "the second run compiled again"; fail=1; }
"$ZINC" --interp run "$t/main.ts" -- a b >"$t/i" 2>"$t/ei" || fail=1
cmp -s "$t/n1" "$t/i" && cmp -s "$t/n2" "$t/i" || { echo "output differs:"; cat "$t/n2" "$t/i"; fail=1; }
grep -q "args a,b width" "$t/i" || { echo "arguments missing: $(cat "$t/i")"; fail=1; }
[ "$(grep framehash "$t/e2")" = "$(grep framehash "$t/ei")" ] || { echo "frames differ: $(grep framehash "$t/e2") / $(grep framehash "$t/ei")"; fail=1; }
"$ZINC" run "$t/main.ts" >/dev/null 2>"$t/e3"
grep -q "compiling" "$t/e3" && { echo "a test run (ZINC_DETERMINISTIC) compiled without --native"; fail=1; }
sed 's/0xffcc00/0x00ccff/' tests/data/run_compiled/main.ts >"$t/main.ts"
"$ZINC" --native run "$t/main.ts" >/dev/null 2>"$t/e4"
grep -q "compiling main.ts" "$t/e4" || { echo "a changed source did not rebuild"; fail=1; }
[ $fail -eq 0 ] && echo "run_compiled: ok"
exit $fail
