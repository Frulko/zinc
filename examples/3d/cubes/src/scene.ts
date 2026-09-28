// The scene: six textured cubes on a ring (a baked PNG and a runtime image painted with zinc:gfx), a Gouraud torus
// with a flat-shaded sphere inside it, and a textured floor.
import { image, createImage, beginImage, endImage, gradient, font, drawText, rrect } from 'zinc:gfx';
import { Scene, Node, Material, Light, Shading, cube, torus, sphere, plane } from 'zinc:3d';

/** A 64x64 texture drawn with 2D commands (render-to-image); painted from the first frame, see paintLogo(). */
const logo = createImage(64, 64);

export function paintLogo(): void {
  beginImage(logo);
  gradient(0, 0, 64, 64, 0, 0x2266ff, 0xff3399, true, 255);
  rrect(6, 6, 52, 52, 10, 0xffffff, 60);
  drawText(font('sans-bold', 20), 12, 20, 'Zn', 0xffffff, 255, 0);
  endImage();
}

export interface CubesScene {
  scene: Scene;
  cubes: Node[];
  ring: Node;
  ball: Node;
}

export function createScene(): CubesScene {
  const scene = new Scene();
  scene.background = 0x10141c;
  scene.ambient = 0x303848;
  scene.lights.push(new Light(-0.5, -1, -0.6, 0xfff0e0));

  const crate = new Material(0xffffff);
  crate.texture = image('crate.png');
  const painted = new Material(0xffffff);
  painted.texture = logo;

  // six cubes on a circle, alternating the two textures (one mesh shared by all)
  const box = cube(1);
  const cubes: Node[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    cubes.push(scene.add(new Node(box, i % 2 === 0 ? crate : painted)).setPosition(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
  }

  const ring = scene.add(new Node(torus(0.9, 0.3, 32, 16), new Material(0xffc040)));
  const facets = new Material(0x40d0a0);
  facets.shading = Shading.Flat;
  const ball = ring.add(new Node(sphere(0.45, 12, 8), facets));   // a child: it turns with the torus

  const floor = new Material(0x808890);
  floor.texture = image('crate.png');
  scene.add(new Node(plane(12, 12, 6, 6), floor)).setPosition(0, -1.2, 0);
  return { scene, cubes, ring, ball };
}

/** Spins the cubes and the torus, bobs the sphere; `t` in seconds. */
export function animate(s: CubesScene, t: number): void {
  for (let i = 0; i < s.cubes.length; i++) s.cubes[i].setRotation(t * 0.7 + i, t * 1.1, t * 0.3 * i);
  s.ring.setRotation(t * 0.9, t * 0.5, 0);
  s.ball.setPosition(0, Math.sin(t * 2) * 0.3, 0);
}
