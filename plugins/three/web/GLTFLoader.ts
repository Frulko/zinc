// GLTFLoader in the browser: the real addon (unmodified); a file that is one of the app's assets is read from them (a Zinc app has no URL for its assets), any other URL is fetched.
// The result also carries the counts of the Zinc subset's GLTF (meshes, triangles, ignoredAnimations, ignoredSkins: 0, the real three.js plays them).
import { GLTFLoader as Real } from '../../../third_party/three/examples/jsm/loaders/GLTFLoader.js';
import { exists, readBytes } from 'zinc:assets';

function counted(gltf: any): any {
  let meshes = 0, triangles = 0;
  gltf.scene.traverse((o: any) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry, n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
    triangles += Math.floor(n / 3);
  });
  gltf.meshes = meshes; gltf.triangles = triangles; gltf.ignoredAnimations = 0; gltf.ignoredSkins = 0;
  return gltf;
}

const Base: any = Real;
export class GLTFLoader extends Base {
  load(url: string, onLoad?: any, onProgress?: any, onError?: any): void {
    const done = onLoad ? (g: any) => onLoad(counted(g)) : onLoad;
    const name = (this as any).path + url;
    if (!exists(name)) { super.load(url, done, onProgress, onError); return; }
    const buf = new Uint8Array(readBytes(name)).buffer;
    const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
    Promise.resolve().then(() => (this as any).parse(buf, dir, done, onError));
  }
}
