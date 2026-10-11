// A lighthouse at night with three.js: a model loaded from a file, three lights, and a camera you turn with the pointer.
// Run it:  zinc run examples/js-three      (drag to turn around the lighthouse, wheel to come closer)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const NIGHT = 0x0b1026;
const scene = new THREE.Scene();
scene.background = new THREE.Color(NIGHT);
scene.fog = new THREE.Fog(NIGHT, 12, 40);   // the sea fades into the night

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(5, 2.6, 6.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.05;   // the camera stays above the water
controls.minDistance = 4;
controls.maxDistance = 16;

// The lights: the moon, a little light from the sky, and the lamp of the lighthouse.
const moon = new THREE.DirectionalLight(0xa9c1ff, 1.6);
moon.position.set(-6, 8, 3);
scene.add(moon, new THREE.HemisphereLight(0x33407a, 0x05070f, 1.2));
const lamp = new THREE.PointLight(0xffd27a, 14, 9);
lamp.position.set(0, 2.68, 0);
const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
glow.position.copy(lamp.position);
scene.add(lamp, glow);

// The model: assets/lighthouse.glb (made by assets/make-lighthouse.mjs).
const gltf = await new GLTFLoader().loadAsync('assets/lighthouse.glb');
scene.add(gltf.scene);

// The sea, the stars and the beam are made here, from three's own shapes.
const sea = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x163a5c, roughness: 0.35, metalness: 0.2 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = 0.05;
scene.add(sea);

const stars = [];
for (let i = 0; i < 400; i++) {   // points spread evenly over a dome (the golden angle), the same sky at every run
  const y = 0.05 + 0.95 * (i + 0.5) / 400, r = Math.sqrt(1 - y * y), a = i * 2.39996;
  stars.push(90 * r * Math.cos(a), 90 * y, 90 * r * Math.sin(a));
}
const sky = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stars, 3)),
  new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
scene.add(sky);

const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 9, 24, 1, true).rotateZ(Math.PI / 2).translate(4.5, 0, 0),   // its point at the lamp
  new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
beam.position.copy(lamp.position);
scene.add(beam);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(time => {
  beam.rotation.y = time / 1500;   // the beam goes round in about nine seconds
  controls.update();
  renderer.render(scene, camera);
});
