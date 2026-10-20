// The runtime half of Fast Refresh (ZN-742, ZN-631): the plan, the swap and the unit as bytes. Nothing here includes the compiler, so the
// players (Zinc Go, src/app/player.cpp) link it with the interpreter; the half that describes a compile is hot.cpp (the zinc command line).
#include "dev/hot.h"

#include <cstring>
#include <filesystem>
#include <set>
#include <unordered_map>

#include <zstd.h>

namespace zn::dev::hot {

using rt::Machine;
using rt::Obj;

// A module path as zinc dev's user reads it: relative to the project (the child runs there).
std::string shown(const std::string& p) {
  if (p.empty() || p[0] != '/') return p;
  std::error_code ec;
  const std::string rel = std::filesystem::path(p).lexically_relative(std::filesystem::current_path(ec)).generic_string();
  return rel.empty() || rel.rfind("..", 0) == 0 ? p : rel;
}

void finish(Unit& u) {
  // a builtin class is named by its kind and the keys of its element types: two classes named alike in two files give two keys
  auto vt = [&](zbc::VType t) -> std::string {
    switch (t.cls) {
      case zbc::Cls::I: return "i";
      case zbc::Cls::S: return "s";
      case zbc::Cls::D: return "d";
      case zbc::Cls::R: return t.ref < u.classes.size() ? "(" + u.classes[t.ref] + ")" : "?";
      default: return "-";
    }
  };
  for (std::size_t c = u.classes.size(); c < u.zbc.classes.size(); ++c) {
    const zbc::ClassInfo& ci = u.zbc.classes[c];
    static const char* const kinds[] = {"object", "string", "array", "map", "set"};
    u.classes.push_back("::builtin " + std::string(kinds[static_cast<int>(ci.kind)]) + "<" + vt(ci.elem) + "," + vt(ci.key) + ">");
  }
}

// ---- the plan: React Native's rules over the module graph

std::string plan(const Unit& old, const Unit& neu, std::vector<std::string>& reeval, std::vector<std::string>& changed) {
  auto sameNatives = [&] {
    if (old.zbc.natives.size() != neu.zbc.natives.size()) return false;
    for (std::size_t i = 0; i < old.zbc.natives.size(); ++i) {
      const zbc::Native &x = old.zbc.natives[i], &y = neu.zbc.natives[i];
      if (x.module != y.module || x.name != y.name || x.sig != y.sig) return false;
    }
    return true;
  };
  if (!sameNatives()) return "the program calls other native code (a plugin was added, removed or changed)";
  std::unordered_map<std::string, const Unit::Mod*> was, is;
  for (const Unit::Mod& m : old.modules) was[m.path] = &m;
  for (const Unit::Mod& m : neu.modules) is[m.path] = &m;
  for (const Unit::Mod& m : neu.modules) {
    if (!m.library) continue;
    auto w = was.find(m.path);
    if (w == was.end()) return "the program now imports " + shown(m.path);
    if (w->second->hash != m.hash) return m.path == "<prelude>" ? "the program now uses a part of the engine it did not load before" : shown(m.path) + " changed";
  }
  for (const Unit::Mod& m : old.modules) if (m.library && !is.count(m.path)) return "the program no longer imports " + shown(m.path);
  if (old.resources != neu.resources) return "the fonts and images to bake changed";
  std::unordered_map<std::string, std::vector<std::string>> importers;
  for (const Unit::Mod& m : neu.modules) for (const std::string& i : m.imports) importers[i].push_back(m.path);
  std::vector<std::string> work;
  for (const Unit::Mod& m : neu.modules) {
    auto w = was.find(m.path);
    if (!m.library && (w == was.end() || w->second->hash != m.hash)) { changed.push_back(m.path); work.push_back(m.path); }
  }
  std::set<std::string> in;
  while (!work.empty()) {   // a changed module re-runs; one that exports anything but components re-runs its importers too, up to a boundary
    const std::string p = work.back();
    work.pop_back();
    if (!in.insert(p).second) continue;
    if (is.at(p)->boundary) continue;
    for (const std::string& i : importers[p]) work.push_back(i);
  }
  for (const Unit::Mod& m : neu.modules) {
    if (!in.count(m.path)) continue;
    if (m.library) return shown(m.path) + " imports a changed module and cannot run again";
    if (!m.effect.empty() && !m.disposes) return m.effect + " runs at the top level, and the module has no import.meta.hot.dispose to undo it";
    reeval.push_back(m.path);
  }
  return "";
}

// ---- the swap

constexpr std::uint32_t kTrapCode[1] = {static_cast<std::uint32_t>(Op::Trap)};
const rt::Func kZombieMethod{kTrapCode, nullptr, 16, nullptr, 0};   // what a callback of the old code runs: a trap, never old code

std::uint32_t keyIndex(const std::vector<std::string>& keys, const std::string& k) {
  for (std::uint32_t i = 0; i < keys.size(); ++i) if (keys[i] == k) return i;
  return UINT32_MAX;
}

// Calls zinc:hot's beforeUpdate or afterUpdate with the paths, as the code of `u` has it.
static bool callHook(Machine& m, const Unit& u, const char* name, const std::vector<std::string>& paths, std::string& err) {
  const std::uint32_t fi = keyIndex(u.functions, u.hotPath + "::" + name);
  if (fi == UINT32_MAX || !m.strArray) { err = std::string("zinc:hot has no ") + name; return false; }
  rt::ArrObj* arr = m.newArr(m.strArray);
  for (const std::string& p : paths) arr->v.push_back(reinterpret_cast<zn::Slot>(m.newStr(p.data(), p.size())));
  m.stack[0] = reinterpret_cast<zn::Slot>(arr);   // the callee owns its parameters
  if (m.exec(&m.funcs[fi], m.stack)) return true;
  err = m.error;
  return false;
}

static std::string startsWithAny(const std::string& key, const std::vector<std::string>& paths, const char* sep) {
  for (const std::string& p : paths) if (key.size() > p.size() && key.compare(0, p.size(), p) == 0 && key.compare(p.size(), std::strlen(sep), sep) == 0) return p;
  return "";
}

// Moves the program running on `m` from the code of `old` onto the code of `neu` (which gains the zombie classes): empty, or why it could not.
// Past the first step the old program cannot go on: a failure means a restart.
std::string swap(Machine& m, const Unit& old, Unit& neu, const std::vector<std::string>& reeval, const std::vector<std::string>& changed) {
  std::string err;
  // keys two entries share are never mapped
  auto index = [](const std::vector<std::string>& keys, std::unordered_map<std::string, std::uint32_t>& out) {
    std::set<std::string> dup;
    for (std::uint32_t i = 0; i < keys.size(); ++i) if (!out.emplace(keys[i], i).second) dup.insert(keys[i]);
    for (const std::string& d : dup) out[d] = UINT32_MAX;
  };
  std::unordered_map<std::string, std::uint32_t> newClass, newGlobal, oldGlobal;
  index(neu.classes, newClass);
  index(neu.globals, newGlobal);
  index(old.globals, oldGlobal);
  auto mapClass = [&](std::uint32_t c) -> std::uint32_t {
    if (c >= old.classes.size()) return UINT32_MAX;
    auto it = newClass.find(old.classes[c]);
    return it == newClass.end() ? UINT32_MAX : it->second;
  };
  auto sameType = [&](zbc::VType a, zbc::VType b) { return a.cls == b.cls && (a.cls != zbc::Cls::R || mapClass(a.ref) == b.ref); };
  // 1. the old code lets go: the 'beforeUpdate' listeners and the dispose hooks of the modules that run again
  if (!callHook(m, old, "beforeUpdate", reeval, err)) return "import.meta.hot.dispose failed: " + err;
  // 2. the state of those modules goes, and so does every global the new code does not have
  for (std::uint32_t g = 0; g < old.globals.size(); ++g) {
    auto it = newGlobal.find(old.globals[g]);
    if (!startsWithAny(old.globals[g], reeval, "::").empty() || it == newGlobal.end() || it->second == UINT32_MAX || oldGlobal[old.globals[g]] == UINT32_MAX) {
      const zn::Slot v = m.globals[g];
      m.globals[g] = 0;
      if (m.globalRef[g]) m.releaseSlot(v);
    }
  }
  // 3. every live object's class has a class of the same shape in the new code; a closure of a changed file (its key is its offset there)
  //    becomes a zombie, which must be gone once the modules ran again
  std::vector<std::uint32_t> target(m.classes.size(), UINT32_MAX);
  std::vector<std::uint32_t> zombieOf;   // old class ids
  std::vector<std::uint8_t> seen(m.classes.size(), 0);
  for (Obj* o : m.allocated) {
    const std::uint32_t c = o->cls->id;
    if (seen[c]) continue;
    seen[c] = 1;
    const std::string& key = c < old.classes.size() ? old.classes[c] : std::string();
    if (!startsWithAny(key, changed, "#").empty()) { zombieOf.push_back(c); continue; }
    const std::uint32_t n = mapClass(c);
    if (n == UINT32_MAX) return key.empty() ? "an object from before the last update is still alive" : newClass.count(key) ? "two classes share the key " + key : "objects of " + key + " are alive and the new code has no such class";
    const zbc::ClassInfo &a = old.zbc.classes[c], &b = neu.zbc.classes[n];
    bool same = a.kind == b.kind && a.fields.size() == b.fields.size() && sameType(a.elem, b.elem) && sameType(a.key, b.key) &&
                (c >= old.fields.size() || n >= neu.fields.size() || old.fields[c] == neu.fields[n]);
    for (std::size_t f = 0; same && f < a.fields.size(); ++f) same = sameType(a.fields[f], b.fields[f]);
    if (!same) return "the fields of " + key + " changed while objects of it are alive";
    target[c] = n;
  }
  // 4. the globals that stay keep their values, by key
  std::vector<zn::Slot> globals(neu.globals.size(), 0);
  for (std::uint32_t g = 0; g < neu.globals.size(); ++g) {
    const std::string& key = neu.globals[g];
    if (!startsWithAny(key, reeval, "::").empty()) continue;
    auto o = oldGlobal.find(key);
    if (o == oldGlobal.end() || o->second == UINT32_MAX || newGlobal[key] == UINT32_MAX) return "the new code has a variable " + key + " that nothing would set";
    if (!sameType(old.zbc.globals[o->second], neu.zbc.globals[g])) return "the type of " + key + " changed";
    globals[g] = m.globals[o->second];
    m.globals[o->second] = 0;
  }
  // 5. the new code, with one class per zombie: its fields as they were, every method a trap
  const auto zombieBase = static_cast<std::uint32_t>(neu.zbc.classes.size());
  for (std::uint32_t c : zombieOf) {
    zbc::ClassInfo z;
    z.name = old.zbc.classes[c].name + " (replaced)";
    z.fields = old.zbc.classes[c].fields;
    target[c] = static_cast<std::uint32_t>(neu.zbc.classes.size());
    neu.zbc.classes.push_back(std::move(z));
  }
  Machine fresh;
  fresh.stackSlots = 1024;   // its stack is never used: the code moves to `m`
  if (!fresh.load(neu.zbc, err)) return err;
  for (std::uint32_t c = zombieBase; c < fresh.classes.size(); ++c) for (const rt::Func*& f : fresh.classes[c].vtable) f = &kZombieMethod;
  // 6. the transplant: each object takes its new class, the machine its new code
  for (Obj* o : m.allocated) o->cls = &fresh.classes[target[o->cls->id]];
  for (Obj* o : fresh.allocated) { o->pad = static_cast<std::uint32_t>(m.allocated.size()); m.allocated.push_back(o); }   // the new string constants
  m.live += fresh.live;
  m.immortals += fresh.immortals;
  fresh.allocated.clear();
  fresh.live = fresh.immortals = 0;
  m.mod = &neu.zbc;
  m.funcs = std::move(fresh.funcs);
  m.classes = std::move(fresh.classes);
  m.codeLen = std::move(fresh.codeLen);
  m.lineHot = std::move(fresh.lineHot);
  m.strConsts = std::move(fresh.strConsts);
  m.strClass = fresh.strClass;
  m.strArray = fresh.strArray;
  m.globals = std::move(globals);
  m.globalRef = std::move(fresh.globalRef);
  m.fusedReady = false;
  m.fusedCode.clear();
  m.dynUndef = m.dynNull = m.dynNum = m.dynStr = m.dynBool = m.dynArr = m.dynObj = m.dynItems = m.dynMap = nullptr;
  if (m.mem) m.mem->perClass.resize(m.classes.size());
  rt::rebindCallbacks(m);
  // 7. the modules run again, in order, then the 'afterUpdate' listeners
  for (const std::string& p : reeval) {
    const std::uint32_t fi = keyIndex(neu.functions, "@init:" + p);
    if (fi == UINT32_MAX) return "no init function for " + shown(p);
    if (!m.exec(&m.funcs[fi], m.stack)) {
      if (!zombieOf.empty() && m.error.find("unreachable") != std::string::npos) return "a callback of " + shown(startsWithAny(old.classes[zombieOf[0]], changed, "#")) + " from before the change was called";
      return shown(p) + " failed as it ran again: " + m.error;
    }
  }
  if (!callHook(m, neu, "afterUpdate", reeval, err)) return "an afterUpdate listener failed: " + err;
  for (Obj* o : m.allocated)
    if (o->cls->id >= zombieBase)
      for (std::uint32_t c : zombieOf)
        if (target[c] == o->cls->id) return "a callback of " + shown(startsWithAny(old.classes[c], changed, "#")) + " from before the change is still alive (a timer or a listener? undo it in import.meta.hot.dispose)";
  return "";
}

// ---- the unit as bytes (zinc dev --lan to a player): a magic, then zstd of the fields, strings length-prefixed

namespace {
struct Out {
  std::vector<std::uint8_t> b;
  void u32(std::uint32_t v) { for (int k = 0; k < 4; ++k) b.push_back(static_cast<std::uint8_t>(v >> (8 * k))); }
  void u64(std::uint64_t v) { u32(static_cast<std::uint32_t>(v)); u32(static_cast<std::uint32_t>(v >> 32)); }
  void str(const std::string& s) { u32(static_cast<std::uint32_t>(s.size())); b.insert(b.end(), s.begin(), s.end()); }
  void strs(const std::vector<std::string>& v) { u32(static_cast<std::uint32_t>(v.size())); for (const std::string& s : v) str(s); }
};
struct In {
  const std::uint8_t* p;
  const std::uint8_t* end;
  bool ok = true;
  std::uint32_t u32() {
    if (end - p < 4) { ok = false; return 0; }
    const std::uint32_t v = p[0] | p[1] << 8 | p[2] << 16 | static_cast<std::uint32_t>(p[3]) << 24;
    p += 4;
    return v;
  }
  std::uint64_t u64() { const std::uint64_t lo = u32(); return lo | static_cast<std::uint64_t>(u32()) << 32; }
  std::string str() {
    const std::uint32_t n = u32();
    if (!ok || static_cast<std::size_t>(end - p) < n) { ok = false; return {}; }
    std::string s(reinterpret_cast<const char*>(p), n);
    p += n;
    return s;
  }
  std::vector<std::string> strs() {
    std::vector<std::string> v(ok ? std::min<std::uint32_t>(u32(), static_cast<std::uint32_t>(end - p) / 4) : 0);
    for (std::string& s : v) s = str();
    return v;
  }
};
constexpr char kMagic[8] = {'Z', 'N', 'H', 'O', 'T', 'U', '1', '\n'};
}  // namespace

std::vector<std::uint8_t> save(const Unit& u) {
  Out o;
  const std::vector<std::uint8_t> code = zbc::encode(u.zbc);
  o.u32(static_cast<std::uint32_t>(code.size()));
  o.b.insert(o.b.end(), code.begin(), code.end());
  o.strs(u.functions);
  o.strs(u.classes);
  o.strs(u.globals);
  o.strs(u.fields);
  o.u32(static_cast<std::uint32_t>(u.modules.size()));
  for (const Unit::Mod& m : u.modules) {
    o.str(m.path);
    o.u64(m.hash);
    o.strs(m.imports);
    o.u32((m.library ? 1u : 0u) | (m.boundary ? 2u : 0u) | (m.disposes ? 4u : 0u));
    o.str(m.effect);
  }
  o.str(u.hotPath);
  o.str(std::string(u.resources.begin(), u.resources.end()));
  o.strs(u.plugins);
  std::vector<std::uint8_t> out(sizeof kMagic + 8 + ZSTD_compressBound(o.b.size()));
  std::memcpy(out.data(), kMagic, sizeof kMagic);
  Out len;
  len.u64(o.b.size());
  std::memcpy(out.data() + sizeof kMagic, len.b.data(), 8);
  const std::size_t n = ZSTD_compress(out.data() + sizeof kMagic + 8, out.size() - sizeof kMagic - 8, o.b.data(), o.b.size(), 3);
  out.resize(ZSTD_isError(n) ? 0 : sizeof kMagic + 8 + n);
  return out;
}

bool load(const std::uint8_t* p, std::size_t n, Unit& u, std::string& err) {
  if (n < sizeof kMagic + 8 || std::memcmp(p, kMagic, sizeof kMagic) != 0) { err = "not a program from zinc dev (another version of Zinc?)"; return false; }
  In len{p + sizeof kMagic, p + sizeof kMagic + 8};
  const std::uint64_t size = len.u64();
  if (size > (1ull << 31)) { err = "a program of " + std::to_string(size) + " bytes"; return false; }
  std::vector<std::uint8_t> raw(static_cast<std::size_t>(size));
  const std::size_t got = ZSTD_decompress(raw.data(), raw.size(), p + sizeof kMagic + 8, n - sizeof kMagic - 8);
  if (ZSTD_isError(got) || got != raw.size()) { err = "the program arrived damaged"; return false; }
  In in{raw.data(), raw.data() + raw.size()};
  const std::uint32_t codeLen = in.u32();
  if (!in.ok || static_cast<std::size_t>(in.end - in.p) < codeLen) { err = "the program arrived damaged"; return false; }
  const std::vector<std::uint8_t> code(in.p, in.p + codeLen);
  in.p += codeLen;
  if (!zbc::decode(code, u.zbc, err)) return false;
  u.functions = in.strs();
  u.classes = in.strs();
  u.globals = in.strs();
  u.fields = in.strs();
  u.modules.resize(in.ok ? std::min<std::uint32_t>(in.u32(), static_cast<std::uint32_t>(in.end - in.p) / 8) : 0);
  for (Unit::Mod& m : u.modules) {
    m.path = in.str();
    m.hash = static_cast<std::size_t>(in.u64());
    m.imports = in.strs();
    const std::uint32_t f = in.u32();
    m.library = f & 1;
    m.boundary = f & 2;
    m.disposes = f & 4;
    m.effect = in.str();
  }
  u.hotPath = in.str();
  const std::string res = in.str();
  u.resources.assign(res.begin(), res.end());
  u.plugins = in.strs();
  if (!in.ok) { err = "the program arrived damaged"; return false; }
  err = zbc::verify(u.zbc);
  return err.empty();
}

}  // namespace zn::dev::hot
