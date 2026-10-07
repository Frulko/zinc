// The native-module ABI against a module written in C (ZN-096, tests/native/fixture.c): scalars, strings, byte arrays, a callback, a promise completed from a thread, a
// resource finalizer, a post from a thread, and a module built for another ABI refused.
#include <chrono>
#include <cstdio>
#include <cstring>
#include <functional>
#include <map>
#include <string>
#include <thread>

#include "zn/native.h"

extern "C" const ZnModule* fixture_module(void);
extern "C" int fixture_finalized;

static int gFailed = 0;
#define CHECK(cond) do { if (!(cond)) { std::printf("FAIL line %d: %s\n", __LINE__, #cond); ++gFailed; } } while (0)

struct Engine {
  std::map<std::uint64_t, std::function<void(const ZnVal*, std::uint32_t)>> callbacks;
  std::map<std::uint64_t, std::string> settled;   // promise -> "ok:<value>" or "err:<message>"
  std::string lastText;
  int released = 0;
} E;

static void sinkResolve(void*, std::uint64_t p, const ZnVal* v) { E.settled[p] = "ok:" + std::to_string(v ? v->i : 0); }
static void sinkReject(void*, std::uint64_t p, const char* m) { E.settled[p] = std::string("err:") + m; }
static std::int32_t sinkCall(void*, std::uint64_t cb, const ZnVal* a, std::uint32_t n, ZnVal*) { auto it = E.callbacks.find(cb); if (it == E.callbacks.end()) return -1; it->second(a, n); return 0; }
static void sinkRelease(void*, std::uint64_t) { ++E.released; }

static void waitFor(const std::function<bool()>& done) {
  for (int i = 0; i < 400 && !done(); ++i) { zn_native_drain(); if (!done()) std::this_thread::sleep_for(std::chrono::milliseconds(5)); }
  zn_native_drain();
}

int main() {
  char err[256] = "";
  ZnSink sink{nullptr, sinkResolve, sinkReject, sinkCall, sinkRelease};
  zn_native_set_sink(&sink);

  // a module built for another ABI is refused, and so are a malformed signature and an unknown resource kind
  ZnModule old = *fixture_module();
  old.abi = ZN_ABI_VERSION + 1;
  old.name = "Old";
  CHECK(zn_register_module(&old, err, sizeof err) < 0);
  CHECK(std::strstr(err, "ABI 2") && std::strstr(err, "ABI 1"));
  static const ZnExport badSig[] = {{"x", "i>", [](void*, ZnCtx*, const ZnVal*, ZnVal*) -> std::int32_t { return 0; }, 0}};
  ZnModule bad = *fixture_module();
  bad.name = "Bad"; bad.exports = badSig; bad.nexports = 1; bad.init = nullptr; bad.shutdown = nullptr;
  CHECK(zn_register_module(&bad, err, sizeof err) < 0 && std::strstr(err, "bad signature"));
  static const ZnExport badKind[] = {{"x", "R7>n", [](void*, ZnCtx*, const ZnVal*, ZnVal*) -> std::int32_t { return 0; }, 0}};
  bad.name = "Bad2"; bad.exports = badKind;
  CHECK(zn_register_module(&bad, err, sizeof err) < 0 && std::strstr(err, "unknown resource kind"));

  CHECK(zn_register_module(fixture_module(), err, sizeof err) == 0);
  CHECK(zn_register_module(fixture_module(), err, sizeof err) < 0);   // twice

  ZnVal a[2], r;
  // scalars, and the signature check
  a[0].i = 2; a[1].i = 3;
  CHECK(zn_native_call("Fixture", "add", "ii>i", a, &r, err, sizeof err) == ZN_OK && r.i == 5);
  a[0].d = 1.5; a[1].d = 4;
  CHECK(zn_native_call("Fixture", "scale", "dd>d", a, &r, err, sizeof err) == ZN_OK && r.d == 6.0);
  CHECK(zn_native_call("Fixture", "add", "dd>d", a, &r, err, sizeof err) == -2 && std::strstr(err, "expects the signature 'dd>d'") && std::strstr(err, "has 'ii>i'"));
  CHECK(zn_native_call("Fixture", "nope", nullptr, a, &r, err, sizeof err) == -1);
  CHECK(zn_native_call("Nothing", "add", nullptr, a, &r, err, sizeof err) == -1);

  // a string in, a string out (valid after the call returns)
  a[0].s = ZnStr{"zinc", 4};
  CHECK(zn_native_call("Fixture", "greet", "s>s", a, &r, err, sizeof err) == ZN_OK && std::string(r.s.p, r.s.n) == "hello, zinc");

  // a byte array in, a byte array out
  const unsigned char bytes[] = {1, 2, 3, 250};
  a[0].v = ZnView{bytes, 4};
  CHECK(zn_native_call("Fixture", "sum", "B>i", a, &r, err, sizeof err) == ZN_OK && r.i == 256);
  CHECK(zn_native_call("Fixture", "reverse", "B>B", a, &r, err, sizeof err) == ZN_OK && r.v.n == 4 && static_cast<const unsigned char*>(r.v.p)[0] == 250 && static_cast<const unsigned char*>(r.v.p)[3] == 1);

  // an error: the message reaches the caller
  CHECK(zn_native_call("Fixture", "fail", nullptr, a, &r, err, sizeof err) == ZN_ERROR && std::string(err) == "the fixture failed on purpose");

  // a callback kept by the module and called from the engine's thread
  CHECK(zn_native_call("Fixture", "fire", nullptr, a, &r, err, sizeof err) == ZN_ERROR && std::string(err) == "no callback set");
  std::int64_t got = 0;
  E.callbacks[42] = [&](const ZnVal* v, std::uint32_t) { got = v[0].i; };
  a[0].h = 42;
  CHECK(zn_native_call("Fixture", "setCallback", "c(i>n)>n", a, &r, err, sizeof err) == ZN_OK);
  a[0].i = 21;
  CHECK(zn_native_call("Fixture", "fire", "i>n", a, &r, err, sizeof err) == ZN_OK && got == 42);

  // a post from another thread: the string is copied and arrives on drain
  std::string text;
  E.callbacks[42] = [&](const ZnVal* v, std::uint32_t n) { got = v[0].i; text = n == 2 ? std::string(v[1].s.p, v[1].s.n) : ""; };
  CHECK(zn_native_call("Fixture", "postFromThread", nullptr, a, &r, err, sizeof err) == ZN_OK);
  waitFor([&] { return !text.empty(); });
  CHECK(got == 7 && text == "from thread");
  CHECK(zn_native_pending() == 0);

  // a promise completed from a thread, and one rejected
  a[0].i = 5;
  CHECK(zn_native_call("Fixture", "later", "i>Pi", a, &r, err, sizeof err) == ZN_PENDING);
  std::uint64_t p1 = zn_native_last_promise();
  CHECK(p1 != 0 && zn_native_pending() > 0);   // the program must stay alive
  CHECK(zn_native_call("Fixture", "laterFail", ">Pi", a, &r, err, sizeof err) == ZN_PENDING);
  std::uint64_t p2 = zn_native_last_promise();
  CHECK(p2 != p1);
  waitFor([&] { return E.settled.count(p1) && E.settled.count(p2); });
  CHECK(E.settled[p1] == "ok:105" && E.settled[p2] == "err:later failed");
  CHECK(zn_native_pending() == 0);

  // resources: the engine's count, generations, and the finalizer
  a[0].i = 11;
  CHECK(zn_native_call("Fixture", "open", "i>R0", a, &r, err, sizeof err) == ZN_OK);
  ZnVal h = r;
  CHECK(h.h != 0);
  CHECK(zn_native_call("Fixture", "get", "R0>i", &h, &r, err, sizeof err) == ZN_OK && r.i == 11);
  CHECK(fixture_finalized == 0);
  CHECK(zn_native_call("Fixture", "close", "R0>n", &h, &r, err, sizeof err) == ZN_OK);
  CHECK(fixture_finalized == 1);                                                                  // finalized when the last reference went
  CHECK(zn_native_call("Fixture", "get", "R0>i", &h, &r, err, sizeof err) == ZN_ERROR);                  // the handle is stale now
  a[0].i = 12;
  CHECK(zn_native_call("Fixture", "open", "i>R0", a, &r, err, sizeof err) == ZN_OK);
  CHECK(r.h != h.h);                                                                              // another generation or slot
  ZnVal leftover = r;
  CHECK(zn_native_call("Fixture", "get", "R0>i", &leftover, &r, err, sizeof err) == ZN_OK && r.i == 12);

  // shutdown: the callback is released and the resource that was left is finalized
  zn_native_shutdown();
  CHECK(fixture_finalized == 2);
  CHECK(E.released == 1);
  CHECK(zn_native_find("Fixture", "add") == nullptr);

  std::printf(gFailed ? "native: %d failure(s)\n" : "native: all checks passed\n", gFailed);
  return gFailed ? 1 : 0;
}
