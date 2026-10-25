// zinc:physics2d in the browser: native/physics2d.spec.ts over Box2D 3.1.1 in plain C, built to WebAssembly by the pinned zig (plugin.json "web.wasm").
// The same logic as native/physics2d.host.cpp without zrt: every array argument is (double* pointer, int count) in the module's memory, every array result is
// the count of doubles left in the buffer p2d_out() points to (valid until the next call). web/physics2d.js marshals.
#include <box2d/box2d.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

enum { kBullet = 1, kNoSleep = 4, kFixedRotation = 8, kDisabled = 64, kSensor = 2, kEvents = 8 };
enum { kCircle, kCapsule, kBox, kPolygon, kSegment, kChain };

static char gError[160];
static void fail(const char* why) { snprintf(gError, sizeof gError, "%s", why); }

typedef struct { b2WorldId id; b2BodyId ground; b2ContactData* contacts; int cap; int live; } World;
static World* gWorlds; static int nWorlds;
static b2BodyId* gBodies; static int nBodies;
static b2JointId* gJoints; static int nJoints;
static double* gOut; static int outCap, outLen;

static void* tagOf(int h) { return (void*)(intptr_t)(h + 1); }
static int handleOf(void* tag) { return (int)(intptr_t)tag - 1; }
static int shapeHandle(b2ShapeId s) { return b2Shape_IsValid(s) ? handleOf(b2Body_GetUserData(b2Shape_GetBody(s))) : -1; }
static void out1(double v) { if (outLen == outCap) { outCap = outCap ? outCap * 2 : 256; gOut = (double*)realloc(gOut, sizeof(double) * (size_t)outCap); } gOut[outLen++] = v; }
static void outN(int n, const double* v) { for (int i = 0; i < n; i++) out1(v[i]); }
double* p2d_out(void) { return gOut; }

static World* world(int h) { return h >= 0 && h < nWorlds && gWorlds[h].live ? &gWorlds[h] : 0; }
static World* worldOf(b2BodyId b) {
  b2WorldId w = b2Body_GetWorld(b);
  for (int i = 0; i < nWorlds; i++) if (gWorlds[i].live && gWorlds[i].id.index1 == w.index1 && gWorlds[i].id.generation == w.generation) return &gWorlds[i];
  return 0;
}
static int body(int h, b2BodyId* out) { if (h < 0 || h >= nBodies || !b2Body_IsValid(gBodies[h])) return 0; *out = gBodies[h]; return 1; }
static int joint(int h, b2JointId* out) { if (h < 0 || h >= nJoints || !b2Joint_IsValid(gJoints[h])) return 0; *out = gJoints[h]; return 1; }
static int bodySlot(void) {
  for (int i = 0; i < nBodies; i++) if (B2_IS_NULL(gBodies[i])) return i;
  gBodies = (b2BodyId*)realloc(gBodies, sizeof(b2BodyId) * (size_t)(nBodies + 1)); gBodies[nBodies] = b2_nullBodyId; return nBodies++;
}
static int jointSlot(void) {
  for (int i = 0; i < nJoints; i++) if (B2_IS_NULL(gJoints[i])) return i;
  gJoints = (b2JointId*)realloc(gJoints, sizeof(b2JointId) * (size_t)(nJoints + 1)); gJoints[nJoints] = b2_nullJointId; return nJoints++;
}

static double opt(const double* o, int n, int i, double fb) { return o && i < n && !isnan(o[i]) ? o[i] : fb; }
static int given(const double* o, int n, int i) { return o && i < n && !isnan(o[i]); }
static b2Vec2 vec(double x, double y) { b2Vec2 v = {(float)x, (float)y}; return v; }
static void pushBody(b2BodyId b, b2Transform t) {
  b2Vec2 v = b2Body_GetLinearVelocity(b);
  double r[6] = {t.p.x, t.p.y, b2Rot_GetAngle(t.q), v.x, v.y, b2Body_GetAngularVelocity(b)};
  outN(6, r);
}
static double impulseOf(World* w, b2ShapeId a, b2ShapeId b) {
  int cap = b2Shape_GetContactCapacity(a);
  if (cap <= 0) return 0;
  if (cap > w->cap) { w->contacts = (b2ContactData*)realloc(w->contacts, sizeof(b2ContactData) * (size_t)cap); w->cap = cap; }
  int n = b2Shape_GetContactData(a, w->contacts, cap);
  for (int i = 0; i < n; i++) {
    const b2ContactData* c = &w->contacts[i];
    if (!(B2_ID_EQUALS(c->shapeIdA, a) && B2_ID_EQUALS(c->shapeIdB, b)) && !(B2_ID_EQUALS(c->shapeIdA, b) && B2_ID_EQUALS(c->shapeIdB, a))) continue;
    double sum = 0;
    for (int k = 0; k < c->manifold.pointCount; k++) sum += c->manifold.points[k].totalNormalImpulse;
    return sum;
  }
  return 0;
}
static void dropJointsOf(b2BodyId b) {
  int n = b2Body_GetJointCount(b);
  if (n <= 0) return;
  b2JointId* js = (b2JointId*)malloc(sizeof(b2JointId) * (size_t)n);
  b2Body_GetJoints(b, js, n);
  for (int i = 0; i < n; i++) { int h = handleOf(b2Joint_GetUserData(js[i])); if (h >= 0 && h < nJoints) gJoints[h] = b2_nullJointId; }
  free(js);
}

const char* p2d_version(void) { static char s[32]; b2Version v = b2GetVersion(); snprintf(s, sizeof s, "%d.%d.%d", v.major, v.minor, v.revision); return s; }
const char* p2d_error(void) { return gError; }

int p2d_world_create(const double* o, int n) {
  b2WorldDef d = b2DefaultWorldDef();
  d.gravity = vec(opt(o, n, 0, 0), opt(o, n, 1, -9.81));
  d.maximumLinearSpeed = (float)opt(o, n, 2, d.maximumLinearSpeed);
  d.restitutionThreshold = (float)opt(o, n, 3, d.restitutionThreshold);
  d.maxContactPushSpeed = (float)opt(o, n, 4, d.maxContactPushSpeed);
  d.contactHertz = (float)opt(o, n, 5, d.contactHertz);
  d.contactDampingRatio = (float)opt(o, n, 6, d.contactDampingRatio);
  d.enableSleep = opt(o, n, 7, 1) != 0;
  d.enableContinuous = opt(o, n, 8, 1) != 0;
  b2WorldId id = b2CreateWorld(&d);
  if (B2_IS_NULL(id)) { fail("too many worlds at once (Box2D holds 128)"); return -1; }
  int h = -1;
  for (int i = 0; i < nWorlds; i++) if (!gWorlds[i].live) { h = i; break; }
  if (h < 0) { gWorlds = (World*)realloc(gWorlds, sizeof(World) * (size_t)(nWorlds + 1)); h = nWorlds++; gWorlds[h].contacts = 0; gWorlds[h].cap = 0; }
  gWorlds[h].id = id; gWorlds[h].ground = b2_nullBodyId; gWorlds[h].live = 1;
  return h;
}
void p2d_world_destroy(int h) {
  World* w = world(h);
  if (!w) return;
  uint16_t index = (uint16_t)(w->id.index1 - 1);
  for (int i = 0; i < nBodies; i++) if (!B2_IS_NULL(gBodies[i]) && gBodies[i].world0 == index) gBodies[i] = b2_nullBodyId;
  for (int i = 0; i < nJoints; i++) if (!B2_IS_NULL(gJoints[i]) && gJoints[i].world0 == index) gJoints[i] = b2_nullJointId;
  b2DestroyWorld(w->id);
  w->live = 0;
}
void p2d_world_gravity(int h, double x, double y) { World* w = world(h); if (w) b2World_SetGravity(w->id, vec(x, y)); }
void p2d_step(int h, double dt, int sub) { World* w = world(h); if (w && dt > 0) b2World_Step(w->id, (float)dt, sub < 1 ? 1 : sub); }
int p2d_moved(int h) {
  outLen = 0;
  World* w = world(h);
  if (!w) return 0;
  b2BodyEvents e = b2World_GetBodyEvents(w->id);
  for (int i = 0; i < e.moveCount; i++) {
    int hb = handleOf(e.moveEvents[i].userData);
    if (hb < 0) continue;
    out1(hb); pushBody(e.moveEvents[i].bodyId, e.moveEvents[i].transform);
  }
  return outLen;
}
static void ev(double kind, int a, int b, double x, double y, double nx, double ny, double speed, double imp) {
  double r[9] = {kind, a, b, x, y, nx, ny, speed, imp}; outN(9, r);
}
int p2d_events(int h) {
  outLen = 0;
  World* w = world(h);
  if (!w) return 0;
  b2ContactEvents c = b2World_GetContactEvents(w->id);
  b2SensorEvents s = b2World_GetSensorEvents(w->id);
  for (int i = 0; i < c.beginCount; i++) {
    const b2ContactBeginTouchEvent* e = &c.beginEvents[i];
    const b2Manifold* m = &e->manifold;
    double x = 0, y = 0, speed = 0;
    for (int k = 0; k < m->pointCount; k++) { x += m->points[k].point.x / m->pointCount; y += m->points[k].point.y / m->pointCount; speed = fmax(speed, -m->points[k].normalVelocity); }
    ev(0, shapeHandle(e->shapeIdA), shapeHandle(e->shapeIdB), x, y, m->normal.x, m->normal.y, speed, impulseOf(w, e->shapeIdA, e->shapeIdB));
  }
  for (int i = 0; i < c.hitCount; i++) {
    const b2ContactHitEvent* e = &c.hitEvents[i];
    ev(1, shapeHandle(e->shapeIdA), shapeHandle(e->shapeIdB), e->point.x, e->point.y,
       e->normal.x, e->normal.y, e->approachSpeed, impulseOf(w, e->shapeIdA, e->shapeIdB));
  }
  for (int i = 0; i < c.endCount; i++) ev(2, shapeHandle(c.endEvents[i].shapeIdA), shapeHandle(c.endEvents[i].shapeIdB), 0, 0, 0, 0, 0, 0);
  for (int i = 0; i < s.beginCount; i++) ev(4, shapeHandle(s.beginEvents[i].sensorShapeId), shapeHandle(s.beginEvents[i].visitorShapeId), 0, 0, 0, 0, 0, 0);
  for (int i = 0; i < s.endCount; i++) ev(6, shapeHandle(s.endEvents[i].sensorShapeId), shapeHandle(s.endEvents[i].visitorShapeId), 0, 0, 0, 0, 0, 0);
  return outLen;
}
int p2d_awake_count(int h) { World* w = world(h); return w ? b2World_GetAwakeBodyCount(w->id) : 0; }
int p2d_ray_cast(int h, double ox, double oy, double dx, double dy, unsigned mask) {
  outLen = 0;
  World* w = world(h);
  if (!w) return 0;
  b2QueryFilter f = {UINT64_MAX, (uint64_t)mask};
  b2RayResult r = b2World_CastRayClosest(w->id, vec(ox, oy), vec(dx, dy), f);
  if (!r.hit) return 0;
  double v[6] = {shapeHandle(r.shapeId), r.fraction, r.point.x, r.point.y, r.normal.x, r.normal.y};
  outN(6, v);
  return outLen;
}

int p2d_body_create(int hw, const double* o, int n) {
  World* w = world(hw);
  if (!w) { fail("no such world"); return -1; }
  int motion = (int)opt(o, n, 0, 2), flags = (int)opt(o, n, 10, 0);
  if (motion < 0 || motion > 2) { fail("motion is 0 (static), 1 (kinematic) or 2 (dynamic)"); return -1; }
  b2BodyDef d = b2DefaultBodyDef();
  d.type = motion == 0 ? b2_staticBody : motion == 1 ? b2_kinematicBody : b2_dynamicBody;
  d.position = vec(opt(o, n, 1, 0), opt(o, n, 2, 0));
  d.rotation = b2MakeRot((float)opt(o, n, 3, 0));
  d.linearVelocity = vec(opt(o, n, 4, 0), opt(o, n, 5, 0));
  d.angularVelocity = (float)opt(o, n, 6, 0);
  d.linearDamping = (float)opt(o, n, 7, d.linearDamping);
  d.angularDamping = (float)opt(o, n, 8, d.angularDamping);
  d.gravityScale = (float)opt(o, n, 9, d.gravityScale);
  d.isBullet = (flags & kBullet) != 0;
  d.enableSleep = !(flags & kNoSleep);
  d.fixedRotation = (flags & kFixedRotation) != 0;
  d.isEnabled = !(flags & kDisabled);
  int h = bodySlot();
  d.userData = tagOf(h);
  gBodies[h] = b2CreateBody(w->id, &d);
  return h;
}
#define AT(i) ((i) < n ? g[i] : 0.0)
int p2d_body_shape(int hb, int kind, const double* g, int n, const double* o, int on) {
  b2BodyId b;
  if (!body(hb, &b)) { fail("no such body"); return 0; }
  b2ShapeDef d = b2DefaultShapeDef();
  d.material.friction = (float)opt(o, on, 0, d.material.friction);
  d.material.restitution = (float)opt(o, on, 1, d.material.restitution);
  d.density = (float)opt(o, on, 2, d.density);
  d.filter.categoryBits = (uint64_t)1 << ((int)opt(o, on, 3, 0) & 31);
  d.filter.maskBits = (uint64_t)(uint32_t)opt(o, on, 4, 4294967295.0);
  int flags = (int)opt(o, on, 5, 0);
  d.isSensor = (flags & kSensor) != 0;
  d.enableContactEvents = (flags & kEvents) != 0;
  d.enableHitEvents = (flags & kEvents) != 0;
  d.enableSensorEvents = 1;
  b2Vec2 pts[256]; int np = 0;   // ponytail: 256 points of a chain at most; raise when a level needs more
  int first = kind == kPolygon || kind == kChain ? 1 : 0;
  for (int i = first; i + 1 < n && np < 256; i += 2) pts[np++] = vec(g[i], g[i + 1]);
  switch (kind) {
    case kCircle: { if (!(AT(0) > 0)) { fail("a circle needs a radius above 0"); return 0; } b2Circle c = {vec(AT(1), AT(2)), (float)AT(0)}; b2CreateCircleShape(b, &d, &c); return 1; }
    case kCapsule: { if (!(AT(4) > 0)) { fail("a capsule needs a radius above 0"); return 0; } b2Capsule c = {vec(AT(0), AT(1)), vec(AT(2), AT(3)), (float)AT(4)}; b2CreateCapsuleShape(b, &d, &c); return 1; }
    case kBox: {
      if (!(AT(0) > 0) || !(AT(1) > 0)) { fail("a box needs half extents above 0"); return 0; }
      b2Polygon p = b2MakeOffsetRoundedBox((float)AT(0), (float)AT(1), vec(AT(2), AT(3)), b2MakeRot((float)AT(4)), (float)fmax(0, AT(5)));
      b2CreatePolygonShape(b, &d, &p); return 1;
    }
    case kPolygon: {
      if (np < 3 || np > B2_MAX_POLYGON_VERTICES) { fail("a polygon has 3 to 8 points"); return 0; }
      b2Hull hull = b2ComputeHull(pts, np);
      if (hull.count == 0) { fail("the points of the polygon are too close or in one line"); return 0; }
      b2Polygon p = b2MakePolygon(&hull, (float)fmax(0, AT(0)));
      b2CreatePolygonShape(b, &d, &p); return 1;
    }
    case kSegment: { b2Segment s = {vec(AT(0), AT(1)), vec(AT(2), AT(3))}; b2CreateSegmentShape(b, &d, &s); return 1; }
    case kChain: {
      if (np < 4) { fail("a chain has at least 4 points"); return 0; }
      b2ChainDef c = b2DefaultChainDef();
      b2SurfaceMaterial m = b2DefaultSurfaceMaterial();
      m.friction = d.material.friction; m.restitution = d.material.restitution;
      c.points = pts; c.count = np; c.materials = &m; c.materialCount = 1; c.filter = d.filter; c.isLoop = AT(0) != 0; c.enableSensorEvents = 1;
      b2CreateChain(b, &c); return 1;
    }
    default: fail("no such kind of shape"); return 0;
  }
}
void p2d_body_destroy(int h) { b2BodyId b; if (!body(h, &b)) return; dropJointsOf(b); b2DestroyBody(b); gBodies[h] = b2_nullBodyId; }
int p2d_body_state(int h) {
  outLen = 0;
  b2BodyId b;
  if (!body(h, &b)) return 0;
  pushBody(b, b2Body_GetTransform(b));
  out1(b2Body_IsAwake(b) ? 1 : 0);
  return outLen;
}
double p2d_body_mass(int h) { b2BodyId b; return body(h, &b) ? b2Body_GetMass(b) : 0; }
void p2d_body_set_transform(int h, double x, double y, double a) { b2BodyId b; if (!body(h, &b)) return; b2Body_SetTransform(b, vec(x, y), b2MakeRot((float)a)); if (b2Body_GetType(b) != b2_staticBody) b2Body_SetAwake(b, 1); }
void p2d_body_set_velocity(int h, double vx, double vy, double w) { b2BodyId b; if (!body(h, &b)) return; b2Body_SetLinearVelocity(b, vec(vx, vy)); b2Body_SetAngularVelocity(b, (float)w); }
void p2d_body_move_to(int h, double x, double y, double a, double dt) { b2BodyId b; if (body(h, &b) && dt > 0) { b2Transform t = {vec(x, y), b2MakeRot((float)a)}; b2Body_SetTargetTransform(b, t, (float)dt); } }
void p2d_body_push(int h, int kind, double x, double y, double px, double py) {
  b2BodyId b;
  if (!body(h, &b)) return;
  if (kind == 0) b2Body_ApplyLinearImpulseToCenter(b, vec(x, y), 1);
  else if (kind == 1) b2Body_ApplyLinearImpulse(b, vec(x, y), vec(px, py), 1);
  else if (kind == 2) b2Body_ApplyAngularImpulse(b, (float)x, 1);
  else if (kind == 3) b2Body_ApplyForceToCenter(b, vec(x, y), 1);
  else if (kind == 4) b2Body_ApplyTorque(b, (float)x, 1);
}
void p2d_body_set_material(int h, double f, double r) {
  b2BodyId b;
  if (!body(h, &b)) return;
  int n = b2Body_GetShapeCount(b);
  if (n <= 0) return;
  b2ShapeId* s = (b2ShapeId*)malloc(sizeof(b2ShapeId) * (size_t)n);
  b2Body_GetShapes(b, s, n);
  for (int i = 0; i < n; i++) { b2Shape_SetFriction(s[i], (float)f); b2Shape_SetRestitution(s[i], (float)r); }
  free(s);
}
void p2d_body_set_motion(int h, int m) { b2BodyId b; if (body(h, &b) && m >= 0 && m <= 2) b2Body_SetType(b, m == 0 ? b2_staticBody : m == 1 ? b2_kinematicBody : b2_dynamicBody); }
void p2d_body_set_gravity_scale(int h, double s) { b2BodyId b; if (body(h, &b)) b2Body_SetGravityScale(b, (float)s); }
void p2d_body_awake(int h, int on) { b2BodyId b; if (body(h, &b)) b2Body_SetAwake(b, on != 0); }
void p2d_body_enable(int h, int on) { b2BodyId b; if (!body(h, &b) || (b2Body_IsEnabled(b) != 0) == (on != 0)) return; if (on) b2Body_Enable(b); else b2Body_Disable(b); }

static int pair(int ha, int hb, b2BodyId* a, b2BodyId* b, World** w) {
  if (!body(ha, a) || (hb >= 0 && (!body(hb, b) || b->world0 != a->world0)) || !(*w = worldOf(*a))) { fail("a joint joins two bodies of one world, or a body and the world (-1)"); return 0; }
  if (hb < 0) {
    if (B2_IS_NULL((*w)->ground)) { b2BodyDef d = b2DefaultBodyDef(); (*w)->ground = b2CreateBody((*w)->id, &d); }
    *b = (*w)->ground;
  }
  return 1;
}
static int keep(b2JointId j) { int h = jointSlot(); gJoints[h] = j; b2Joint_SetUserData(j, tagOf(h)); return h; }
int p2d_revolute(int ha, int hb, double px, double py, const double* o, int n) {
  b2BodyId a, b; World* w;
  if (!pair(ha, hb, &a, &b, &w)) return -1;
  b2RevoluteJointDef d = b2DefaultRevoluteJointDef();
  d.bodyIdA = b; d.bodyIdB = a;
  d.localAnchorA = b2Body_GetLocalPoint(b, vec(px, py)); d.localAnchorB = b2Body_GetLocalPoint(a, vec(px, py));
  d.referenceAngle = b2RelativeAngle(b2Body_GetRotation(a), b2Body_GetRotation(b));
  if (given(o, n, 0) && given(o, n, 1)) { d.enableLimit = 1; d.lowerAngle = (float)o[0]; d.upperAngle = (float)o[1]; }
  d.collideConnected = opt(o, n, 2, 0) != 0;
  return keep(b2CreateRevoluteJoint(w->id, &d));
}
int p2d_prismatic(int ha, int hb, double px, double py, double dx, double dy, const double* o, int n) {
  b2BodyId a, b; World* w;
  if (!pair(ha, hb, &a, &b, &w)) return -1;
  if (!(dx * dx + dy * dy > 0)) { fail("a prismatic joint needs an axis"); return -1; }
  b2PrismaticJointDef d = b2DefaultPrismaticJointDef();
  d.bodyIdA = b; d.bodyIdB = a;
  d.localAnchorA = b2Body_GetLocalPoint(b, vec(px, py)); d.localAnchorB = b2Body_GetLocalPoint(a, vec(px, py));
  d.localAxisA = b2Body_GetLocalVector(b, b2Normalize(vec(dx, dy)));
  d.referenceAngle = b2RelativeAngle(b2Body_GetRotation(a), b2Body_GetRotation(b));
  if (given(o, n, 0) && given(o, n, 1)) { d.enableLimit = 1; d.lowerTranslation = (float)o[0]; d.upperTranslation = (float)o[1]; }
  d.collideConnected = opt(o, n, 2, 0) != 0;
  return keep(b2CreatePrismaticJoint(w->id, &d));
}
void p2d_joint_motor(int h, int mode, double target, double limit, double freq, double damping) {
  b2JointId j;
  if (!joint(h, &j) || mode < 0 || mode > 2) return;
  float most = limit > 0 ? (float)limit : 0, hz = freq > 0 ? (float)freq : 2, ratio = damping > 0 ? (float)damping : 1;
  if (b2Joint_GetType(j) == b2_revoluteJoint) {
    b2RevoluteJoint_EnableMotor(j, mode == 1); b2RevoluteJoint_EnableSpring(j, mode == 2);
    if (mode == 1) { b2RevoluteJoint_SetMotorSpeed(j, (float)target); b2RevoluteJoint_SetMaxMotorTorque(j, most); }
    if (mode == 2) { b2RevoluteJoint_SetSpringHertz(j, hz); b2RevoluteJoint_SetSpringDampingRatio(j, ratio); b2RevoluteJoint_SetTargetAngle(j, (float)target); }
  } else {
    b2PrismaticJoint_EnableMotor(j, mode == 1); b2PrismaticJoint_EnableSpring(j, mode == 2);
    if (mode == 1) { b2PrismaticJoint_SetMotorSpeed(j, (float)target); b2PrismaticJoint_SetMaxMotorForce(j, most); }
    if (mode == 2) { b2PrismaticJoint_SetSpringHertz(j, hz); b2PrismaticJoint_SetSpringDampingRatio(j, ratio); b2PrismaticJoint_SetTargetTranslation(j, (float)target); }
  }
  b2Joint_WakeBodies(j);
}
void p2d_joint_limits(int h, double lo, double hi) {
  b2JointId j;
  if (!joint(h, &j) || !(lo <= hi)) return;
  if (b2Joint_GetType(j) == b2_revoluteJoint) { b2RevoluteJoint_EnableLimit(j, 1); b2RevoluteJoint_SetLimits(j, (float)lo, (float)hi); }
  else { b2PrismaticJoint_EnableLimit(j, 1); b2PrismaticJoint_SetLimits(j, (float)lo, (float)hi); }
  b2Joint_WakeBodies(j);
}
double p2d_joint_value(int h) { b2JointId j; if (!joint(h, &j)) return 0; return b2Joint_GetType(j) == b2_revoluteJoint ? b2RevoluteJoint_GetAngle(j) : b2PrismaticJoint_GetTranslation(j); }
void p2d_joint_destroy(int h) { b2JointId j; if (!joint(h, &j)) return; b2DestroyJoint(j); gJoints[h] = b2_nullJointId; }
