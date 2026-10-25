#!/bin/sh
# zinc:location (plugins/location) on the fake provider (ZINC_FAKE_LOCATION): the plugin builds; a session (permission asked, current
# position, a watch over a three-point path with the distance walked, stop) prints the frozen lines on the interpreter and without native
# code; the fake's other answers (denied, services off, silent: a timeout) come back as error values; a project whose permissions lack
# "location" is refused when enforced; examples/geo runs headless, asks, locates and watches by itself (GEO_AUTO). No real provider is asked.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1
export ZINC_FAKE_LOCATION="48.8584,2.2945,5;48.8590,2.2950,8;48.8600,2.2960,8"
want=$(cat tests/golden/host/location_session.out)
out=$("$ZINC" plugin-build location 2>&1) && echo "$out" | grep -q "^location \(built\|cached\) " || { echo "the location plugin does not build: $out"; exit 1; }
got=$(timeout 60 "$ZINC" run tests/golden/host/location_session.ts 2>&1)
[ "$got" = "$want" ] || { echo "the session differs on the interpreter: $(echo "$got" | diff tests/golden/host/location_session.out - | head -6)"; fail=1; }
got=$(ZINC_NATIVE=sim timeout 60 "$ZINC" run tests/golden/host/location_session.ts 2>&1)
[ "$got" = "$want" ] || { echo "the session differs without native code: $(echo "$got" | diff tests/golden/host/location_session.out - | head -6)"; fail=1; }
# the system's other answers, as values
printf "import { getCurrentPosition } from 'zinc:location';\ngetCurrentPosition({ timeout: 2000 }).then((r) => console.log(r.error === null ? 'position' : r.error.code));\n" > "$tmp/one.ts"
for c in denied:denied off:services-off restricted:restricted silent:timeout; do
  got=$(ZINC_FAKE_LOCATION=${c%%:*} timeout 60 "$ZINC" run "$tmp/one.ts" 2>&1)
  [ "$got" = "${c#*:}" ] || { echo "ZINC_FAKE_LOCATION=${c%%:*} answers '$got', not ${c#*:}"; fail=1; }
done
# no provider (no fake outside a deterministic run on a machine without one is the native one: only the sim is checked here)
got=$(ZINC_NATIVE=sim ZINC_FAKE_LOCATION=0 timeout 60 "$ZINC" run "$tmp/one.ts" 2>&1)
[ "$got" = "unavailable" ] || { echo "no provider answers '$got', not unavailable"; fail=1; }
# zinc.json permissions: without "location" the position is refused when enforced
mkdir -p "$tmp/denied" && printf '{ "name": "denied", "entry": "main.ts", "permissions": ["fs"] }\n' > "$tmp/denied/zinc.json"
printf "import { getCurrentPosition } from 'zinc:location';\ngetCurrentPosition().then((r) => console.log(r.error === null ? 'position' : r.error.message));\n" > "$tmp/denied/main.ts"
out=$(cd "$tmp/denied" && ZINC_PERMISSIONS=enforce timeout 60 "$ZINC" run . 2>&1)
echo "$out" | grep -q 'needs the permission "location"' || { echo "an undeclared location is not refused: $out"; fail=1; }
# the demo: asks, locates, watches the path to its end
out=$(GEO_AUTO=1 GEO_LOG=1 ZINC_FRAMES=400 timeout 120 "$ZINC" run examples/geo 2>&1)
echo "$out" | grep -q "geo: granted 48.8600,2.2960 watching=true fixes=3 walked=" || { echo "examples/geo did not walk the path: $(echo "$out" | tail -4)"; fail=1; }
exit $fail
