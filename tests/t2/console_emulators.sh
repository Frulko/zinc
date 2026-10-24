#!/bin/sh
# The console runners (ZN-457, tools/console-run): the pure console core with a one-line program, built with each pinned SDK
# (tools/build-console-core), prints its line through PPSSPPHeadless (psp), Vita3K (vita), PCSX2 or Play! (ps2) and Azahar (n3ds) within 60 s;
# a program that never ends is stopped by the timeout (124, and it says so); a missing emulator exits 77 and names it. T2: windowed emulators
# (started in the background, never in front) and up to four SDK builds; run alone, after integration. A console whose SDK or emulator is
# missing is skipped and named. Then what each emulator shows (ZN-753): the graphical hello (targets/console/hello) for 120 frames gives its line
# and the emulator's own picture of the screen (PPSSPP's screenshot, PCSX2's save state; Vita3K and Azahar have no screenshot to call: the
# framebuffer the display scans out), the hello's blue on most of it and its yellow square; the text program on the graphics core keeps its
# line on the screen (the text screen) instead of a black screen or an app that closes; breakout's pad session built into the core ends on the
# interpreter's frame (tests/golden/breakout/pad.hashes) and prints its frame times; on the PSP and the 3DS the GPU replay's title screen is the
# software raster's. ZINC_CONSOLES="psp n3ds" tests only those consoles.
[ -z "$ZINC_CI" ] || { echo "skipped: windowed emulators and their screenshots need a desktop session (the console targets come with the cross-platform pass)"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
export ZINC="$Z"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0; ran=0
printf "import { platform } from 'zinc:sys';\nconsole.log('hello from zinc on ' + platform());\n" > "$tmp/hello.ts"
printf "let n = 0;\nwhile (n >= 0) { n = (n + 1) %% 1000; }\nconsole.log('never');\n" > "$tmp/hang.ts"
"$Z" --emit=zbc-bin "$tmp/hello.ts" "$tmp/hello.zbc" >/dev/null 2>&1 && "$Z" --emit=zbc-bin "$tmp/hang.ts" "$tmp/hang.zbc" >/dev/null 2>&1 || { echo "console emulators: the programs do not compile"; exit 1; }
# colors <png> <rrggbb> <rrggbb>: the share of the screen in the first colour (in thousandths) and the pixels of the second
colors() {
  sips -s format bmp "$1" --out "$tmp/shot.bmp" >/dev/null 2>&1 || { echo "0 0"; return; }
  python3 -I -c "
import struct,sys
d=open(sys.argv[1],'rb').read(); off,=struct.unpack_from('<I',d,10); w,h=struct.unpack_from('<ii',d,18); bpp,=struct.unpack_from('<H',d,28)
a,b=[(int(c[0:2],16),int(c[2:4],16),int(c[4:6],16)) for c in sys.argv[2:4]]; n=bpp//8; row=(w*n+3)//4*4; ka=kb=0
near=lambda p,q: all(abs(x-y)<=12 for x,y in zip(p,q))
for y in range(abs(h)):
  for x in range(w):
    i=off+y*row+x*n; p=(d[i+2],d[i+1],d[i])
    ka+=near(p,a); kb+=near(p,b)
print(ka*1000//(w*abs(h)), kb)" "$tmp/shot.bmp" "$2" "$3"
}
for c in ${ZINC_CONSOLES:-psp vita ps2 n3ds}; do
  out=$(tools/build-console-core "$c" --pure --embed "$tmp/hello.zbc" -B "build/console-test-$c" 2>&1) || { echo "console emulators: skip $c (no core: $(echo "$out" | tail -1))"; continue; }
  bin=$(echo "$out" | tail -1)
  got=$(tools/console-run "$c" "$bin" --timeout 60 2>&1); rc=$?
  [ $rc -eq 77 ] && { echo "console emulators: skip $c ($got)"; continue; }
  ran=$((ran + 1))
  [ $rc -eq 0 ] && [ "$got" = "hello from zinc on $c" ] || { echo "console emulators: $c exits $rc: $got"; fail=1; }
done
[ $ran -gt 0 ] || { echo "console emulators: no console could run"; exit 77; }
# the emulators' own pictures: the graphical hello, then the text program on the graphics core (the text screen)
for c in ${ZINC_CONSOLES:-psp vita ps2 n3ds}; do
  "$Z" pack --profile "$c" targets/console/hello -o "$tmp/hello-$c.zapp" >/dev/null 2>&1 && mkdir -p "$tmp/$c" && tar -xf "$tmp/hello-$c.zapp" -C "$tmp/$c" program.zbc resources.bin ||
    { echo "console emulators: zinc pack targets/console/hello for $c failed"; fail=1; continue; }
  out=$(tools/build-console-core "$c" --embed "$tmp/$c/program.zbc" "$tmp/$c/resources.bin" --frames 120 -B "build/console-test-$c-gfx" 2>&1) || { echo "console emulators: skip the $c picture (no core: $(echo "$out" | tail -1))"; continue; }
  got=$(tools/console-run "$c" "$(echo "$out" | tail -1)" --timeout 90 --shot "$tmp/$c.png" 2>&1 | grep -v "^loadmodule\|^RegisterLib\|^open \|^Pad\|^Frame rate\|^UpdateVSync\|^Set GS\|^\[EE\]"); rc=$?
  [ $rc -eq 77 ] && continue
  echo "$got" | grep -q "^hello from zinc on $c$" || { echo "console emulators: the graphical hello on $c printed: $got"; fail=1; }
  set -- $(colors "$tmp/$c.png" 203060 ffcc33)
  [ "$1" -gt 500 ] && [ "$2" -gt 200 ] || { echo "console emulators: the $c screen is not the hello's ($1/1000 blue, $2 yellow pixels)"; fail=1; }
  # packed as a person's program is (zinc pack bakes the fonts the text screen writes with)
  mkdir -p "$tmp/text/src" "$tmp/t-$c" && cp "$tmp/hello.ts" "$tmp/text/src/main.ts" && printf '{ "name": "text", "entry": "src/main.ts" }\n' > "$tmp/text/zinc.json"
  "$Z" pack --profile "$c" "$tmp/text" -o "$tmp/text-$c.zapp" >/dev/null 2>&1 && tar -xf "$tmp/text-$c.zapp" -C "$tmp/t-$c" program.zbc resources.bin || { echo "console emulators: zinc pack of the text program for $c failed"; fail=1; continue; }
  out=$(tools/build-console-core "$c" --embed "$tmp/t-$c/program.zbc" "$tmp/t-$c/resources.bin" --frames 60 -B "build/console-test-$c-gfx" 2>&1) || { echo "console emulators: $c: the text program does not build"; fail=1; continue; }
  got=$(tools/console-run "$c" "$(echo "$out" | tail -1)" --timeout 90 --shot "$tmp/$c-text.png" 2>&1 | grep "^hello from zinc"); rc=$?
  set -- $(colors "$tmp/$c-text.png" 101828 e0e6ff)
  [ "$got" = "hello from zinc on $c" ] && [ "$1" -gt 500 ] && [ "$2" -gt 20 ] || { echo "console emulators: $c: the text program's line is not on the screen ($got; $1/1000 background, $2 text pixels)"; fail=1; }
  # breakout's pad session built into the core (ZN-753): the console's last frame is the interpreter's (tests/golden/breakout/pad.hashes)
  "$Z" pack --profile "$c" examples/breakout -o "$tmp/breakout-$c.zapp" >/dev/null 2>&1 && mkdir -p "$tmp/b-$c" && tar -xf "$tmp/breakout-$c.zapp" -C "$tmp/b-$c" program.zbc resources.bin || { echo "console emulators: zinc pack breakout for $c failed"; fail=1; continue; }
  size=$(awk -v c="$c" '$1 == c { print $2 }' tests/golden/breakout/pad.hashes)   # zinc.json targets.<console> (the Vita: 480x272, doubled)
  out=$(tools/build-console-core "$c" --embed "$tmp/b-$c/program.zbc" "$tmp/b-$c/resources.bin" --frames 900 --size "$size" --input tests/golden/breakout/pad.input \
    --env ZINC_DETERMINISTIC=1 --env ZINC_FRAMEHASH=last --env ZINC_PROFILE=1 -B "build/console-test-$c-gfx" 2>&1) || { echo "console emulators: $c: breakout does not build"; fail=1; continue; }
  got=$(tools/console-run "$c" "$(echo "$out" | tail -1)" --timeout 180 2>&1)
  # the fourth column: the console's own frame where its FPU rounds otherwise (the PS2's EE rounds toward zero: colours one or two steps off)
  want=$(awk -v c="$c" '$1 == c { print ($4 != "" ? $4 : $3) }' tests/golden/breakout/pad.hashes)
  echo "$got" | grep -q "^zinc: framehash [0-9]* [0-9x]* $want$" || { echo "console emulators: $c: breakout's pad session does not end on the golden frame $want: $(echo "$got" | grep 'framehash\|error\|panic')"; fail=1; }
  echo "console emulators: $c breakout $(echo "$got" | sed -n 's/^zinc profile: \(frames=.*work.*\)$/\1/p')"
  # the GPU replay of the PSP and the 3DS (ZN-468, ZN-469) against their software raster: breakout's title screen (sprites, text) within 8 levels
  case $c in psp) gpu=ZINC_PSP_GPU ;; n3ds) gpu=ZINC_N3DS_GPU ;; *) continue ;; esac
  for v in 1 0; do
    out=$(tools/build-console-core "$c" --embed "$tmp/b-$c/program.zbc" "$tmp/b-$c/resources.bin" --frames 120 --size "$size" --env "$gpu=$v" -B "build/console-test-$c-gpu$v" 2>&1) &&
      tools/console-run "$c" "$(echo "$out" | tail -1)" --timeout 90 --shot "$tmp/$c-gpu$v.png" >/dev/null 2>&1
  done
  d=$(tools/pngdiff "$tmp/$c-gpu1.png" "$tmp/$c-gpu0.png" --tol 8 2>&1) || { echo "console emulators: $c: the GPU replay of breakout is not the software raster's frame: $d"; fail=1; }
done
# a hung program on the PSP: stopped at the timeout, with a clear message
case " ${ZINC_CONSOLES:-psp} " in *" psp "*) ;; *) [ $fail -eq 0 ] && echo "console emulators: ok ($ran consoles)"; exit $fail ;; esac
if out=$(tools/build-console-core psp --pure --embed "$tmp/hang.zbc" -B build/console-test-psp-hang 2>&1); then
  got=$(tools/console-run psp "$(echo "$out" | tail -1)" --timeout 5 2>&1); rc=$?
  [ $rc -eq 124 ] && echo "$got" | grep -q "did not finish in 5 s" || { echo "console emulators: a hung program exits $rc: $got"; fail=1; }
fi
got=$(tools/console-run ps2 "$tmp/hello.zbc" --emu nothing 2>&1); rc=$?
[ $rc -eq 77 ] && echo "$got" | grep -q "no nothing" || { echo "console emulators: a missing emulator exits $rc: $got"; fail=1; }
[ $fail -eq 0 ] && echo "console emulators: ok ($ran consoles)"
exit $fail
