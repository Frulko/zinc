// Adapted from Kubai087's PRO Threads (MIT); see LICENSE.upstream.
import { CELL, MAX_LETTERS, MAX_CELLS, TEXELS, ALPHABET, pack } from './upstream/letters.js';
import { VERT, FRAG } from './upstream/shader.js';
import { PALETTES } from './upstream/palettes.js';
import { state, EFFECTS } from './state.js';
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
if (!gl) throw new Error('PRO Threads needs WebGL 2');
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
function compile(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`a shader did not compile: ${gl.getShaderInfoLog(s)}`);
  return s;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`the shaders did not link: ${gl.getProgramInfoLog(program)}`);
gl.useProgram(program);

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'aPos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const u = {};
const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
for (let i = 0; i < count; i++) {
  const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
  u[name] = gl.getUniformLocation(program, name);
}

// The letters' sheets and fibres, read texel by texel.
const sheetTex = gl.createTexture();
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, sheetTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(u.uSheetTex, 0);

let layout = { width: 1, height: 1 };

// Packs the letters shown (the word, or the alphabet in rows) and uploads them.
function relayout() {
  const alphabet = state.view === 'alphabet';
  const text = [...(state.text || ' ')].slice(0, MAX_LETTERS).join('');
  const shape = {
    corner: state.corner,
    arch: state.arch,
    tip: state.tip,
    gap: alphabet ? state.spacing : 15,
    rowGap: alphabet ? state.rowGap : 0,
  };
  layout = pack(alphabet ? ALPHABET : [text], shape);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEXELS, MAX_CELLS, 0, gl.RGBA, gl.FLOAT, layout.data);
  gl.uniform4fv(u.uRows, layout.rows);
  gl.uniform1i(u.uRowCount, layout.nRows);
  gl.uniform1f(u.uRowPitch, layout.rowPitch);
  gl.uniform1f(u.uCell, CELL);
  gl.uniform1f(u.uGap, shape.gap / 1293);
  placeLetters();
}

// Fits the letters to the stage: three fill the original's frame, anything
// wider or taller is scaled down as a whole, and everything is centred.
// Stretched, each axis eases on to filling the stage on its own. pixels:
// the height of the whole image being drawn.
function placeLetters(pixels = canvas.height) {
  const aspect = state.width / state.height;
  const fit = Math.min(1, aspect / layout.width, 1 / layout.height);
  const t = state.stretch;
  const sx = fit ** (1 - t) * (aspect / layout.width) ** t;
  const sy = fit ** (1 - t) * (1 / layout.height) ** t;
  gl.uniform1f(u.uAspect, aspect);
  gl.uniform4f(u.uFrame, (aspect - layout.width * sx) / 2, (1 - layout.height * sy) / 2, sx, sy);
  gl.uniform2f(u.uPx, 1 / (pixels * sx), 1 / (pixels * sy));
}

function setUniforms() {
  gl.uniform1f(u.uDensity, state.density);
  gl.uniform1f(u.uWarm, state.warm);
  gl.uniform1f(u.uGain, state.gain);
  gl.uniform1f(u.uSparkle, state.sparkle);
  gl.uniform4f(u.uMotion, state.breathe, state.swell, state.texture, state.rim);
  // How far the light falls (left, right of a slit) and the floors it settles to.
  gl.uniform4f(u.uShape, 0.285 * state.reach, 0.144 * state.reach, state.floorDim, state.floorLit);
  // How far and how strongly it rises above an end.
  gl.uniform2f(u.uEnd, 0.152, 0.35);
  // How sharply it falls (left, right), how much shorter it reaches below a
  // seam, and how much further the few long threads carry it.
  gl.uniform4f(u.uFall, 1.3, 1.17, 0.84, 0.69);
  const shadow = rgb(state.shadow);
  gl.uniform3fv(u.uRamp, [
    ...shadow.map((c) => c * 0.16), ...shadow, ...rgb(state.steel), ...rgb(state.silver), ...rgb(state.highlight),
  ]);
  gl.uniform3fv(u.uGlow, rgb(state.glow));
  gl.uniform3fv(u.uFibreCool, rgb(state.fibreCool));
  gl.uniform3fv(u.uFibreWarm, [...rgb(state.warmLight), ...rgb(state.warmMid), ...rgb(state.warmDeep)]);
  gl.uniform3fv(u.uBg, rgb(state.background));
}


let dirty = true, lightClock = 0, fibreClock = 0, previous = null;
let paletteIndex = 0, effectIndex = 0;
const palettes = Object.keys(PALETTES), effects = Object.keys(EFFECTS);
function resize() {
  canvas.width = Math.max(1, innerWidth);
  canvas.height = Math.max(1, innerHeight);
  state.width = canvas.width; state.height = canvas.height;
  gl.viewport(0, 0, canvas.width, canvas.height);
  placeLetters(); dirty = true;
}
function palette() {
  paletteIndex = (paletteIndex + 1) % palettes.length;
  Object.assign(state, PALETTES[palettes[paletteIndex]]);
  setUniforms(); dirty = true;
  console.log('palette', palettes[paletteIndex]);
}
function key(event) {
  if (event.repeat) return;
  if (event.key === ' ') { state.paused = !state.paused; console.log('paused', state.paused); }
  else if (event.key === 'ArrowRight') palette();
  else if (event.key === 'ArrowUp') {
    effectIndex = (effectIndex + 1) % effects.length;
    Object.assign(state, EFFECTS[effects[effectIndex]]); setUniforms(); dirty = true;
    console.log('effect', effects[effectIndex]);
  } else if (event.key === 'Tab') {
    event.preventDefault(); state.view = state.view === 'word' ? 'alphabet' : 'word'; relayout(); dirty = true;
  } else if (event.key === 'Enter') { state.text = 'PRO'; state.view = 'word'; relayout(); dirty = true; }
  else if (event.key === 'Backspace') { state.text = state.text.slice(0, -1); relayout(); dirty = true; }
  else if (/^[a-zA-Z ]$/.test(event.key)) {
    state.view = 'word'; state.text = (state.text + event.key.toUpperCase()).slice(-MAX_LETTERS);
    relayout(); dirty = true;
  }
}
addEventListener('keydown', key);
addEventListener('pointerdown', palette);
addEventListener('resize', resize);
gl.uniform4f(u.uTile, 0, 0, 1, 1);
relayout(); setUniforms(); resize();
console.log('PRO Threads / Zinc — Space pause · click / Right palette · Up effect · Tab A–Z · type letters · Enter reset');
let frames = 0;
function frame(now) {
  const dt = previous === null ? 0 : Math.min(0.1, Math.max(0, (now - previous) / 1000));
  previous = now;
  if (!state.paused) { lightClock += dt * state.speed; fibreClock += dt * state.fibrePace; dirty = true; }
  if (dirty) {
    gl.uniform1f(u.uTime, lightClock); gl.uniform1f(u.uFibreTime, fibreClock);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); dirty = false;
  }
  if (++frames === 1) {
    const error = gl.getError();
    if (error) throw new Error('PRO Threads WebGL error ' + error);
    console.log('pro-threads: shader ready');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
