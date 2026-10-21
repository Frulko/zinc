// The frames per second Spline draws, written in the window's top left corner over each frame it renders: digits of a 3 x 5 pixel font
// drawn as rectangles (scissor and clear) in Spline's own WebGL context, right after its frame, so nothing else needs a shader or a texture.
// The GL state the counter changes is put back as it was: three.js keeps a copy of it and would draw wrong otherwise.
const FONT = {   // one string per glyph: 5 rows of 3 cells, '#' lit
  '0': '###' + '#.#' + '#.#' + '#.#' + '###', '1': '.#.' + '##.' + '.#.' + '.#.' + '###', '2': '###' + '..#' + '###' + '#..' + '###',
  '3': '###' + '..#' + '.##' + '..#' + '###', '4': '#.#' + '#.#' + '###' + '..#' + '..#', '5': '###' + '#..' + '###' + '..#' + '###',
  '6': '###' + '#..' + '###' + '#.#' + '###', '7': '###' + '..#' + '.#.' + '.#.' + '.#.', '8': '###' + '#.#' + '###' + '#.#' + '###',
  '9': '###' + '#.#' + '###' + '..#' + '###', 'f': '.##' + '#..' + '###' + '#..' + '#..', 'p': '###' + '#.#' + '###' + '#..' + '#..',
  's': '.##' + '#..' + '.#.' + '..#' + '##.', ' ': '...' + '...' + '...' + '...' + '...',
};
const CELL = 3;        // a font cell, in CSS pixels
const MARGIN = 8;      // from the window's corner
const PAD = 6;         // inside the dark box
const WINDOW_MS = 1000;

export function showFps(canvas) {
  const gl = canvas.getContext('webgl2');   // Spline's context: a canvas has one
  if (!gl) return;
  const times = [];
  let label = '-- fps';
  canvas.addEventListener('rendered', () => {
    const now = performance.now();
    times.push(now);
    while (times.length > 0 && times[0] < now - WINDOW_MS) times.shift();
    label = times.length + ' fps';
    draw(gl, label, window.devicePixelRatio || 1);
  });
}

function draw(gl, label, scale) {
  if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) return;   // Spline's frame went to a texture: not on screen
  const scissorOn = gl.isEnabled(gl.SCISSOR_TEST), box = gl.getParameter(gl.SCISSOR_BOX);
  const color = gl.getParameter(gl.COLOR_CLEAR_VALUE), mask = gl.getParameter(gl.COLOR_WRITEMASK);
  const cell = Math.max(1, Math.round(CELL * scale)), pad = Math.round(PAD * scale), margin = Math.round(MARGIN * scale);
  const w = label.length * 4 * cell - cell + 2 * pad, h = 5 * cell + 2 * pad;
  const top = gl.drawingBufferHeight - margin - h;   // GL counts rows from the bottom
  gl.enable(gl.SCISSOR_TEST);
  gl.colorMask(true, true, true, true);
  fill(gl, margin, top, w, h, 0, 0, 0, 0.7);
  for (let i = 0; i < label.length; i++) {
    const glyph = FONT[label[i]] || FONT[' '];
    for (let k = 0; k < 15; k++) {
      if (glyph[k] !== '#') continue;
      const x = margin + pad + (i * 4 + (k % 3)) * cell, y = top + pad + (4 - Math.floor(k / 3)) * cell;
      fill(gl, x, y, cell, cell, 0.4, 1, 0.4, 1);
    }
  }
  gl.clearColor(color[0], color[1], color[2], color[3]);
  gl.colorMask(mask[0], mask[1], mask[2], mask[3]);
  gl.scissor(box[0], box[1], box[2], box[3]);
  if (!scissorOn) gl.disable(gl.SCISSOR_TEST);
}

function fill(gl, x, y, w, h, r, g, b, a) {
  gl.scissor(x, y, w, h);
  gl.clearColor(r, g, b, a);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
