#!/bin/sh
# zinc:audio on a console core (ZN-759, targets/console/audio_console.cpp): the core links the 'Audio' module of plugins/audio, so a program that makes
# sounds runs there unchanged. Built here with this machine's compiler and the headless HAL (no output: the 'null' backend), a tone and a PCM WAV
# play into mix(), a stopped voice goes silent, and a file it cannot decode says what a console plays.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
command -v cmake >/dev/null 2>&1 || { echo "console audio: no cmake"; exit 77; }
B=${ZN_CONSOLE_BUILD:-build/console-pure}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
{ [ -f "$B/CMakeCache.txt" ] || cmake -S targets/console -B "$B" -DZN_CONSOLE_GFX=OFF; } >"$tmp/build.log" 2>&1 && cmake --build "$B" -j 4 >>"$tmp/build.log" 2>&1 || { echo "console audio: the core does not build"; tail -20 "$tmp/build.log"; exit 1; }
core=$PWD/$B/zinc-core
cat > "$tmp/main.ts" <<'EOF'
import { tone, decode, mix, backend } from 'zinc:audio';
function peak(s: number[]): number { let m = 0; for (const v of s) m = Math.max(m, Math.abs(v)); return Math.round(m * 1000) / 1000; }
const beep = tone(440, 0.1, 'square');
console.log(`backend ${backend()} duration ${Math.round(beep.duration * 1000)} ms`);
beep.play();
console.log(`square ${peak(mix(480))}`);
beep.stop();
console.log(`stopped ${peak(mix(480))}`);
// a WAV of 16-bit mono samples at 22050 Hz: 100 frames at a quarter of full scale
const wav: u8[] = [];
function word(v: i32, n: i32): void { for (let i = 0; i < n; i++) wav.push(((v >> (8 * i)) & 255) as u8); }
function tag(s: string): void { for (let i = 0; i < 4; i++) wav.push(s.charCodeAt(i) as u8); }
tag('RIFF'); word(36 + 200, 4); tag('WAVE'); tag('fmt '); word(16, 4); word(1, 2); word(1, 2); word(22050, 4); word(44100, 4); word(2, 2); word(16, 2);
tag('data'); word(200, 4); for (let i = 0; i < 100; i++) word(8192, 2);
const clip = decode(wav, 'quarter.wav');
console.log(`wav ok ${clip.ok} rate ${clip.sampleRate}`);
clip.play();
console.log(`wav ${peak(mix(100))}`);
const bad = decode([79, 103, 103, 83, 0, 0, 0, 0, 0, 0, 0, 0] as u8[], 'song.ogg');
console.log(`ogg ${bad.ok} ${bad.error}`);
EOF
"$Z" --emit=zbc-bin "$tmp/main.ts" "$tmp/main.zbc" >"$tmp/compile.log" 2>&1 || { echo "console audio: the program does not compile"; cat "$tmp/compile.log" | head; exit 1; }
# the PSP's and the PS2's profile (f32 numbers): samples() gives f64[] where the program's number[] is f32[], a converted copy (it named an alias it
# did not declare, '__T7')
"$Z" --profile psp --emit=zbc-bin "$tmp/main.ts" "$tmp/f32.zbc" >"$tmp/compile.log" 2>&1 || { echo "console audio: the program does not compile for the psp profile"; grep error "$tmp/compile.log" | head -3; exit 1; }
got=$(cd "$tmp" && "$core" main.zbc 2>&1 | sed '1d;$d')
want='backend null duration 100 ms
square 0.5
stopped 0
wav ok true rate 22050
wav 0.25'
ogg=$(echo "$got" | grep '^ogg')
got=$(echo "$got" | grep -v '^ogg\|^zinc:audio: ')
fail=0
[ "$got" = "$want" ] || { echo "console audio: the mix differs:"; echo "$got"; fail=1; }
echo "$ogg" | grep -q '^ogg false .*WAV' || { echo "console audio: an Ogg file: $ogg"; fail=1; }
[ $fail -eq 0 ] && echo "console audio: ok"
exit $fail
