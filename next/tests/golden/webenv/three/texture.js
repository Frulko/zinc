// three.js with a picture from a file (ZN-569): TextureLoader makes an image element, sets its src and uploads it when it has loaded. The
// picture is tests/data/images/fixture.png (32 x 24, twelve flat colours in 8 x 8 blocks) on a plane that covers the 128 x 96 view, so each
// block is 32 x 32 pixels and the colours read back are the file's (through three's sRGB texture and output: within 1). Run with ZINC_WEB=1
// by tests/t1/webenv_three.sh; the output is texture.out.
import * as THREE from 'three';
const COLOURS = [[220, 30, 30], [30, 160, 60], [30, 60, 200], [240, 220, 40], [255, 255, 255], [0, 0, 0], [120, 120, 120], [200, 100, 20], [90, 20, 140], [20, 180, 190], [250, 150, 180], [60, 60, 20]];
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(128, 96);
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const texture = await new Promise((resolve, reject) => new THREE.TextureLoader().load('../../../data/images/fixture.png', resolve, undefined, reject));
texture.colorSpace = THREE.SRGBColorSpace;
texture.magFilter = texture.minFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: texture })));
renderer.render(scene, camera);
const at = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, 95 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [...p]; };   // x, y from the top left
let worst = 0;
for (let i = 0; i < 12; i++) { const p = at((i % 4) * 32 + 16, (i >> 2) * 32 + 16); for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(p[k] - COLOURS[i][k])); }
console.log('three', THREE.REVISION, 'TextureLoader:', texture.image instanceof HTMLImageElement, texture.image.width + 'x' + texture.image.height, 'flipY', texture.flipY,
  '| top-left', at(16, 16).join(','), 'bottom-right', at(112, 80).join(','), '| largest difference over the 12 blocks', worst, 'error', gl.getError());
