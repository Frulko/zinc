// The 3D side: the course in 3 x 3 chunks of 8 x 8 cells, one mesh each, the ball, the gems, the goal ring and the shuttles
// as zinc:3d nodes; the board tilting around the ball; the camera behind it; the chunks out of view hidden; the HUD over it.
//
// A chunk's mesh is built from the course art (assets/models: Kenney's kits adapted in Blender, models.json) when it is
// there: the floor tiles in a checker, a side piece for each level of an exposed edge, the rails, the props and the goal
// gate, merged into one mesh (pieces.ts). Without it the game builds plain meshes of its own: coloured tops with the
// corners darkened beside a higher cell, the sides above a lower neighbour, one 64 x 64 checker texture.
import { width, height, text, rect, font, textWidth, imageFromPixels } from 'zinc:gfx';
import { Scene, Camera, Node, Mesh, Material, Light, Shading, Blend, sphere, torus, cube, loadModel, quatFromAxisAngle, quatMultiply } from 'zinc:3d';
import { Course, Phase, RADIUS, STEP_HEIGHT } from './course';
import { Builder, Pieces } from './pieces';

const CHUNK = 8;
const COLOURS: u32[] = [0xa98bf0, 0x5fc7e3, 0x8fdc6a, 0xf5cf63];   // the plain floors' colour by height
const INK: u32 = 0x1d1f33, WHITE: u32 = 0xffffff, GOLD: u32 = 0xffcd75, RED: u32 = 0xff6b6b, GREEN: u32 = 0x8fdc6a;
const ART_MARBLE_RADIUS = 0.2;

/** What the last frame drew. */
export class Stats { triangles: i32 = 0; draws: i32 = 0; }
export const stats = new Stats();

export function pixelScale(): i32 { return height() >= 500 ? 2 : 1; }

// ---------------------------------------------------------------- the course art's chunks
const DIRS: i32[] = [0, 1, 0, 1, 0, 90, 0, -1, 180, -1, 0, 270];   // (dc, dr, yaw): +Z, +X, -Z, -X

function artChunk(course: Course, art: Pieces, c0: i32, r0: i32): Mesh | null {
  const b = new Builder();
  const inside = (c: i32, r: i32): boolean => c >= c0 && c < c0 + CHUNK && r >= r0 && r < r0 + CHUNK;
  const level = (c: i32, r: i32): i32 => { const t = course.top(c, r); return t < -100 ? -1 : Math.round(t / STEP_HEIGHT); };
  for (let r = r0; r < Math.min(r0 + CHUNK, course.rows); r++)
    for (let c = c0; c < Math.min(c0 + CHUNK, course.cols); c++) {
      const L = level(c, r);
      if (L < 0) continue;
      const x = c + 0.5, z = r + 0.5, y = L * STEP_HEIGHT;
      const start = Math.floor(course.startX) === c && Math.floor(course.startZ) === r;
      const goal = Math.floor(course.goalX) === c && Math.floor(course.goalZ) === r;
      art.place(b, start ? 'floor_start' : goal ? 'floor_goal' : (r + c) % 2 === 0 ? 'floor' : 'floor_alt', x, y, z, 0);
      for (let k = 0; k < 12; k += 3) {   // one side piece per level down to the neighbour (the void: down to level -1)
        const n = level(c + DIRS[k], r + DIRS[k + 1]);
        for (let lv = L; lv > n; lv--) art.place(b, lv === L ? 'side' : 'side_dirt', x, lv * STEP_HEIGHT, z, DIRS[k + 2]);
      }
      if (goal) art.place(b, 'goal_gate', x, y, z, 0);
    }
  for (const w of course.rails) if (inside(w.c, w.r)) art.place(b, level(w.c, w.r) === 0 ? 'hedge' : 'fence', w.c + 0.5, course.top(w.c, w.r), w.r + 0.5, w.yaw);
  for (const p of course.props) if (inside(p.c, p.r)) art.place(b, p.piece, p.c + 0.5, course.top(p.c, p.r), p.r + 0.5, p.yaw);
  return b.mesh();
}

// ---------------------------------------------------------------- the game's own meshes, without the course art
function checker(): i32 {
  const px: u8[] = [];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const v: u8 = ((x >> 5) ^ (y >> 5)) === 0 ? 255 : 214;
    px.push(v); px.push(v); px.push(v); px.push(255);
  }
  return imageFromPixels(px, 64, 64);
}
function stripes(): i32 {   // the ball: a band around it shows it rolling
  const px: u8[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    const band = y >= 6 && y < 10, dot = (x >> 3) % 2 === 0;
    const c: u32 = band ? 0xffffff : dot ? 0xff5a5f : 0xe0383e;
    px.push((c >> 16) & 255); px.push((c >> 8) & 255); px.push(c & 255); px.push(255);
  }
  return imageFromPixels(px, 32, 16);
}

function shade(c: u32, k: number): u32 {
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
}

/** The faces of the cells c0..c0+7, r0..r0+7 that can be seen. */
function plainChunk(course: Course, c0: i32, r0: i32): Mesh | null {
  const b = new Builder();
  for (let r = r0; r < Math.min(r0 + CHUNK, course.rows); r++)
    for (let c = c0; c < Math.min(c0 + CHUNK, course.cols); c++) {
      const y = course.top(c, r);
      if (y < -100) continue;
      const base = COLOURS[Math.round(y / STEP_HEIGHT)];
      // the top, its corners darker where a higher cell stands beside them
      const corner = (i: i32, j: i32): u32 => {
        const higher = course.top(c + i * 2 - 1, r) > y || course.top(c, r + j * 2 - 1) > y || course.top(c + i * 2 - 1, r + j * 2 - 1) > y;
        return higher ? shade(base, 0.72) : base;
      };
      b.quad([c, y, r, c, y, r + 1, c + 1, y, r + 1, c + 1, y, r], [0, 1, 0], [0, 0, 0, 1, 1, 1, 1, 0], [corner(0, 0), corner(0, 1), corner(1, 1), corner(1, 0)]);
      // the four sides, from the lower neighbour's top (or a slab's depth over the void) up to this top
      const side = (nb: number): number => nb < -100 ? y - 0.6 : nb;
      const lo = shade(base, 0.5), hi = shade(base, 0.8);
      let n = side(course.top(c + 1, r));
      if (n < y) b.quad([c + 1, n, r, c + 1, y, r, c + 1, y, r + 1, c + 1, n, r + 1], [1, 0, 0], [0, n, 0, y, 1, y, 1, n], [lo, hi, hi, lo]);
      n = side(course.top(c - 1, r));
      if (n < y) b.quad([c, n, r + 1, c, y, r + 1, c, y, r, c, n, r], [-1, 0, 0], [0, n, 0, y, 1, y, 1, n], [lo, hi, hi, lo]);
      n = side(course.top(c, r + 1));
      if (n < y) b.quad([c, n, r + 1, c + 1, n, r + 1, c + 1, y, r + 1, c, y, r + 1], [0, 0, 1], [0, n, 1, n, 1, y, 0, y], [lo, lo, hi, hi]);
      n = side(course.top(c, r - 1));
      if (n < y) b.quad([c + 1, n, r, c, n, r, c, y, r, c + 1, y, r], [0, 0, -1], [0, n, 1, n, 1, y, 0, y], [lo, lo, hi, hi]);
    }
  return b.mesh();
}

function octahedron(): Mesh {
  const p: number[] = [0, 1, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, -1, 0, -1, 0];
  const i: i32[] = [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4, 5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1];
  return new Mesh(p, i, [], [], []);
}

// ---------------------------------------------------------------- the scene
/** The meshes of a node and its children: its draw calls. */
function parts(n: Node): i32 {
  let k: i32 = n.mesh !== null ? 1 : 0;
  for (const c of n.children) k += parts(c);
  return k;
}

class Chunk {
  node: Node; x: number; z: number;
  constructor(node: Node, x: number, z: number) { this.node = node; this.x = x; this.z = z; }
}

export class View {
  scene = new Scene();
  camera = new Camera();
  private tilt: Node = new Node(null, null);    // turns around the ball
  private board: Node = new Node(null, null);   // the course, moved so that the ball is at the tilt's origin
  private ball: Node;
  private sky: Node | null = null;
  private gems: Node[] = [];
  private platforms: Node[] = [];
  private goal: Node;
  private chunks: Chunk[] = [];
  private spin: number[] = [0, 0, 0, 1];
  private others: i32 = 0;   // the draws that are not chunks or gems
  private t = 0;

  constructor(course: Course) {
    const s = this.scene;
    s.background = 0x87ceeb;
    s.ambient = 0x5a6070;
    s.lights.push(new Light(-0.4, -1, -0.5, 0xffffff));
    s.add(this.tilt);
    this.tilt.add(this.board);
    const art = new Pieces(pixelScale() === 1 ? 'low' : 'high');
    const kenney = art.file('floor') !== '';
    const model = (name: string): Node | null => { const f = art.file(name); return f === '' ? null : loadModel(f); };
    // the course, chunk by chunk
    const plain = new Material(0xffffff);
    plain.vertexColors = true;
    if (!kenney) plain.texture = checker();
    for (let r0 = 0; r0 < course.rows; r0 += CHUNK)
      for (let c0 = 0; c0 < course.cols; c0 += CHUNK) {
        const m = kenney ? artChunk(course, art, c0, r0) : plainChunk(course, c0, r0);
        if (m !== null) this.chunks.push(new Chunk(this.board.add(new Node(m, plain)), c0 + CHUNK / 2, r0 + CHUNK / 2));
      }
    this.sky = model('sky');
    if (this.sky !== null) { s.add(this.sky); this.others += parts(this.sky); }
    const backdrop = model('backdrop');
    if (backdrop !== null) { backdrop.setPosition(course.cols / 2, 0, course.rows / 2); this.board.add(backdrop); this.others += parts(backdrop); }
    // the ball
    let ball = model('marble');
    if (ball !== null) { const k = RADIUS / ART_MARBLE_RADIUS; ball.setScale(k, k, k); }
    else {
      const m = new Material(0xffffff);
      m.texture = stripes();
      m.specular = 0x666666;
      ball = new Node(sphere(RADIUS, 16, 12), m);
    }
    this.ball = this.board.add(ball);
    // gems, the goal ring, the shuttles
    const gemMesh = octahedron(), gemMat = new Material(0x40e0ff);
    gemMat.emissive = 0x1a5a70;
    gemMat.shading = Shading.Flat;
    for (let i = 0; i < course.gems.length; i++) {
      let n = model('gem');
      if (n === null) { n = new Node(gemMesh, gemMat); n.setScale(0.18, 0.26, 0.18); }
      this.gems.push(this.board.add(n));
    }
    let ring = model('goal_ring');
    if (ring === null) {
      const m = new Material(0xffd24a);
      m.emissive = 0x604000;
      m.blend = Blend.Alpha;
      m.opacity = 0.8;
      ring = new Node(torus(0.38, 0.07, 18, 6), m);
      ring.position[1] = 0.6;   // the art's ring stands with its centre 0.6 over the floor: so does this one
    }
    this.goal = new Node(null, null);
    this.goal.add(ring);
    this.goal.setPosition(course.goalX, course.goalY, course.goalZ);
    this.board.add(this.goal);
    const slabMat = new Material(0xff9f43);
    for (let i = 0; i < course.platforms.length; i++) {
      let n = model('platform');   // the art's: one cell, its top at 0 and 0.3 deep
      if (n !== null) n.setScale(2, 0.2 / 0.3, 2);
      else { n = new Node(cube(1), slabMat); n.setScale(2, 0.2, 2); }
      this.platforms.push(this.board.add(n));
    }
    this.others += parts(this.ball) + parts(this.goal);
    for (const n of this.platforms) this.others += parts(n);
    this.camera.fov = 55;
    this.camera.far = 120;
  }

  /** Places everything for this frame and renders it. */
  draw(course: Course, tiltX: number, tiltZ: number, dt: number): void {
    this.t += dt;
    const b = course.ball;
    // the board tilts around the ball: towards +x it goes down when the ball should roll to +x
    this.tilt.setPosition(b.x, b.y, b.z);
    this.tilt.setRotation(tiltZ, 0, -tiltX);
    this.board.setPosition(-b.x, -b.y, -b.z);
    this.ball.setPosition(b.x, b.y, b.z);
    const sp = b.speed();
    if (sp > 1e-3) this.spin = quatMultiply(quatFromAxisAngle(b.vz / sp, 0, -b.vx / sp, sp * dt / RADIUS), this.spin);
    for (let k = 0; k < 4; k++) this.ball.rotation[k] = this.spin[k];
    for (let i = 0; i < course.gems.length; i++) {
      const g = course.gems[i], n = this.gems[i];
      n.visible = !g.taken;
      n.setPosition(g.x, g.y - 0.2 + Math.sin(this.t * 3 + i) * 0.06, g.z);
      n.setRotation(0, this.t * 2 + i, 0);
    }
    this.goal.setRotation(0, this.t, 0);
    for (let i = 0; i < course.platforms.length; i++) {
      const p = course.platforms[i];
      this.platforms[i].setPosition(p.x, 0.5, p.z);
    }
    // the camera: behind the ball and above it during the game, circling the course on the title screen
    const cam = this.camera;
    if (course.phase === Phase.Title) {
      const a = this.t * 0.12, cx = course.cols / 2, cz = course.rows / 2;
      cam.setPosition(cx + Math.sin(a) * 17, 13, cz + Math.cos(a) * 17).lookAt(cx, -1, cz);
      cam.up[0] = 0;
    } else {
      cam.setPosition(b.x, b.y + 3.2, b.z + 5).lookAt(b.x, b.y, b.z - 1.4);
      cam.up[0] = Math.sin(tiltX) * 0.6;   // leans with the board
    }
    if (this.sky !== null) this.sky.setPosition(cam.position[0], cam.position[1], cam.position[2]);
    this.cull();
    stats.triangles = cam.render(this.scene, 0, 0, width(), height());
  }

  /** Hides the chunks behind the camera or outside its view: a cone a little wider than the screen's diagonal. */
  private cull(): void {
    const cam = this.camera, p = cam.position, t = cam.target;
    let fx = t[0] - p[0], fy = t[1] - p[1], fz = t[2] - p[2];
    const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
    fx /= fl; fy /= fl; fz /= fl;
    const aspect = width() / height(), half = Math.tan(cam.fov * Math.PI / 360) * Math.sqrt(1 + aspect * aspect);
    const radius = CHUNK * 0.75 + 1;
    let draws: i32 = this.others;   // each part of a node is a draw
    for (const ch of this.chunks) {
      const dx = ch.x - p[0], dy = 0.75 - p[1], dz = ch.z - p[2];
      const along = dx * fx + dy * fy + dz * fz;
      const lx = dx - along * fx, ly = dy - along * fy, lz = dz - along * fz;
      ch.node.visible = along > -radius && Math.sqrt(lx * lx + ly * ly + lz * lz) < Math.max(0, along) * half + radius * 1.2;
      if (ch.node.visible) draws++;
    }
    for (const n of this.gems) if (n.visible) draws += parts(n);
    stats.draws = draws;
  }
}

// ---------------------------------------------------------------- the HUD
// ponytail: the grid font is drawn smaller than textWidth says above ~64 physical px (a Retina window at scale 6), so titles stop at 5
function big(s: i32): i32 { return s === 1 ? 3 : 5; }
/** `text` draws the font "grid" at 8 px times its scale: measured with it, a line is centred whatever the renderer's glyphs. */
function centered(y: number, s: string, color: u32, size: i32): void {
  text(Math.floor((width() - textWidth(font('grid', 8 * size), s, 0)) / 2), y, s, color, size);
}

let hudKey = '', hudText = '';
export function hud(course: Course): void {
  const s = pixelScale(), mid = height() / 2;
  if (course.phase === Phase.Title) {
    rect(0, 8 * s, width(), 66 * s, INK);   // the title over the sky, the course below it
    centered(14 * s, 'MARBLE TERRACES', GOLD, big(s));
    centered(44 * s, 'tilt the board, roll down to the ring,', WHITE, s);
    centered(56 * s, 'pick up the gems before the time runs out', WHITE, s);
    rect(0, height() - 34 * s, width(), 28 * s, INK);
    centered(height() - 30 * s, 'STICK / D-PAD / ARROWS tilt', GREEN, s);
    if (Math.floor(course.steps / 60) % 2 === 0) centered(height() - 18 * s, 'PRESS START', GOLD, s);
    return;
  }
  const key = `${Math.ceil(course.time)}/${course.taken}/${course.lives}`;
  if (key !== hudKey) {
    hudKey = key;
    hudText = `TIME ${Math.ceil(course.time)}   GEMS ${course.taken}/${course.gems.length}   LIVES ${course.lives}`;
  }
  text(5 * s, 5 * s, hudText, INK, s);
  text(4 * s, 4 * s, hudText, course.time < 10 ? RED : WHITE, s);
  if (course.phase === Phase.Won) {
    rect(0, mid - 30 * s, width(), 60 * s, INK);
    centered(mid - 22 * s, 'GOAL', GOLD, big(s));
    centered(mid + 8 * s, `gems ${course.taken}/${course.gems.length}   score ${course.score()}`, WHITE, s);
    centered(mid + 20 * s, 'PRESS START', WHITE, s);
  } else if (course.phase === Phase.Over) {
    rect(0, mid - 30 * s, width(), 60 * s, INK);
    centered(mid - 22 * s, course.time <= 0 ? 'TIME UP' : 'GAME OVER', RED, big(s));
    centered(mid + 14 * s, 'PRESS START', WHITE, s);
  }
}
