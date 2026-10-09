#pragma once
#include "eink.h"
#include "input.h"
#include "../../integrations/remarkable-ink/protocol.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <errno.h>
#include <initializer_list>

namespace direct {
eink::Panel panel;
int sock = -1, touch_fd = -1, power_fd = -1, mode = 0, slot = 0;
uint32_t sequence = 0;
uint64_t ping_at = 0;
bool repaint = false;
struct Contact { int id = -1, x = 0, y = 0; } contacts[16];
rin::Axis tx, ty;
alignas(uint32_t) unsigned char packet[sizeof(zink::Message) + zink::width * zink::rows * 4];

bool send(zink::Message& m, size_t size = sizeof(zink::Message), bool ack = false) {
  m.seq = ++sequence;
  memcpy(packet, &m, sizeof m);
  if (::send(sock, packet, size, MSG_NOSIGNAL) != (ssize_t)size) return false;
  if (ack) {
    zink::Message reply{};
    if (recv(sock, &reply, sizeof reply, 0) != sizeof reply || reply.magic != zink::magic ||
        reply.version != zink::version || reply.type != zink::Ack || reply.seq != m.seq) return false;
  }
  ping_at = hal_time_us();
  return true;
}
void stop() {
  rin::quit_flag = 1;
  // Release exclusive inputs before returning the screen; the bridge drains queued Qt contacts.
  for (int fd : {touch_fd, power_fd, rin::pen_fd}) if (fd >= 0) ioctl(fd, EVIOCGRAB, 0);
  if (touch_fd >= 0) close(touch_fd);
  if (power_fd >= 0) close(power_fd);
  if (sock >= 0) { zink::Message m; m.type = zink::Bye; send(m); close(sock); }
  sock = touch_fd = power_fd = -1;
  free(panel.cur); free(panel.scratch); free(panel.out); panel = {};
}
int init(const HalConfig* cfg) {
  if (cfg->width != zink::width || cfg->height != zink::height) return 0;
  sock = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
  timeval limit{2, 0};
  setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &limit, sizeof limit);
  setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &limit, sizeof limit);
  sockaddr_un a{}; a.sun_family = AF_UNIX; strcpy(a.sun_path, zink::socket_path);
  zink::Message hello; hello.type = zink::Hello;
  if (sock < 0 || connect(sock, (sockaddr*)&a, sizeof a) || !send(hello, sizeof hello, true)) {
    fprintf(stderr, "display-rmpp: direct bridge unavailable/refused; no display takeover\n");
    stop(); return 0;
  }
  if (!eink::init(panel, cfg->width, cfg->height) || !rin::start(cfg->width, cfg->height, true)) { stop(); return 0; }
  for (int i = 0; i < 32; ++i) {
    char p[64]; snprintf(p, sizeof p, "/dev/input/event%d", i);
    int fd = open(p, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (fd < 0) continue;
    if (touch_fd < 0 && rin::has(fd, EV_ABS, ABS_MT_POSITION_X) && !rin::has(fd, EV_KEY, BTN_TOOL_PEN)) {
      touch_fd = fd; tx = rin::axis(fd, ABS_MT_POSITION_X); ty = rin::axis(fd, ABS_MT_POSITION_Y);
    } else if (power_fd < 0 && rin::has(fd, EV_KEY, KEY_POWER)) power_fd = fd;
    else { close(fd); continue; }
    if (ioctl(fd, EVIOCGRAB, 1) < 0) { stop(); return 0; }
  }
  if (touch_fd < 0) { stop(); return 0; }
  return 1;
}
void poll(HalInput* in) {
  input_event e{};
  while (power_fd >= 0 && read(power_fd, &e, sizeof e) == sizeof e)
    if (e.type == EV_KEY && e.code == KEY_POWER && e.value == 1) rin::quit_flag = 1;
  // Deliver one complete touch report per UI frame so press/release cannot collapse into nothing.
  while (touch_fd >= 0 && read(touch_fd, &e, sizeof e) == sizeof e) {
    if (e.type == EV_ABS) {
      if (e.code == ABS_MT_SLOT) slot = e.value >= 0 && e.value < 16 ? e.value : -1;
      else if (slot >= 0) {
        if (e.code == ABS_MT_TRACKING_ID) contacts[slot].id = e.value;
        else if (e.code == ABS_MT_POSITION_X) contacts[slot].x = e.value;
        else if (e.code == ABS_MT_POSITION_Y) contacts[slot].y = e.value;
      }
    } else if (e.type == EV_SYN && e.code == SYN_REPORT) {
      rin::ntouch = 0;
      for (const auto& c : contacts) if (c.id >= 0 && rin::ntouch < HAL_MAX_TOUCH) {
        float x, y; rin::place(rin::norm(c.x, tx), rin::norm(c.y, ty), rin::pen_rot, &x, &y);
        rin::touches[rin::ntouch++] = {c.id, x, y};
      }
      break;
    }
  }
  rin::poll_input(in);
  pollfd p{sock, POLLIN, 0};
  if (::poll(&p, 1, 0) > 0 && (p.revents & (POLLIN | POLLHUP | POLLERR))) in->quit = 1;
}
void present(const HalFrame* f) {
  eink::Rect r{};
  if (f->y1 > f->y0 && f->x1 > f->x0) {
    (f->render_damage ? f->render_damage : f->render)(panel.scratch + (size_t)f->y0 * panel.w, f->y0, f->y1);
    r = eink::changed(panel, f->y0, f->y1);
  }
  if (panel.first || repaint) { r = {0, 0, panel.w, panel.h}; panel.first = repaint = false; }
  if (!eink::empty(r)) {
    for (int y = r.y0; y < r.y1; y += zink::rows) {
      zink::Message m; m.type = zink::Pixels; m.x = r.x0; m.y = y; m.w = r.x1 - r.x0;
      m.h = r.y1 - y < zink::rows ? r.y1 - y : zink::rows;
      for (int row = 0; row < m.h; ++row) {
        uint32_t* dst = reinterpret_cast<uint32_t*>(packet + sizeof m) + row * m.w;
        const uint32_t* src = panel.cur + (y + row) * panel.w + m.x;
        for (int x = 0; x < m.w; ++x) dst[x] = src[x] | 0xff000000u;
      }
      if (!send(m, sizeof m + m.w * m.h * 4)) { rin::quit_flag = 1; return; }
    }
    zink::Message m; m.type = zink::Present; m.x = r.x0; m.y = r.y0;
    m.w = r.x1 - r.x0; m.h = r.y1 - r.y0; m.mode = mode;
    if (!send(m, sizeof m, true)) rin::quit_flag = 1;
  } else {
    if (hal_time_us() - ping_at > 500000) {
      zink::Message m; m.type = zink::Ping;
      if (!send(m, sizeof m, true)) rin::quit_flag = 1;
    }
    pollfd fds[] = {{rin::wake[0], POLLIN, 0}, {touch_fd, POLLIN, 0}, {sock, POLLIN, 0}};
    if (::poll(fds, 3, 8) > 0 && (fds[0].revents & POLLIN)) { char b[256]; while (read(rin::wake[0], b, sizeof b) > 0) {} }
  }
}
HalDisplay display{init, present, poll, stop, 0, 0};
int reg = (hal_display = &display, 0);
}
extern "C" bool zinc_rmpp_set_fast(bool fast) { direct::mode = fast ? 0 : 4; direct::repaint = true; return direct::sock >= 0; }
extern "C" int zinc_rmpp_refresh_mode() { return direct::mode == 0 ? 1 : 4; }
extern "C" bool zinc_rmpp_refresh_busy() { return false; }
