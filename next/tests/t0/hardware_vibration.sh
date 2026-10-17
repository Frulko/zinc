#!/bin/sh
# Vibration (ZN-759): a pad's two motors are zinc:gfx gamepadRumble (low = the big motor, high = the small one: the DualShock 2's), true for a
# connected pad and false for an empty slot; a headless run records what it would shake in ZINC_DEVICE_LOG. The machine's own motor is
# zinc:hardware vibrate(): false on a desktop, heard by a simulated device (vibrate=MS in <state>.app).
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'EOF'
import { onFrame, frame, quit, gamepadRumble } from 'zinc:gfx';
import { vibrate } from 'zinc:hardware';
onFrame((dt: number) => {
  if (frame() === 2) console.log(`rumble ${gamepadRumble(0, 0.25, 1, 200)} ${gamepadRumble(1, 1, 1, 100)} vibrate ${vibrate(120)}`);
  if (frame() === 4) quit();
});
EOF
printf '0 gamepad 0 DualShock 2\n' > "$tmp/input"
fail=0
got=$(cd "$tmp" && ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_INPUT="$tmp/input" ZINC_DEVICE_LOG="$tmp/log" "$Z" run main.ts 2>&1 | grep '^rumble')
[ "$got" = "rumble true false vibrate false" ] || { echo "hardware vibration: $got"; fail=1; }
grep -qx 'rumble 0 0.25 1.00 200' "$tmp/log" 2>/dev/null || { echo "hardware vibration: the rumble was not recorded: $(cat "$tmp/log" 2>/dev/null)"; fail=1; }
printf 'can.vibrate=1\n' > "$tmp/state"
got=$(cd "$tmp" && ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_SIM_STATE="$tmp/state" "$Z" run main.ts 2>&1 | grep '^rumble')
[ "$got" = "rumble false false vibrate true" ] || { echo "hardware vibration: the simulated device: $got"; fail=1; }
grep -q '^vibrate=120@' "$tmp/state.app" 2>/dev/null || { echo "hardware vibration: the simulated device did not hear vibrate(120)"; fail=1; }
[ $fail -eq 0 ] && echo "hardware vibration: ok"
exit $fail
