#!/bin/sh
# Fused executables (ZN-319): `zinc fuse app.zapp -o app` is this engine with the archive appended; the result runs where no zinc is set up (an
# empty environment: no ZINC_HOME, a fresh HOME, another working directory), with the app's arguments, printing and drawing what `zinc run` of the
# project does; another target than this machine's is refused for now (ZN-392).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/home" "$tmp/elsewhere"
"$Z" new cli "$tmp/hello" >/dev/null && "$Z" new game-2d "$tmp/game" >/dev/null || exit 2
"$Z" pack "$tmp/hello" -o "$tmp/hello.zapp" >/dev/null && "$Z" fuse "$tmp/hello.zapp" -o "$tmp/hello-app" >/dev/null || { echo "pack / fuse failed"; exit 1; }
clean() { (cd "$tmp/elsewhere" && env -i HOME="$tmp/home" PATH=/usr/bin:/bin "$@"); }
want=$(cd "$tmp/hello" && "$Z" run . -- one two 2>&1)
got=$(clean "$tmp/hello-app" one two 2>&1)
[ "$got" = "$want" ] || { echo "the fused hello prints '$got', zinc run prints '$want'"; fail=1; }
"$Z" pack "$tmp/game" -o "$tmp/game.zapp" >/dev/null && "$Z" fuse "$tmp/game.zapp" -o "$tmp/game-app" >/dev/null || { echo "fuse game failed"; fail=1; }
frame='ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=8 ZINC_FRAMEHASH=last'
want=$(cd "$tmp/game" && env $frame ZINC_STORAGE="$tmp/s1" "$Z" run . 2>&1 | grep framehash)
got=$(clean env $frame ZINC_STORAGE="$tmp/s2" "$tmp/game-app" 2>&1 | grep framehash)
[ -n "$want" ] && [ "$got" = "$want" ] || { echo "the fused game draws '$got', zinc run '$want'"; fail=1; }
size1=$(wc -c < "$tmp/hello-app" | tr -d " ")
"$Z" fuse "$tmp/hello.zapp" --target rpi -o "$tmp/x" >/dev/null 2>"$tmp/err"; [ $? -eq 2 ] && grep -q "ZN-392" "$tmp/err" || { echo "another target must be refused for now: $(cat "$tmp/err")"; fail=1; }
[ $fail -eq 0 ] && echo "fuse: ok (fused hello: $size1 bytes)"
exit $fail
