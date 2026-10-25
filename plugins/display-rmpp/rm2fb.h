// The reMarkable 2 through timower's rm2fb (github.com/timower/rM2-stuff, libs/rm2fb), selected by the rM2 row of models.h.
// The rM2's SWTCON lives inside xochitl; rm2fb's server owns the panel and its clients share one framebuffer, so Zinc is a
// client instead of a bridge of its own. Wire (include/rm2fb/Message.h, SharedBuffer.h): a stream socket at
// /var/run/rm2fb.sock; each message is an int32 variant index then the struct. Init (0) is answered by the granted FbFormat,
// then the buffer's fd (SCM_RIGHTS): RGB565, 1404x1872. UpdateParams (2) is answered by a bool.
#pragma once
#include "eink.h"
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

namespace rm2fb {
struct FbFormat { int32_t width, height, pixel_format; };   // PixelFormat: 0 RGB565, 1 RGB32
struct Init { bool own_swtcon; FbFormat format; };
struct UpdateParams { int32_t y1, x1, y2, x2, flags, waveform; float temperature; int32_t extra_mode; };
static_assert(sizeof(Init) == 16 && sizeof(UpdateParams) == 32, "rm2fb wire layout");
enum : int32_t { WAVEFORM_DU = 1, WAVEFORM_GC16_FAST = 3, IOCTL_WAVEFORM = 0xf000 };  // rM1 mxcfb constants, mapped by the server

int sock = -1;
uint16_t* fb = nullptr;
size_t fb_size = 0;
bool fast = true;

template <class T> bool put(int32_t index, const T& body) {
  unsigned char b[4 + sizeof(T)];
  memcpy(b, &index, 4); memcpy(b + 4, &body, sizeof(T));
  return send(sock, b, sizeof b, MSG_NOSIGNAL) == (ssize_t)sizeof b;
}
bool fail(const char* why) {
  fprintf(stderr, "display-rmpp: reMarkable 2: %s (install timower's rm2fb, docs/targets/remarkable-paper-pro.md); running headless\n", why);
  if (sock >= 0) close(sock);
  sock = -1;
  return false;
}
bool open(int w, int h) {
  sock = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
  sockaddr_un a = {};
  a.sun_family = AF_UNIX;
  strcpy(a.sun_path, "/var/run/rm2fb.sock");
  if (sock < 0 || connect(sock, (sockaddr*)&a, sizeof a) != 0) return fail("rm2fb is not running");
  FbFormat granted = {};
  char ctrl[CMSG_SPACE(sizeof(int))] = {};
  iovec io = {&granted, sizeof granted};
  msghdr msg = {};
  msg.msg_iov = &io; msg.msg_iovlen = 1;
  if (!put(0, Init{false, {w, h, 0}}) || recv(sock, &granted, sizeof granted, MSG_WAITALL) != (ssize_t)sizeof granted) return fail("no answer to Init");
  if (granted.width != w || granted.height != h || granted.pixel_format != 0) return fail("unexpected framebuffer format");
  char one;
  io = {&one, 1};
  msg.msg_control = ctrl; msg.msg_controllen = sizeof ctrl;
  cmsghdr* c = recvmsg(sock, &msg, 0) == 1 ? CMSG_FIRSTHDR(&msg) : nullptr;
  if (!c || c->cmsg_type != SCM_RIGHTS) return fail("no framebuffer received");
  int fd; memcpy(&fd, CMSG_DATA(c), sizeof fd);
  fb_size = (size_t)w * h * 2;
  void* p = mmap(nullptr, fb_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  close(fd);
  if (p == MAP_FAILED) return fail("cannot map the framebuffer");
  fb = (uint16_t*)p;
  fprintf(stderr, "display-rmpp: reMarkable 2 through rm2fb\n");
  return true;
}
/** Writes the rectangle as RGB565 and asks for a DU (fast) or GC16_FAST (UI) partial update. False: rm2fb went away. */
bool update(const eink::Panel& p, eink::Rect r) {
  for (int32_t y = r.y0; y < r.y1; y++)
    for (int32_t x = r.x0; x < r.x1; x++) {
      uint32_t c = p.cur[(size_t)y * p.w + x];
      fb[(size_t)y * p.w + x] = (uint16_t)(((c >> 8) & 0xf800) | ((c >> 5) & 0x07e0) | ((c >> 3) & 0x001f));
    }
  UpdateParams u = {r.y0, r.x0, r.y1 - 1, r.x1 - 1, 0, (fast ? WAVEFORM_DU : WAVEFORM_GC16_FAST) | IOCTL_WAVEFORM, 0, 0};
  bool ok = false;
  return put(2, u) && recv(sock, &ok, 1, MSG_WAITALL) == 1 && ok;
}
void close_fb() {
  if (fb) munmap(fb, fb_size);
  if (sock >= 0) close(sock);
  fb = nullptr; sock = -1;
}
}  // namespace rm2fb
