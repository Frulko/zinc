#!/bin/sh
# A worker asks the main program (ZN-1032) on the interpreter, AOT and QuickJS: an async port.handle replies when its Promise settles, and a
# worker's setTimeout waits on the real clock (tests/run sets ZINC_DETERMINISTIC: unset here).
cd "$(dirname "$0")/../.." || exit 2
fail=0
for r in interp native quickjs; do
  e=""; [ $r = quickjs ] && e="--engine quickjs"
  out=$(env -u ZINC_DETERMINISTIC ZINC_RUN=$r ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/data/worker_request/main.ts $e 2>/dev/null)
  want=$(printf '%s\n' "worker timer: waited 50 ms" "worker asked, main replied 'main counts apples' 42")
  [ "$out" = "$want" ] || { echo "$r: got: $out"; fail=1; }
done
exit $fail
