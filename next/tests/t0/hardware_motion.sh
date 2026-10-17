#!/bin/sh
# zinc:hardware's motion sensors (ZN-759, lib/std/hardware.ts): accelerometer() and gyroscope() are null on a desktop, and a simulated device's values
# (zinc run --simulate, ZINC_SIM_STATE) come back in m/s² and °/s; a console core answers the same queries from its HAL (the Vita's sceMotion,
# the 3DS's HID sensors).
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'EOF'
import { accelerometer, gyroscope } from 'zinc:hardware';
const a = accelerometer(), g = gyroscope();
console.log(a === null ? 'motion none' : `motion ${a.x} ${a.y} ${a.z}`);
console.log(g === null ? 'gyro none' : `gyro ${g.x} ${g.y} ${g.z}`);
EOF
printf 'can.motion=1\nmotion.x=-1.5\nmotion.y=9.81\nmotion.z=0.25\ncan.gyro=1\ngyro.x=10\ngyro.y=-20\ngyro.z=30\n' > "$tmp/state"
fail=0
got=$(cd "$tmp" && ZINC_HEADLESS=1 "$Z" run main.ts 2>&1 | grep -v '^  \|^zinc run')
[ "$got" = "$(printf 'motion none\ngyro none')" ] || { echo "hardware motion: a desktop answered: $got"; fail=1; }
got=$(cd "$tmp" && ZINC_SIM_STATE="$tmp/state" ZINC_HEADLESS=1 "$Z" run main.ts 2>&1 | grep -v '^  \|^zinc run')
[ "$got" = "$(printf 'motion -1.5 9.81 0.25\ngyro 10 -20 30')" ] || { echo "hardware motion: the simulated device answered: $got"; fail=1; }
[ $fail -eq 0 ] && echo "hardware motion: ok"
exit $fail
