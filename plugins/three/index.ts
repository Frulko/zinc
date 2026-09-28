// three: a subset of the three.js API on the zinc:3d software renderer, so three.js code ports with few changes.
// Math, scene graph, geometries, materials, lights, cameras and picking are Zinc code; rendering goes through the
// zinc:3d native renderer (one draw per mesh into a runtime image). Loaders and controls live in addons/.
// Supported surface and deviations from three.js: docs/plugins/three.md.
import { Mesh as Mesh3D } from 'zinc:3d';
import R from '../3d/native/render3d.spec';
import { onFrame, width, height, image as bakedImage, imageWidth, imageHeight } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { exists, readBytes } from 'zinc:assets';
import { parseColor } from 'zinc:canvas';
import T from './native/three.spec';

export const REVISION = '170-zinc';
// sides
export const FrontSide: i32 = 0;
export const BackSide: i32 = 1;
export const DoubleSide: i32 = 2;
// accepted for compatibility (no effect)
export const SRGBColorSpace = 'srgb';
export const LinearSRGBColorSpace = 'srgb-linear';
export const NoToneMapping: i32 = 0;
export const LinearToneMapping: i32 = 1;
export const ACESFilmicToneMapping: i32 = 4;
export const PCFSoftShadowMap: i32 = 2;
export const RepeatWrapping: i32 = 1000;
export const ClampToEdgeWrapping: i32 = 1001;
export const NearestFilter: i32 = 1003;
export const LinearFilter: i32 = 1006;

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
function asin(x: number): number { const c = clamp(x, -1, 1); return Math.atan2(c, Math.sqrt(1 - c * c)); }
function acos(x: number): number { const c = clamp(x, -1, 1); return Math.atan2(Math.sqrt(1 - c * c), c); }

export class MathUtils {
  static DEG2RAD: number = Math.PI / 180;
  static RAD2DEG: number = 180 / Math.PI;
  static degToRad(d: number): number { return d * Math.PI / 180; }
  static radToDeg(r: number): number { return r * 180 / Math.PI; }
  static clamp(v: number, lo: number, hi: number): number { return clamp(v, lo, hi); }
  static lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
  static damp(a: number, b: number, lambda: number, dt: number): number { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }
  static smoothstep(x: number, lo: number, hi: number): number { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); }
  static euclideanModulo(n: number, m: number): number { return ((n % m) + m) % m; }
  static randFloat(lo: number, hi: number): number { return lo + Math.random() * (hi - lo); }
  static randFloatSpread(range: number): number { return range * (0.5 - Math.random()); }
  static randInt(lo: number, hi: number): number { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
}

// ---------------------------------------------------------------- vectors
export class Vector2 {
  x: number; y: number;
  constructor(x: number = 0, y: number = 0) { this.x = x; this.y = y; }
  set(x: number, y: number): Vector2 { this.x = x; this.y = y; return this; }
  copy(v: Vector2): Vector2 { this.x = v.x; this.y = v.y; return this; }
  clone(): Vector2 { return new Vector2(this.x, this.y); }
  add(v: Vector2): Vector2 { this.x += v.x; this.y += v.y; return this; }
  sub(v: Vector2): Vector2 { this.x -= v.x; this.y -= v.y; return this; }
  multiplyScalar(s: number): Vector2 { this.x *= s; this.y *= s; return this; }
  length(): number { return Math.hypot(this.x, this.y); }
  distanceTo(v: Vector2): number { return Math.hypot(this.x - v.x, this.y - v.y); }
}

export class Vector3 {
  x: number; y: number; z: number;
  constructor(x: number = 0, y: number = 0, z: number = 0) { this.x = x; this.y = y; this.z = z; }
  set(x: number, y: number, z: number): Vector3 { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s: number): Vector3 { return this.set(s, s, s); }
  setX(x: number): Vector3 { this.x = x; return this; }
  setY(y: number): Vector3 { this.y = y; return this; }
  setZ(z: number): Vector3 { this.z = z; return this; }
  copy(v: Vector3): Vector3 { return this.set(v.x, v.y, v.z); }
  clone(): Vector3 { return new Vector3(this.x, this.y, this.z); }
  add(v: Vector3): Vector3 { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
  addScalar(s: number): Vector3 { return this.set(this.x + s, this.y + s, this.z + s); }
  addVectors(a: Vector3, b: Vector3): Vector3 { return this.set(a.x + b.x, a.y + b.y, a.z + b.z); }
  addScaledVector(v: Vector3, s: number): Vector3 { return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s); }
  sub(v: Vector3): Vector3 { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
  subVectors(a: Vector3, b: Vector3): Vector3 { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  multiply(v: Vector3): Vector3 { return this.set(this.x * v.x, this.y * v.y, this.z * v.z); }
  multiplyScalar(s: number): Vector3 { return this.set(this.x * s, this.y * s, this.z * s); }
  divideScalar(s: number): Vector3 { return this.multiplyScalar(1 / s); }
  negate(): Vector3 { return this.set(-this.x, -this.y, -this.z); }
  min(v: Vector3): Vector3 { return this.set(Math.min(this.x, v.x), Math.min(this.y, v.y), Math.min(this.z, v.z)); }
  max(v: Vector3): Vector3 { return this.set(Math.max(this.x, v.x), Math.max(this.y, v.y), Math.max(this.z, v.z)); }
  dot(v: Vector3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v: Vector3): Vector3 { return this.crossVectors(this, v); }
  crossVectors(a: Vector3, b: Vector3): Vector3 {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    return this.set(x, y, z);
  }
  lengthSq(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length(): number { return Math.sqrt(this.lengthSq()); }
  normalize(): Vector3 { const l = this.length(); return l > 0 ? this.multiplyScalar(1 / l) : this; }
  setLength(l: number): Vector3 { return this.normalize().multiplyScalar(l); }
  lerp(v: Vector3, t: number): Vector3 { return this.set(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t, this.z + (v.z - this.z) * t); }
  lerpVectors(a: Vector3, b: Vector3, t: number): Vector3 { return this.copy(a).lerp(b, t); }
  distanceToSquared(v: Vector3): number { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
  distanceTo(v: Vector3): number { return Math.sqrt(this.distanceToSquared(v)); }
  angleTo(v: Vector3): number { const d = Math.sqrt(this.lengthSq() * v.lengthSq()); return d === 0 ? Math.PI / 2 : acos(this.dot(v) / d); }
  equals(v: Vector3): boolean { return this.x === v.x && this.y === v.y && this.z === v.z; }
  /** Point transform with the perspective divide. */
  applyMatrix4(m: Matrix4): Vector3 {
    const e = m.elements, x = this.x, y = this.y, z = this.z;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    return this.set((e[0] * x + e[4] * y + e[8] * z + e[12]) * w, (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, (e[2] * x + e[6] * y + e[10] * z + e[14]) * w);
  }
  applyQuaternion(q: Quaternion): Vector3 {
    const vx = this.x, vy = this.y, vz = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
    return this.set(vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx);
  }
  applyEuler(e: Euler): Vector3 { return this.applyQuaternion(new Quaternion().setFromEuler(e)); }
  applyAxisAngle(axis: Vector3, angle: number): Vector3 { return this.applyQuaternion(new Quaternion().setFromAxisAngle(axis, angle)); }
  /** Direction transform by the upper 3x3, normalized. */
  transformDirection(m: Matrix4): Vector3 {
    const e = m.elements, x = this.x, y = this.y, z = this.z;
    return this.set(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z).normalize();
  }
  project(camera: Camera): Vector3 { return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix); }
  unproject(camera: Camera): Vector3 { return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld); }
  setFromMatrixPosition(m: Matrix4): Vector3 { return this.set(m.elements[12], m.elements[13], m.elements[14]); }
  setFromMatrixColumn(m: Matrix4, i: i32): Vector3 { return this.set(m.elements[i * 4], m.elements[i * 4 + 1], m.elements[i * 4 + 2]); }
  setFromSpherical(s: Spherical): Vector3 { return this.setFromSphericalCoords(s.radius, s.phi, s.theta); }
  setFromSphericalCoords(radius: number, phi: number, theta: number): Vector3 {
    const r = Math.sin(phi) * radius;
    return this.set(r * Math.sin(theta), Math.cos(phi) * radius, r * Math.cos(theta));
  }
  fromArray(a: number[], offset: i32 = 0): Vector3 { return this.set(a[offset], a[offset + 1], a[offset + 2]); }
  toArray(): number[] { return [this.x, this.y, this.z]; }
}

export class Spherical {
  radius: number; phi: number; theta: number;
  constructor(radius: number = 1, phi: number = 0, theta: number = 0) { this.radius = radius; this.phi = phi; this.theta = theta; }
  set(radius: number, phi: number, theta: number): Spherical { this.radius = radius; this.phi = phi; this.theta = theta; return this; }
  makeSafe(): Spherical { this.phi = clamp(this.phi, 0.000001, Math.PI - 0.000001); return this; }
  setFromVector3(v: Vector3): Spherical { return this.setFromCartesianCoords(v.x, v.y, v.z); }
  setFromCartesianCoords(x: number, y: number, z: number): Spherical {
    this.radius = Math.sqrt(x * x + y * y + z * z);
    if (this.radius === 0) { this.theta = 0; this.phi = 0; }
    else { this.theta = Math.atan2(x, z); this.phi = acos(y / this.radius); }
    return this;
  }
}

// ---------------------------------------------------------------- rotations
export class Quaternion {
  x: number; y: number; z: number; w: number;
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x: number, y: number, z: number, w: number): Quaternion { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  identity(): Quaternion { return this.set(0, 0, 0, 1); }
  copy(q: Quaternion): Quaternion { return this.set(q.x, q.y, q.z, q.w); }
  clone(): Quaternion { return new Quaternion(this.x, this.y, this.z, this.w); }
  setFromEuler(e: Euler): Quaternion {
    const c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2);
    const s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);
    const o = e.order;
    const a = s1 * c2 * c3, b = c1 * s2 * s3, c = c1 * s2 * c3, d = s1 * c2 * s3, f = c1 * c2 * s3, g = s1 * s2 * c3, h = c1 * c2 * c3, k = s1 * s2 * s3;
    if (o === 'YXZ') return this.set(a + b, c - d, f - g, h + k);
    if (o === 'ZXY') return this.set(a - b, c + d, f + g, h - k);
    if (o === 'ZYX') return this.set(a - b, c + d, f - g, h + k);
    if (o === 'YZX') return this.set(a + b, c + d, f - g, h - k);
    if (o === 'XZY') return this.set(a - b, c - d, f + g, h + k);
    return this.set(a + b, c - d, f + g, h - k);  // XYZ
  }
  setFromAxisAngle(axis: Vector3, angle: number): Quaternion {
    const s = Math.sin(angle / 2);
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(angle / 2));
  }
  setFromRotationMatrix(m: Matrix4): Quaternion {
    const te = m.elements;
    const m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10];
    const trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      return this.set((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s);
    }
    if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      return this.set(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s);
    }
    if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      return this.set((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s);
    }
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    return this.set((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s);
  }
  /** Rotation from unit vector a to unit vector b. */
  setFromUnitVectors(a: Vector3, b: Vector3): Quaternion {
    let r = a.dot(b) + 1;
    if (r < 1e-8) {
      r = 0;
      if (Math.abs(a.x) > Math.abs(a.z)) this.set(-a.y, a.x, 0, r); else this.set(0, -a.z, a.y, r);
    } else this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x, r);
    return this.normalize();
  }
  multiply(q: Quaternion): Quaternion { return this.multiplyQuaternions(this, q); }
  premultiply(q: Quaternion): Quaternion { return this.multiplyQuaternions(q, this); }
  multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
    return this.set(ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz);
  }
  invert(): Quaternion { return this.set(-this.x, -this.y, -this.z, this.w); }
  conjugate(): Quaternion { return this.invert(); }
  dot(q: Quaternion): number { return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w; }
  length(): number { return Math.sqrt(this.dot(this)); }
  normalize(): Quaternion { const l = this.length(); return l === 0 ? this.set(0, 0, 0, 1) : this.set(this.x / l, this.y / l, this.z / l, this.w / l); }
  angleTo(q: Quaternion): number { return 2 * acos(Math.abs(clamp(this.dot(q), -1, 1))); }
  slerp(qb: Quaternion, t: number): Quaternion {
    if (t === 0) return this;
    if (t === 1) return this.copy(qb);
    const x = this.x, y = this.y, z = this.z, w = this.w;
    let cos = w * qb.w + x * qb.x + y * qb.y + z * qb.z;
    if (cos < 0) { this.set(-qb.x, -qb.y, -qb.z, -qb.w); cos = -cos; } else this.copy(qb);
    if (cos >= 1) return this.set(x, y, z, w);
    const sq = 1 - cos * cos;
    if (sq <= 1e-12) {
      const s = 1 - t;
      return this.set(s * x + t * this.x, s * y + t * this.y, s * z + t * this.z, s * w + t * this.w).normalize();
    }
    const sin = Math.sqrt(sq), half = Math.atan2(sin, cos);
    const ra = Math.sin((1 - t) * half) / sin, rb = Math.sin(t * half) / sin;
    return this.set(x * ra + this.x * rb, y * ra + this.y * rb, z * ra + this.z * rb, w * ra + this.w * rb);
  }
  equals(q: Quaternion): boolean { return this.x === q.x && this.y === q.y && this.z === q.z && this.w === q.w; }
  fromArray(a: number[], offset: i32 = 0): Quaternion { return this.set(a[offset], a[offset + 1], a[offset + 2], a[offset + 3]); }
  toArray(): number[] { return [this.x, this.y, this.z, this.w]; }
}

/** Euler angles in radians; `order` is one of XYZ (default), YXZ, ZXY, ZYX, YZX, XZY. */
export class Euler {
  x: number; y: number; z: number; order: string;
  constructor(x: number = 0, y: number = 0, z: number = 0, order: string = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
  set(x: number, y: number, z: number, order: string = ''): Euler { this.x = x; this.y = y; this.z = z; if (order.length > 0) this.order = order; return this; }
  copy(e: Euler): Euler { return this.set(e.x, e.y, e.z, e.order); }
  clone(): Euler { return new Euler(this.x, this.y, this.z, this.order); }
  setFromQuaternion(q: Quaternion, order: string = ''): Euler { return this.setFromRotationMatrix(new Matrix4().makeRotationFromQuaternion(q), order); }
  setFromRotationMatrix(m: Matrix4, order: string = ''): Euler {
    if (order.length > 0) this.order = order;
    const te = m.elements;
    const m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10];
    const o = this.order, lim = 0.9999999;
    if (o === 'YXZ') {
      this.x = asin(-m23);
      if (Math.abs(m23) < lim) { this.y = Math.atan2(m13, m33); this.z = Math.atan2(m21, m22); } else { this.y = Math.atan2(-m31, m11); this.z = 0; }
    } else if (o === 'ZXY') {
      this.x = asin(m32);
      if (Math.abs(m32) < lim) { this.y = Math.atan2(-m31, m33); this.z = Math.atan2(-m12, m22); } else { this.y = 0; this.z = Math.atan2(m21, m11); }
    } else if (o === 'ZYX') {
      this.y = asin(-m31);
      if (Math.abs(m31) < lim) { this.x = Math.atan2(m32, m33); this.z = Math.atan2(m21, m11); } else { this.x = 0; this.z = Math.atan2(-m12, m22); }
    } else if (o === 'YZX') {
      this.z = asin(m21);
      if (Math.abs(m21) < lim) { this.x = Math.atan2(-m23, m22); this.y = Math.atan2(-m31, m11); } else { this.x = 0; this.y = Math.atan2(m13, m33); }
    } else if (o === 'XZY') {
      this.z = asin(-m12);
      if (Math.abs(m12) < lim) { this.x = Math.atan2(m32, m22); this.y = Math.atan2(m13, m11); } else { this.x = Math.atan2(-m23, m33); this.y = 0; }
    } else {
      this.y = asin(m13);
      if (Math.abs(m13) < lim) { this.x = Math.atan2(-m23, m33); this.z = Math.atan2(-m12, m11); } else { this.x = Math.atan2(m32, m22); this.z = 0; }
    }
    return this;
  }
}

// ---------------------------------------------------------------- matrices
/** 4x4 matrix, `elements` column-major (like three.js); set() takes row-major arguments. */
export class Matrix4 {
  readonly elements: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  set(n11: number, n12: number, n13: number, n14: number, n21: number, n22: number, n23: number, n24: number,
      n31: number, n32: number, n33: number, n34: number, n41: number, n42: number, n43: number, n44: number): Matrix4 {
    const te = this.elements;
    te[0] = n11; te[4] = n12; te[8] = n13; te[12] = n14;
    te[1] = n21; te[5] = n22; te[9] = n23; te[13] = n24;
    te[2] = n31; te[6] = n32; te[10] = n33; te[14] = n34;
    te[3] = n41; te[7] = n42; te[11] = n43; te[15] = n44;
    return this;
  }
  identity(): Matrix4 { return this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1); }
  copy(m: Matrix4): Matrix4 { for (let i = 0; i < 16; i++) this.elements[i] = m.elements[i]; return this; }
  clone(): Matrix4 { return new Matrix4().copy(this); }
  fromArray(a: number[], offset: i32 = 0): Matrix4 { for (let i = 0; i < 16; i++) this.elements[i] = a[offset + i]; return this; }
  toArray(): number[] { return this.elements.slice(); }
  equals(m: Matrix4): boolean { for (let i = 0; i < 16; i++) if (this.elements[i] !== m.elements[i]) return false; return true; }
  multiply(m: Matrix4): Matrix4 { return this.multiplyMatrices(this, m); }
  premultiply(m: Matrix4): Matrix4 { return this.multiplyMatrices(m, this); }
  multiplyMatrices(a: Matrix4, b: Matrix4): Matrix4 {
    const ae = a.elements, be = b.elements, r: number[] = [];
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) r.push(ae[row] * be[c * 4] + ae[4 + row] * be[c * 4 + 1] + ae[8 + row] * be[c * 4 + 2] + ae[12 + row] * be[c * 4 + 3]);
    for (let i = 0; i < 16; i++) this.elements[i] = r[i];
    return this;
  }
  multiplyScalar(s: number): Matrix4 { for (let i = 0; i < 16; i++) this.elements[i] *= s; return this; }
  transpose(): Matrix4 {
    const te = this.elements;
    let t = te[1]; te[1] = te[4]; te[4] = t; t = te[2]; te[2] = te[8]; te[8] = t; t = te[6]; te[6] = te[9]; te[9] = t;
    t = te[3]; te[3] = te[12]; te[12] = t; t = te[7]; te[7] = te[13]; te[13] = t; t = te[11]; te[11] = te[14]; te[14] = t;
    return this;
  }
  setPosition(x: number, y: number, z: number): Matrix4 { this.elements[12] = x; this.elements[13] = y; this.elements[14] = z; return this; }
  makeTranslation(x: number, y: number, z: number): Matrix4 { return this.set(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1); }
  makeScale(x: number, y: number, z: number): Matrix4 { return this.set(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1); }
  makeRotationX(t: number): Matrix4 { const c = Math.cos(t), s = Math.sin(t); return this.set(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1); }
  makeRotationY(t: number): Matrix4 { const c = Math.cos(t), s = Math.sin(t); return this.set(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1); }
  makeRotationZ(t: number): Matrix4 { const c = Math.cos(t), s = Math.sin(t); return this.set(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1); }
  makeRotationFromQuaternion(q: Quaternion): Matrix4 { return this.compose(new Vector3(), q, new Vector3(1, 1, 1)); }
  makeRotationFromEuler(e: Euler): Matrix4 { return this.makeRotationFromQuaternion(new Quaternion().setFromEuler(e)); }
  compose(p: Vector3, q: Quaternion, s: Vector3): Matrix4 {
    const te = this.elements, x = q.x, y = q.y, z = q.z, w = q.w;
    const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    te[0] = (1 - (yy + zz)) * s.x; te[1] = (xy + wz) * s.x; te[2] = (xz - wy) * s.x; te[3] = 0;
    te[4] = (xy - wz) * s.y; te[5] = (1 - (xx + zz)) * s.y; te[6] = (yz + wx) * s.y; te[7] = 0;
    te[8] = (xz + wy) * s.z; te[9] = (yz - wx) * s.z; te[10] = (1 - (xx + yy)) * s.z; te[11] = 0;
    te[12] = p.x; te[13] = p.y; te[14] = p.z; te[15] = 1;
    return this;
  }
  decompose(p: Vector3, q: Quaternion, s: Vector3): Matrix4 {
    const te = this.elements;
    let sx = Math.hypot(Math.hypot(te[0], te[1]), te[2]);
    const sy = Math.hypot(Math.hypot(te[4], te[5]), te[6]), sz = Math.hypot(Math.hypot(te[8], te[9]), te[10]);
    if (this.determinant() < 0) sx = -sx;
    p.set(te[12], te[13], te[14]);
    const m = this.clone(), me = m.elements;
    const ix = sx === 0 ? 0 : 1 / sx, iy = sy === 0 ? 0 : 1 / sy, iz = sz === 0 ? 0 : 1 / sz;
    me[0] *= ix; me[1] *= ix; me[2] *= ix; me[4] *= iy; me[5] *= iy; me[6] *= iy; me[8] *= iz; me[9] *= iz; me[10] *= iz;
    q.setFromRotationMatrix(m);
    s.set(sx, sy, sz);
    return this;
  }
  extractRotation(m: Matrix4): Matrix4 {
    const me = m.elements, te = this.elements;
    const sx = 1 / Math.hypot(Math.hypot(me[0], me[1]), me[2]), sy = 1 / Math.hypot(Math.hypot(me[4], me[5]), me[6]), sz = 1 / Math.hypot(Math.hypot(me[8], me[9]), me[10]);
    te[0] = me[0] * sx; te[1] = me[1] * sx; te[2] = me[2] * sx; te[3] = 0;
    te[4] = me[4] * sy; te[5] = me[5] * sy; te[6] = me[6] * sy; te[7] = 0;
    te[8] = me[8] * sz; te[9] = me[9] * sz; te[10] = me[10] * sz; te[11] = 0;
    te[12] = 0; te[13] = 0; te[14] = 0; te[15] = 1;
    return this;
  }
  /** Rotation looking from eye to target (-z towards the target for cameras is done by the caller swapping them). */
  lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4 {
    const te = this.elements;
    const z = new Vector3().subVectors(eye, target);
    if (z.lengthSq() === 0) z.z = 1;
    z.normalize();
    const x = new Vector3().crossVectors(up, z);
    if (x.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) z.x += 0.0001; else z.z += 0.0001;
      z.normalize();
      x.crossVectors(up, z);
    }
    x.normalize();
    const y = new Vector3().crossVectors(z, x);
    te[0] = x.x; te[4] = y.x; te[8] = z.x;
    te[1] = x.y; te[5] = y.y; te[9] = z.y;
    te[2] = x.z; te[6] = y.z; te[10] = z.z;
    return this;
  }
  determinant(): number { return this.cofactors(new Matrix4(), false); }
  invert(): Matrix4 { this.cofactors(this, true); return this; }
  /** Inverse into `out` (when `write`); returns the determinant. */
  private cofactors(out: Matrix4, write: boolean): number {
    const te = this.elements;
    const n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3], n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7];
    const n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11], n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];
    const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (!write) return det;
    if (det === 0) { out.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); return 0; }
    const d = 1 / det, o = out.elements;
    o[0] = t11 * d;
    o[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * d;
    o[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * d;
    o[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * d;
    o[4] = t12 * d;
    o[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * d;
    o[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * d;
    o[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * d;
    o[8] = t13 * d;
    o[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * d;
    o[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * d;
    o[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * d;
    o[12] = t14 * d;
    o[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * d;
    o[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * d;
    o[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * d;
    return det;
  }
  getMaxScaleOnAxis(): number {
    const te = this.elements;
    return Math.sqrt(Math.max(te[0] * te[0] + te[1] * te[1] + te[2] * te[2], Math.max(te[4] * te[4] + te[5] * te[5] + te[6] * te[6], te[8] * te[8] + te[9] * te[9] + te[10] * te[10])));
  }
  makePerspective(left: number, right: number, top: number, bottom: number, near: number, far: number): Matrix4 {
    const x = 2 * near / (right - left), y = 2 * near / (top - bottom);
    const a = (right + left) / (right - left), b = (top + bottom) / (top - bottom);
    const c = -(far + near) / (far - near), d = -2 * far * near / (far - near);
    return this.set(x, 0, a, 0, 0, y, b, 0, 0, 0, c, d, 0, 0, -1, 0);
  }
  makeOrthographic(left: number, right: number, top: number, bottom: number, near: number, far: number): Matrix4 {
    const w = 1 / (right - left), h = 1 / (top - bottom), p = 1 / (far - near);
    return this.set(2 * w, 0, 0, -(right + left) * w, 0, 2 * h, 0, -(top + bottom) * h, 0, 0, -2 * p, -(far + near) * p, 0, 0, 0, 1);
  }
}

// ---------------------------------------------------------------- boxes and rays
export class Box3 {
  readonly min = new Vector3(Infinity, Infinity, Infinity);
  readonly max = new Vector3(-Infinity, -Infinity, -Infinity);
  constructor(min: Vector3 | null = null, max: Vector3 | null = null) {
    if (min !== null) this.min.copy(min);
    if (max !== null) this.max.copy(max);
  }
  set(min: Vector3, max: Vector3): Box3 { this.min.copy(min); this.max.copy(max); return this; }
  copy(b: Box3): Box3 { return this.set(b.min, b.max); }
  clone(): Box3 { return new Box3().copy(this); }
  makeEmpty(): Box3 { this.min.setScalar(Infinity); this.max.setScalar(-Infinity); return this; }
  isEmpty(): boolean { return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z; }
  expandByPoint(p: Vector3): Box3 { this.min.min(p); this.max.max(p); return this; }
  union(b: Box3): Box3 { this.min.min(b.min); this.max.max(b.max); return this; }
  getCenter(target: Vector3): Vector3 { return this.isEmpty() ? target.set(0, 0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5); }
  getSize(target: Vector3): Vector3 { return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min); }
  containsPoint(p: Vector3): boolean {
    return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y && p.z >= this.min.z && p.z <= this.max.z;
  }
  intersectsBox(b: Box3): boolean {
    return b.max.x >= this.min.x && b.min.x <= this.max.x && b.max.y >= this.min.y && b.min.y <= this.max.y && b.max.z >= this.min.z && b.min.z <= this.max.z;
  }
  /** The box of the 8 transformed corners. */
  applyMatrix4(m: Matrix4): Box3 {
    if (this.isEmpty()) return this;
    const lo = this.min.clone(), hi = this.max.clone(), p = new Vector3();
    this.makeEmpty();
    for (let i = 0; i < 8; i++) this.expandByPoint(p.set((i & 1) !== 0 ? hi.x : lo.x, (i & 2) !== 0 ? hi.y : lo.y, (i & 4) !== 0 ? hi.z : lo.z).applyMatrix4(m));
    return this;
  }
  /** World-space box of an object and its descendants (mesh geometry boxes transformed by their world matrices). */
  setFromObject(object: Object3D): Box3 { this.makeEmpty(); return this.expandByObject(object); }
  expandByObject(object: Object3D): Box3 {
    object.updateWorldMatrix(false, false);
    if (object instanceof Mesh) {
      const g = object.geometry;
      if (g.boundingBox === null) g.computeBoundingBox();
      const b = g.boundingBox;
      if (b !== null) this.union(b.clone().applyMatrix4(object.matrixWorld));
    }
    for (const c of object.children) this.expandByObject(c);
    return this;
  }
}

export class Ray {
  readonly origin: Vector3;
  readonly direction: Vector3;
  constructor(origin: Vector3 | null = null, direction: Vector3 | null = null) {
    this.origin = origin !== null ? origin.clone() : new Vector3();
    this.direction = direction !== null ? direction.clone() : new Vector3(0, 0, -1);
  }
  set(origin: Vector3, direction: Vector3): Ray { this.origin.copy(origin); this.direction.copy(direction); return this; }
  copy(r: Ray): Ray { return this.set(r.origin, r.direction); }
  clone(): Ray { return new Ray(this.origin, this.direction); }
  at(t: number, target: Vector3): Vector3 { return target.copy(this.origin).addScaledVector(this.direction, t); }
  applyMatrix4(m: Matrix4): Ray {
    this.direction.add(this.origin).applyMatrix4(m);
    this.origin.applyMatrix4(m);
    this.direction.sub(this.origin).normalize();
    return this;
  }
  /** Distance along the ray to the box (slab test), -1 when missed. */
  distanceToBox(b: Box3): number {
    const o = this.origin, d = this.direction;
    let tmin = -Infinity, tmax = Infinity;
    const lo: number[] = [b.min.x, b.min.y, b.min.z], hi: number[] = [b.max.x, b.max.y, b.max.z], oo: number[] = [o.x, o.y, o.z], dd: number[] = [d.x, d.y, d.z];
    for (let a = 0; a < 3; a++) {
      if (dd[a] === 0) { if (oo[a] < lo[a] || oo[a] > hi[a]) return -1; continue; }
      const inv = 1 / dd[a];
      let t0 = (lo[a] - oo[a]) * inv, t1 = (hi[a] - oo[a]) * inv;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
      if (tmin > tmax) return -1;
    }
    if (tmax < 0) return -1;
    return tmin >= 0 ? tmin : tmax;
  }
  intersectBox(b: Box3, target: Vector3): Vector3 | null {
    const t = this.distanceToBox(b);
    return t < 0 ? null : this.at(t, target);
  }
  intersectsBox(b: Box3): boolean { return this.distanceToBox(b) >= 0; }
  /** Möller-Trumbore; -1 when missed (or back facing with backfaceCulling). */
  distanceToTriangle(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, backfaceCulling: boolean): number {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const d = this.direction;
    let ddn = d.x * nx + d.y * ny + d.z * nz, sign = 0;
    if (ddn > 0) { if (backfaceCulling) return -1; sign = 1; } else if (ddn < 0) { sign = -1; ddn = -ddn; } else return -1;
    const qx = this.origin.x - ax, qy = this.origin.y - ay, qz = this.origin.z - az;
    // d . (q x e2) and d . (e1 x q)
    const b1 = sign * (d.x * (qy * e2z - qz * e2y) + d.y * (qz * e2x - qx * e2z) + d.z * (qx * e2y - qy * e2x));
    if (b1 < 0) return -1;
    const b2 = sign * (d.x * (e1y * qz - e1z * qy) + d.y * (e1z * qx - e1x * qz) + d.z * (e1x * qy - e1y * qx));
    if (b2 < 0 || b1 + b2 > ddn) return -1;
    const qdn = -sign * (qx * nx + qy * ny + qz * nz);
    return qdn < 0 ? -1 : qdn / ddn;
  }
  intersectTriangle(a: Vector3, b: Vector3, c: Vector3, backfaceCulling: boolean, target: Vector3): Vector3 | null {
    const t = this.distanceToTriangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, backfaceCulling);
    return t < 0 ? null : this.at(t, target);
  }
}

// ---------------------------------------------------------------- colour
/** RGB colour, components 0..1 (sRGB: no colour management). new Color() is white, new Color(0xff8800) a hex colour,
 *  new Color(r, g, b) components; CSS strings go through setStyle / Color.fromStyle. */
export class Color {
  r: number = 1; g: number = 1; b: number = 1;
  constructor(r: number = NaN, g: number = NaN, b: number = NaN) {
    if (!isNaN(g) && !isNaN(b)) this.setRGB(r, g, b);
    else if (!isNaN(r)) this.setHex(r);
  }
  static fromStyle(css: string): Color { return new Color().setStyle(css); }
  set(hex: number): Color { return this.setHex(hex); }
  setHex(hex: number): Color {
    const h = Math.floor(hex);
    this.r = (Math.floor(h / 65536) % 256) / 255; this.g = (Math.floor(h / 256) % 256) / 255; this.b = (h % 256) / 255;
    return this;
  }
  setRGB(r: number, g: number, b: number): Color { this.r = r; this.g = g; this.b = b; return this; }
  setScalar(s: number): Color { return this.setRGB(s, s, s); }
  setHSL(h: number, s: number, l: number): Color {
    const hh = ((h % 1) + 1) % 1, ss = clamp(s, 0, 1), ll = clamp(l, 0, 1);
    if (ss === 0) return this.setRGB(ll, ll, ll);
    const p = ll <= 0.5 ? ll * (1 + ss) : ll + ss - ll * ss, q = 2 * ll - p;
    return this.setRGB(hue2rgb(q, p, hh + 1 / 3), hue2rgb(q, p, hh), hue2rgb(q, p, hh - 1 / 3));
  }
  /** CSS colour: #hex, rgb(), hsl(), names (alpha ignored). */
  setStyle(css: string): Color { const c = parseColor(css); if (c >= 0) this.setHex(c % 16777216); return this; }
  copy(c: Color): Color { return this.setRGB(c.r, c.g, c.b); }
  clone(): Color { return new Color(this.r, this.g, this.b); }
  getHex(): number { return Math.round(clamp(this.r, 0, 1) * 255) * 65536 + Math.round(clamp(this.g, 0, 1) * 255) * 256 + Math.round(clamp(this.b, 0, 1) * 255); }
  getHexString(): string {
    const h = this.getHex();
    const digits = '0123456789abcdef';
    let s = '';
    for (let i = 5; i >= 0; i--) s += digits.at(Math.floor(h / Math.pow(16, i)) % 16);
    return s;
  }
  getStyle(): string { return `rgb(${Math.round(this.r * 255)},${Math.round(this.g * 255)},${Math.round(this.b * 255)})`; }
  add(c: Color): Color { return this.setRGB(this.r + c.r, this.g + c.g, this.b + c.b); }
  multiply(c: Color): Color { return this.setRGB(this.r * c.r, this.g * c.g, this.b * c.b); }
  multiplyScalar(s: number): Color { return this.setRGB(this.r * s, this.g * s, this.b * s); }
  lerp(c: Color, t: number): Color { return this.setRGB(this.r + (c.r - this.r) * t, this.g + (c.g - this.g) * t, this.b + (c.b - this.b) * t); }
  equals(c: Color): boolean { return this.r === c.r && this.g === c.g && this.b === c.b; }
}
function hue2rgb(p: number, q: number, t0: number): number {
  let t = t0;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}

// ---------------------------------------------------------------- scene graph
let nextId: i32 = 1;
const DEFAULT_UP = new Vector3(0, 1, 0);

export class Object3D {
  readonly id: i32;
  name = '';
  type = 'Object3D';
  @weak parent: Object3D | null = null;
  readonly children: Object3D[] = [];
  readonly up: Vector3 = DEFAULT_UP.clone();
  readonly position = new Vector3();
  readonly rotation = new Euler();
  readonly quaternion = new Quaternion();
  readonly scale = new Vector3(1, 1, 1);
  readonly matrix = new Matrix4();
  readonly matrixWorld = new Matrix4();
  matrixAutoUpdate = true;
  matrixWorldAutoUpdate = true;
  visible = true;
  /** Accepted for compatibility: no shadows, no culling, draw order is the scene order. */
  castShadow = false;
  receiveShadow = false;
  frustumCulled = true;
  renderOrder = 0;
  // last synchronized rotation (Euler) and quaternion: whichever the program changed wins at the next update
  private rx = 0; private ry = 0; private rz = 0; private ro = 'XYZ';
  private qx = 0; private qy = 0; private qz = 0; private qw = 1;

  constructor() { this.id = nextId++; }

  /** Brings rotation and quaternion in step (the Euler angles win when both changed). */
  syncRotation(): void {
    const r = this.rotation, q = this.quaternion;
    if (r.x !== this.rx || r.y !== this.ry || r.z !== this.rz || r.order !== this.ro) q.setFromEuler(r);
    else if (q.x !== this.qx || q.y !== this.qy || q.z !== this.qz || q.w !== this.qw) r.setFromQuaternion(q);
    else return;
    this.rx = r.x; this.ry = r.y; this.rz = r.z; this.ro = r.order;
    this.qx = q.x; this.qy = q.y; this.qz = q.z; this.qw = q.w;
  }

  add(object: Object3D): Object3D {
    if (object.id === this.id) return this;
    const p = object.parent;
    if (p !== null) p.remove(object);
    object.parent = this;
    this.children.push(object);
    return this;
  }
  remove(object: Object3D): Object3D {
    const i = this.children.indexOf(object);
    if (i >= 0) { object.parent = null; this.children.splice(i, 1); }
    return this;
  }
  removeFromParent(): Object3D { const p = this.parent; if (p !== null) p.remove(this); return this; }
  clear(): Object3D { for (const c of this.children) c.parent = null; this.children.length = 0; return this; }
  /** Adds `object` keeping its world transform. */
  attach(object: Object3D): Object3D {
    this.updateWorldMatrix(true, false);
    const m = this.matrixWorld.clone().invert();
    const p = object.parent;
    if (p !== null) { p.updateWorldMatrix(true, false); m.multiply(p.matrixWorld); }
    object.applyMatrix4(m);
    object.removeFromParent();
    this.add(object);
    return this;
  }
  getObjectByName(name: string): Object3D | null {
    if (this.name === name) return this;
    for (const c of this.children) { const r = c.getObjectByName(name); if (r !== null) return r; }
    return null;
  }
  getObjectById(id: i32): Object3D | null {
    if (this.id === id) return this;
    for (const c of this.children) { const r = c.getObjectById(id); if (r !== null) return r; }
    return null;
  }
  traverse(cb: (o: Object3D) => void): void { cb(this); for (const c of this.children) c.traverse(cb); }
  traverseVisible(cb: (o: Object3D) => void): void { if (!this.visible) return; cb(this); for (const c of this.children) c.traverseVisible(cb); }
  traverseAncestors(cb: (o: Object3D) => void): void { const p = this.parent; if (p !== null) { cb(p); p.traverseAncestors(cb); } }

  updateMatrix(): void { this.syncRotation(); this.matrix.compose(this.position, this.quaternion, this.scale); }
  updateMatrixWorld(force: boolean = false): void {
    if (this.matrixAutoUpdate) this.updateMatrix();
    const p = this.parent;
    if (p === null) this.matrixWorld.copy(this.matrix); else this.matrixWorld.multiplyMatrices(p.matrixWorld, this.matrix);
    this.afterWorldMatrix();
    for (const c of this.children) c.updateMatrixWorld(force);
  }
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
    const p = this.parent;
    if (updateParents && p !== null) p.updateWorldMatrix(true, false);
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (p === null) this.matrixWorld.copy(this.matrix); else this.matrixWorld.multiplyMatrices(p.matrixWorld, this.matrix);
    this.afterWorldMatrix();
    if (updateChildren) for (const c of this.children) c.updateWorldMatrix(false, true);
  }
  /** Hook for cameras (view matrix). */
  afterWorldMatrix(): void {}
  applyMatrix4(m: Matrix4): void {
    if (this.matrixAutoUpdate) this.updateMatrix();
    this.matrix.premultiply(m);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
    this.syncRotation();
  }
  applyQuaternion(q: Quaternion): Object3D { this.syncRotation(); this.quaternion.premultiply(q); this.syncRotation(); return this; }
  setRotationFromQuaternion(q: Quaternion): void { this.syncRotation(); this.quaternion.copy(q); this.syncRotation(); }
  rotateOnAxis(axis: Vector3, angle: number): Object3D {
    this.syncRotation();
    this.quaternion.multiply(new Quaternion().setFromAxisAngle(axis, angle));
    this.syncRotation();
    return this;
  }
  rotateOnWorldAxis(axis: Vector3, angle: number): Object3D {
    this.syncRotation();
    this.quaternion.premultiply(new Quaternion().setFromAxisAngle(axis, angle));
    this.syncRotation();
    return this;
  }
  rotateX(angle: number): Object3D { return this.rotateOnAxis(new Vector3(1, 0, 0), angle); }
  rotateY(angle: number): Object3D { return this.rotateOnAxis(new Vector3(0, 1, 0), angle); }
  rotateZ(angle: number): Object3D { return this.rotateOnAxis(new Vector3(0, 0, 1), angle); }
  translateOnAxis(axis: Vector3, distance: number): Object3D {
    this.syncRotation();
    this.position.addScaledVector(axis.clone().applyQuaternion(this.quaternion), distance);
    return this;
  }
  translateX(d: number): Object3D { return this.translateOnAxis(new Vector3(1, 0, 0), d); }
  translateY(d: number): Object3D { return this.translateOnAxis(new Vector3(0, 1, 0), d); }
  translateZ(d: number): Object3D { return this.translateOnAxis(new Vector3(0, 0, 1), d); }
  localToWorld(v: Vector3): Vector3 { this.updateWorldMatrix(true, false); return v.applyMatrix4(this.matrixWorld); }
  worldToLocal(v: Vector3): Vector3 { this.updateWorldMatrix(true, false); return v.applyMatrix4(this.matrixWorld.clone().invert()); }
  getWorldPosition(target: Vector3): Vector3 { this.updateWorldMatrix(true, false); return target.setFromMatrixPosition(this.matrixWorld); }
  getWorldQuaternion(target: Quaternion): Quaternion {
    this.updateWorldMatrix(true, false);
    const p = new Vector3(), s = new Vector3();
    this.matrixWorld.decompose(p, target, s);
    return target;
  }
  getWorldScale(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);
    const p = new Vector3(), q = new Quaternion();
    this.matrixWorld.decompose(p, q, target);
    return target;
  }
  /** World +z axis (cameras: the viewing direction, -z). */
  getWorldDirection(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);
    const e = this.matrixWorld.elements;
    return target.set(e[8], e[9], e[10]).normalize();
  }
  /** Rotates the object to face a point (cameras and lights point their -z axis at it). Web: also lookAt(vector),
   *  spelled lookAt(v.x, v.y, v.z) here. */
  lookAt(x: number, y: number, z: number): void {
    const target = new Vector3(x, y, z), pos = new Vector3();
    this.updateWorldMatrix(true, false);
    pos.setFromMatrixPosition(this.matrixWorld);
    const m = new Matrix4();
    if (this.facesMinusZ()) m.lookAt(pos, target, this.up); else m.lookAt(target, pos, this.up);
    this.syncRotation();
    this.quaternion.setFromRotationMatrix(m);
    const p = this.parent;
    if (p !== null) {
      const pq = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(p.matrixWorld));
      this.quaternion.premultiply(pq.invert());
    }
    this.syncRotation();
  }
  facesMinusZ(): boolean { return false; }
}

export class Group extends Object3D {
  constructor() { super(); this.type = 'Group'; }
}

export class Scene extends Object3D {
  /** Clear colour of the frame (null: the renderer's clear colour). */
  background: Color | null = null;
  constructor() { super(); this.type = 'Scene'; }
}

// ---------------------------------------------------------------- cameras
export class Camera extends Object3D {
  readonly matrixWorldInverse = new Matrix4();
  readonly projectionMatrix = new Matrix4();
  readonly projectionMatrixInverse = new Matrix4();
  near: number = 0.1;
  far: number = 2000;
  zoom: number = 1;
  constructor() { super(); this.type = 'Camera'; }
  override facesMinusZ(): boolean { return true; }
  override afterWorldMatrix(): void { this.matrixWorldInverse.copy(this.matrixWorld).invert(); }
  override getWorldDirection(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);
    const e = this.matrixWorld.elements;
    return target.set(-e[8], -e[9], -e[10]).normalize();
  }
  updateProjectionMatrix(): void {}
}

export class PerspectiveCamera extends Camera {
  /** Vertical field of view in degrees. */
  fov: number;
  aspect: number;
  constructor(fov: number = 50, aspect: number = 1, near: number = 0.1, far: number = 2000) {
    super();
    this.type = 'PerspectiveCamera';
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    this.updateProjectionMatrix();
  }
  override updateProjectionMatrix(): void {
    const top = this.near * Math.tan(this.fov * Math.PI / 360) / this.zoom, h = 2 * top, w = this.aspect * h, left = -0.5 * w;
    this.projectionMatrix.makePerspective(left, left + w, top, top - h, this.near, this.far);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}

export class OrthographicCamera extends Camera {
  left: number; right: number; top: number; bottom: number;
  constructor(left: number = -1, right: number = 1, top: number = 1, bottom: number = -1, near: number = 0.1, far: number = 2000) {
    super();
    this.type = 'OrthographicCamera';
    this.left = left; this.right = right; this.top = top; this.bottom = bottom; this.near = near; this.far = far;
    this.updateProjectionMatrix();
  }
  override updateProjectionMatrix(): void {
    const dx = (this.right - this.left) / (2 * this.zoom), dy = (this.top - this.bottom) / (2 * this.zoom);
    const cx = (this.right + this.left) / 2, cy = (this.top + this.bottom) / 2;
    this.projectionMatrix.makeOrthographic(cx - dx, cx + dx, cy + dy, cy - dy, this.near, this.far);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}

// ---------------------------------------------------------------- lights
export class Light extends Object3D {
  readonly color: Color;
  intensity: number;
  constructor(color: number = 0xffffff, intensity: number = 1) { super(); this.type = 'Light'; this.color = new Color(color); this.intensity = intensity; }
  override facesMinusZ(): boolean { return true; }
}
export class AmbientLight extends Light {
  constructor(color: number = 0xffffff, intensity: number = 1) { super(color, intensity); this.type = 'AmbientLight'; }
}
/** Approximated as ambient light: (sky + ground) / 2. */
export class HemisphereLight extends Light {
  readonly groundColor: Color;
  constructor(skyColor: number = 0xffffff, groundColor: number = 0xffffff, intensity: number = 1) {
    super(skyColor, intensity);
    this.type = 'HemisphereLight';
    this.groundColor = new Color(groundColor);
    this.position.copy(DEFAULT_UP);
  }
}
/** Light travelling from `position` towards `target.position` (the target need not be in the scene). */
export class DirectionalLight extends Light {
  target = new Object3D();
  constructor(color: number = 0xffffff, intensity: number = 1) {
    super(color, intensity);
    this.type = 'DirectionalLight';
    this.position.copy(DEFAULT_UP);
  }
}
/** Approximated as a directional light from its position towards the world origin, dimmed with the distance. */
export class PointLight extends Light {
  distance: number;
  decay: number;
  constructor(color: number = 0xffffff, intensity: number = 1, distance: number = 0, decay: number = 2) {
    super(color, intensity);
    this.type = 'PointLight';
    this.distance = distance; this.decay = decay;
  }
}

// ---------------------------------------------------------------- geometry
/** Vertex data as a plain number array (three.js takes typed arrays). */
export class BufferAttribute {
  array: number[];
  readonly itemSize: i32;
  normalized: boolean;
  version: i32 = 0;
  constructor(array: number[], itemSize: i32, normalized: boolean = false) { this.array = array; this.itemSize = itemSize; this.normalized = normalized; }
  get count(): i32 { return this.itemSize > 0 ? Math.floor(this.array.length / this.itemSize) : 0; }
  /** Set to true after changing `array`: the mesh is uploaded again. */
  get needsUpdate(): boolean { return false; }
  set needsUpdate(v: boolean) { if (v) this.version++; }
  getX(i: i32): number { return this.array[i * this.itemSize]; }
  getY(i: i32): number { return this.array[i * this.itemSize + 1]; }
  getZ(i: i32): number { return this.array[i * this.itemSize + 2]; }
  setX(i: i32, v: number): BufferAttribute { this.array[i * this.itemSize] = v; return this; }
  setY(i: i32, v: number): BufferAttribute { this.array[i * this.itemSize + 1] = v; return this; }
  setZ(i: i32, v: number): BufferAttribute { this.array[i * this.itemSize + 2] = v; return this; }
  setXY(i: i32, x: number, y: number): BufferAttribute { this.setX(i, x); return this.setY(i, y); }
  setXYZ(i: i32, x: number, y: number, z: number): BufferAttribute { this.setX(i, x); this.setY(i, y); return this.setZ(i, z); }
}
export class Float32BufferAttribute extends BufferAttribute {}
export class Uint16BufferAttribute extends BufferAttribute {}
export class Uint32BufferAttribute extends BufferAttribute {}

/** The attributes the renderer reads; empty (count 0) when absent. Other names are kept in `custom`. */
export class GeometryAttributes {
  position = new BufferAttribute([], 3);
  normal = new BufferAttribute([], 3);
  uv = new BufferAttribute([], 2);
  color = new BufferAttribute([], 3);
  readonly custom = new Map<string, BufferAttribute>();
}

export class BufferGeometry {
  readonly id: i32;
  name = '';
  type = 'BufferGeometry';
  readonly attributes = new GeometryAttributes();
  index: BufferAttribute | null = null;
  boundingBox: Box3 | null = null;
  /** glTF uv convention (v down); three.js primitives have v up and are flipped for zinc:3d on upload. */
  uvTopLeft = false;
  private gpu: Mesh3D | null = null;
  private gpuVersion: i32 = -1;
  constructor() { this.id = nextId++; }

  setAttribute(name: string, a: BufferAttribute): BufferGeometry {
    if (name === 'position') this.attributes.position = a;
    else if (name === 'normal') this.attributes.normal = a;
    else if (name === 'uv') this.attributes.uv = a;
    else if (name === 'color') this.attributes.color = a;
    else this.attributes.custom.set(name, a);
    return this;
  }
  getAttribute(name: string): BufferAttribute {
    if (name === 'position') return this.attributes.position;
    if (name === 'normal') return this.attributes.normal;
    if (name === 'uv') return this.attributes.uv;
    if (name === 'color') return this.attributes.color;
    return this.attributes.custom.get(name) ?? new BufferAttribute([], 1);
  }
  hasAttribute(name: string): boolean { return this.getAttribute(name).count > 0; }
  deleteAttribute(name: string): BufferGeometry { this.setAttribute(name, new BufferAttribute([], name === 'uv' ? 2 : 3)); this.attributes.custom.delete(name); return this; }
  setIndex(indices: number[]): BufferGeometry { this.index = new BufferAttribute(indices, 1); return this; }
  getIndex(): BufferAttribute | null { return this.index; }
  /** Triangle count (indexed or not). */
  get triangles(): i32 { const ix = this.index; return Math.floor((ix !== null ? ix.array.length : this.attributes.position.count) / 3); }

  computeBoundingBox(): void {
    const b = new Box3(), p = this.attributes.position.array, v = new Vector3();
    for (let i = 0; i + 2 < p.length; i += 3) b.expandByPoint(v.set(p[i], p[i + 1], p[i + 2]));
    this.boundingBox = b;
  }
  /** Smooth normals from the triangles (area weighted). */
  computeVertexNormals(): void {
    const p = this.attributes.position.array, n: number[] = [];
    for (let i = 0; i < p.length; i++) n.push(0);
    const ix = this.index, tri = this.triangles;
    for (let t = 0; t < tri; t++) {
      const a = ix !== null ? ix.array[t * 3] : t * 3, b = ix !== null ? ix.array[t * 3 + 1] : t * 3 + 1, c = ix !== null ? ix.array[t * 3 + 2] : t * 3 + 2;
      const e1x = p[b * 3] - p[a * 3], e1y = p[b * 3 + 1] - p[a * 3 + 1], e1z = p[b * 3 + 2] - p[a * 3 + 2];
      const e2x = p[c * 3] - p[a * 3], e2y = p[c * 3 + 1] - p[a * 3 + 1], e2z = p[c * 3 + 2] - p[a * 3 + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const k of [a, b, c]) { n[k * 3] += nx; n[k * 3 + 1] += ny; n[k * 3 + 2] += nz; }
    }
    for (let i = 0; i + 2 < n.length; i += 3) {
      const l = Math.sqrt(n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2]);
      if (l > 0) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    }
    this.setAttribute('normal', new Float32BufferAttribute(n, 3));
  }
  applyMatrix4(m: Matrix4): BufferGeometry {
    const p = this.attributes.position, v = new Vector3();
    for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m); p.setXYZ(i, v.x, v.y, v.z); }
    const nrm = this.attributes.normal;
    for (let i = 0; i < nrm.count; i++) { v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).transformDirection(m); nrm.setXYZ(i, v.x, v.y, v.z); }
    p.needsUpdate = true; nrm.needsUpdate = true;
    if (this.boundingBox !== null) this.computeBoundingBox();
    return this;
  }
  translate(x: number, y: number, z: number): BufferGeometry { return this.applyMatrix4(new Matrix4().makeTranslation(x, y, z)); }
  scale(x: number, y: number, z: number): BufferGeometry { return this.applyMatrix4(new Matrix4().makeScale(x, y, z)); }
  rotateX(a: number): BufferGeometry { return this.applyMatrix4(new Matrix4().makeRotationX(a)); }
  rotateY(a: number): BufferGeometry { return this.applyMatrix4(new Matrix4().makeRotationY(a)); }
  rotateZ(a: number): BufferGeometry { return this.applyMatrix4(new Matrix4().makeRotationZ(a)); }
  /** Moves the geometry so its bounding box is centred on the origin. */
  center(): BufferGeometry {
    this.computeBoundingBox();
    const c = new Vector3();
    const b = this.boundingBox;
    if (b !== null) b.getCenter(c);
    return this.translate(-c.x, -c.y, -c.z);
  }
  /** Frees the renderer's copy (uploaded again when drawn). */
  dispose(): void { const g = this.gpu; if (g !== null) g.dispose(); this.gpu = null; this.gpuVersion = -1; }

  /** The zinc:3d mesh of this geometry, (re)uploaded when an attribute changed. At most 65535 vertices. */
  uploaded(): Mesh3D | null {
    const a = this.attributes;
    const ix = this.index;
    const version: i32 = a.position.version + a.normal.version + a.uv.version + a.color.version + (ix !== null ? ix.version : 0) + a.position.array.length;
    if (this.gpu !== null && version === this.gpuVersion) return this.gpu;
    this.dispose();
    const n = a.position.count;
    if (n === 0 || n > 65535) return null;
    const idx: i32[] = [];
    if (ix !== null) { for (const v of ix.array) idx.push(v); } else for (let i = 0; i < n; i++) idx.push(i);
    const uv: number[] = [];
    if (a.uv.count >= n) for (let i = 0; i < n; i++) { uv.push(a.uv.array[i * 2]); uv.push(this.uvTopLeft ? a.uv.array[i * 2 + 1] : 1 - a.uv.array[i * 2 + 1]); }
    const col: u32[] = [];
    if (a.color.count >= n) {
      const k = a.color.itemSize;
      for (let i = 0; i < n; i++) col.push(new Color(a.color.array[i * k], a.color.array[i * k + 1], a.color.array[i * k + 2]).getHex());
    }
    const nrm: number[] = a.normal.count >= n ? a.normal.array : [];
    this.gpu = new Mesh3D(a.position.array, idx, nrm, uv, col);
    this.gpuVersion = version;
    return this.gpu;
  }
}

export class BoxGeometry extends BufferGeometry {
  constructor(width: number = 1, height: number = 1, depth: number = 1, widthSegments: i32 = 1, heightSegments: i32 = 1, depthSegments: i32 = 1) {
    super();
    this.type = 'BoxGeometry';
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    // u, v, w axes (0 x, 1 y, 2 z) per face, like three.js buildPlane
    const plane = (u: i32, v: i32, w: i32, udir: number, vdir: number, pw: number, ph: number, pd: number, gx: i32, gy: i32): void => {
      const base = pos.length / 3;
      for (let iy = 0; iy <= gy; iy++) {
        const y = iy * ph / gy - ph / 2;
        for (let ix = 0; ix <= gx; ix++) {
          const x = ix * pw / gx - pw / 2;
          const p: number[] = [0, 0, 0], n: number[] = [0, 0, 0];
          p[u] = x * udir; p[v] = y * vdir; p[w] = pd / 2;
          n[w] = pd > 0 ? 1 : -1;
          for (let k = 0; k < 3; k++) { pos.push(p[k]); nrm.push(n[k]); }
          uv.push(ix / gx); uv.push(1 - iy / gy);
        }
      }
      for (let iy = 0; iy < gy; iy++) {
        for (let ix = 0; ix < gx; ix++) {
          const a = base + ix + (gx + 1) * iy, b = base + ix + (gx + 1) * (iy + 1), c = base + ix + 1 + (gx + 1) * (iy + 1), d = base + ix + 1 + (gx + 1) * iy;
          idx.push(a); idx.push(b); idx.push(d); idx.push(b); idx.push(c); idx.push(d);
        }
      }
    };
    plane(2, 1, 0, -1, -1, depth, height, width, depthSegments, heightSegments);
    plane(2, 1, 0, 1, -1, depth, height, -width, depthSegments, heightSegments);
    plane(0, 2, 1, 1, 1, width, depth, height, widthSegments, depthSegments);
    plane(0, 2, 1, 1, -1, width, depth, -height, widthSegments, depthSegments);
    plane(0, 1, 2, 1, -1, width, height, depth, widthSegments, heightSegments);
    plane(0, 1, 2, -1, -1, width, height, -depth, widthSegments, heightSegments);
    this.adopt(pos, nrm, uv, idx);
  }
  private adopt(pos: number[], nrm: number[], uv: number[], idx: number[]): void {
    this.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    this.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.setIndex(idx);
  }
}

export class SphereGeometry extends BufferGeometry {
  constructor(radius: number = 1, widthSegments: i32 = 32, heightSegments: i32 = 16, phiStart: number = 0, phiLength: number = Math.PI * 2, thetaStart: number = 0, thetaLength: number = Math.PI) {
    super();
    this.type = 'SphereGeometry';
    const ws: i32 = Math.max(3, widthSegments), hs: i32 = Math.max(2, heightSegments), thetaEnd = Math.min(thetaStart + thetaLength, Math.PI);
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let iy = 0; iy <= hs; iy++) {
      const v = iy / hs;
      let uOff = 0;
      if (iy === 0 && thetaStart === 0) uOff = 0.5 / ws; else if (iy === hs && thetaEnd === Math.PI) uOff = -0.5 / ws;
      for (let ix = 0; ix <= ws; ix++) {
        const u = ix / ws;
        const x = -radius * Math.cos(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
        const y = radius * Math.cos(thetaStart + v * thetaLength);
        const z = radius * Math.sin(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
        pos.push(x); pos.push(y); pos.push(z);
        const l = Math.sqrt(x * x + y * y + z * z);
        nrm.push(l > 0 ? x / l : 0); nrm.push(l > 0 ? y / l : 0); nrm.push(l > 0 ? z / l : 0);
        uv.push(u + uOff); uv.push(1 - v);
      }
    }
    for (let iy = 0; iy < hs; iy++) {
      for (let ix = 0; ix < ws; ix++) {
        const a = iy * (ws + 1) + ix + 1, b = iy * (ws + 1) + ix, c = (iy + 1) * (ws + 1) + ix, d = (iy + 1) * (ws + 1) + ix + 1;
        if (iy !== 0 || thetaStart > 0) { idx.push(a); idx.push(b); idx.push(d); }
        if (iy !== hs - 1 || thetaEnd < Math.PI) { idx.push(b); idx.push(c); idx.push(d); }
      }
    }
    this.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    this.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.setIndex(idx);
  }
}

/** In the XY plane, facing +z. */
export class PlaneGeometry extends BufferGeometry {
  constructor(width: number = 1, height: number = 1, widthSegments: i32 = 1, heightSegments: i32 = 1) {
    super();
    this.type = 'PlaneGeometry';
    const gx = widthSegments, gy = heightSegments;
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let iy = 0; iy <= gy; iy++) {
      const y = iy * height / gy - height / 2;
      for (let ix = 0; ix <= gx; ix++) {
        pos.push(ix * width / gx - width / 2); pos.push(-y); pos.push(0);
        nrm.push(0); nrm.push(0); nrm.push(1);
        uv.push(ix / gx); uv.push(1 - iy / gy);
      }
    }
    for (let iy = 0; iy < gy; iy++) {
      for (let ix = 0; ix < gx; ix++) {
        const a = ix + (gx + 1) * iy, b = ix + (gx + 1) * (iy + 1), c = ix + 1 + (gx + 1) * (iy + 1), d = ix + 1 + (gx + 1) * iy;
        idx.push(a); idx.push(b); idx.push(d); idx.push(b); idx.push(c); idx.push(d);
      }
    }
    this.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    this.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.setIndex(idx);
  }
}

/** Around the z axis, like three.js. */
export class TorusGeometry extends BufferGeometry {
  constructor(radius: number = 1, tube: number = 0.4, radialSegments: i32 = 12, tubularSegments: i32 = 48, arc: number = Math.PI * 2) {
    super();
    this.type = 'TorusGeometry';
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= radialSegments; j++) {
      for (let i = 0; i <= tubularSegments; i++) {
        const u = i / tubularSegments * arc, v = j / radialSegments * Math.PI * 2;
        const x = (radius + tube * Math.cos(v)) * Math.cos(u), y = (radius + tube * Math.cos(v)) * Math.sin(u), z = tube * Math.sin(v);
        pos.push(x); pos.push(y); pos.push(z);
        const nx = x - radius * Math.cos(u), ny = y - radius * Math.sin(u), l = Math.sqrt(nx * nx + ny * ny + z * z);
        nrm.push(nx / l); nrm.push(ny / l); nrm.push(z / l);
        uv.push(i / tubularSegments); uv.push(j / radialSegments);
      }
    }
    for (let j = 1; j <= radialSegments; j++) {
      for (let i = 1; i <= tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i - 1, b = (tubularSegments + 1) * (j - 1) + i - 1, c = (tubularSegments + 1) * (j - 1) + i, d = (tubularSegments + 1) * j + i;
        idx.push(a); idx.push(b); idx.push(d); idx.push(b); idx.push(c); idx.push(d);
      }
    }
    this.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    this.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.setIndex(idx);
  }
}

export class CylinderGeometry extends BufferGeometry {
  constructor(radiusTop: number = 1, radiusBottom: number = 1, height: number = 1, radialSegments: i32 = 32, heightSegments: i32 = 1, openEnded: boolean = false) {
    super();
    this.type = 'CylinderGeometry';
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    const half = height / 2, slope = (radiusBottom - radiusTop) / height;
    for (let y = 0; y <= heightSegments; y++) {
      const v = y / heightSegments, r = v * (radiusBottom - radiusTop) + radiusTop;
      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments, t = u * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
        pos.push(r * s); pos.push(-v * height + half); pos.push(r * c);
        const l = Math.sqrt(s * s + slope * slope + c * c);
        nrm.push(s / l); nrm.push(slope / l); nrm.push(c / l);
        uv.push(u); uv.push(1 - v);
      }
    }
    for (let x = 0; x < radialSegments; x++) {
      for (let y = 0; y < heightSegments; y++) {
        const a = y * (radialSegments + 1) + x, b = (y + 1) * (radialSegments + 1) + x, c = (y + 1) * (radialSegments + 1) + x + 1, d = y * (radialSegments + 1) + x + 1;
        idx.push(a); idx.push(b); idx.push(d); idx.push(b); idx.push(c); idx.push(d);
      }
    }
    const cap = (top: boolean): void => {
      const r = top ? radiusTop : radiusBottom, sign = top ? 1 : -1, centre = pos.length / 3;
      for (let x = 1; x <= radialSegments; x++) { pos.push(0); pos.push(half * sign); pos.push(0); nrm.push(0); nrm.push(sign); nrm.push(0); uv.push(0.5); uv.push(0.5); }
      const ring = pos.length / 3;
      for (let x = 0; x <= radialSegments; x++) {
        const t = x / radialSegments * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
        pos.push(r * s); pos.push(half * sign); pos.push(r * c); nrm.push(0); nrm.push(sign); nrm.push(0);
        uv.push(c * 0.5 + 0.5); uv.push(s * 0.5 * sign + 0.5);
      }
      for (let x = 0; x < radialSegments; x++) {
        const c = centre + x, i = ring + x;
        if (top) { idx.push(i); idx.push(i + 1); idx.push(c); } else { idx.push(i + 1); idx.push(i); idx.push(c); }
      }
    };
    if (!openEnded) { if (radiusTop > 0) cap(true); if (radiusBottom > 0) cap(false); }
    this.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    this.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.setIndex(idx);
  }
}
export class ConeGeometry extends CylinderGeometry {
  constructor(radius: number = 1, height: number = 1, radialSegments: i32 = 32, heightSegments: i32 = 1, openEnded: boolean = false) {
    super(0, radius, height, radialSegments, heightSegments, openEnded);
    this.type = 'ConeGeometry';
  }
}

// ---------------------------------------------------------------- textures and materials
/** A texture is a zinc:gfx image (baked asset, runtime image, zinc:canvas Canvas image). */
export class Texture {
  readonly id: i32;
  image: i32;
  name = '';
  /** Accepted for compatibility: textures repeat and are sampled nearest by zinc:3d, uv orientation follows the geometry. */
  flipY = true;
  colorSpace = '';
  wrapS: i32 = RepeatWrapping;
  wrapT: i32 = RepeatWrapping;
  magFilter: i32 = LinearFilter;
  minFilter: i32 = LinearFilter;
  readonly repeat = new Vector2(1, 1);
  readonly offset = new Vector2(0, 0);
  needsUpdate = false;
  constructor(image: i32 = -1) { this.id = nextId++; this.image = image; }
  get width(): i32 { return imageWidth(this.image); }
  get height(): i32 { return imageHeight(this.image); }
  dispose(): void {}
}
export class CanvasTexture extends Texture {}

export interface MaterialParameters {
  name?: string;
  color?: number;
  map?: Texture | null;
  side?: i32;
  flatShading?: boolean;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  visible?: boolean;
  wireframe?: boolean;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  shininess?: number;
}

/** Shared by every material: lighting is Lambert-like (Gouraud, or flat), MeshBasicMaterial is unlit. */
export class Material {
  readonly id: i32;
  name = '';
  type = 'Material';
  readonly color = new Color();
  map: Texture | null = null;
  side: i32 = FrontSide;
  flatShading = false;
  vertexColors = false;
  visible = true;
  /** Accepted for compatibility: drawn opaque, no wireframe. */
  transparent = false;
  opacity = 1;
  wireframe = false;
  depthTest = true;
  depthWrite = true;
  needsUpdate = false;
  // physically based parameters: kept, not rendered
  roughness = 1;
  metalness = 0;
  readonly emissive = new Color(0);
  emissiveIntensity = 1;
  shininess = 30;
  /** Ignores lights (MeshBasicMaterial). */
  unlit = false;
  constructor(p: MaterialParameters | null = null) { this.id = nextId++; if (p !== null) this.setValues(p); }
  setValues(p: MaterialParameters): void {
    if (p.name !== undefined) this.name = p.name;
    if (p.color !== undefined) this.color.setHex(p.color);
    if (p.map !== undefined) this.map = p.map;
    if (p.side !== undefined) this.side = p.side;
    if (p.flatShading !== undefined) this.flatShading = p.flatShading;
    if (p.vertexColors !== undefined) this.vertexColors = p.vertexColors;
    if (p.transparent !== undefined) this.transparent = p.transparent;
    if (p.opacity !== undefined) this.opacity = p.opacity;
    if (p.visible !== undefined) this.visible = p.visible;
    if (p.wireframe !== undefined) this.wireframe = p.wireframe;
    if (p.roughness !== undefined) this.roughness = p.roughness;
    if (p.metalness !== undefined) this.metalness = p.metalness;
    if (p.emissive !== undefined) this.emissive.setHex(p.emissive);
    if (p.emissiveIntensity !== undefined) this.emissiveIntensity = p.emissiveIntensity;
    if (p.shininess !== undefined) this.shininess = p.shininess;
  }
  copy(m: Material): Material {
    this.name = m.name; this.type = m.type; this.color.copy(m.color); this.map = m.map; this.side = m.side;
    this.flatShading = m.flatShading; this.vertexColors = m.vertexColors; this.visible = m.visible; this.transparent = m.transparent;
    this.opacity = m.opacity; this.wireframe = m.wireframe; this.roughness = m.roughness; this.metalness = m.metalness;
    this.emissive.copy(m.emissive); this.emissiveIntensity = m.emissiveIntensity; this.shininess = m.shininess; this.unlit = m.unlit;
    return this;
  }
  /** A Material with the same values (its class is Material: `instanceof MeshStandardMaterial` is false). */
  clone(): Material { return new Material().copy(this); }
  dispose(): void {}
}
export class MeshBasicMaterial extends Material {
  constructor(p: MaterialParameters | null = null) { super(p); this.type = 'MeshBasicMaterial'; this.unlit = true; }
}
export class MeshLambertMaterial extends Material {
  constructor(p: MaterialParameters | null = null) { super(p); this.type = 'MeshLambertMaterial'; }
}
export class MeshPhongMaterial extends Material {
  constructor(p: MaterialParameters | null = null) { super(p); this.type = 'MeshPhongMaterial'; }
}
export class MeshStandardMaterial extends Material {
  constructor(p: MaterialParameters | null = null) { super(p); this.type = 'MeshStandardMaterial'; }
}
export class MeshPhysicalMaterial extends MeshStandardMaterial {
  constructor(p: MaterialParameters | null = null) { super(p); this.type = 'MeshPhysicalMaterial'; }
}

// ---------------------------------------------------------------- meshes and picking
export class Intersection {
  distance: number;
  readonly point: Vector3;
  object: Mesh;
  faceIndex: i32;
  constructor(distance: number, point: Vector3, object: Mesh, faceIndex: i32) { this.distance = distance; this.point = point; this.object = object; this.faceIndex = faceIndex; }
}

export class Mesh extends Object3D {
  geometry: BufferGeometry;
  material: Material;
  constructor(geometry: BufferGeometry | null = null, material: Material | null = null) {
    super();
    this.type = 'Mesh';
    this.geometry = geometry ?? new BufferGeometry();
    const basic: Material = new MeshBasicMaterial();
    this.material = material ?? basic;
  }
  /** Adds this mesh's hits to `out` (every intersected triangle, like three.js). */
  raycast(raycaster: Raycaster, out: Intersection[]): void {
    const g = this.geometry;
    if (g.boundingBox === null) g.computeBoundingBox();
    const box = g.boundingBox;
    if (box === null) return;
    const inv = this.matrixWorld.clone().invert();
    const ray = raycaster.ray.clone().applyMatrix4(inv);
    if (!ray.intersectsBox(box)) return;
    const p = g.attributes.position.array, ix = g.index, tris = g.triangles;
    const cull = this.material.side === FrontSide;
    for (let t = 0; t < tris; t++) {
      const a = (ix !== null ? ix.array[t * 3] : t * 3) * 3, b = (ix !== null ? ix.array[t * 3 + 1] : t * 3 + 1) * 3, c = (ix !== null ? ix.array[t * 3 + 2] : t * 3 + 2) * 3;
      const d = ray.distanceToTriangle(p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2], cull);
      if (d < 0) continue;
      const hit = ray.at(d, new Vector3()).applyMatrix4(this.matrixWorld);
      const dist = raycaster.ray.origin.distanceTo(hit);
      if (dist < raycaster.near || dist > raycaster.far) continue;
      out.push(new Intersection(dist, hit, this, t));
    }
  }
}

export class Raycaster {
  readonly ray: Ray;
  near: number;
  far: number;
  constructor(origin: Vector3 | null = null, direction: Vector3 | null = null, near: number = 0, far: number = Infinity) {
    this.ray = new Ray(origin, direction);
    this.near = near; this.far = far;
  }
  set(origin: Vector3, direction: Vector3): void { this.ray.set(origin, direction); }
  /** Ray through a point in normalized device coordinates (x, y in -1..1, y up). */
  setFromCamera(coords: Vector2, camera: Camera): void {
    camera.updateWorldMatrix(true, false);
    if (camera instanceof OrthographicCamera) {
      this.ray.origin.set(coords.x, coords.y, (camera.near + camera.far) / (camera.near - camera.far)).unproject(camera);
      this.ray.direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
    } else {
      this.ray.origin.setFromMatrixPosition(camera.matrixWorld);
      this.ray.direction.set(coords.x, coords.y, 0.5).unproject(camera).sub(this.ray.origin).normalize();
    }
  }
  intersectObject(object: Object3D, recursive: boolean = true, out: Intersection[] = []): Intersection[] {
    object.updateWorldMatrix(true, false);
    this.collect(object, recursive, out);
    out.sort((a: Intersection, b: Intersection): number => a.distance - b.distance);
    return out;
  }
  intersectObjects(objects: Object3D[], recursive: boolean = true, out: Intersection[] = []): Intersection[] {
    for (const o of objects) { o.updateWorldMatrix(true, false); this.collect(o, recursive, out); }
    out.sort((a: Intersection, b: Intersection): number => a.distance - b.distance);
    return out;
  }
  private collect(o: Object3D, recursive: boolean, out: Intersection[]): void {
    if (o instanceof Mesh) o.raycast(this, out);
    if (recursive) for (const c of o.children) { c.updateWorldMatrix(false, false); this.collect(c, true, out); }
  }
}

// ---------------------------------------------------------------- renderer
/** Where a renderer draws, in screen (logical) pixels; OrbitControls read the pointer inside it. */
export class CanvasElement {
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;
  get clientWidth(): number { return this.width; }
  get clientHeight(): number { return this.height; }
}
export class RenderStats { triangles: i32 = 0; calls: i32 = 0; frame: i32 = 0; }
export class RenderInfo { readonly render = new RenderStats(); }
export class ShadowMap { enabled = false; type: i32 = PCFSoftShadowMap; }
export interface RendererParameters { antialias?: boolean; alpha?: boolean; powerPreference?: string }

/** three.js light intensities (r155+, physically based) to zinc:3d colours: sRGB(intensity x colour / pi). */
function lightHex(r: number, g: number, b: number): u32 {
  const ch = (v: number): number => {
    const x = clamp(v / Math.PI, 0, 1);
    return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255);
  };
  return ch(r) * 65536 + ch(g) * 256 + ch(b);
}

/** Renders into a zinc:3d runtime image drawn in the viewport box (full screen by default). */
export class WebGLRenderer {
  readonly domElement = new CanvasElement();
  readonly info = new RenderInfo();
  readonly shadowMap = new ShadowMap();
  outputColorSpace = SRGBColorSpace;
  toneMapping: i32 = NoToneMapping;
  toneMappingExposure = 1;
  private pixelRatio = 1;
  private readonly clearColor = new Color(0x000000);
  private target: i32 = -1;
  private loop: ((time: number) => void) | null = null;
  private looping = false;
  private elapsed = 0;
  constructor(p: RendererParameters | null = null) { this.domElement.width = width(); this.domElement.height = height(); }
  setSize(w: number, h: number, updateStyle: boolean = true): void { this.domElement.width = w; this.domElement.height = h; }
  getSize(target: Vector2): Vector2 { return target.set(this.domElement.width, this.domElement.height); }
  /** Screen box (top-left origin, unlike WebGL's bottom-left). */
  setViewport(x: number, y: number, w: number, h: number): void { this.domElement.x = x; this.domElement.y = y; this.domElement.width = w; this.domElement.height = h; }
  /** Render resolution multiplier: window.devicePixelRatio renders at the physical resolution of HiDPI screens. */
  setPixelRatio(r: number): void { this.pixelRatio = Math.max(0.25, r); }
  getPixelRatio(): number { return this.pixelRatio; }
  setClearColor(color: number, alpha: number = 1): void { this.clearColor.setHex(color); }
  getClearColor(target: Color): Color { return target.copy(this.clearColor); }
  /** Calls `cb(timeMs)` every frame (zinc:gfx onFrame); null stops it. */
  setAnimationLoop(cb: ((time: number) => void) | null): void {
    this.loop = cb;
    if (this.looping || cb === null) return;
    this.looping = true;
    onFrame((dt: number) => {
      this.elapsed += dt * 1000;
      const f = this.loop;
      if (f !== null) f(this.elapsed);
    });
  }
  render(scene: Scene, camera: Camera): void {
    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
    if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
    const el = this.domElement;
    if (el.width <= 0 || el.height <= 0) return;
    this.target = R.target(this.target, Math.round(el.width * this.pixelRatio), Math.round(el.height * this.pixelRatio));
    if (this.target < 0) return;
    const bg = scene.background ?? this.clearColor;
    let proj = 0, ortho = false;
    if (camera instanceof OrthographicCamera) { proj = (camera.top - camera.bottom) / camera.zoom; ortho = true; }
    else if (camera instanceof PerspectiveCamera) proj = 2 * Math.atan2(Math.tan(camera.fov * Math.PI / 360), camera.zoom);
    else proj = 50 * Math.PI / 180;
    R.begin(this.target, bg.getHex(), camera.matrixWorldInverse.elements, proj, camera.near, camera.far, ortho);
    // lights: ambient and hemisphere lights add up; directional and point lights (up to 4)
    let ar = 0, ag = 0, ab = 0, n: i32 = 0;
    const from = new Vector3(), to = new Vector3();
    scene.traverseVisible((o: Object3D) => {
      if (!(o instanceof Light)) return;
      const c = o.color, i = o.intensity;
      if (o instanceof AmbientLight) { ar += c.r * i; ag += c.g * i; ab += c.b * i; }
      else if (o instanceof HemisphereLight) { ar += (c.r + o.groundColor.r) / 2 * i; ag += (c.g + o.groundColor.g) / 2 * i; ab += (c.b + o.groundColor.b) / 2 * i; }
      else if (n < 4 && o instanceof DirectionalLight) {
        o.getWorldPosition(from); o.target.getWorldPosition(to);
        R.light(to.x - from.x, to.y - from.y, to.z - from.z, lightHex(c.r * i, c.g * i, c.b * i));
        n++;
      } else if (n < 4 && o instanceof PointLight) {
        o.getWorldPosition(from);
        const k = i / Math.max(1, from.lengthSq());
        R.light(-from.x, -from.y, -from.z, lightHex(c.r * k, c.g * k, c.b * k));
        n++;
      }
    });
    R.ambient(lightHex(ar, ag, ab));
    let calls: i32 = 0;
    scene.traverseVisible((o: Object3D) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material;
      if (!m.visible) return;
      const g = o.geometry.uploaded();
      if (g === null) return;
      const vc = m.vertexColors && o.geometry.attributes.color.count > 0;
      const flags: i32 = (vc ? 1 : 0) | (m.flatShading ? 2 : 0) | (m.unlit ? 4 : 0) | (m.side !== FrontSide ? 8 : 0);
      const tex = m.map;
      R.draw(g.handle, o.matrixWorld.elements, m.color.getHex(), tex !== null ? tex.image : -1, flags);
      calls++;
    });
    this.info.render.triangles = R.end();
    this.info.render.calls = calls;
    this.info.render.frame++;
    R.present(this.target, el.x, el.y, el.width, el.height);
  }
  dispose(): void { if (this.target >= 0) R.targetDestroy(this.target); this.target = -1; }
}

// ---------------------------------------------------------------- utilities
/** Wall clock in seconds (zinc:sys clock). */
export class Clock {
  autoStart: boolean;
  startTime = 0;
  oldTime = 0;
  elapsedTime = 0;
  running = false;
  constructor(autoStart: boolean = true) { this.autoStart = autoStart; }
  start(): void { this.startTime = clock(); this.oldTime = this.startTime; this.elapsedTime = 0; this.running = true; }
  stop(): void { this.getElapsedTime(); this.running = false; this.autoStart = false; }
  getElapsedTime(): number { this.getDelta(); return this.elapsedTime; }
  getDelta(): number {
    let diff = 0;
    if (this.autoStart && !this.running) { this.start(); return 0; }
    if (this.running) {
      const now = clock();
      diff = (now - this.oldTime) / 1000;
      this.oldTime = now;
      this.elapsedTime += diff;
    }
    return diff;
  }
}

/** The window of a three.js page: the screen size and its pixel ratio. */
export class Window {
  get innerWidth(): number { return width(); }
  get innerHeight(): number { return height(); }
  get devicePixelRatio(): number { return T.pixelRatio(); }
}
export const window = new Window();

/** Reads a file: embedded asset first, then the file system (hosts). Empty when missing. */
export function readFile(path: string): u8[] {
  if (exists(path)) return readBytes(path);
  const out: u8[] = [];
  T.readFile(path, out);
  return out;
}
/** Decodes %XX escapes of a URI path. */
export function decodeUri(s: string): string {
  if (!s.includes('%')) return s;
  const hex = '0123456789abcdef';
  const bytes: i32[] = [];
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.at(i);
    if (ch === '%' && i + 2 < s.length) {
      const h = hex.indexOf(s.at(i + 1).toLowerCase()), l = hex.indexOf(s.at(i + 2).toLowerCase());
      if (h >= 0 && l >= 0) { bytes.push(h * 16 + l); i += 2; continue; }
    }
    if (bytes.length > 0) { out += utf8(bytes); bytes.length = 0; }
    out += ch;
  }
  if (bytes.length > 0) out += utf8(bytes);
  return out;
}
function utf8(b: i32[]): string {
  let s = '';
  for (let i = 0; i < b.length;) {
    const c = b[i];
    const n: i32 = c < 0x80 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4;
    let cp = n === 1 ? c : n === 2 ? c & 0x1f : n === 3 ? c & 0x0f : c & 0x07;
    for (let k = 1; k < n && i + k < b.length; k++) cp = cp * 64 + (b[i + k] & 0x3f);
    s += String.fromCharCode(cp);
    i += n;
  }
  return s;
}

/** Image files as textures: baked assets (PNG, build time) first, else PNG/JPEG decoded at run time. */
export class TextureLoader {
  path = '';
  setPath(p: string): TextureLoader { this.path = p; return this; }
  load(url: string, onLoad: ((t: Texture) => void) | null = null, onProgress: ((loaded: number) => void) | null = null, onError: ((e: Error) => void) | null = null): Texture {
    const name = this.path + url;
    let img = bakedImage(name);
    if (img < 0) {
      const bytes = readFile(name);
      img = bytes.length > 0 ? T.decode(bytes) : -1;
    }
    const t = new Texture(img);
    t.name = url;
    if (img < 0) { if (onError !== null) onError(new Error(`TextureLoader: cannot load ${name}`)); return t; }
    if (onLoad !== null) onLoad(t);
    return t;
  }
}
