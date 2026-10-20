#!/bin/sh
# The console system host (ZN-454, targets/console/host_console.cpp): the pure console core (ZN_CONSOLE_GFX=OFF) built with this machine's compiler links
# no libuv, and runs the library golden and the timers golden with the interpreter's output; storage and files land in the data directory.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}
command -v cmake >/dev/null 2>&1 || { echo "console host: no cmake"; exit 77; }
B=${ZN_CONSOLE_BUILD:-build/console-pure}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
{ [ -f "$B/CMakeCache.txt" ] || cmake -S targets/console -B "$B" -DZN_CONSOLE_GFX=OFF; } >"$tmp/build.log" 2>&1 && cmake --build "$B" -j 4 >>"$tmp/build.log" 2>&1 || { echo "console host: the core does not build"; tail -20 "$tmp/build.log"; exit 1; }
core=$B/zinc-core
nm "$core" | grep -q " _\{0,1\}uv_" && { echo "console host: libuv symbols are linked"; fail=1; }
golden() {   # golden <name>: the program's lines between the markers equal its golden output, and the core exits 0
  "$Z" --emit=zbc-bin "tests/golden/run/$1.ts" "$tmp/$1.zbc" || { echo "console host: $1 does not compile"; fail=1; return; }
  "$core" "$tmp/$1.zbc" >"$tmp/$1.got" 2>&1; rc=$?
  [ $rc -eq 0 ] || { echo "console host: $1 exits $rc"; fail=1; }
  [ "$(head -1 "$tmp/$1.got")" = "zinc:start" ] && [ "$(tail -1 "$tmp/$1.got")" = "zinc:exit 0" ] || { echo "console host: $1 is not framed by zinc:start / zinc:exit 0"; fail=1; }
  sed '1d;$d' "$tmp/$1.got" | diff - "tests/golden/run/$1.out" >"$tmp/$1.diff" || { echo "console host: $1 differs from its golden"; head -10 "$tmp/$1.diff"; fail=1; }
}
golden library
golden timers_order
# files and storage: relative paths are the data directory's (the desktop HAL has none: the working directory), storage.kv is the desktop's format
cat >"$tmp/fs.ts" <<'EOF'
import { writeText, readText, exists } from 'zinc:fs';
import { get, set } from 'zinc:storage';
import { platform } from 'zinc:sys';
writeText('note.txt', 'hello console');
console.log(readText('note.txt'), exists('note.txt'), exists('missing.txt'));
set('best', '42');
console.log(get('best'), platform());
EOF
"$Z" --emit=zbc-bin "$tmp/fs.ts" "$tmp/fs.zbc" || fail=1
got=$(cd "$tmp" && ZINC_STORAGE= "$OLDPWD/$core" fs.zbc 2>&1 | sed '1d;$d')
[ "$got" = "hello console true false
42 console" ] || { echo "console host: files and storage: $got"; fail=1; }
grep -q "^best	42$" "$tmp/storage.kv" || { echo "console host: storage.kv is not written in the data directory"; fail=1; }
[ $fail -eq 0 ] && echo "console host: ok"
exit $fail
