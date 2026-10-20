// WebGL inside a zinc:ui app, for the web target in canvas and DOM mode: two Canvas nodes, one drawn with zinc:gl (a green clear presented into an image) and one with the real
// three.js (a red cube, setViewport naming the box of the node). In DOM mode each node is a real <canvas> element where the node sits.
import { render } from 'zinc:ui/solid';
import { createImage, drawImage } from 'zinc:gfx';
import { createContext } from 'zinc:gl';
import * as THREE from 'three';

let gl: any = null;
let glImage: i32 = -1;
function drawGl(x: i32, y: i32, w: i32, h: i32): void {
  if (gl === null) { gl = createContext(64, 48, 2); glImage = createImage(64, 48); }
  gl.clearColor(0.1, 0.7, 0.2, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.present(glImage);
  drawImage(glImage, x, y, w, h, 255);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x203060);
const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 50);
camera.position.set(0, 0, 4);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xe63946 }));
cube.rotation.set(0.5, 0.7, 0);
scene.add(cube);
const renderer = new THREE.WebGLRenderer({ antialias: false });
function drawThree(x: i32, y: i32, w: i32, h: i32): void {
  renderer.setViewport(x, y, w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function App(): i32 {
  return <View className="p-4 flex-row gap-4 bg-white w-full h-full">
    <Canvas className="w-[200] h-[150]" onDraw={drawGl} />
    <Canvas className="w-[300] h-[200]" onDraw={drawThree} />
  </View>;
}

render(App, 0xffffff, null);
