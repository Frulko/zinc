// GLTFLoader in the browser: the real addon (unmodified); a file that is one of the app's assets is read from them (a Zinc app has no URL for its assets), any other URL is fetched.
import { GLTFLoader as Real } from '../../../next/third_party/three/examples/jsm/loaders/GLTFLoader.js';
import { exists, readBytes } from 'zinc:assets';

const Base: any = Real;
export class GLTFLoader extends Base {
  load(url: string, onLoad?: any, onProgress?: any, onError?: any): void {
    const name = (this as any).path + url;
    if (!exists(name)) { super.load(url, onLoad, onProgress, onError); return; }
    const buf = new Uint8Array(readBytes(name)).buffer;
    const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
    Promise.resolve().then(() => (this as any).parse(buf, dir, onLoad, onError));
  }
}
