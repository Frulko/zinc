// requestAnimationFrame on the frame loop and the host's input as DOM events (ZN-568): run with ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=10 and
// ZINC_INPUT=frames.input; the output is frames.out. Listeners sit where libraries put theirs: PixiJS hears pointermove on the document and
// pointerup on the window, Phaser its keys on the window, three's OrbitControls the pointer and the wheel on the canvas.
const log = (...a) => console.log(a.map(String).join(' '));
const canvas = document.createElement('canvas');
log('before', typeof requestAnimationFrame, document.readyState);
document.body.appendChild(canvas);

let frames = 0, last = -1;
const steps = [];
requestAnimationFrame(() => log('first callback, queued before the loop'));
cancelAnimationFrame(requestAnimationFrame(() => log('cancelled: never printed')));
function loop(t) {
  if (frames === 0) log('first frame', document.readyState, typeof t, t === performance.now());
  steps.push(last < 0 ? 0 : Math.round((t - last) * 100) / 100);
  last = t;
  if (++frames < 9) requestAnimationFrame(loop);
  else log('frames', frames, 'steps', steps.join(' '));
}
requestAnimationFrame(loop);
setTimeout(() => log('timer of 40 ms in frame', frames + 1, 'at', Math.round(Date.now())), 40);
window.addEventListener('load', () => log('load before the first callback', frames === 0));

const where = e => e.currentTarget === window ? 'window' : e.currentTarget === document ? 'document' : e.currentTarget.tagName.toLowerCase();
const mouse = e => log(`frame ${frames + 1}: ${e.type} on ${where(e)}, target ${e.target.tagName.toLowerCase()}, at ${e.clientX},${e.clientY}, button ${e.button}, buttons ${e.buttons}` +
  (e instanceof PointerEvent ? `, ${e.pointerType} ${e.pointerId} ${e.isPrimary}` : '') + (e.type.endsWith('move') ? `, moved ${e.movementX},${e.movementY}` : ''));
document.addEventListener('pointermove', mouse);
window.addEventListener('pointerup', mouse);
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); mouse(e); });
canvas.addEventListener('mousedown', mouse);
canvas.addEventListener('click', mouse);
canvas.addEventListener('contextmenu', e => { e.preventDefault(); mouse(e); });
canvas.addEventListener('wheel', e => log(`frame ${frames + 1}: wheel on canvas, delta ${e.deltaX},${e.deltaY}, mode ${e.deltaMode}, at ${e.clientX},${e.clientY}`), { passive: false });
const key = e => log(`frame ${frames + 1}: ${e.type} on ${where(e)}, target ${e.target.tagName.toLowerCase()}, key ${JSON.stringify(e.key)}, code ${e.code}, keyCode ${e.keyCode}, shift ${e.shiftKey}, repeat ${e.repeat}`);
window.addEventListener('keydown', key);
window.addEventListener('keypress', key);
const touch = e => log(`frame ${frames + 1}: ${e.type} on ${where(e)}, touches ${e.touches.length}, changed ${e.changedTouches.map(t => t.identifier + '@' + t.clientX + ',' + t.clientY).join(' ')}`);
for (const type of ['touchstart', 'touchmove', 'touchend']) canvas.addEventListener(type, touch);
