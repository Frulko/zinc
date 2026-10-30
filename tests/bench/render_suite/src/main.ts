// The rendering scenes of tools/zbench: one program, one scene per launch (ZB_SCENE=<id>), each isolating one cost of the renderer. Every scene is
// deterministic (seeded, driven by the frame number, never by the clock) and draws the same commands on every backend, so a difference between
// two runs is the renderer's, not the program's. The engine's own profiler measures the frames: ZINC_PROFILE=json ZINC_PROFILE_SKIP=<warm-up>
// ZINC_FRAMES=<n> (tools/zbench sets them). ZB_SCENE=list prints the ids.
import { quit, onFrame, clear, rect, rrect, border, shadow, clip, unclip, font, drawText, gradient, line, polygon, width, height, imageFromPixels, updateImage, drawImage, profSection, setTransform, resetTransform } from 'zinc:gfx';
import * as sys from 'zinc:sys';
import { startUi, startUiSequence } from './ui_scenes';
import { openReport, closeSection } from './report';

let seed = 12345;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; }
// the surface's size is read at the first frame, not here: before the window exists width() is the default 320 x 240 on most displays (Android, iOS, the desktop), and only a
// KMS screen already gives its mode's size. A suite that drew in 320 x 240 on a 1280 x 704 screen measured another thing on each device.
let W = width(), H = height();
const fonts = [font('sans', 12), font('sans', 16), font('sans-bold', 24)];

// pre-computed so that the scene's own cost is the draw calls, not the random numbers
const N = 10000;
let qx: number[] = [], qy: number[] = [], qw: number[] = [], qh: number[] = [], qc: number[] = [];
function geometry(): void {
  W = width(); H = height(); seed = 12345;
  qx = []; qy = []; qw = []; qh = []; qc = [];
  for (let i = 0; i < N; i++) { qx.push(rnd(W)); qy.push(rnd(H)); qw.push(20 + rnd(40)); qh.push(20 + rnd(40)); qc.push(0x202020 + rnd(0xdfdfdf)); }
}

const ids: string[] = ['fill_opaque', 'fill_blend', 'quads_10k', 'rounded_shadow', 'gradients', 'text_static', 'text_churn', 'clip_nested', 'poly', 'scroll_list', 'image_update', 'card_small', 'card_big', 'card_zoom', 'image_fill_only', 'image_upload_only', 'damage_small', 'ui_scroll_fling', 'ui_scroll_wheel', 'ui_anim_transform', 'ui_anim_layout', 'ui_list_update'];

// texture upload: one 256 x 256 image changes every frame (a GPU display uploads only that image), drawn four times
const pix: u8[] = [];
for (let i = 0; i < 256 * 256 * 4; i++) pix.push(0);
let img = -1;

// every frame differs from the one before by one colour bit, so the whole frame is damaged and repainted (the worst case a screen can ask)
function bg(c: number, f: number): number { return c ^ (f & 1); }

// a photo card of examples/museum-table (a shadow, the paper, a 1024 x 768 photo), turned, drawn through one transform at `k` screens wide
let photo = -1;
function card(f: number, k: number): void {
  clear(bg(0x30302c, f));
  if (photo < 0) {
    const px: u8[] = [];
    for (let y = 0; y < 768; y++) for (let x = 0; x < 1024; x++) px.push(((x * 255) / 1024) as u8, ((y * 255) / 768) as u8, ((x ^ y) & 255) as u8, 255);
    photo = imageFromPixels(px, 1024, 768);
  }
  const d = (W * k) / 1044, a = 0.12 + f * 0.001, cos = Math.cos(a) * d, sin = Math.sin(a) * d;
  setTransform(cos, sin, -sin, cos, W / 2, H / 2);
  shadow(-522, -381, 1044, 860, 2, 14, 0x000000, 150);
  rrect(-522, -384, 1044, 860, 2, 0xf4efe6, 255);
  drawImage(photo, -512, -374, 1024, 768, 255, 0);
  resetTransform();
}

function scene(id: string, f: number): void {
  switch (id) {
    // fill rate: eight screens of opaque pixels; the same eight with blending
    case 'fill_opaque': clear(bg(0x000000, f)); for (let k = 0; k < 8; k++) rect(0, 0, W, H, 0x303030 + k * 0x101010 + (f & 1)); break;
    case 'fill_blend': clear(bg(0x203040, f)); for (let k = 0; k < 8; k++) rrect(0, 0, W, H, 0, 0xff8040 + k * 0x010203, 96); break;
    // command overhead: ten thousand small flat quads (B1)
    case 'quads_10k': clear(bg(0x101820, f)); for (let i = 0; i < N; i++) rect(qx[i], qy[i], qw[i], qh[i], qc[i]); break;
    // rounded corners, borders, shadows (the cost of anti-aliased shapes and blurs)
    case 'rounded_shadow':
      clear(bg(0xf0f0f0, f));
      for (let i = 0; i < 120; i++) { const x = qx[i] % (W - 90), y = qy[i] % (H - 90); shadow(x, y, 80, 60, 12, 16, 0x000000, 80); rrect(x, y, 80, 60, 12, qc[i], 255); border(x, y, 80, 60, 12, 2, 0x404040, 255); }
      break;
    case 'gradients': clear(bg(0x000000, f)); for (let i = 0; i < 40; i++) gradient(qx[i] % (W / 2), qy[i] % (H / 2), W / 2, H / 2, 16, qc[i], qc[i + 1], i % 2 === 0, 255); break;
    // text: a static wall (glyph cache hits), and a wall that changes every frame (glyph churn)
    case 'text_static': clear(bg(0xffffff, f)); for (let i = 0; i < 60; i++) drawText(fonts[i % 3], 8 + (i % 2) * (W / 2), 4 + Math.floor(i / 2) * 22, 'The quick brown fox jumps over the lazy dog 0123456789', 0x111111, 255, 0); break;
    case 'text_churn': clear(bg(0xffffff, f)); for (let i = 0; i < 60; i++) drawText(fonts[i % 3], 8 + (i % 2) * (W / 2), 4 + Math.floor(i / 2) * 22, 'Frame ' + f + ' line ' + i + ' value ' + ((f * 7919 + i * 104729) % 100003), 0x111111, 255, 0); break;
    // clipping: nested clips with children (B8)
    case 'clip_nested':
      clear(bg(0xeeeeee, f));
      for (let i = 0; i < 24; i++) { const x = (i % 6) * (W / 6), y = Math.floor(i / 6) * (H / 4); clip(x + 4, y + 4, W / 6 - 8, H / 4 - 8, 10); for (let k = 0; k < 20; k++) rect(x + ((i * 7 + k * 13) % 60), y + ((i * 11 + k * 17) % 60), 50, 50, qc[(i * 20 + k) % N]); unclip(); }
      break;
    case 'poly': clear(bg(0x102030, f)); for (let i = 0; i < 200; i++) { const x = qx[i], y = qy[i]; polygon([x, y, x + 40, y + 10, x + 30, y + 40, x + 5, y + 30], qc[i], 255); } break;
    // scrolling: a long list of rows moved by a few pixels each frame (the rows are static content, the damage covers the list)
    case 'scroll_list': {
      clear(bg(0xffffff, f));
      const off = (f * 7) % 44;
      for (let i = 0; i < 40; i++) { const y = i * 44 - off; rect(0, y, W, 43, i % 2 === 1 ? 0xf4f4f4 : 0xffffff); drawText(fonts[1], 12, y + 12, 'Row ' + (i + Math.floor(f * 7 / 44)) + ' of a long list', 0x222222, 255, 0); line(0, y + 43, W, y + 43, 0xdddddd); }
      break;
    }
    // damage tracking: a static decoration and one small square that moves, so only a small part of the frame changes
    case 'damage_small':
      clear(0x203040);
      for (let i = 0; i < 300; i++) rect(qx[i], qy[i], qw[i], qh[i], qc[i]);
      rect((f * 5) % (W - 40), 100 + (f % 7) * 20, 32, 32, 0xff2020);
      break;
    // image_update split in two: the JavaScript fill of the 256 x 256 buffer alone, and the upload alone (the buffer is not written)
    case 'image_fill_only': {
      clear(bg(0x202020, f));
      for (let i = 0; i < 256 * 256 * 4; i += 4) { pix[i] = ((f * 3 + i) & 255) as u8; pix[i + 1] = ((f + (i >> 8)) & 255) as u8; pix[i + 2] = 128; pix[i + 3] = 255; }
      break;
    }
    case 'image_upload_only': {
      clear(bg(0x202020, f));
      if (img < 0) img = imageFromPixels(pix, 256, 256);
      updateImage(img, pix);
      for (let k = 0; k < 4; k++) drawImage(img, 20 + k * 270, 20, 256, 256, 255, 0);
      break;
    }
    // a turned photo card (museum-table): a third of the screen, twice the screen, and growing from a fifth to three screens wide
    case 'card_small': card(f, 0.35); break;
    case 'card_big': card(f, 2); break;
    case 'card_zoom': card(f, 0.2 + (f % 240) / 240 * 2.8); break;
    case 'image_update': {
      clear(bg(0x202020, f));
      if (img < 0) img = imageFromPixels(pix, 256, 256);
      for (let i = 0; i < 256 * 256 * 4; i += 4) { pix[i] = ((f * 3 + i) & 255) as u8; pix[i + 1] = ((f + (i >> 8)) & 255) as u8; pix[i + 2] = 128; pix[i + 3] = 255; }
      updateImage(img, pix);
      for (let k = 0; k < 4; k++) drawImage(img, 20 + k * 270, 20, 256, 256, 255, 0);
      break;
    }
  }
}

const id = sys.env('ZB_SCENE');
if (id === 'list' || id.length === 0) {
  console.log('ZB_SCENES ' + ids.join(' '));
  quit();
} else if (id === 'all' || id.indexOf(',') >= 0 || sys.env('ZB_PER').length > 0) {   // a single scene asked with ZB_PER is a sequence of one
  // one launch, many scenes: ZB_SCENE=all or a comma list, ZB_PER frames each (warm-up included); a "zinc profile json" line per scene, tagged with its section
  const want: string[] = id === 'all' ? ids : id.split(',');
  const per = parseInt(sys.env('ZB_PER') || '270', 10);
  const maxs = parseInt(sys.env('ZB_MAXS') || '12', 10);   // a scene that takes longer than this (seconds) is closed with the frames it got: one slow scene must not hold the others
  const gfxIds: string[] = [];
  const uiIds: string[] = [];
  for (let i = 0; i < want.length; i++) {
    if (ids.indexOf(want[i]) < 0) { console.log('ZB_ERROR unknown scene ' + want[i]); quit(); }
    if (want[i].indexOf('ui_') === 0) uiIds.push(want[i]); else gfxIds.push(want[i]);
  }
  let gi = 0;
  let gf = 0;
  let ready = false;
  let el = 0;
  const afterGfx = (): void => { if (uiIds.length > 0) startUiSequence(uiIds, per, maxs, () => { console.log('ZB_DONE'); quit(); }); else { console.log('ZB_DONE'); quit(); } };
  if (gfxIds.length === 0) afterGfx();
  else onFrame((dt: number) => {
    if (!ready) { ready = true; geometry(); openReport(W + 'x' + H); console.log('ZB_SEQUENCE ' + want.join(' ') + ' per=' + per + ' ' + W + 'x' + H); }
    if (gi >= gfxIds.length) return;
    if (gf === 0) el = performance.now();   // the real clock: dt is capped by the engine and a scene at 1 frame a second would never reach its budget
    scene(gfxIds[gi], gf++);
    if (gf === per || (gf >= 8 && performance.now() - el > maxs * 1000)) { closeSection(gfxIds[gi], gi + 1 >= gfxIds.length && uiIds.length === 0); gi++; gf = 0; if (gi >= gfxIds.length) afterGfx(); }
  });
} else if (ids.indexOf(id) < 0) {
  console.log('ZB_ERROR unknown scene ' + id);
  quit();
} else {
  let frame = 0;
  console.log('ZB_SCENE ' + id + ' ' + W + 'x' + H);
  if (id.indexOf('ui_') === 0) startUi(id);   // the toolkit scenes own their frame loop (render)
  else onFrame((dt: number) => { if (frame === 0) { geometry(); console.log('ZB_SURFACE ' + W + 'x' + H); } scene(id, frame++); });
}
