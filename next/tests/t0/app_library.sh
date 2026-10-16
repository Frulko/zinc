#!/bin/sh
# The engine as a library for an app shell (ZN-620, include/zn/app.h): the C++ of examples/hello and examples/rn-showcase, compiled with
# -DZN_APP_LIBRARY and linked against zn_app (build/zn_app.link), prints and draws what `zinc run` does: hello through zn_app_main (init, then
# iterate until done), rn-showcase through the SDL3 main-callbacks shell of the phones (src/app/shell_sdl.cpp). The engine's own archives
# reference no dlopen, fork or exec (SDL3, a separate archive, opens the system's GL libraries itself).
cd "$(dirname "$0")/../.." || exit 2
BUILD=${BUILD:-build}
Z=${ZINC:-$BUILD/zinc}
[ -f "$BUILD/zn_app.link" ] && [ -f "$BUILD/libzn_app.a" ] || { echo "skipped: zn_app is not built (tools/build zn_app)"; exit 77; }
tmp=${KEEP:-$(mktemp -d)}; [ -n "$KEEP" ] || trap 'rm -rf "$tmp"' EXIT
fail=0
case $(uname) in
  Darwin) sys="-Wl,-dead_strip"; for fw in Cocoa CoreMedia CoreVideo IOKit Carbon Foundation Metal QuartzCore AppKit CoreFoundation CoreGraphics CoreServices UniformTypeIdentifiers CoreHaptics GameController ForceFeedback AudioToolbox AVFoundation CoreAudio CoreBluetooth CoreMotion OpenGL; do sys="$sys -framework $fw"; done; sys="$sys -lobjc" ;;
  *) sys="-Wl,--gc-sections -ldl -lm -lpthread" ;;
esac
libs=$(tr '\n' ' ' < "$BUILD/zn_app.link")
printf '#include "zn/app.h"\nint main(int argc, char** argv) { return zn_app_main(argc, argv); }\n' > "$tmp/main.cpp"
app() {   # app <entry> <name> <shell>: the program's C++ units and the shell, against the library and the program's plugins
  n=$2 shell=$3
  ZN_AOT_CPP_ONLY=1 "$Z" build "$1" -o "$tmp/$n" >/dev/null 2>"$tmp/$n.err" || { echo "zinc build $1 failed: $(tail -3 "$tmp/$n.err")"; return 1; }
  eval "set -- $(cat "$tmp/$n.libs")"   # the plugins' archives, quoted by zinc build
  c++ -std=c++20 -O1 -w -ffp-contract=off -DZN_APP_LIBRARY -I include -I src -I third_party/mimalloc/include -I third_party/SDL3/include "$tmp/$n".cpp $(ls "$tmp/$n".part*.cpp 2>/dev/null) "$shell" "$@" $libs $sys -o "$tmp/$n" 2>"$tmp/$n.err" || { echo "linking $n against zn_app failed: $(head -5 "$tmp/$n.err")"; return 1; }
}
if app ../examples/hello hello "$tmp/main.cpp"; then
  "$tmp/hello" > "$tmp/hello.out" 2>/dev/null; got=$?
  "$Z" run ../examples/hello > "$tmp/hello.want" 2>/dev/null; want=$?
  cmp -s "$tmp/hello.out" "$tmp/hello.want" || { echo "hello linked against zn_app prints differently:"; diff "$tmp/hello.want" "$tmp/hello.out" | head -5; fail=1; }
  [ $got -eq $want ] || { echo "hello linked against zn_app exits with $got, zinc run with $want"; fail=1; }
else fail=1; fi
if app ../examples/rn-showcase rn src/app/shell_sdl.cpp; then
  read -r screen scheme want _ < tests/golden/rn-showcase/hashes.txt
  got=$(cd ../examples/rn-showcase && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_SCALE=1 ZINC_SIZE=420x860 ZINC_FRAMEHASH=last SHOWCASE_SCREEN=$screen SHOWCASE_SCHEME=$scheme "$tmp/rn" 2>&1 | grep framehash | awk '{print $5}')
  [ "$got" = "$want" ] || { echo "rn-showcase on the SDL callbacks shell: frame hash '$got', recorded $want ($screen $scheme)"; fail=1; }
else fail=1; fi
# timers and promises on the real clock, one turn per tick of the callbacks shell (__loopStep: nothing sleeps, the next tick comes back)
printf 'let n = 0;\nconst id = setInterval(() => { n++; console.log("tick " + n); if (n === 3) clearInterval(id); }, 20);\nsetTimeout(() => console.log("late"), 90);\nPromise.resolve(1).then((v) => console.log("then " + v));\nconsole.log("top");\n' > "$tmp/timers.ts"
if app "$tmp/timers.ts" timers src/app/shell_sdl.cpp; then
  out=$("$tmp/timers" 2>&1 | tr '\n' ' ')
  [ "$out" = "top then 1 tick 1 tick 2 tick 3 late " ] || { echo "timers on the callbacks shell: $out"; fail=1; }
else fail=1; fi
# the engine's own archives (the first two lines of zn_app.link): no loader, no child process
for a in $(head -2 "$BUILD/zn_app.link"); do
  bad=$(nm -u "$a" 2>/dev/null | grep -E '^ *U? *_?(dlopen|fork|vfork|execv|execvp|execve|posix_spawn|posix_spawnp)$')
  [ -z "$bad" ] || { echo "$(basename "$a") references $(echo $bad | tr '\n' ' ')"; fail=1; }
done
[ $fail -eq 0 ] && echo "app library: ok"
exit $fail
