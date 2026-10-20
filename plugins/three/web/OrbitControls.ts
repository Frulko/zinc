// OrbitControls in the browser: the real addon (unmodified), listening on the Zinc surface when it is given a CanvasElement (the renderer's canvas is detached and gets no pointer events).
import { OrbitControls as Real } from '../../../third_party/three/examples/jsm/controls/OrbitControls.js';

const Base: any = Real;
export class OrbitControls extends Base {
  constructor(camera: any, element?: any) {
    const d: any = (globalThis as any).document;
    super(camera, element instanceof (globalThis as any).HTMLElement ? element : d.getElementById('zinc-canvas') || d.getElementById('zinc-root'));
  }
}
