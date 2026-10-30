// display-shell: a Zinc shell (zinc:shell, plugins/shell: the Pi's player in shell mode) as the app's display (D194,
// docs/reports/zinc-shell/03-design.md §4). The app connects to the Unix socket ZINC_SHELL_SOCKET, says CONNECT, and the shell answers with
// BUFFERS: its surface size and four shared buffers (shm or dmabuf fds, both mapped the same way). Each frame writes its damage, plus what
// that buffer missed since it was last written, into a free buffer and sends FRAME; the shell RELEASEs a buffer when it leaves the screen.
// With no free buffer `present` waits on the socket: the shell paces the app, and an app that changes nothing sends nothing. The shell's
// INPUT is the app's pointer, keys, wheel and touches; QUIT and the socket closing end the app. The wire: plugins/display-remote/remote_proto.h.
#include "render_bands.h"
#include "hal.h"
#include "../display-remote/remote_proto.h"
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <poll.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <deque>
#include <string>
#include <vector>

#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

using namespace zremote;

namespace {
struct Box { int x0, y0, x1, y1; bool empty() const { return x1 <= x0 || y1 <= y0; } };
Box join(Box a, Box b) { return a.empty() ? b : b.empty() ? a : Box{a.x0 < b.x0 ? a.x0 : b.x0, a.y0 < b.y0 ? a.y0 : b.y0, a.x1 > b.x1 ? a.x1 : b.x1, a.y1 > b.y1 ? a.y1 : b.y1}; }

int fd = -1;
bool gone, quit;                              // gone: the socket closed or broke; quit: the shell (or Escape) asked the app to end
// the shell's buffers: generation `gen` changes with every BUFFERS (the earlier ones are unmapped, the app draws whole)
int W, H, nbuf, gen; uint32_t stride;
uint8_t* map[SH_MAX_BUFFERS]; size_t mapLen;
bool freeBuf[SH_MAX_BUFFERS];
Box stale[SH_MAX_BUFFERS];                    // what each buffer lacks of the frame: damage since it was last written
std::vector<uint32_t> stage;                  // the frame as the app drew it (render_damage keeps it); buffers are filled from it
bool full = true;                             // the next frame renders whole (new buffers)
// the reading side: bytes and the fds that came with them, in order
std::string in;
std::deque<int> fds;
// the shell's input, as src/host/mirror.cpp keeps a viewer's
struct {
  bool active; float x, y; uint8_t down, pbuttons; uint32_t mods, buttons; float wheel, wheelX;
  std::vector<HalKey> keys; std::string text; std::vector<HalButtonEvent> btn;
  int ntouch; HalTouch touch[HAL_MAX_TOUCH];
} rem;

void fail(const char* why) { fprintf(stderr, "display-shell: %s\n", why); gone = true; }
bool sendMsg(uint8_t type, const void* p, uint32_t n) {
  uint8_t h[5] = {type};
  put32(h + 1, n);
  std::string m((const char*)h, 5);
  m.append((const char*)p, n);
  for (size_t at = 0; at < m.size();) {
    const ssize_t w = send(fd, m.data() + at, m.size() - at, MSG_NOSIGNAL);
    if (w > 0) { at += (size_t)w; continue; }
    if (w < 0 && errno == EINTR) continue;
    if (w < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) { pollfd p{fd, POLLOUT, 0}; poll(&p, 1, 1000); continue; }
    fail("the shell left"); return false;
  }
  return true;
}
void unmap() {
  for (int i = 0; i < nbuf; i++) if (map[i]) munmap(map[i], mapLen);
  for (auto& m : map) m = nullptr;
  nbuf = 0;
}
float f32(const uint8_t* p) { float v; memcpy(&v, p, 4); return v; }

void buffers(const uint8_t* p, uint32_t n) {
  if (n < 14) return fail("BUFFERS too short");
  const int w = get16(p), h = get16(p + 2), k = p[13];
  const uint32_t st = get32(p + 4), fourcc = get32(p + 8);
  if ((int)fds.size() < k) return fail("BUFFERS came without its fds");
  std::vector<int> got(fds.begin(), fds.begin() + k);
  fds.erase(fds.begin(), fds.begin() + k);
  unmap();
  bool ok = fourcc == SH_XR24 && k >= 1 && k <= SH_MAX_BUFFERS && w > 0 && h > 0 && st >= (uint32_t)w * 4;
  if (!ok) fprintf(stderr, "display-shell: BUFFERS not usable (%dx%d, stride %u, fourcc %08x, %d buffers)\n", w, h, st, fourcc, k);
  // kind 1 (shm) and kind 0 (dmabuf) are both mapped as they are: XR24 linear, CPU-written
  for (int i = 0; ok && i < k; i++) {
    void* m = mmap(nullptr, (size_t)st * h, PROT_READ | PROT_WRITE, MAP_SHARED, got[i], 0);
    if (m == MAP_FAILED) { fprintf(stderr, "display-shell: cannot map buffer %d: %s\n", i, strerror(errno)); ok = false; break; }
    map[i] = (uint8_t*)m; nbuf = i + 1;
  }
  for (int f : got) close(f);
  if (!ok) { unmap(); gone = true; return; }
  W = w; H = h; stride = st; mapLen = (size_t)st * h; gen++;
  for (int i = 0; i < nbuf; i++) { freeBuf[i] = true; stale[i] = {0, 0, W, H}; }
  stage.assign((size_t)W * H, 0);
  full = true;
}
// INPUT: mirror.cpp's payload (x f32, y f32 in 0..1 of the surface, negative: not over it; down u8, pbuttons u8, mods u32, buttons u32,
// wheel f32, wheel_x f32, u16 keys of {key i32, mods u32, kind i32, text u16 + bytes}, u16 button events of {x f32, y f32, button i32, down i32}),
// then u8 touches of {id u8, x f32, y f32}, x and y in 0..1 too
void input(const uint8_t* p, uint32_t n) {
  if (n < 30) return;
  const float x = f32(p), y = f32(p + 4);
  if (x >= 0 && y >= 0) { rem.active = true; rem.x = x; rem.y = y; rem.down = p[8]; rem.pbuttons = p[9]; }
  rem.mods = get32(p + 10); rem.buttons = get32(p + 14);
  rem.wheel += f32(p + 18); rem.wheelX += f32(p + 22);
  uint32_t o = 28;
  for (uint16_t i = 0, k = get16(p + 26); i < k && o + 14 <= n; ++i) {
    HalKey key{(int32_t)get32(p + o), get32(p + o + 4), (int32_t)get32(p + o + 8), 0, get16(p + o + 12)};
    o += 14;
    if (o + key.len > n) return;
    key.off = (uint16_t)rem.text.size();
    rem.text.append((const char*)p + o, key.len);
    o += key.len;
    rem.keys.push_back(key);
  }
  if (o + 2 > n) return;
  o += 2;
  for (uint16_t i = 0, k = get16(p + o - 2); i < k && o + 16 <= n; ++i, o += 16)
    rem.btn.push_back(HalButtonEvent{f32(p + o), f32(p + o + 4), (int32_t)get32(p + o + 8), (int32_t)get32(p + o + 12)});
  if (o + 1 > n) return;   // a shell with no touch screen may leave the touches out
  const int t = p[o++];
  rem.ntouch = 0;
  for (int i = 0; i < t && o + 9 <= n; i++, o += 9)
    if (rem.ntouch < HAL_MAX_TOUCH) rem.touch[rem.ntouch++] = HalTouch{p[o], f32(p + o + 1), f32(p + o + 5)};
}
/** Reads what the shell sent and acts on each whole message; `block`: waits for at least one read first. */
void pump(bool block) {
  if (fd < 0 || gone) return;
  for (bool first = true;; first = false) {
    if (block && first) { pollfd p{fd, POLLIN, 0}; while (poll(&p, 1, -1) < 0 && errno == EINTR) {} }
    char b[4096];
    union { cmsghdr h; char space[CMSG_SPACE(sizeof(int) * SH_MAX_BUFFERS * 2)]; } ctl;
    iovec v{b, sizeof b};
    msghdr m{};
    m.msg_iov = &v; m.msg_iovlen = 1; m.msg_control = ctl.space; m.msg_controllen = sizeof ctl.space;
    const ssize_t r = recvmsg(fd, &m, MSG_DONTWAIT);
    if (r < 0 && errno == EINTR) continue;
    if (r < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) break;
    if (r <= 0) { fail("the shell closed the connection"); return; }
    for (cmsghdr* c = CMSG_FIRSTHDR(&m); c; c = CMSG_NXTHDR(&m, c))
      if (c->cmsg_level == SOL_SOCKET && c->cmsg_type == SCM_RIGHTS) {
        const int k = (int)((c->cmsg_len - CMSG_LEN(0)) / sizeof(int));
        for (int i = 0; i < k; i++) { int f; memcpy(&f, CMSG_DATA(c) + i * sizeof(int), sizeof f); fds.push_back(f); }
      }
    in.append(b, (size_t)r);
  }
  size_t off = 0;
  while (in.size() - off >= 5 && !gone) {
    const uint8_t* m = (const uint8_t*)in.data() + off;
    const uint32_t len = get32(m + 1);
    if (len > (1u << 20)) { fail("a message of the shell is too long: not the shell wire"); return; }
    if (in.size() - off < 5 + len) break;
    const uint8_t* p = m + 5;
    switch (m[0]) {
      case SH_BUFFERS: buffers(p, len); break;
      case SH_RELEASE: if (len >= 1 && p[0] < nbuf) freeBuf[p[0]] = true; break;
      case SH_INPUT: input(p, len); break;
      case SH_QUIT: quit = true; break;
      case PING: if (len >= 4) sendMsg(PONG, p, 4); break;
      default: break;   // a later version's message
    }
    off += 5 + len;
  }
  in.erase(0, off);
}
/** Connects and waits for the first BUFFERS (the surface size): the app cannot draw before it. No shell: says so and ends the program. */
void ensure() {
  if (fd >= 0) return;
  const char* path = getenv("ZINC_SHELL_SOCKET");
  sockaddr_un a{};
  a.sun_family = AF_UNIX;
  if (!path || !*path || strlen(path) >= sizeof a.sun_path) {
    fprintf(stderr, "display-shell: ZINC_SHELL_SOCKET is not set (or too long): ZINC_DISPLAY=shell draws into a Zinc shell, started by it\n");
    exit(1);
  }
  memcpy(a.sun_path, path, strlen(path));
  fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0 || connect(fd, (sockaddr*)&a, sizeof a) != 0) {
    fprintf(stderr, "display-shell: no Zinc shell at ZINC_SHELL_SOCKET=%s: %s\n", path, strerror(errno));
    exit(1);
  }
#ifdef SO_NOSIGPIPE
  const int one = 1;
  setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
  const char* name = getenv("ZINC_APP_NAME");
  if (!name || !*name) name = "zinc";
  std::string c(6, '\0');
  put16((uint8_t*)&c[0], SH_VERSION); put32((uint8_t*)&c[2], (uint32_t)getpid());
  c += name;
  sendMsg(SH_CONNECT, c.data(), (uint32_t)c.size());
  while (!nbuf && !gone && !quit) pump(true);
  if (quit && !gone) exit(0);   // replaced before it drew anything
  if (!nbuf) { fprintf(stderr, "display-shell: the shell at %s sent no buffers\n", path); exit(1); }
}

void s_size(int32_t* w, int32_t* h) { ensure(); if (nbuf) { *w = W; *h = H; } }
int s_init(const HalConfig*) { ensure(); return 1; }
// The frame is rasterized in bands of 16 rows on every core, as display-fbdev does (2026-10-31: one thread made an app under the shell
// up to four times slower than the same app on the screen itself). ZINC_RENDER_THREADS=1: one thread.
zbands::Pool& pool = *new zbands::Pool;
struct Band { const HalFrame* f; void (*fn)(uint32_t*, int32_t, int32_t); };
void band(void* p, int32_t a, int32_t b) { const Band* j = (const Band*)p; j->fn(stage.data() + (size_t)a * W, a, b); }
void render_bands(const HalFrame* f, void (*fn)(uint32_t*, int32_t, int32_t), int32_t y0, int32_t y1) {
  static bool started = false;
  if (!started) { started = true; pool.init(); }
  Band j{f, fn};
  pool.run(y0, y1, 16, band, &j);
}
void s_present(const HalFrame* f) {
  pump(false);
  if (gone || quit || !nbuf || f->w != W || f->h != H) return;   // another size: the runtime follows surface_size at the next frame
  Box d{f->x0, f->y0, f->x1, f->y1};
  if (full || f->move) { render_bands(f, f->render, 0, H); d = {0, 0, W, H}; full = false; }   // a scroll moved pixels the stage has not
  else if (!d.empty()) render_bands(f, f->render_damage ? f->render_damage : f->render, d.y0, d.y1);
  else return;   // nothing changed: nothing goes
  for (int i = 0; i < nbuf; i++) stale[i] = join(stale[i], d);
  const int g = gen;
  int b = -1;
  for (;;) {   // back-pressure: the shell releases a buffer when the next one is on the screen
    for (int i = 0; i < nbuf && b < 0; i++) if (freeBuf[i]) b = i;
    if (b >= 0) break;
    pump(true);
    if (gone || quit || gen != g) return;   // new buffers: all are stale, the next frame renders whole
  }
  const Box a = stale[b];
  for (int y = a.y0; y < a.y1; y++) memcpy(map[b] + (size_t)y * stride + (size_t)a.x0 * 4, stage.data() + (size_t)y * W + a.x0, (size_t)(a.x1 - a.x0) * 4);
  stale[b] = {0, 0, 0, 0};
  freeBuf[b] = false;
  // ponytail: one box of damage (the union HalFrame gives); the rectangle list (n <= 8) when a measurement asks for it (03-design §7.1)
  const bool whole = d.x0 == 0 && d.y0 == 0 && d.x1 == W && d.y1 == H;
  uint8_t m[10] = {(uint8_t)b, (uint8_t)(whole ? 0 : 1)};
  put16(m + 2, (uint16_t)d.x0); put16(m + 4, (uint16_t)d.y0); put16(m + 6, (uint16_t)(d.x1 - d.x0)); put16(m + 8, (uint16_t)(d.y1 - d.y0));
  sendMsg(SH_FRAME, m, whole ? 2 : 10);
}
void s_poll(HalInput* i) {
  static const bool budget = getenv("ZINC_FRAMES") != nullptr;   // the null HAL counts 60 frames for headless tests; here only ZINC_FRAMES does
  if (!budget) i->quit = 0;
  pump(false);
  const float sx = (float)W, sy = (float)H;
  if (rem.active) { i->px = rem.x * sx; i->py = rem.y * sy; i->pdown = rem.down; i->pbuttons = rem.pbuttons; }
  i->mods |= rem.mods;
  i->buttons |= rem.buttons;
  i->wheel += rem.wheel; i->wheel_x += rem.wheelX; rem.wheel = rem.wheelX = 0;
  for (const HalKey& k : rem.keys) {
    if (i->nkeys == HAL_MAX_KEYS || i->ntext + k.len > HAL_TEXT_BYTES) break;
    HalKey& o = i->keys[i->nkeys++];
    o = k;
    o.off = (uint16_t)i->ntext;
    memcpy(i->text + i->ntext, rem.text.data() + k.off, k.len);
    i->ntext += k.len;
  }
  for (const HalButtonEvent& b : rem.btn) if (i->nbtn < HAL_MAX_BUTTON_EVENTS) i->btn[i->nbtn++] = HalButtonEvent{b.x * sx, b.y * sy, b.button, b.down};
  rem.keys.clear(); rem.text.clear(); rem.btn.clear();
  i->ntouch = rem.ntouch;
  for (int k = 0; k < rem.ntouch; k++) i->touch[k] = HalTouch{rem.touch[k].id, rem.touch[k].x * sx, rem.touch[k].y * sy};
  if (gone || quit) i->quit = 1;
}
void s_shutdown() { unmap(); if (fd >= 0) close(fd); fd = -1; }
// Escape reaches the app (the shell keeps Home for itself); unhandled, it ends the app, not the shell
const char* s_device(const char* q, const char*) {
  if (!strcmp(q, "display.escapeByApp")) return "";
  if (!strcmp(q, "display.escape")) { quit = true; return ""; }
  return nullptr;
}

HalDisplay shell_display = {s_init, s_present, s_poll, s_shutdown, 0, 0, nullptr, nullptr, s_size, s_device, s_size};
int registered = hal_display_register(&shell_display, "shell");
}  // namespace
