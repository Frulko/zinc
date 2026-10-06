#include "vm/machine.h"

#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <vector>

namespace zn::vm {

std::string numberToString(double v) {
  if (v != v) return "NaN";
  if (v == 0) return "0";
  if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
  std::string sign = v < 0 ? "-" : "";
  v = std::fabs(v);
  char buf[48];
  for (int p = 1; p <= 17; ++p) {  // shortest digit count that round-trips
    std::snprintf(buf, sizeof buf, "%.*e", p - 1, v);
    if (std::strtod(buf, nullptr) == v) break;
  }
  std::string s = buf;  // d.ddde[+-]XX
  std::size_t e = s.find('e');
  int exp10 = std::atoi(s.c_str() + e + 1);
  std::string digits;
  for (std::size_t i = 0; i < e; ++i) if (s[i] != '.') digits += s[i];
  while (digits.size() > 1 && digits.back() == '0') digits.pop_back();
  int k = static_cast<int>(digits.size()), n = exp10 + 1;
  std::string out;
  if (k <= n && n <= 21) out = digits + std::string(static_cast<std::size_t>(n - k), '0');
  else if (0 < n && n <= 21) out = digits.substr(0, static_cast<std::size_t>(n)) + "." + digits.substr(static_cast<std::size_t>(n));
  else if (-6 < n && n <= 0) out = "0." + std::string(static_cast<std::size_t>(-n), '0') + digits;
  else {
    int ex = n - 1;
    out = digits.substr(0, 1) + (k > 1 ? "." + digits.substr(1) : "") + "e" + (ex < 0 ? "-" : "+") + std::to_string(std::abs(ex));
  }
  return sign + out;
}

namespace {

// Every frame starts at most 255 slots above its caller's base and has at most 256 registers, so a depth check alone
// bounds the stack: no per-call stack-end check.
constexpr std::size_t kStackSlots = std::size_t{kMaxCallDepth} * kMaxRegisters + kMaxRegisters;

inline double asD(Slot s) { return std::bit_cast<double>(s); }
inline Slot fromD(double d) { return std::bit_cast<Slot>(d); }
inline float asF(Slot s) { return std::bit_cast<float>(static_cast<std::uint32_t>(s)); }
inline Slot fromF(float f) { return static_cast<Slot>(std::bit_cast<std::uint32_t>(f)); }
inline Slot sx(std::int64_t v) { return static_cast<Slot>(v); }
inline Slot sx32(std::int32_t v) { return static_cast<Slot>(static_cast<std::int64_t>(v)); }
inline Slot zx32(std::uint32_t v) { return static_cast<Slot>(v); }

std::int64_t toI64(double x) {
  if (x != x) return 0;
  if (x >= 9223372036854775807.0) return INT64_MAX;
  if (x <= -9223372036854775808.0) return INT64_MIN;
  return static_cast<std::int64_t>(x);
}
std::uint64_t toU64(double x) {
  if (x != x) return 0;
  if (x < 0) return static_cast<std::uint64_t>(toI64(x));
  if (x >= 18446744073709551616.0) return UINT64_MAX;
  return static_cast<std::uint64_t>(x);
}
double jsRound(double x) {  // round half toward +infinity
  double f = std::floor(x);
  return x - f >= 0.5 ? f + 1 : f;
}
double jsMin(double a, double b) { return (a != a || b != b) ? NAN : (a < b ? a : b); }
double jsMax(double a, double b) { return (a != a || b != b) ? NAN : (a > b ? a : b); }

bool isSubclassRT(const ClassRT* c, std::uint32_t target) {
  if (c->id == target) return true;
  for (std::uint32_t s : c->supers) if (s == target) return true;
  return false;
}

KeyKind keyKindOf(const zbc::Module& m, zbc::VType t) {
  switch (t.cls) {
    case zbc::Cls::S: return KeyKind::F32;
    case zbc::Cls::D: return KeyKind::F64;
    case zbc::Cls::R: return m.classes[t.ref].kind == zbc::CKind::String ? KeyKind::Str : KeyKind::Ref;
    default: return KeyKind::Int;
  }
}

}  // namespace

// The last reference to `root` is gone: destroy it and, depth first, whatever only it kept alive. Order, as with the native
// runtime's RAII: an object's fields in reverse order of declaration, an array's elements first to last, a Map's entries
// first to last (key, then value).
void Machine::destroy(Obj* root) {
  std::vector<Obj*> pending;  // references still to release; the top is released next
  auto drop = [&](Obj* o) { if (o && o->rc != kImmortal) pending.push_back(o); };
  auto freeNode = [&](Obj* o) {
    if (traceFree) { trace += "free " + o->cls->name + " #" + std::to_string(serials[o]) + "\n"; serials.erase(o); }
    switch (o->cls->kind) {
      case zbc::CKind::Object: {
        Slot* f = o->fields();
        for (std::uint32_t k = 0; k < o->cls->nfields; ++k) if (o->cls->fieldRef[k]) drop(reinterpret_cast<Obj*>(f[k]));  // pushed first-to-last: the last field is released first
        break;
      }
      case zbc::CKind::Array: {
        auto* a = static_cast<ArrObj*>(o);
        if (o->cls->elemRef) for (std::size_t k = a->v.size(); k-- > 0;) drop(reinterpret_cast<Obj*>(a->v[k]));
        break;
      }
      case zbc::CKind::Map: case zbc::CKind::Set: {
        auto* mo = static_cast<MapObj*>(o);
        const Table& t = mo->t;
        for (std::size_t k = t.keys.size(); k-- > 0;) {
          if (t.dead[k]) continue;
          if (t.hasVals && o->cls->elemRef) drop(reinterpret_cast<Obj*>(t.vals[k]));
          if (o->cls->keyRef) drop(reinterpret_cast<Obj*>(t.keys[k]));
        }
        break;
      }
      case zbc::CKind::String: break;
    }
    std::uint32_t at = o->pad;  // leave the registry in O(1)
    allocated[at] = allocated.back();
    allocated[at]->pad = at;
    allocated.pop_back();
    switch (o->cls->kind) {
      case zbc::CKind::Array: delete static_cast<ArrObj*>(o); break;
      case zbc::CKind::Map: case zbc::CKind::Set: delete static_cast<MapObj*>(o); break;
      default: std::free(o); break;
    }
  };
  freeNode(root);
  while (!pending.empty()) {
    Obj* o = pending.back();
    pending.pop_back();
    if (o->rc == 0) continue;  // released more often than held: ignore here, a Release instruction traps on it
    if (--o->rc == 0) freeNode(o);
  }
}

Machine::~Machine() {
  for (Obj* o : allocated) {
    switch (o->cls->kind) {
      case zbc::CKind::Array: delete static_cast<ArrObj*>(o); break;
      case zbc::CKind::Map: case zbc::CKind::Set: delete static_cast<MapObj*>(o); break;
      default: std::free(o); break;
    }
  }
  std::free(stack);
}

bool Machine::load(const zbc::Module& m, std::string& err) {
  mod = &m;
  funcs.resize(m.functions.size());
  for (std::size_t i = 0; i < funcs.size(); ++i) funcs[i] = {m.functions[i].code.data(), m.functions[i].consts.data(), m.functions[i].nregs, m.functions[i].handlers.data(), static_cast<std::uint32_t>(m.functions[i].handlers.size())};
  // Verified code never reads a register before writing it, so the stack needs no initialisation; calloc hands out
  // lazily zeroed pages, so the 20 MB is not touched until used.
  stack = static_cast<Slot*>(std::calloc(kStackSlots, sizeof(Slot)));
  if (!stack) { err = "out of memory"; return false; }
  globals.assign(m.globals.size(), 0);
  for (const zbc::VType& gt : m.globals) globalRef.push_back(gt.cls == zbc::Cls::R);
  classes.resize(m.classes.size());
  std::map<std::pair<std::uint8_t, std::uint32_t>, const ClassRT*> arrayOf;  // (class of the element's VType, ref) -> array class
  auto arrKey = [](zbc::VType t) { return std::make_pair(static_cast<std::uint8_t>(t.cls), t.cls == zbc::Cls::R ? std::uint32_t{t.ref} : 0u); };
  for (std::size_t i = 0; i < classes.size(); ++i) {
    const zbc::ClassInfo& ci = m.classes[i];
    ClassRT& c = classes[i];
    c.id = static_cast<std::uint32_t>(i);
    c.name = ci.name;
    c.kind = ci.kind;
    c.nfields = static_cast<std::uint32_t>(ci.fields.size());
    for (const zbc::VType& ft : ci.fields) c.fieldRef.push_back(ft.cls == zbc::Cls::R);
    c.supers = ci.supers;
    if (ci.kind == zbc::CKind::Object && !ci.isInterface && !ci.isAbstract) {
      c.vtable.assign(m.selectors.size(), nullptr);
      for (std::uint32_t sel : ci.selectors) {
        c.vtable[sel] = &funcs[ci.vtable[sel]];
      }
    }
    if (ci.kind == zbc::CKind::String) strClass = &c;
    if (ci.kind == zbc::CKind::Array) arrayOf[arrKey(ci.elem)] = &c;
    if (ci.kind != zbc::CKind::Object && ci.kind != zbc::CKind::String) {
      c.elemKind = keyKindOf(m, ci.elem);
      c.keyKind = ci.kind == zbc::CKind::Map ? keyKindOf(m, ci.key) : c.elemKind;
      c.elemRef = ci.elem.cls == zbc::Cls::R;
      c.keyRef = (ci.kind == zbc::CKind::Map ? ci.key : ci.elem).cls == zbc::Cls::R;
    }
  }
  for (std::size_t i = 0; i < classes.size(); ++i) {
    const zbc::ClassInfo& ci = m.classes[i];
    auto find = [&](zbc::VType t) { auto it = arrayOf.find(arrKey(t)); return it == arrayOf.end() ? nullptr : it->second; };
    if (ci.kind == zbc::CKind::Map || ci.kind == zbc::CKind::Set) { classes[i].valuesArray = find(ci.elem); if (ci.kind == zbc::CKind::Map) classes[i].keysArray = find(ci.key); }
    if (ci.kind == zbc::CKind::Set) classes[i].keysArray = classes[i].valuesArray;
  }
  if (strClass) strArray = arrayOf.count({static_cast<std::uint8_t>(zbc::Cls::R), strClass->id}) ? arrayOf[{static_cast<std::uint8_t>(zbc::Cls::R), strClass->id}] : nullptr;
  if (!m.strings.empty() && !strClass) { err = "string constants without a string class"; return false; }
  for (const std::string& s : m.strings) { StrObj* so = newStr(s.data(), s.size()); so->rc = kImmortal; strConsts.push_back(so); }
  frames.resize(kMaxCallDepth);
  fp = frames.data();
  framesEnd = frames.data() + kMaxCallDepth;
  return true;
}

StrObj* Machine::newStr(const char* p, std::size_t n) {
  auto* s = static_cast<StrObj*>(std::malloc(sizeof(StrObj) + n + 1));
  if (!s) std::abort();
  s->cls = strClass; s->rc = 1;
  s->len = static_cast<std::uint32_t>(n);
  char* d = reinterpret_cast<char*>(s + 1);
  if (n) std::memcpy(d, p, n);
  d[n] = 0;
  bool ascii = true;
  std::uint32_t units = 0;
  for (std::size_t i = 0; i < n; ++i) {
    auto b = static_cast<std::uint8_t>(d[i]);
    if (b >= 0x80) ascii = false;
    if ((b & 0xC0) != 0x80) units += b >= 0xF0 ? 2 : 1;
  }
  s->ascii = ascii;
  s->u16len = units;
  track(s);
  return s;
}

ArrObj* Machine::newArr(const ClassRT* cls) {
  auto* o = new ArrObj();
  o->cls = cls; o->rc = 1;
  track(o);
  return o;
}

const Func* Machine::findComparator(const Obj* fn, zbc::VType elem) const {
  if (!fn) return nullptr;
  const ClassRT& c = *fn->cls;
  for (std::uint32_t sel : mod->classes[c.id].selectors) {
    const zbc::SelInfo& si = mod->selectors[sel];
    if (si.name == "call" && si.params.size() == 2 && si.params[0] == elem && si.params[1] == elem && si.ret.cls == zbc::Cls::D && sel < c.vtable.size() && c.vtable[sel]) return c.vtable[sel];
  }
  return nullptr;
}

bool Machine::callComparator(const Func* cmp, Obj* fn, Slot a, Slot b, bool refs, Slot* scratch, double& result) {
  retain(fn);  // the callee owns its parameters and releases them
  if (refs) { retain(reinterpret_cast<Obj*>(a)); retain(reinterpret_cast<Obj*>(b)); }
  scratch[0] = reinterpret_cast<Slot>(fn);
  scratch[1] = a;
  scratch[2] = b;
  if (!exec(cmp, scratch)) return false;
  result = asD(scratch[0]);
  return true;
}

bool Machine::exec(const Func* entry, Slot* base) {
  static const void* const labels[] = {
#define X(name, fmt, b, c, o) &&L_##name,
      ZN_OPCODES(X)
#undef X
  };
  if (fp == framesEnd) { error = "stack overflow"; return false; }
  *fp++ = {nullptr, nullptr, nullptr};  // marks where this exec() returns

  const Func* fn = entry;
  const std::uint32_t* code = fn->code;
  const std::uint32_t* pc = code;
  Slot* r = base;
  std::uint32_t w;

#define NEXT() do { w = *pc++; goto *labels[w & 0xFFu]; } while (0)
#define A aOf(w)
#define B bOf(w)
#define C cOf(w)
#define TRAP(msg) do { error = msg; return false; } while (0)
  NEXT();

L_Nop: NEXT();
L_Trap: TRAP("trap: unreachable code executed");
L_Move: r[A] = r[B]; NEXT();
L_LoadI: r[A] = sx(sdOf(w)); NEXT();
L_LoadK: r[A] = fn->consts[dOf(w)].bits; NEXT();

#define ARITH(name, expr) L_##name: { const Slot x = r[B], y = r[C]; (void)x; (void)y; r[A] = (expr); NEXT(); }
#define DIVLIKE(name, zero, expr) L_##name: { const Slot x = r[B], y = r[C]; if (!(zero)) TRAP("division by zero"); r[A] = (expr); NEXT(); }
  ARITH(AddI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) + static_cast<std::uint32_t>(y))))
  ARITH(SubI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) - static_cast<std::uint32_t>(y))))
  ARITH(MulI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) * static_cast<std::uint32_t>(y))))
  DIVLIKE(DivI32, static_cast<std::int32_t>(y) != 0, (static_cast<std::int32_t>(x) == INT32_MIN && static_cast<std::int32_t>(y) == -1) ? sx32(INT32_MIN) : sx32(static_cast<std::int32_t>(x) / static_cast<std::int32_t>(y)))
  DIVLIKE(RemI32, static_cast<std::int32_t>(y) != 0, (static_cast<std::int32_t>(y) == -1) ? Slot{0} : sx32(static_cast<std::int32_t>(x) % static_cast<std::int32_t>(y)))
  ARITH(AddU32, zx32(static_cast<std::uint32_t>(x) + static_cast<std::uint32_t>(y)))
  ARITH(SubU32, zx32(static_cast<std::uint32_t>(x) - static_cast<std::uint32_t>(y)))
  ARITH(MulU32, zx32(static_cast<std::uint32_t>(x) * static_cast<std::uint32_t>(y)))
  DIVLIKE(DivU32, static_cast<std::uint32_t>(y) != 0, zx32(static_cast<std::uint32_t>(x) / static_cast<std::uint32_t>(y)))
  DIVLIKE(RemU32, static_cast<std::uint32_t>(y) != 0, zx32(static_cast<std::uint32_t>(x) % static_cast<std::uint32_t>(y)))
  ARITH(AddI64, x + y)
  ARITH(SubI64, x - y)
  ARITH(MulI64, x * y)
  DIVLIKE(DivI64, y != 0, (static_cast<std::int64_t>(x) == INT64_MIN && static_cast<std::int64_t>(y) == -1) ? x : sx(static_cast<std::int64_t>(x) / static_cast<std::int64_t>(y)))
  DIVLIKE(RemI64, y != 0, (static_cast<std::int64_t>(y) == -1) ? Slot{0} : sx(static_cast<std::int64_t>(x) % static_cast<std::int64_t>(y)))
  ARITH(AddU64, x + y)
  ARITH(SubU64, x - y)
  ARITH(MulU64, x * y)
  DIVLIKE(DivU64, y != 0, x / y)
  DIVLIKE(RemU64, y != 0, x % y)
  ARITH(AddF32, fromF(asF(x) + asF(y)))
  ARITH(SubF32, fromF(asF(x) - asF(y)))
  ARITH(MulF32, fromF(asF(x) * asF(y)))
  ARITH(DivF32, fromF(asF(x) / asF(y)))
  ARITH(RemF32, fromF(std::fmod(asF(x), asF(y))))
  ARITH(AddF64, fromD(asD(x) + asD(y)))
  ARITH(SubF64, fromD(asD(x) - asD(y)))
  ARITH(MulF64, fromD(asD(x) * asD(y)))
  ARITH(DivF64, fromD(asD(x) / asD(y)))
  ARITH(RemF64, fromD(std::fmod(asD(x), asD(y))))
  ARITH(PowF64, fromD(std::pow(asD(x), asD(y))))
  ARITH(Atan2F64, fromD(std::atan2(asD(x), asD(y))))
  ARITH(MinF64, fromD(jsMin(asD(x), asD(y))))
  ARITH(MaxF64, fromD(jsMax(asD(x), asD(y))))
  ARITH(NegI32, sx32(static_cast<std::int32_t>(0u - static_cast<std::uint32_t>(x))))
  ARITH(NegU32, zx32(0u - static_cast<std::uint32_t>(x)))
  ARITH(NegI64, Slot{0} - x)
  ARITH(NegF32, fromF(-asF(x)))
  ARITH(NegF64, fromD(-asD(x)))
  ARITH(And, x & y)
  ARITH(Or, x | y)
  ARITH(Xor, x ^ y)
  ARITH(Not64, ~x)
  ARITH(NotB, Slot{x == 0})
  ARITH(ShlI32, sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(x) << (y & 31))))
  ARITH(ShrI32, sx32(static_cast<std::int32_t>(x) >> (y & 31)))
  ARITH(ShlU32, zx32(static_cast<std::uint32_t>(x) << (y & 31)))
  ARITH(ShrU32, zx32(static_cast<std::uint32_t>(x) >> (y & 31)))
  ARITH(ShlI64, x << (y & 63))
  ARITH(ShrI64, sx(static_cast<std::int64_t>(x) >> (y & 63)))
  ARITH(ShlU64, x << (y & 63))
  ARITH(ShrU64, x >> (y & 63))
  ARITH(NarrowI8, sx(static_cast<std::int8_t>(x)))
  ARITH(NarrowI16, sx(static_cast<std::int16_t>(x)))
  ARITH(NarrowI32, sx32(static_cast<std::int32_t>(x)))
  ARITH(NarrowU8, Slot{static_cast<std::uint8_t>(x)})
  ARITH(NarrowU16, Slot{static_cast<std::uint16_t>(x)})
  ARITH(NarrowU32, zx32(static_cast<std::uint32_t>(x)))
  ARITH(EqI, Slot{x == y})
  ARITH(NeI, Slot{x != y})
  ARITH(LtI, Slot{static_cast<std::int64_t>(x) < static_cast<std::int64_t>(y)})
  ARITH(LeI, Slot{static_cast<std::int64_t>(x) <= static_cast<std::int64_t>(y)})
  ARITH(LtU, Slot{x < y})
  ARITH(LeU, Slot{x <= y})
  ARITH(EqF32, Slot{asF(x) == asF(y)})
  ARITH(NeF32, Slot{asF(x) != asF(y)})
  ARITH(LtF32, Slot{asF(x) < asF(y)})
  ARITH(LeF32, Slot{asF(x) <= asF(y)})
  ARITH(EqF64, Slot{asD(x) == asD(y)})
  ARITH(NeF64, Slot{asD(x) != asD(y)})
  ARITH(LtF64, Slot{asD(x) < asD(y)})
  ARITH(LeF64, Slot{asD(x) <= asD(y)})
  ARITH(I64ToF64, fromD(static_cast<double>(static_cast<std::int64_t>(x))))
  ARITH(I64ToF32, fromF(static_cast<float>(static_cast<std::int64_t>(x))))
  ARITH(U64ToF64, fromD(static_cast<double>(x)))
  ARITH(U64ToF32, fromF(static_cast<float>(x)))
  ARITH(F64ToI64, sx(toI64(asD(x))))
  ARITH(F64ToU64, toU64(asD(x)))
  ARITH(F32ToI64, sx(toI64(static_cast<double>(asF(x)))))
  ARITH(F32ToU64, toU64(static_cast<double>(asF(x))))
  ARITH(F32ToF64, fromD(static_cast<double>(asF(x))))
  ARITH(F64ToF32, fromF(static_cast<float>(asD(x))))
  ARITH(SqrtF64, fromD(std::sqrt(asD(x))))
  ARITH(AbsF64, fromD(std::fabs(asD(x))))
  ARITH(FloorF64, fromD(std::floor(asD(x))))
  ARITH(CeilF64, fromD(std::ceil(asD(x))))
  ARITH(RoundF64, fromD(jsRound(asD(x))))
  ARITH(TruncF64, fromD(std::trunc(asD(x))))
  ARITH(SinF64, fromD(std::sin(asD(x))))
  ARITH(CosF64, fromD(std::cos(asD(x))))
  ARITH(TanF64, fromD(std::tan(asD(x))))
  ARITH(AtanF64, fromD(std::atan(asD(x))))
  ARITH(ExpF64, fromD(std::exp(asD(x))))
  ARITH(LnF64, fromD(std::log(asD(x))))

L_AddI32K: r[A] = sx32(static_cast<std::int32_t>(static_cast<std::uint32_t>(r[B]) + static_cast<std::uint32_t>(static_cast<std::int32_t>(immOf(w))))); NEXT();

// Fused compare-and-jump: word 0 holds the operands, word 1 (now at *pc) the absolute target.
#define FJ(name, cond) L_##name: { if (cond) pc = code + *pc; else ++pc; NEXT(); }
#define SI(x) static_cast<std::int64_t>(x)
  FJ(JEqI, r[A] == r[B]) FJ(JNeI, r[A] != r[B]) FJ(JLtI, SI(r[A]) < SI(r[B])) FJ(JLeI, SI(r[A]) <= SI(r[B]))
  FJ(JLtU, r[A] < r[B]) FJ(JLeU, r[A] <= r[B])
  FJ(JEqIK, SI(r[A]) == immOf(w)) FJ(JNeIK, SI(r[A]) != immOf(w)) FJ(JLtIK, SI(r[A]) < immOf(w))
  FJ(JLeIK, SI(r[A]) <= immOf(w)) FJ(JGtIK, SI(r[A]) > immOf(w)) FJ(JGeIK, SI(r[A]) >= immOf(w))
#undef FJ
#undef SI

L_Jmp: pc = code + axOf(w); NEXT();
L_JmpIf: if (r[A]) pc = code + dOf(w); NEXT();
L_JmpIfNot: if (!r[A]) pc = code + dOf(w); NEXT();
L_Call: {
  const Func* callee = &funcs[dOf(w)];
  Slot* nb = r + A;
  if (__builtin_expect(fp == framesEnd, 0)) TRAP("stack overflow");
  *fp++ = {pc, fn, r};
  r = nb; fn = callee; code = callee->code; pc = code;
  NEXT();
}
L_Ret: {
  Slot v = r[A];
  const Frame f = *--fp;
  r[0] = v;
  if (!f.ret) return true;
  r = f.base; fn = f.fn; code = fn->code; pc = f.ret;
  NEXT();
}
L_RetV: {
  const Frame f = *--fp;
  if (!f.ret) return true;
  r = f.base; fn = f.fn; code = fn->code; pc = f.ret;
  NEXT();
}
L_Throw: {  // unwind to the nearest handler that takes the object, through the callers if need be
  Slot exc = r[A];
  if (!exc) TRAP("null reference");
  const std::uint32_t* at = pc - 1;  // the throwing instruction
  for (;;) {
    auto idx = static_cast<std::uint32_t>(at - code);
    const zbc::Handler* hit = nullptr;
    for (std::uint32_t k = 0; k < fn->nhandlers; ++k)
      if (fn->handlers[k].at == idx && isSubclassRT(reinterpret_cast<Obj*>(exc)->cls, fn->handlers[k].cls)) { hit = &fn->handlers[k]; break; }
    if (hit) { r[hit->reg] = exc; pc = code + hit->target; NEXT(); }
    const Frame f = *--fp;
    if (!f.ret) { error = "uncaught exception: " + reinterpret_cast<Obj*>(exc)->cls->name; return false; }
    r = f.base; fn = f.fn; code = fn->code; at = f.ret - 1;
  }
}
L_New: {
  const ClassRT* cr = &classes[dOf(w)];
  if (cr->kind == zbc::CKind::Array) { r[A] = reinterpret_cast<Slot>(newArr(cr)); NEXT(); }
  if (cr->kind == zbc::CKind::Map || cr->kind == zbc::CKind::Set) {
    auto* o = new MapObj();
    o->cls = cr; o->rc = 1;
    o->t.kk = cr->keyKind;
    o->t.hasVals = cr->kind == zbc::CKind::Map;
    track(o);
    r[A] = reinterpret_cast<Slot>(o);
    NEXT();
  }
  auto* o = static_cast<Obj*>(std::calloc(1, sizeof(Obj) + cr->nfields * sizeof(Slot)));
  if (!o) TRAP("out of memory");
  o->cls = cr; o->rc = 1;
  track(o);
  r[A] = reinterpret_cast<Slot>(o);
  NEXT();
}
L_GetField: {
  auto* o = reinterpret_cast<Obj*>(r[B]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  r[A] = o->fields()[C];
  NEXT();
}
L_SetField: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  Slot old = o->fields()[C];
  o->fields()[C] = r[B];
  if (o->cls->fieldRef[C]) releaseSlot(old);
  NEXT();
}
L_CallVirt: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  const Func* callee = o->cls->vtable[dOf(w)];
  if (__builtin_expect(fp == framesEnd, 0)) TRAP("stack overflow");
  *fp++ = {pc, fn, r};
  r = r + A; fn = callee; code = callee->code; pc = code;
  NEXT();
}
L_Downcast: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (o && !isSubclassRT(o->cls, dOf(w))) TRAP("invalid cast");
  NEXT();
}
L_LoadNull: r[A] = 0; NEXT();
L_InstanceOf: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  r[A] = Slot{o && isSubclassRT(o->cls, dOf(w))};
  NEXT();
}
L_EqR: r[A] = Slot{r[B] == r[C]}; NEXT();
L_NeR: r[A] = Slot{r[B] != r[C]}; NEXT();
L_GetGlobal: r[A] = globals[dOf(w)]; NEXT();
L_SetGlobal: { Slot old = globals[dOf(w)]; globals[dOf(w)] = r[A]; if (globalRef[dOf(w)]) releaseSlot(old); NEXT(); }
L_Retain: retain(reinterpret_cast<Obj*>(r[A])); NEXT();
L_Release: if (__builtin_expect(!release(reinterpret_cast<Obj*>(r[A])), 0)) TRAP("release of an object that is already dead"); NEXT();
L_LoadStr: r[A] = reinterpret_cast<Slot>(strConsts[dOf(w)]); NEXT();
L_ArrGet: {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[B]));
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  if (__builtin_expect(r[C] >= o->v.size(), 0)) TRAP("array index out of bounds");
  r[A] = o->v[r[C]];
  NEXT();
}
L_ArrSet: {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[A]));
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  Slot i = r[B];
  if (__builtin_expect(i >= o->v.size(), 0)) { if (i != o->v.size()) TRAP("array index out of bounds"); o->v.push_back(r[C]); }  // writing at length appends, like the native runtime
  else { Slot old = o->v[i]; o->v[i] = r[C]; if (o->cls->elemRef) releaseSlot(old); }
  NEXT();
}
L_ArrLen: {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[B]));
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  r[A] = o->v.size();
  NEXT();
}
L_ArrPush: {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[B]));
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  if (__builtin_expect(o->v.size() >= 0x7fffffffu, 0)) TRAP("RangeError: Invalid array length");
  o->v.push_back(r[C]);
  r[A] = o->v.size();
  NEXT();
}
L_Rt: {
  const char* e = rtCall(*this, static_cast<Rt>(dOf(w)), r + A, r + fn->nregs);
  if (__builtin_expect(e != nullptr, 0)) { if (e != error.c_str()) error = e; return false; }
  NEXT();
}
L_LogStr: {
  auto* s = reinterpret_cast<StrObj*>(r[A]);
  if (!s) TRAP("null reference");
  out->append(s->data(), s->len);
  NEXT();
}
L_LogI: *out += std::to_string(static_cast<std::int64_t>(r[A])); NEXT();
L_LogU: *out += std::to_string(r[A]); NEXT();
L_LogF64: { double d = asD(r[A]); *out += (d == 0 && std::signbit(d)) ? std::string("-0") : numberToString(d); NEXT(); }  // console.log prints -0
L_LogF32: *out += numberToString(static_cast<double>(asF(r[A]))); NEXT();
L_LogBool: *out += r[A] ? "true" : "false"; NEXT();
L_LogSep: *out += ' '; NEXT();
L_LogEnd: *out += '\n'; NEXT();
#undef NEXT
#undef A
#undef B
#undef C
#undef TRAP
#undef ARITH
#undef DIVLIKE
}

Result run(const zbc::Module& mod, std::string& out, bool traceFree) {
  Machine m;
  m.out = &out;
  m.traceFree = traceFree;
  Result res;
  std::string err;
  if (!m.load(mod, err)) { res.ok = false; res.error = err; return res; }
  if (!m.exec(&m.funcs[0], m.stack)) { res.ok = false; res.error = m.error; }
  else {
    for (std::size_t g = m.globals.size(); g-- > 0;) if (m.globalRef[g]) { Slot v = m.globals[g]; m.globals[g] = 0; m.releaseSlot(v); }  // statics die in reverse order of definition
    for (const Obj* o : m.allocated) if (o->rc != kImmortal) ++res.leaked;
  }
  res.trace = std::move(m.trace);
  return res;
}

}  // namespace zn::vm
