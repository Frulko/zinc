// Highlights (ZN-563.04): MeshPhongMaterial (specular, shininess) and MeshStandardMaterial (roughness, metalness) spheres, drawn the same by the software
// renderer (per vertex) and the GPU (per pixel). tests/t1/three_gpu.sh compares the two.
import * as THREE from 'three';
import { window } from 'three';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 7);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 4, 5);
scene.add(sun);

const sphere = new THREE.SphereGeometry(1, 48, 32);
const materials: THREE.Material[] = [
  new THREE.MeshPhongMaterial({ color: 0xc03030, specular: 0xffffff, shininess: 60 }),
  new THREE.MeshPhongMaterial({ color: 0x3060c0, shininess: 10 }),
  new THREE.MeshStandardMaterial({ color: 0x30a050, roughness: 0.35 }),
  new THREE.MeshStandardMaterial({ color: 0xd0a040, roughness: 0.5, metalness: 1 }),
];
for (let i = 0; i < materials.length; i++) {
  const m = new THREE.Mesh(sphere, materials[i]);
  m.position.set(i * 2.4 - 3.6, 0, 0);
  scene.add(m);
}
renderer.setAnimationLoop((time: number) => { renderer.render(scene, camera); });
