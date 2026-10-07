// The plugins' native sources, built unchanged (ZN-099): sqlite.host.cpp, process.host.cpp and socket.host.cpp run behind the native-module ABI through the thunks
// of `zinc native-gen --thunk` and src/native/zrt_compat.h. The driver calls the exports as the engine does and polls the modules like a loop turn.
#include <chrono>
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>
#include <thread>
#include <vector>

#include "zn/native.h"

extern "C" {
const ZnModule* zn_module_Sqlite(void);
const ZnModule* zn_module_Process(void);
const ZnModule* zn_module_Socket(void);
}

static int gFailed = 0;
#define CHECK(cond) do { if (!(cond)) { std::printf("FAIL line %d: %s\n", __LINE__, #cond); ++gFailed; } } while (0)

struct Event { std::uint64_t cb; std::vector<std::string> text; std::vector<std::int64_t> ints; };
static std::vector<Event> gEvents;
static std::int32_t sinkCall(void*, std::uint64_t cb, const ZnVal* a, std::uint32_t n, ZnVal*) {
  Event e{cb, {}, {}};
  if (cb == 7001 && n == 3) { e.ints = {a[0].i, a[1].i}; e.text = {std::string(a[2].s.p, a[2].s.n)}; }   // process: handle, kind, text
  if (cb == 7002 && n == 5) { e.ints = {a[0].i, a[1].i, a[2].i}; e.text = {std::string(a[3].s.p, a[3].s.n)}; }   // socket: handle, kind, a, text, bytes
  gEvents.push_back(e);
  return 0;
}
static void sinkNone(void*, std::uint64_t, const ZnVal*) {}
static void sinkRej(void*, std::uint64_t, const char*) {}
static void sinkRel(void*, std::uint64_t) {}

static char gErr[256];
static ZnVal gRet;
static std::int32_t call(const char* mod, const char* name, ZnVal* args) { gErr[0] = 0; return zn_native_call(mod, name, nullptr, args, &gRet, gErr, sizeof gErr); }
static ZnVal I(std::int64_t v) { ZnVal z; z.u = 0; z.i = v; return z; }
static ZnVal S(const char* s) { ZnVal z; z.u = 0; z.s.p = s; z.s.n = static_cast<std::uint32_t>(std::strlen(s)); return z; }
static std::string str(const ZnVal& v) { return std::string(v.s.p, v.s.n); }

static void spin(const std::function<bool()>& done) {
  for (int i = 0; i < 600 && !done(); ++i) { zn_native_poll(0); zn_native_drain(); if (!done()) std::this_thread::sleep_for(std::chrono::milliseconds(5)); }
}

int main() {
  char err[256];
  ZnSink sink{nullptr, sinkNone, sinkRej, sinkCall, sinkRel};
  zn_native_set_sink(&sink);
  CHECK(zn_register_module(zn_module_Sqlite(), err, sizeof err) == 0);
  CHECK(zn_register_module(zn_module_Process(), err, sizeof err) == 0);
  CHECK(zn_register_module(zn_module_Socket(), err, sizeof err) == 0);

  // ---- sqlite: the amalgamation behind handles, strings and byte arrays
  ZnVal a[4];
  a[0] = S(":memory:"); a[1] = I(2 | 4);
  CHECK(call("Sqlite", "open", a) == ZN_OK);
  std::int64_t db = gRet.i;
  CHECK(db >= 0);
  a[0] = I(db); a[1] = S("CREATE TABLE t (a INTEGER, b TEXT, c BLOB); INSERT INTO t VALUES (1, 'x', NULL), (2, 'é€', x'00ff');");
  CHECK(call("Sqlite", "exec", a) == ZN_OK && gRet.i == 1);
  a[1] = S("SELEC 1");
  CHECK(call("Sqlite", "exec", a) == ZN_OK && gRet.i == 0);
  a[0] = I(0);
  CHECK(call("Sqlite", "error", a) == ZN_OK && str(gRet).find("syntax error") != std::string::npos);
  a[0] = I(db); a[1] = S("SELECT a, b, c FROM t ORDER BY a");
  CHECK(call("Sqlite", "prepare", a) == ZN_OK && gRet.i >= 0);
  std::int64_t st = gRet.i;
  a[0] = I(st);
  CHECK(call("Sqlite", "step", a) == ZN_OK && gRet.i == 100);
  a[1] = I(0);
  CHECK(call("Sqlite", "columnDouble", a) == ZN_OK && gRet.d == 1);
  a[1] = I(1);
  CHECK(call("Sqlite", "columnText", a) == ZN_OK && str(gRet) == "x");
  a[0] = I(st);
  CHECK(call("Sqlite", "step", a) == ZN_OK && gRet.i == 100);
  a[1] = I(1);
  CHECK(call("Sqlite", "columnText", a) == ZN_OK && str(gRet) == "é€");
  a[1] = I(2);
  CHECK(call("Sqlite", "columnBlob", a) == ZN_OK && gRet.v.n == 2 && static_cast<const unsigned char*>(gRet.v.p)[1] == 255);
  a[0] = I(st);
  CHECK(call("Sqlite", "step", a) == ZN_OK && gRet.i == 101);
  CHECK(call("Sqlite", "finalize", a) == ZN_OK);
  const unsigned char blob[] = {7, 8, 9};
  a[0] = I(db); a[1] = S("INSERT INTO t (a, c) VALUES (3, ?1)");
  CHECK(call("Sqlite", "prepare", a) == ZN_OK);
  st = gRet.i;
  a[0] = I(st); a[1] = I(1); a[2].v = ZnView{blob, 3};
  CHECK(call("Sqlite", "bindBlob", a) == ZN_OK && gRet.i == 1);
  a[0] = I(st);
  CHECK(call("Sqlite", "step", a) == ZN_OK && gRet.i == 101);
  a[0] = I(db);
  CHECK(call("Sqlite", "changes", a) == ZN_OK && gRet.d == 1);
  CHECK(call("Sqlite", "version", a) == ZN_OK && str(gRet).compare(0, 2, "3.") == 0);

  // ---- process: a child through posix_spawn, its output and exit as callbacks queued by the module's poller
  a[0] = I(7001);   // the callback handle the engine would give for the closure
  CHECK(call("Process", "onEvent", a) == ZN_OK);
  a[0] = S("sh"); a[1] = S("-c\x1f" "echo hello; exit 3"); a[2] = S(""); a[3] = S("");
  CHECK(call("Process", "spawn", a) == ZN_OK && gRet.i >= 0);
  spin([] { return gEvents.size() >= 2; });
  CHECK(gEvents.size() >= 2 && gEvents[0].cb == 7001 && gEvents[0].ints[1] == 0 && gEvents[0].text[0] == "hello\n");   // stdout
  CHECK(gEvents.size() >= 2 && gEvents[1].ints[1] == 2 && gEvents[1].text[0] == "3");                                       // exit code 3

  // ---- socket: a listener and a client on loopback, events as callbacks
  gEvents.clear();
  a[0] = I(7002);
  CHECK(call("Socket", "onEvent", a) == ZN_OK);
  a[0] = S("127.0.0.1"); a[1] = I(0);
  CHECK(call("Socket", "listen", a) == ZN_OK && gRet.i >= 0);
  std::int64_t lh = gRet.i;
  a[0] = I(lh);
  CHECK(call("Socket", "localPort", a) == ZN_OK && gRet.i > 0);
  std::int64_t port = gRet.i;
  a[0] = S("127.0.0.1"); a[1] = I(port);
  CHECK(call("Socket", "connect", a) == ZN_OK && gRet.i >= 0);
  auto seen = [](int kind) { for (const Event& e : gEvents) if (e.cb == 7002 && e.ints.size() > 1 && e.ints[1] == kind) return true; return false; };
  spin([&] { return seen(2); });   // the listener opens, the client opens, the connection is accepted
  CHECK(seen(1) && seen(2));   // OPEN and ACCEPT

  zn_native_shutdown();
  std::printf(gFailed ? "native plugins: %d failure(s)\n" : "native plugins: all checks passed\n", gFailed);
  return gFailed ? 1 : 0;
}
