// The event loop of the host on libuv (ZN-082), see include/zn/loop.h.
#include "zn/loop.h"

#include <uv.h>

#include <cstdlib>
#include <cstring>
#include <memory>
#include <vector>

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

void pump() { uv_run(loop(), UV_RUN_NOWAIT); }

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

}  // namespace zn::loop
