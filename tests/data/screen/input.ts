// tests/t1/device_screen.sh: a program for zinc device screen --live, red while the pointer is down and blue otherwise, that prints
// where the pointer went down, the text typed and the gamepad, so the test sees the viewer's input arrive.
import { onFrame, clear, pointerDown, pointerX, pointerY, keyCount, keyKind, keyName, KeyKind, gamepadConnected, gamepadName, gamepadButtons, isDown, Btn } from 'zinc:gfx';

let was = false, padSeen = false;
onFrame((dt: number) => {
  for (let i = 0; i < keyCount(); i++) if (keyKind(i) === KeyKind.Text) console.log(`typed ${keyName(i)}`);
  const down = pointerDown();
  if (down && !was) console.log(`down at ${Math.round(pointerX())} ${Math.round(pointerY())}`);
  was = down;
  if (!padSeen && gamepadConnected(0)) { padSeen = true; console.log(`pad ${gamepadName(0)} ${gamepadButtons(0)} ${isDown(Btn.Left) ? 'left' : 'not left'}`); }
  clear(down ? 0xcc3333 : 0x3366cc);
});
