#include "zrt.h"
#include "mod/sys.h"
#include <stdlib.h>
#include <string.h>
#ifndef ZRT_PLATFORM
#define ZRT_PLATFORM "unknown"
#endif
// POSIX hosts (macos, linux, rpi1, rmpp): signals, pids, cwd, stdin
#if (defined(__APPLE__) || defined(__linux__)) && !defined(__EMSCRIPTEN__)
#define ZRT_SYS_POSIX 1
#include <signal.h>
#include <unistd.h>
#include <poll.h>
#include <errno.h>
#endif
#if defined(ESP_PLATFORM)
#include "esp_random.h"
#elif defined(__linux__) || defined(__EMSCRIPTEN__)
#include <unistd.h>
#include <sys/random.h>
#endif
#ifdef __APPLE__
#include <crt_externs.h>
static char** env_now() { return *_NSGetEnviron(); }
#elif defined(ZRT_SYS_POSIX)
extern char** environ;
static char** env_now() { return environ; }
#endif

namespace zrt {
extern int zrt_argc;
extern char** zrt_argv;
namespace sys {
struct CStr { StrBuilder sb; CStr(const String& s) { to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };
static String str(const char* s) { return String::from(s, (uint32_t)strlen(s)); }

Array<String> args() {
  Array<String> r = Array<String>::with_cap(0);
  for (int i = 1; i < zrt_argc; i++) r.push(str(zrt_argv[i]));
  return r;
}
String env(const String& name) {
  CStr n(name);
  const char* v = getenv(n.c());
  return v ? str(v) : String();
}
void exit(int32_t code) { hal_shutdown(); ::exit(code); }
String platform() { return str(ZRT_PLATFORM); }
double clock() { return now_ms(); }
int32_t liveObjects() { return (int32_t)live_objects; }
int32_t allocations() { return (int32_t)alloc_count; }

// ---------- bytes ----------
Array<uint8_t> randomBytes(int32_t n) {
  Array<uint8_t> r = Array<uint8_t>::with_cap(n < 0 ? 0 : n);
  for (int32_t i = 0; i < n; i++) r.push_raw(0);
  if (n <= 0) return r;
  uint8_t* p = r.a->data;
#if defined(__APPLE__)
  arc4random_buf(p, (size_t)n);
#elif defined(ESP_PLATFORM)
  esp_fill_random(p, (size_t)n);
#elif defined(__linux__) || defined(__EMSCRIPTEN__)
  for (int32_t off = 0; off < n;) {  // getentropy: at most 256 bytes per call
    int32_t k = n - off > 256 ? 256 : n - off;
    if (getentropy(p + off, (size_t)k) != 0) panic("getentropy failed");
    off += k;
  }
#else
  // ponytail: no entropy source (ps1, ps2): xorshift32 seeded from the clock, not cryptographic
  static uint32_t x = 0;
  if (!x) x = (uint32_t)hal_time_us() | 1u;
  for (int32_t i = 0; i < n; i++) { x ^= x << 13; x ^= x >> 17; x ^= x << 5; p[i] = (uint8_t)x; }
#endif
  return r;
}
Array<uint8_t> utf8Encode(const String& s) {
  uint32_t n = s.bytes();
  Array<uint8_t> r = Array<uint8_t>::with_cap((int32_t)n);
  if (n) __builtin_memcpy(r.a->data, s.ptr(), n);
  r.a->len = (int32_t)n;
  return r;
}
// WHATWG UTF-8 decode: each maximal invalid subpart becomes one U+FFFD (what TextDecoder does)
String utf8Decode(const Array<uint8_t>& b) {
  int32_t n = b.length();
  const uint8_t* d = n ? b.a->data : nullptr;
  StrBuilder sb;
  static const char FFFD[3] = {(char)0xEF, (char)0xBF, (char)0xBD};
  int32_t i = 0;
  while (i < n) {
    uint8_t c = d[i];
    if (c < 0x80) { sb.ch((char)c); i++; continue; }
    int32_t need; uint8_t lo = 0x80, hi = 0xBF;
    if (c >= 0xC2 && c <= 0xDF) need = 1;
    else if (c >= 0xE0 && c <= 0xEF) { need = 2; if (c == 0xE0) lo = 0xA0; if (c == 0xED) hi = 0x9F; }
    else if (c >= 0xF0 && c <= 0xF4) { need = 3; if (c == 0xF0) lo = 0x90; if (c == 0xF4) hi = 0x8F; }
    else { sb.raw(FFFD, 3); i++; continue; }
    int32_t j = 1;
    for (; j <= need; j++) {
      if (i + j >= n) break;
      uint8_t x = d[i + j];
      if (x < lo || x > hi) break;
      lo = 0x80; hi = 0xBF;
    }
    if (j > need) { sb.raw((const char*)d + i, (uint32_t)need + 1); i += need + 1; }
    else { sb.raw(FFFD, 3); i += j; }
  }
  return sb.build();
}

// ---------- process ----------
#ifdef ZRT_SYS_POSIX
static const char* const SIGNAMES[] = {"SIGHUP", "SIGINT", "SIGQUIT", "SIGUSR1", "SIGUSR2", "SIGTERM", "SIGWINCH", "SIGCHLD", "SIGALRM", "SIGPIPE", "SIGCONT", "SIGTSTP"};
static const int SIGNUMS[] = {SIGHUP, SIGINT, SIGQUIT, SIGUSR1, SIGUSR2, SIGTERM, SIGWINCH, SIGCHLD, SIGALRM, SIGPIPE, SIGCONT, SIGTSTP};
static const int NSIG_ = (int)(sizeof SIGNUMS / sizeof SIGNUMS[0]);
static int signum(const String& name) {
  CStr n(name);
  for (int i = 0; i < NSIG_; i++) if (!strcmp(n.c(), SIGNAMES[i]) || !strcmp(n.c(), SIGNAMES[i] + 3)) return SIGNUMS[i];
  if (!strcmp(n.c(), "SIGKILL") || !strcmp(n.c(), "KILL")) return SIGKILL;
  return 0;
}
static volatile sig_atomic_t pending[64];
static void on_signal(int s) { if (s > 0 && s < 64) pending[s] = 1; }
// Signal handlers run on the event loop: the OS handler only sets a flag, this poller calls the Zinc callbacks.
// It never keeps the loop alive by itself (like Node's process.on('SIGINT')).
struct Signals : Poller {
  Array<Fn<void()>> cbs[64];
  bool poll() override {
    for (int s = 1; s < 64; s++) {
      if (!pending[s]) continue;
      pending[s] = 0;
      Array<Fn<void()>> l = cbs[s];
      for (int32_t i = 0; l.a && i < l.length(); i++) { Fn<void()> f = l.get(i); f(); check_uncaught(); drain_microtasks(); }
    }
    return false;
  }
  void shutdown() override { for (auto& a : cbs) a = Array<Fn<void()>>(); }
};
static Signals* signals = nullptr;
void onSignal(const String& name, Fn<void()> cb) {
  int s = signum(name);
  if (s <= 0 || s == SIGKILL) { g_err = make<Error>(cat(str("sys.onSignal: unknown or uncatchable signal "), name)); return; }
  if (!signals) { signals = new (alloc(sizeof(Signals))) Signals(); add_poller(signals); }
  if (!signals->cbs[s].a) {
    signals->cbs[s] = Array<Fn<void()>>::with_cap(1);
    struct sigaction sa; memset(&sa, 0, sizeof sa);
    sa.sa_handler = on_signal; sigemptyset(&sa.sa_mask);
    sigaction(s, &sa, nullptr);
  }
  signals->cbs[s].push(cb);
}
bool kill(int32_t pid, const String& name) {
  int s = signum(name);
  if (s <= 0) { g_err = make<Error>(cat(str("sys.kill: unknown signal "), name)); return false; }
  return ::kill((pid_t)pid, s) == 0;
}
int32_t pid() { return (int32_t)getpid(); }
String cwd() { char b[4096]; return getcwd(b, sizeof b) ? str(b) : String(); }
bool chdir(const String& dir) { CStr d(dir); return ::chdir(d.c()) == 0; }
void setEnv(const String& name, const String& value) { CStr n(name), v(value); setenv(n.c(), v.c(), 1); }
void unsetEnv(const String& name) { CStr n(name); unsetenv(n.c()); }
Array<String> envKeys() {
  Array<String> r = Array<String>::with_cap(0);
  for (char** e = env_now(); *e; e++) { const char* eq = strchr(*e, '='); r.push(String::from(*e, eq ? (uint32_t)(eq - *e) : (uint32_t)strlen(*e))); }
  return r.sort([](const String& a, const String& b) { return (double)str_cmp(a, b); });
}
bool isatty(int32_t fd) { return ::isatty(fd) == 1; }
void write(const String& s) { hal_log(s.ptr(), s.bytes()); }
void writeErr(const String& s) { hal_log_err(s.ptr(), s.bytes()); }

// stdin: poll(2) with no timeout on every loop iteration; keeps the loop alive until EOF
struct Stdin : Poller {
  Fn<void(String)> cb;
  char tail[4]; int ntail = 0;
  bool done = false;
  bool poll() override {
    if (done || !cb) return false;
    for (;;) {
      struct pollfd p = {0, POLLIN, 0};
      if (::poll(&p, 1, 0) <= 0) return true;
      char buf[8192];
      memcpy(buf, tail, (size_t)ntail);
      ssize_t n = read(0, buf + ntail, sizeof buf - (size_t)ntail);
      if (n < 0 && errno == EINTR) continue;
      if (n <= 0) {
        done = true;
        Fn<void(String)> f = cb;
        if (ntail) f(String::from(tail, (uint32_t)ntail));
        f(String());
        check_uncaught();
        cb = nullptr;
        return false;
      }
      int total = ntail + (int)n, keep = total;
      for (int k = 1; k <= 3 && k <= total; k++) {  // keep a UTF-8 sequence split across reads for the next chunk
        unsigned char c = (unsigned char)buf[total - k];
        if ((c & 0xC0) != 0x80) { int len = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 1; if (len > k) keep = total - k; break; }
      }
      ntail = total - keep;
      memcpy(tail, buf + keep, (size_t)ntail);
      Fn<void(String)> f = cb;
      if (keep) { f(String::from(buf, (uint32_t)keep)); check_uncaught(); }
    }
  }
  void shutdown() override { cb = nullptr; }
};
static Stdin* stdin_poller = nullptr;
void onStdin(Fn<void(String)> cb) {
  if (!stdin_poller) { stdin_poller = new (alloc(sizeof(Stdin))) Stdin(); add_poller(stdin_poller); }
  stdin_poller->cb = cb;
}
#else
// no processes, signals or terminal on this target (esp32, ps1, ps2, wasm)
void onSignal(const String&, Fn<void()>) {}
bool kill(int32_t, const String&) { return false; }
int32_t pid() { return 0; }
String cwd() { return str("/"); }
bool chdir(const String&) { return false; }
void setEnv(const String&, const String&) {}
void unsetEnv(const String&) {}
Array<String> envKeys() { return Array<String>::with_cap(0); }
bool isatty(int32_t) { return false; }
void write(const String& s) { hal_log(s.ptr(), s.bytes()); }
void writeErr(const String& s) { hal_log_err(s.ptr(), s.bytes()); }
void onStdin(Fn<void(String)> cb) { cb(String()); }
#endif
}}
