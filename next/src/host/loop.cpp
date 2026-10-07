// The event loop of the host on libuv (ZN-082), see include/zn/loop.h.
#include "zn/loop.h"

#include <uv.h>

#include <csignal>
#include <cstdlib>
#include <deque>
#include <cstring>
#include <memory>
#include <vector>

extern char** environ;

namespace zn::loop {
namespace {

uv_loop_t* loop() {
  static uv_loop_t* l = [] {
    auto* x = new uv_loop_t;
    uv_loop_init(x);
    return x;
  }();
  return l;
}

struct Child {
  uv_process_t proc;
  uv_pipe_t out;
  std::string data;
  int code = -1;
  bool procOpen = false, outOpen = false;
};
std::vector<std::unique_ptr<Child>> gChildren;

void onClose(uv_handle_t*) {}
void onExit(uv_process_t* p, int64_t status, int signal) {
  auto* c = static_cast<Child*>(p->data);
  c->code = signal != 0 ? 128 + signal : static_cast<int>(status);
  c->procOpen = false;
  uv_close(reinterpret_cast<uv_handle_t*>(p), onClose);
}
void onAlloc(uv_handle_t*, size_t suggested, uv_buf_t* buf) {
  buf->base = static_cast<char*>(std::malloc(suggested));
  buf->len = static_cast<unsigned>(buf->base ? suggested : 0);
}
void onRead(uv_stream_t* s, ssize_t n, const uv_buf_t* buf) {
  auto* c = static_cast<Child*>(s->data);
  if (n > 0) c->data.append(buf->base, static_cast<size_t>(n));
  if (buf->base) std::free(buf->base);
  if (n < 0 && c->outOpen) { c->outOpen = false; uv_close(reinterpret_cast<uv_handle_t*>(s), onClose); }  // end of file (or an error): the child closed its output
}
void onTimer(uv_timer_t*) {}

Child* childAt(int h) { return h >= 0 && static_cast<size_t>(h) < gChildren.size() ? gChildren[static_cast<size_t>(h)].get() : nullptr; }

}  // namespace

void pump() {
  // uv_run polls only while some handle is active, and the signal and stdin watchers are unreferenced: an active zero timer makes one polling round happen
  static uv_timer_t* t = [] { auto* x = new uv_timer_t; uv_timer_init(loop(), x); return x; }();
  uv_timer_start(t, onTimer, 0, 0);
  uv_run(loop(), UV_RUN_NOWAIT);
  uv_timer_stop(t);
}

void wait(double ms) {
  if (ms <= 0) { pump(); return; }
  uv_timer_t t;
  uv_timer_init(loop(), &t);
  uv_timer_start(&t, onTimer, static_cast<uint64_t>(ms + 0.999), 0);  // rounds up: never wakes before the time asked
  uv_run(loop(), UV_RUN_ONCE);
  uv_timer_stop(&t);
  uv_close(reinterpret_cast<uv_handle_t*>(&t), onClose);
  uv_run(loop(), UV_RUN_NOWAIT);  // lets the close callback run before `t` goes out of scope
}

double nowMs() {
  static const uint64_t start = uv_hrtime();
  return static_cast<double>(uv_hrtime() - start) / 1e6;
}

int spawn(const std::string& line) {
  auto c = std::make_unique<Child>();
  std::memset(&c->proc, 0, sizeof c->proc);
  uv_pipe_init(loop(), &c->out, 0);
  c->proc.data = c.get();
  c->out.data = c.get();
  std::string script = "exec 2>&1\n" + line;  // stderr joins stdout
  char* args[] = {const_cast<char*>("sh"), const_cast<char*>("-c"), const_cast<char*>(script.c_str()), nullptr};
  uv_stdio_container_t stdio[3];
  stdio[0].flags = UV_INHERIT_FD; stdio[0].data.fd = 0;
  stdio[1].flags = static_cast<uv_stdio_flags>(UV_CREATE_PIPE | UV_WRITABLE_PIPE); stdio[1].data.stream = reinterpret_cast<uv_stream_t*>(&c->out);
  stdio[2].flags = UV_INHERIT_FD; stdio[2].data.fd = 2;
  uv_process_options_t o;
  std::memset(&o, 0, sizeof o);
  o.file = "/bin/sh";
  o.args = args;
  o.exit_cb = onExit;
  o.stdio_count = 3;
  o.stdio = stdio;
  if (uv_spawn(loop(), &c->proc, &o) != 0) { uv_close(reinterpret_cast<uv_handle_t*>(&c->out), onClose); uv_run(loop(), UV_RUN_NOWAIT); return -1; }
  c->procOpen = c->outOpen = true;
  uv_read_start(reinterpret_cast<uv_stream_t*>(&c->out), onAlloc, onRead);
  gChildren.push_back(std::move(c));
  return static_cast<int>(gChildren.size()) - 1;
}

std::string read(int h) {
  Child* c = childAt(h);
  if (!c) return {};
  pump();
  std::string out;
  out.swap(c->data);
  return out;
}

int status(int h) {
  Child* c = childAt(h);
  if (!c) return 127;
  pump();
  return c->procOpen ? -1 : c->code;
}

void kill(int h) {
  Child* c = childAt(h);
  if (c && c->procOpen) uv_process_kill(&c->proc, SIGTERM);
}

// ---- zinc:process
namespace {

struct Proc {
  uv_process_t proc;
  uv_pipe_t in, out, err;
  int handle = 0, pid = 0;
  bool procOpen = false, inOpen = false, outOpen = false, errOpen = false, exited = false, reported = false;
  int code = 0;
};
std::vector<std::unique_ptr<Proc>> gProcs;
std::deque<Event> gEvents;
std::string gError;
int gWatched = 0;
bool gStdin = false;

void maybeReport(Proc* p) {  // the exit is reported once the output has been delivered
  if (p->exited && !p->outOpen && !p->errOpen && !p->reported) {
    p->reported = true;
    gEvents.push_back({p->handle, 2, std::to_string(p->code)});
  }
}
void onProcExit(uv_process_t* h, int64_t status, int signal) {
  auto* p = static_cast<Proc*>(h->data);
  p->code = signal != 0 ? 128 + signal : static_cast<int>(status);
  p->procOpen = false;
  p->exited = true;
  uv_close(reinterpret_cast<uv_handle_t*>(h), onClose);
  maybeReport(p);
}
void onStreamRead(uv_stream_t* s, ssize_t n, const uv_buf_t* buf) {
  auto* p = static_cast<Proc*>(s->data);
  bool isOut = s == reinterpret_cast<uv_stream_t*>(&p->out);
  if (n > 0) gEvents.push_back({p->handle, isOut ? 0 : 1, std::string(buf->base, static_cast<size_t>(n))});
  if (buf->base) std::free(buf->base);
  if (n < 0) {
    bool& open = isOut ? p->outOpen : p->errOpen;
    if (open) { open = false; uv_close(reinterpret_cast<uv_handle_t*>(s), onClose); }
    maybeReport(p);
  }
}

struct SigWatch { uv_signal_t h; std::string name; };
std::vector<std::unique_ptr<SigWatch>> gSigs;
void onSignalCb(uv_signal_t* h, int) { gEvents.push_back({0, 10, static_cast<SigWatch*>(h->data)->name}); }
struct SigName { const char* name; int num; bool catchable; };
const SigName kSignals[] = {{"SIGHUP", SIGHUP, true}, {"SIGINT", SIGINT, true}, {"SIGQUIT", SIGQUIT, true}, {"SIGTERM", SIGTERM, true}, {"SIGUSR1", SIGUSR1, true}, {"SIGUSR2", SIGUSR2, true},
                            {"SIGALRM", SIGALRM, true}, {"SIGCHLD", SIGCHLD, true}, {"SIGCONT", SIGCONT, true}, {"SIGPIPE", SIGPIPE, true}, {"SIGWINCH", SIGWINCH, true},
                            {"SIGKILL", SIGKILL, false}, {"SIGSTOP", SIGSTOP, false}};
const SigName* sigByName(const std::string& n) { for (const SigName& s : kSignals) if (n == s.name) return &s; return nullptr; }

uv_pipe_t gStdinPipe;
void onStdinRead(uv_stream_t* s, ssize_t n, const uv_buf_t* buf) {
  if (n > 0) gEvents.push_back({0, 11, std::string(buf->base, static_cast<size_t>(n))});
  if (buf->base) std::free(buf->base);
  if (n < 0) { gEvents.push_back({0, 12, ""}); gStdin = false; uv_close(reinterpret_cast<uv_handle_t*>(s), onClose); }
}

Proc* procAt(int h) { return h > 0 && static_cast<size_t>(h) <= gProcs.size() ? gProcs[static_cast<size_t>(h) - 1].get() : nullptr; }

}  // namespace

int spawnProcess(const std::vector<std::string>& argvIn, const std::string& cwd, const std::vector<std::string>& env) {
  gError.clear();
  if (argvIn.empty() || argvIn[0].empty()) { gError = "no program"; return -1; }
  auto p = std::make_unique<Proc>();
  std::memset(&p->proc, 0, sizeof p->proc);
  uv_pipe_init(loop(), &p->in, 0); uv_pipe_init(loop(), &p->out, 0); uv_pipe_init(loop(), &p->err, 0);
  p->proc.data = p.get(); p->in.data = p.get(); p->out.data = p.get(); p->err.data = p.get();
  std::vector<char*> args;
  for (const std::string& a : argvIn) args.push_back(const_cast<char*>(a.c_str()));
  args.push_back(nullptr);
  std::vector<std::string> envStrings;
  std::vector<char*> envp;
  std::vector<std::string> overridden;
  for (const std::string& kv : env) { size_t eq = kv.find('='); if (eq != std::string::npos) overridden.push_back(kv.substr(0, eq + 1)); }
  for (char** e = environ; e && *e; ++e) {
    bool replaced = false;
    for (const std::string& o : overridden) if (std::strncmp(*e, o.c_str(), o.size()) == 0) replaced = true;
    if (!replaced) envStrings.push_back(*e);
  }
  for (const std::string& kv : env) envStrings.push_back(kv);
  for (std::string& e : envStrings) envp.push_back(const_cast<char*>(e.c_str()));
  envp.push_back(nullptr);
  uv_stdio_container_t stdio[3];
  stdio[0].flags = static_cast<uv_stdio_flags>(UV_CREATE_PIPE | UV_READABLE_PIPE); stdio[0].data.stream = reinterpret_cast<uv_stream_t*>(&p->in);
  stdio[1].flags = static_cast<uv_stdio_flags>(UV_CREATE_PIPE | UV_WRITABLE_PIPE); stdio[1].data.stream = reinterpret_cast<uv_stream_t*>(&p->out);
  stdio[2].flags = static_cast<uv_stdio_flags>(UV_CREATE_PIPE | UV_WRITABLE_PIPE); stdio[2].data.stream = reinterpret_cast<uv_stream_t*>(&p->err);
  uv_process_options_t o;
  std::memset(&o, 0, sizeof o);
  o.file = args[0];
  o.args = args.data();
  o.env = envp.data();
  o.cwd = cwd.empty() ? nullptr : cwd.c_str();
  o.exit_cb = onProcExit;
  o.stdio_count = 3;
  o.stdio = stdio;
  int rc = uv_spawn(loop(), &p->proc, &o);
  if (rc != 0) {
    gError = argvIn[0] + ": " + uv_strerror(rc);
    for (uv_pipe_t* pp : {&p->in, &p->out, &p->err}) uv_close(reinterpret_cast<uv_handle_t*>(pp), onClose);
    uv_run(loop(), UV_RUN_NOWAIT);
    return -1;
  }
  p->procOpen = p->inOpen = p->outOpen = p->errOpen = true;
  p->pid = p->proc.pid;
  uv_read_start(reinterpret_cast<uv_stream_t*>(&p->out), onAlloc, onStreamRead);
  uv_read_start(reinterpret_cast<uv_stream_t*>(&p->err), onAlloc, onStreamRead);
  gProcs.push_back(std::move(p));
  gProcs.back()->handle = static_cast<int>(gProcs.size());
  return gProcs.back()->handle;
}
const std::string& lastError() { return gError; }
int pidOf(int h) { Proc* p = procAt(h); return p ? p->pid : -1; }
bool writeStdin(int h, const std::string& data) {
  Proc* p = procAt(h);
  if (!p || !p->inOpen) return false;
  uv_stream_set_blocking(reinterpret_cast<uv_stream_t*>(&p->in), 1);
  size_t done = 0;
  while (done < data.size()) {
    uv_buf_t b = uv_buf_init(const_cast<char*>(data.data()) + done, static_cast<unsigned>(data.size() - done));
    int n = uv_try_write(reinterpret_cast<uv_stream_t*>(&p->in), &b, 1);
    if (n < 0) { if (n == UV_EAGAIN) continue; return false; }
    done += static_cast<size_t>(n);
  }
  return true;
}
void closeStdin(int h) {
  Proc* p = procAt(h);
  if (p && p->inOpen) { p->inOpen = false; uv_close(reinterpret_cast<uv_handle_t*>(&p->in), onClose); }
}
void signalProcess(int h, int signal) { Proc* p = procAt(h); if (p && p->procOpen) uv_process_kill(&p->proc, signal); }
bool nextEvent(Event& out) {
  pump();
  if (gEvents.empty()) return false;
  out = std::move(gEvents.front());
  gEvents.pop_front();
  return true;
}
bool active() {
  for (const auto& p : gProcs) if (p->procOpen || p->outOpen || p->errOpen || (p->exited && !p->reported)) return true;
  return gWatched > 0 || gStdin || !gEvents.empty();
}
bool watchSignal(const std::string& name) {
  const SigName* s = sigByName(name);
  if (!s || !s->catchable) return false;
  for (const auto& w : gSigs) if (w->name == name) return true;
  auto w = std::make_unique<SigWatch>();
  w->name = name;
  uv_signal_init(loop(), &w->h);
  w->h.data = w.get();
  uv_signal_start(&w->h, onSignalCb, s->num);
  uv_unref(reinterpret_cast<uv_handle_t*>(&w->h));  // a watched signal does not keep the program alive
  gSigs.push_back(std::move(w));
  return true;
}
bool sendSignal(int pid, const std::string& name) {
  const SigName* s = sigByName(name);
  if (!s) return false;
  ::kill(pid, s->num);
  return true;
}
void readStdin() {
  if (gStdin) return;
  gStdin = true;
  uv_pipe_init(loop(), &gStdinPipe, 0);
  if (uv_pipe_open(&gStdinPipe, 0) != 0) { gEvents.push_back({0, 12, ""}); gStdin = false; return; }
  uv_read_start(reinterpret_cast<uv_stream_t*>(&gStdinPipe), onAlloc, onStdinRead);
}

}  // namespace zn::loop
