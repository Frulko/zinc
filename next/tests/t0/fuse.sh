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
# the game plays a sound (zinc:audio, a native plugin): the archive carries the plugin's library built for this machine with its hash in the
# manifest (ZN-652), and the fused game loads it in this empty HOME: no toolchain is fetched and nothing is built there (packed normally:
# tests/run sets ZINC_DETERMINISTIC, which would bind the plugin's silent stand-in)
env -u ZINC_DETERMINISTIC "$Z" pack "$tmp/game" -o "$tmp/game.zapp" >/dev/null && "$Z" fuse "$tmp/game.zapp" -o "$tmp/game-app" >/dev/null || { echo "fuse game failed"; fail=1; }
tar tf "$tmp/game.zapp" | grep -q '^native/[a-z]*-[a-z0-9_]*/audio/exports$' || { echo "the archive has no library of the audio plugin: $(tar tf "$tmp/game.zapp" | tr '\n' ' ')"; fail=1; }
tar xOf "$tmp/game.zapp" manifest.json | grep -q '"native/[^"]*/audio/[^"]*\.\(dylib\|so\)": "[0-9a-f]\{64\}"' || { echo "the manifest does not list the plugin library with its hash"; fail=1; }
frame='ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=8 ZINC_FRAMEHASH=last'
want=$(cd "$tmp/game" && env $frame ZINC_STORAGE="$tmp/s1" "$Z" run . 2>&1 | grep framehash)
got=$(clean env $frame ZINC_STORAGE="$tmp/s2" "$tmp/game-app" 2>&1 | grep framehash)
[ -n "$want" ] && [ "$got" = "$want" ] || { echo "the fused game draws '$got', zinc run '$want'"; fail=1; }
[ "$(ls "$tmp/home/.zinc")" = cache ] && [ "$(ls "$tmp/home/.zinc/cache")" = zapp ] || { echo "the fused game fetched or built something (only its unpacked archive belongs there): $(ls -R "$tmp/home/.zinc" 2>&1 | head -12 | tr '\n' ' ')"; fail=1; }
# the window host travels inside the fused executable (ZN-592.01): a windowed run writes it into the cache of the home it runs with and loads it
if [ "$(uname)" = Darwin ] && [ -f "$(dirname "$Z")/libzn_window.dylib" ]; then
  out=$(clean env ZINC_FRAMES=3 "$tmp/game-app" 2>&1)
  ls "$tmp/home/.zinc/cache/modules/"libzn_window-*.dylib >/dev/null 2>&1 && ! echo "$out" | grep -q "no window" || { echo "the fused game has no window module: $(echo "$out" | head -3)"; fail=1; }
fi
size1=$(wc -c < "$tmp/hello-app" | tr -d " ")
"$Z" fuse "$tmp/hello.zapp" --target rpi -o "$tmp/x" >/dev/null 2>"$tmp/err"; [ $? -eq 2 ] && grep -q "ZN-392" "$tmp/err" || { echo "another target must be refused for now: $(cat "$tmp/err")"; fail=1; }
[ $fail -eq 0 ] && echo "fuse: ok (fused hello: $size1 bytes)"
exit $fail
