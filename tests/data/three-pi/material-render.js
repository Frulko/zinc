// Direct short renderer proof, proposed for manual use (not part of T0).
import * as T from 'three';
import { TIER } from 'zinc:platform';
import { downgradeMaterials, mergeStaticMeshes, warmUp } from 'zinc:three-pi';
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
const gl = canvas.getContext(T.REVISION === '162' ? 'webgl' : 'webgl2');
const renderer = new T.WebGLRenderer({ canvas, context: gl }); renderer.setSize(64, 64, false);
const scene = new T.Scene(), parent = new T.Group(); scene.add(parent);
const camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 10); camera.position.z = 2;
const texture = new T.DataTexture(new Uint8Array([255,0,0,255]), 1, 1); texture.needsUpdate = true;
const material = new T.MeshStandardMaterial({ map: texture });
for (const x of [-.45, .45]) {
  const mesh = new T.Mesh(new T.PlaneGeometry(.8, 1.5), material); mesh.position.x = x;
  mesh.userData.static = true; parent.add(mesh);
}
scene.add(new T.AmbientLight(0xffffff, Math.PI));
downgradeMaterials(scene); mergeStaticMeshes(parent);
if (TIER === 2 && (parent.children.length !== 1 || !parent.children[0].material.isMeshLambertMaterial)) throw new Error('helpers did not prepare a single Lambert mesh');
warmUp(renderer, scene, camera); renderer.render(scene, camera);
for (const x of [18, 46]) {
  const p = new Uint8Array(4); gl.readPixels(x, 28, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
  if (p[0] < 200 || p[1] > 2 || p[2] > 2 || gl.getError() !== gl.NO_ERROR) throw new Error('merged textured Lambert did not render red: ' + p);
}
console.log('three-pi material-render PASS', T.REVISION, gl instanceof WebGLRenderingContext ? 'WebGL1' : 'WebGL2', parent.children.length);
renderer.dispose(); texture.dispose(); material.dispose();
