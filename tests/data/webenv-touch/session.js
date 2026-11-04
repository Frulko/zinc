const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const events = [], active = new Map();
let primary = null;
function assert(ok, message) { if (!ok) throw new Error(message); }
for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
  canvas.addEventListener(type, event => {
    if (event.pointerType !== 'touch') return;
    events.push(type);
    assert(event.pointerId !== 1, 'touch reused mouse id');
    if (type === 'pointerdown') {
      assert(!active.has(event.pointerId), 'touch ids collided');
      active.set(event.pointerId, event.isPrimary);
      if (event.isPrimary) primary = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
    } else {
      assert(active.has(event.pointerId), 'move/up changed pointer id');
      assert(event.isPrimary === active.get(event.pointerId), 'primary changed during contact');
    }
    assert(event.buttons === (type === 'pointerup' ? 0 : 1), 'wrong touch buttons');
    assert(event.pressure === (type === 'pointerup' ? 0 : .5), 'wrong touch pressure');
    if (type === 'pointerup') active.delete(event.pointerId);
  });
}
let mouseDown = 0;
canvas.addEventListener('mousedown', () => mouseDown++);
let frame = 0;
function run() {
  if (++frame === 10) {
    assert(events.filter(type => type === 'pointerdown').length === 2, 'missing finger down');
    assert(events.filter(type => type === 'pointerup').length === 2, 'missing finger up');
    assert(events.includes('pointermove') && active.size === 0 && primary !== null, 'incomplete touch lifecycle');
    assert(mouseDown === 0, 'touch also generated mouse down');
    assert(!canvas.hasPointerCapture(primary), 'capture survived touch release');
    console.log('webenv_touch: distinct fingers, stable ids, primary, movement and release PASS');
  }
  requestAnimationFrame(run);
}
requestAnimationFrame(run);
