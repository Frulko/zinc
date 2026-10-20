// Blending and emissive colours in zinc:3d (ZN-696), seen from above with an orthographic camera: an unlit grey floor (40, 40, 40); two
// unlit glows added to it, red (100, 0, 0) and green (0, 100, 0), which overlap; a blue quad at half opacity over the floor; and a lit white
// quad with a dim emissive colour added to the floor on the right. tests/t1/zinc3d_glow.sh reads the pixels: the glows add up.
import { onFrame, width, height } from 'zinc:gfx';
import { Scene, Camera, Node, Material, Light, plane, Shading, Blend } from 'zinc:3d';

const scene = new Scene();
scene.background = 0x000000;
scene.ambient = 0x000000;
scene.lights.push(new Light(0, -1, 0, 0x808080));
function quad(w: number, d: number, x: number, z: number, y: number, mat: Material): Node {
  const n = new Node(plane(w, d, 1, 1), mat);
  n.setPosition(x, y, z);
  scene.add(n);
  return n;
}
function flat(color: u32, blend: Blend, opacity: number, lit: boolean): Material {
  const m = new Material(color);
  if (!lit) m.shading = Shading.Unlit;
  m.blend = blend; m.opacity = opacity; m.doubleSided = true;
  return m;
}
quad(20, 12, 0, 0, 0, flat(0x282828, Blend.Opaque, 1, false));                  // the floor: 40, 40, 40
quad(4, 4, -5, -2, 0.1, flat(0x640000, Blend.Add, 1, false));                     // red glow
quad(4, 4, -3, -2, 0.2, flat(0x006400, Blend.Add, 1, false));                     // green glow, overlapping it on x in [-5, -3]
quad(4, 4, -4, 3, 0.1, flat(0x0000ff, Blend.Alpha, 0.5, false));                  // blue at half opacity
const lit = flat(0xffffff, Blend.Add, 1, true);
lit.emissive = 0x101010;
quad(4, 4, 5, 0, 0.1, lit);                                                        // lit: 128 of light, + 16 emissive, added to 40
const camera = new Camera().setPosition(0, 10, 0.001).lookAt(0, 0, 0);
camera.ortho = true; camera.height = 12; camera.pixelRatio = 1;
onFrame((dt: number) => { camera.render(scene, 0, 0, width(), height()); });
