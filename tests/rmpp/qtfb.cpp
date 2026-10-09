// Run in zinc/sdk-rmpp: g++ -std=c++17 -pthread -Iruntime/include tests/rmpp/qtfb.cpp -o /tmp/qtfb-test && /tmp/qtfb-test
// Socket-pair integration test: real driver, fake AppLoad, no tablet required.
#include "../../plugins/display-rmpp/rmpp.cpp"
#include <assert.h>
HalDisplay* hal_display = nullptr;
void hal_pen_push(const HalPen*) {}
static uint64_t now_us = 2000000;
uint64_t hal_time_us() { return now_us; }
static uint32_t pixels[100 * 100];
static int damage_x, damage_y, damage_calls;
static void render_damage(uint32_t* out, int32_t y0, int32_t) {
  out[(damage_y - y0) * 100 + damage_x] = pixels[damage_y * 100 + damage_x];
  damage_calls++;
}
static void render_rows(uint32_t* out, int32_t y0, int32_t y1) {
  memcpy(out, pixels + y0 * 100, (y1 - y0) * 100 * 4);
}
int main() {
  signal(SIGPIPE, SIG_IGN);
  unsetenv("ZINC_FRAMES");
  int pair[2]; assert(socketpair(AF_UNIX, SOCK_SEQPACKET, 0, pair) == 0);
  sock = pair[0];
  assert(eink::init(panel, 100, 100));
  shm_size = 100 * 100 * 3;
  shm = (uint8_t*)mmap(nullptr, shm_size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  assert(shm != MAP_FAILED);
  rin::W = rin::H = 100;
  for (auto& p : pixels) p = 0xffffff;
  HalFrame f = {100, 100, 0, 0, 100, 100, render_rows};
  ClientMsg m;
  rm_present(&f);
  assert(recv(pair[1], &m, sizeof m, 0) == sizeof m && m.type == MSG_UPDATE);
  assert(m.update.type == UPDATE_PARTIAL);
  f.render_damage = render_damage;
  // More than the old 60-update limit: every coloured stroke stays RGB and only damages one pixel.
  for (int i = 0; i < 120; i++) {
    int x = i % 100, y = i / 100;
    damage_x = x; damage_y = y;
    pixels[y * 100 + x] = 0xdc2626;
    now_us += update_interval();
    rm_present(&f);
    assert(recv(pair[1], &m, sizeof m, 0) == sizeof m);
    assert(m.type == MSG_UPDATE && m.update.type == UPDATE_PARTIAL);
    assert(m.update.x == x && m.update.y == y && m.update.w == 1 && m.update.h == 1);
    assert(shm[(y * 100 + x) * 3] == 0xdc && shm[(y * 100 + x) * 3 + 1] == 0x26);
  }
  assert(damage_calls == 120);
  rm_present(&f);
  assert(recv(pair[1], &m, sizeof m, MSG_DONTWAIT) == -1 && errno == EAGAIN);
  // A whole page change still never requests a flashing full refresh.
  f.render_damage = nullptr; // legacy HAL callback fallback
  for (auto& p : pixels) p = 0x15803d;
  now_us += update_interval();
  rm_present(&f);
  assert(recv(pair[1], &m, sizeof m, 0) == sizeof m && m.type == MSG_UPDATE && m.update.type == UPDATE_PARTIAL);
  // Changing mode sends one control packet, then coalesces frames during qtfb's one-second stall.
  assert(!set_mode(99));
  assert(zinc_rmpp_set_fast(true));
  assert(recv(pair[1], &m, sizeof m, 0) == sizeof m && m.type == MSG_SET_MODE && m.mode == MODE_FAST);
  assert(zinc_rmpp_refresh_busy() && !zinc_rmpp_set_fast(false));
  for (int i = 0; i < 80; i++) {
    now_us += 10000;
    pixels[200 + i] = 0x1d4ed8;
    rm_present(&f);
    assert(recv(pair[1], &m, sizeof m, MSG_DONTWAIT) == -1 && errno == EAGAIN);
  }
  now_us = mode_ready_us;
  rm_present(&f);
  assert(recv(pair[1], &m, sizeof m, 0) == sizeof m && m.type == MSG_UPDATE);
  assert(m.update.w == 100 && m.update.h == 100 && shm[279 * 3 + 2] == 0xd8);
  assert(!zinc_rmpp_refresh_busy());
  assert(zinc_rmpp_set_fast(true)); // no redundant mode packet
  assert(recv(pair[1], &m, sizeof m, MSG_DONTWAIT) == -1 && errno == EAGAIN);

  // Two frames inside the rate limit merge; idle flush includes the last segment without another pen event.
  now_us += 1000; pixels[501] = 0xff0000; rm_present(&f);
  now_us += 1000; pixels[509] = 0x0000ff; rm_present(&f);
  assert(recv(pair[1], &m, sizeof m, MSG_DONTWAIT) == -1 && errno == EAGAIN);
  now_us += update_interval(); rm_present(&f);
  assert(recv(pair[1], &m, sizeof m, 0) == sizeof m);
  assert(m.update.x == 1 && m.update.y == 5 && m.update.w == 9 && m.update.h == 1);

  // Colour preview must repaint unchanged pixels: RGB has never been destructively converted to mono.
  assert(zinc_rmpp_set_fast(false));
  assert(recv(pair[1], &m, sizeof m, 0) == sizeof m && m.type == MSG_SET_MODE && m.mode == MODE_UI);
  now_us = mode_ready_us; rm_present(&f);
  assert(recv(pair[1], &m, sizeof m, 0) == sizeof m && m.type == MSG_UPDATE);
  assert(m.update.w == 100 && m.update.h == 100 && shm[200 * 3] == 0x1d);

  // A full socket must not block the UI or lose damage; retry the newest pixels when space returns.
  int capacity = 1024; setsockopt(sock, SOL_SOCKET, SO_SNDBUF, &capacity, sizeof capacity);
  ClientMsg filler = {}; filler.type = 42;
  while (send(sock, &filler, sizeof filler, MSG_DONTWAIT) == sizeof filler) {}
  assert(errno == EAGAIN);
  now_us += update_interval(); pixels[9999] = 0xca8a04; rm_present(&f);
  assert(!rin::quit_flag && !eink::empty(pending));
  while (recv(pair[1], &m, sizeof m, MSG_DONTWAIT) > 0) assert(m.type == 42);
  rm_present(&f);
  assert(recv(pair[1], &m, sizeof m, 0) == sizeof m && m.type == MSG_UPDATE);
  assert(m.update.x == 99 && m.update.y == 99 && shm[9999 * 3] == 0xca);

  auto touch = [&](int type, int id, int x, int y) {
    ServerMsg e = {}; e.type = MSG_INPUT; e.input = {type, id, x, y, 0};
    assert(send(pair[1], &e, sizeof e, 0) == sizeof e);
  };
  HalInput in = {};
  touch(0x10, 7, 20, 30); touch(0x11, 7, 20, 30);
  rm_poll(&in); assert(in.pdown && in.ntouch == 1 && in.px == 20 && in.py == 30);
  rm_poll(&in); assert(!in.pdown && in.ntouch == 0); // quick taps survive
  touch(0x10, 7, 20, 30); touch(0x10, 8, 50, 60);
  rm_poll(&in); rm_poll(&in); assert(in.ntouch == 2);
  touch(0x12, 7, 25, 35); rm_poll(&in); assert(in.px == 25);
  touch(0x11, 7, 25, 35); rm_poll(&in); assert(in.ntouch == 1 && in.touch[0].id == 8);
  rin::last_pen.flags = HAL_PEN_HOVER;
  rm_poll(&in); assert(in.ntouch == 1 && in.pdown && in.px == 50); // UI touch remains available with a hovering pen
  rin::last_pen.flags = 0;
  touch(0x11, 8, 50, 60); rm_poll(&in);
  touch(0x10, 9, -1, 30); rm_poll(&in); assert(in.ntouch == 0);
  close(pair[1]); rm_poll(&in); assert(in.quit); // closed AppLoad exits cleanly
  rm_shutdown();
  assert(sock == -1 && shm == nullptr);
  puts("qtfb: mode settling, coalescing, backpressure, RGB, partial rendering, touch and exit OK");
}
