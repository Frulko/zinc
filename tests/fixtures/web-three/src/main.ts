// A small three.js scene for the web target test: one cube with a basic material (no lights, so the picture does not depend on the GPU's shading), a dark background,
// and a white box of zinc:gfx drawn after it (the paint order of canvas and DOM mode).
import * as THREE from 'three';
import { window } from 'three';
import { onFrame, rrect } from 'zinc:gfx';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101830);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 50);
camera.position.set(0, 0, 4);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xe63946 }));
cube.rotation.set(0.5, 0.7, 0);
scene.add(cube);
renderer.setAnimationLoop(() => { renderer.render(scene, camera); });
onFrame(() => { rrect(10, 10, 60, 40, 8, 0xffffff, 255); });
