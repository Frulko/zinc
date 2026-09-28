#!/bin/sh
# ZincStudio headless checks (run from the zinc checkout): sh apps/studio/test.sh
#  1. the studio builds;  2. both samples generate and type-check;  3. the headless sample prints the expected
#  lines on the sim (the oracle);  4. a project using every library box builds natively (all templates compile).
set -e
zinc() { node compiler/bin/zinc.mjs "$@"; }
zinc build apps/studio --target macos > /dev/null
STUDIO=apps/studio/src/build/macos/cmake/app
for p in apps/studio/samples/*.zproj; do
  $STUDIO --generate "$p"
  zinc check "$p/build/src/main.ts"
done
out=$(zinc run apps/studio/samples/headless.zproj/build --target sim 2>/dev/null | grep -v '^zinc:')
expected=$(printf '1\n2\n3\n4\n5\ncounted to five on sim, stopping\n[flow] behavior stopped')
[ "$out" = "$expected" ] || { echo "headless sample: unexpected output:"; echo "$out"; exit 1; }
echo "ok   headless sample on sim"
# the real path: zinc builds break under a symlinked directory such as macOS /var -> /private/var
tmp=$(cd "$(mktemp -d)" && pwd -P)
$STUDIO --all-boxes "$tmp/all.zproj"
zinc build "$tmp/all.zproj/build" --target macos > /dev/null
echo "ok   every box template compiles (macos)"
rm -rf "$tmp"
