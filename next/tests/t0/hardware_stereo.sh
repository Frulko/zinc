#!/bin/sh
# zinc:hardware's stereoscopic screen (ZN-759, lib/std/hardware.ts): a screen without 3D answers depth -1 and refuses setStereo; a simulated 3DS
# gives its slider's depth, hears the program ask for a picture per eye (stereo=1 in <state>.app) and draws one eye (stereoEye 0). The 3DS's
# HAL alternates the eyes (tests/t2/console_emulators.sh and the hardware-n3ds demo).
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "import { stereoDepth, setStereo, stereoEye } from 'zinc:hardware';\nconsole.log('stereo ' + stereoDepth() + ' ' + setStereo(true) + ' ' + stereoEye());\n" > "$tmp/main.ts"
fail=0
got=$(cd "$tmp" && ZINC_HEADLESS=1 "$Z" run main.ts 2>&1 | grep '^stereo')
[ "$got" = "stereo -1 false 0" ] || { echo "hardware stereo: a flat screen answered: $got"; fail=1; }
printf 'can.stereo=1\nstereo.depth=0.6\n' > "$tmp/state"
got=$(cd "$tmp" && ZINC_SIM_STATE="$tmp/state" ZINC_HEADLESS=1 "$Z" run main.ts 2>&1 | grep '^stereo')
[ "$got" = "stereo 0.6 true 0" ] || { echo "hardware stereo: the simulated 3DS answered: $got"; fail=1; }
grep -qx 'stereo=1' "$tmp/state.app" 2>/dev/null || { echo "hardware stereo: the simulated device did not hear setStereo(true)"; fail=1; }
[ $fail -eq 0 ] && echo "hardware stereo: ok"
exit $fail
