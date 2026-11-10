import { Scene, Camera, Node, Material, Shading, Blend, torus, gpu } from 'zinc:3d';
import { onFrame, quit } from 'zinc:gfx';
const scene = new Scene(), camera = new Camera();
const material = new Material(0xaaaaaa);
material.shading = Shading.Unlit;
const ring = new Node(torus(1, .25, 48, 24), material);
ring.setRotation(Math.PI / 2, 0, 0);
const parent = scene.add(new Node(null, null));
parent.setPosition(.3, -.2, 0).setScale(1.2, .9, 1);
parent.add(ring);
function expect(name: string, actual: boolean, wanted: boolean): void {
  if (actual !== wanted) throw new Error('visibility ' + name + ': ' + actual);
}
expect('before render', camera.isVisible(0, 0, 0), false);
onFrame((dt: number) => {
  camera.render(scene, 0, 0, 320, 240);
  expect('hole', camera.isVisible(.3, -.2, -.5), true);
  expect('handle', camera.isVisible(1.45, -.2, -.5), false);
  expect('upper handle', camera.isVisible(.3, .7, -.5), false);
  expect('front', camera.isVisible(1.45, -.2, 1), true);
  expect('outside', camera.isVisible(20, 0, 0), false);
  expect('behind eye', camera.isVisible(0, 0, 6), false);
  expect('far', camera.isVisible(0, 0, -200), false);
  // A second camera and edits cannot change the first camera's completed target.
  const other = new Camera(); other.setPosition(0, 0, -5);
  other.render(new Scene(), 320, 0, 160, 120);
  camera.setPosition(0, 0, -5);
  ring.visible = false;
  expect('snapshot', camera.isVisible(1.45, -.2, -.5), false);
  camera.setPosition(0, 0, 5);
  camera.ortho = true; camera.height = 4;
  camera.render(scene, 0, 0, 320, 240);
  expect('hidden node', camera.isVisible(1.45, -.2, -.5), true);
  ring.visible = true;
  camera.render(scene, 0, 0, 320, 240);
  expect('ortho hole', camera.isVisible(.3, -.2, -.5), true);
  expect('ortho handle', camera.isVisible(1.45, -.2, -.5), false);
  material.blend = Blend.Alpha; material.opacity = .5;
  camera.render(scene, 0, 0, 320, 240);
  expect('blend writes no depth', camera.isVisible(1.45, -.2, -.5), true);
  material.blend = Blend.Opaque;
  camera.render(scene, 0, 0, 320, 240);
  let rejected = false;
  try { camera.isVisible(0, 0, 0, -1); } catch (e) { rejected = true; }
  expect('invalid bias', rejected, true);
  camera.dispose(); other.dispose();
  expect('disposed', camera.isVisible(0, 0, 0), false);
  // Restarting the same camera must start with its new render's depth.
  ring.visible = false;
  camera.render(scene, 0, 0, 160, 120);
  expect('restart', camera.isVisible(1.45, -.2, -.5), true);
  console.log('visibility ' + (gpu() ? 'gpu' : 'software') + ' ok');
  camera.dispose(); ring.mesh?.dispose();
  quit();
});
