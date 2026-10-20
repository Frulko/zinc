#!/bin/sh
# Pressure-sensitive buttons (ZN-759): zinc:gfx gamepadButtonValue gives how hard a button is pressed when the pad measures it (HalGamepad.value:
# the DualShock 2's face buttons, d-pad and shoulders), the trigger's travel for 6 and 7, else 1 for a held button. A ZINC_INPUT script presses
# with a value (`gbutton I B VALUE`), as the PS2's HAL fills it from libpad's pressure mode.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'EOF'
import { onFrame, frame, quit, gamepadButtonValue, gamepadButton, GamepadButton } from 'zinc:gfx';
onFrame((dt: number) => {
  if (frame() !== 3) return;
  console.log(`south ${gamepadButtonValue(0, GamepadButton.South)} ${gamepadButton(0, GamepadButton.South)} east ${gamepadButtonValue(0, GamepadButton.East)} ` +
    `trigger ${gamepadButtonValue(0, GamepadButton.RightTrigger)} up ${gamepadButtonValue(0, GamepadButton.Up)}`);
  quit();
});
EOF
printf '0 gamepad 0 DualShock 2\n1 gbutton 0 0 0.375\n1 gbutton 0 1\n1 gbutton 0 7 0.5\n' > "$tmp/input"
got=$(cd "$tmp" && ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_INPUT="$tmp/input" "$Z" run main.ts 2>&1 | grep '^south')
[ "$got" = "south 0.375 true east 1 trigger 0.5 up 0" ] || { echo "hardware pressure: $got"; exit 1; }
echo "hardware pressure: ok"
