// zinc:physics3d for macos and linux: Jolt Physics (vendor/jolt, built by vendor/jolt_1..4.cpp) behind handle tables.
// One thread: the job system runs every job where it is queued, so a step is the same sequence of operations on every
// run, and the contact callbacks arrive in a fixed order. Nothing here reads a clock.
#define ZRT_HOSTED_CPP   // zrt.h takes <new> from the standard library, which Jolt includes too
#include "zinc_native_physics3d.h"

#include <Jolt/Jolt.h>
#include <Jolt/Core/Factory.h>
#include <Jolt/Core/JobSystemSingleThreaded.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/Physics/Body/BodyActivationListener.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Collision/CastResult.h>
#include <Jolt/Physics/Collision/CollisionCollectorImpl.h>
#include <Jolt/Physics/Collision/CollisionDispatch.h>
#include <Jolt/Physics/Collision/ContactListener.h>
#include <Jolt/Physics/Collision/EstimateCollisionResponse.h>
#include <Jolt/Physics/Collision/PhysicsMaterialSimple.h>
#include <Jolt/Physics/Collision/RayCast.h>
#include <Jolt/Physics/Collision/ShapeCast.h>
#include <Jolt/Physics/Collision/Shape/BoxShape.h>
#include <Jolt/Physics/Collision/Shape/CapsuleShape.h>
#include <Jolt/Physics/Collision/Shape/ConvexHullShape.h>
#include <Jolt/Physics/Collision/Shape/CylinderShape.h>
#include <Jolt/Physics/Collision/Shape/HeightFieldShape.h>
#include <Jolt/Physics/Collision/Shape/MeshShape.h>
#include <Jolt/Physics/Collision/Shape/MutableCompoundShape.h>
#include <Jolt/Physics/Collision/Shape/OffsetCenterOfMassShape.h>
#include <Jolt/Physics/Collision/Shape/RotatedTranslatedShape.h>
#include <Jolt/Physics/Collision/Shape/ScaledShape.h>
#include <Jolt/Physics/Collision/Shape/SphereShape.h>
#include <Jolt/Physics/Collision/Shape/StaticCompoundShape.h>
#include <Jolt/Physics/Collision/Shape/TriangleShape.h>
#include <Jolt/Physics/Constraints/HingeConstraint.h>
#include <Jolt/Physics/Constraints/SliderConstraint.h>
#include <Jolt/Physics/PhysicsSystem.h>
#include <Jolt/Physics/StateRecorderImpl.h>

#include <cmath>
#include <cstdarg>
#include <cstdio>
#include <string>
#include <vector>

using namespace JPH;

namespace {

const ObjectLayer kMoving = 32;   // an object layer is the program's layer (0 to 31) plus this bit for bodies that move: the two broad phase trees
const int kEventSize = 11, kMovedSize = 14;
enum : int { kContinuous = 1, kSensor = 2, kNoSleep = 4, kEvents = 8, kPersisted = 16, kSmoothEdges = 32, kOutside = 64 };

std::string gError;
void fail(const std::string& why) { gError = why; }

void trace(const char* fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  std::fputs("zinc:physics3d: ", stderr);
  std::vfprintf(stderr, fmt, ap);
  std::fputc('\n', stderr);
  va_end(ap);
}

// What RegisterTypes() does without its type factory entries, which only serialization reads and which would link the
// vehicles, the characters and the ragdolls into every program.
void initLibrary() {
  static bool done = false;
  if (done) return;
  done = true;
  RegisterDefaultAllocator();
  Trace = trace;
  Factory::sInstance = new Factory();
  CollisionDispatch::sInit();
  CompoundShape::sRegister();
  ConvexShape::sRegister();
  MutableCompoundShape::sRegister();
  StaticCompoundShape::sRegister();
  TriangleShape::sRegister();
  SphereShape::sRegister();
  BoxShape::sRegister();
  CapsuleShape::sRegister();
  CylinderShape::sRegister();
  MeshShape::sRegister();
  ConvexHullShape::sRegister();
  HeightFieldShape::sRegister();
  RotatedTranslatedShape::sRegister();
  OffsetCenterOfMassShape::sRegister();
  ScaledShape::sRegister();
  PhysicsMaterial::sDefault = new PhysicsMaterialSimple("Default", Color::sGrey);
}

struct MaskFilter final : ObjectLayerFilter {
  uint32_t mask;
  explicit MaskFilter(uint32_t m) : mask(m) {}
  bool ShouldCollide(ObjectLayer l) const override { return (mask >> (l & 31)) & 1; }
};

struct World final : BroadPhaseLayerInterface, ObjectVsBroadPhaseLayerFilter, ObjectLayerPairFilter, ContactListener, BodyActivationListener {
  PhysicsSystem sys;
  TempAllocatorImplWithMallocFallback temp{4 * 1024 * 1024};
  JobSystemSingleThreaded jobs{cMaxPhysicsJobs};
  uint32_t collides[32];             // bit b of collides[a]: layers a and b collide
  std::vector<int32_t> handleOf;     // by body index: the handle the program holds
  std::vector<uint32_t> idOf;        // by body index: the whole body id, to tell a body from a later one in the same slot
  std::vector<uint8_t> flagsOf;      // by body index: kEvents, kPersisted
  std::vector<double> events;
  std::vector<BodyID> slept;         // bodies that fell asleep during the step: their last state is still to report
  float minRestitutionSpeed = 1.0f;

  explicit World(uint32_t maxBodies) : handleOf(maxBodies, -1), idOf(maxBodies, 0), flagsOf(maxBodies, 0) { for (uint32_t& c : collides) c = 0xffffffffu; }

  uint GetNumBroadPhaseLayers() const override { return 2; }
  BroadPhaseLayer GetBroadPhaseLayer(ObjectLayer l) const override { return BroadPhaseLayer(l & kMoving ? 1 : 0); }
  bool ShouldCollide(ObjectLayer l, BroadPhaseLayer bp) const override { return (l & kMoving) != 0 || bp == BroadPhaseLayer(1); }
  bool ShouldCollide(ObjectLayer a, ObjectLayer b) const override { return (collides[a & 31] >> (b & 31)) & 1; }

  int32_t handle(const BodyID& id) const {
    uint32_t i = id.GetIndex();
    return i < idOf.size() && idOf[i] == id.GetIndexAndSequenceNumber() ? handleOf[i] : -1;
  }
  void contact(int kind, const Body& a, const Body& b, const ContactManifold& m, const ContactSettings& s) {
    const uint8_t want = flagsOf[a.GetID().GetIndex()] | flagsOf[b.GetID().GetIndex()];
    if (!(want & (kind == 0 ? kEvents : kPersisted))) return;
    const bool sensor = s.mIsSensor;
    const RVec3 p = m.GetWorldSpaceContactPointOn1(0);
    const Vec3 n = m.mWorldSpaceNormal;
    double impulse = 0;
    if (!sensor) {
      CollisionEstimationResult r;
      EstimateCollisionResponse(a, b, m, r, s.mCombinedFriction, s.mCombinedRestitution, minRestitutionSpeed, 4);
      for (float i : r.mContactImpulse) impulse += i;
    }
    const double speed = (a.GetPointVelocity(p) - b.GetPointVelocity(p)).Dot(n);
    const double e[kEventSize] = {double(kind + (sensor ? 4 : 0)), double(handle(a.GetID())), double(handle(b.GetID())), p.GetX(), p.GetY(), p.GetZ(),
                                  n.GetX(), n.GetY(), n.GetZ(), speed, impulse};
    events.insert(events.end(), e, e + kEventSize);
  }
  void OnContactAdded(const Body& a, const Body& b, const ContactManifold& m, ContactSettings& s) override { contact(0, a, b, m, s); }
  void OnContactPersisted(const Body& a, const Body& b, const ContactManifold& m, ContactSettings& s) override { contact(1, a, b, m, s); }
  void OnContactRemoved(const SubShapeIDPair& p) override {
    const uint32_t ia = p.GetBody1ID().GetIndex(), ib = p.GetBody2ID().GetIndex();
    if (!((flagsOf[ia] | flagsOf[ib]) & kEvents)) return;
    const bool sensor = (flagsOf[ia] | flagsOf[ib]) & kSensor;
    const double e[kEventSize] = {double(2 + (sensor ? 4 : 0)), double(handle(p.GetBody1ID())), double(handle(p.GetBody2ID())), 0, 0, 0, 0, 0, 0, 0, 0};
    events.insert(events.end(), e, e + kEventSize);
  }
  void OnBodyActivated(const BodyID&, uint64) override {}
  void OnBodyDeactivated(const BodyID& id, uint64) override { slept.push_back(id); }
};

struct BodyRef { World* w = nullptr; BodyID id; };
struct ConRef { World* w = nullptr; Ref<TwoBodyConstraint> c; bool hinge = false; };

std::vector<World*> gWorlds;
std::vector<ShapeRefC> gShapes;
std::vector<BodyRef> gBodies;
std::vector<ConRef> gCons;

template <class T, class Empty> int32_t put(std::vector<T>& v, T x, Empty empty) {
  for (size_t i = 0; i < v.size(); i++) if (empty(v[i])) { v[i] = std::move(x); return int32_t(i); }
  v.push_back(std::move(x));
  return int32_t(v.size() - 1);
}
World* world(int32_t h) { return h >= 0 && size_t(h) < gWorlds.size() ? gWorlds[h] : nullptr; }
const Shape* shape(int32_t h) { return h >= 0 && size_t(h) < gShapes.size() ? gShapes[h].GetPtr() : nullptr; }
BodyRef* bodyRef(int32_t h) { return h >= 0 && size_t(h) < gBodies.size() && gBodies[h].w ? &gBodies[h] : nullptr; }
ConRef* conRef(int32_t h) { return h >= 0 && size_t(h) < gCons.size() && gCons[h].w ? &gCons[h] : nullptr; }
Body* body(const BodyRef& r) { return r.w->sys.GetBodyLockInterfaceNoLock().TryGetBody(r.id); }
BodyInterface& bodies(World* w) { return w->sys.GetBodyInterfaceNoLock(); }

bool given(double v) { return !std::isnan(v); }
double opt(const zrt::Array<double>& o, int32_t i) { return o.a && i < o.length() ? o.a->data[i] : NAN; }
double opt(const zrt::Array<double>& o, int32_t i, double fallback) { double v = opt(o, i); return given(v) ? v : fallback; }

int32_t addShape(const ShapeSettings& s) {
  ShapeSettings::ShapeResult r = s.Create();
  if (r.HasError()) { fail(r.GetError().c_str()); return -1; }
  return put(gShapes, ShapeRefC(r.Get()), [](const ShapeRefC& x) { return x == nullptr; });
}

void dropConstraint(ConRef& c) {
  c.w->sys.RemoveConstraint(c.c);
  c = ConRef{};
}

void push(zrt::Array<double>& out, const Body& b) {
  const RVec3 p = b.GetPosition();
  const Quat q = b.GetRotation();
  const Vec3 v = b.GetLinearVelocity(), w = b.GetAngularVelocity();
  for (double x : {double(p.GetX()), double(p.GetY()), double(p.GetZ()), double(q.GetX()), double(q.GetY()), double(q.GetZ()), double(q.GetW()),
                   double(v.GetX()), double(v.GetY()), double(v.GetZ()), double(w.GetX()), double(w.GetY()), double(w.GetZ())}) out.push_raw(x);
}

zrt::Array<double> castResult(World* w, const BodyID& id, float fraction, RVec3Arg point, Vec3Arg normal) {
  zrt::Array<double> out = zrt::Array<double>::with_cap(8);
  for (double x : {double(w->handle(id)), double(fraction), double(point.GetX()), double(point.GetY()), double(point.GetZ()),
                   double(normal.GetX()), double(normal.GetY()), double(normal.GetZ())}) out.push_raw(x);
  return out;
}

}  // namespace

struct HostPhysics3D : NativePhysics3D {
  zrt::String version() override {
    char v[32];
    int n = snprintf(v, sizeof v, "%d.%d.%d", JPH_VERSION_MAJOR, JPH_VERSION_MINOR, JPH_VERSION_PATCH);
    return zrt::String::from(v, uint32_t(n));
  }
  zrt::String error() override { return zrt::String::from(gError.data(), uint32_t(gError.size())); }

  // ---- worlds
  int32_t worldCreate(zrt::Array<double> o) override {
    initLibrary();
    const uint32_t maxBodies = uint32_t(opt(o, 3, 4096)), maxPairs = uint32_t(opt(o, 4, 16384)), maxContacts = uint32_t(opt(o, 5, 8192));
    if (maxBodies < 1 || maxBodies > 1000000) { fail("a world holds 1 to 1000000 bodies"); return -1; }
    World* w = new World(maxBodies);
    w->sys.Init(maxBodies, 0, maxPairs, maxContacts, *w, *w, *w);
    w->sys.SetGravity(Vec3(float(opt(o, 0, 0)), float(opt(o, 1, -9.81)), float(opt(o, 2, 0))));
    PhysicsSettings s = w->sys.GetPhysicsSettings();
    s.mPenetrationSlop = float(opt(o, 6, s.mPenetrationSlop));
    s.mSpeculativeContactDistance = float(opt(o, 7, s.mSpeculativeContactDistance));
    s.mMinVelocityForRestitution = float(opt(o, 8, s.mMinVelocityForRestitution));
    s.mNumVelocitySteps = uint(opt(o, 9, s.mNumVelocitySteps));
    s.mNumPositionSteps = uint(opt(o, 10, s.mNumPositionSteps));
    s.mAllowSleeping = opt(o, 11, 1) != 0;
    s.mBaumgarte = float(opt(o, 12, s.mBaumgarte));
    s.mPointVelocitySleepThreshold = float(opt(o, 13, s.mPointVelocitySleepThreshold));
    s.mTimeBeforeSleep = float(opt(o, 14, s.mTimeBeforeSleep));
    w->sys.SetPhysicsSettings(s);
    w->minRestitutionSpeed = s.mMinVelocityForRestitution;
    w->sys.SetContactListener(w);
    w->sys.SetBodyActivationListener(w);
    return put(gWorlds, w, [](World* x) { return x == nullptr; });
  }
  void worldDestroy(int32_t h) override {
    World* w = world(h);
    if (!w) return;
    for (ConRef& c : gCons) if (c.w == w) dropConstraint(c);
    for (BodyRef& b : gBodies) if (b.w == w) {
      if (bodies(w).IsAdded(b.id)) bodies(w).RemoveBody(b.id);
      bodies(w).DestroyBody(b.id);
      b = BodyRef{};
    }
    delete w;
    gWorlds[h] = nullptr;
  }
  void worldGravity(int32_t h, double x, double y, double z) override { if (World* w = world(h)) w->sys.SetGravity(Vec3(float(x), float(y), float(z))); }
  void worldLayers(int32_t h, int32_t a, int32_t b, bool collide) override {
    World* w = world(h);
    if (!w || a < 0 || a > 31 || b < 0 || b > 31) return;
    if (collide) { w->collides[a] |= 1u << b; w->collides[b] |= 1u << a; }
    else { w->collides[a] &= ~(1u << b); w->collides[b] &= ~(1u << a); }
  }
  void worldOptimize(int32_t h) override { if (World* w = world(h)) w->sys.OptimizeBroadPhase(); }
  int32_t step(int32_t h, double dt, int32_t steps) override {
    World* w = world(h);
    if (!w || !(dt > 0)) return 0;
    w->events.clear();
    w->slept.clear();
    return int32_t(w->sys.Update(float(dt), steps < 1 ? 1 : steps, &w->temp, &w->jobs));
  }
  zrt::Array<double> moved(int32_t h) override {
    World* w = world(h);
    if (!w) return zrt::Array<double>::with_cap(0);
    BodyIDVector ids;
    w->sys.GetActiveBodies(EBodyType::RigidBody, ids);
    ids.insert(ids.end(), w->slept.begin(), w->slept.end());
    zrt::Array<double> out = zrt::Array<double>::with_cap(int32_t(ids.size()) * kMovedSize);
    const BodyLockInterface& lock = w->sys.GetBodyLockInterfaceNoLock();
    for (const BodyID& id : ids) {
      const Body* b = lock.TryGetBody(id);
      const int32_t hb = w->handle(id);
      if (!b || hb < 0) continue;
      out.push_raw(double(hb));
      push(out, *b);
    }
    return out;
  }
  zrt::Array<double> events(int32_t h) override {
    World* w = world(h);
    const int32_t n = w ? int32_t(w->events.size()) : 0;
    zrt::Array<double> out = zrt::Array<double>::with_cap(n);
    for (int32_t i = 0; i < n; i++) out.push_raw(w->events[size_t(i)]);
    return out;
  }
  int32_t activeCount(int32_t h) override { World* w = world(h); return w ? int32_t(w->sys.GetNumActiveBodies(EBodyType::RigidBody)) : 0; }
  zrt::Array<double> rayCast(int32_t h, double ox, double oy, double oz, double dx, double dy, double dz, uint32_t mask) override {
    World* w = world(h);
    if (!w) return zrt::Array<double>::with_cap(0);
    const RRayCast ray{RVec3(float(ox), float(oy), float(oz)), Vec3(float(dx), float(dy), float(dz))};
    RayCastResult hit;
    if (!w->sys.GetNarrowPhaseQueryNoLock().CastRay(ray, hit, {}, MaskFilter(mask))) return zrt::Array<double>::with_cap(0);
    const Body* b = w->sys.GetBodyLockInterfaceNoLock().TryGetBody(hit.mBodyID);
    const RVec3 p = ray.GetPointOnRay(hit.mFraction);
    return castResult(w, hit.mBodyID, hit.mFraction, p, b ? b->GetWorldSpaceSurfaceNormal(hit.mSubShapeID2, p) : Vec3::sZero());
  }
  zrt::Array<double> shapeCast(int32_t h, int32_t sh, zrt::Array<double> pose, double dx, double dy, double dz, uint32_t mask) override {
    World* w = world(h);
    const Shape* s = shape(sh);
    if (!w || !s || !pose.a || pose.length() < 7) return zrt::Array<double>::with_cap(0);
    const double* p = pose.a->data;
    const RMat44 at = RMat44::sRotationTranslation(Quat(float(p[3]), float(p[4]), float(p[5]), float(p[6])).Normalized(), RVec3(float(p[0]), float(p[1]), float(p[2])));
    const RShapeCast cast = RShapeCast::sFromWorldTransform(s, Vec3::sReplicate(1.0f), at, Vec3(float(dx), float(dy), float(dz)));
    ClosestHitCollisionCollector<CastShapeCollector> hit;
    w->sys.GetNarrowPhaseQueryNoLock().CastShape(cast, ShapeCastSettings(), RVec3::sZero(), hit, {}, MaskFilter(mask));
    if (!hit.HadHit()) return zrt::Array<double>::with_cap(0);
    const Vec3 axis = hit.mHit.mPenetrationAxis;   // from the cast shape into what it hit: the surface normal is the other way
    return castResult(w, hit.mHit.mBodyID2, hit.mHit.mFraction, RVec3(hit.mHit.mContactPointOn2), axis.LengthSq() > 0 ? -axis.Normalized() : Vec3::sZero());
  }
  zrt::Array<uint8_t> saveState(int32_t h) override {
    World* w = world(h);
    if (!w) return zrt::Array<uint8_t>::with_cap(0);
    StateRecorderImpl rec;
    w->sys.SaveState(rec);
    const std::string data = rec.GetData();
    zrt::Array<uint8_t> out = zrt::Array<uint8_t>::with_cap(int32_t(data.size()));
    for (char c : data) out.push_raw(uint8_t(c));
    return out;
  }
  bool restoreState(int32_t h, zrt::Array<uint8_t> state) override {
    World* w = world(h);
    if (!w || !state.a || state.length() == 0) { fail("no state to restore"); return false; }
    StateRecorderImpl rec;
    rec.WriteBytes(state.a->data, size_t(state.length()));
    if (!w->sys.RestoreState(rec)) { fail("the state does not belong to this world (other bodies or constraints)"); return false; }
    return true;
  }

  // ---- shapes
  int32_t shapeSphere(double r) override {
    initLibrary();
    if (!(r > 0)) { fail("a sphere needs a radius above 0"); return -1; }
    return addShape(SphereShapeSettings(float(r)));
  }
  int32_t shapeBox(double hx, double hy, double hz, double round) override {
    initLibrary();
    const double least = std::fmin(hx, std::fmin(hy, hz));
    if (!(least > 0)) { fail("a box needs half extents above 0"); return -1; }
    return addShape(BoxShapeSettings(Vec3(float(hx), float(hy), float(hz)), float(round >= 0 ? std::fmin(round, least) : std::fmin(cDefaultConvexRadius, least * 0.5))));
  }
  int32_t shapeCapsule(double half, double r) override {
    initLibrary();
    if (!(half > 0) || !(r > 0)) { fail("a capsule needs a half height and a radius above 0"); return -1; }
    return addShape(CapsuleShapeSettings(float(half), float(r)));
  }
  int32_t shapeCylinder(double half, double r, double round) override {
    initLibrary();
    const double least = std::fmin(half, r);
    if (!(least > 0)) { fail("a cylinder needs a half height and a radius above 0"); return -1; }
    return addShape(CylinderShapeSettings(float(half), float(r), float(round >= 0 ? std::fmin(round, least) : std::fmin(cDefaultConvexRadius, least * 0.5))));
  }
  int32_t shapeHull(zrt::Array<double> pts, double round) override {
    initLibrary();
    const int32_t n = pts.a ? pts.length() / 3 : 0;
    if (n < 4) { fail("a convex hull needs at least 4 points"); return -1; }
    Array<Vec3> v;
    for (int32_t i = 0; i < n; i++) v.push_back(Vec3(float(pts.a->data[i * 3]), float(pts.a->data[i * 3 + 1]), float(pts.a->data[i * 3 + 2])));
    return addShape(ConvexHullShapeSettings(v, float(round >= 0 ? round : cDefaultConvexRadius)));
  }
  int32_t shapeMesh(zrt::Array<double> verts, zrt::Array<int32_t> idx) override {
    initLibrary();
    const int32_t nv = verts.a ? verts.length() / 3 : 0, nt = idx.a ? idx.length() / 3 : 0;
    if (nv < 3 || nt < 1) { fail("a mesh needs at least 3 vertices and 1 triangle"); return -1; }
    VertexList v;
    IndexedTriangleList t;
    for (int32_t i = 0; i < nv; i++) v.push_back(Float3(float(verts.a->data[i * 3]), float(verts.a->data[i * 3 + 1]), float(verts.a->data[i * 3 + 2])));
    for (int32_t i = 0; i < nt; i++) {
      const int32_t a = idx.a->data[i * 3], b = idx.a->data[i * 3 + 1], c = idx.a->data[i * 3 + 2];
      if (a < 0 || b < 0 || c < 0 || a >= nv || b >= nv || c >= nv) { fail("a mesh index is outside its vertices"); return -1; }
      t.push_back(IndexedTriangle(uint32(a), uint32(b), uint32(c), 0));
    }
    return addShape(MeshShapeSettings(std::move(v), std::move(t)));
  }
  int32_t shapeHeightField(zrt::Array<double> heights, int32_t n, double ox, double oy, double oz, double sx, double sy, double sz) override {
    initLibrary();
    if (n < 4 || !heights.a || heights.length() < n * n) { fail("a height field needs n x n heights, n at least 4"); return -1; }
    std::vector<float> s(size_t(n) * size_t(n));
    for (size_t i = 0; i < s.size(); i++) s[i] = float(heights.a->data[i]);
    return addShape(HeightFieldShapeSettings(s.data(), Vec3(float(ox), float(oy), float(oz)), Vec3(float(sx), float(sy), float(sz)), uint32(n)));
  }
  void shapeRelease(int32_t h) override { if (shape(h)) gShapes[h] = nullptr; }

  // ---- bodies
  int32_t bodyCreate(int32_t hw, int32_t hs, zrt::Array<double> o) override {
    World* w = world(hw);
    const Shape* s = shape(hs);
    if (!w || !s) { fail("no such world or shape"); return -1; }
    const int motion = int(opt(o, 0, 2)), flags = int(opt(o, 15, 0)), layer = int(opt(o, 8, 0)) & 31;
    if (motion < 0 || motion > 2) { fail("motion is 0 (static), 1 (kinematic) or 2 (dynamic)"); return -1; }
    if (motion == 2 && s->MustBeStatic()) { fail("a mesh or a height field makes a static or kinematic body, not a dynamic one"); return -1; }
    BodyCreationSettings c(s, RVec3(float(opt(o, 1, 0)), float(opt(o, 2, 0)), float(opt(o, 3, 0))),
                           Quat(float(opt(o, 4, 0)), float(opt(o, 5, 0)), float(opt(o, 6, 0)), float(opt(o, 7, 1))).Normalized(),
                           EMotionType(motion), ObjectLayer(layer | (motion == 0 ? 0 : kMoving)));
    c.mAllowDynamicOrKinematic = !s->MustBeStatic();   // so that bodySetMotion can make a static body move later
    c.mFriction = float(opt(o, 9, c.mFriction));
    c.mRestitution = float(opt(o, 10, c.mRestitution));
    c.mLinearDamping = float(opt(o, 11, c.mLinearDamping));
    c.mAngularDamping = float(opt(o, 12, c.mAngularDamping));
    c.mGravityFactor = float(opt(o, 13, c.mGravityFactor));
    if (const double mass = opt(o, 14, 0); mass > 0) {
      c.mOverrideMassProperties = EOverrideMassProperties::CalculateInertia;
      c.mMassPropertiesOverride.mMass = float(mass);
    }
    if (flags & kContinuous) c.mMotionQuality = EMotionQuality::LinearCast;
    c.mIsSensor = (flags & kSensor) != 0;
    c.mAllowSleeping = !(flags & kNoSleep);
    c.mEnhancedInternalEdgeRemoval = (flags & kSmoothEdges) != 0;
    c.mMaxLinearVelocity = float(opt(o, 16, c.mMaxLinearVelocity));
    c.mMaxAngularVelocity = float(opt(o, 17, c.mMaxAngularVelocity));
    Body* b = bodies(w).CreateBody(c);
    if (!b) { fail("the world is full (maxBodies)"); return -1; }
    const int32_t h = put(gBodies, BodyRef{w, b->GetID()}, [](const BodyRef& x) { return x.w == nullptr; });
    const uint32_t i = b->GetID().GetIndex();
    w->handleOf[i] = h;
    w->idOf[i] = b->GetID().GetIndexAndSequenceNumber();
    w->flagsOf[i] = uint8_t(flags & (kEvents | kPersisted | kSensor));
    if (!(flags & kOutside)) bodies(w).AddBody(b->GetID(), motion == 0 ? EActivation::DontActivate : EActivation::Activate);
    return h;
  }
  void bodyDestroy(int32_t h) override {
    BodyRef* r = bodyRef(h);
    if (!r) return;
    const Body* b = body(*r);
    for (ConRef& c : gCons) if (c.w == r->w && (c.c->GetBody1() == b || c.c->GetBody2() == b)) dropConstraint(c);   // a constraint holds its bodies by pointer
    if (bodies(r->w).IsAdded(r->id)) bodies(r->w).RemoveBody(r->id);
    bodies(r->w).DestroyBody(r->id);
    r->w->handleOf[r->id.GetIndex()] = -1;
    r->w->flagsOf[r->id.GetIndex()] = 0;
    *r = BodyRef{};
  }
  zrt::Array<double> bodyState(int32_t h) override {
    zrt::Array<double> out = zrt::Array<double>::with_cap(kMovedSize);
    BodyRef* r = bodyRef(h);
    const Body* b = r ? body(*r) : nullptr;
    if (!b) return out;
    push(out, *b);
    out.push_raw(b->IsActive() ? 1 : 0);
    return out;
  }
  double bodyMass(int32_t h) override {
    BodyRef* r = bodyRef(h);
    const Body* b = r ? body(*r) : nullptr;
    if (!b || b->IsStatic() || b->GetMotionProperties()->GetInverseMass() <= 0) return 0;
    return 1.0 / b->GetMotionProperties()->GetInverseMass();
  }
  void bodySetTransform(int32_t h, double x, double y, double z, double qx, double qy, double qz, double qw) override {
    if (BodyRef* r = bodyRef(h)) bodies(r->w).SetPositionAndRotation(r->id, RVec3(float(x), float(y), float(z)), Quat(float(qx), float(qy), float(qz), float(qw)).Normalized(), EActivation::Activate);
  }
  void bodySetVelocity(int32_t h, double vx, double vy, double vz, double wx, double wy, double wz) override {
    if (BodyRef* r = bodyRef(h)) bodies(r->w).SetLinearAndAngularVelocity(r->id, Vec3(float(vx), float(vy), float(vz)), Vec3(float(wx), float(wy), float(wz)));
  }
  void bodyMoveTo(int32_t h, double x, double y, double z, double qx, double qy, double qz, double qw, double dt) override {
    BodyRef* r = bodyRef(h);
    if (r && dt > 0) bodies(r->w).MoveKinematic(r->id, RVec3(float(x), float(y), float(z)), Quat(float(qx), float(qy), float(qz), float(qw)).Normalized(), float(dt));
  }
  void bodyPush(int32_t h, int32_t kind, double x, double y, double z, double px, double py, double pz) override {
    BodyRef* r = bodyRef(h);
    if (!r) return;
    const Vec3 v{float(x), float(y), float(z)};
    BodyInterface& bi = bodies(r->w);
    if (kind == 0) bi.AddImpulse(r->id, v);
    else if (kind == 1) bi.AddImpulse(r->id, v, RVec3(float(px), float(py), float(pz)));
    else if (kind == 2) bi.AddAngularImpulse(r->id, v);
    else if (kind == 3) bi.AddForce(r->id, v);
    else if (kind == 4) bi.AddTorque(r->id, v);
  }
  void bodySetMaterial(int32_t h, double friction, double restitution) override {
    BodyRef* r = bodyRef(h);
    if (!r) return;
    bodies(r->w).SetFriction(r->id, float(friction));
    bodies(r->w).SetRestitution(r->id, float(restitution));
  }
  void bodySetLayer(int32_t h, int32_t layer) override {
    BodyRef* r = bodyRef(h);
    if (r) bodies(r->w).SetObjectLayer(r->id, ObjectLayer((layer & 31) | (bodies(r->w).GetObjectLayer(r->id) & kMoving)));
  }
  void bodySetMotion(int32_t h, int32_t motion) override {
    BodyRef* r = bodyRef(h);
    const Body* b = r ? body(*r) : nullptr;
    if (!b || motion < 0 || motion > 2 || b->GetShape()->MustBeStatic()) return;
    BodyInterface& bi = bodies(r->w);
    bi.SetMotionType(r->id, EMotionType(motion), EActivation::Activate);
    bi.SetObjectLayer(r->id, ObjectLayer((bi.GetObjectLayer(r->id) & 31) | (motion == 0 ? 0 : kMoving)));
  }
  void bodySetGravityFactor(int32_t h, double f) override { if (BodyRef* r = bodyRef(h)) bodies(r->w).SetGravityFactor(r->id, float(f)); }
  void bodyAwake(int32_t h, bool on) override {
    BodyRef* r = bodyRef(h);
    if (!r || !bodies(r->w).IsAdded(r->id)) return;
    if (on) bodies(r->w).ActivateBody(r->id); else bodies(r->w).DeactivateBody(r->id);
  }
  void bodyEnable(int32_t h, bool on) override {
    BodyRef* r = bodyRef(h);
    if (!r || bodies(r->w).IsAdded(r->id) == on) return;
    if (on) bodies(r->w).AddBody(r->id, bodies(r->w).GetMotionType(r->id) == EMotionType::Static ? EActivation::DontActivate : EActivation::Activate);
    else bodies(r->w).RemoveBody(r->id);
  }

  // ---- constraints
  // The constraint's first body is b (or the world): the angle or position it reports is a's, measured from there.
  int32_t constrain(int32_t ha, int32_t hb, TwoBodyConstraintSettings& s, bool isHinge) {
    BodyRef* ra = bodyRef(ha);
    BodyRef* rb = bodyRef(hb);
    if (!ra || (hb >= 0 && (!rb || rb->w != ra->w))) { fail("a constraint joins two bodies of one world, or a body and the world (-1)"); return -1; }
    Body* a = body(*ra);
    Body* b = rb ? body(*rb) : &Body::sFixedToWorld;
    Ref<TwoBodyConstraint> c = s.Create(*b, *a);
    ra->w->sys.AddConstraint(c);
    return put(gCons, ConRef{ra->w, c, isHinge}, [](const ConRef& x) { return x.w == nullptr; });
  }
  int32_t hinge(int32_t a, int32_t b, double px, double py, double pz, double dx, double dy, double dz, zrt::Array<double> o) override {
    const Vec3 axis{float(dx), float(dy), float(dz)};
    if (!(axis.LengthSq() > 0)) { fail("a hinge needs an axis"); return -1; }
    HingeConstraintSettings s;
    s.mPoint1 = s.mPoint2 = RVec3(float(px), float(py), float(pz));
    s.mHingeAxis1 = s.mHingeAxis2 = axis.Normalized();
    s.mNormalAxis1 = s.mNormalAxis2 = axis.GetNormalizedPerpendicular();
    if (given(opt(o, 0)) && given(opt(o, 1))) { s.mLimitsMin = float(opt(o, 0)); s.mLimitsMax = float(opt(o, 1)); }
    s.mMaxFrictionTorque = float(opt(o, 2, 0));
    return constrain(a, b, s, true);
  }
  int32_t slider(int32_t a, int32_t b, double px, double py, double pz, double dx, double dy, double dz, zrt::Array<double> o) override {
    const Vec3 axis{float(dx), float(dy), float(dz)};
    if (!(axis.LengthSq() > 0)) { fail("a slider needs an axis"); return -1; }
    SliderConstraintSettings s;
    s.mPoint1 = s.mPoint2 = RVec3(float(px), float(py), float(pz));
    s.SetSliderAxis(axis.Normalized());
    if (given(opt(o, 0)) && given(opt(o, 1))) { s.mLimitsMin = float(opt(o, 0)); s.mLimitsMax = float(opt(o, 1)); }
    s.mMaxFrictionForce = float(opt(o, 2, 0));
    return constrain(a, b, s, false);
  }
  void constraintMotor(int32_t h, int32_t mode, double target, double limit, double frequency, double damping) override {
    ConRef* r = conRef(h);
    if (!r || mode < 0 || mode > 2) return;
    const EMotorState state = mode == 0 ? EMotorState::Off : mode == 1 ? EMotorState::Velocity : EMotorState::Position;
    MotorSettings m;   // the library's spring: 2 Hz, damping 1
    if (frequency > 0) m.mSpringSettings.mFrequency = float(frequency);
    if (damping > 0) m.mSpringSettings.mDamping = float(damping);
    if (limit > 0) { m.SetForceLimit(float(limit)); m.SetTorqueLimit(float(limit)); }
    if (r->hinge) {
      HingeConstraint* c = static_cast<HingeConstraint*>(r->c.GetPtr());
      c->GetMotorSettings() = m;
      c->SetMotorState(state);
      if (mode == 1) c->SetTargetAngularVelocity(float(target)); else if (mode == 2) c->SetTargetAngle(float(target));
    } else {
      SliderConstraint* c = static_cast<SliderConstraint*>(r->c.GetPtr());
      c->GetMotorSettings() = m;
      c->SetMotorState(state);
      if (mode == 1) c->SetTargetVelocity(float(target)); else if (mode == 2) c->SetTargetPosition(float(target));
    }
    bodies(r->w).ActivateConstraint(r->c);
  }
  void constraintLimits(int32_t h, double lo, double hi) override {
    ConRef* r = conRef(h);
    if (!r || !(lo <= hi)) return;
    if (r->hinge) static_cast<HingeConstraint*>(r->c.GetPtr())->SetLimits(float(lo), float(hi));
    else static_cast<SliderConstraint*>(r->c.GetPtr())->SetLimits(float(lo), float(hi));
    bodies(r->w).ActivateConstraint(r->c);
  }
  double constraintValue(int32_t h) override {
    ConRef* r = conRef(h);
    if (!r) return 0;
    return r->hinge ? static_cast<HingeConstraint*>(r->c.GetPtr())->GetCurrentAngle() : static_cast<SliderConstraint*>(r->c.GetPtr())->GetCurrentPosition();
  }
  void constraintDestroy(int32_t h) override { if (ConRef* r = conRef(h)) dropConstraint(*r); }
};

NativePhysics3D* zinc_create_Physics3D() {
  static HostPhysics3D inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
