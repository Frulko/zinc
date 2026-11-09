// Modifier keys as a game or an editor reads them: Shift, Control, Alt and Meta pressed alone are keydown and keyup events of their own
// (Phaser's SHIFT key, keyCode 16), every key and pointer event carries the held modifiers, getModifierState names them.
// Driven by modkeys.input: hold Shift, type a, add Control, a Control-click, let go of everything.
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
let frames = 0;
const mods = e => ['shiftKey', 'ctrlKey', 'altKey', 'metaKey'].filter(k => e[k]).join('+') || 'none';
for (const type of ['keydown', 'keyup'])
  window.addEventListener(type, e => console.log(`frame ${frames}: ${type} key=${e.key} code=${e.code} keyCode=${e.keyCode} location=${e.location} mods=${mods(e)} Shift=${e.getModifierState('Shift')} Control=${e.getModifierState('Control')}`));
for (const type of ['pointerdown', 'pointerup'])
  canvas.addEventListener(type, e => console.log(`frame ${frames}: ${type} mods=${mods(e)}`));
requestAnimationFrame(function tick() { frames++; requestAnimationFrame(tick); });
