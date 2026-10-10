// The 3D object viewer: an object of the collection turned in the light like a piece held in the hands. One finger turns it (and it keeps
// turning a little), two fingers bring it closer and move it; the points of interest stay on their place of the object at every angle, and
// a touch on one opens its description and brings the object round to show it. Two buttons: the lighting, the view of departure.
// The object turns, the camera and the lights stay: a view's yaw and pitch are where the camera would be around the object (yaw 0 in
// front of +z, 90 on the +x side), its distance is in radii of the object. The object stands upright for the visitor whichever side of
// the table they are at: the camera rolls with the visitor's frame, and the label, the panel and the buttons are laid out in that frame.
import { rrect, border, drawText, textWidth } from 'zinc:gfx';
import { clock, utf8Decode } from 'zinc:sys';
import { Scene, Camera, Node, Mesh, Material, Light, parseObj, sphere, quatFromAxisAngle, quatMultiply, Shading } from 'zinc:3d';
import { loadGltf } from 'zinc:3d/gltf';
import { Project, Media, Point, Colours, LIGHTS } from './project';
import { Fingers, Finger } from './touch';
import { Orbit } from './orbit';
import { Frame } from './frame';
import { drawPanel } from './panel';
import { sans, bold, wrap, leading } from './type';
import { word } from './words';
import { files } from './files';

/** The owner number of the fingers on the viewer. */
export const VIEWER: i32 = 3;
const FOV = 40;                 // degrees, vertical: at the format's default distance of 3.2 radii any object is whole in the box
const DEGREES_PER_UNIT = 0.35;  // how far a finger's travel turns the object
const MARK = 44;                // a point of interest takes a touch this far from its centre (table units)

/** The corners of the box around the vertices of an OBJ text: [minX, minY, minZ, maxX, maxY, maxZ]. */
function bounds(obj: string): number[] {
  const b: number[] = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30];
  let at: i32 = 0, seen = false;
  while (at < obj.length) {
    let end = obj.indexOf('\n', at);
    if (end < 0) end = obj.length;
    if (obj.charCodeAt(at) === 118 && obj.charCodeAt(at + 1) === 32) {   // "v "
      const p = obj.slice(at + 2, end).trim().split(' ');
      for (let i = 0; i < 3 && i < p.length; i++) { const v = parseFloat(p[i]); b[i] = Math.min(b[i], v); b[i + 3] = Math.max(b[i + 3], v); }
      seen = true;
    } else if (seen && obj.charCodeAt(at) === 118) break;   // the vertices come first: the rest is not read twice
    at = end + 1;
  }
  return b;
}

/** The same box for a glTF model, from the bounds its POSITION accessors must declare. `file` is a .glb or a .gltf of the assets.
 *  ponytail: the transforms of the nodes are not applied, which is right for a scan (one mesh at the origin); a model made of placed
 *  parts needs zinc:3d to give the bounds of the node loadGltf returns. */
function gltfBounds(file: string): number[] {
  let json = '';
  if (file.toLowerCase().endsWith('.glb')) {
    const d = files.bytes(file), n = d[12] | (d[13] << 8) | (d[14] << 16) | (d[15] << 24);   // header 12 bytes, then the JSON chunk: length, type, text
    json = utf8Decode(d.slice(20, 20 + n));
  } else json = files.text(file);
  const b: number[] = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30];
  const doc = JSON.parse(json);
  for (const mesh of doc.meshes) for (const prim of mesh.primitives) {
    const a = doc.accessors[prim.attributes.POSITION];
    for (let i = 0; i < 3; i++) { const lo: number = a.min[i], hi: number = a.max[i]; b[i] = Math.min(b[i], lo); b[i + 3] = Math.max(b[i + 3], hi); }
  }
  return b;
}

/** The meshes of a node and of what hangs under it, each once (several nodes may show one mesh). */
function meshes(n: Node, into: Mesh[]): void {
  const m = n.mesh;
  if (m !== null && into.indexOf(m) < 0) into.push(m);
  for (const c of n.children) meshes(c, into);
}

export class ObjectView extends Orbit {
  readonly media: Media;
  /** The box of the viewer on the table: centre and size, in table units. */
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  /** The point of interest whose description is open. */
  opened: Point | null = null;
  /** The sequence the button of a description asked for ('' for none: the caller goes there and empties it). */
  followed = '';
  /** The box of that button, in frame units ([] without one). */
  private button: number[] = [];
  light = 'studio';
  /** The camera moved off the object's centre by two fingers, in the object's units, along the screen: to the right and up. */
  panX = 0;
  panY = 0;
  /** Milliseconds spent drawing the object, and how many times (the measure of the task). */
  spent = 0;
  drawn: i32 = 0;
  private project: Project;
  private colours: Colours;
  private lang: string;
  private frame: Frame;
  private centre: number[] = [0, 0, 0];
  private radius = 1;
  private scene = new Scene();
  private camera = new Camera();
  private pivot = new Node(null, null);
  private recentring = false;
  private pinned = false;
  // the screen box of the last draw and the projection that goes with it
  private sx = 0;
  private sy = 0;
  private sw = 1;
  private sh = 1;
  private k = 1;
  /** Where `locate` found a place of the object: px, py in screen pixels, and whether it is on the side turned to the camera. */
  px = 0;
  py = 0;
  pfacing = false;

  /** `pins`: a small red ball on every point of interest, part of the object (the test of the projection looks for them). */
  constructor(project: Project, media: Media, colours: Colours, lang: string, frame: Frame, pins: boolean) {
    super();
    this.project = project; this.media = media; this.colours = colours; this.lang = lang; this.frame = frame;
    this.nearest = 1.3; this.farthest = 6; this.steepest = 80;
    // an OBJ with the texture the project names, or a glTF / GLB with its own materials
    let body: Node;
    let b: number[];
    if (media.file.toLowerCase().endsWith('.obj')) {
      const obj = files.text(media.file), skin = new Material(0xffffff);
      b = bounds(obj);
      if (media.texture.length > 0) skin.texture = files.picture(media.texture);
      skin.specular = 0x262626;   // a glaze: a discreet highlight
      skin.shininess = 48;
      body = new Node(parseObj(obj), skin);
    } else {
      b = gltfBounds(media.file);
      body = loadGltf(files.path(media.file));
    }
    this.centre = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    this.radius = Math.sqrt((b[3] - b[0]) * (b[3] - b[0]) + (b[4] - b[1]) * (b[4] - b[1]) + (b[5] - b[2]) * (b[5] - b[2])) / 2;
    this.pivot.add(body);
    body.setPosition(-this.centre[0], -this.centre[1], -this.centre[2]);   // the object turns about its centre
    this.pinned = pins;
    if (pins) {
      const red = new Material(0xff0000);
      red.shading = Shading.Unlit;
      const ball = sphere(this.radius * 0.012, 10, 6);
      for (const p of media.points) body.add(new Node(ball, red)).setPosition(p.at[0], p.at[1], p.at[2]);
    }
    this.scene.add(this.pivot);
    this.camera.fov = FOV;
    this.camera.near = this.radius * 0.05;
    this.camera.far = this.radius * 20;
    this.setLight(media.light);
    this.reset(false);
  }

  setLanguage(lang: string): void { this.lang = lang; }
  /** Frees the object's meshes and the picture it is drawn into: an editor's preview makes the viewer again for each state of the project.
   *  ponytail: the textures a glTF model brought are not freed (zinc:3d/gltf does not say which images it made); an OBJ's texture is its
   *  reader's. */
  dispose(): void {
    this.camera.dispose();
    const all: Mesh[] = [];
    meshes(this.pivot, all);
    for (const m of all) m.dispose();
  }
  /** The visitor's frame has turned: the object glides to where it belongs for that side, beside the open description. */
  turned(): void { this.recentring = true; }

  /** Back to the view of departure, at once or in a glide. */
  reset(smoothly: boolean): void {
    const v = this.media.view;
    if (smoothly) { this.glide(v.yaw, v.pitch, v.distance, 0.6); this.recentring = true; }
    else { this.place(v.yaw, v.pitch, v.distance); this.panX = 0; this.panY = 0; }
    this.opened = null; this.followed = ''; this.button = [];
  }

  /** One of the lighting presets of the format. The lights stay with the camera: turning the object moves it in the light. */
  setLight(name: string): void {
    this.light = name;
    const s = this.scene;
    s.lights = [];
    if (name === 'raking') {   // one low light from the side: the relief shows
      s.ambient = 0x1e1e1e;
      s.lights.push(new Light(-0.95, -0.1, -0.3, 0xfff0d8));
    } else if (name === 'flat') {   // even light, no modelling: the painted decoration reads best
      s.ambient = 0xb4b4b4;
      s.lights.push(new Light(0, 0, -1, 0x4c4c4c));
    } else {   // studio: a warm key from the upper left, a cool fill from the right
      s.ambient = 0x4a4a4a;
      s.lights.push(new Light(-0.45, -0.55, -0.7, 0xfff6ea));
      s.lights.push(new Light(0.7, -0.1, -0.5, 0x56606c));
    }
  }

  inside(x: number, y: number): boolean { return Math.abs(x - this.x) <= this.w / 2 && Math.abs(y - this.y) <= this.h / 2; }

  /** The camera's up on the screen for the visitor's side, as (x to the right, y up): the object stands upright for them. */
  private upX(): number { const s = this.frame.side; return s === 1 ? 1 : s === 3 ? -1 : 0; }
  private upY(): number { const s = this.frame.side; return s === 0 ? 1 : s === 2 ? -1 : 0; }
  /** Units of the object in one table unit, at the object's distance. */
  private perUnit(): number { return this.reach * this.radius * 2 * Math.tan(FOV * Math.PI / 360) / this.h; }

  /** One frame: the fingers that landed on the viewer and belong to nothing yet are its own; they turn, zoom and move the object. */
  update(dt: number, fingers: Fingers): void {
    const F = this.frame;
    for (const f of fingers.down) if (f.fresh && f.owner === 0 && this.inside(f.x, f.y)) f.owner = VIEWER;
    const held = fingers.of(VIEWER);
    if (held.length === 1) {   // the turn is the visitor's: a move to their right, wherever they stand
      const f = held[0], dx = F.dx(f.x - f.px, f.y - f.py), dy = F.dy(f.x - f.px, f.y - f.py);
      if (dx === 0 && dy === 0) this.hold(); else this.turn(-dx * DEGREES_PER_UNIT, dy * DEGREES_PER_UNIT, dt);
    } else if (held.length >= 2) {
      const a = held[0], b = held[1];
      const was = Math.sqrt((b.px - a.px) * (b.px - a.px) + (b.py - a.py) * (b.py - a.py)), is = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
      if (was > 8 && is > 8) this.closer(is / was);
      // the midpoint carries the object, on the screen
      const perUnit = this.perUnit(), far = this.radius * 0.8;
      this.panX = Math.min(far, Math.max(-far, this.panX - ((a.x + b.x) - (a.px + b.px)) / 2 * perUnit));
      this.panY = Math.min(far, Math.max(-far, this.panY + ((a.y + b.y) - (a.py + b.py)) / 2 * perUnit));
      this.hold();
      this.recentring = false;
    }
    this.step(dt, held.length > 0);
    if (this.recentring) {   // a glide brings the object back to the middle, or beside the description when one is open: to the visitor's left
      const ease = Math.exp(-8 * dt), aside = this.opened !== null ? 150 * this.perUnit() : 0, toX = F.tableDx(aside, 0), toY = -F.tableDy(aside, 0);
      this.panX = toX + (this.panX - toX) * ease; this.panY = toY + (this.panY - toY) * ease;
      if (Math.abs(this.panX - toX) + Math.abs(this.panY - toY) < this.radius * 0.0005 && !this.moving()) { this.panX = toX; this.panY = toY; this.recentring = false; }
    }
    for (const f of fingers.lifted) if (f.owner === VIEWER && f.tapped) this.tapped(f);
  }

  private tapped(f: Finger): void {
    const F = this.frame, o = this.opened, link = this.button, fx = F.x(f.x, f.y), fy = F.y(f.x, f.y);
    if (o !== null && link.length === 4 && fx >= link[0] && fx < link[0] + link[2] && fy >= link[1] && fy < link[1] + link[3]) { this.followed = o.to; return; }
    const b = this.buttons();
    if (Math.abs(fy - b[1]) <= 38) {
      if (Math.abs(fx - b[0]) <= b[2] / 2 + 10) { this.setLight(LIGHTS[(LIGHTS.indexOf(this.light) + 1) % LIGHTS.length]); return; }
      if (Math.abs(fx - b[3]) <= b[4] / 2 + 10) { this.reset(true); return; }
    }
    const sx = this.sx + (f.x - (this.x - this.w / 2)) * this.k, sy = this.sy + (f.y - (this.y - this.h / 2)) * this.k;
    let best: Point | null = null, nearest = MARK;
    for (const p of this.media.points) {
      this.locate(p.at);
      const d = Math.sqrt((this.px - sx) * (this.px - sx) + (this.py - sy) * (this.py - sy)) / this.k;
      if (this.pfacing && d < nearest) { nearest = d; best = p; }
    }
    this.opened = best;   // a touch elsewhere closes the description
    if (best !== null) { this.glide(best.view.yaw, best.view.pitch, best.view.distance, 0.6); this.recentring = true; }
  }

  /** Where the place `at` of the object is on the screen now: into px, py and pfacing. */
  locate(at: number[]): void {
    const yaw = -this.yaw * Math.PI / 180, pitch = this.pitch * Math.PI / 180;
    const x = at[0] - this.centre[0], y = at[1] - this.centre[1], z = at[2] - this.centre[2];
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw), z1 = z * Math.cos(yaw) - x * Math.sin(yaw);   // turned about the vertical axis
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);   // then tilted
    const ux = this.upX(), uy = this.upY(), right = x1 * uy - y2 * ux, up = x1 * ux + y2 * uy;   // along the rolled camera's right and up
    const depth = this.reach * this.radius - z2, focal = this.sh / 2 / Math.tan(FOV * Math.PI / 360);
    this.px = this.sx + this.sw / 2 + (right - this.panX) / depth * focal;
    this.py = this.sy + this.sh / 2 - (up - this.panY) / depth * focal;
    // ponytail: "turned to the camera" is judged from the centre of the object, right for a vase or a bust; a hollow or folded shape
    // needs the depth of the rendered frame, which zinc:3d does not give back
    this.pfacing = depth > 0 && z2 > 0.12 * Math.sqrt(x * x + y * y + z * z);
  }

  /** The inverse of `locate`: the line of sight under the screen point (px, py), in the object's own coordinates, as
   *  [ox, oy, oz, dx, dy, dz]: from the camera (o) through that pixel, o + d lying on the plane through the middle of the object that faces
   *  the camera. The storyboard editor finds with it the place of the object under a click. */
  ray(px: number, py: number): number[] {
    const yaw = -this.yaw * Math.PI / 180, pitch = this.pitch * Math.PI / 180, ux = this.upX(), uy = this.upY();
    const focal = this.sh / 2 / Math.tan(FOV * Math.PI / 360), far = this.reach * this.radius;
    const r = (px - this.sx - this.sw / 2) / focal, u = -(py - this.sy - this.sh / 2) / focal;
    const out: number[] = [];
    for (let i = 0; i < 2; i++) {   // the camera, then the point of the line on that plane
      const d = i * far, right = this.panX + r * d, up = this.panY + u * d, z2 = far - d;
      const x1 = right * uy + up * ux, y2 = up * uy - right * ux;   // out of the rolled camera
      const y = y2 * Math.cos(pitch) + z2 * Math.sin(pitch), z1 = z2 * Math.cos(pitch) - y2 * Math.sin(pitch);   // the tilt undone, then the turn
      out.push(x1 * Math.cos(yaw) - z1 * Math.sin(yaw) + this.centre[0]); out.push(y + this.centre[1]); out.push(x1 * Math.sin(yaw) + z1 * Math.cos(yaw) + this.centre[2]);
    }
    out[3] -= out[0]; out[4] -= out[1]; out[5] -= out[2];
    return out;
  }

  /** The viewer's box in the visitor's frame: [left, top, width, height], in frame units. */
  private box(): number[] {
    const F = this.frame, w = F.side % 2 === 1 ? this.h : this.w, h = F.side % 2 === 1 ? this.w : this.h;
    return [F.x(this.x, this.y) - w / 2, F.y(this.x, this.y) - h / 2, w, h];
  }
  /** The two buttons, in frame units: [light x, y, light width, reset x, reset width]. */
  private buttons(): number[] {
    const f = sans(18), light = textWidth(f, `${word('light', this.lang)} : ${word(this.light, this.lang)}`, 0) + 52, reset = textWidth(f, word('reset', this.lang), 0) + 52;
    const b = this.box(), left = b[0] + 28;
    return [left + light / 2, b[1] + b[3] - 44, light, left + light + 18 + reset / 2, reset];
  }

  /** Draws the object in its box; the table's origin is at (ox, oy) on the screen and one table unit is `k` pixels. */
  render(ox: number, oy: number, k: number): void {
    this.k = k;
    this.sx = Math.round(ox + (this.x - this.w / 2) * k); this.sy = Math.round(oy + (this.y - this.h / 2) * k);
    this.sw = Math.round(this.w * k); this.sh = Math.round(this.h * k);
    this.pivot.rotation = quatMultiply(quatFromAxisAngle(1, 0, 0, this.pitch * Math.PI / 180), quatFromAxisAngle(0, 1, 0, -this.yaw * Math.PI / 180));
    this.scene.background = this.colours.background;
    // the camera moves along its own right and up, which follow the visitor's side
    const ux = this.upX(), uy = this.upY(), cx = this.panX * uy + this.panY * ux, cy = -this.panX * ux + this.panY * uy;
    this.camera.up = [ux, uy, 0];
    this.camera.setPosition(cx, cy, this.reach * this.radius).lookAt(cx, cy, 0);
    const started = clock();
    this.camera.render(this.scene, this.sx, this.sy, this.sw, this.sh);
    this.spent += clock() - started; this.drawn++;
  }

  /** Draws what is written over the object, in the visitor's frame (which is on): its label, its points, the open description, the buttons. */
  drawOver(ox: number, oy: number, k: number): void {
    const F = this.frame, c = this.colours, L = this.lang, m = this.media, b = this.box();
    const left = F.ox + b[0] * k, top = F.oy + b[1] * k, bw = b[2] * k;

    // the label of the object, as in a showcase; it gives way to the object while a description is open
    const head = bold(26 * k), small = sans(16 * k), x = left + 28 * k;
    if (this.opened === null) {
      let y = top + 22 * k;
      for (const line of wrap(head, this.project.say(m.title, L), bw * 0.27, 4)) { drawText(head, x, y, line, c.text, 255, 0); y += leading(head); }
      const facts = [m.creator, this.project.say(m.date, L), this.project.say(m.medium, L)].filter((s: string) => s.length > 0).join(', ');
      y += 4 * k;
      for (const line of wrap(small, facts, bw * 0.27, 6)) { drawText(small, x, y, line, c.muted, 255, 0); y += leading(small); }
    }

    for (const p of m.points) {
      this.locate(p.at);
      if (!this.pfacing || this.pinned) continue;   // on the far side: it comes back when the object is turned
      // from the screen to the frame: the ring is drawn where the point is, whichever way the frame is turned
      const tx = (this.px - ox) / k, ty = (this.py - oy) / k, px = F.ox + F.x(tx, ty) * k, py = F.oy + F.y(tx, ty) * k;
      const open = p === this.opened, r = (open ? 17 : 14) * k;
      rrect(px - r, py - r, 2 * r, 2 * r, r, c.background, 150);
      border(px - r, py - r, 2 * r, 2 * r, r, Math.max(1.5, 2.5 * k), c.accent, 255);
      rrect(px - 5 * k, py - 5 * k, 10 * k, 10 * k, 5 * k, open ? c.accent : c.text, 255);
    }
    const o = this.opened;
    this.button = [];
    if (o !== null) {   // the description, on a panel at the right of the box
      const to = o.to.length > 0 ? this.project.sequence(o.to) : null;
      const link = drawPanel(left + bw - 428 * k, top + 130 * k, 400 * k, k, this.project.say(o.title, L), this.project.say(o.text, L), to !== null ? this.project.say(to.title, L) : '', c);
      if (link.length === 4) this.button = [(link[0] - F.ox) / k, (link[1] - F.oy) / k, link[2] / k, link[3] / k];
    } else if (m.points.length > 0) {
      const hint = word('points', L);
      drawText(small, left + bw - textWidth(small, hint, 0) - 28 * k, top + 30 * k, hint, c.muted, 255, 0);
    }
    const at = this.buttons(), f = sans(18 * k), labels: string[] = [`${word('light', L)} : ${word(this.light, L)}`, word('reset', L)];
    for (let i = 0; i < 2; i++) {
      const w = at[i === 0 ? 2 : 4] * k, h = 52 * k, bx = F.ox + at[i === 0 ? 0 : 3] * k - w / 2, by = F.oy + at[1] * k - h / 2;
      rrect(bx, by, w, h, h / 2, c.background, 235);
      border(bx, by, w, h, h / 2, Math.max(1, 1.5 * k), c.accent, 255);
      drawText(f, bx + (w - textWidth(f, labels[i], 0)) / 2, by + (h - leading(f)) / 2 + k, labels[i], c.text, 255, 0);
    }
  }
}
