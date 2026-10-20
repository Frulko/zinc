#!/bin/sh
# Museum table, the sample collection (ZN-650.02): every file the project names is there and loads the way the player loads it (the photographs
# and textures in zinc:gfx, the model in zinc:3d: tests/data/museum_assets/expected.txt); every file of the assets is named by the project and
# listed in LICENSES.md, with a source and a licence for each medium (the loader refuses a medium without them); the example is under 12 MB
# (8 MB of media, and the narration of every sequence and medium in two languages).
cd "$(dirname "$0")/../.." || exit 2
want=$PWD/tests/data/museum_assets/expected.txt
cd examples/museum-table || exit 2
fail=0
got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 "$ZINC" run src/assets.ts 2>&1) || { echo "an asset does not load"; fail=1; }
[ "$got" = "$(cat "$want")" ] || { printf '%s\n' "$got" | diff - "$want" | head -20; fail=1; }
for f in $(cd assets && find . -type f ! -name project.json ! -name '.*' | sed 's|^\./||'); do
  grep -q "^$f: " "$want" || { echo "assets/$f is not named by the project"; fail=1; }
  grep -qF "\`$f\`" LICENSES.md || { echo "assets/$f is not in LICENSES.md"; fail=1; }
done
bytes=$(find . -type f -exec stat -f %z {} + 2>/dev/null | awk '{ n += $1 } END { print n }')
[ -n "$bytes" ] || bytes=$(find . -type f -exec stat -c %s {} + | awk '{ n += $1 } END { print n }')   # GNU stat
[ "$bytes" -lt 12582912 ] || { echo "the example is $bytes bytes, over 12 MB"; fail=1; }
[ $fail = 0 ] && echo "museum_assets: ok, $bytes bytes"
exit $fail
