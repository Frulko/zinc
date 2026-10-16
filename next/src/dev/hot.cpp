// zinc dev's Fast Refresh on the interpreter (ZN-742): see hot.h and docs/reports/zinc-next-fast-refresh.md §10.
#include "dev/hot.h"

#include <cctype>
#include <cstring>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <set>
#include <unordered_map>

#include <sys/socket.h>
#include <unistd.h>

#include "frontend/lexer.h"
#include "frontend/modules.h"
#include "ir/ir.h"
#include "zn/host.h"

namespace zn::dev::hot {

using frontend::N;
using rt::Machine;
using rt::Obj;

namespace {

bool libraryPath(const std::string& p) {
  return p.rfind("zinc:", 0) == 0 || (!p.empty() && p[0] == '<') || p.find("/lib/std/") != std::string::npos || p.find("/lib/compat/") != std::string::npos ||
         p.find("/plugins/") != std::string::npos;
}

// A module path as zinc dev's user reads it: relative to the project (the child runs there).
std::string shown(const std::string& p) {
  if (p.empty() || p[0] != '/') return p;
  std::error_code ec;
  const std::string rel = std::filesystem::path(p).lexically_relative(std::filesystem::current_path(ec)).generic_string();
  return rel.empty() || rel.rfind("..", 0) == 0 ? p : rel;
}

// The calls a module may make at its top level and run again: each replaces what the previous run set up (the root, the frame callback).
bool replaces(const frontend::Ast& a, std::uint32_t call) {
  if (a.nodes[call].kind != N::Call) return false;
  const frontend::Node& callee = a.nodes[a.nodes[call].kids[0]];
  return callee.kind == N::Ident && (callee.text == "render" || callee.text == "renderWindow" || callee.text == "onFrame");
}

}  // namespace

void describe(const frontend::Program& prog, const ir::Module& low, Unit& u) {
  for (const ir::Function& f : low.functions) u.functions.push_back(f.key);
  for (const ir::Class& c : low.classes) {
    u.classes.push_back(c.key);
    std::string names;
    for (const ir::Field& f : c.fields) names += f.name + ",";
    u.fields.push_back(names);
  }
  for (const ir::Global& g : low.globals) u.globals.push_back(g.key);
  const frontend::Ast& a = prog.ast;
  if (a.hotModule != frontend::kNone) u.hotPath = a.modules[a.hotModule].path;
  for (const frontend::ModuleInfo& mi : a.modules) {
    const frontend::SourceFile& f = prog.files[mi.file];
    Unit::Mod m;
    m.path = mi.path;
    m.hash = std::hash<std::string>{}(f.text);
    m.library = libraryPath(mi.path);
    for (const frontend::ModuleImport& im : mi.imports) m.imports.push_back(a.modules[im.from].path);
    bool components = !mi.exports.empty();
    for (const frontend::ModuleExport& ex : mi.exports) {
      if (ex.from != frontend::kNone) m.imports.push_back(a.modules[ex.from].path);
      const frontend::Node* d = ex.node == frontend::kNone ? nullptr : &a.nodes[ex.node];
      const bool fn = d && (d->kind == N::Function || (d->kind == N::Declarator && d->kids.size() > 1 && d->kids[1] != frontend::kNone && a.nodes[d->kids[1]].kind == N::FuncExpr));
      if (ex.from != frontend::kNone || ex.all || ex.name.empty() || !std::isupper(static_cast<unsigned char>(ex.name[0])) || !fn) components = false;
    }
    // import.meta.hot keeps its spelling in the text (the loader rewrites nodes, not text)
    m.boundary = components || f.text.find("import.meta.hot.accept(") != std::string::npos;
    m.disposes = f.text.find("import.meta.hot.dispose(") != std::string::npos;
    for (std::uint32_t st : mi.stmts) {
      const frontend::Node& x = a.nodes[st];
      if (x.kind != N::ExprStmt || st == a.runLoop || x.kids.empty() || replaces(a, x.kids[0])) continue;
      const std::string_view src = std::string_view(f.text).substr(x.start, x.end - x.start);
      if (src.rfind("import.meta.hot", 0) == 0) continue;
      const std::uint32_t at = f.map.empty() ? x.start : frontend::sourceOffset(f.map, x.start);
      const frontend::LineCol lc = frontend::lineCol(f.map.empty() ? f.text : f.original, at);
      std::string snippet(src.substr(0, src.find('\n')));
      if (snippet.size() > 40) snippet = snippet.substr(0, 37) + "...";
      m.effect = shown(mi.path) + ":" + std::to_string(lc.line) + " `" + snippet + "`";
      break;
    }
    u.modules.push_back(std::move(m));
  }
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

namespace {

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

std::uint32_t indexOf(const std::vector<std::string>& keys, const std::string& k) {
  for (std::uint32_t i = 0; i < keys.size(); ++i) if (keys[i] == k) return i;
  return UINT32_MAX;
}

// Calls zinc:hot's beforeUpdate or afterUpdate with the paths, as the code of `u` has it.
bool callHook(Machine& m, const Unit& u, const char* name, const std::vector<std::string>& paths, std::string& err) {
  const std::uint32_t fi = indexOf(u.functions, u.hotPath + "::" + name);
  if (fi == UINT32_MAX || !m.strArray) { err = std::string("zinc:hot has no ") + name; return false; }
  rt::ArrObj* arr = m.newArr(m.strArray);
  for (const std::string& p : paths) arr->v.push_back(reinterpret_cast<zn::Slot>(m.newStr(p.data(), p.size())));
  m.stack[0] = reinterpret_cast<zn::Slot>(arr);   // the callee owns its parameters
  if (m.exec(&m.funcs[fi], m.stack)) return true;
  err = m.error;
  return false;
}

std::string startsWithAny(const std::string& key, const std::vector<std::string>& paths, const char* sep) {
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
    const std::uint32_t fi = indexOf(neu.functions, "@init:" + p);
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

// ---- the channel to zinc dev, served at the end of each frame

using Clock = std::chrono::steady_clock;
int gFd = -1;
bool gReady = false;
std::string gIn;
Compile gCompile;
Unit* gCur = nullptr;
std::unique_ptr<Unit> gNext;              // compiled and planned: swapped once the loop has ended
std::vector<std::string> gReeval, gChanged;
std::string gReply;                       // sent at the end of the first frame of the new code
Clock::time_point gAsked;

void send(const std::string& s) {
  for (std::size_t at = 0; at < s.size();) {
    const ssize_t n = write(gFd, s.data() + at, s.size() - at);
    if (n <= 0) return;   // zinc dev is gone: it restarts or ends the program itself
    at += static_cast<std::size_t>(n);
  }
}

void frameEnd() {
  if (!gReady) { gReady = true; send("hot ready\n"); }
  if (!gReply.empty()) { send(gReply); gReply.clear(); }
  if (gNext) return;
  char buf[256];
  for (ssize_t n; (n = recv(gFd, buf, sizeof buf, MSG_DONTWAIT)) > 0;) gIn.append(buf, static_cast<std::size_t>(n));
  const std::size_t nl = gIn.find('\n');
  if (nl == std::string::npos) return;
  const std::string line = gIn.substr(0, nl);
  gIn.erase(0, nl + 1);
  if (line != "reload") return;
  gAsked = Clock::now();
  auto u = std::make_unique<Unit>();
  std::string errors;
  if (!gCompile(*u, errors)) { send("error\n" + errors + (errors.empty() || errors.back() == '\n' ? "" : "\n") + "end\n"); return; }
  gReeval.clear();
  gChanged.clear();
  const std::string why = plan(*gCur, *u, gReeval, gChanged);
  if (!why.empty()) { send("restart " + why + "\n"); return; }
  gNext = std::move(u);
#ifdef ZN_HOST_GFX
  zn::host::pauseLoop();   // the loop ends after this frame and main returns: the stack is empty for the swap
#endif
}

}  // namespace

rt::Result run(std::unique_ptr<Unit> first, std::string& out, bool traceFree, Compile compile, int fd) {
  gFd = fd;
  gCompile = std::move(compile);
  std::unique_ptr<Unit> cur = std::move(first);
  gCur = cur.get();
#ifdef ZN_HOST_GFX
  zn::host::onFrameEnd(frameEnd);   // a program without a frame loop never says `hot ready`: zinc dev restarts it
#endif
  Machine m;
  m.out = &out;
  m.outLive = true;
  m.traceFree = traceFree;
  rt::Result res;
  std::string err;
  if (!m.load(cur->zbc, err)) { res.ok = false; res.error = err; return res; }
  bool ok = m.exec(&m.funcs[0], m.stack);
  while (ok && gNext) {
    const std::string why = swap(m, *cur, *gNext, gReeval, gChanged);
    if (!why.empty()) {   // the old program let go of its state: only a restart is left
      send("restart " + why + "\n");
      m.flushOut();
      std::_Exit(3);
    }
    cur = std::move(gNext);
    gCur = cur.get();
    const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - gAsked).count();
    gReply = "ok " + std::to_string(ms);
    for (const std::string& p : gReeval) gReply += " " + shown(p);
    gReply += "\n";
    const std::uint32_t loop = indexOf(cur->functions, "<prelude>::__runLoop");
    if (loop == UINT32_MAX) { send("restart the new code has no event loop\n"); m.flushOut(); std::_Exit(3); }
    ok = m.exec(&m.funcs[loop], m.stack);
  }
  if (!ok) { res.ok = false; res.error = m.error; rt::nativeEnd(m); }
  else {
    rt::nativeEnd(m);
    for (std::size_t g = m.globals.size(); g-- > 0;) if (m.globalRef[g]) { zn::Slot v = m.globals[g]; m.globals[g] = 0; m.releaseSlot(v); }
    res.leaked = m.live - m.immortals;
  }
  res.trace = std::move(m.trace);
  return res;
}

}  // namespace zn::dev::hot
