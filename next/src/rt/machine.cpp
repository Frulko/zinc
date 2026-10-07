// The machine the engines share: loading a module into classes and functions, allocation, reference counting and
// destruction order, comparator and exception callbacks. The interpreter (vm) and the compiled programs (aot) both link it.
#include "rt/rt.h"

#include <bit>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <vector>

#include "zn/ops.h"

namespace zn::rt {

void Machine::flushErrLine() {
  std::string line = out->substr(errMark) + '\n';
  std::fwrite(out->data(), 1, errMark, stdout);
  std::fflush(stdout);
  out->clear();
  std::fwrite(line.data(), 1, line.size(), stderr);
}

std::string numberToString(double v) {
  if (v != v) return "NaN";
  if (v == 0) return "0";
  if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
  std::string sign = v < 0 ? "-" : "";
  v = std::fabs(v);
  if (v < 9007199254740992.0 && v == std::floor(v)) return sign + std::to_string(static_cast<std::uint64_t>(v));  // an integer: its digits
  char buf[48];
  auto tc = std::to_chars(buf, buf + sizeof buf - 1, v, std::chars_format::scientific);  // the shortest digits that round-trip (the standard library's Ryu)
  *tc.ptr = 0;
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

KeyKind keyKindOf(const zbc::Module& m, zbc::VType t) {
  switch (t.cls) {
    case zbc::Cls::S: return KeyKind::F32;
    case zbc::Cls::D: return KeyKind::F64;
    case zbc::Cls::R: return m.classes[t.ref].kind == zbc::CKind::String ? KeyKind::Str : KeyKind::Ref;
    default: return KeyKind::Int;
  }
}

}  // namespace

std::size_t Machine::objBytes(const Obj* o) const {
  switch (o->cls->kind) {
    case zbc::CKind::Object: return sizeof(Obj) + static_cast<std::size_t>(o->cls->nfields) * sizeof(Slot);
    case zbc::CKind::String: return sizeof(StrObj) + static_cast<const StrObj*>(o)->len + 1;
    case zbc::CKind::Array: return sizeof(ArrObj);
    default: return sizeof(MapObj);
  }
}
std::size_t Machine::payloadBytes(const Obj* o) const {
  switch (o->cls->kind) {
    case zbc::CKind::Array: return static_cast<const ArrObj*>(o)->v.capacity() * sizeof(Slot);
    case zbc::CKind::Map: case zbc::CKind::Set: {
      const Table& t = static_cast<const MapObj*>(o)->t;
      return (t.keys.capacity() + t.vals.capacity()) * sizeof(Slot) + t.dead.capacity() + t.index.capacity() * sizeof(std::int32_t);
    }
    default: return 0;
  }
}
void Machine::memTrack(Obj* o) {
  ClassMem& c = mem->perClass[o->cls->id];
  std::size_t b = objBytes(o);
  ++mem->allocs; ++c.allocs; ++c.live; c.headerBytes += b;
  if (c.live > c.peakLive) c.peakLive = c.live;
  if (++mem->live > mem->peakLive) mem->peakLive = mem->live;
  mem->liveBytes += b;
  if (mem->liveBytes > mem->peakBytes) mem->peakBytes = mem->liveBytes;
}
void Machine::memFree(Obj* o) {
  ClassMem& c = mem->perClass[o->cls->id];
  std::size_t b = objBytes(o), p = payloadBytes(o);
  ++mem->frees; ++c.frees; --c.live; --mem->live;
  c.payloadBytes += p;
  mem->liveBytes -= b;
}

// The last reference to `root` is gone: destroy it and, depth first, whatever only it kept alive. Order, as with the native
// runtime's RAII: an object's fields in reverse order of declaration, an array's elements first to last, a Map's entries
// first to last (key, then value).
void Machine::destroy(Obj* root) {
  std::vector<Obj*>& pending = destroyStack;  // references still to release; the top is released next (kept between calls: no allocation per destruction)
  pending.clear();
  auto drop = [&](Obj* o) { if (o && o->rc != kImmortal) pending.push_back(o); };
  auto freeNode = [&](Obj* o) {
    if (mem) memFree(o);
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
      default: freeRaw(o); break;
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
      default: freeRaw(o); break;
    }
  }
  std::free(stack);
}

bool Machine::load(const zbc::Module& m, std::string& err) {
  mod = &m;
  funcs.resize(m.functions.size());
  codeLen.resize(funcs.size());
  for (std::size_t i = 0; i < funcs.size(); ++i) codeLen[i] = m.functions[i].code.size();
  for (std::size_t i = 0; i < funcs.size(); ++i) funcs[i] = {m.functions[i].code.data(), m.functions[i].consts.data(), m.functions[i].nregs, m.functions[i].handlers.data(), static_cast<std::uint32_t>(m.functions[i].handlers.size())};
  // Verified code never reads a register before writing it, so the stack needs no initialisation; calloc hands out
  // lazily zeroed pages, so the 20 MB is not touched until used.
  std::size_t slots = stackSlots ? stackSlots : kStackSlots;
  stack = static_cast<Slot*>(std::calloc(slots, sizeof(Slot)));
  stackEnd = stack ? stack + slots : nullptr;
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
  std::size_t depthMax = maxDepth ? maxDepth : kMaxCallDepth;
  frames.resize(depthMax);
  fp = frames.data();
  framesEnd = frames.data() + depthMax;
  return true;
}

StrObj* Machine::newStr(const char* p, std::size_t n) {
  auto* s = static_cast<StrObj*>(allocRaw(sizeof(StrObj) + n + 1));
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

bool Machine::resolveDyn() {
  if (dynMap) return true;
  for (const ClassRT& c : classes) {
    if (c.name == "DynNum") dynNum = &c; else if (c.name == "DynStr") dynStr = &c; else if (c.name == "DynBool") dynBool = &c;
    else if (c.name == "DynArr") dynArr = &c; else if (c.name == "DynObj") dynObj = &c;
    else if (c.name == "DynUndef") dynUndef = &c; else if (c.name == "DynNull") dynNull = &c;
  }
  for (std::size_t i = 0; i < mod->classes.size(); ++i) {
    const zbc::ClassInfo& ci = mod->classes[i];
    if (ci.kind == zbc::CKind::Array && ci.elem.cls == zbc::Cls::R && mod->classes[ci.elem.ref].name == "Dyn") dynItems = &classes[i];
    if (ci.kind == zbc::CKind::Map && ci.key.cls == zbc::Cls::R && mod->classes[ci.key.ref].kind == zbc::CKind::String && ci.elem.cls == zbc::Cls::R && mod->classes[ci.elem.ref].name == "Dyn") dynMap = &classes[i];
  }
  return dynNum && dynStr && dynBool && dynArr && dynObj && dynItems && dynMap;
}

// "Name: message" of an exception: what its __errorString() method says, else its class name.
std::string Machine::exceptionText(Obj* exc) {
  const ClassRT& c = *exc->cls;
  for (std::uint32_t sel : mod->classes[c.id].selectors) {
    if (mod->selectors[sel].name != "__errorString" || sel >= c.vtable.size() || !c.vtable[sel]) continue;
    const Func* f = c.vtable[sel];
    std::vector<Slot> regs(f->nregs + 4, 0);
    retain(exc);  // the callee owns its parameters
    regs[0] = reinterpret_cast<Slot>(exc);
    std::string saved = error;
    if (exec(f, regs.data()) && regs[0]) { const StrObj* s = reinterpret_cast<const StrObj*>(regs[0]); error = saved; return std::string(s->data(), s->len); }
    error = saved;
  }
  return c.name;
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
  result = ops::asD(scratch[0]);
  return true;
}

}  // namespace zn::rt
