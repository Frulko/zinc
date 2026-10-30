// zinc:shell for macos and linux (POSIX): docs/reports/zinc-shell/03-design.md §3-§5, the wire of plugins/display-remote/remote_proto.h (SH_*).
// One zrt::Poller, run by the event loop at each turn (no thread): it accepts on ZINC_SHELL_SOCKET, reads the apps' messages, reaps the apps
// it started and keeps the clocks (ping, the quit's grace, the 3 s to connect). The shown app's three buffers are shared memory; the
// runtime image wraps the buffer of its last FRAME (dyn_update_rect: the shell's frame damages only what the app changed). The input hook
// (zrt::shell_input, after the runtime's input merge) forwards the shown app's share of each frame's input and takes it out of the shell's.
#define ZRT_HOSTED_CPP   // std::string and std::vector: the standard placement new
#include "zinc_native_shell.h"
#include "zrt_raster.h"
#include "hal.h"
#include "mod/sock.h"
#include "../../display-remote/remote_proto.h"
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <vector>
#ifdef __APPLE__
#include <crt_externs.h>
#include <mach-o/dyld.h>
static char** env_now() { return *_NSGetEnviron(); }
#else
extern char** environ;
static char** env_now() { return environ; }
#endif

namespace zrt {
extern int32_t surf_w, surf_h, frame_no;
extern bool display_driver;
extern void (*shell_input)(HalInput* in);
}

using namespace zremote;
namespace {
zrt::String zs(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }
double now() { return zrt::now_ms(); }

/** The bar's height: round(H / 15) within 32..56; ZINC_SHELL_BAR=<px> overrides (0 and garbage are refused). */
int32_t bar_height() {
  if (const char* e = getenv("ZINC_SHELL_BAR"); e && *e) {
    const int v = atoi(e);
    if (v > 0 && v < zrt::surf_h) return v;
    static bool said = false;
    if (!said) { said = true; fprintf(stderr, "shell: ZINC_SHELL_BAR=%s refused (a height in pixels above 0 and below the screen's)\n", e); }
  }
  const int32_t b = (zrt::surf_h * 2 + 15) / 30;   // round(H / 15)
  return b < 32 ? 32 : b > 56 ? 56 : b;
}

// ---------------------------------------------------------------- the apps this shell started
struct Child { pid_t pid = 0; char name[64] = ""; std::string log, pidf; double started = 0; bool connected = false, screen = false; };
const int MAXC = 8;
Child kids[MAXC];
/** An end of a process group in progress: SIGTERM at `term`, SIGKILL at `kill` (0: done). */
struct Ending { pid_t group = 0; double term = 0, kill = 0; };
Ending endings[MAXC];
void end_group(pid_t group, double term_in, double kill_in) {
  if (group <= 1 || group == getpgrp()) return;
  for (Ending& e : endings) if (e.group == group) { e.term = now() + term_in; e.kill = now() + kill_in; return; }
  for (Ending& e : endings) if (!e.group) { e = Ending{group, now() + term_in, now() + kill_in}; return; }
  ::kill(-group, SIGKILL);   // no room to wait: at once
}
Child* kid_of(pid_t pid) {   // the started app a process belongs to (itself or its group)
  if (pid <= 0) return nullptr;
  const pid_t g = getpgid(pid);
  for (Child& k : kids) if (k.pid && (k.pid == pid || k.pid == g)) return &k;
  return nullptr;
}
bool can_suspend() { return zrt::display_driver && hal_display && hal_display->suspend; }

// ---------------------------------------------------------------- the client on the screen
struct Buf { int fd = -1; uint32_t* px = nullptr; size_t len = 0; };
struct Client {
  int fd = -1;
  bool connected = false;       // CONNECT received
  pid_t pid = 0;
  char title[128] = "";
  std::string in, out;
  Buf buf[SH_MAX_BUFFERS];
  int32_t w = 0, h = 0;         // the size of the buffers sent (0: none yet)
  int32_t shown = -1;           // the buffer the image shows
  struct { int32_t b; int32_t after; } held[SH_MAX_BUFFERS];   // buffers that left the image, released once frame `after` was presented
  int nheld = 0;
  int32_t img = -1;
  uint32_t ping = 0;
  double ping_at = 0, pong_at = 0;
};
Client shown, waiting;          // the app on the screen, and a connection that has not said CONNECT yet
uint32_t serial_no = 0;
std::string last_input;         // the last SH_INPUT sent: the same state is not sent again
bool app_press, was_down;       // the pointer's press started below the bar (the app's); the pointer was down at the last frame

void drop_buffers(Client& c) {
  if (c.img >= 0) { zrt::raster::dyn_destroy(c.img); serial_no++; }
  c.img = -1;
  for (Buf& b : c.buf) { if (b.px) munmap(b.px, b.len); if (b.fd >= 0) ::close(b.fd); b = Buf{}; }
  c.w = c.h = 0; c.shown = -1; c.nheld = 0;
}
void close_client(Client& c) {
  if (&c == &shown) { last_input.clear(); app_press = false; }
  drop_buffers(c);
  if (c.fd >= 0) ::close(c.fd);
  c = Client{};
}
void flush(Client& c) {
  while (c.fd >= 0 && !c.out.empty()) {
    const ssize_t n = ::send(c.fd, c.out.data(), c.out.size(), MSG_NOSIGNAL);
    if (n <= 0) return;   // full (or gone: the read sees it)
    c.out.erase(0, (size_t)n);
  }
}
void msg(Client& c, uint8_t type, const void* p, uint32_t n) {
  if (c.fd < 0 || c.out.size() > (1u << 20)) return;   // ponytail: an app that reads nothing loses input past 1 MB, the frames stay whole
  uint8_t h[5];
  h[0] = type; put32(h + 1, n);
  c.out.append((const char*)h, 5);
  c.out.append((const char*)p, n);
  flush(c);
}

/** Three shared buffers of w x h, sent with SH_BUFFERS. False: not now (output waiting) or no memory. */
bool send_buffers(Client& c, int32_t w, int32_t h) {
  flush(c);
  if (!c.out.empty()) return false;   // the fds ride on the message's first byte: nothing may be queued before it
  drop_buffers(c);
  const size_t len = (size_t)w * h * 4;
  for (int i = 0; i < SH_MAX_BUFFERS; i++) {
    Buf& b = c.buf[i];
#ifdef __linux__
    char name[64];
    snprintf(name, sizeof name, "/zinc-shell-%d-%d", (int)getpid(), i);
    b.fd = shm_open(name, O_RDWR | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
    if (b.fd >= 0) shm_unlink(name);
#else
    const char* tmp = getenv("TMPDIR");
    std::string t = std::string(tmp && *tmp ? tmp : "/tmp") + "/zinc-shell-XXXXXX";
    b.fd = mkstemp(&t[0]);
    if (b.fd >= 0) { unlink(t.c_str()); fcntl(b.fd, F_SETFD, FD_CLOEXEC); }
#endif
    void* m = b.fd >= 0 && ftruncate(b.fd, (off_t)len) == 0 ? mmap(nullptr, len, PROT_READ | PROT_WRITE, MAP_SHARED, b.fd, 0) : MAP_FAILED;
    if (m == MAP_FAILED) { fprintf(stderr, "shell: no shared memory for the app's buffers (%s)\n", strerror(errno)); drop_buffers(c); return false; }
    b.px = (uint32_t*)m; b.len = len;
  }
  uint8_t m[5 + 14];
  m[0] = SH_BUFFERS; put32(m + 1, 14);
  put16(m + 5, (uint16_t)w); put16(m + 7, (uint16_t)h); put32(m + 9, (uint32_t)w * 4); put32(m + 13, SH_XR24);
  m[17] = 1; m[18] = SH_MAX_BUFFERS;   // shm, three
  iovec io = {m, sizeof m};
  char ctl[CMSG_SPACE(sizeof(int) * SH_MAX_BUFFERS)];
  memset(ctl, 0, sizeof ctl);
  msghdr mh = {};
  mh.msg_iov = &io; mh.msg_iovlen = 1; mh.msg_control = ctl; mh.msg_controllen = sizeof ctl;
  cmsghdr* cm = CMSG_FIRSTHDR(&mh);
  cm->cmsg_level = SOL_SOCKET; cm->cmsg_type = SCM_RIGHTS; cm->cmsg_len = CMSG_LEN(sizeof(int) * SH_MAX_BUFFERS);
  for (int i = 0; i < SH_MAX_BUFFERS; i++) memcpy(CMSG_DATA(cm) + i * sizeof(int), &c.buf[i].fd, sizeof(int));
  const ssize_t n = sendmsg(c.fd, &mh, MSG_NOSIGNAL);
  if (n < 0) { drop_buffers(c); return false; }   // full: tried again at the next turn
  if ((size_t)n < sizeof m) c.out.append((const char*)m + n, sizeof m - n);   // the fds went with the first byte
  c.w = w; c.h = h;
  serial_no++;
  return true;
}

void release(Client& c, int32_t b) { uint8_t v = (uint8_t)b; msg(c, SH_RELEASE, &v, 1); }

/** FRAME: buffer b is complete; the image shows it now, only its damage is drawn again. */
void on_frame(Client& c, const uint8_t* p, uint32_t n) {
  if (n < 2 || c.w <= 0) return;
  const int32_t b = p[0], k = p[1];
  if (b >= SH_MAX_BUFFERS || k > SH_MAX_DAMAGE || n < 2u + 8u * k || !c.buf[b].px) return;
  int32_t x0 = 0, y0 = 0, x1 = c.w, y1 = c.h;
  if (k) {
    x0 = c.w; y0 = c.h; x1 = y1 = 0;
    for (int32_t i = 0; i < k; i++) {
      const uint8_t* r = p + 2 + 8 * i;
      const int32_t rx = get16(r), ry = get16(r + 2), rw = get16(r + 4), rh = get16(r + 6);
      x0 = rx < x0 ? rx : x0; y0 = ry < y0 ? ry : y0; x1 = rx + rw > x1 ? rx + rw : x1; y1 = ry + rh > y1 ? ry + rh : y1;
    }
    x0 = x0 < 0 ? 0 : x0; y0 = y0 < 0 ? 0 : y0; x1 = x1 > c.w ? c.w : x1; y1 = y1 > c.h ? c.h : y1;
  }
  if (c.img < 0) c.img = zrt::raster::dyn_wrap(c.w, c.h, c.buf[b].px, c.w);
  else if (x1 > x0 && y1 > y0) zrt::raster::dyn_update_rect(c.img, x0, y0, x1 - x0, y1 - y0, c.buf[b].px);
  else zrt::raster::dyn_update_rect(c.img, 0, 0, 0, 0, c.buf[b].px);
  if (c.shown >= 0 && c.shown != b) {
    // the buffer that was shown leaves the screen with the next frame the shell presents; until then it may still be read
    if (c.nheld < SH_MAX_BUFFERS) c.held[c.nheld++] = {c.shown, zrt::frame_no};
    else release(c, c.shown);
  }
  c.shown = b;
  serial_no++;
}

/** Takes the app's share of the frame's input out of `in` and sends it as SH_INPUT. */
void forward_input(HalInput* in);

void kill_now(Client& c) { if (Child* k = kid_of(c.pid)) end_group(k->pid, 0, 0); else if (c.pid > 0) end_group(getpgid(c.pid), 0, 0); }
}  // namespace

struct HostShell : NativeShell, zrt::Poller {
  zrt::Fn<void(zrt::String, int32_t)> exit_cb;
  int lfd = -1;
  std::string path;

  void exited(const char* name, int32_t status) {
    if (!exit_cb) return;
    zrt::Fn<void(zrt::String, int32_t)> f = exit_cb;
    f(zs(name), status);
    zrt::check_uncaught();
  }
  void listen_once() {
    if (lfd >= 0 || !path.empty()) return;
    // a program a shell shows (the player started from its own tile) is not a shell: it would take the socket of the one showing it
    if (const char* d = getenv("ZINC_DISPLAY"); d && !strcmp(d, "shell")) { path = "-"; return; }
    const char* e = getenv("ZINC_SHELL_SOCKET");
    if (e && *e) path = e;
    else { const char* r = getenv("ZINC_RUN"); path = std::string(r && *r ? r : "/run/zinc") + "/shell.sock"; }
    sockaddr_un a = {};
    a.sun_family = AF_UNIX;
    if (path.size() >= sizeof a.sun_path) { fprintf(stderr, "shell: socket path too long: %s\n", path.c_str()); return; }
    memcpy(a.sun_path, path.c_str(), path.size() + 1);
    lfd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (lfd < 0) return;
    fcntl(lfd, F_SETFD, FD_CLOEXEC);
    if (connect(lfd, (sockaddr*)&a, sizeof a) == 0) {   // another shell answers there: never take its socket
      fprintf(stderr, "shell: another shell listens on %s\n", path.c_str());
      ::close(lfd); lfd = -1; return;
    }
    ::close(lfd);
    lfd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (lfd < 0) return;
    fcntl(lfd, F_SETFD, FD_CLOEXEC);
    ::unlink(path.c_str());   // a shell that crashed left it
    const mode_t old = umask(077);   // mode 0600 from its creation
    const bool ok = bind(lfd, (sockaddr*)&a, sizeof a) == 0 && ::listen(lfd, 4) == 0;
    umask(old);
    if (!ok) { fprintf(stderr, "shell: cannot listen on %s: %s\n", path.c_str(), strerror(errno)); ::close(lfd); lfd = -1; return; }
    chmod(path.c_str(), 0600);
    zrt::sock::nonblock(lfd);
    fprintf(stderr, "shell: listening on %s\n", path.c_str());
  }

  /** The client shown is replaced or sent home: asked to quit, its group ended after the grace (2 s, then 1 s). */
  void leave(Client& c, uint8_t reason) {
    if (c.fd < 0) return;
    msg(c, SH_QUIT, &reason, 1);
    flush(c);
    const pid_t group = kid_of(c.pid) ? kid_of(c.pid)->pid : c.pid > 0 ? getpgid(c.pid) : 0;
    end_group(group, 2000, 3000);
    const bool ours = kid_of(c.pid) != nullptr;
    char title[128];
    memcpy(title, c.title, sizeof title);
    close_client(c);
    serial_no++;
    if (!ours && group > 0) exited(title, -1);   // not reaped here: its end is the connection's
  }

  // ---- the TS API
  int32_t start(zrt::String dirS, zrt::String nameS) override {
    listen_once();
    zrt::sock::CStr d(dirS), nm(nameS);
    const std::string dir = d.c(), name = nm.c();
    if (name.empty() || name.find('/') != std::string::npos || name.size() >= sizeof kids[0].name) { fprintf(stderr, "shell: bad app name '%s'\n", name.c_str()); return 0; }
    struct stat st;
    std::vector<std::string> argv;
    if (stat((dir + "/app.zapp").c_str(), &st) == 0) {
      const char* eng = getenv("ZINC_ENGINE");
      std::string self = eng && *eng ? eng : "";
      if (self.empty()) {
        char b[4096] = "";
#ifdef __APPLE__
        uint32_t sz = sizeof b;
        if (_NSGetExecutablePath(b, &sz) != 0) b[0] = 0;
#else
        const ssize_t r = readlink("/proc/self/exe", b, sizeof b - 1);
        b[r > 0 ? r : 0] = 0;
#endif
        self = b;
      }
      argv = {self, "run", dir + "/app.zapp"};
    } else if (stat((dir + "/run.sh").c_str(), &st) == 0) argv = {"/bin/sh", dir + "/run.sh"};
    else { fprintf(stderr, "shell: no app.zapp nor run.sh in %s\n", dir.c_str()); return 0; }
    int slot = -1;
    for (int i = 0; i < MAXC; i++) if (!kids[i].pid) { slot = i; break; }
    if (slot < 0) { fprintf(stderr, "shell: too many apps at once\n"); return 0; }
    const char* zh = getenv("ZINC_HOME");
    const char* hm = getenv("HOME");
    const std::string home = std::string(zh && *zh ? zh : std::string(hm ? hm : "") + "/.zinc") + "/agent";
    for (const char* sub : {"", "/logs", "/run"}) mkdir((home + sub).c_str(), 0700);
    Child& k = kids[slot];
    k = Child{};
    snprintf(k.name, sizeof k.name, "%s", name.c_str());
    k.log = home + "/logs/" + name + ".log"; k.pidf = home + "/run/" + name + ".pid";
    // the environment: the shell's, without what was its own (a test's shot and input, its display), with the shell's socket
    std::vector<std::string> env;
    for (char** e = env_now(); *e; e++) {
      static const char* const own[] = {"ZINC_DISPLAY=", "ZINC_SHELL_SOCKET=", "ZINC_SHOT=", "ZINC_SHOT_FRAMES=", "ZINC_INPUT=", "ZINC_FRAMES=", "ZINC_HEADLESS=", "ZINC_APP_NAME="};
      bool skip = false;
      for (const char* o : own) if (!strncmp(*e, o, strlen(o))) skip = true;
      if (!skip) env.push_back(*e);
    }
    env.push_back("ZINC_DISPLAY=shell");
    env.push_back("ZINC_SHELL_SOCKET=" + path);
    env.push_back("ZINC_APP_NAME=" + name);   // display-shell's CONNECT names the app with it
    std::vector<char*> av, ev;
    for (std::string& s : argv) av.push_back(&s[0]);
    av.push_back(nullptr);
    for (std::string& s : env) ev.push_back(&s[0]);
    ev.push_back(nullptr);
    const int log = ::open(k.log.c_str(), O_WRONLY | O_CREAT | O_TRUNC | O_APPEND | O_CLOEXEC, 0600);
    const int null = ::open("/dev/null", O_RDONLY | O_CLOEXEC);
    if (log < 0 || null < 0) { fprintf(stderr, "shell: cannot open %s\n", k.log.c_str()); if (log >= 0) ::close(log); if (null >= 0) ::close(null); k = Child{}; return 0; }
    const pid_t pid = fork();
    if (pid == 0) {   // only async-signal-safe calls from here: the shell has threads
      setsid();
      dup2(null, 0); dup2(log, 1); dup2(log, 2);
      signal(SIGPIPE, SIG_DFL);
      if (chdir(dir.c_str()) != 0) _exit(126);
      execve(av[0], av.data(), ev.data());
      _exit(127);
    }
    ::close(log); ::close(null);
    if (pid < 0) { fprintf(stderr, "shell: cannot start %s: %s\n", name.c_str(), strerror(errno)); k = Child{}; return 0; }
    k.pid = pid; k.started = now();
    if (FILE* f = fopen(k.pidf.c_str(), "w")) { fprintf(f, "%d\n0\n", (int)pid); fclose(f); chmod(k.pidf.c_str(), 0600); }
    return pid;
  }
  void home() override {
    if (shown.fd >= 0) { leave(shown, 0); return; }
    for (Child& k : kids) if (k.pid && !k.connected) end_group(k.pid, 0, 1000);   // one that never connected: no one to ask
  }
  zrt::String current() override {
    if (shown.fd < 0 || !shown.connected) return zs("");
    Child* k = kid_of(shown.pid);
    return zs(k ? k->name : shown.title);
  }
  zrt::String title() override { return zs(shown.fd >= 0 ? shown.title : ""); }
  int32_t image() override { return shown.fd >= 0 ? shown.img : -1; }
  int32_t barHeight() override { return bar_height(); }
  bool responding() override { return shown.fd < 0 || now() - shown.pong_at < 6000; }
  int32_t serial() override { return (int32_t)serial_no; }
  void onExit(zrt::Fn<void(zrt::String, int32_t)> f) override { exit_cb = f; listen_once(); }

  // ---- the loop
  /** Complete messages of `c`; false on a protocol error. */
  bool parse(Client& c) {
    size_t off = 0;
    while (c.in.size() - off >= 5) {
      const uint8_t* m = (const uint8_t*)c.in.data() + off;
      const uint32_t n = get32(m + 1);
      if (n > 4096) return false;
      if (c.in.size() - off < 5 + n) break;
      const uint8_t* p = m + 5;
      if (m[0] == SH_CONNECT && n >= 6 && !c.connected) {
        if (get16(p) != SH_VERSION) { fprintf(stderr, "shell: an app of wire version %u (this shell speaks %u)\n", get16(p), SH_VERSION); return false; }
        c.connected = true;
        c.pid = (pid_t)get32(p + 2);
        const uint32_t k = n - 6 < sizeof c.title - 1 ? n - 6 : sizeof c.title - 1;
        memcpy(c.title, p + 6, k); c.title[k] = 0;
        c.pong_at = c.ping_at = now();
        if (Child* kid = kid_of(c.pid)) kid->connected = true;
      } else if (m[0] == SH_FRAME && c.connected) on_frame(c, p, n);
      else if (m[0] == PONG && n >= 4) { if (get32(p) == c.ping) c.pong_at = now(); }
      off += 5 + n;
    }
    c.in.erase(0, off);
    return true;
  }
  /** Reads what `c` sent; false when it is gone. */
  bool receive(Client& c) {
    char b[4096];
    for (;;) {
      const ssize_t n = ::recv(c.fd, b, sizeof b, 0);
      if (n > 0) { c.in.append(b, (size_t)n); if (c.in.size() > 65536) return false; continue; }
      if (n == 0 || (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR)) return false;
      break;
    }
    return parse(c);
  }
  /** The shown client left (EOF, bad data): its picture goes; the end of an app this shell started is reported when it is reaped. */
  void lost(Client& c) {
    const bool ours = kid_of(c.pid) != nullptr;
    char title[128];
    memcpy(title, c.title, sizeof title);
    const bool was = c.connected;
    close_client(c);
    serial_no++;
    if (was && !ours) exited(title, -1);
  }

  bool poll() override {
    listen_once();
    const double t = now();
    // new connections: the latest one waits for its CONNECT
    for (;;) {
      if (lfd < 0) break;
      const int fd = accept(lfd, nullptr, nullptr);
      if (fd < 0) break;
      fcntl(fd, F_SETFD, FD_CLOEXEC);
      zrt::sock::nonblock(fd);
      zrt::sock::nosigpipe(fd);
      close_client(waiting);
      waiting.fd = fd;
      waiting.ping_at = t;   // the time it came: 5 s to say CONNECT
    }
    if (waiting.fd >= 0) {
      if (!receive(waiting) || (!waiting.connected && t - waiting.ping_at > 5000)) close_client(waiting);
      else if (waiting.connected) {
        if (shown.fd >= 0) leave(shown, 1);   // one app on the screen: the new one replaces it
        shown = waiting;
        waiting = Client{};
        serial_no++;
        fprintf(stderr, "shell: %s connected (pid %d)\n", shown.title, (int)shown.pid);
      }
    }
    if (shown.fd >= 0) {
      if (!receive(shown)) lost(shown);
      else {
        const int32_t bar = bar_height(), w = zrt::surf_w, h = zrt::surf_h - bar;
        if (w > 0 && h > 0 && (shown.w != w || shown.h != h)) send_buffers(shown, w, h);
        for (int i = 0; i < shown.nheld;) {
          if (zrt::frame_no > shown.held[i].after) { release(shown, shown.held[i].b); shown.held[i] = shown.held[--shown.nheld]; }
          else i++;
        }
        if (t - shown.ping_at >= 2000) { shown.ping_at = t; uint8_t s[4]; put32(s, ++shown.ping); msg(shown, PING, s, 4); }
        flush(shown);
      }
    }
    // the apps started here: reaped, given the screen when they never connect
    for (Child& k : kids) {
      if (!k.pid) continue;
      int status = 0;
      const pid_t r = waitpid(k.pid, &status, WNOHANG);
      if (r == k.pid) {
        const int32_t code = WIFEXITED(status) ? WEXITSTATUS(status) : 128 + (WIFSIGNALED(status) ? WTERMSIG(status) : 0);
        if (FILE* f = fopen(k.log.c_str(), "a")) { fprintf(f, "[exited %d]\n", (int)code); fclose(f); }
        ::unlink(k.pidf.c_str());
        if (k.screen && can_suspend()) hal_display->suspend(0);
        if (shown.fd >= 0 && kid_of(shown.pid) == &k) close_client(shown), serial_no++;
        char name[64];
        memcpy(name, k.name, sizeof name);
        const pid_t pid = k.pid;
        k = Child{};
        for (Ending& e : endings) if (e.group == pid) e = Ending{};
        exited(name, code);
        continue;
      }
      if (!k.connected && !k.screen && t - k.started >= 3000) {
        k.screen = true;
        fprintf(stderr, "shell: %s did not connect within 3 s: it gets the screen until it ends\n", k.name);
        if (can_suspend()) hal_display->suspend(1);
      }
    }
    for (Ending& e : endings) {
      if (!e.group) continue;
      if (::kill(e.group, 0) != 0 && errno == ESRCH && ::kill(-e.group, 0) != 0) { e = Ending{}; continue; }
      if (e.term && t >= e.term) { ::kill(-e.group, SIGTERM); e.term = 0; }
      if (t >= e.kill) { ::kill(-e.group, SIGKILL); e = Ending{}; }
    }
    bool busy = shown.fd >= 0 || waiting.fd >= 0;
    for (Child& k : kids) busy = busy || k.pid;
    return busy;
  }
  void shutdown() override {
    exit_cb = nullptr;
    if (shown.fd >= 0) leave(shown, 2);
    close_client(waiting);
    for (Child& k : kids) if (k.pid) { ::kill(-k.pid, SIGTERM); ::unlink(k.pidf.c_str()); k = Child{}; }   // the apps go with the shell
    if (lfd >= 0) { ::close(lfd); ::unlink(path.c_str()); }
    lfd = -1;
    zrt::shell_input = nullptr;
  }
};

namespace {
HostShell* the;
void put_f32(std::string& s, float v) { char b[4]; memcpy(b, &v, 4); s.append(b, 4); }
void put_u32(std::string& s, uint32_t v) { char b[4]; put32((uint8_t*)b, v); s.append(b, 4); }
void put_u16(std::string& s, uint16_t v) { char b[2]; put16((uint8_t*)b, v); s.append(b, 2); }

void forward_input(HalInput* in) {
  Client& c = shown;
  if (c.fd < 0 || !c.connected || c.w <= 0) { app_press = was_down = false; return; }
  const float bar = (float)bar_height(), W = (float)zrt::surf_w, H = (float)c.h;
  const bool down = in->pdown != 0;
  if (down && !was_down) app_press = in->py >= bar;   // a press belongs to where it started until it is let go
  const bool to_app = app_press || (!down && in->py >= bar);
  auto nx = [&](float x) { const float v = x / W; return v < 0 ? 0 : v > 1 ? 1 : v; };
  auto ny = [&](float y) { const float v = (y - bar) / H; return v < 0 ? 0 : v > 1 ? 1 : v; };
  // the keys: the app's, but for the shell's own (Home, Ctrl+Alt+Backspace)
  std::string keys;
  uint16_t nkeys = 0;
  bool go_home = false, kill = false;
  for (int32_t i = 0; i < in->nkeys; i++) {
    const HalKey& k = in->keys[i];
    if (k.key == HAL_KEY_BROWSER_HOME) { go_home = go_home || k.kind == HAL_KEY_DOWN; continue; }
    if (k.key == HAL_KEY_BACKSPACE && (k.mods & HAL_MOD_CTRL) && (k.mods & HAL_MOD_ALT)) { kill = kill || k.kind == HAL_KEY_DOWN; continue; }
    const uint16_t len = k.kind == HAL_KEY_TEXT && k.off + k.len <= in->ntext ? k.len : 0;
    put_u32(keys, (uint32_t)k.key); put_u32(keys, k.mods); put_u32(keys, (uint32_t)k.kind); put_u16(keys, len);
    keys.append(in->text + k.off, len);
    nkeys++;
  }
  in->nkeys = 0; in->ntext = 0;
  // pointer button events of a press that is the app's
  std::string btns;
  uint16_t nb = 0;
  int32_t kept = 0;
  for (int32_t i = 0; i < in->nbtn; i++) {
    const HalButtonEvent& b = in->btn[i];
    if (app_press || (!down && b.y >= bar) || (b.down && b.y >= bar)) {
      put_f32(btns, nx(b.x)); put_f32(btns, ny(b.y)); put_u32(btns, (uint32_t)b.button); put_u32(btns, (uint32_t)b.down);
      nb++;
    } else in->btn[kept++] = b;
  }
  in->nbtn = kept;
  // touches below the bar
  std::string touches;
  uint8_t nt = 0;
  int32_t tk = 0;
  for (int32_t i = 0; i < in->ntouch; i++) {
    const HalTouch& t = in->touch[i];
    if (t.y >= bar || app_press) { touches += (char)(uint8_t)t.id; put_f32(touches, nx(t.x)); put_f32(touches, ny(t.y)); nt++; }
    else in->touch[tk++] = t;
  }
  in->ntouch = tk;
  std::string m;
  put_f32(m, to_app ? nx(in->px) : -1); put_f32(m, to_app ? ny(in->py) : -1);
  m += (char)(app_press && down ? 1 : 0);
  m += (char)(app_press ? (uint8_t)in->pbuttons : 0);
  put_u32(m, in->mods); put_u32(m, in->buttons);
  put_f32(m, to_app ? in->wheel : 0); put_f32(m, to_app ? in->wheel_x : 0);
  put_u16(m, nkeys); m += keys;
  put_u16(m, nb); m += btns;
  m += (char)nt; m += touches;
  const bool events = nkeys || nb || (to_app && (in->wheel != 0 || in->wheel_x != 0));
  in->buttons = 0;   // the keys' and the gamepads' buttons are the app's
  if (to_app) { in->wheel = 0; in->wheel_x = 0; in->scroll_dx = in->scroll_dy = 0; in->scroll_phase = 0; }
  if (app_press) { in->pdown = 0; in->pbuttons = 0; }   // the shell's program never sees a press of the app's
  if (!down) app_press = false;
  was_down = down;
  if (m != last_input || events) { last_input = m; msg(c, SH_INPUT, m.data(), (uint32_t)m.size()); }
  if (go_home && the) the->home();
  if (kill) kill_now(c);
}
}  // namespace

NativeShell* zinc_create_Shell() {
  static HostShell s;
  s.rc = zrt::IMMORTAL;
  the = &s;
  signal(SIGPIPE, SIG_IGN);
  zrt::add_poller(&s);
  zrt::shell_input = forward_input;
  s.listen_once();
  return &s;
}
