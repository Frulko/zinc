// The scene: a banded gas giant (its texture painted at runtime with zinc:gfx) with translucent rings, three moons, a space station
// with lit windows, an asteroid belt, the stars and the far sun with its additive glow. Lit by the sun as a directional light.
import { createImage, beginImage, endImage, rect, gradient } from 'zinc:gfx';
import { Scene, Node, Mesh, Material, Light, Shading, Blend, sphere, torus, cube } from 'zinc:3d';
import { rings, belt, starField } from './meshes';
import { SUN_DIRECTION, SUN_DISTANCE, SUN_COLOR, FILL_COLOR, AMBIENT, SPACE, PLANET_RADIUS, PLANET_SPIN, BELT_SPIN } from './constants';

/** The planet's bands, painted on the first frame (render-to-image needs the frame loop running). */
const bands = createImage(128, 64);
export function paintPlanet(): void {
  const COLORS: u32[] = [0xd9b98a, 0xb98d5e, 0xe8d2a6, 0xa86f45, 0xf0e0bc, 0xc49a6c, 0x8e5a3a, 0xe0c69a];
  beginImage(bands);
  gradient(0, 0, 128, 64, 0, 0xe6cfa4, 0xb88a5c, false, 255);
  let y = 2;
  for (let i = 0; y < 62; i++) {
    const h = 3 + (i * 7) % 6;
    rect(0, y, 128, h, COLORS[i % COLORS.length]);
    y += h + 1 + (i % 3);
  }
  rect(78, 38, 18, 5, 0xc0623c);   // the storm
  endImage();
}

interface Moon { node: Node; radius: number; speed: number; tilt: number; phase: number }

export class Orbit {
  readonly scene = new Scene();
  readonly station: Node;
  private planet: Node;
  private ringNode: Node;
  private beltNode: Node;
  private moons: Moon[] = [];
  private stationOrbit = 0;

  constructor() {
    const s = this.scene;
    s.background = SPACE;
    s.ambient = AMBIENT;
    s.lights.push(new Light(SUN_DIRECTION[0], SUN_DIRECTION[1], SUN_DIRECTION[2], SUN_COLOR));
    s.lights.push(new Light(-SUN_DIRECTION[0], 0.3, -SUN_DIRECTION[2], FILL_COLOR));

    const stars = new Material(0xffffff);
    stars.shading = Shading.Unlit; stars.vertexColors = true; stars.doubleSided = true;
    s.add(new Node(starField(), stars));

    // the sun, far away against the light's direction, with a glow added over the stars
    const sunAt: number[] = [-SUN_DIRECTION[0] * SUN_DISTANCE, -SUN_DIRECTION[1] * SUN_DISTANCE, -SUN_DIRECTION[2] * SUN_DISTANCE];
    const sunCore = new Material(0xfff6e0);
    sunCore.shading = Shading.Unlit;
    s.add(new Node(sphere(2.2, 16, 10), sunCore)).setPosition(sunAt[0], sunAt[1], sunAt[2]);
    // the glow: additive shells, fainter as they grow, for a soft edge
    const SHELLS: number[] = [3.2, 0.3, 4.6, 0.14, 6.8, 0.06];
    for (let i = 0; i < SHELLS.length; i += 2) {
      const glow = new Material(0xff9a3c);
      glow.shading = Shading.Unlit; glow.blend = Blend.Add; glow.opacity = SHELLS[i + 1];
      s.add(new Node(sphere(SHELLS[i], 16, 10), glow)).setPosition(sunAt[0], sunAt[1], sunAt[2]);
    }

    const surface = new Material(0xffffff);
    surface.texture = bands;
    surface.specular = 0x202020; surface.shininess = 12;
    this.planet = s.add(new Node(sphere(PLANET_RADIUS, 32, 20), surface));
    this.planet.setRotation(0.12, 0, 0);

    const ringMat = new Material(0xffffff);
    ringMat.shading = Shading.Unlit; ringMat.vertexColors = true; ringMat.doubleSided = true;
    ringMat.blend = Blend.Alpha; ringMat.opacity = 0.75;
    this.ringNode = s.add(new Node(rings(64), ringMat));
    this.ringNode.setRotation(0.12, 0, 0.06);

    const rock = new Material(0xffffff);
    rock.vertexColors = true; rock.shading = Shading.Flat;
    this.beltNode = s.add(new Node(belt(), rock));

    this.addMoon(sphere(0.32, 16, 10), 0xd8d4cc, Shading.Smooth, 5.4, 0.45, 0.1, 0);              // grey and smooth
    this.addMoon(sphere(0.22, 8, 6), 0xb0643c, Shading.Flat, 6.6, 0.3, -0.18, 2.1);  // a low-poly red rock
    const ice = this.addMoon(sphere(0.42, 16, 10), 0xcfe8ff, Shading.Smooth, 11, 0.12, 0.05, 4);  // ice, with a highlight
    const iceMat = ice.material;
    if (iceMat !== null) { iceMat.specular = 0xffffff; iceMat.shininess = 40; }

    this.station = s.add(this.buildStation());
  }

  private addMoon(mesh: Mesh, color: u32, shading: Shading, radius: number, speed: number, tilt: number, phase: number): Node {
    const m = new Material(color);
    m.shading = shading;
    const node = this.scene.add(new Node(mesh, m));
    this.moons.push({ node, radius, speed, tilt, phase });
    return node;
  }

  /** A wheel station: rim, spokes, hub, and windows that glow (emissive) on its dark side too. */
  private buildStation(): Node {
    const root = new Node(null, null);
    const metal = new Material(0xb8c0cc);
    metal.specular = 0x808080; metal.shininess = 30;
    root.add(new Node(torus(0.5, 0.06, 24, 6), metal));
    const bar = cube(1);
    root.add(new Node(bar, metal)).setScale(1, 0.05, 0.05);
    root.add(new Node(bar, metal)).setScale(0.05, 0.05, 1);
    root.add(new Node(bar, metal)).setScale(0.18, 0.3, 0.18);
    const lamp = new Material(0x40e0ff);
    lamp.emissive = 0x40d8ff; lamp.shading = Shading.Unlit;
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * i / 4;
      root.add(new Node(bar, lamp)).setPosition(Math.cos(a) * 0.5, 0.07, Math.sin(a) * 0.5).setScale(0.05, 0.03, 0.05);
    }
    const panel = new Material(0x2a4aa8);
    panel.specular = 0x6080ff; panel.shininess = 60; panel.doubleSided = true;
    root.add(new Node(bar, panel)).setPosition(0, 0.42, 0).setScale(0.7, 0.02, 0.25);
    return root;
  }

  /** Moves everything to time `t` (seconds). */
  animate(t: number): void {
    this.planet.setRotation(0.12, t * PLANET_SPIN, 0);
    this.beltNode.setRotation(0, t * BELT_SPIN, 0);
    for (const m of this.moons) {
      const a = m.phase + t * m.speed;
      m.node.setPosition(Math.cos(a) * m.radius, Math.sin(a) * m.radius * m.tilt, Math.sin(a) * m.radius);
      m.node.setRotation(0, -a, 0);   // the same face towards the planet
    }
    this.stationOrbit = 0.9 + t * 0.2;
    const r = 3.6;
    this.station.setPosition(Math.cos(this.stationOrbit) * r, 1.3, Math.sin(this.stationOrbit) * r);
    this.station.setRotation(0.35, t * 0.6, 0.15);
  }
}
