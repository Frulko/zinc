// zinc debug --cdp [port] (ZN-371.04): Chrome DevTools' Sources panel on the debugger of dbg.cpp. The engine serves a target of its own (type
// node: chrome://inspect lists it, its DevTools has Sources and Console) on 127.0.0.1: HTTP discovery (/json/list, /json/version), then a
// WebSocket (RFC 6455) with the Debugger and Runtime domains. A thread serves the socket and answers what may come while the program runs
// (enable, getScriptSource, setBreakpointByUrl, removeBreakpoint, pause, runIfWaitingForDebugger); the main thread runs the program and, while
// it is paused, sends Debugger.paused and answers Runtime.getProperties, Debugger.evaluateOnCallFrame and resume / stepOver / stepInto /
// stepOut. The program starts when a client sends Runtime.runIfWaitingForDebugger, paused at its first statement (as node --inspect-brk).
// Workers (zinc:worker): each is a target of its own on the same socket, as Chrome attaches a page's workers. After Target.setAutoAttach a
// worker that starts is announced by Target.attachedToTarget with a session id (flatten mode: the messages of that session carry its
// sessionId), and it waits for that session's Runtime.runIfWaitingForDebugger when waitForDebuggerOnStart was asked; its own debugger (its
// machine, its module, on its thread) then runs to its breakpoints. Target.detachedFromTarget when it ends.
#include <algorithm>
#include <csignal>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <deque>
#include <map>
#include <memory>
#include <thread>

#include "dbg/dbg.h"
#include "dbg/ws.h"
#include "yyjson.h"

namespace zn::dbg {
namespace {

// A debug target: the main program (id "") or a worker ("worker-<id>"). Its fields are guarded by gQm.
struct Session {
  std::string id;
  Debugger* dbg = nullptr;
  std::unique_ptr<Debugger> owned;   // a worker's debugger
  rt::Machine* machine = nullptr;
  const zbc::Module* mod = nullptr;
  const std::vector<std::string>* sources = nullptr;
  std::string title, url;
  std::deque<std::string> queue;     // requests for its thread while it is paused
  std::map<std::string, int> bpIds;  // CDP breakpoint id -> the debugger's
  bool started = false;              // Runtime.runIfWaitingForDebugger came
  bool enabled = false;              // Debugger.enable came (its scripts are sent once its program is compiled)
  int excMode = 0;                   // Debugger.setPauseOnExceptions, kept for the debugger made later
};

std::mutex gQm;
std::condition_variable gQc;
std::map<std::string, std::unique_ptr<Session>> gSessions;   // "" is the main program's
bool gAutoAttach = false, gWaitOnStart = false;               // Target.setAutoAttach
int gPort = 0;

Session& mainSession() { auto& s = gSessions[""]; if (!s) s = std::make_unique<Session>(); return *s; }

std::string q(const std::string& s) { return ws::quote(s); }
std::string tag(const Session& s) { return s.id.empty() ? std::string() : ",\"sessionId\":" + q(s.id); }
void reply(const Session& s, long long id, const std::string& result = "{}") { ws::send("{\"id\":" + std::to_string(id) + ",\"result\":" + result + tag(s) + "}"); }
void fail(const Session& s, long long id, const std::string& message) { ws::send("{\"id\":" + std::to_string(id) + ",\"error\":{\"code\":-32000,\"message\":" + q(message) + "}" + tag(s) + "}"); }
void event(const Session& s, const std::string& method, const std::string& params = "{}") { ws::send("{\"method\":" + q(method) + ",\"params\":" + params + tag(s) + "}"); }

struct Msg {
  yyjson_doc* doc = nullptr;
  long long id = 0;
  std::string method, session;
  yyjson_val* params = nullptr;
  explicit Msg(const std::string& body) {
    doc = yyjson_read(body.c_str(), body.size(), 0);
    yyjson_val* root = doc ? yyjson_doc_get_root(doc) : nullptr;
    if (!root) return;
    id = yyjson_get_sint(yyjson_obj_get(root, "id"));
    yyjson_val* m = yyjson_obj_get(root, "method");
    method = m && yyjson_is_str(m) ? yyjson_get_str(m) : "";
    yyjson_val* s = yyjson_obj_get(root, "sessionId");
    session = s && yyjson_is_str(s) ? yyjson_get_str(s) : "";
    params = yyjson_obj_get(root, "params");
  }
  ~Msg() { if (doc) yyjson_doc_free(doc); }
  Msg(const Msg&) = delete;
  Msg& operator=(const Msg&) = delete;
  std::string str(const char* k) const { yyjson_val* v = params ? yyjson_obj_get(params, k) : nullptr; return v && yyjson_is_str(v) ? yyjson_get_str(v) : ""; }
  long long num(const char* k) const { yyjson_val* v = params ? yyjson_obj_get(params, k) : nullptr; return v && yyjson_is_num(v) ? static_cast<long long>(yyjson_get_num(v)) : 0; }
  bool flag(const char* k) const { yyjson_val* v = params ? yyjson_obj_get(params, k) : nullptr; return v && yyjson_is_true(v); }
};

// A target's files that have code to stop in (the engine's own have no lines), as scripts: id = the file's index.
std::vector<std::uint32_t> scriptFiles(const Session& s) {
  std::vector<std::uint32_t> files;
  for (const zbc::LineInfo& li : s.mod->lines) if (std::find(files.begin(), files.end(), li.file) == files.end()) files.push_back(li.file);
  std::sort(files.begin(), files.end());
  return files;
}
std::string urlOf(const Session& s, std::uint32_t file) { return "file://" + (file < s.mod->files.size() ? s.mod->files[file] : std::string()); }

void scriptsParsed(const Session& s) {
  static const std::string none;
  for (std::uint32_t f : scriptFiles(s)) {
    const std::string& src = f < s.sources->size() ? (*s.sources)[f] : none;
    std::uint32_t lines = 0;
    for (char c : src) lines += c == '\n';
    event(s, "Debugger.scriptParsed", "{\"scriptId\":\"" + std::to_string(f) + "\",\"url\":" + q(urlOf(s, f)) + ",\"startLine\":0,\"startColumn\":0,\"endLine\":" + std::to_string(lines) +
          ",\"endColumn\":0,\"executionContextId\":1,\"hash\":\"" + std::to_string(f) + "\",\"isLiveEdit\":false,\"sourceMapURL\":\"\",\"hasSourceURL\":false,\"isModule\":true,\"length\":" + std::to_string(src.size()) + "}");
  }
}

void setBreakpointByUrl(Session& s, const Msg& m) {
  std::string url = m.str("url");
  const long long line = m.num("lineNumber") + 1;   // CDP lines start at 0
  if (url.rfind("file://", 0) == 0) url = url.substr(7);
  std::string where;
  const int id = s.dbg && !url.empty() ? s.dbg->addBreakpoint(url, static_cast<std::uint32_t>(line), where, m.str("condition")) : 0;   // a condition: ZN-371.05
  if (!id) { fail(s, m.id, "no code at " + url + ":" + std::to_string(line)); return; }
  const std::string bid = "zinc:" + (s.id.empty() ? std::string() : s.id + ":") + std::to_string(id);
  s.bpIds[bid] = id;
  const long long at = std::atoll(where.substr(where.rfind(':') + 1).c_str()) - 1;
  std::uint32_t script = 0;
  for (std::uint32_t f : scriptFiles(s)) {
    const std::string& p = s.mod->files[f];
    if (p == url || (p.size() > url.size() && p.compare(p.size() - url.size(), url.size(), url) == 0)) script = f;
  }
  reply(s, m.id, "{\"breakpointId\":" + q(bid) + ",\"locations\":[{\"scriptId\":\"" + std::to_string(script) + "\",\"lineNumber\":" + std::to_string(at) + ",\"columnNumber\":0}]}");
}

void attached(const Session& s, bool waiting) {   // a worker's target, to the main session
  const std::string tid = q(s.id);
  event(mainSession(), "Target.attachedToTarget", "{\"sessionId\":" + tid + ",\"targetInfo\":{\"targetId\":" + tid + ",\"type\":\"worker\",\"title\":" + q(s.title) + ",\"url\":" + q(s.url) +
                                               ",\"attached\":true,\"canAccessOpener\":false},\"waitingForDebugger\":" + (waiting ? "true" : "false") + "}");
}

// What the socket thread answers itself; the rest waits for the paused target.
void handle(const std::string& body) {
  Msg m(body);
  std::unique_lock<std::mutex> lock(gQm);
  auto it = gSessions.find(m.session);
  if (it == gSessions.end() && !m.session.empty()) { Session none; none.id = m.session; fail(none, m.id, "no such session (the worker ended)"); return; }
  Session& s = m.session.empty() ? mainSession() : *it->second;
  if (m.method == "Runtime.enable") {
    reply(s, m.id);
    event(s, "Runtime.executionContextCreated", "{\"context\":{\"id\":1,\"origin\":\"\",\"name\":" + q(s.id.empty() ? "zinc" : s.title) + ",\"uniqueId\":" + q("zinc-" + (s.id.empty() ? "1" : s.id)) + ",\"auxData\":{\"isDefault\":true}}}");
  } else if (m.method == "Debugger.enable") {
    s.enabled = true;
    if (s.mod) scriptsParsed(s);   // before the answer, as V8 does (else when the compile is done, cdpReady)
    reply(s, m.id, "{\"debuggerId\":" + q("zinc-debugger" + (s.id.empty() ? "" : "-" + s.id)) + "}");
  } else if (m.method == "Debugger.getScriptSource") {
    const std::size_t f = static_cast<std::size_t>(std::atoll(m.str("scriptId").c_str()));
    reply(s, m.id, "{\"scriptSource\":" + q(s.sources && f < s.sources->size() ? (*s.sources)[f] : std::string()) + "}");
  } else if (m.method == "Debugger.setBreakpointByUrl") setBreakpointByUrl(s, m);
  else if (m.method == "Debugger.removeBreakpoint") {
    auto b = s.bpIds.find(m.str("breakpointId"));
    if (b != s.bpIds.end() && s.dbg) { s.dbg->removeBreakpoint(b->second); s.bpIds.erase(b); }
    reply(s, m.id);
  } else if (m.method == "Debugger.setPauseOnExceptions") {   // none, caught, uncaught, all
    const std::string st = m.str("state");
    s.excMode = st == "all" || st == "caught" ? 2 : st == "uncaught" ? 1 : 0;
    if (s.dbg) s.dbg->setExceptionPause(s.excMode);
    reply(s, m.id);
  } else if (m.method == "Debugger.pause") {
    if (s.dbg) s.dbg->requestPause();
    reply(s, m.id);
  } else if (m.method == "Runtime.runIfWaitingForDebugger") {
    reply(s, m.id);
    s.started = true;
    gQc.notify_all();
  } else if (m.method == "Target.setAutoAttach") {   // the workers become targets: those running now, then each that starts
    gAutoAttach = m.flag("autoAttach");
    gWaitOnStart = m.flag("waitForDebuggerOnStart");
    reply(s, m.id);
    if (gAutoAttach) for (auto& [id, w] : gSessions) if (!id.empty()) attached(*w, false);
  } else if (m.method == "Debugger.resume" || m.method == "Debugger.stepOver" || m.method == "Debugger.stepInto" || m.method == "Debugger.stepOut" ||
             m.method == "Runtime.getProperties" || m.method == "Debugger.evaluateOnCallFrame" || m.method == "Runtime.evaluate") {
    s.queue.push_back(body);
    gQc.notify_all();
  } else reply(s, m.id);   // what is not served answers empty, so DevTools never waits
}


// A RemoteObject for a value; objects and arrays get an id that Runtime.getProperties takes while the program stays paused.
std::string remote(const Local& l, std::vector<Local>& refs) {
  const std::string& v = l.value;
  if (l.vt.cls == zbc::Cls::R) {
    if (v == "null") return "{\"type\":\"object\",\"subtype\":\"null\",\"value\":null}";
    if (!v.empty() && v[0] == '"') return "{\"type\":\"string\",\"value\":" + v + ",\"description\":" + v + "}";
    refs.push_back(l);
    const bool array = !v.empty() && v[0] == '[';
    return "{\"type\":\"object\"" + std::string(array ? ",\"subtype\":\"array\"" : "") + ",\"className\":" + q(array ? "Array" : l.type) + ",\"description\":" + q(l.type) +
           ",\"objectId\":\"obj:" + std::to_string(refs.size() - 1) + "\"}";
  }
  if (v == "true" || v == "false") return "{\"type\":\"boolean\",\"value\":" + v + "}";
  const bool finite = !v.empty() && v.find_first_not_of("-0123456789.e+") == std::string::npos && v != "-";
  return finite ? "{\"type\":\"number\",\"value\":" + v + ",\"description\":" + q(v) + "}" : "{\"type\":\"number\",\"unserializableValue\":" + q(v) + ",\"description\":" + q(v) + "}";
}

// A frame's scope chain: its locals, what its arrow function captured, the program's globals.
std::string scopes(const Debugger& d, std::size_t frame) {
  auto scope = [](const char* type, const char* name, const std::string& id) {
    return std::string("{\"type\":\"") + type + "\",\"name\":\"" + name + "\",\"object\":{\"type\":\"object\",\"className\":\"Object\",\"description\":\"" + name + "\",\"objectId\":\"" + id + "\"}}";
  };
  std::string o = scope("local", "Local", "scope:" + std::to_string(frame));
  if (!d.closure(frame).empty()) o += "," + scope("closure", "Closure", "closure:" + std::to_string(frame));
  if (!d.globals().empty()) o += "," + scope("global", "Global", "globals");
  return o;
}

Session* sessionOf(const Debugger& d) {   // under gQm
  for (auto& [id, s] : gSessions) if (s->dbg == &d) return s.get();
  return nullptr;
}

std::string pop(Session& s) {
  std::unique_lock<std::mutex> lock(gQm);
  gQc.wait(lock, [&] { return !s.queue.empty(); });
  std::string b = std::move(s.queue.front());
  s.queue.pop_front();
  return b;
}

}  // namespace

bool cdpStart(int port, const std::string& program) {
#ifndef ZN_DBG_CDP
  (void)port; (void)program;
  std::fprintf(stderr, "zinc debug: this zinc has no CDP server (built without ZN_TLS: no SHA-1 for the WebSocket handshake)\n");
  return false;
#else
  { std::lock_guard<std::mutex> lock(gQm); mainSession(); }
  gPort = ws::start(port, {"zinc-debug", program, "file://" + program}, handle);
  if (!gPort) { std::fprintf(stderr, "zinc debug: port %d unavailable\n", port); return false; }
  return true;
#endif
}

void cdpReady(Debugger& d) {
  {
    std::lock_guard<std::mutex> lock(gQm);
    Session& s = mainSession();
    s.mod = &d.module();
    s.sources = &d.sources();
    s.dbg = &d;
    d.setExceptionPause(s.excMode);
    if (s.enabled) scriptsParsed(s);
  }
  std::fprintf(stderr, "zinc debug: chrome://inspect (Discover network targets: localhost:%d) or devtools://devtools/bundled/js_app.html?ws=127.0.0.1:%d/zinc-debug; waiting for the debugger\n", gPort, gPort);   // once compiled: the scripts are there
  std::unique_lock<std::mutex> lock(gQm);
  gQc.wait(lock, [] { return mainSession().started; });   // the client sets its breakpoints first, then Runtime.runIfWaitingForDebugger
}

void cdpLog(const std::string& message) {
  std::lock_guard<std::mutex> lock(gQm);
  event(mainSession(), "Runtime.consoleAPICalled", "{\"type\":\"log\",\"args\":[{\"type\":\"string\",\"value\":" + q(message) + "}],\"executionContextId\":1,\"timestamp\":0}");
}

void cdpWorkerStart(rt::Machine& m, int id, const std::string& entry, const std::vector<std::string>& sources) {
  if (!m.mod || m.mod->lines.empty()) return;   // not a debug build: nothing to stop in
  auto s = std::make_unique<Session>();
  s->id = "worker-" + std::to_string(id);
  s->owned = std::make_unique<Debugger>(*m.mod, sources);
  s->dbg = s->owned.get();
  s->machine = &m;
  s->mod = &s->dbg->module();
  s->sources = &s->dbg->sources();
  s->title = "zinc worker " + entry + "#" + std::to_string(id);
  s->url = urlOf(*s, m.mod->lines[0].file);
  Debugger& d = *s->dbg;
  const std::string sid = s->id;
  d.paused = cdpPaused;
  d.logged = [sid](const std::string& message) {   // a logpoint of the worker: its session's console
    std::lock_guard<std::mutex> lock(gQm);
    auto it = gSessions.find(sid);
    if (it != gSessions.end()) event(*it->second, "Runtime.consoleAPICalled", "{\"type\":\"log\",\"args\":[{\"type\":\"string\",\"value\":" + q(message) + "}],\"executionContextId\":1,\"timestamp\":0}");
  };
  d.runFirst();   // a worker runs to its breakpoints
  d.attach(m);
  std::unique_lock<std::mutex> lock(gQm);
  Session& ref = *s;
  gSessions[sid] = std::move(s);
  if (!gAutoAttach) return;
  attached(ref, gWaitOnStart);
  if (gWaitOnStart) gQc.wait(lock, [&] { return ref.started; });   // its breakpoints are set first, then its Runtime.runIfWaitingForDebugger
}

void cdpWorkerEnd(rt::Machine& m) {
  std::lock_guard<std::mutex> lock(gQm);
  for (auto it = gSessions.begin(); it != gSessions.end(); ++it) {
    if (it->first.empty() || it->second->machine != &m) continue;
    if (gAutoAttach) event(mainSession(), "Target.detachedFromTarget", "{\"sessionId\":" + q(it->first) + ",\"targetId\":" + q(it->first) + "}");
    m.debugHook = nullptr; m.throwHook = nullptr; m.debugCtx = nullptr;
    gSessions.erase(it);
    return;
  }
}

Resume cdpPaused(Debugger& d) {
  Session* sp;
  { std::lock_guard<std::mutex> lock(gQm); sp = sessionOf(d); }
  if (!sp) return Resume::Continue;
  Session& s = *sp;   // a session lives until its target's machine ends: not while it is paused here
  std::vector<Local> refs;   // objectId obj:k is refs[k] while the program stays paused
  const std::vector<StackFrame> st = d.stack();
  std::string frames;
  for (std::size_t i = 0; i < st.size(); ++i) {
    const zbc::LineInfo* li = d.lineInfo(st[i].line);
    const std::uint32_t file = li ? li->file : 0;
    frames += std::string(i ? "," : "") + "{\"callFrameId\":\"" + std::to_string(i) + "\",\"functionName\":" + q(d.fnName(st[i].fn)) + ",\"location\":{\"scriptId\":\"" + std::to_string(file) +
              "\",\"lineNumber\":" + std::to_string(li ? li->line - 1 : 0) + ",\"columnNumber\":" + std::to_string(li && li->col ? li->col - 1 : 0) + "},\"url\":" + q(urlOf(s, file)) +
              ",\"scopeChain\":[" + scopes(d, i) + "],\"this\":{\"type\":\"undefined\"}}";
  }
  const bool exc = std::string(d.reason()) == "exception";
  const std::string bpPrefix = "zinc:" + (s.id.empty() ? std::string() : s.id + ":");
  event(s, "Debugger.paused", "{\"callFrames\":[" + frames + "],\"reason\":\"" + (exc ? "exception" : "other") + "\"" +
                                  (exc ? ",\"data\":{\"type\":\"object\",\"className\":\"Error\",\"description\":" + q(d.exception()) + "}" : std::string()) +
                                  (d.hitBreakpoint() ? ",\"hitBreakpoints\":[\"" + bpPrefix + std::to_string(d.hitBreakpoint()) + "\"]" : std::string()) + "}");
  auto props = [&](const std::vector<Local>& ls) {
    std::string o;
    for (const Local& l : ls) o += std::string(o.empty() ? "" : ",") + "{\"name\":" + q(l.name) + ",\"value\":" + remote(l, refs) + ",\"configurable\":true,\"enumerable\":true,\"writable\":true,\"isOwn\":true}";
    return "{\"result\":[" + o + "]}";
  };
  for (;;) {
    Msg m(pop(s));
    Resume r = Resume::Stop;
    if (m.method == "Debugger.resume") r = Resume::Continue;
    else if (m.method == "Debugger.stepOver") r = Resume::StepOver;
    else if (m.method == "Debugger.stepInto") r = Resume::StepInto;
    else if (m.method == "Debugger.stepOut") r = Resume::StepOut;
    if (r != Resume::Stop) {
      reply(s, m.id);
      event(s, "Debugger.resumed");
      return r;
    }
    if (m.method == "Runtime.getProperties") {
      const std::string id = m.str("objectId");
      if (id.rfind("scope:", 0) == 0) reply(s, m.id, props(d.locals(static_cast<std::size_t>(std::atoll(id.c_str() + 6)))));
      else if (id.rfind("closure:", 0) == 0) reply(s, m.id, props(d.closure(static_cast<std::size_t>(std::atoll(id.c_str() + 8)))));
      else if (id == "globals") reply(s, m.id, props(d.globals()));
      else if (id.rfind("obj:", 0) == 0 && static_cast<std::size_t>(std::atoll(id.c_str() + 4)) < refs.size()) reply(s, m.id, props(d.children(refs[static_cast<std::size_t>(std::atoll(id.c_str() + 4))])));
      else reply(s, m.id, "{\"result\":[]}");
    } else if (m.method == "Debugger.evaluateOnCallFrame" || m.method == "Runtime.evaluate") {   // watches, hovers and the console: an expression in the frame (the top one for the console)
      Local l;
      std::string err;
      const std::size_t frame = m.method == "Runtime.evaluate" ? 0 : static_cast<std::size_t>(std::atoll(m.str("callFrameId").c_str()));
      if (d.evaluate(m.str("expression"), frame, l, err)) reply(s, m.id, "{\"result\":" + remote(l, refs) + "}");
      else reply(s, m.id, "{\"result\":{\"type\":\"object\",\"subtype\":\"error\",\"className\":\"Error\",\"description\":" + q(err) + "},\"exceptionDetails\":{\"exceptionId\":1,\"text\":" + q(err) + ",\"lineNumber\":0,\"columnNumber\":0}}");
    } else reply(s, m.id);
  }
}

}  // namespace zn::dbg
