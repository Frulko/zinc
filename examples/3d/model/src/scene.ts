// The scene: an OBJ rocket from the assets (vertex colours, normals computed by zinc:3d) on a checkered floor,
// under a sky-blue background with a key light and a dim fill light.
import { createImage, beginImage, endImage, rect } from 'zinc:gfx';
import { Scene, Node, Material, Light, Mesh, loadObj, plane } from 'zinc:3d';

/** 2x2 checker drawn once into a runtime image, repeated once per floor cell; painted from the first frame. */
const checker = createImage(2, 2);

export function paintChecker(): void {
  beginImage(checker);
  rect(0, 0, 2, 2, 0x5a6b50);
  rect(0, 0, 1, 1, 0x7d8f6a);
  rect(1, 1, 1, 1, 0x7d8f6a);
  endImage();
}

export interface ModelScene {
  scene: Scene;
  rocket: Node;
  mesh: Mesh;
  paint: Material;   // the rocket's material (shading is toggled at runtime)
}

export function createScene(): ModelScene {
  const scene = new Scene();
  scene.background = 0x87a8d0;
  scene.ambient = 0x404850;
  scene.lights.push(new Light(-0.4, -1, -0.5, 0xffffff));   // key light
  scene.lights.push(new Light(0.8, 0.2, 0.6, 0x303050));    // fill light from the other side

  const paint = new Material(0xffffff);
  paint.vertexColors = true;
  const mesh = loadObj('rocket.obj');
  const rocket = scene.add(new Node(mesh, paint)).setPosition(0, 0.3, 0);

  const ground = new Material(0xffffff);
  ground.texture = checker;
  scene.add(new Node(plane(10, 10, 10, 10), ground)).setPosition(0, -1.6, 0);
  return { scene, rocket, mesh, paint };
}
