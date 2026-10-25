// The live screen of `zinc device <device> screen --live` (src/agent/live.cpp), in the program that shows it. The agent names a Unix socket
// in <dir of ZINC_SHOT_REQUEST>/live.request; the program that presents frames connects to it (the one on the screen: a player that gave
// the screen to an app presents nothing until it is back) and streams its frames there with the protocol of display-remote (HELLO, then
// the damaged rectangle of each frame, RLE, at most two frames waiting for their ACK), while the screen keeps its own display. The viewer's
// input comes back as INPUT messages, merged into what the HAL and the display driver read. Nothing runs while no viewer asks.
#include "hal.h"
#ifndef _WIN32
#include "../../plugins/display-remote/remote_proto.h"
#include "zn/log.h"
#include <cerrno>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <string>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <vector>
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

namespace zrt {
extern void (*mirror_present)(const HalFrame* f);
extern void (*mirror_input)(HalInput* in);
extern void (*first_present)();
extern int32_t surf_w, surf_h;
}

namespace zn::host {
namespace {
using namespace zremote;
constexpr uint8_t INPUT = 22;   // viewer -> program: the viewer's HalInput since its last message (live.cpp writes it)

std::string request, target;    // the request file, the socket it names now
int fd = -1;
uint64_t checked, tried;
int W, H;
std::vector<uint32_t> fb, tmp;
bool full;
int dx0, dy0, dx1, dy1;
uint32_t seq, acked;
std::string out, in;
// the viewer's input not yet given to the program, and the pointer it holds
struct Remote { bool active; float x, y; int32_t down; uint32_t pbuttons, mods, buttons; float wheel, wheelX; std::vector<HalKey> keys; std::string text; std::vector<HalButtonEvent> btn; } rem;
float localX = -1, localY = -1, wroteX = -1, wroteY = -1;   // the screen's own pointer last seen, and the viewer's last written
int32_t localDown, wroteDown;
bool localSeen;

void drop() { if (fd >= 0) ::close(fd); fd = -1; out.clear(); in.clear(); rem = Remote{}; }
void msg(uint8_t type, const void* p, uint32_t n) {
  uint8_t h[5] = {type};
  put32(h + 1, n);
  out.append(reinterpret_cast<const char*>(h), 5).append(static_cast<const char*>(p), n);
}
void flush() {
  while (fd >= 0 && !out.empty()) {
    const ssize_t w = ::send(fd, out.data(), out.size(), MSG_NOSIGNAL);
    if (w > 0) { out.erase(0, static_cast<size_t>(w)); continue; }
    if (w < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return;
    drop();
  }
}
// The request names the socket of the viewer that waits; read twice a second, and a refused connection is tried again every 2 s.
void check() {
  const uint64_t now = hal_time_us();
  if (now - checked < 500000) return;
  checked = now;
  std::string name;
  if (FILE* f = std::fopen(request.c_str(), "rb")) {
    char b[512];
    name.assign(b, std::fread(b, 1, sizeof b, f));
    std::fclose(f);
  }
  while (!name.empty() && (name.back() == '\n' || name.back() == '\r')) name.pop_back();
  if (name != target) { drop(); target = name; tried = 0; }
  if (fd >= 0 || target.empty() || target.size() >= sizeof(sockaddr_un{}.sun_path) || (tried && now - tried < 2000000)) return;
  tried = now;
  const int s = ::socket(AF_UNIX, SOCK_STREAM, 0);
  sockaddr_un a{};
  a.sun_family = AF_UNIX;
  std::memcpy(a.sun_path, target.c_str(), target.size());
  if (s < 0 || ::connect(s, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0) { if (s >= 0) ::close(s); return; }
  ::fcntl(s, F_SETFL, ::fcntl(s, F_GETFL, 0) | O_NONBLOCK);
  ::fcntl(s, F_SETFD, FD_CLOEXEC);
#ifdef SO_NOSIGPIPE
  const int one = 1;
  ::setsockopt(s, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
  fd = s;
  W = H = 0;   // HELLO with the next frame
}
float f32(const uint8_t* p) { float v; std::memcpy(&v, p, 4); return v; }
// INPUT: x f32, y f32 (0..1 of the screen; negative: the pointer is not over it), down u8, pbuttons u8, mods u32, buttons u32, wheel f32,
// wheel_x f32, then u16 keys of {key i32, mods u32, kind i32, text u16 + bytes}, then u16 button events of {x f32, y f32, button i32, down i32}
void input(const uint8_t* p, uint32_t n) {
  if (n < 30) return;
  const float x = f32(p), y = f32(p + 4);
  if (x >= 0 && y >= 0) { rem.active = true; rem.x = x; rem.y = y; rem.down = p[8]; rem.pbuttons = p[9]; }
  rem.mods = get32(p + 10); rem.buttons = get32(p + 14);
  rem.wheel += f32(p + 18); rem.wheelX += f32(p + 22);
  uint32_t o = 28;
  for (uint16_t i = 0, k = get16(p + 26); i < k && o + 14 <= n; ++i) {
    HalKey key{static_cast<int32_t>(get32(p + o)), get32(p + o + 4), static_cast<int32_t>(get32(p + o + 8)), 0, get16(p + o + 12)};
    o += 14;
    if (o + key.len > n) return;
    key.off = static_cast<uint16_t>(rem.text.size());
    rem.text.append(reinterpret_cast<const char*>(p + o), key.len);
    o += key.len;
    rem.keys.push_back(key);
  }
  if (o + 2 > n) return;
  o += 2;
  for (uint16_t i = 0, k = get16(p + o - 2); i < k && o + 16 <= n; ++i, o += 16)
    rem.btn.push_back(HalButtonEvent{f32(p + o), f32(p + o + 4), static_cast<int32_t>(get32(p + o + 8)), static_cast<int32_t>(get32(p + o + 12))});
}
void receive() {
  char b[4096];
  for (;;) {
    if (fd < 0) return;
    const ssize_t n = ::recv(fd, b, sizeof b, 0);
    if (n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR)) { drop(); return; }
    if (n < 0) break;
    in.append(b, static_cast<size_t>(n));
  }
  size_t off = 0;
  while (in.size() - off >= 5) {
    const auto* m = reinterpret_cast<const uint8_t*>(in.data() + off);
    const uint32_t len = get32(m + 1);
    if (len > 65536) { drop(); return; }
    if (in.size() - off < 5 + len) break;
    if (m[0] == ACK && len >= 4) acked = get32(m + 5);
    else if (m[0] == PING && out.size() < 65536) msg(PONG, m + 5, len);
    else if (m[0] == INPUT) input(m + 5, len);
    off += 5 + len;
  }
  in.erase(0, off);
}
void damage(int x0, int y0, int x1, int y1) {
  if (x1 <= x0 || y1 <= y0) return;
  if (dx1 <= dx0) { dx0 = x0; dy0 = y0; dx1 = x1; dy1 = y1; return; }
  dx0 = x0 < dx0 ? x0 : dx0; dy0 = y0 < dy0 ? y0 : dy0; dx1 = x1 > dx1 ? x1 : dx1; dy1 = y1 > dy1 ? y1 : dy1;
}
void present(const HalFrame* f) {
  check();
  if (fd < 0 || f->w <= 0 || f->h <= 0 || f->w > 65535 || f->h > 65535) return;
  if (f->w != W || f->h != H) {
    W = f->w; H = f->h;
    fb.assign(static_cast<size_t>(W) * H, 0);
    tmp.resize(fb.size());
    uint8_t hello[4];
    put16(hello, static_cast<uint16_t>(W)); put16(hello + 2, static_cast<uint16_t>(H));
    msg(HELLO, hello, 4);
    full = true; seq = acked = 0; dx0 = dy0 = dx1 = dy1 = 0;
  }
  if (full || f->move) { f->render(fb.data(), 0, H); damage(0, 0, W, H); full = false; }   // a scroll moved pixels the copy has not: all of it again
  else if (f->x1 > f->x0 && f->y1 > f->y0) {
    (f->render_damage ? f->render_damage : f->render)(fb.data() + static_cast<size_t>(f->y0) * W, f->y0, f->y1);
    damage(f->x0, f->y0, f->x1, f->y1);
  }
  receive();
  flush();
  if (fd < 0 || dx1 <= dx0 || seq - acked >= 2 || !out.empty()) return;   // the viewer is behind: the damage waits and grows
  const int w = dx1 - dx0, h = dy1 - dy0;
  for (int y = 0; y < h; y++) std::memcpy(tmp.data() + static_cast<size_t>(y) * w, fb.data() + static_cast<size_t>(dy0 + y) * W + dx0, static_cast<size_t>(w) * 4);
  std::string rect(8 + rle_bound(static_cast<uint32_t>(w) * h), '\0');
  auto* r = reinterpret_cast<uint8_t*>(rect.data());
  put16(r, static_cast<uint16_t>(dx0)); put16(r + 2, static_cast<uint16_t>(dy0)); put16(r + 4, static_cast<uint16_t>(w)); put16(r + 6, static_cast<uint16_t>(h));
  msg(RECT, r, 8 + rle_encode(tmp.data(), static_cast<uint32_t>(w) * h, r + 8));
  uint8_t s[4];
  put32(s, ++seq);
  msg(FRAME, s, 4);
  dx0 = dy0 = dx1 = dy1 = 0;
  flush();
}
// The viewer's pointer holds until the screen's own pointer moves (a touch, a mouse on the device); keys, clicks and wheel are added.
void merge(HalInput* i) {
  receive();
  if (fd < 0) return;
  const bool kept = i->px == wroteX && i->py == wroteY && i->pdown == wroteDown;   // a HAL that writes the pointer only when it moves
  if (!kept && (i->px != localX || i->py != localY || i->pdown != localDown)) {
    if (localSeen) rem.active = false;   // the first value seen is where the screen's pointer rests, not a move
    localX = i->px; localY = i->py; localDown = i->pdown; localSeen = true;
  }
  const float sx = static_cast<float>(zrt::surf_w), sy = static_cast<float>(zrt::surf_h);
  if (rem.active) { wroteX = i->px = rem.x * sx; wroteY = i->py = rem.y * sy; wroteDown = i->pdown = rem.down; i->pbuttons = rem.pbuttons; }
  i->mods |= rem.mods;
  i->buttons |= rem.buttons;
  i->wheel += rem.wheel; i->wheel_x += rem.wheelX; rem.wheel = rem.wheelX = 0;
  for (const HalKey& k : rem.keys) {
    if (i->nkeys == HAL_MAX_KEYS || i->ntext + k.len > HAL_TEXT_BYTES) break;
    HalKey& o = i->keys[i->nkeys++];
    o = k;
    o.off = static_cast<uint16_t>(i->ntext);
    std::memcpy(i->text + i->ntext, rem.text.data() + k.off, k.len);
    i->ntext += k.len;
  }
  for (const HalButtonEvent& b : rem.btn) if (i->nbtn < HAL_MAX_BUTTON_EVENTS) i->btn[i->nbtn++] = HalButtonEvent{b.x * sx, b.y * sy, b.button, b.down};
  rem.keys.clear(); rem.text.clear(); rem.btn.clear();
}
}  // namespace

/** Installs the hooks when this process may be watched: a program run by an agent or a Pi session (ZINC_SHOT_REQUEST names their files).
 *  A program of zinc dev also says when its first frame is on the screen, from the start of the process (zinc dev --device's timeline). */
void installMirror() {
  if (const char* dev = std::getenv("ZINC_DEV"); dev && *dev == '1')
    zrt::first_present = [] {   // from the agent's start of it (ZINC_DEV_T0, wall clock in µs), else from this process's own start
      const char* t0 = std::getenv("ZINC_DEV_T0");
      const long long now = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
      const double ms = t0 && *t0 ? static_cast<double>(now - std::atoll(t0)) / 1000 : zn::log::since(zn::log::state().t0);
      zn::log::step("frame", "first frame on the screen, from the start", ms);
    };
  const char* r = std::getenv("ZINC_SHOT_REQUEST");
  if (!r || !*r) return;
  request = r;
  const size_t slash = request.rfind('/');
  request = (slash == std::string::npos ? std::string(".") : request.substr(0, slash)) + "/live.request";
  zrt::mirror_present = present;
  zrt::mirror_input = merge;
}
}  // namespace zn::host
#else
namespace zn::host { void installMirror() {} }   // ponytail: no live screen nor first-frame line on Windows yet
#endif
