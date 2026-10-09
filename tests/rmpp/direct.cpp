// Real driver against a socket-pair peer: framing, RGB32, final segment, disconnect and touch isolation.
#define ZP_DISPLAY_RMPP_DIRECT 1
#include "../../plugins/display-rmpp/rmpp.cpp"
#include <assert.h>
#include <thread>
#include <vector>
HalDisplay* hal_display = nullptr;
static int pens = 0;
void hal_pen_push(const HalPen*) { ++pens; }
static uint64_t clock_us = 1000000;
uint64_t hal_time_us() { return clock_us; }
static void render(uint32_t* p, int32_t y0, int32_t y1) {
  for (int y = y0; y < y1; ++y) for (int x = 0; x < 32; ++x) p[(y - y0) * 32 + x] = 0xdc2626;
}
int main() {
  zink::Message bad; bad.x = 2147483647; bad.y = 0; bad.w = 2; bad.h = 1;
  assert(!zink::rectangle(bad));
  int pair[2]; assert(!socketpair(AF_UNIX, SOCK_SEQPACKET, 0, pair)); direct::sock = pair[0];
  assert(eink::init(direct::panel, 32, 32));
  std::thread peer([&] {
    alignas(uint32_t) unsigned char data[200000];
    unsigned last = 0; int stripes = 0;
    for (;;) {
      ssize_t n = recv(pair[1], data, sizeof data, 0); assert(n >= sizeof(zink::Message));
      zink::Message m; memcpy(&m, data, sizeof m);
      assert(m.seq > last); last = m.seq;
      if (m.type == zink::Pixels) {
        assert(m.w == 32 && m.h == 16 && m.y == stripes * 16);
        assert(n == sizeof m + 32 * 16 * 4);
        assert(*reinterpret_cast<uint32_t*>(data + sizeof m) == 0xffdc2626);
        ++stripes;
      } else {
        assert(stripes == 2 && m.type == zink::Present && m.w == 32 && m.h == 32 && m.mode == 0);
        m.type = zink::Ack; assert(send(pair[1], &m, sizeof m, 0) == sizeof m); break;
      }
    }
  });
  HalFrame frame{32, 32, 0, 0, 32, 32, render};
  direct::present(&frame); peer.join(); assert(!rin::quit_flag);
  // Fingers remain usable even with the pen hovering, but produce no pen samples.
  rin::last_pen.flags = HAL_PEN_HOVER;
  rin::touches[0] = {4, 12, 15}; rin::ntouch = 1;
  HalInput in{}; rin::poll_input(&in);
  assert(in.pdown && in.px == 12 && in.py == 15 && pens == 0);
  rin::ntouch = 0; rin::poll_input(&in); assert(!in.pdown && pens == 0);
  close(pair[1]); direct::poll(&in); assert(in.quit);
  direct::stop();
  puts("direct driver: framing, RGB32, commit acknowledgement, touch/pen separation and disconnect passed");
}
