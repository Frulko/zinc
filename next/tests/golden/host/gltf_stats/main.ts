// Statistics of glTF models read by the three plugin's loader (the prototype's reader), for the cgltf cross-check of tests/t0/gltf.sh:
// the same line as tests/native/gltf_check.cpp prints. Models come from the command line.
import { args } from 'zinc:sys';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';

function f3(v: number): string { const s = (Math.round(v * 1000) / 1000).toFixed(3); return s === '-0.000' ? '0.000' : s; }
for (const path of args()) {
  new GLTFLoader().load(path, (gltf: GLTF) => {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    let meshes = 0, verts = 0, tris = 0;
    root.traverse((o: THREE.Object3D) => { if (o instanceof THREE.Mesh) { meshes++; verts += o.geometry.attributes.position.count; tris += o.geometry.index !== null ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; } });
    const b = new THREE.Box3().setFromObject(root);
    let slash = path.length - 1;
    while (slash >= 0 && path.at(slash) !== '/') slash--;
    console.log(`${path.slice(slash + 1)} meshes=${meshes} triangles=${gltf.triangles} drawn=${tris} vertices=${verts} bbox=${f3(b.min.x)},${f3(b.min.y)},${f3(b.min.z)}..${f3(b.max.x)},${f3(b.max.y)},${f3(b.max.z)}`);
  }, null, (e: Error) => { console.error(e.message); });
}
