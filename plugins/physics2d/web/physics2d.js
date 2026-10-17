// zinc:physics2d in the browser: the native side of plugins/physics2d/native/physics2d.spec.ts over Box2D 3.1.1 compiled to WebAssembly (docs/targets/web.md,
// "Plugins"; web/physics2d_web.c is the C shim, the spec's functions over Box2D with a plain C ABI). Calls are synchronous, as on a desktop. Array arguments are
// copied into the module's memory for the call; array results are read from the buffer the shim leaves (p2d_out). index.ts runs unchanged.
const Z = globalThis.__zincWeb;
let ex = null;
const dec = new TextDecoder();

function api() { if (!ex) ex = Z.wasmInstance('physics2d').exports; return ex; }
function cstr(p) { const a = new Uint8Array(ex.memory.buffer); let e = p; while (a[e]) e++; return dec.decode(a.subarray(p, e)); }
// a JS array of numbers as doubles in wasm memory: f(pointer, count), then freed
function withF64(arr, f) {
  const n = arr ? arr.length : 0, p = ex.malloc(8 * n + 8);
  new Float64Array(ex.memory.buffer, p, n).set(arr || []);
  try { return f(p, n); } finally { ex.free(p); }
}
const result = (n) => n > 0 ? Array.from(new Float64Array(ex.memory.buffer, ex.p2d_out(), n)) : [];

Z.registerNative('Physics2D', {
  version() { api(); return cstr(ex.p2d_version()); },
  error() { api(); return cstr(ex.p2d_error()); },
  worldCreate(o) { api(); return withF64(o, (p, n) => ex.p2d_world_create(p, n)); },
  worldDestroy(w) { api(); ex.p2d_world_destroy(w); },
  worldGravity(w, x, y) { api(); ex.p2d_world_gravity(w, x, y); },
  step(w, dt, sub) { api(); ex.p2d_step(w, dt, sub); },
  moved(w) { api(); return result(ex.p2d_moved(w)); },
  events(w) { api(); return result(ex.p2d_events(w)); },
  awakeCount(w) { api(); return ex.p2d_awake_count(w); },
  rayCast(w, ox, oy, dx, dy, mask) { api(); return result(ex.p2d_ray_cast(w, ox, oy, dx, dy, mask)); },
  bodyCreate(w, o) { api(); return withF64(o, (p, n) => ex.p2d_body_create(w, p, n)); },
  bodyShape(b, kind, g, o) { api(); return withF64(g, (gp, gn) => withF64(o, (op, on) => ex.p2d_body_shape(b, kind, gp, gn, op, on))) !== 0; },
  bodyDestroy(b) { api(); ex.p2d_body_destroy(b); },
  bodyState(b) { api(); return result(ex.p2d_body_state(b)); },
  bodyMass(b) { api(); return ex.p2d_body_mass(b); },
  bodySetTransform(b, x, y, a) { api(); ex.p2d_body_set_transform(b, x, y, a); },
  bodySetVelocity(b, vx, vy, w) { api(); ex.p2d_body_set_velocity(b, vx, vy, w); },
  bodyMoveTo(b, x, y, a, dt) { api(); ex.p2d_body_move_to(b, x, y, a, dt); },
  bodyPush(b, kind, x, y, px, py) { api(); ex.p2d_body_push(b, kind, x, y, px, py); },
  bodySetMaterial(b, f, r) { api(); ex.p2d_body_set_material(b, f, r); },
  bodySetMotion(b, m) { api(); ex.p2d_body_set_motion(b, m); },
  bodySetGravityScale(b, s) { api(); ex.p2d_body_set_gravity_scale(b, s); },
  bodyAwake(b, on) { api(); ex.p2d_body_awake(b, on ? 1 : 0); },
  bodyEnable(b, on) { api(); ex.p2d_body_enable(b, on ? 1 : 0); },
  revolute(a, b, px, py, o) { api(); return withF64(o, (p, n) => ex.p2d_revolute(a, b, px, py, p, n)); },
  prismatic(a, b, px, py, dx, dy, o) { api(); return withF64(o, (p, n) => ex.p2d_prismatic(a, b, px, py, dx, dy, p, n)); },
  jointMotor(j, mode, target, limit, freq, damping) { api(); ex.p2d_joint_motor(j, mode, target, limit, freq, damping); },
  jointLimits(j, lo, hi) { api(); ex.p2d_joint_limits(j, lo, hi); },
  jointValue(j) { api(); return ex.p2d_joint_value(j); },
  jointDestroy(j) { api(); ex.p2d_joint_destroy(j); },
}, ['wasm']);
