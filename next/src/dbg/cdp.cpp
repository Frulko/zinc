// zinc debug --cdp [port] (ZN-371.04): Chrome DevTools' Sources panel on the debugger of dbg.cpp. The engine serves a target of its own (type
// node: chrome://inspect lists it, its DevTools has Sources and Console) on 127.0.0.1: HTTP discovery (/json/list, /json/version), then a
// WebSocket (RFC 6455) with the Debugger and Runtime domains. A thread serves the socket and answers what may come while the program runs
// (enable, getScriptSource, setBreakpointByUrl, removeBreakpoint, pause, runIfWaitingForDebugger); the main thread runs the program and, while
// it is paused, sends Debugger.paused and answers Runtime.getProperties, Debugger.evaluateOnCallFrame and resume / stepOver / stepInto /
// stepOut. The program starts when a client sends Runtime.runIfWaitingForDebugger, paused at its first statement (as node --inspect-brk).
#include <algorithm>
#include <arpa/inet.h>
#include <csignal>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <deque>
#include <map>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

#include "dbg/dbg.h"
#include "yyjson.h"
#ifdef ZN_DBG_CDP
#include "mbedtls/base64.h"
#include "psa/crypto.h"
#endif

namespace zn::dbg {
namespace {

std::mutex gWrite, gQm;
std::condition_variable gQc;
std::deque<std::string> gQueue;   // requests for the main thread while the program is paused
int gClient = -1;                 // the WebSocket client (one at a time)
int gPort = 0;
bool gStarted = false;            // Runtime.runIfWaitingForDebugger came
bool gEnabled = false;            // Debugger.enable came (its scripts are sent once the program is compiled)
int gExcMode = 0;                 // Debugger.setPauseOnExceptions, kept for the debugger made later
Debugger* gDbg = nullptr;
const zbc::Module* gMod = nullptr;
const std::vector<std::string>* gSourcesP = nullptr;
std::string gProgram;

std::string q(const std::string& s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += static_cast<char>(c); }
    else if (c == '\n') o += "\\n";
    else if (c == '\r') o += "\\r";
    else if (c == '\t') o += "\\t";
    else if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += static_cast<char>(c);
  }
  return o + "\"";
}

bool writeAll(int fd, const char* p, std::size_t n) {
  while (n) {
    const ssize_t w = ::write(fd, p, n);
    if (w <= 0) return false;
    p += w; n -= static_cast<std::size_t>(w);
  }
  return true;
}
// One unmasked text frame to the client.
void send(const std::string& json) {
  std::lock_guard<std::mutex> lock(gWrite);
  if (gClient < 0) return;
  std::string f;
  f += static_cast<char>(0x81);
  if (json.size() < 126) f += static_cast<char>(json.size());
  else if (json.size() < 65536) { f += static_cast<char>(126); f += static_cast<char>(json.size() >> 8); f += static_cast<char>(json.size() & 255); }
  else { f += static_cast<char>(127); for (int k = 7; k >= 0; --k) f += static_cast<char>((static_cast<std::uint64_t>(json.size()) >> (8 * k)) & 255); }
  f += json;
  writeAll(gClient, f.data(), f.size());
}
void reply(long long id, const std::string& result = "{}") { send("{\"id\":" + std::to_string(id) + ",\"result\":" + result + "}"); }
void fail(long long id, const std::string& message) { send("{\"id\":" + std::to_string(id) + ",\"error\":{\"code\":-32000,\"message\":" + q(message) + "}}"); }
void event(const std::string& method, const std::string& params = "{}") { send("{\"method\":" + q(method) + ",\"params\":" + params + "}"); }

struct Msg {
  yyjson_doc* doc = nullptr;
  long long id = 0;
  std::string method;
  yyjson_val* params = nullptr;
  explicit Msg(const std::string& body) {
    doc = yyjson_read(body.c_str(), body.size(), 0);
    yyjson_val* root = doc ? yyjson_doc_get_root(doc) : nullptr;
    if (!root) return;
    id = yyjson_get_sint(yyjson_obj_get(root, "id"));
    yyjson_val* m = yyjson_obj_get(root, "method");
    method = m && yyjson_is_str(m) ? yyjson_get_str(m) : "";
    params = yyjson_obj_get(root, "params");
  }
  ~Msg() { if (doc) yyjson_doc_free(doc); }
  Msg(const Msg&) = delete;
  Msg& operator=(const Msg&) = delete;
  std::string str(const char* k) const { yyjson_val* v = params ? yyjson_obj_get(params, k) : nullptr; return v && yyjson_is_str(v) ? yyjson_get_str(v) : ""; }
  long long num(const char* k) const { yyjson_val* v = params ? yyjson_obj_get(params, k) : nullptr; return v && yyjson_is_num(v) ? static_cast<long long>(yyjson_get_num(v)) : 0; }
};

// The program's files that have code to stop in (the engine's own have no lines), as scripts: id = the file's index.
std::vector<std::uint32_t> scriptFiles() {
  std::vector<std::uint32_t> files;
  for (const zbc::LineInfo& li : gMod->lines) if (std::find(files.begin(), files.end(), li.file) == files.end()) files.push_back(li.file);
  std::sort(files.begin(), files.end());
  return files;
}
std::string urlOf(std::uint32_t file) { return "file://" + (file < gMod->files.size() ? gMod->files[file] : std::string()); }

void scriptsParsed() {
  static const std::string none;
  for (std::uint32_t f : scriptFiles()) {
    const std::string& src = f < gSourcesP->size() ? (*gSourcesP)[f] : none;
    std::uint32_t lines = 0;
    for (char c : src) lines += c == '\n';
    event("Debugger.scriptParsed", "{\"scriptId\":\"" + std::to_string(f) + "\",\"url\":" + q(urlOf(f)) + ",\"startLine\":0,\"startColumn\":0,\"endLine\":" + std::to_string(lines) +
          ",\"endColumn\":0,\"executionContextId\":1,\"hash\":\"" + std::to_string(f) + "\",\"isLiveEdit\":false,\"sourceMapURL\":\"\",\"hasSourceURL\":false,\"isModule\":true,\"length\":" + std::to_string(src.size()) + "}");
  }
}

std::map<std::string, int> gBpIds;   // CDP breakpoint id -> the debugger's

void setBreakpointByUrl(const Msg& m) {
  std::string url = m.str("url");
  const long long line = m.num("lineNumber") + 1;   // CDP lines start at 0
  if (url.rfind("file://", 0) == 0) url = url.substr(7);
  std::string where;
  const int id = gDbg && !url.empty() ? gDbg->addBreakpoint(url, static_cast<std::uint32_t>(line), where, m.str("condition")) : 0;   // a condition: ZN-371.05
  if (!id) { fail(m.id, "no code at " + url + ":" + std::to_string(line)); return; }
  const std::string bid = "zinc:" + std::to_string(id);
  gBpIds[bid] = id;
  const long long at = std::atoll(where.substr(where.rfind(':') + 1).c_str()) - 1;
  std::uint32_t script = 0;
  for (std::uint32_t f : scriptFiles()) if (gMod->files[f] == url || (gMod->files[f].size() > url.size() && gMod->files[f].compare(gMod->files[f].size() - url.size(), url.size(), url) == 0)) script = f;
  reply(m.id, "{\"breakpointId\":" + q(bid) + ",\"locations\":[{\"scriptId\":\"" + std::to_string(script) + "\",\"lineNumber\":" + std::to_string(at) + ",\"columnNumber\":0}]}");
}

// What the socket thread answers itself; the rest waits for the paused program.
void handle(const std::string& body) {
  Msg m(body);
  if (m.method == "Runtime.enable") {
    reply(m.id);
    event("Runtime.executionContextCreated", "{\"context\":{\"id\":1,\"origin\":\"\",\"name\":\"zinc\",\"uniqueId\":\"zinc-1\",\"auxData\":{\"isDefault\":true}}}");
  } else if (m.method == "Debugger.enable") {
    {
      std::lock_guard<std::mutex> lock(gQm);
      gEnabled = true;
      if (gMod) scriptsParsed();   // before the answer, as V8 does (else when the compile is done, cdpReady)
    }
    reply(m.id, "{\"debuggerId\":\"zinc-debugger\"}");
  } else if (m.method == "Debugger.getScriptSource") {
    const std::size_t f = static_cast<std::size_t>(std::atoll(m.str("scriptId").c_str()));
    reply(m.id, "{\"scriptSource\":" + q(gSourcesP && f < gSourcesP->size() ? (*gSourcesP)[f] : std::string()) + "}");
  } else if (m.method == "Debugger.setBreakpointByUrl") setBreakpointByUrl(m);
  else if (m.method == "Debugger.removeBreakpoint") {
    auto it = gBpIds.find(m.str("breakpointId"));
    if (it != gBpIds.end() && gDbg) { gDbg->removeBreakpoint(it->second); gBpIds.erase(it); }
    reply(m.id);
  } else if (m.method == "Debugger.setPauseOnExceptions") {   // none, caught, uncaught, all
    const std::string st = m.str("state");
    std::lock_guard<std::mutex> lock(gQm);
    gExcMode = st == "all" || st == "caught" ? 2 : st == "uncaught" ? 1 : 0;
    if (gDbg) gDbg->setExceptionPause(gExcMode);
    reply(m.id);
  } else if (m.method == "Debugger.pause") {
    if (gDbg) gDbg->requestPause();
    reply(m.id);
  } else if (m.method == "Runtime.runIfWaitingForDebugger") {
    reply(m.id);
    std::lock_guard<std::mutex> lock(gQm);
    gStarted = true;
    gQc.notify_all();
  } else if (m.method == "Debugger.resume" || m.method == "Debugger.stepOver" || m.method == "Debugger.stepInto" || m.method == "Debugger.stepOut" ||
             m.method == "Runtime.getProperties" || m.method == "Debugger.evaluateOnCallFrame" || m.method == "Runtime.evaluate") {
    std::lock_guard<std::mutex> lock(gQm);
    gQueue.push_back(body);
    gQc.notify_all();
  } else reply(m.id);   // what is not served answers empty, so DevTools never waits
}

#ifdef ZN_DBG_CDP
std::string acceptKey(const std::string& key) {   // Sec-WebSocket-Accept: base64(SHA-1(key + the RFC's GUID))
  static bool ok = psa_crypto_init() == PSA_SUCCESS;
  const std::string in = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  unsigned char h[20];
  std::size_t hl = 0;
  if (!ok || psa_hash_compute(PSA_ALG_SHA_1, reinterpret_cast<const unsigned char*>(in.data()), in.size(), h, sizeof h, &hl) != PSA_SUCCESS) return "";
  unsigned char b[64];
  std::size_t bl = 0;
  if (mbedtls_base64_encode(b, sizeof b, &bl, h, hl) != 0) return "";
  return std::string(reinterpret_cast<char*>(b), bl);
}
#else
std::string acceptKey(const std::string&) { return ""; }
#endif

std::string header(const std::string& req, const char* name) {   // the value of a header (case-insensitive name)
  std::string lower = req;
  for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  std::string n = "\r\n" + std::string(name) + ":";
  for (char& c : n) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  const std::size_t at = lower.find(n);
  if (at == std::string::npos) return "";
  std::size_t b = at + n.size(), e = req.find("\r\n", b);
  while (b < e && req[b] == ' ') ++b;
  return req.substr(b, e - b);
}

void serveHttp(int fd, const std::string& req) {
  const std::string host = header(req, "Host");
  auto local = [&](const std::string& h) { for (const char* l : {"127.0.0.1", "localhost", "[::1]"}) if (h == l || h.rfind(std::string(l) + ":", 0) == 0) return true; return false; };
  std::string status = "200 OK", body;
  if (!local(host)) { status = "403 Forbidden"; body = "{}"; }   // DNS rebinding: only a client that names this machine
  else if (req.rfind("GET /json/version", 0) == 0) body = "{\"Browser\":\"Zinc/0.1\",\"Protocol-Version\":\"1.3\"}";
  else if (req.rfind("GET /json", 0) == 0) {
    const std::string ws = "127.0.0.1:" + std::to_string(gPort) + "/zinc-debug";
    body = "[{\"description\":\"zinc debug\",\"devtoolsFrontendUrl\":\"devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=" + ws + "\",\"id\":\"zinc-debug\",\"title\":" + q(gProgram) +
           ",\"type\":\"node\",\"url\":" + q("file://" + gProgram) + ",\"webSocketDebuggerUrl\":\"ws://" + ws + "\"}]";
  } else { status = "404 Not Found"; body = "{}"; }
  const std::string resp = "HTTP/1.1 " + status + "\r\nContent-Type: application/json; charset=UTF-8\r\nContent-Length: " + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
  writeAll(fd, resp.data(), resp.size());
}

// Reads the WebSocket's frames of a client until it goes; each text message to handle().
void serveSocket(int fd) {
  std::string buf, msg;
  char tmp[65536];
  for (;;) {
    const ssize_t n = ::read(fd, tmp, sizeof tmp);
    if (n <= 0) break;
    buf.append(tmp, static_cast<std::size_t>(n));
    for (;;) {
      if (buf.size() < 2) break;
      const unsigned char b0 = static_cast<unsigned char>(buf[0]), b1 = static_cast<unsigned char>(buf[1]);
      std::uint64_t len = b1 & 127;
      std::size_t at = 2;
      if (len == 126) { if (buf.size() < 4) break; len = (static_cast<unsigned char>(buf[2]) << 8) | static_cast<unsigned char>(buf[3]); at = 4; }
      else if (len == 127) { if (buf.size() < 10) break; len = 0; for (int k = 0; k < 8; ++k) len = len << 8 | static_cast<unsigned char>(buf[2 + k]); at = 10; }
      const bool masked = b1 & 128;
      if (buf.size() < at + (masked ? 4 : 0) + len) break;
      const char* mask = buf.data() + at;
      if (masked) at += 4;
      std::string payload = buf.substr(at, len);
      if (masked) for (std::size_t k = 0; k < payload.size(); ++k) payload[k] = static_cast<char>(payload[k] ^ mask[k % 4]);
      buf.erase(0, at + len);
      const int op = b0 & 15;
      if (op == 8) return;   // close
      if (op == 9) { std::lock_guard<std::mutex> lock(gWrite); std::string pong = "\x8a"; pong += static_cast<char>(payload.size()); pong += payload; writeAll(fd, pong.data(), pong.size()); continue; }
      if (op == 1 || op == 0) {
        msg += payload;
        if (b0 & 128) { handle(msg); msg.clear(); }
      }
    }
  }
}

void serve(int listener) {
  for (;;) {
    const int fd = ::accept(listener, nullptr, nullptr);
    if (fd < 0) continue;
    std::string req;
    char tmp[4096];
    while (req.find("\r\n\r\n") == std::string::npos) {
      const ssize_t n = ::read(fd, tmp, sizeof tmp);
      if (n <= 0) break;
      req.append(tmp, static_cast<std::size_t>(n));
    }
    const std::string key = header(req, "Sec-WebSocket-Key");
    if (key.empty() || req.rfind("GET /zinc-debug", 0) != 0) { serveHttp(fd, req); ::close(fd); continue; }
    const std::string acc = acceptKey(key);
    const std::string resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acc + "\r\n\r\n";
    writeAll(fd, resp.data(), resp.size());
    { std::lock_guard<std::mutex> lock(gWrite); if (gClient >= 0) ::close(gClient); gClient = fd; }
    std::thread(serveSocket, fd).detach();   // one reader per connection; the last connection is the client
  }
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

std::string pop() {
  std::unique_lock<std::mutex> lock(gQm);
  gQc.wait(lock, [] { return !gQueue.empty(); });
  std::string b = std::move(gQueue.front());
  gQueue.pop_front();
  return b;
}

}  // namespace

bool cdpStart(int port, const std::string& program) {
#ifndef ZN_DBG_CDP
  (void)port; (void)program;
  std::fprintf(stderr, "zinc debug: this zinc has no CDP server (built without ZN_TLS: no SHA-1 for the WebSocket handshake)\n");
  return false;
#else
  gProgram = program;
  std::signal(SIGPIPE, SIG_IGN);   // a client that goes away mid-write: an error, not the end of the process
  const int listener = ::socket(AF_INET, SOCK_STREAM, 0);
  int one = 1;
  ::setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_port = htons(static_cast<std::uint16_t>(port));
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (listener < 0 || ::bind(listener, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0 || ::listen(listener, 4) != 0) {
    std::fprintf(stderr, "zinc debug: port %d unavailable\n", port);
    return false;
  }
  socklen_t al = sizeof a;
  ::getsockname(listener, reinterpret_cast<sockaddr*>(&a), &al);
  gPort = ntohs(a.sin_port);
  std::thread(serve, listener).detach();
  return true;
#endif
}

void cdpReady(Debugger& d) {
  {
    std::lock_guard<std::mutex> lock(gQm);
    gMod = &d.module();
    gSourcesP = &d.sources();
    gDbg = &d;
    d.setExceptionPause(gExcMode);
    if (gEnabled) scriptsParsed();
  }
  std::fprintf(stderr, "zinc debug: chrome://inspect (Discover network targets: localhost:%d) or devtools://devtools/bundled/js_app.html?ws=127.0.0.1:%d/zinc-debug; waiting for the debugger\n", gPort, gPort);   // once compiled: the scripts are there
  std::unique_lock<std::mutex> lock(gQm);
  gQc.wait(lock, [] { return gStarted; });   // the client sets its breakpoints first, then Runtime.runIfWaitingForDebugger
}

void cdpLog(const std::string& message) {
  event("Runtime.consoleAPICalled", "{\"type\":\"log\",\"args\":[{\"type\":\"string\",\"value\":" + q(message) + "}],\"executionContextId\":1,\"timestamp\":0}");
}

Resume cdpPaused(Debugger& d) {
  std::vector<Local> refs;   // objectId obj:k is refs[k] while the program stays paused
  const std::vector<StackFrame> st = d.stack();
  std::string frames;
  for (std::size_t i = 0; i < st.size(); ++i) {
    const zbc::LineInfo* li = d.lineInfo(st[i].line);
    const std::uint32_t file = li ? li->file : 0;
    frames += std::string(i ? "," : "") + "{\"callFrameId\":\"" + std::to_string(i) + "\",\"functionName\":" + q(d.fnName(st[i].fn)) + ",\"location\":{\"scriptId\":\"" + std::to_string(file) +
              "\",\"lineNumber\":" + std::to_string(li ? li->line - 1 : 0) + ",\"columnNumber\":" + std::to_string(li && li->col ? li->col - 1 : 0) + "},\"url\":" + q(urlOf(file)) +
              ",\"scopeChain\":[" + scopes(d, i) + "],\"this\":{\"type\":\"undefined\"}}";
  }
  const bool exc = std::string(d.reason()) == "exception";
  event("Debugger.paused", "{\"callFrames\":[" + frames + "],\"reason\":\"" + (exc ? "exception" : "other") + "\"" +
                               (exc ? ",\"data\":{\"type\":\"object\",\"className\":\"Error\",\"description\":" + q(d.exception()) + "}" : std::string()) +
                               (d.hitBreakpoint() ? ",\"hitBreakpoints\":[\"zinc:" + std::to_string(d.hitBreakpoint()) + "\"]" : std::string()) + "}");
  auto props = [&](const std::vector<Local>& ls) {
    std::string o;
    for (const Local& l : ls) o += std::string(o.empty() ? "" : ",") + "{\"name\":" + q(l.name) + ",\"value\":" + remote(l, refs) + ",\"configurable\":true,\"enumerable\":true,\"writable\":true,\"isOwn\":true}";
    return "{\"result\":[" + o + "]}";
  };
  for (;;) {
    Msg m(pop());
    Resume r = Resume::Stop;
    if (m.method == "Debugger.resume") r = Resume::Continue;
    else if (m.method == "Debugger.stepOver") r = Resume::StepOver;
    else if (m.method == "Debugger.stepInto") r = Resume::StepInto;
    else if (m.method == "Debugger.stepOut") r = Resume::StepOut;
    if (r != Resume::Stop) {
      reply(m.id);
      event("Debugger.resumed");
      return r;
    }
    if (m.method == "Runtime.getProperties") {
      const std::string id = m.str("objectId");
      if (id.rfind("scope:", 0) == 0) reply(m.id, props(d.locals(static_cast<std::size_t>(std::atoll(id.c_str() + 6)))));
      else if (id.rfind("closure:", 0) == 0) reply(m.id, props(d.closure(static_cast<std::size_t>(std::atoll(id.c_str() + 8)))));
      else if (id == "globals") reply(m.id, props(d.globals()));
      else if (id.rfind("obj:", 0) == 0 && static_cast<std::size_t>(std::atoll(id.c_str() + 4)) < refs.size()) reply(m.id, props(d.children(refs[static_cast<std::size_t>(std::atoll(id.c_str() + 4))])));
      else reply(m.id, "{\"result\":[]}");
    } else if (m.method == "Debugger.evaluateOnCallFrame") {   // watches, hovers and the console: an expression in the frame
      Local l;
      std::string err;
      if (d.evaluate(m.str("expression"), static_cast<std::size_t>(std::atoll(m.str("callFrameId").c_str())), l, err)) reply(m.id, "{\"result\":" + remote(l, refs) + "}");
      else reply(m.id, "{\"result\":{\"type\":\"object\",\"subtype\":\"error\",\"className\":\"Error\",\"description\":" + q(err) + "},\"exceptionDetails\":{\"exceptionId\":1,\"text\":" + q(err) + ",\"lineNumber\":0,\"columnNumber\":0}}");
    } else reply(m.id);
  }
}

}  // namespace zn::dbg
