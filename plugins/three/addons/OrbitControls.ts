// OrbitControls for three (Zinc): orbit, dolly and pan a camera around a target, with the three.js update() maths.
// There are no DOM events: update() polls zinc:gfx input every frame (call it in the animation loop, as with damping
// on the web). Left drag / one finger: orbit; wheel, trackpad pinch, two-finger pinch: dolly; right drag (desktop,
// through the pen samples) or two-finger drag: pan. The pointer must start inside renderer.domElement's box.
import { Camera, PerspectiveCamera, OrthographicCamera, CanvasElement, Vector3, Quaternion, Spherical, MathUtils } from '../index';
import { pointerDown, pointerX, pointerY, wheel, pinch, touchCount, touchX, touchY, penCount, penX, penY, penFlags, PenFlag, width, height } from 'zinc:gfx';

const NONE: i32 = 0, ROTATE: i32 = 1, PAN: i32 = 2, TOUCH: i32 = 3;
const EPS = 0.000001;

class Listener { type: string; cb: () => void; constructor(type: string, cb: () => void) { this.type = type; this.cb = cb; } }

export class OrbitControls {
  object: Camera;
  domElement: CanvasElement;
  enabled = true;
  readonly target = new Vector3();
  minDistance = 0;
  maxDistance: number = Infinity;
  minZoom = 0;
  maxZoom: number = Infinity;
  minPolarAngle = 0;
  maxPolarAngle = Math.PI;
  minAzimuthAngle = -Infinity;
  maxAzimuthAngle: number = Infinity;
  enableDamping = false;
  dampingFactor = 0.05;
  enableZoom = true;
  zoomSpeed = 1;
  enableRotate = true;
  rotateSpeed = 1;
  enablePan = true;
  panSpeed = 1;
  screenSpacePanning = true;
  autoRotate = false;
  /** Seconds per turn: 60 / autoRotateSpeed (30 s at 2, like three.js at 60 fps). */
  autoRotateSpeed = 2;

  private readonly spherical = new Spherical();
  private readonly delta = new Spherical(0, 0, 0);
  private scale = 1;
  private readonly panOffset = new Vector3();
  private state: i32 = NONE;
  private wasDown = false;
  private lastX = 0; private lastY = 0;
  private rightDown = false; private panX = 0; private panY = 0;
  private lastDist = 0; private lastCx = 0; private lastCy = 0;
  private readonly lastPosition = new Vector3();
  private readonly lastQuaternion = new Quaternion();
  private readonly lastTarget = new Vector3();
  private readonly listeners: Listener[] = [];
  private readonly target0 = new Vector3();
  private readonly position0 = new Vector3();
  private zoom0 = 1;

  constructor(object: Camera, domElement: CanvasElement | null = null) {
    this.object = object;
    const el = domElement ?? new CanvasElement();
    if (domElement === null) { el.width = width(); el.height = height(); }
    this.domElement = el;
    this.saveState();
    this.update();
  }

  /** 'change' (camera moved), 'start' and 'end' (a drag). */
  addEventListener(type: string, cb: () => void): void { this.listeners.push(new Listener(type, cb)); }
  /** Removes every listener of `type` (Zinc cannot compare functions). */
  removeEventListener(type: string, cb: (() => void) | null = null): void {
    for (let i = this.listeners.length - 1; i >= 0; i--) if (this.listeners[i].type === type) this.listeners.splice(i, 1);
  }
  dispose(): void { this.listeners.length = 0; }
  getPolarAngle(): number { return this.spherical.phi; }
  getAzimuthalAngle(): number { return this.spherical.theta; }
  getDistance(): number { return this.object.position.distanceTo(this.target); }
  saveState(): void { this.target0.copy(this.target); this.position0.copy(this.object.position); this.zoom0 = this.object.zoom; }
  reset(): void {
    this.target.copy(this.target0); this.object.position.copy(this.position0); this.object.zoom = this.zoom0;
    this.object.updateProjectionMatrix();
    this.state = NONE;
    this.update();
    this.emit('change');
  }

  // programmatic moves (three.js keeps these private; public here for scripts and tests)
  rotateLeft(angle: number): void { this.delta.theta -= angle; }
  rotateUp(angle: number): void { this.delta.phi -= angle; }
  /** Moves closer (scale < 1). */
  dollyIn(scale: number): void { this.scale *= scale; }
  dollyOut(scale: number): void { this.scale /= scale; }
  /** Pans by a screen distance in pixels. */
  pan(dx: number, dy: number): void {
    const cam = this.object, el = this.domElement;
    cam.updateMatrix();
    const x = new Vector3().setFromMatrixColumn(cam.matrix, 0);
    let upd = new Vector3();
    if (this.screenSpacePanning) upd.setFromMatrixColumn(cam.matrix, 1); else upd = new Vector3().crossVectors(cam.up, x);
    let sx = 0, sy = 0;
    if (cam instanceof PerspectiveCamera) {
      const d = cam.position.distanceTo(this.target) * Math.tan(cam.fov / 2 * Math.PI / 180);
      sx = 2 * dx * d / el.clientHeight; sy = 2 * dy * d / el.clientHeight;
    } else if (cam instanceof OrthographicCamera) {
      sx = dx * (cam.right - cam.left) / cam.zoom / el.clientWidth; sy = dy * (cam.top - cam.bottom) / cam.zoom / el.clientHeight;
    }
    this.panOffset.addScaledVector(x, -sx).addScaledVector(upd, sy);
  }

  /** Reads input and moves the camera; returns true when it moved. `deltaTime` (s) paces autoRotate. */
  update(deltaTime: number = NaN): boolean {
    if (this.enabled) this.poll();
    const cam = this.object;
    const quat = new Quaternion().setFromUnitVectors(cam.up, new Vector3(0, 1, 0)), quatInv = quat.clone().invert();
    const offset = new Vector3().copy(cam.position).sub(this.target).applyQuaternion(quat);
    this.spherical.setFromVector3(offset);
    if (this.autoRotate && this.state === NONE) this.rotateLeft(isNaN(deltaTime) ? 2 * Math.PI / 3600 * this.autoRotateSpeed : 2 * Math.PI / 60 * this.autoRotateSpeed * deltaTime);
    const k = this.enableDamping ? this.dampingFactor : 1;
    this.spherical.theta += this.delta.theta * k;
    this.spherical.phi += this.delta.phi * k;
    let min = this.minAzimuthAngle, max = this.maxAzimuthAngle;
    if (Number.isFinite(min) && Number.isFinite(max)) {
      if (min < -Math.PI) min += 2 * Math.PI; else if (min > Math.PI) min -= 2 * Math.PI;
      if (max < -Math.PI) max += 2 * Math.PI; else if (max > Math.PI) max -= 2 * Math.PI;
      const t = this.spherical.theta;
      this.spherical.theta = min <= max ? MathUtils.clamp(t, min, max) : t > (min + max) / 2 ? Math.max(min, t) : Math.min(max, t);
    }
    this.spherical.phi = MathUtils.clamp(this.spherical.phi, this.minPolarAngle, this.maxPolarAngle);
    this.spherical.makeSafe();
    this.target.addScaledVector(this.panOffset, k);
    if (cam instanceof OrthographicCamera) {
      cam.zoom = MathUtils.clamp(cam.zoom / this.scale, this.minZoom, this.maxZoom);
      cam.updateProjectionMatrix();
    } else this.spherical.radius = MathUtils.clamp(this.spherical.radius * this.scale, this.minDistance, this.maxDistance);
    offset.setFromSpherical(this.spherical).applyQuaternion(quatInv);
    this.object.position.copy(this.target).add(offset);
    this.object.lookAt(this.target.x, this.target.y, this.target.z);
    if (this.enableDamping) {
      this.delta.theta *= 1 - this.dampingFactor;
      this.delta.phi *= 1 - this.dampingFactor;
      this.panOffset.multiplyScalar(1 - this.dampingFactor);
    } else { this.delta.set(0, 0, 0); this.panOffset.set(0, 0, 0); }
    this.scale = 1;
    if (this.lastPosition.distanceToSquared(cam.position) > EPS || 8 * (1 - this.lastQuaternion.dot(cam.quaternion)) > EPS || this.lastTarget.distanceToSquared(this.target) > EPS) {
      this.lastPosition.copy(cam.position); this.lastQuaternion.copy(cam.quaternion); this.lastTarget.copy(this.target);
      this.emit('change');
      return true;
    }
    return false;
  }

  private emit(type: string): void { for (const l of this.listeners) if (l.type === type) l.cb(); }
  private inside(x: number, y: number): boolean {
    const el = this.domElement;
    return x >= el.x && y >= el.y && x < el.x + el.width && y < el.y + el.height;
  }
  private poll(): void {
    const h = Math.max(1, this.domElement.clientHeight);
    const down = pointerDown(), px = pointerX(), py = pointerY();
    if (touchCount() >= 2) {  // two fingers: pinch to dolly, move to pan
      const x0 = touchX(0), y0 = touchY(0), x1 = touchX(1), y1 = touchY(1);
      const d = Math.hypot(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (this.state === TOUCH) {
        if (this.enableZoom && d > 0 && this.lastDist > 0) this.dollyOut(Math.pow(d / this.lastDist, this.zoomSpeed));
        if (this.enablePan) this.pan((cx - this.lastCx) * this.panSpeed, (cy - this.lastCy) * this.panSpeed);
      } else if (this.inside(cx, cy)) { this.state = TOUCH; this.emit('start'); }
      this.lastDist = d; this.lastCx = cx; this.lastCy = cy;
    } else if (down) {
      if (this.state === NONE && !this.wasDown && this.inside(px, py)) { this.state = ROTATE; this.emit('start'); }
      else if (this.state === ROTATE && this.enableRotate) {
        this.rotateLeft(2 * Math.PI * (px - this.lastX) / h * this.rotateSpeed);
        this.rotateUp(2 * Math.PI * (py - this.lastY) / h * this.rotateSpeed);
      }
      this.lastX = px; this.lastY = py;
    } else if (this.state === ROTATE || this.state === TOUCH) { this.state = NONE; this.emit('end'); }
    this.wasDown = down;
    // right button (desktop): the mouse stands in for a pen, the right button is its eraser
    for (let i = 0; i < penCount(); i++) {
      const f = penFlags(i);
      if ((f & PenFlag.Eraser) === 0) continue;
      const x = penX(i), y = penY(i);
      if ((f & PenFlag.Down) !== 0) {
        if (this.rightDown && this.state === PAN && this.enablePan) this.pan((x - this.panX) * this.panSpeed, (y - this.panY) * this.panSpeed);
        else if (!this.rightDown && this.state === NONE && this.inside(x, y)) { this.state = PAN; this.emit('start'); }
        this.rightDown = true; this.panX = x; this.panY = y;
      } else {
        this.rightDown = false;
        if (this.state === PAN) { this.state = NONE; this.emit('end'); }
      }
    }
    if (!this.enableZoom || !this.inside(px, py)) return;
    const w = wheel();
    if (w > 0) this.dollyIn(Math.pow(0.95, this.zoomSpeed * w));
    else if (w < 0) this.dollyOut(Math.pow(0.95, -this.zoomSpeed * w));
    const p = pinch();
    if (p > 0 && p !== 1) this.dollyOut(p);
  }
}
