import { createImage, beginImage, endImage, clear, polygon, rrect } from 'zinc:gfx';
import { Scene, Camera, Node, Mesh, Material, Light, sphere, cube, plane, render } from 'zinc:3d';
import { Hand, Vec3, Tracker } from 'zinc:leapmotion';
import { Game, Fruit, clamp, COLORS } from './model';

function material(color: u32, shine: number = 0): Material {
  const m = new Material(color); m.specular = shine > 0 ? 0x777777 : 0; m.shininess = shine; return m;
}
function cylinder(): Mesh {
  const p: number[] = [], n: number[] = [], indices: i32[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = i / 12 * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    for (let j = 0; j < 2; j++) { p.push(x); p.push(j * 2 - 1); p.push(z); n.push(x); n.push(0); n.push(z); }
    if (i < 12) { const b = i * 2; indices.push(b); indices.push(b + 1); indices.push(b + 2); indices.push(b + 1); indices.push(b + 3); indices.push(b + 2); }
  }
  return new Mesh(p, indices, n, [], []);
}
const ball = sphere(1, 12, 8), box = cube(1), tube = cylinder();
const white = material(0xe5eeed, 48), joint = material(0x75aaa6, 24), mint = material(0xb2efbd, 50), cyan = material(0x80dbe3, 50);
const floorMat = material(0x101b21), gridMat = material(0x263941), caseMat = material(0x344047, 70), glassMat = material(0x090d14, 90);
const red = material(0xff3d50); red.emissive = 0xa31420;
function node(parent: Node, mesh: Mesh, mat: Material): Node { return parent.add(new Node(mesh, mat)); }
/** Rotate local +Y onto the segment, keeping all geometry in millimetres. */
function between(n: Node, a: Vec3, b: Vec3, radius: number): void {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  n.visible = len > 0.1;
  if (!n.visible) return;
  n.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2).setScale(radius, len / 2, radius);
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const k = Math.sqrt(2 * (1 + uy));
  n.rotation = k < 0.001 ? [1, 0, 0, 0] : [uz / k, 0, -ux / k, k / 2];
}
class HandMesh {
  root: Node;
  bones: Node[] = [];
  joints: Node[] = [];
  palm: Node;
  constructor(parent: Node) {
    this.root = parent.add(new Node(null, null));
    for (let i = 0; i < 28; i++) this.bones.push(node(this.root, tube, white));
    for (let i = 0; i < 25; i++) this.joints.push(node(this.root, ball, joint));
    this.palm = node(this.root, ball, white);
  }
  update(h: Hand | null, offset: number): void {
    this.root.visible = h !== null;
    if (h === null) return;
    this.root.setPosition(offset, 0, 0);
    const color = h.right ? cyan : mint;
    this.palm.material = white;
    between(this.palm, h.wrist, h.palm, 23); this.palm.scale[2] = 9;
    let b = 0;
    for (let f = 0; f < 5; f++) {
      between(this.bones[b++], h.wrist, h.joints[f * 5 + 1], 4);
      for (let j = 1; j < 5; j++) {
        const n = this.bones[b++]; n.material = color;
        between(n, h.joints[f * 5 + j - 1], h.joints[f * 5 + j], j === 1 ? 5.8 : 5 - j * 0.5);
      }
      for (let j = 0; j < 5; j++) {
        const p = h.joints[f * 5 + j], n = this.joints[f * 5 + j];
        n.setPosition(p.x, p.y, p.z).setScale(j === 4 ? 4.5 : 5.6, j === 4 ? 4.5 : 5.6, j === 4 ? 4.5 : 5.6);
      }
    }
    between(this.bones[b++], h.elbow, h.wrist, 10);
    between(this.bones[b++], h.joints[6], h.joints[21], 3.5);
    for (; b < this.bones.length; b++) this.bones[b].visible = false;
  }
}
export class HandScene {
  scene = new Scene();
  camera = new Camera();
  yaw: number = 0.18;
  pitch: number = 0.3;
  distance: number = 540;
  private models: HandMesh[] = [];
  private sensors: Node[] = [];
  constructor() {
    this.scene.background = 0x0a1118; this.scene.ambient = 0x60666d;
    this.scene.lights.push(new Light(-0.4, -0.8, -0.4, 0xd5f3ff));
    this.scene.lights.push(new Light(0.7, -0.2, 0.4, 0x687faf));
    this.camera.near = 5; this.camera.far = 2200; this.camera.fov = 48; this.camera.pixelRatio = 1;
    node(this.scene, plane(1000, 750, 1, 1), floorMat).setPosition(0, -8, 0);
    for (let i = -10; i <= 10; i++) {
      node(this.scene, box, gridMat).setPosition(i * 40, -7, 0).setScale(0.7, 0.7, 640);
      node(this.scene, box, gridMat).setPosition(0, -7, i * 32).setScale(800, 0.7, 0.7);
    }
    for (let i = 0; i < 2; i++) {
      const root = this.scene.add(new Node(null, null)); this.sensors.push(root);
      node(root, box, caseMat).setScale(80, 11, 28);
      node(root, box, glassMat).setPosition(0, 6, 0).setScale(73, 2, 23);
      for (let j = -1; j <= 1; j++) node(root, ball, red).setPosition(j * 25, 8, 0).setScale(3, 1, 3);
    }
    for (let i = 0; i < 4; i++) this.models.push(new HandMesh(this.scene));
  }
  reset(): void { this.yaw = 0.18; this.pitch = 0.3; this.distance = 540; }
  orbit(dx: number, dy: number, zoom: number): void {
    this.yaw += dx * 0.008; this.pitch = clamp(this.pitch + dy * 0.006, -0.25, 1.35);
    this.distance = clamp(this.distance - zoom * 35, 360, 1100);
  }
  draw(tracker: Tracker, held: Hand[] = []): void {
    const two = tracker.devices.length > 1;
    for (let i = 0; i < 2; i++) { this.sensors[i].visible = i === 0 || two; this.sensors[i].setPosition(two ? (i === 0 ? -140 : 140) : 0, 0, 0); }
    let m = 0;
    for (let d = 0; d < tracker.devices.length; d++) for (const hand of (held.length > 0 ? held : tracker.devices[d].hands)) {
      if (hand.deviceId !== tracker.devices[d].id) continue;
      if (m < 4) this.models[m++].update(hand, two ? (d === 0 ? -140 : 140) : 0);
    }
    while (m < 4) this.models[m++].update(null, 0);
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.camera.setPosition(Math.sin(this.yaw) * horizontal, 160 + Math.sin(this.pitch) * this.distance, Math.cos(this.yaw) * horizontal).lookAt(0, 160, 0);
    render(this.scene, this.camera, 32, 196, 848, 534);
  }
}

/** Upper hemisphere plus a separate flat cut face: the two halves rotate independently. */
function hemisphere(): Mesh {
  const p: number[] = [], n: number[] = [], ix: i32[] = [];
  const rings = 10, sectors = 24;
  for (let r = 0; r <= rings; r++) for (let s = 0; s <= sectors; s++) {
    const phi = r / rings * Math.PI / 2, a = s / sectors * Math.PI * 2;
    const x = Math.sin(phi) * Math.cos(a), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(a);
    p.push(x); p.push(y); p.push(z); n.push(x); n.push(y); n.push(z);
    if (r < rings && s < sectors) { const v = r * (sectors + 1) + s; ix.push(v); ix.push(v + 1); ix.push(v + sectors + 1); ix.push(v + 1); ix.push(v + sectors + 2); ix.push(v + sectors + 1); }
  }
  return new Mesh(p, ix, n, [], []);
}
function cutFace(): Mesh {
  const p: number[] = [0, 0, 0], n: number[] = [0, -1, 0], ix: i32[] = [];
  for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2; p.push(Math.cos(a)); p.push(0); p.push(Math.sin(a)); n.push(0); n.push(-1); n.push(0); if (i < 32) { ix.push(0); ix.push(i + 1); ix.push(i + 2); } }
  return new Mesh(p, ix, n, [], []);
}
class FruitMesh {
  root: Node;
  whole: Node;
  halves: Node[] = [];
  shells: Node[] = [];
  faces: Node[] = [];
  leaf: Node;
  stem: Node;
  constructor(parent: Node, sphereMesh: Mesh, halfMesh: Mesh, faceMesh: Mesh, skin: Material) {
    this.root = parent.add(new Node(null, null));
    this.whole = node(this.root, sphereMesh, skin);
    this.stem = node(this.whole, box, material(0x735135)).setPosition(0, 1.12, 0).setScale(0.09, 0.3, 0.09);
    this.leaf = node(this.whole, ball, material(0x538634)).setPosition(0.28, 1.12, 0).setScale(0.38, 0.1, 0.16).setRotation(0, 0, 0.35);
    for (let i = 0; i < 2; i++) {
      const root = this.root.add(new Node(null, null)); this.halves.push(root);
      this.shells.push(node(root, halfMesh, skin));
      this.faces.push(node(root, faceMesh, skin));
    }
  }
}
export class FruitScene {
  scene = new Scene();
  camera = new Camera();
  private models: FruitMesh[] = [];
  private sparks: Node[] = [];
  private skins: Material[] = [];
  private wholeSkins: Material[] = [];
  private pulp: Material[] = [];
  constructor() {
    this.scene.background = 0x101a20; this.scene.ambient = 0x646066;
    this.scene.lights.push(new Light(-0.4, -0.7, -1, 0xffe5c9));
    this.scene.lights.push(new Light(0.6, 0.4, -0.3, 0x547596));
    this.camera.setPosition(0, 0, 1000).lookAt(0, 0, 0); this.camera.fov = 2 * Math.atan2(267, 1000) * 180 / Math.PI;
    this.camera.near = 5; this.camera.far = 2400; this.camera.pixelRatio = 1;
    const mesh = sphere(1, 24, 16), half = hemisphere(), face = cutFace();
    const inside: u32[] = [0xffe7b6, 0xffdb72, 0xff6780, 0xf0d7ff, 0x1d2930];
    for (let i = 0; i < 5; i++) {
      this.skins.push(material(i === 4 ? 0x253238 : COLORS[i], 18)); this.pulp.push(material(inside[i]));
      const skin = material(i === 4 ? 0x253238 : 0xffffff, 24);
      skin.specular = 0x303030;
      if (i < 4) skin.texture = fruitTexture(i);
      this.wholeSkins.push(skin);
    }
    for (let i = 0; i < 24; i++) this.models.push(new FruitMesh(this.scene, mesh, half, face, this.skins[0]));
    for (let i = 0; i < 100; i++) this.sparks.push(node(this.scene, ball, material(0xffffff)));
    const back = node(this.scene, box, material(0x15282c)); back.setPosition(0, -25, -160).setScale(1300, 850, 8);
    for (let i = -8; i <= 8; i++) node(this.scene, box, material(0x213d40)).setPosition(i * 75, 0, -150).setScale(1, 820, 1);
    for (let i = -4; i <= 4; i++) node(this.scene, box, material(0x213d40)).setPosition(0, i * 80, -150).setScale(1300, 1, 1);
  }
  draw(game: Game, time: number): void {
    const fruits = game.fruits;
    const attract = !game.running && fruits.length === 0;
    const count = attract ? 4 : Math.min(fruits.length, this.models.length);
    for (let i = 0; i < this.models.length; i++) {
      const m = this.models[i]; m.root.visible = i < count;
      if (i >= count) continue;
      const f = attract ? new Fruit(280 + i * 114, 355 + Math.sin(time * 1.5 + i) * 12, 0, 0, i, 40) : fruits[i];
      // Perspective depth changes while x/y and radius keep the exact same screen-space collision circle.
      const z = Math.sin(f.age * 1.4 + i * 0.8) * 70, k = (1000 - z) / 1000;
      m.root.setPosition((f.x - 456) * k, (463 - (f.y + 170)) * k, z).setScale(f.r * k, f.r * k, f.r * k).setRotation(0.2, f.angle, f.angle * 0.5);
      m.whole.visible = !f.cut; m.whole.material = this.wholeSkins[f.kind]; m.leaf.visible = f.kind !== 4;
      m.stem.material = f.kind === 4 ? red : materialStem;
      for (let h = 0; h < 2; h++) {
        const part = m.halves[h], side = h === 0 ? -1 : 1;
        part.visible = f.cut; part.setPosition(side * f.split * 2.4, -f.split * f.split * 2, 0).setRotation(f.split * side * 2.1, 0.25 + f.split * side, -side * Math.PI / 2);
        m.shells[h].material = this.skins[f.kind]; m.faces[h].material = this.pulp[f.kind];
      }
    }
    for (let i = 0; i < this.sparks.length; i++) {
      const n = this.sparks[i]; n.visible = i < game.sparks.length;
      if (!n.visible) continue;
      const p = game.sparks[i]; n.setPosition(p.x - 456, 463 - (p.y + 170), 50).setScale(2 + p.life * 3, 2 + p.life * 3, 2 + p.life * 3);
      if (n.material !== null) n.material.color = p.color;
    }
    render(this.scene, this.camera, 32, 196, 848, 534);
  }
}
const materialStem = material(0x735135);

function fruitTexture(kind: number): number {
  const texture = createImage(128, 64); beginImage(texture);
  clear(kind === 2 ? 0x91bd3c : COLORS[kind]);
  if (kind === 2) {
    for (let band = 0; band < 12; band++) {
      const p: number[] = [];
      for (let row = 0; row <= 8; row++) { p.push(band * 12 + Math.sin(row * 0.7 + band) * 2); p.push(row * 8); }
      for (let row = 8; row >= 0; row--) { p.push(band * 12 + 5 + Math.sin(row * 0.7 + band) * 2); p.push(row * 8); }
      polygon(p, 0x286738, 255);
    }
  } else {
    for (let i = 0; i < 180; i++) {
      const x = (i * 47) % 128, y = (i * 23) % 64;
      rrect(x, y, kind === 1 ? 1.5 : 1, 1, 0.5, kind === 1 ? 0xffe5aa : 0xffffff, 45);
    }
  }
  endImage(); return texture;
}
