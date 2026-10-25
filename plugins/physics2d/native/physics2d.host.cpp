// zinc:physics2d for macos and linux: Box2D 3.1.1 (vendor/box2d, built by vendor/box2d.c) behind handle tables. One thread:
// a world given no task system runs its tasks in place, so a step is the same sequence of operations on every run and the
// events come in a fixed order. Box2D's ids carry a generation, so a stale handle is caught by b2*_IsValid before any call.
#define ZRT_HOSTED_CPP   // zrt.h takes <new> from the standard library, which <vector> includes too
#include "zinc_native_physics2d.h"

#include <box2d/box2d.h>

#include <cfloat>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace { std::uint64_t gStepCount = 0; }
extern "C" std::uint64_t zn_physics2d_step_count() { return gStepCount; }

namespace {

const int kEventSize = 9, kMovedSize = 7;
enum : int { kBullet = 1, kNoSleep = 4, kFixedRotation = 8, kDisabled = 64 };   // body flags
enum : int { kSensor = 2, kEvents = 8 };                                        // shape flags
enum : int { kCircle, kCapsule, kBox, kPolygon, kSegment, kChain };

std::string gError;
void fail(const char* why) { gError = why; }

struct World {
  explicit World(b2WorldId w) : id(w) {}
  b2WorldId id;
  b2BodyId ground = b2_nullBodyId;   // the static body a joint to the world (-1) is attached to, made at the first one
  std::vector<b2ContactData> contacts;
};

std::vector<World*> gWorlds;
std::vector<b2BodyId> gBodies;
std::vector<b2JointId> gJoints;

// The program's handle rides in the user data, plus one: the ground body and Box2D's own ids carry 0.
void* tagOf(int32_t h) { return reinterpret_cast<void*>(intptr_t(h) + 1); }
int32_t handleOf(void* tag) { return int32_t(reinterpret_cast<intptr_t>(tag)) - 1; }
int32_t handleOf(b2ShapeId s) { return b2Shape_IsValid(s) ? handleOf(b2Body_GetUserData(b2Shape_GetBody(s))) : -1; }

template <class Id> int32_t slot(std::vector<Id>& v) {
  for (size_t i = 0; i < v.size(); i++) if (B2_IS_NULL(v[i])) return int32_t(i);
  v.push_back(Id{});
  return int32_t(v.size() - 1);
}
World* world(int32_t h) { return h >= 0 && size_t(h) < gWorlds.size() ? gWorlds[size_t(h)] : nullptr; }
World* worldOf(b2BodyId b) {
  const b2WorldId w = b2Body_GetWorld(b);
  for (World* x : gWorlds) if (x && x->id.index1 == w.index1 && x->id.generation == w.generation) return x;
  return nullptr;
}
bool body(int32_t h, b2BodyId& out) {
  if (h < 0 || size_t(h) >= gBodies.size() || !b2Body_IsValid(gBodies[size_t(h)])) return false;
  out = gBodies[size_t(h)];
  return true;
}
bool joint(int32_t h, b2JointId& out) {
  if (h < 0 || size_t(h) >= gJoints.size() || !b2Joint_IsValid(gJoints[size_t(h)])) return false;
  out = gJoints[size_t(h)];
  return true;
}

bool given(double v) { return !std::isnan(v); }
double opt(const zrt::Array<double>& o, int32_t i) { return o.a && i < o.length() ? o.a->data[i] : NAN; }
double opt(const zrt::Array<double>& o, int32_t i, double fallback) { double v = opt(o, i); return given(v) ? v : fallback; }
b2Vec2 vec(double x, double y) { return b2Vec2{float(x), float(y)}; }

void push(zrt::Array<double>& out, std::initializer_list<double> xs) { for (double x : xs) out.push_raw(x); }
void pushBody(zrt::Array<double>& out, b2BodyId b, b2Transform t) {
  const b2Vec2 v = b2Body_GetLinearVelocity(b);
  push(out, {double(t.p.x), double(t.p.y), double(b2Rot_GetAngle(t.q)), double(v.x), double(v.y), double(b2Body_GetAngularVelocity(b))});
}

// The impulse the solver applied to the contact of two shapes in the last step: Box2D records a contact's begin before
// it solves, so it is read back from the contact afterwards.
double impulseOf(World* w, b2ShapeId a, b2ShapeId b) {
  const int cap = b2Shape_GetContactCapacity(a);
  if (cap <= 0) return 0;
  w->contacts.resize(size_t(cap));
  const int n = b2Shape_GetContactData(a, w->contacts.data(), cap);
  for (int i = 0; i < n; i++) {
    const b2ContactData& c = w->contacts[size_t(i)];
    if (!(B2_ID_EQUALS(c.shapeIdA, a) && B2_ID_EQUALS(c.shapeIdB, b)) && !(B2_ID_EQUALS(c.shapeIdA, b) && B2_ID_EQUALS(c.shapeIdB, a))) continue;
    double sum = 0;
    for (int k = 0; k < c.manifold.pointCount; k++) sum += c.manifold.points[k].totalNormalImpulse;
    return sum;
  }
  return 0;
}

void dropJointsOf(b2BodyId b) {
  const int n = b2Body_GetJointCount(b);
  std::vector<b2JointId> js(size_t(n > 0 ? n : 0));
  if (n > 0) b2Body_GetJoints(b, js.data(), n);
  for (const b2JointId& j : js) {
    const int32_t h = handleOf(b2Joint_GetUserData(j));
    if (h >= 0 && size_t(h) < gJoints.size()) gJoints[size_t(h)] = b2_nullJointId;
  }
}

}  // namespace

struct HostPhysics2D : NativePhysics2D {
  zrt::String version() override {
    const b2Version v = b2GetVersion();
    char s[32];
    const int n = snprintf(s, sizeof s, "%d.%d.%d", v.major, v.minor, v.revision);
    return zrt::String::from(s, uint32_t(n));
  }
  zrt::String error() override { return zrt::String::from(gError.data(), uint32_t(gError.size())); }

  // ---- worlds
  int32_t worldCreate(zrt::Array<double> o) override {
    b2WorldDef d = b2DefaultWorldDef();
    d.gravity = vec(opt(o, 0, 0), opt(o, 1, -9.81));
    d.maximumLinearSpeed = float(opt(o, 2, d.maximumLinearSpeed));
    d.restitutionThreshold = float(opt(o, 3, d.restitutionThreshold));
    d.maxContactPushSpeed = float(opt(o, 4, d.maxContactPushSpeed));
    d.contactHertz = float(opt(o, 5, d.contactHertz));
    d.contactDampingRatio = float(opt(o, 6, d.contactDampingRatio));
    d.enableSleep = opt(o, 7, 1) != 0;
    d.enableContinuous = opt(o, 8, 1) != 0;
    const b2WorldId id = b2CreateWorld(&d);
    if (B2_IS_NULL(id)) { fail("too many worlds at once (Box2D holds 128)"); return -1; }
    for (size_t i = 0; i < gWorlds.size(); i++) if (!gWorlds[i]) { gWorlds[i] = new World(id); return int32_t(i); }
    gWorlds.push_back(new World(id));
    return int32_t(gWorlds.size() - 1);
  }
  void worldDestroy(int32_t h) override {
    World* w = world(h);
    if (!w) return;
    const uint16_t index = uint16_t(w->id.index1 - 1);
    for (b2BodyId& b : gBodies) if (!B2_IS_NULL(b) && b.world0 == index) b = b2_nullBodyId;
    for (b2JointId& j : gJoints) if (!B2_IS_NULL(j) && j.world0 == index) j = b2_nullJointId;
    b2DestroyWorld(w->id);
    delete w;
    gWorlds[size_t(h)] = nullptr;
  }
  void worldGravity(int32_t h, double x, double y) override { if (World* w = world(h)) b2World_SetGravity(w->id, vec(x, y)); }
  void step(int32_t h, double dt, int32_t subSteps) override {
    World* w = world(h);
    if (w && dt > 0) { ++gStepCount; b2World_Step(w->id, float(dt), subSteps < 1 ? 1 : subSteps); }
  }
  void appendMoved(int32_t h, zrt::Array<double>& out) {
    World* w = world(h);
    if (!w) return;
    const b2BodyEvents e = b2World_GetBodyEvents(w->id);
    for (int i = 0; i < e.moveCount; i++) {
      const b2BodyMoveEvent& m = e.moveEvents[i];
      const int32_t hb = handleOf(m.userData);
      if (hb < 0) continue;
      out.push_raw(double(hb));
      pushBody(out, m.bodyId, m.transform);
    }
  }
  void appendEvents(int32_t h, zrt::Array<double>& out) {
    World* w = world(h);
    if (!w) return;
    const b2ContactEvents c = b2World_GetContactEvents(w->id);
    const b2SensorEvents s = b2World_GetSensorEvents(w->id);
    for (int i = 0; i < c.beginCount; i++) {
      const b2ContactBeginTouchEvent& e = c.beginEvents[i];
      const b2Manifold& m = e.manifold;
      double x = 0, y = 0, speed = 0;
      for (int k = 0; k < m.pointCount; k++) {   // the middle of the contact points, the fastest approach among them
        x += m.points[k].point.x / m.pointCount;
        y += m.points[k].point.y / m.pointCount;
        speed = std::fmax(speed, -m.points[k].normalVelocity);
      }
      push(out, {0, double(handleOf(e.shapeIdA)), double(handleOf(e.shapeIdB)), x, y, double(m.normal.x), double(m.normal.y), speed,
                 impulseOf(w, e.shapeIdA, e.shapeIdB)});
    }
    for (int i = 0; i < c.hitCount; i++) {
      const b2ContactHitEvent& e = c.hitEvents[i];
      push(out, {1, double(handleOf(e.shapeIdA)), double(handleOf(e.shapeIdB)), double(e.point.x), double(e.point.y),
                 double(e.normal.x), double(e.normal.y), double(e.approachSpeed), impulseOf(w, e.shapeIdA, e.shapeIdB)});
    }
    for (int i = 0; i < c.endCount; i++) push(out, {2, double(handleOf(c.endEvents[i].shapeIdA)), double(handleOf(c.endEvents[i].shapeIdB)), 0, 0, 0, 0, 0, 0});
    for (int i = 0; i < s.beginCount; i++) push(out, {4, double(handleOf(s.beginEvents[i].sensorShapeId)), double(handleOf(s.beginEvents[i].visitorShapeId)), 0, 0, 0, 0, 0, 0});
    for (int i = 0; i < s.endCount; i++) push(out, {6, double(handleOf(s.endEvents[i].sensorShapeId)), double(handleOf(s.endEvents[i].visitorShapeId)), 0, 0, 0, 0, 0, 0});
  }
  zrt::Array<double> moved(int32_t h) override {
    World* w = world(h);
    auto out = zrt::Array<double>::with_cap(w ? b2World_GetBodyEvents(w->id).moveCount * kMovedSize : 0);
    appendMoved(h, out); return out;
  }
  zrt::Array<double> events(int32_t h) override {
    World* w = world(h);
    int cap = 0;
    if (w) {
      const auto c = b2World_GetContactEvents(w->id);
      const auto s = b2World_GetSensorEvents(w->id);
      cap = (c.beginCount + c.hitCount + c.endCount + s.beginCount + s.endCount) * kEventSize;
    }
    auto out = zrt::Array<double>::with_cap(cap);
    appendEvents(h, out); return out;
  }
  zrt::Array<double> stepState(int32_t h, double dt, int32_t subSteps) override {
    step(h, dt, subSteps);
    World* w = world(h);
    int cap = 1;
    if (w) {
      const auto c = b2World_GetContactEvents(w->id);
      const auto s = b2World_GetSensorEvents(w->id);
      cap += b2World_GetBodyEvents(w->id).moveCount * kMovedSize + (c.beginCount + c.hitCount + c.endCount + s.beginCount + s.endCount) * kEventSize;
    }
    auto out = zrt::Array<double>::with_cap(cap);
    out.push_raw(0);
    appendMoved(h, out);
    out.set(0, double(out.length() - 1));
    appendEvents(h, out);
    return out;
  }
  int32_t awakeCount(int32_t h) override { World* w = world(h); return w ? b2World_GetAwakeBodyCount(w->id) : 0; }
  zrt::Array<double> rayCast(int32_t h, double ox, double oy, double dx, double dy, uint32_t mask) override {
    World* w = world(h);
    if (!w) return zrt::Array<double>::with_cap(0);
    const b2RayResult r = b2World_CastRayClosest(w->id, vec(ox, oy), vec(dx, dy), b2QueryFilter{UINT64_MAX, uint64_t(mask)});
    if (!r.hit) return zrt::Array<double>::with_cap(0);
    zrt::Array<double> out = zrt::Array<double>::with_cap(6);
    push(out, {double(handleOf(r.shapeId)), double(r.fraction), double(r.point.x), double(r.point.y), double(r.normal.x), double(r.normal.y)});
    return out;
  }

  // ---- bodies
  int32_t bodyCreate(int32_t hw, zrt::Array<double> o) override {
    World* w = world(hw);
    if (!w) { fail("no such world"); return -1; }
    const int motion = int(opt(o, 0, 2)), flags = int(opt(o, 10, 0));
    if (motion < 0 || motion > 2) { fail("motion is 0 (static), 1 (kinematic) or 2 (dynamic)"); return -1; }
    b2BodyDef d = b2DefaultBodyDef();
    d.type = motion == 0 ? b2_staticBody : motion == 1 ? b2_kinematicBody : b2_dynamicBody;
    d.position = vec(opt(o, 1, 0), opt(o, 2, 0));
    d.rotation = b2MakeRot(float(opt(o, 3, 0)));
    d.linearVelocity = vec(opt(o, 4, 0), opt(o, 5, 0));
    d.angularVelocity = float(opt(o, 6, 0));
    d.linearDamping = float(opt(o, 7, d.linearDamping));
    d.angularDamping = float(opt(o, 8, d.angularDamping));
    d.gravityScale = float(opt(o, 9, d.gravityScale));
    d.isBullet = (flags & kBullet) != 0;
    d.enableSleep = !(flags & kNoSleep);
    d.fixedRotation = (flags & kFixedRotation) != 0;
    d.isEnabled = !(flags & kDisabled);
    const int32_t h = slot(gBodies);
    d.userData = tagOf(h);
    gBodies[size_t(h)] = b2CreateBody(w->id, &d);
    return h;
  }
  bool bodyShape(int32_t hb, int32_t kind, zrt::Array<double> geometry, zrt::Array<double> o) override {
    b2BodyId b;
    if (!body(hb, b)) { fail("no such body"); return false; }
    const double* g = geometry.a ? geometry.a->data : nullptr;
    const int32_t n = geometry.a ? geometry.length() : 0;
    auto at = [&](int32_t i) { return i < n ? g[i] : 0.0; };
    b2ShapeDef d = b2DefaultShapeDef();
    d.material.friction = float(opt(o, 0, d.material.friction));
    d.material.restitution = float(opt(o, 1, d.material.restitution));
    d.density = float(opt(o, 2, d.density));
    d.filter.categoryBits = uint64_t(1) << (int(opt(o, 3, 0)) & 31);
    d.filter.maskBits = uint64_t(uint32_t(opt(o, 4, 4294967295.0)));
    const int flags = int(opt(o, 5, 0));
    d.isSensor = (flags & kSensor) != 0;
    d.enableContactEvents = (flags & kEvents) != 0;
    d.enableHitEvents = (flags & kEvents) != 0;
    d.enableSensorEvents = true;   // every shape is seen by the sensors, and a sensor sees
    std::vector<b2Vec2> pts;
    const int32_t first = kind == kPolygon || kind == kChain ? 1 : 0;
    for (int32_t i = first; i + 1 < n; i += 2) pts.push_back(vec(g[i], g[i + 1]));
    switch (kind) {
      case kCircle: {
        if (!(at(0) > 0)) { fail("a circle needs a radius above 0"); return false; }
        const b2Circle c{vec(at(1), at(2)), float(at(0))};
        b2CreateCircleShape(b, &d, &c);
        return true;
      }
      case kCapsule: {
        if (!(at(4) > 0)) { fail("a capsule needs a radius above 0"); return false; }
        const b2Capsule c{vec(at(0), at(1)), vec(at(2), at(3)), float(at(4))};
        b2CreateCapsuleShape(b, &d, &c);
        return true;
      }
      case kBox: {
        if (!(at(0) > 0) || !(at(1) > 0)) { fail("a box needs half extents above 0"); return false; }
        const b2Polygon p = b2MakeOffsetRoundedBox(float(at(0)), float(at(1)), vec(at(2), at(3)), b2MakeRot(float(at(4))), float(std::fmax(0, at(5))));
        b2CreatePolygonShape(b, &d, &p);
        return true;
      }
      case kPolygon: {
        if (pts.size() < 3 || pts.size() > B2_MAX_POLYGON_VERTICES) { fail("a polygon has 3 to 8 points"); return false; }
        const b2Hull hull = b2ComputeHull(pts.data(), int(pts.size()));
        if (hull.count == 0) { fail("the points of the polygon are too close or in one line"); return false; }
        const b2Polygon p = b2MakePolygon(&hull, float(std::fmax(0, at(0))));
        b2CreatePolygonShape(b, &d, &p);
        return true;
      }
      case kSegment: {
        const b2Segment s{vec(at(0), at(1)), vec(at(2), at(3))};
        b2CreateSegmentShape(b, &d, &s);
        return true;
      }
      case kChain: {
        if (pts.size() < 4) { fail("a chain has at least 4 points"); return false; }
        b2ChainDef c = b2DefaultChainDef();
        b2SurfaceMaterial m = b2DefaultSurfaceMaterial();
        m.friction = d.material.friction;
        m.restitution = d.material.restitution;
        c.points = pts.data();
        c.count = int(pts.size());
        c.materials = &m;
        c.materialCount = 1;
        c.filter = d.filter;
        c.isLoop = at(0) != 0;
        c.enableSensorEvents = true;
        b2CreateChain(b, &c);
        return true;
      }
      default: fail("no such kind of shape"); return false;
    }
  }
  void bodyDestroy(int32_t h) override {
    b2BodyId b;
    if (!body(h, b)) return;
    dropJointsOf(b);   // Box2D destroys the joints of the body with it
    b2DestroyBody(b);
    gBodies[size_t(h)] = b2_nullBodyId;
  }
  zrt::Array<double> bodyState(int32_t h) override {
    zrt::Array<double> out = zrt::Array<double>::with_cap(kMovedSize);
    b2BodyId b;
    if (!body(h, b)) return out;
    pushBody(out, b, b2Body_GetTransform(b));
    out.push_raw(b2Body_IsAwake(b) ? 1 : 0);
    return out;
  }
  double bodyMass(int32_t h) override { b2BodyId b; return body(h, b) ? b2Body_GetMass(b) : 0; }
  void bodySetTransform(int32_t h, double x, double y, double angle) override {
    b2BodyId b;
    if (!body(h, b)) return;
    b2Body_SetTransform(b, vec(x, y), b2MakeRot(float(angle)));
    if (b2Body_GetType(b) != b2_staticBody) b2Body_SetAwake(b, true);
  }
  void bodySetVelocity(int32_t h, double vx, double vy, double av) override {
    b2BodyId b;
    if (!body(h, b)) return;
    b2Body_SetLinearVelocity(b, vec(vx, vy));
    b2Body_SetAngularVelocity(b, float(av));
  }
  void bodyMoveTo(int32_t h, double x, double y, double angle, double dt) override {
    b2BodyId b;
    if (body(h, b) && dt > 0) b2Body_SetTargetTransform(b, b2Transform{vec(x, y), b2MakeRot(float(angle))}, float(dt));
  }
  void bodyPush(int32_t h, int32_t kind, double x, double y, double px, double py) override {
    b2BodyId b;
    if (!body(h, b)) return;
    if (kind == 0) b2Body_ApplyLinearImpulseToCenter(b, vec(x, y), true);
    else if (kind == 1) b2Body_ApplyLinearImpulse(b, vec(x, y), vec(px, py), true);
    else if (kind == 2) b2Body_ApplyAngularImpulse(b, float(x), true);
    else if (kind == 3) b2Body_ApplyForceToCenter(b, vec(x, y), true);
    else if (kind == 4) b2Body_ApplyTorque(b, float(x), true);
  }
  void bodySetMaterial(int32_t h, double friction, double restitution) override {
    b2BodyId b;
    if (!body(h, b)) return;
    std::vector<b2ShapeId> shapes(size_t(b2Body_GetShapeCount(b)));
    b2Body_GetShapes(b, shapes.data(), int(shapes.size()));
    for (const b2ShapeId& s : shapes) { b2Shape_SetFriction(s, float(friction)); b2Shape_SetRestitution(s, float(restitution)); }
  }
  void bodySetMotion(int32_t h, int32_t motion) override {
    b2BodyId b;
    if (body(h, b) && motion >= 0 && motion <= 2) b2Body_SetType(b, motion == 0 ? b2_staticBody : motion == 1 ? b2_kinematicBody : b2_dynamicBody);
  }
  void bodySetGravityScale(int32_t h, double s) override { b2BodyId b; if (body(h, b)) b2Body_SetGravityScale(b, float(s)); }
  void bodyAwake(int32_t h, bool on) override { b2BodyId b; if (body(h, b)) b2Body_SetAwake(b, on); }
  void bodyEnable(int32_t h, bool on) override {
    b2BodyId b;
    if (!body(h, b) || b2Body_IsEnabled(b) == on) return;
    if (on) b2Body_Enable(b); else b2Body_Disable(b);
  }

  // ---- joints
  // Box2D's body A is b (or the world's ground), its body B is a: the angle or position a joint reports is a's, from b.
  bool pair(int32_t ha, int32_t hb, b2BodyId& a, b2BodyId& b, World*& w) {
    if (!body(ha, a) || (hb >= 0 && (!body(hb, b) || b.world0 != a.world0)) || !(w = worldOf(a))) {
      fail("a joint joins two bodies of one world, or a body and the world (-1)");
      return false;
    }
    if (hb < 0) {
      if (B2_IS_NULL(w->ground)) { b2BodyDef d = b2DefaultBodyDef(); w->ground = b2CreateBody(w->id, &d); }
      b = w->ground;
    }
    return true;
  }
  int32_t keep(b2JointId j) {
    const int32_t h = slot(gJoints);
    gJoints[size_t(h)] = j;
    b2Joint_SetUserData(j, tagOf(h));
    return h;
  }
  int32_t revolute(int32_t ha, int32_t hb, double px, double py, zrt::Array<double> o) override {
    b2BodyId a, b;
    World* w;
    if (!pair(ha, hb, a, b, w)) return -1;
    b2RevoluteJointDef d = b2DefaultRevoluteJointDef();
    d.bodyIdA = b;
    d.bodyIdB = a;
    d.localAnchorA = b2Body_GetLocalPoint(b, vec(px, py));
    d.localAnchorB = b2Body_GetLocalPoint(a, vec(px, py));
    d.referenceAngle = b2RelativeAngle(b2Body_GetRotation(a), b2Body_GetRotation(b));
    if (given(opt(o, 0)) && given(opt(o, 1))) { d.enableLimit = true; d.lowerAngle = float(opt(o, 0)); d.upperAngle = float(opt(o, 1)); }
    d.collideConnected = opt(o, 2, 0) != 0;
    return keep(b2CreateRevoluteJoint(w->id, &d));
  }
  int32_t prismatic(int32_t ha, int32_t hb, double px, double py, double dx, double dy, zrt::Array<double> o) override {
    b2BodyId a, b;
    World* w;
    if (!pair(ha, hb, a, b, w)) return -1;
    if (!(dx * dx + dy * dy > 0)) { fail("a prismatic joint needs an axis"); return -1; }
    b2PrismaticJointDef d = b2DefaultPrismaticJointDef();
    d.bodyIdA = b;
    d.bodyIdB = a;
    d.localAnchorA = b2Body_GetLocalPoint(b, vec(px, py));
    d.localAnchorB = b2Body_GetLocalPoint(a, vec(px, py));
    d.localAxisA = b2Body_GetLocalVector(b, b2Normalize(vec(dx, dy)));
    d.referenceAngle = b2RelativeAngle(b2Body_GetRotation(a), b2Body_GetRotation(b));
    if (given(opt(o, 0)) && given(opt(o, 1))) { d.enableLimit = true; d.lowerTranslation = float(opt(o, 0)); d.upperTranslation = float(opt(o, 1)); }
    d.collideConnected = opt(o, 2, 0) != 0;
    return keep(b2CreatePrismaticJoint(w->id, &d));
  }
  void jointMotor(int32_t h, int32_t mode, double target, double limit, double frequency, double damping) override {
    b2JointId j;
    if (!joint(h, j) || mode < 0 || mode > 2) return;
    const float most = limit > 0 ? float(limit) : 0, hz = frequency > 0 ? float(frequency) : 2, ratio = damping > 0 ? float(damping) : 1;
    if (b2Joint_GetType(j) == b2_revoluteJoint) {
      b2RevoluteJoint_EnableMotor(j, mode == 1);
      b2RevoluteJoint_EnableSpring(j, mode == 2);
      if (mode == 1) { b2RevoluteJoint_SetMotorSpeed(j, float(target)); b2RevoluteJoint_SetMaxMotorTorque(j, most); }
      if (mode == 2) { b2RevoluteJoint_SetSpringHertz(j, hz); b2RevoluteJoint_SetSpringDampingRatio(j, ratio); b2RevoluteJoint_SetTargetAngle(j, float(target)); }
    } else {
      b2PrismaticJoint_EnableMotor(j, mode == 1);
      b2PrismaticJoint_EnableSpring(j, mode == 2);
      if (mode == 1) { b2PrismaticJoint_SetMotorSpeed(j, float(target)); b2PrismaticJoint_SetMaxMotorForce(j, most); }
      if (mode == 2) { b2PrismaticJoint_SetSpringHertz(j, hz); b2PrismaticJoint_SetSpringDampingRatio(j, ratio); b2PrismaticJoint_SetTargetTranslation(j, float(target)); }
    }
    b2Joint_WakeBodies(j);
  }
  void jointLimits(int32_t h, double lo, double hi) override {
    b2JointId j;
    if (!joint(h, j) || !(lo <= hi)) return;
    if (b2Joint_GetType(j) == b2_revoluteJoint) { b2RevoluteJoint_EnableLimit(j, true); b2RevoluteJoint_SetLimits(j, float(lo), float(hi)); }
    else { b2PrismaticJoint_EnableLimit(j, true); b2PrismaticJoint_SetLimits(j, float(lo), float(hi)); }
    b2Joint_WakeBodies(j);
  }
  double jointValue(int32_t h) override {
    b2JointId j;
    if (!joint(h, j)) return 0;
    return b2Joint_GetType(j) == b2_revoluteJoint ? b2RevoluteJoint_GetAngle(j) : b2PrismaticJoint_GetTranslation(j);
  }
  void jointDestroy(int32_t h) override {
    b2JointId j;
    if (!joint(h, j)) return;
    b2DestroyJoint(j);
    gJoints[size_t(h)] = b2_nullJointId;
  }
};

NativePhysics2D* zinc_create_Physics2D() {
  static HostPhysics2D inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
