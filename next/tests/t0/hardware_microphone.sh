#!/bin/sh
# zinc:hardware's microphone level (ZN-759, lib/std/hardware.ts): -1 on a machine that answers nothing, a simulated device's level (0..1, set in
# its control panel) otherwise; the 3DS's HAL answers from the MIC service's samples.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "import { microphoneLevel } from 'zinc:hardware';\nconsole.log('mic ' + microphoneLevel());\n" > "$tmp/main.ts"
fail=0
got=$(cd "$tmp" && ZINC_HEADLESS=1 "$Z" run main.ts 2>&1 | grep '^mic')
[ "$got" = "mic -1" ] || { echo "hardware microphone: a desktop answered: $got"; fail=1; }
printf 'can.microphone=1\nmicrophone.level=0.375\n' > "$tmp/state"
got=$(cd "$tmp" && ZINC_SIM_STATE="$tmp/state" ZINC_HEADLESS=1 "$Z" run main.ts 2>&1 | grep '^mic')
[ "$got" = "mic 0.375" ] || { echo "hardware microphone: the simulated device answered: $got"; fail=1; }
printf 'can.microphone=0\n' > "$tmp/state"
got=$(cd "$tmp" && ZINC_SIM_STATE="$tmp/state" ZINC_HEADLESS=1 "$Z" run main.ts 2>&1 | grep '^mic')
[ "$got" = "mic -1" ] || { echo "hardware microphone: a device without one answered: $got"; fail=1; }
[ $fail -eq 0 ] && echo "hardware microphone: ok"
exit $fail
