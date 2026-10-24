// zinc device <device> screen --live: the device's screen in a window of the workstation, driven by its mouse and keyboard.
// The program on the device's screen streams its frames (src/host/mirror.cpp, the protocol of plugins/display-remote/remote_proto.h) to a
// Unix socket of the agent, which relays them in the session; the window here decodes them and sends back the input its HAL reads.
// When another program takes the screen (an app started from the player, the player back after it), it connects too and replaces the
// first one: its HELLO starts the picture again.
#include "wire.h"
#include "../../plugins/display-remote/remote_proto.h"
#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <poll.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#ifdef ZN_HOST_GFX
#include "hal.h"
#endif

namespace zn::agent {
namespace {
using namespace zremote;
constexpr uint8_t INPUT = 22;   // the viewer's HalInput (src/host/mirror.cpp reads it)
int fail(const std::string& why) { std::fprintf(stderr, "zinc device: %s\n", why.c_str()); return 1; }

// The length of the whole messages at the start of `b`.
size_t whole(const std::string& b) {
  size_t off = 0;
  while (b.size() - off >= 5) {
    const uint32_t len = get32(reinterpret_cast<const uint8_t*>(b.data() + off + 1));
    if (b.size() - off < 5 + static_cast<size_t>(len)) break;
    off += 5 + len;
  }
  return off;
}
std::string message(uint8_t type, const void* p, uint32_t n) {
  std::string m(5, '\0');
  m[0] = static_cast<char>(type);
  put32(reinterpret_cast<uint8_t*>(m.data() + 1), n);
  return m.append(static_cast<const char*>(p), n);
}
}  // namespace

// ---- the device ----

void opLive(Chan& c, const std::atomic<bool>& stop) {
  const char* r = std::getenv("ZINC_SHOT_REQUEST");
  std::string dir = r ? r : "";
  dir = dir.empty() || dir.rfind('/') == std::string::npos ? "." : dir.substr(0, dir.rfind('/'));
  const std::string request = dir + "/live.request", path = dir + "/live.sock";
  sockaddr_un a{};
  a.sun_family = AF_UNIX;
  if (path.size() >= sizeof a.sun_path) { refuse(c, "the screen's socket path is too long: " + path); return; }
  std::memcpy(a.sun_path, path.c_str(), path.size());
  ::unlink(path.c_str());
  const int lfd = ::socket(AF_UNIX, SOCK_STREAM, 0);
  if (lfd < 0 || ::bind(lfd, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0 || ::listen(lfd, 4) != 0) {
    if (lfd >= 0) ::close(lfd);
    refuse(c, "cannot listen on " + path + ": " + std::strerror(errno));
    return;
  }
  ::chmod(path.c_str(), 0660);   // the display session's group may connect, as it may answer screen requests
  int prog = -1;
  const auto end = [&] { writePrivate(request, ""); if (prog >= 0) ::close(prog); ::close(lfd); ::unlink(path.c_str()); };
  if (!writePrivate(request, path + "\n")) { end(); refuse(c, "cannot write " + request); return; }
  ::chmod(request.c_str(), 0660);
  pollfd w{lfd, POLLIN, 0};
  if (::poll(&w, 1, 5000) <= 0) {
    end();
    refuse(c, "no program on the screen answered in 5 s: the player and apps answer from zinc 0.7.6 (zinc device update), a program without a window has no screen");
    return;
  }
  if (!send(c, kJson, Obj().flag("ok", true).done())) { end(); return; }
  std::string from;   // the program's bytes not yet sent: only whole messages leave, so a switch of program never cuts one
  char buf[kChunk];
  for (bool open = true; open && !stop;) {
    char type;
    std::string payload;
    while (next(c, type, payload)) {
      if (type == kIn && prog >= 0 && !writeAll(prog, payload.data(), payload.size())) { ::close(prog); prog = -1; }
      if (type == kEof) open = false;
    }
    if (!open) break;
    pollfd p[3] = {{c.fd, POLLIN, 0}, {lfd, POLLIN, 0}, {prog, POLLIN, 0}};
    if (::poll(p, 3, 1000) < 0 && errno != EINTR) break;
    if (p[1].revents & POLLIN) {   // a program that starts showing frames: the screen is its now
      const int n = ::accept(lfd, nullptr, nullptr);
      if (n >= 0) { if (prog >= 0) ::close(prog); prog = n; from.clear(); }
    }
    if (prog >= 0 && (p[2].revents & (POLLIN | POLLHUP | POLLERR))) {
      const ssize_t n = ::recv(prog, buf, sizeof buf, 0);
      if (n > 0) {
        from.append(buf, static_cast<size_t>(n));
        if (const size_t k = whole(from)) { if (!send(c, kOut, std::string_view(from.data(), k))) break; from.erase(0, k); }
      } else if (n == 0 || (errno != EAGAIN && errno != EINTR)) { ::close(prog); prog = -1; from.clear(); }   // it ended: the next one connects
    }
    if (p[0].revents) open = fill(c);
  }
  end();
}

// ---- the workstation ----

#ifdef ZN_HOST_GFX
namespace {
std::vector<uint32_t> pic;   // the device's frame
int DW, DH, PW, PH;          // its size, the window's in physical pixels
void scaled(uint32_t* rows, int32_t y0, int32_t y1) {   // nearest pixel: the window may be smaller or larger than the screen
  for (int32_t y = y0; y < y1; ++y) {
    const uint32_t* s = pic.data() + static_cast<size_t>(static_cast<int64_t>(y) * DH / PH) * DW;
    uint32_t* o = rows + static_cast<size_t>(y - y0) * PW;
    for (int32_t x = 0; x < PW; ++x) o[x] = s[static_cast<int64_t>(x) * DW / PW];
  }
}
void f32(std::string& m, float v) { char b[4]; std::memcpy(b, &v, 4); m.append(b, 4); }
void u32(std::string& m, uint32_t v) { uint8_t b[4]; put32(b, v); m.append(reinterpret_cast<char*>(b), 4); }
void u16(std::string& m, uint16_t v) { uint8_t b[2]; put16(b, v); m.append(reinterpret_cast<char*>(b), 2); }
}  // namespace

int cmdLive(Device& d) {
  std::string answer;
  std::unique_ptr<Chan> c = ask(d, Obj().str("op", "live").done(), answer);
  if (!c) return 1;
  std::string in;
  bool opened = false, dirty = false, gone = false;
  long frames = 0;
  const auto take = [&] {   // the messages received: the picture updated, each frame acknowledged
    size_t off = 0;
    while (in.size() - off >= 5) {
      const auto* m = reinterpret_cast<const uint8_t*>(in.data() + off);
      const uint32_t len = get32(m + 1);
      if (in.size() - off < 5 + static_cast<size_t>(len)) break;
      const uint8_t* p = m + 5;
      if (m[0] == HELLO && len >= 4 && get16(p) && get16(p + 2)) {
        DW = get16(p); DH = get16(p + 2);
        pic.assign(static_cast<size_t>(DW) * DH, 0);
        if (!opened) {   // a window the size of the screen, smaller when the screen is larger than a laptop's
          const double k = std::min({1.0, 1280.0 / DW, 800.0 / DH});
          const std::string title = d.name + " (zinc device screen --live)";
          HalConfig cfg{static_cast<int32_t>(DW * k), static_cast<int32_t>(DH * k), title.c_str(), 1};
          hal_init(&cfg);
          hal_escape_by_app(1);   // Escape is the device's
          hal_text_input(1, 0, 0, static_cast<float>(cfg.width), static_cast<float>(cfg.height));
          opened = true;
        }
      } else if (m[0] == RECT && len >= 8 && !pic.empty()) {
        const int x = get16(p), y = get16(p + 2), w = get16(p + 4), h = get16(p + 6);
        if (x + w <= DW && y + h <= DH) rle_decode(p + 8, len - 8, pic.data() + static_cast<size_t>(y) * DW + x, DW, w, h);
      } else if (m[0] == FRAME && len >= 4) {
        dirty = true;
        ++frames;
        if (!send(*c, kIn, message(ACK, p, 4))) gone = true;
      }
      off += 5 + len;
    }
    in.erase(0, off);
  };
  const auto receive = [&](int ms) {
    char type;
    std::string payload;
    pollfd p{c->fd, POLLIN, 0};
    if (c->in.empty() && ::poll(&p, 1, ms) > 0 && !fill(*c)) gone = true;
    while (next(*c, type, payload)) {
      if (type == kOut) in += payload;
      else if (type == kEof || type == kExit) gone = true;
    }
    take();
  };
  std::fprintf(stderr, "%s: the screen, live; close the window to stop\n", d.name.c_str());
  for (int waited = 0; !opened && !gone && waited < 100; ++waited) receive(100);
  if (!opened) return fail(gone ? "the session with " + d.name + " ended" : d.name + " sent no frame in 10 s");
  HalInput hi{}, sent{};
  hi.pinch = 1;
  while (!gone) {
    receive(4);   // what came, waiting a little: a window paces the loop at its refresh, a headless run has nothing else to wait on
    hi.nkeys = hi.ntext = hi.nbtn = 0; hi.wheel = hi.wheel_x = 0; hi.pinch = 1;
    hal_frame_begin();
    hal_poll_input(&hi);
    if (hi.quit) break;
    int sw = 0, sh = 0;
    hal_surface_size(&sw, &sh);
    const int32_t k = hal_pixel_scale();
    if (sw * k != PW || sh * k != PH) { PW = sw * k; PH = sh * k; dirty = true; }
    // what changed since the last message: the pointer (0..1 of the screen), the keys, the wheel, the clicks
    const bool over = hi.px >= 0 && hi.py >= 0 && hi.px < sw && hi.py < sh;
    const bool moved = (over || hi.pdown) && (hi.px != sent.px || hi.py != sent.py);
    if (moved || hi.pdown != sent.pdown || hi.pbuttons != sent.pbuttons || hi.mods != sent.mods || hi.buttons != sent.buttons || hi.nkeys || hi.nbtn || hi.wheel || hi.wheel_x) {
      {
        std::string m;
        f32(m, over || hi.pdown ? hi.px / sw : -1); f32(m, over || hi.pdown ? hi.py / sh : -1);
        m.push_back(static_cast<char>(hi.pdown ? 1 : 0)); m.push_back(static_cast<char>(hi.pbuttons));
        u32(m, hi.mods); u32(m, hi.buttons); f32(m, hi.wheel); f32(m, hi.wheel_x);
        u16(m, static_cast<uint16_t>(hi.nkeys));
        for (int i = 0; i < hi.nkeys; ++i) {
          const HalKey& key = hi.keys[i];
          u32(m, static_cast<uint32_t>(key.key)); u32(m, key.mods); u32(m, static_cast<uint32_t>(key.kind)); u16(m, key.len);
          m.append(hi.text + key.off, key.len);
        }
        u16(m, static_cast<uint16_t>(hi.nbtn));
        for (int i = 0; i < hi.nbtn; ++i) { f32(m, hi.btn[i].x / sw); f32(m, hi.btn[i].y / sh); u32(m, static_cast<uint32_t>(hi.btn[i].button)); u32(m, static_cast<uint32_t>(hi.btn[i].down)); }
        if (!send(*c, kIn, message(INPUT, m.data(), static_cast<uint32_t>(m.size())))) break;
        sent = hi;
      }
    }
    HalFrame f{};
    f.w = PW; f.h = PH; f.render = scaled;
    if (dirty) { f.x1 = PW; f.y1 = PH; dirty = false; }
    hal_present(&f);   // paced by the window's refresh
    hal_frame_end();
  }
  hal_shutdown();
  send(*c, kEof, {});
  const uint32_t centre = pic.empty() ? 0 : pic[static_cast<size_t>(DH / 2) * DW + DW / 2] & 0xffffff;
  std::fprintf(stderr, "%s: %ld frames received, %dx%d, centre #%06x\n", d.name.c_str(), frames, DW, DH, static_cast<unsigned>(centre));
  return gone ? fail("the session with " + d.name + " ended") : 0;
}
#else
int cmdLive(Device& d) { (void)d; return fail("this zinc has no window: zinc device screen --live needs the desktop build"); }
#endif
}  // namespace zn::agent
