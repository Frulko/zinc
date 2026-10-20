// three.js as its own examples write it: a renderer whose canvas goes in the document, a spinning cube, OrbitControls on the canvas (ZN-568).
// Run with ZINC_WEB=1 by tests/t1/webenv_three.sh, with cube.input dragging the pointer; the output is cube.out. The colours are pure (a red
// cube on a cleared background), so the pixels read back are the same on every GPU.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement, gl = renderer.getContext();
console.log('three', THREE.REVISION, 'canvas', canvas.width, canvas.height, canvas.style.width, canvas.style.height, gl instanceof WebGL2RenderingContext, canvas.isConnected);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x102030);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
scene.add(cube);
const controls = new OrbitControls(camera, canvas);
controls.addEventListener('start', () => console.log('frame', frames + 1, 'the drag starts on the canvas'));
controls.addEventListener('end', () => console.log('frame', frames + 1, 'the drag ends, azimuth', controls.getAzimuthalAngle().toFixed(3), 'polar', controls.getPolarAngle().toFixed(3)));

let frames = 0;
const pixel = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p.join(','); };
renderer.setAnimationLoop(time => {
  cube.rotation.x = time / 1000;
  cube.rotation.y = time / 700;
  controls.update();
  renderer.render(scene, camera);
  frames++;
  if (frames === 1 || frames === 8) console.log('frame', frames, 'at', Math.round(time), 'ms, centre', pixel(canvas.width >> 1, canvas.height >> 1), 'corner', pixel(2, 2), 'calls', renderer.info.render.calls, 'error', gl.getError());
});
