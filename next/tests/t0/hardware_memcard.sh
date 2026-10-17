#!/bin/sh
# Saving (ZN-759): the PS2's memory card is zinc:storage, as a desktop's file is. On the console core (built here with this machine's compiler and
# the headless HAL) a value set by one run is read by the next, and zinc:hardware saveLocation() names the file it lives in (storage.kv in the
# data directory: mc0:/ZINC/ on a PS2, the game's folder on a PSP; ZINC_STORAGE moves it); the desktop names its own file.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
command -v cmake >/dev/null 2>&1 || { echo "hardware memcard: no cmake"; exit 77; }
B=${ZN_CONSOLE_BUILD:-build/console-pure}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
{ [ -f "$B/CMakeCache.txt" ] || cmake -S targets/console -B "$B" -DZN_CONSOLE_GFX=OFF; } >"$tmp/build.log" 2>&1 && cmake --build "$B" -j 4 >>"$tmp/build.log" 2>&1 || { echo "hardware memcard: the core does not build"; tail -20 "$tmp/build.log"; exit 1; }
core=$PWD/$B/zinc-core
cat > "$tmp/main.ts" <<'EOF'
import { get, set } from 'zinc:storage';
import { saveLocation } from 'zinc:hardware';
const runs = get('runs') === '' ? 0 : parseInt(get('runs'));
set('runs', '' + (runs + 1));
console.log(`runs ${runs + 1} at ${saveLocation()}`);
EOF
"$Z" --emit=zbc-bin "$tmp/main.ts" "$tmp/main.zbc" >/dev/null 2>&1 || { echo "hardware memcard: the program does not compile"; exit 1; }
fail=0
one=$(cd "$tmp" && ZINC_STORAGE="$tmp/card.kv" "$core" main.zbc 2>&1 | grep '^runs')
two=$(cd "$tmp" && ZINC_STORAGE="$tmp/card.kv" "$core" main.zbc 2>&1 | grep '^runs')
[ "$one" = "runs 1 at $tmp/card.kv" ] && [ "$two" = "runs 2 at $tmp/card.kv" ] || { echo "hardware memcard: the console core did not keep the value: $one / $two"; fail=1; }
got=$(cd "$tmp" && ZINC_STORAGE="$tmp/desk.kv" ZINC_HEADLESS=1 "$Z" run main.ts 2>&1 | grep '^runs')
[ "$got" = "runs 1 at $tmp/desk.kv" ] || { echo "hardware memcard: the desktop: $got"; fail=1; }
[ $fail -eq 0 ] && echo "hardware memcard: ok"
exit $fail
