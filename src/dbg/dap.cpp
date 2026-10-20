// zinc debug --dap (ZN-371.02): the Debug Adapter Protocol for VS Code over standard input and output, on the debugger of dbg.cpp. A thread
// reads the requests and answers at once what may come while the program runs (initialize, setBreakpoints, configurationDone, threads, pause,
// disconnect); the others wait for the main thread, which runs the program and, while it is paused, answers stackTrace, scopes, variables and
// evaluate and takes continue, next, stepIn and stepOut. Standard output carries the protocol, so the program's own standard output and error
// go through pipes into output events.
#include <algorithm>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <fcntl.h>
#include <map>
#include <thread>
#include <unistd.h>
#ifdef _WIN32   // the C runtime's pipes and null device: the pumps below read file descriptors, as on POSIX
#include <io.h>
#define pipe(fds) _pipe(fds, 65536, _O_BINARY)
#define DAP_NULL_DEVICE "NUL"
#else
#define DAP_NULL_DEVICE "/dev/null"
#endif

#include "dbg/dbg.h"
#include "yyjson.h"

namespace zn::dbg {
namespace {

int gOut = -1;                    // the protocol's channel: the process's standard output when the session began
std::mutex gWrite;
long long gSeq = 1;
std::mutex gQm;
std::condition_variable gQc;
std::deque<std::string> gQueue;   // requests for the main thread
Debugger* gDbg = nullptr;         // set by dapReady; guarded by gQm
bool gConfigured = false, gStopOnEntry = false;
int gExcMode = 0;                 // setExceptionBreakpoints before the program was loaded
long long gLaunchSeq = -1;        // the launch request, answered by dapReady (or at exit when the program did not compile)
std::thread gPumps[2];
std::map<std::string, std::vector<int>> gBps;   // per source path: the breakpoints the client set there

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

void send(const std::string& json) {
  std::lock_guard<std::mutex> lock(gWrite);
  const std::string m = "Content-Length: " + std::to_string(json.size()) + "\r\n\r\n" + json;
  for (std::size_t at = 0; at < m.size();) {
    const ssize_t n = ::write(gOut, m.data() + at, m.size() - at);
    if (n <= 0) return;
    at += static_cast<std::size_t>(n);
  }
}
void respond(long long req, const std::string& command, const std::string& body = "{}", bool ok = true, const std::string& message = "") {
  send("{\"seq\":" + std::to_string(gSeq++) + ",\"type\":\"response\",\"request_seq\":" + std::to_string(req) + ",\"success\":" + (ok ? "true" : "false") +
       ",\"command\":" + q(command) + (ok ? "" : ",\"message\":" + q(message)) + ",\"body\":" + body + "}");
}
void event(const std::string& name, const std::string& body = "{}") {
  send("{\"seq\":" + std::to_string(gSeq++) + ",\"type\":\"event\",\"event\":" + q(name) + ",\"body\":" + body + "}");
}

// A request: its seq, command and arguments (the parsed document lives as long as the struct).
struct Req {
  yyjson_doc* doc = nullptr;
  long long seq = 0;
  std::string command;
  yyjson_val* args = nullptr;
  explicit Req(const std::string& body) {
    doc = yyjson_read(body.c_str(), body.size(), 0);
    yyjson_val* root = doc ? yyjson_doc_get_root(doc) : nullptr;
    if (!root) return;
    seq = yyjson_get_sint(yyjson_obj_get(root, "seq"));
    yyjson_val* c = yyjson_obj_get(root, "command");
    command = c && yyjson_is_str(c) ? yyjson_get_str(c) : "";
    args = yyjson_obj_get(root, "arguments");
  }
  ~Req() { if (doc) yyjson_doc_free(doc); }
  Req(const Req&) = delete;
  Req& operator=(const Req&) = delete;
  std::string str(const char* k) const { yyjson_val* v = args ? yyjson_obj_get(args, k) : nullptr; return v && yyjson_is_str(v) ? yyjson_get_str(v) : ""; }
  long long num(const char* k) const { yyjson_val* v = args ? yyjson_obj_get(args, k) : nullptr; return v && yyjson_is_num(v) ? static_cast<long long>(yyjson_get_num(v)) : 0; }
};

bool readMessage(std::string& body) {
  std::size_t len = 0;
  for (std::string line;;) {
    line.clear();
    int c;
    while ((c = std::getchar()) != EOF && c != '\n') line += static_cast<char>(c);
    if (c == EOF) return false;
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty()) break;
    if (line.rfind("Content-Length:", 0) == 0) len = static_cast<std::size_t>(std::atol(line.c_str() + 15));
  }
  body.assign(len, '\0');
  return std::fread(body.data(), 1, len, stdin) == len;
}

void setBreakpoints(const Req& r) {
  yyjson_val* src = r.args ? yyjson_obj_get(r.args, "source") : nullptr;
  yyjson_val* pv = src ? yyjson_obj_get(src, "path") : nullptr;
  const std::string path = pv && yyjson_is_str(pv) ? yyjson_get_str(pv) : "";
  std::string out;
  std::unique_lock<std::mutex> lock(gQm);
  Debugger* d = gDbg;
  lock.unlock();
  if (d) for (int id : gBps[path]) d->removeBreakpoint(id);
  gBps[path].clear();
  yyjson_val* list = r.args ? yyjson_obj_get(r.args, "breakpoints") : nullptr;
  std::size_t i, n;
  yyjson_val* bp;
  yyjson_arr_foreach(list, i, n, bp) {
    const long long line = yyjson_get_sint(yyjson_obj_get(bp, "line"));
    yyjson_val* cv = yyjson_obj_get(bp, "condition");
    yyjson_val* lv = yyjson_obj_get(bp, "logMessage");
    const std::string cond = cv && yyjson_is_str(cv) ? yyjson_get_str(cv) : "", log = lv && yyjson_is_str(lv) ? yyjson_get_str(lv) : "";
    std::string where;
    const int id = d && line > 0 ? d->addBreakpoint(path, static_cast<std::uint32_t>(line), where, cond, log) : 0;
    if (!out.empty()) out += ",";
    if (id) {
      gBps[path].push_back(id);
      out += "{\"id\":" + std::to_string(id) + ",\"verified\":true,\"line\":" + where.substr(where.rfind(':') + 1) + "}";
    } else out += "{\"verified\":false,\"line\":" + std::to_string(line) + ",\"message\":\"no code on this line\"}";
  }
  respond(r.seq, r.command, "{\"breakpoints\":[" + out + "]}");
}

// The reading thread: what can be answered while the program runs is answered here, the rest goes to the main thread.
void reader() {
  for (std::string body; readMessage(body);) {
    Req r(body);
    if (r.command == "initialize") {
      respond(r.seq, r.command, "{\"supportsConfigurationDoneRequest\":true,\"supportsEvaluateForHovers\":true,\"supportsTerminateRequest\":true,\"supportsConditionalBreakpoints\":true,\"supportsLogPoints\":true,"
                                "\"exceptionBreakpointFilters\":[{\"filter\":\"uncaught\",\"label\":\"Uncaught Exceptions\",\"default\":false},{\"filter\":\"all\",\"label\":\"All Exceptions\",\"default\":false}]}");
    } else if (r.command == "setBreakpoints") setBreakpoints(r);
    else if (r.command == "setExceptionBreakpoints") {
      int mode = 0;
      yyjson_val* fs = r.args ? yyjson_obj_get(r.args, "filters") : nullptr;
      std::size_t i, n;
      yyjson_val* f;
      yyjson_arr_foreach(fs, i, n, f) if (yyjson_is_str(f)) mode = std::max(mode, std::string(yyjson_get_str(f)) == "all" ? 2 : 1);
      std::unique_lock<std::mutex> lock(gQm);
      if (gDbg) gDbg->setExceptionPause(mode); else gExcMode = mode;
      lock.unlock();
      respond(r.seq, r.command, "{\"breakpoints\":[]}");
    }
    else if (r.command == "configurationDone") {
      respond(r.seq, r.command);
      std::lock_guard<std::mutex> lock(gQm);
      gConfigured = true;
      gQc.notify_all();
    } else if (r.command == "threads") respond(r.seq, r.command, "{\"threads\":[{\"id\":1,\"name\":\"main\"}]}");
    else if (r.command == "pause") {
      std::unique_lock<std::mutex> lock(gQm);
      if (gDbg) gDbg->requestPause();
      lock.unlock();
      respond(r.seq, r.command);
    } else if (r.command == "disconnect" || r.command == "terminate") {
      respond(r.seq, r.command);
      event("terminated");
      std::_Exit(0);   // ponytail: the program is ended where it is, as a debugger's stop button does
    } else {
      std::lock_guard<std::mutex> lock(gQm);
      gQueue.push_back(body);
      gQc.notify_all();
    }
  }
  std::_Exit(0);   // the client went away
}

// The program's standard output or error, as output events (a UTF-8 sequence cut by a read waits for the rest).
void pump(int fd, const char* category) {
  char buf[8192];
  std::string carry;
  for (ssize_t n; (n = ::read(fd, buf, sizeof buf)) > 0;) {
    carry.append(buf, static_cast<std::size_t>(n));
    std::size_t end = carry.size(), k = end;
    while (k > 0 && end - k < 4 && (static_cast<unsigned char>(carry[k - 1]) & 0xC0) == 0x80) --k;   // continuation bytes at the end
    if (k > 0 && static_cast<unsigned char>(carry[k - 1]) >= 0xC0) {   // a lead byte: is its sequence whole?
      const unsigned char lead = static_cast<unsigned char>(carry[k - 1]);
      const std::size_t need = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : 2;
      if (end - (k - 1) < need) end = k - 1;
    }
    if (end == 0) continue;
    event("output", "{\"category\":\"" + std::string(category) + "\",\"output\":" + q(carry.substr(0, end)) + "}");
    carry.erase(0, end);
  }
  ::close(fd);
}

void finish() {
  std::fflush(stdout);
  std::fflush(stderr);
  const int dn = ::open(DAP_NULL_DEVICE, O_WRONLY);   // the last writers of the pipes go: the pumps read their end
  ::dup2(dn, 1);
  ::dup2(dn, 2);
  for (std::thread& t : gPumps) if (t.joinable()) t.join();
  if (gLaunchSeq >= 0) respond(gLaunchSeq, "launch", "{}", false, "the program did not start (see the output)");
  event("terminated");
}

std::string pop() {
  std::unique_lock<std::mutex> lock(gQm);
  gQc.wait(lock, [] { return !gQueue.empty(); });
  std::string b = std::move(gQueue.front());
  gQueue.pop_front();
  return b;
}

}  // namespace

bool dapStart(Launch& out) {
  gOut = ::dup(1);
  int po[2], pe[2];
  if (gOut < 0 || ::pipe(po) != 0 || ::pipe(pe) != 0) return false;
  ::dup2(po[1], 1); ::close(po[1]);
  ::dup2(pe[1], 2); ::close(pe[1]);
  std::setvbuf(stdout, nullptr, _IOLBF, 0);   // a pipe now: line by line, as on a terminal
  gPumps[0] = std::thread(pump, po[0], "stdout");
  gPumps[1] = std::thread(pump, pe[0], "stderr");
  std::thread(reader).detach();
  std::atexit(finish);
  for (;;) {
    Req r(pop());
    if (r.command != "launch") { respond(r.seq, r.command, "{}", false, "not launched yet"); continue; }
    out.program = r.str("program");
    out.cwd = r.str("cwd");
    yyjson_val* soe = r.args ? yyjson_obj_get(r.args, "stopOnEntry") : nullptr;
    out.stopOnEntry = soe && yyjson_is_true(soe);
    yyjson_val* a = r.args ? yyjson_obj_get(r.args, "args") : nullptr;
    std::size_t i, n;
    yyjson_val* v;
    yyjson_arr_foreach(a, i, n, v) if (yyjson_is_str(v)) out.args.push_back(yyjson_get_str(v));
    gLaunchSeq = r.seq;
    gStopOnEntry = out.stopOnEntry;
    if (out.program.empty()) { respond(r.seq, r.command, "{}", false, "launch needs a \"program\""); gLaunchSeq = -1; continue; }
    return true;
  }
}

void dapReady(Debugger& d) {
  if (!gStopOnEntry) d.runFirst();
  {
    std::lock_guard<std::mutex> lock(gQm);
    gDbg = &d;
    if (gExcMode) d.setExceptionPause(gExcMode);
  }
  respond(gLaunchSeq, "launch");
  gLaunchSeq = -1;
  event("initialized");
  std::unique_lock<std::mutex> lock(gQm);
  gQc.wait(lock, [] { return gConfigured; });
}

void dapLog(const std::string& message) { event("output", "{\"category\":\"console\",\"output\":" + q(message + "\n") + "}"); }

Resume dapPaused(Debugger& d) {
  std::fflush(stdout);
  const std::string text = std::string(d.reason()) == "exception" ? d.exception() : d.conditionError();
  event("stopped", std::string("{\"reason\":\"") + d.reason() + "\",\"threadId\":1,\"allThreadsStopped\":true" +
                       (d.hitBreakpoint() ? ",\"hitBreakpointIds\":[" + std::to_string(d.hitBreakpoint()) + "]" : "") + (text.empty() ? "" : ",\"text\":" + q(text) + ",\"description\":" + q(text)) + "}");
  struct Ref { int frame = -1, kind = 0; Local value; };   // kind 0 locals, 1 closure, 2 globals (of `frame`), else the children of `value`
  std::vector<Ref> refs;   // variablesReference k is refs[k - 1], while the program stays paused
  const std::vector<StackFrame> st = d.stack();
  auto vars = [&](const std::vector<Local>& ls) {
    std::string o;
    for (const Local& l : ls) {
      int ref = 0;
      if (l.expandable()) { refs.push_back({-1, 0, l}); ref = static_cast<int>(refs.size()); }
      o += std::string(o.empty() ? "" : ",") + "{\"name\":" + q(l.name) + ",\"value\":" + q(l.value) + ",\"type\":" + q(l.type) + ",\"variablesReference\":" + std::to_string(ref) + "}";
    }
    return o;
  };
  for (;;) {
    Req r(pop());
    if (r.command == "continue") { respond(r.seq, r.command, "{\"allThreadsContinued\":true}"); return Resume::Continue; }
    if (r.command == "next") { respond(r.seq, r.command); return Resume::StepOver; }
    if (r.command == "stepIn") { respond(r.seq, r.command); return Resume::StepInto; }
    if (r.command == "stepOut") { respond(r.seq, r.command); return Resume::StepOut; }
    if (r.command == "stackTrace") {
      std::string o;
      for (std::size_t i = 0; i < st.size(); ++i) {
        const zbc::LineInfo* li = d.lineInfo(st[i].line);
        const std::string path = d.filePath(st[i].line);
        o += std::string(i ? "," : "") + "{\"id\":" + std::to_string(i) + ",\"name\":" + q(d.fnName(st[i].fn)) + ",\"source\":{\"name\":" + q(path.substr(path.rfind('/') + 1)) +
             ",\"path\":" + q(path) + "},\"line\":" + std::to_string(li ? li->line : 0) + ",\"column\":" + std::to_string(li ? li->col : 0) + "}";
      }
      respond(r.seq, r.command, "{\"stackFrames\":[" + o + "],\"totalFrames\":" + std::to_string(st.size()) + "}");
    } else if (r.command == "scopes") {
      const int fr = static_cast<int>(r.num("frameId"));
      std::string o;
      const char* names[] = {"Locals", "Closure", "Globals"};
      for (int kind = 0; kind < 3; ++kind) {
        if ((kind == 1 && d.closure(static_cast<std::size_t>(fr)).empty()) || (kind == 2 && d.globals().empty())) continue;
        refs.push_back({fr, kind, {}});
        o += std::string(o.empty() ? "" : ",") + "{\"name\":\"" + names[kind] + "\"," + (kind == 0 ? "\"presentationHint\":\"locals\"," : "") + "\"variablesReference\":" + std::to_string(refs.size()) + ",\"expensive\":false}";
      }
      respond(r.seq, r.command, "{\"scopes\":[" + o + "]}");
    } else if (r.command == "variables") {
      const long long k = r.num("variablesReference");
      if (k < 1 || k > static_cast<long long>(refs.size())) { respond(r.seq, r.command, "{\"variables\":[]}"); continue; }
      const Ref ref = refs[static_cast<std::size_t>(k - 1)];
      const std::size_t fr = static_cast<std::size_t>(ref.frame < 0 ? 0 : ref.frame);
      respond(r.seq, r.command, "{\"variables\":[" + vars(ref.frame < 0 ? d.children(ref.value) : ref.kind == 0 ? d.locals(fr) : ref.kind == 1 ? d.closure(fr) : d.globals()) + "]}");
    } else if (r.command == "evaluate") {   // watches, hovers and the debug console: an expression in the frame
      Local l;
      std::string err;
      if (!d.evaluate(r.str("expression"), static_cast<std::size_t>(r.num("frameId")), l, err)) { respond(r.seq, r.command, "{}", false, err); continue; }
      int ref = 0;
      if (l.expandable()) { refs.push_back({-1, 0, l}); ref = static_cast<int>(refs.size()); }
      respond(r.seq, r.command, "{\"result\":" + q(l.value) + ",\"type\":" + q(l.type) + ",\"variablesReference\":" + std::to_string(ref) + "}");
    } else respond(r.seq, r.command, "{}", false, "not supported: " + r.command);
  }
}

}  // namespace zn::dbg
