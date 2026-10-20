// The W3C Gamepad API of the web environment (ZN-574), read as a page does: navigator.getGamepads() at each frame and the two window events.
// Run by tests/t1/webenv_gamepad.sh: headless with pads.input (pads.out), with no input at all (no gamepad, no error), and by
// tests/t1/gamepad_window.sh in a window with the SDL virtual gamepad of ZINC_VIRTUAL_GAMEPAD (one line per change, without the frame
// numbers, which a window does not fix).
const numbered = !/./.test(globalThis.__host_sysEnv('ZINC_VIRTUAL_GAMEPAD'));
let frame = 0, last = '';
const say = (...a) => numbered ? console.log('frame', frame, ...a) : console.log(...a);
addEventListener('gamepadconnected', e => say('connected', e.gamepad.index, JSON.stringify(e.gamepad.id), e.gamepad.mapping, e.gamepad.buttons.length, e.gamepad.axes.length, e instanceof GamepadEvent, e.gamepad instanceof Gamepad));
addEventListener('gamepaddisconnected', e => say('disconnected', e.gamepad.index, e.gamepad.connected));
function step() {
  frame++;
  const pads = navigator.getGamepads();
  const now = pads.map(p => p === null ? 'null' : `pad ${p.index} buttons [${p.buttons.map((b, i) => b.pressed ? i + (b.value === 1 ? '' : '=' + b.value.toFixed(2)) : '').filter(s => s).join(' ')}] axes [${p.axes.map(v => v.toFixed(2)).join(' ')}]`).join(' | ');
  if (now !== last) { say(pads.length, 'in the list:', now); last = now; }
  if (frame === 4 && pads[1]) pads[1].vibrationActuator.playEffect('dual-rumble', { duration: 100, strongMagnitude: 1, weakMagnitude: 0.5 }).then(r => say('rumble', r));
  if (frame === 9) say('done,', pads.length, 'gamepads');
  requestAnimationFrame(step);
}
requestAnimationFrame(step);
