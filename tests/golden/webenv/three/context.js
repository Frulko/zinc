// ZN-565: three.js draws on a WebGL 2 context the page made (`context`). It refuses one that is also `instanceof WebGLRenderingContext`
// ("WebGL 1 is not supported"): the two interfaces are siblings. Run with ZINC_WEB=1 by tests/t1/webgl_libs.sh; the output is context.out.
import * as THREE from 'three';
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 64;
const gl = canvas.getContext('webgl2');
const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x102030);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.z = 2;
scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 })));
renderer.render(scene, camera);
const pixel = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p.join(','); };
console.log('three', THREE.REVISION, 'on the page\'s context', renderer.getContext() === gl, 'centre', pixel(32, 32), 'corner', pixel(1, 1), 'error', gl.getError());
