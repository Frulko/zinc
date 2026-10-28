// The real framebuffer driver on native files: 1080p, USB event queues, hotplug and cursor damage without a Pi.
#include "fbdev.cpp"
#include <assert.h>
#include <fstream>
#include <arpa/inet.h>
HalDisplay* hal_display;
static int default_escapes, app_escapes;
extern "C" void hal_escape() { default_escapes++; }
extern "C" void hal_escape_by_app(int32_t) { app_escapes++; }
namespace zrt { bool display_driver = true; namespace gfx {
#include "gfx_display_actions.h"
static int captures;
uint8_t* capture_png(size_t* n, int32_t, int32_t) { captures++; *n = 4; return (uint8_t*)strdup("PNG!"); }   // the engine's picture of the frame
} }
void hal_free(void* p) { free(p); }
static int renders;
static void paint(uint32_t* rows, int32_t a, int32_t b) {
  renders++;
  for (int y = a; y < b; y++) for (int x = 0; x < W; x++) rows[(y - a) * W + x] = 0x345678;
}
static void event(std::ofstream& stream, int type, int code, int value) {
  input_event e = {}; e.type = type; e.code = code; e.value = value;
  stream.write((const char*)&e, sizeof e);
}
static uint32_t modifiers;
static int updates;
static int update(void*, uint32_t code, int down) { updates++; if (code == 42 + 8) modifiers = down ? HAL_MOD_SHIFT : 0; return 0; }
static int active(void*, const char* name, int) { return !strcmp(name, "Shift") && modifiers; }
static uint32_t symbol(void*, uint32_t code) { return code == KEY_A + 8 ? modifiers ? 'A' : 'a' : code == KEY_E + 8 ? 0xe9 : 0xff08; }
static uint32_t layout(void*, uint32_t) { return 0; }
static int symbols(void*, uint32_t code, uint32_t, uint32_t, const uint32_t** out) {
  static uint32_t s; s = code == KEY_A + 8 ? 'a' : code == KEY_E + 8 ? 'e' : 0xff08; *out = &s; return 1;
}
static int text(void*, uint32_t code, char* out, size_t) {
  const char* value = code == KEY_A + 8 ? modifiers ? "A" : "a" : code == KEY_E + 8 ? "é" : "";
  strcpy(out, value); return (int)strlen(value);
}
static void keyboard_fixture() {
  keyboard::shutdown();
  keyboard::state = keyboard::map = (void*)1;
  keyboard::state_update_key = update; keyboard::state_mod_name_is_active = active;
  keyboard::state_key_get_one_sym = symbol; keyboard::state_key_get_utf8 = text;
  keyboard::keymap_key_get_syms_by_level = symbols; keyboard::state_key_get_layout = layout;
}
static uint32_t pixel(int x, int y) {
  const uint8_t* p = fbmem + (size_t)y * pitch + x * bpp / 8;
  return bpp == 32 ? (*(uint32_t*)p & 0xffffff) : bpp == 24 ? p[2] << 16 | p[1] << 8 | p[0] : *(uint16_t*)p;
}
// The sidecar's stream (display-rmpp/stream.h) on this screen: a Mac's colour rectangle, zstd and Sub, lands on the framebuffer at the next
// present without the app's frame; once the Mac leaves, the app's whole frame comes back.
static void stream_session(HalFrame& frame) {
  const std::string port = std::to_string(40000 + getpid() % 20000);
  assert(!strcmp(fb_device("stream.listen", port.c_str()), "1"));
  const int c = socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in a = {}; a.sin_family = AF_INET; a.sin_port = htons((uint16_t)atoi(port.c_str())); a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  assert(connect(c, (sockaddr*)&a, sizeof a) == 0);
  char hello[128] = ""; size_t n = 0;
  while (n < sizeof hello - 1 && read(c, hello + n, 1) == 1 && hello[n] != '\n') n++;
  assert(strstr(hello, "RMPP 1920 1080 Screen") && strstr(hello, "+rgb") && strstr(hello, "+zstd") && strstr(hello, "+sub"));
  // 4x2 B, G, R pixels (r * 100 + i * 10 + channel + 1), each byte minus its left neighbour's, in one zstd frame
  const uint8_t z[] = {40, 181, 47, 253, 32, 24, 193, 0, 0, 1, 2, 3, 10, 10, 10, 10, 10, 10, 10, 10, 10, 101, 102, 103, 10, 10, 10, 10, 10, 10, 10, 10, 10};
  uint8_t h[16] = {1, 24}; const uint16_t x = 10, y = 20, w = 4, hh = 2; const uint32_t len = sizeof z;
  memcpy(h + 2, &x, 2); memcpy(h + 4, &y, 2); memcpy(h + 6, &w, 2); memcpy(h + 8, &hh, 2); h[10] = 2 | 0x80; memcpy(h + 12, &len, 4);
  assert(write(c, h, 16) == 16 && write(c, z, sizeof z) == (ssize_t)sizeof z);
  uint8_t ack[16] = {}; bool host = false;   // the screen's HOST messages (temperature, CPU...) come first, then the ACK
  while (ack[0] != 1) {
    for (size_t got = 0; got < 16;) { const ssize_t r = read(c, ack + got, 16 - got); assert(r > 0); got += (size_t)r; }
    host |= ack[0] == 10;
  }
  assert(host);
  const int before = renders;
  frame.x1 = frame.y1 = 0; fb_present(&frame);
  assert(pixel(10, 20) == 0x030201 && pixel(13, 21) == 0x858483 && renders == before);
  // a picture of two rectangles: after the first a present would show half of it, so the stream holds the picture until the last
  auto plain = [&](uint16_t px_, bool more_) {
    uint8_t m[16] = {1, 24}; const uint16_t one = 1; const uint32_t three = 3; const uint8_t bgr[3] = {9, 8, 7};
    memcpy(m + 2, &px_, 2); memcpy(m + 4, &one, 2); memcpy(m + 6, &one, 2); memcpy(m + 8, &one, 2); m[11] = more_; memcpy(m + 12, &three, 4);
    assert(write(c, m, 16) == 16 && write(c, bgr, 3) == 3);
    uint8_t r[16] = {};
    while (r[0] != 1) for (size_t got = 0; got < 16;) { const ssize_t k = read(c, r + got, 16 - got); assert(k > 0); got += (size_t)k; }
  };
  plain(100, true);
  assert(!stream::picture_mu.try_lock());
  plain(101, false);
  assert(stream::picture_mu.try_lock());
  stream::picture_mu.unlock();
  fb_present(&frame);
  assert(pixel(100, 1) == 0x070809 && pixel(101, 1) == 0x070809);
  close(c);
  for (int i = 0; i < 200 && stream::active; i++) usleep(5000);
  assert(!stream::active);
  fb_present(&frame);
  assert(renders > before && pixel(10, 20) == 0x345678);
  puts("fbdev stream: a colour zstd rectangle from the Mac, then the app's frame again");
}

int main(int argc, char** argv) {
  assert(argc == 2);
  setenv("ZINC_RENDER_THREADS", "1", 1);
  setenv("XKB_DEFAULT_LAYOUT", "fr", 1);
  setenv("LC_ALL", "C.UTF-8", 1);
  const std::string root = argv[1];
  const std::string fb = root + "/framebuffer", input = root + "/input";
  sim_fb = fb.c_str(); sim_input = input.c_str();
  for (int depth : {16, 24, 32}) {
    setenv("ZINC_FBDEV_SIM_FORMAT", ("1920x1080x" + std::to_string(depth)).c_str(), 1);
    int32_t w = 320, h = 240; fb_native(&w, &h);
    assert(w == 1920 && h == 1080);
    HalConfig config{w, h, "fixture", 1}; assert(fb_init(&config));
    assert(!xmap && dx == 0 && dy == 0 && W == fw && H == fh);
    if (depth == 32 && keyboard::state) {
      HalInput keys{};
      for (int code : {KEY_Q, 3, 26, KEY_E}) { keyboard::event(&keys, code, 1, true); keyboard::event(&keys, code, 0, true); }
      assert(std::string(keys.text, keys.ntext) == "aéê");
      puts("real libxkbcommon: AZERTY, UTF-8 and dead-key composition ok");
    } else if (depth == 32) puts("real libxkbcommon unavailable: layout/composition needs the Linux pass");
    HalFrame frame{w, h, 0, 0, w, h, paint}; fb_present(&frame);
    const int count = renders;
    const uint32_t background = pixel(100, 100);
    px = 100; py = 100; cursor_visible = true;
    frame.x1 = frame.y1 = 0; fb_present(&frame);
    assert(pixel(100, 100) == 0 && pixel(102, 104) == (depth == 16 ? 0xffff : 0xffffff));
    assert(surf[100 * W + 100] == 0x345678);
    px = 200; py = 200; fb_present(&frame);
    assert(pixel(100, 100) == background && pixel(200, 200) == 0 && renders == count);
    cursor_visible = false; fb_present(&frame);
    assert(pixel(200, 200) == background && renders == count);
    if (depth == 32) stream_session(frame);
    fb_shutdown();
  }
  // No event device at startup; it appears after the window is running.
  setenv("ZINC_FBDEV_SIM_FORMAT", "800x480x16", 1);
  HalConfig config{800, 480, "input", 1}; assert(fb_init(&config)); assert(ndev == 0);
  keyboard_fixture();
  {
    std::ofstream file(input, std::ios::binary);
    event(file, EV_KEY, 42, 1); event(file, EV_KEY, KEY_A, 1); event(file, EV_KEY, KEY_A, 2);
    event(file, EV_KEY, KEY_A, 0); event(file, EV_KEY, 42, 0); event(file, EV_KEY, KEY_E, 1);
    event(file, EV_REL, REL_X, 10); event(file, EV_REL, REL_Y, -10);
    event(file, EV_KEY, BTN_RIGHT, 1); event(file, EV_KEY, BTN_RIGHT, 0);
    event(file, EV_REL, REL_HWHEEL, 2); event(file, EV_REL, REL_WHEEL, -1);
    event(file, EV_SYN, SYN_REPORT, 0);
    event(file, EV_KEY, KEY_ESC, 1); event(file, EV_SYN, SYN_REPORT, 0);
  }
  HalInput in{}; last_scan = 0; fb_poll(&in);
  assert(ndev == 1 && in.px == 410 && in.py == 230 && cursor_visible);
  assert(in.nbtn == 2 && in.btn[0].button == 2 && in.btn[0].down && !in.btn[1].down);
  assert(!in.pbuttons && in.wheel_x == 2 && in.wheel == -1);
  assert(in.ntext == 4 && std::string(in.text, in.ntext) == "AAé");
  bool down = false, repeat = false, up = false;
  for (int i = 0; i < in.nkeys; i++) if (in.keys[i].key == 'a') {
    assert(in.keys[i].mods == HAL_MOD_SHIFT);
    down |= in.keys[i].kind == HAL_KEY_DOWN; repeat |= in.keys[i].kind == HAL_KEY_REPEAT; up |= in.keys[i].kind == HAL_KEY_UP;
  }
  assert(down && repeat && up && updates == 5 && !in.mods);
  assert(keyboard::named(0xff51) == HAL_KEY_ARROW_LEFT && keyboard::named(0xffff) == HAL_KEY_DELETE);
  zrt::gfx::escapeByApp(true); in = {}; fb_poll(&in); assert(!in.quit);
  zrt::gfx::escapeDefault(); in = {}; fb_poll(&in); assert(in.quit);
  assert(!default_escapes && !app_escapes);
  zrt::display_driver = false;
  zrt::gfx::escapeByApp(false); zrt::gfx::escapeDefault();
  assert(default_escapes == 1 && app_escapes == 1);
  zrt::display_driver = true;
  // Queue limits and UTF-8 text are bounded even if a device floods keys.
  in = {}; for (int i = 0; i < 200; i++) keyboard::event(&in, KEY_E, 2, false);
  assert(in.nkeys == HAL_MAX_KEYS && in.ntext <= HAL_TEXT_BYTES);
  keyboard::state = keyboard::map = nullptr;
  // A removed device releases held game keys instead of leaving the app stuck moving.
  int pipefd[2]; assert(pipe(pipefd) == 0); close(pipefd[1]);
  close(devs[0].fd); devs[0].fd = pipefd[0]; sim_fb = nullptr;
  in = {}; fb_poll(&in); assert(ndev == 0 && !in.buttons && !in.mods);
  // ZINC_SHOT: the driver writes the engine's picture of its last frame (the runtime leaves the shot to a display driver)
  const std::string shot = std::string(argv[1]) + "/shot.png";
  setenv("ZINC_SHOT", shot.c_str(), 1);
  sim_fb = fb.c_str(); fb_shutdown();
  unsetenv("ZINC_SHOT");
  { std::ifstream f(shot, std::ios::binary); std::string got((std::istreambuf_iterator<char>(f)), {}); assert(got == "PNG!" && zrt::gfx::captures == 1); }
  puts("fbdev desktop: native 1080p, input, hotplug, cursor and Escape ok");
}
