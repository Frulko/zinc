// The table as a 3D scene (zinc:3d), built from the table data alone: every mesh is generated from a path, an outline
// or a few numbers of the file (geometry.ts), or loaded from a model file the table names. The game then moves what
// moves: balls, flippers, the plunger, targets, spinners, and what lights up. Nothing here knows a rule or a score.
import { Scene, Camera, Node, Mesh, Material, Light, Shading, cube, sphere, parseObj, quatFromAxisAngle, quatMultiply } from 'zinc:3d';
import { Table, TableDef, LookDef, LayoutDef } from './format/table';
import { Solid, Polyline, tessellate, wall, track, wire, slab, lathe, plate, floor, prism, flipperOutline, rad } from './geometry';

export function rgb(hex: string): u32 { return parseInt(hex.slice(1), 16); }
/** A dark shade of a colour: a light that is off. */
function dim(hex: string): u32 {
  const c = rgb(hex);
  const r = ((c >> 16) & 255) * 0.2 + 10, g = ((c >> 8) & 255) * 0.2 + 10, b = (c & 255) * 0.2 + 12;
  return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
}
function meshOf(s: Solid): Mesh { return new Mesh(s.pos, s.idx, s.nrm, [], []); }

/** Something that can show its look's `glow`. */
class Glowing {
  node: Node;
  normal: Material;
  glow: Material | null;
  constructor(node: Node, normal: Material, glow: Material | null) { this.node = node; this.normal = normal; this.glow = glow; }
  set(on: boolean): void { this.node.material = on && this.glow !== null ? this.glow : this.normal; }
}

export class TableScene {
  scene: Scene = new Scene();
  camera: Camera = new Camera();
  private def: TableDef;
  private looks: Map<string, Material> = new Map<string, Material>();
  private glows: Map<string, Material> = new Map<string, Material>();
  private plain: Material;
  private dark: Material = new Material(0x0a0c14);
  private balls: Node[] = [];
  private ballMesh: Mesh;
  private ballLook: Material;
  private flippers: Node[] = [];
  private plunger: Node | null = null;
  private targets: Glowing[] = [];
  private bumpers: Glowing[] = [];
  private slingshots: Glowing[] = [];
  private spinners: Node[] = [];
  private spinnerYaw: number[][] = [];
  private lights: Material[] = [];
  private lightOn: u32[] = [];
  private lightOff: u32[] = [];

  constructor(table: Table) {
    const t = table.def;
    this.def = t;
    this.plain = this.materialOf({ id: '', color: '#b0b8c0', shading: 'smooth', specular: '#000000', shininess: 30, glow: '#000000', texture: '' });
    for (const l of t.looks) {
      this.looks.set(l.id, this.materialOf(l));
      if (l.glow !== '#000000') { const g = new Material(rgb(l.glow)); g.shading = Shading.Unlit; this.glows.set(l.id, g); }
    }
    this.scene.background = rgb(t.lighting.background);
    this.scene.ambient = rgb(t.lighting.ambient);
    for (const lamp of t.lighting.lamps) this.scene.lights.push(new Light(lamp.direction[0], lamp.direction[2], lamp.direction[1], rgb(lamp.color)));
    this.ballMesh = sphere(t.physics.ball.radius, 20, 12);
    this.ballLook = this.look(t.physics.ball.look);
    this.board(t);
    this.fixed(t, table);
    this.moving(t);
    this.lamps(t);
  }

  private materialOf(l: LookDef): Material {
    const m = new Material(rgb(l.color));
    m.shading = l.shading === 'flat' ? Shading.Flat : l.shading === 'unlit' ? Shading.Unlit : Shading.Smooth;
    m.specular = rgb(l.specular);
    m.shininess = l.shininess;
    // ponytail: `texture` is in the format and not drawn yet: the generated meshes carry no texture coordinates. With
    // them, the image of a table folder loads through zinc:gfx imageFromBytes
    return m;
  }
  private look(id: string): Material { const m = this.looks.get(id); return m === undefined ? this.plain : m; }
  private glow(id: string): Material | null { const m = this.glows.get(id); return m === undefined ? null : m; }
  private add(s: Solid, m: Material): Node { return this.scene.add(new Node(meshOf(s), m)); }

  private board(t: TableDef): void {
    const s = new Solid(), w = t.playfield.width, l = t.playfield.length;
    plate(s, [0, 0, w, 0, w, l, 0, l], 0);
    // its edges, so that the board has a thickness when seen from the side
    const edge = new Polyline();
    edge.closed = true;
    edge.add(0, 0); edge.add(w, 0); edge.add(w, l); edge.add(0, l);
    wall(s, edge, -2, 0, 0.02);
    this.add(s, this.look(t.playfield.look));
  }

  /** Everything that never moves, one mesh per look so that a table of a hundred walls is a handful of draws. */
  private fixed(t: TableDef, table: Table): void {
    const byLook = new Map<string, Solid>();
    const order: string[] = [];
    const of = (look: string): Solid => {
      let s = byLook.get(look);
      if (s === undefined) { s = new Solid(); byLook.set(look, s); order.push(look); }
      return s;
    };
    for (const w of t.walls) wall(of(w.look), tessellate(w.points, w.closed), w.z, w.z + w.height, w.thickness);
    for (const g of t.gates) {
      const s = of(g.look);
      slab(s, g.a[0], g.a[1], g.b[0], g.b[1], g.z + g.height - 0.3, g.z + g.height, 0.2);
      lathe(s, g.a[0], g.a[1], g.z, [[0.2, 0], [0.2, g.height], [0, g.height]], 8);
      lathe(s, g.b[0], g.b[1], g.z, [[0.2, 0], [0.2, g.height], [0, g.height]], 8);
    }
    for (const r of t.ramps) {
      const line = tessellate(r.points, false), s = of(r.look);
      if (r.style === 'wire') {
        const side = r.width / 2 + 0.12;
        for (const k of [1, -1]) { wire(s, line, r.profile, k * side * 0.55, 0, 0.12); wire(s, line, r.profile, k * side, r.wall, 0.12); }
      } else track(s, line, r.profile, r.width, r.thickness, r.wall, r.skirt ? t.physics.ball.radius * 2 + 0.4 : 0);
    }
    for (const f of t.floors) floor(of(f.look), tessellate(f.points, true), f.z, f.thickness);
    for (const k of t.kickers) lathe(of(k.look), k.at[0], k.at[1], k.z, [[k.radius, 0], [k.radius, 0.25], [k.radius + 0.45, 0.25], [k.radius + 0.45, 0]], 20);
    for (const sp of t.spinners) {
      const s = of(sp.look);
      lathe(s, sp.a[0], sp.a[1], sp.z, [[0.18, 0], [0.18, sp.height + 0.4], [0, sp.height + 0.4]], 8);
      lathe(s, sp.b[0], sp.b[1], sp.z, [[0.18, 0], [0.18, sp.height + 0.4], [0, sp.height + 0.4]], 8);
    }
    for (const look of order) this.add(byLook.get(look) as Solid, this.look(look));

    // the holes of kickers and the slots of rollovers: dark marks just above their level
    const marks = new Solid();
    for (const k of t.kickers) {
      const ring: number[] = [];
      for (let i = 0; i < 20; i++) { ring.push(k.at[0] + Math.cos(i * Math.PI / 10) * k.radius); ring.push(k.at[1] + Math.sin(i * Math.PI / 10) * k.radius); }
      plate(marks, ring, k.z + 0.03);
    }
    for (const r of t.rollovers) slab(marks, r.a[0], r.a[1], r.b[0], r.b[1], r.z, r.z + 0.04, 0.35);
    if (marks.triangles() > 0) { this.dark.shading = Shading.Unlit; this.add(marks, this.dark); }

    for (const m of t.models) {
      let mesh: Mesh;
      if (m.mesh !== '' && table.source !== null) mesh = parseObj(table.source.text(m.mesh));
      else if (m.shape === 'box') mesh = cube(1);
      else if (m.shape === 'sphere') mesh = sphere(0.5, 24, 14);
      else {
        const s = new Solid();
        lathe(s, 0, 0, 0, m.shape === 'cone' ? [[0.5, 0], [0, 1]] : [[0.5, 0], [0.5, 1], [0, 1]], 24);
        // a solid stands along z in table coordinates: here it is its own little table
        mesh = meshOf(s);
      }
      const n = this.scene.add(new Node(mesh, this.look(m.look)));
      n.setPosition(m.at[0], m.at[2], m.at[1]);
      n.setScale(m.scale[0], m.scale[2], m.scale[1]);
      const q = quatMultiply(quatFromAxisAngle(0, 1, 0, -rad(m.rotation[2])), quatMultiply(quatFromAxisAngle(0, 0, 1, rad(m.rotation[1])), quatFromAxisAngle(1, 0, 0, rad(m.rotation[0]))));
      n.rotation[0] = q[0]; n.rotation[1] = q[1]; n.rotation[2] = q[2]; n.rotation[3] = q[3];
    }
  }

  /** What the game moves or lights: one node each. */
  private moving(t: TableDef): void {
    for (const f of t.flippers) {
      const s = new Solid();
      prism(s, flipperOutline(f.length, f.baseRadius, f.tipRadius), f.height);
      const n = this.add(s, this.look(f.look));
      n.setPosition(f.pivot[0], f.z, f.pivot[1]);
      this.flippers.push(n);
    }
    this.setFlippersAtRest();
    {
      const p = t.plunger, s = new Solid(), h = p.width / 2;
      // the tip, and the rod behind it, along +x before the node is turned to the plunger's angle
      slab(s, -0.5, 0, 0.5, 0, 0, p.height, p.width);
      slab(s, -p.travel - 6, 0, -0.5, 0, p.height * 0.3, p.height * 0.7, h * 0.5);
      const n = this.add(s, this.look(p.look));
      const q = quatFromAxisAngle(0, 1, 0, -rad(p.angle));
      n.rotation[0] = q[0]; n.rotation[1] = q[1]; n.rotation[2] = q[2]; n.rotation[3] = q[3];
      this.plunger = n;
      this.setPlunger(0);
    }
    for (const b of t.bumpers) {
      const body = new Solid(), cap = new Solid();
      lathe(body, b.at[0], b.at[1], b.z, [[b.radius, 0], [b.radius, b.height * 0.7], [b.radius * 0.7, b.height * 0.7]], 20);
      lathe(cap, b.at[0], b.at[1], b.z + b.height * 0.7, [[b.radius * 1.15, 0], [b.radius * 1.15, b.height * 0.2], [b.radius * 0.8, b.height * 0.3], [0, b.height * 0.3]], 20);
      const n = this.add(body, this.look(b.look));
      this.add(cap, this.look(b.cap));
      this.bumpers.push(new Glowing(n, this.look(b.look), this.glow(b.look)));
    }
    for (const sl of t.slingshots) {
      const s = new Solid();
      slab(s, sl.a[0], sl.a[1], sl.b[0], sl.b[1], sl.z, sl.z + sl.height, sl.thickness);
      const n = this.add(s, this.look(sl.look));
      this.slingshots.push(new Glowing(n, this.look(sl.look), this.glow(sl.look)));
    }
    for (const g of t.targets) {
      const s = new Solid();
      // the face looks along `angle`: the plate lies across it
      const c = Math.cos(rad(g.angle)), sn = Math.sin(rad(g.angle)), h = g.width / 2;
      slab(s, g.at[0] + sn * h, g.at[1] - c * h, g.at[0] - sn * h, g.at[1] + c * h, 0, g.height, g.thickness);
      const n = this.add(s, this.look(g.look));
      n.setPosition(0, g.z, 0);
      this.targets.push(new Glowing(n, this.look(g.look), this.glow(g.look)));
    }
    for (const sp of t.spinners) {
      const dx = sp.b[0] - sp.a[0], dy = sp.b[1] - sp.a[1], len = Math.sqrt(dx * dx + dy * dy);
      const s = new Solid();
      // a plate hung on its axle: along x, hanging in z, turned about x by the game
      slab(s, -len / 2 + 0.3, 0, len / 2 - 0.3, 0, -sp.height / 2, sp.height / 2, 0.12);
      const n = this.add(s, this.look(sp.look));
      n.setPosition((sp.a[0] + sp.b[0]) / 2, sp.z + sp.height / 2 + 0.4, (sp.a[1] + sp.b[1]) / 2);
      this.spinners.push(n);
      this.spinnerYaw.push(quatFromAxisAngle(0, 1, 0, -Math.atan2(dy, dx)));
      this.setSpinner(this.spinners.length - 1, 0);
    }
  }

  private lamps(t: TableDef): void {
    for (const l of t.lights) {
      const s = new Solid(), z = l.z + 0.05, c = Math.cos(rad(l.angle)), sn = Math.sin(rad(l.angle));
      // a point of the shape, given along and across the light's angle
      const at = (out: number[], along: number, across: number): void => { out.push(l.at[0] + along * c - across * sn); out.push(l.at[1] + along * sn + across * c); };
      if (l.shape === 'round') {
        const ring: number[] = [];
        for (let i = 0; i < 16; i++) { ring.push(l.at[0] + Math.cos(i * Math.PI / 8) * l.size); ring.push(l.at[1] + Math.sin(i * Math.PI / 8) * l.size); }
        plate(s, ring, z);
      } else if (l.shape === 'arrow') {
        const head: number[] = [], stem: number[] = [];
        at(head, l.size, 0); at(head, 0, l.size * 0.75); at(head, 0, -l.size * 0.75);
        at(stem, 0, l.size * 0.3); at(stem, -l.size, l.size * 0.3); at(stem, -l.size, -l.size * 0.3); at(stem, 0, -l.size * 0.3);
        plate(s, head, z); plate(s, stem, z);
      } else {
        const bar: number[] = [];
        at(bar, l.size, l.size * 0.28); at(bar, -l.size, l.size * 0.28); at(bar, -l.size, -l.size * 0.28); at(bar, l.size, -l.size * 0.28);
        plate(s, bar, z);
      }
      const m = new Material(dim(l.color));
      m.shading = Shading.Unlit;
      this.add(s, m);
      this.lights.push(m);
      this.lightOn.push(rgb(l.color));
      this.lightOff.push(dim(l.color));
    }
  }

  // ---------------------------------------------------------------- what the game sets

  /** The eye of a layout. */
  setCamera(l: LayoutDef): void {
    const c = l.camera;
    this.camera.setPosition(c.position[0], c.position[2], c.position[1]).lookAt(c.target[0], c.target[2], c.target[1]);
    this.camera.fov = c.fov;
    this.camera.near = 4;
    this.camera.far = 2000;
    // looking straight down, "up" on the screen is up the table
    const flat = Math.abs(c.position[0] - c.target[0]) + Math.abs(c.position[1] - c.target[1]) < 0.001;
    this.camera.up[0] = 0; this.camera.up[1] = flat ? 0 : 1; this.camera.up[2] = flat ? -1 : 0;
  }
  /** Ball `i` at table (x, y, z) with the rotation the physics gives it (a quaternion in engine axes). */
  setBall(i: i32, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void {
    while (this.balls.length <= i) { const n = this.scene.add(new Node(this.ballMesh, this.ballLook)); n.visible = false; this.balls.push(n); }
    const n = this.balls[i];
    n.visible = true;
    n.setPosition(x, z, y);
    n.rotation[0] = qx; n.rotation[1] = qy; n.rotation[2] = qz; n.rotation[3] = qw;
  }
  hideBall(i: i32): void { if (i < this.balls.length) this.balls[i].visible = false; }
  /** Flipper `i` at an angle of the top view, in degrees. */
  setFlipper(i: i32, angle: number): void {
    const q = quatFromAxisAngle(0, 1, 0, -rad(angle)), r = this.flippers[i].rotation;
    r[0] = q[0]; r[1] = q[1]; r[2] = q[2]; r[3] = q[3];
  }
  setFlippersAtRest(): void { for (let i = 0; i < this.flippers.length; i++) this.setFlipper(i, this.def.flippers[i].rest); }
  /** The plunger pulled back by `pull` centimetres. */
  setPlunger(pull: number): void {
    const p = this.def.plunger, n = this.plunger;
    if (n !== null) n.setPosition(p.at[0] - Math.cos(rad(p.angle)) * pull, p.z, p.at[1] - Math.sin(rad(p.angle)) * pull);
  }
  /** A drop target up or down; a target lit or not. */
  setTarget(i: i32, up: boolean, lit: boolean): void {
    const g = this.def.targets[i];
    this.targets[i].node.setPosition(0, up ? g.z : g.z - g.height + 0.12, 0);
    this.targets[i].set(lit);
  }
  setBumper(i: i32, lit: boolean): void { this.bumpers[i].set(lit); }
  setSlingshot(i: i32, lit: boolean): void { this.slingshots[i].set(lit); }
  /** Spinner `i` turned by `turns` half turns. */
  setSpinner(i: i32, turns: number): void {
    const q = quatMultiply(this.spinnerYaw[i], quatFromAxisAngle(1, 0, 0, turns * Math.PI)), r = this.spinners[i].rotation;
    r[0] = q[0]; r[1] = q[1]; r[2] = q[2]; r[3] = q[3];
  }
  setLight(i: i32, on: boolean): void { this.lights[i].color = on ? this.lightOn[i] : this.lightOff[i]; }

  /** Draws the table in a box of the window; returns the triangles drawn. */
  render(x: number, y: number, w: number, h: number): i32 { return this.camera.render(this.scene, x, y, w, h); }
}
