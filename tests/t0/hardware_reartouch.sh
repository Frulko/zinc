#!/bin/sh
# zinc:hardware's rear touch pad (ZN-759, lib/std/hardware.ts): a simulated device's fingers ([[x, y, id]] in ZINC_SIM_STATE) come back as
# rearTouches(); on a desktop the right mouse button held over the window is a finger (here from a ZINC_INPUT script), and without either there
# is none. The Vita's HAL answers the same query from sceTouch's back port.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'EOF'
import { onFrame, frame, quit } from 'zinc:gfx';
import { rearTouches, hasRearTouch } from 'zinc:hardware';
onFrame((dt: number) => {
  if (frame() !== 3) return;
  const f = rearTouches();
  let s = `rear ${hasRearTouch()} ${f.length}`;
  for (const t of f) s += ` ${t.x},${t.y},${t.id}`;
  console.log(s);
  quit();
});
EOF
printf '0 move 40 50\n1 right-down\n' > "$tmp/input"
printf 'can.reartouch=1\nreartouch=[[100,120,0],[300,60,1]]\n' > "$tmp/state"
fail=0
got=$(cd "$tmp" && ZINC_HEADLESS=1 ZINC_FRAMES=10 "$Z" run main.ts 2>&1 | grep '^rear')
[ "$got" = "rear true 0" ] || { echo "hardware reartouch: with nothing held: $got"; fail=1; }
got=$(cd "$tmp" && ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_INPUT="$tmp/input" "$Z" run main.ts 2>&1 | grep '^rear')
[ "$got" = "rear true 1 40,50,99" ] || { echo "hardware reartouch: the right button is not a finger: $got"; fail=1; }
got=$(cd "$tmp" && ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_SIM_STATE="$tmp/state" "$Z" run main.ts 2>&1 | grep '^rear')
[ "$got" = "rear true 2 100,120,0 300,60,1" ] || { echo "hardware reartouch: the simulated pad answered: $got"; fail=1; }
[ $fail -eq 0 ] && echo "hardware reartouch: ok"
exit $fail
