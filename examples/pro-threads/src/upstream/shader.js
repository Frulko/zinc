/*
 * The wallpaper's shader. One full-screen pass: each pixel finds its row
 * and letter, traces itself back to the thread it lies on in each of that
 * letter's sheets, and shades it. See letters.js for how the sheets and
 * coloured threads are packed into uSheetTex.
 */
import { MAX_ROWS, SHEET_TEXELS } from './letters.js';

export const VERT = `#version 300 es
  in vec2 aPos;
  uniform vec4 uTile;         // the part of the stage drawn: offset, size
  out vec2 vUv;
  void main() {
    vUv = uTile.xy + vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5) * uTile.zw;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }`;

export const FRAG = `#version 300 es
  precision highp float;
  const int SHEET_TEXELS = ${SHEET_TEXELS};
  uniform highp sampler2D uSheetTex;
  uniform vec4 uRows[${MAX_ROWS}];
  uniform int uRowCount;
  uniform float uRowPitch;
  uniform float uAspect;      // the stage, width over height
  uniform vec4 uFrame;        // where the letters sit on it: offset, scale across and down
  uniform float uCell;
  uniform float uGap;
  uniform vec2 uPx;           // one pixel, in the letters' frame: across, down
  uniform float uTime;        // the light's clock
  uniform float uFibreTime;   // the coloured threads' clock
  uniform float uDensity;
  uniform float uWarm;
  uniform float uGain;
  uniform vec4 uShape;        // how far the light falls (dim, lit), the floors it settles to
  uniform vec2 uEnd;          // how far and how strongly it rises above an end
  uniform vec4 uFall;         // how sharply it falls (dim, lit), reach below a seam, long threads
  uniform vec4 uMotion;       // breathing, swell, thread texture, rim
  uniform float uSparkle;     // the scattered coloured threads
  uniform vec3 uRamp[5];      // black through navy and steel blue to silver white
  uniform vec3 uGlow;         // where the light ends
  uniform vec3 uFibreCool;    // a coloured fibre above where it warms
  uniform vec3 uFibreWarm[3]; // and as it warms: light, mid, deep
  uniform vec3 uBg;
  in vec2 vUv;
  out vec4 outColor;

  float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Smooth 1D and 2D value noise.
  float vn(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash(i), hash(i + 1.0), f);
  }
  float vn2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
               mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  vec3 ramp(float v) {
    // Highlights roll off softly instead of clipping, so threads stay
    // apart even where the light is brightest.
    v = max(v, 0.0);
    if (v > 0.7) v = 0.7 + 0.3 * (1.0 - exp(-(v - 0.7) / 0.3));
    if (v < 0.25) return mix(uRamp[0], uRamp[1], v / 0.25);
    if (v < 0.5) return mix(uRamp[1], uRamp[2], (v - 0.25) / 0.25);
    if (v < 0.75) return mix(uRamp[2], uRamp[3], (v - 0.5) / 0.25);
    return mix(uRamp[3], uRamp[4], (v - 0.75) / 0.25);
  }

  // 1 at the end (t = 0), 0 once t reaches 1. A thread offset by it runs
  // straight, then turns to lie flat along the end. Unlike a quarter
  // circle, which starts bending all at once, it eases into the turn (its
  // curvature grows from nothing), so corners read soft, as in the
  // original.
  float bendAt(float t) {
    float s = 1.0 - clamp(t, 0.0, 1.0);
    return 1.0 - sqrt(max(0.0, 1.0 - pow(s, 2.6)));
  }

  // The thread through (x, y) on a sheet: psi = left + (x - left - off) / scale.
  vec2 thread(vec4 a, vec4 b, vec4 c, float x, float y) {
    float bt = bendAt((y - a.z) / c.x);
    float bb = bendAt((a.w - y) / c.y);
    float off = b.x * bt + b.z * bb;
    float scale = 1.0 + ((b.y - b.x) * bt + (b.w - b.z) * bb) / (a.y - a.x);
    return vec2(a.x + (x - a.x - off) / scale, scale);
  }

  // One thread's brightness at u: its own level, with a soft edge where it
  // meets the next, as fine strands of light do.
  float strand(float at) {
    float id = floor(at);
    float h0 = hash(id * 1.37 + 3.1);
    float h1 = hash((id + 1.0) * 1.37 + 3.1);
    return mix(h0 * h0, h1 * h1, smoothstep(0.62, 1.0, fract(at)));
  }

  // A fibre warming up: white-hot, then the palette's light, mid and deep
  // warm colours, darkening at the very end. With the original's colours
  // (cream, amber, red) it runs as sampled off it: cream, yellow, amber,
  // orange, red, dark red.
  vec3 warmth(float s) {
    s = clamp(s, 0.0, 1.0);
    if (s < 0.18) return mix(vec3(0.98, 0.98, 0.95), uFibreWarm[0], s / 0.18);
    if (s < 0.5) return mix(uFibreWarm[0], uFibreWarm[1], (s - 0.18) / 0.32);
    if (s < 0.85) return mix(uFibreWarm[1], uFibreWarm[2], (s - 0.5) / 0.35);
    return mix(uFibreWarm[2], uFibreWarm[2] * 0.66, (s - 0.85) / 0.15);
  }

  // The colour of thread psi on sheet a ([left, right] x [top, bottom]).
  // dpsi: how much psi one pixel covers. steep: how flat the thread lies
  // here (its run across per unit down). edge: how far the pixel is from
  // the sheet's nearer side.
  vec3 shade(float psi, float dpsi, float steep, float edge, vec4 a, int flags, float y, float cap, int letter) {
    float side = (flags & 1) != 0 ? 1.0 : 0.0;
    bool restart = (flags & 2) != 0;
    float warmEnd = (flags & 4) != 0 ? 1.0 : 0.0;
    float down = restart ? y - a.z : y;
    float up = max(0.0, a.w - y);

    // Threads: discrete fine threads, each with its own brightness and
    // reach, over softer layers. Each thread is averaged over the pixel it
    // covers, so threads stay crisp without aliasing.
    //
    // Where the threads turn to lie flat, each one overlaps more of its
    // neighbours, like translucent strands laid over each other, so their
    // stripes melt into one smooth sheen and the layers add up brighter.
    // overlap runs 0 for an upright thread to 1 for a flat one.
    float k = 880.0 * uDensity / ${(2000 / 1293).toFixed(6)};
    float u = psi * k;
    float du = max(dpsi * k, 1e-4);
    float fineU = u * 1.15;
    float fdu = du * 1.15;
    float thread = 0.0;
    float threadReach = 0.0;
    for (int i = 0; i < 4; i++) {
      float at = fineU + fdu * (float(i) - 1.5) / 4.0;
      thread += strand(at);
      threadReach += pow(hash(floor(at) * 0.71 + 8.3), 4.0);
    }
    thread *= 0.25;
    threadReach *= 0.25;
    float overlap = 1.0 - inversesqrt(1.0 + steep * steep);
    // Past a few threads per pixel (or where they overlap), only their
    // average is left: 1/3 for the threads, 1/5 for their reach.
    float blend = max(smoothstep(1.5, 5.0, fdu), 0.55 * smoothstep(0.5, 1.0, overlap));
    thread = mix(thread, 1.0 / 3.0, blend);
    threadReach = mix(threadReach, 0.2, blend);
    // Weighted like the original: the fine threads are fairly gentle, and
    // most of the variation comes in broader bands of a few dozen pixels.
    float fine = mix(vn(u * 0.33 + 13.0), 0.5, smoothstep(2.0, 8.0, du) * 0.7 + 0.3 * blend);
    float s = 0.26 + 0.3 * thread + 0.16 * fine + 0.2 * vn(u * 0.12 + 7.0) + 0.2 * vn(u * 0.05 + 29.0);
    s = 0.64 + (s - 0.64) * uMotion.z;

    // Light falls from where each run starts and settles to a floor: a dim
    // one on the left of a slit, a mid one on the right, where the slab
    // also catches light again above where it ends. The curves are fitted
    // to the original; each thread varies around them a little, and its
    // reach breathes slowly so the light slides up and down.
    float time = uTime;
    float run = down + up;
    float own = vn(u * 0.9 + 17.0);
    float breathe = 1.0 + uMotion.x * 0.52 * (vn2(vec2(u * 0.04, time * 0.22)) - 0.5);
    // A soft swell of light rolling across the word, left to right.
    float swell = 1.0 + 0.12 * uMotion.y * sin(psi * 4.0 - time * 0.7);
    // A run whose light starts again partway down (below a seam) fades
    // faster than one hanging from the top edge.
    float again = restart ? uFall.z : 1.0;
    // A few threads carry their light much further down than the rest.
    float reachTop = mix(uShape.x, uShape.y, side) * again * mix(0.8, 1.2, own) * (1.0 + uFall.w * threadReach) * breathe * swell;
    float floorLight = mix(uShape.z, uShape.w, side);
    float fall = exp(-pow(down / reachTop, mix(uFall.x, uFall.y, side)));
    float reachEnd = uEnd.x * run * mix(0.8, 1.2, vn(u * 0.7 + 41.0)) * (2.0 - breathe);
    float rise = side * uEnd.y * exp(-pow(up / reachEnd, 1.3));
    // Where the threads turn over the top they catch the most light.
    float light = (floorLight + (1.0 - floorLight) * fall + rise) * (1.0 + 0.3 * cap + 0.15 * overlap);

    // Bands of light drifting along each thread, up on some, down on others.
    float dir = vn(u * 0.07 + 21.0) > 0.5 ? 1.0 : -1.0;
    float pace = mix(0.25, 1.0, vn(u * 0.11 + 5.0));
    float bands = vn2(vec2(u * 0.5, down * 4.0 - time * pace * dir));
    float flow = 0.74 + 0.52 * bands;

    // A fine bright rim along both sides of the sheet, a couple of pixels
    // wide however the side runs, so it follows the corners too.
    float rim = exp(-max(0.0, edge) / 0.0015) * uMotion.w;

    float v = (s * light * flow + rim * mix(0.45, 0.8, side) * (0.35 + light)) * uGain;
    vec3 col = ramp(v);

    // Scattered warm and blue threads, strongest low on the slabs. Each
    // takes its turn: every so often one fades out and another lights up,
    // so the colour wanders across the word.
    float ftime = uFibreTime;
    float group = floor(u * 0.25);
    float turn = ftime * 0.08 + hash(group * 3.1 + 5.0);
    float pick = hash(group + 91.0 + floor(turn) * 13.7);
    float shown = sin(3.14159 * fract(turn));
    float line = smoothstep(0.2, 0.0, abs(fract(u * 0.25) - 0.5)) * shown * uSparkle;
    float low = smoothstep(0.15, 0.55, down) * (0.4 + 0.8 * bands);
    if (pick > 1.0 - 0.004 * uWarm) {
      col = mix(col, warmth(0.3 + 0.6 * smoothstep(0.3, 0.9, down)), line * low * 0.4);
    } else if (pick < 0.01) {
      col = mix(col, mix(uFibreCool, vec3(1.0), 0.25), line * low * 0.45);
    }

    // The letter's own coloured threads: single glowing fibres, a couple of
    // pixels wide with a faint halo, lying along the thread they sit on.
    // Above where it warms each is blue-white or sky blue, then it runs
    // white-hot through cream, yellow, amber and orange to red and fades
    // out (or, if it cools again, back to white). Each lives for a while,
    // its colours sliding slowly down, then fades and lights up on another
    // thread of the letter. The first time round it sits where the
    // original has it, fully lit.
    // Squeezed across, a fibre gives up only part of its width.
    float squeeze = sqrt(uPx.x / uPx.y);
    for (int i = 0; i < 4; i++) {
      vec4 ac = texelFetch(uSheetTex, ivec2(SHEET_TEXELS + i * 3, letter), 0);
      if (ac.x > 100.0) break;
      vec4 heat = texelFetch(uSheetTex, ivec2(SHEET_TEXELS + i * 3 + 1, letter), 0);
      vec4 home = texelFetch(uSheetTex, ivec2(SHEET_TEXELS + i * 3 + 2, letter), 0);
      float life = ftime * (0.05 + 0.04 * hash(home.z * 7.1)) + 0.2 + 0.55 * hash(home.z * 3.3);
      float lap = floor(life);
      float age = fract(life);
      if (lap > 0.5) {
        float seed = home.z + lap * 1.7;
        ac.x = mix(home.x + 0.03, home.y - 0.03, hash(seed));
        if (abs(psi - ac.x) > 0.008 * squeeze) continue;
        ac.y = mix(0.03, 0.28, hash(seed + 2.9));
        ac.z = min(0.98, ac.y + mix(0.5, 0.9, hash(seed + 4.3)));
        ac.w = hash(seed + 6.1);
        heat.x = mix(ac.y, ac.z, mix(0.35, 0.65, hash(seed + 8.7)));
        heat.y = mix(heat.x, ac.z, mix(0.75, 1.0, hash(seed + 9.9)));
        heat.z = hash(seed + 11.3) < 0.2 ? 1.0 : 0.0;
        if (hash(seed + 13.1) < 0.2) heat.xy = vec2(2.0);
      }
      float d = abs(psi - ac.x) / squeeze;
      if (d > 0.008) continue;
      float fade = smoothstep(0.0, 0.18, age) * smoothstep(1.0, 0.8, age);
      // Its colours slide down while it lives.
      float yy = y - (age - 0.5) * 0.08;
      bool warms = heat.x < 1.5;
      bool cools = heat.z > 0.5;
      // Where the fibre is lit: in from its top, out at its bottom, or just
      // past its red end when it ends there.
      float stop = warms && !cools ? heat.y + 0.03 : ac.z;
      float lit = smoothstep(ac.y, ac.y + 0.06, yy) * smoothstep(stop, stop - 0.07, yy) * fade * uSparkle;
      if (lit <= 0.0) continue;
      // Its colour along its length.
      float t = warms ? (yy - heat.x) / max(0.01, heat.y - heat.x) : -1.0;
      if (cools) t = t < 0.3 ? t / 0.3 * 0.55 : 0.55 * (1.0 - (t - 0.3) / 0.7);
      float sky = ac.w * smoothstep(ac.y, ac.y + 0.18, yy) * (warms ? smoothstep(heat.x, heat.x - 0.14, yy) : 1.0);
      vec3 fibre = mix(mix(uFibreCool, vec3(1.0), 0.85), uFibreCool, sky * 0.85);
      if (t > 0.0) fibre = mix(vec3(0.98, 0.98, 0.95), warmth(t), mix(0.55, 1.0, uWarm));
      float core = 1.0 - smoothstep(0.0007, 0.0021, d);
      float halo = exp(-d / 0.0035) * (1.0 - core);
      col = mix(col, fibre, core * lit) + fibre * halo * lit * 0.3;
    }

    // Where the light ends it turns warm: a glowing band, cream above it.
    // The band sits right on the edge, where the surface turns away from
    // the light, so it replaces the threads rather than adding.
    float end = exp(-up / 0.0035);
    col = mix(col, col * vec3(1.06, 1.0, 0.9), warmEnd * exp(-up / 0.05) * uWarm);
    col = mix(col, uGlow, clamp(end * 1.3, 0.0, 1.0) * warmEnd * mix(0.4, 1.0, uWarm) * smoothstep(0.05, 0.2, down));
    return col;
  }

  float luma(vec3 c) { return dot(c, vec3(0.3, 0.6, 0.1)); }

  // Adds a letter's sheets at (x, y), and covered keeps how much of the
  // pixel they fill.
  void addLetter(int letter, float x, float y, inout vec3 col, inout float covered) {
    for (int k = 0; k < 4; k++) {
      vec4 a = texelFetch(uSheetTex, ivec2(k * 3, letter), 0);
      if (a.x > 100.0) break;
      if (y < a.z - uPx.y || y > a.w + uPx.y) continue;
      vec4 b = texelFetch(uSheetTex, ivec2(k * 3 + 1, letter), 0);
      vec4 c = texelFetch(uSheetTex, ivec2(k * 3 + 2, letter), 0);

      // The thread here, and how fast psi changes across and down, so
      // edges are smoothed over one pixel whichever way they run. grad is
      // per pixel, so the sides stay one pixel soft when the letters are
      // stretched.
      vec2 t = thread(a, b, c, x, y);
      float psi = t.x;
      float dx = 1.0 / t.y;
      float dy = (thread(a, b, c, x, y + uPx.y).x - psi) / uPx.y;
      float grad = length(vec2(dx * uPx.x, dy * uPx.y));
      float cover = smoothstep(-1.0, 1.0, (psi - a.x) / grad)
        * smoothstep(-1.0, 1.0, (a.y - psi) / grad)
        * smoothstep(-uPx.y, uPx.y, y - a.z)
        * smoothstep(-uPx.y, uPx.y, a.w - y);
      if (cover <= 0.0) continue;

      float cap = a.z < 0.01 ? exp(-(y - a.z) / 0.02) : 0.0;
      float edge = min(psi - a.x, a.y - psi) / grad * sqrt(uPx.x * uPx.y);
      vec3 sheet = shade(psi, abs(dx) * uPx.x + abs(dy) * uPx.y, abs(dy / dx), edge, a, int(c.z + 0.5), y, cap, letter) * cover;
      // Where sheets cross (over a slit, under a tip) they show through
      // each other like translucent strands, so both sets of threads and
      // both edges stay visible. The closer their brightness, the more
      // evenly they mix; a bright tip over a dark sheet stays bright.
      float near = min(luma(col), luma(sheet)) / max(max(luma(col), luma(sheet)), 1e-4);
      col = mix(max(col, sheet), (col + sheet) * 0.5, covered * cover * near);
      covered = max(covered, cover);
    }
  }

  void main() {
    // Into the letters' own frame, where a letter is one unit tall.
    float x = (vUv.x * uAspect - uFrame.x) / uFrame.z;
    float y = (vUv.y - uFrame.y) / uFrame.w;
    outColor = vec4(uBg, 1.0);

    // Which row, and which letter in it.
    int row = int(floor(y / uRowPitch));
    if (row < 0 || row >= uRowCount) return;
    vec4 line = uRows[row];
    y -= float(row) * uRowPitch;
    x -= line.x;
    float pitch = uCell + uGap;
    int slot = int(floor((x + uGap * 0.5) / pitch));
    if (slot < 0 || float(slot) >= line.z) return;
    int letter = int(line.y) + slot;

    // This letter, and its neighbour when the pixel is near a side, since
    // a foot's tip runs on under the next letter.
    vec3 col = vec3(0.0);
    float covered = 0.0;
    float left = x - float(slot) * pitch;
    for (int n = -1; n <= 1; n++) {
      int s = slot + n;
      if (s < 0 || float(s) >= line.z) continue;
      if (n == -1 && left > 0.06) continue;
      if (n == 1 && left < uCell - 0.06) continue;
      addLetter(int(line.y) + s, x, y, col, covered);
    }
    outColor = vec4(col + uBg * (1.0 - covered), 1.0);
  }`;
