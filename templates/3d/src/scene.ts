// What is in the scene.
import * as THREE from 'three';
import { ORBITS } from './motion';

export class World {
  scene: THREE.Scene = new THREE.Scene();
  knot: THREE.Mesh;
  satellites: THREE.Mesh[] = [];
  constructor() {
    this.scene.background = new THREE.Color(0x0f1724);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x2a2018, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(4, 7, 5);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.2, 64), new THREE.MeshStandardMaterial({ color: 0x1e2a3a, roughness: 0.9 }));
    floor.position.y = -0.1;
    this.scene.add(floor);
    this.knot = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.3, 32, 96), new THREE.MeshStandardMaterial({ color: 0x4fc3f7, roughness: 0.3, metalness: 0.2 }));
    this.knot.position.y = 1.3;
    this.scene.add(this.knot);
    const colors: number[] = [0xf9c74f, 0xf3722c, 0x90be6d];
    for (let i = 0; i < ORBITS.length; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 16), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.5 }));
      this.scene.add(s);
      this.satellites.push(s);
      const path = new THREE.Mesh(new THREE.TorusGeometry(ORBITS[i].radius, 0.012, 6, 96), new THREE.MeshBasicMaterial({ color: 0x3a4a60 }));
      path.rotation.x = Math.PI / 2;
      path.position.y = ORBITS[i].height;
      this.scene.add(path);
    }
  }
}
