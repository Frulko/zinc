// zinc dev's Fast Refresh on the interpreter (ZN-742): see hot.h and docs/reports/zinc-next-fast-refresh.md §10.
#include "dev/hot.h"

#include <cstring>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <set>
#include <unordered_map>

#include "platform/socket.h"

#include "frontend/lexer.h"
#include "frontend/modules.h"
#include "ir/ir.h"
#include "zn/host.h"

namespace zn::dev::hot {

using frontend::N;
using rt::Machine;
using rt::Obj;

namespace {

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
    m.library = frontend::libraryModule(mi.path);
    for (const frontend::ModuleImport& im : mi.imports) m.imports.push_back(a.modules[im.from].path);
    // A boundary exports only code and types: functions (components among them), classes, interfaces, type aliases. Importers reach them
    // by symbol and live objects take the new classes by key, so they need not run again; only an exported value (let, var, a const that
    // is not a function) can have been copied into an importer's state at its init, which then has to run again (React Native re-runs
    // the importers of any module that exports more than components: Zinc's binding by symbol makes that unnecessary, owner 2026-10-16).
    bool codeOnly = !mi.exports.empty();
    for (const frontend::ModuleExport& ex : mi.exports) {
      if (ex.from != frontend::kNone) m.imports.push_back(a.modules[ex.from].path);
      const frontend::Node* d = ex.node == frontend::kNone ? nullptr : &a.nodes[ex.node];
      const bool code = d && (d->kind == N::Function || d->kind == N::Class || d->kind == N::Interface || d->kind == N::TypeAlias ||
                              (d->kind == N::Declarator && d->kids.size() > 1 && d->kids[1] != frontend::kNone && a.nodes[d->kids[1]].kind == N::FuncExpr));
      if (ex.from != frontend::kNone || ex.all || ex.name.empty() || !code) codeOnly = false;
    }
    // import.meta.hot keeps its spelling in the text (the loader rewrites nodes, not text)
    m.boundary = codeOnly || f.text.find("import.meta.hot.accept(") != std::string::npos;
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

namespace {

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
    const long n = zn::plat::sockWrite(gFd, s.data() + at, s.size() - at);
    if (n <= 0) return;   // zinc dev is gone: it restarts or ends the program itself
    at += static_cast<std::size_t>(n);
  }
}

[[maybe_unused]] void frameEnd() {   // unused without the graphics host (ZN_HOST_GFX off: the headless Windows build)
  if (!gReady) { gReady = true; send("hot ready\n"); }
  if (!gReply.empty()) { send(gReply); gReply.clear(); }
  if (gNext) return;
  char buf[256];
  for (long n; (n = zn::plat::sockReadNow(gFd, buf, sizeof buf)) > 0;) gIn.append(buf, static_cast<std::size_t>(n));
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
    const std::uint32_t loop = keyIndex(cur->functions, "<prelude>::__runLoop");
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
