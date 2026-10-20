#!/bin/sh
# zinc:assets on a console core (ZN-759): the asset pack of `zinc pack` (packs/default.zpk) linked into the core with the program serves zinc:assets
# (exists, readText, readBytes, list) and its images are zinc:gfx images, so examples/platformer (a sprite atlas, an LDtk level, Ogg sounds)
# runs on the core built here with this machine's compiler and the headless HAL: 120 frames, no error, its Ogg sounds decoded.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
command -v cmake >/dev/null 2>&1 || { echo "console assets: no cmake"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env -u ZINC_DETERMINISTIC "$Z" pack examples/platformer -o "$tmp/p.zapp" >/dev/null 2>&1 && tar -xf "$tmp/p.zapp" -C "$tmp" program.zbc resources.bin packs/default.zpk ||
  { echo "console assets: zinc pack examples/platformer failed"; exit 1; }
B=${ZN_CONSOLE_BUILD:-build/console-assets}
{ cmake -S targets/console -B "$B" -DZN_CONSOLE_EMBED="$tmp/program.zbc" -DZN_CONSOLE_EMBED_RES="$tmp/resources.bin" -DZN_CONSOLE_EMBED_PACK="$tmp/packs/default.zpk" &&
  cmake --build "$B" -j 4; } >"$tmp/build.log" 2>&1 || { echo "console assets: the core does not build"; tail -20 "$tmp/build.log"; exit 1; }
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=120 ZINC_SIZE=480x272 "$B/zinc-core" 2>&1); rc=$?
fail=0
[ $rc -eq 0 ] && [ "$(echo "$got" | tail -1)" = "zinc:exit 0" ] || { echo "console assets: the platformer exits $rc: $(echo "$got" | grep -v '^zinc:start' | tail -3)"; fail=1; }
echo "$got" | grep -q "zinc:audio:" && { echo "console assets: a sound did not load: $(echo "$got" | grep -m1 'zinc:audio:')"; fail=1; }
[ $fail -eq 0 ] && echo "console assets: ok"
exit $fail
