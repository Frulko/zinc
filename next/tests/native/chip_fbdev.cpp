// display-fbdev on the host through ZINC_FBDEV_SIM (ZN-129): a framebuffer file with a fixed screeninfo at 16, 24 and 32 bpp (padded pitch), the same picture at every depth, a letterboxed
// copy, and a scripted multitouch evdev stream. The driver is the real fbdev.cpp; linux/fb.h and linux/input.h come from tests/native/stubs.
//   usage: chip_fbdev <golden.ppm> <tmpdir>
#include "fbdev.cpp"
#include "chip_common.h"
HalDisplay* hal_display;

// colours that survive RGB565 exactly (5/6/5 bit values expanded back), so every depth shows the same picture
static uint32_t c565(int r, int g, int b) { r = r << 3 | r >> 2; g = g << 2 | g >> 4; b = b << 3 | b >> 2; return r << 16 | g << 8 | b; }
static void render(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t y = y0; y < y1; y++)
    for (int x = 0; x < W; x++) {
      uint32_t c = (x < 16 && y < 16) ? c565(31, 0, 0) : (x >= 16 && x < 32 && y < 16) ? c565(0, 63, 0) : (x >= 32 && y < 16) ? c565(0, 0, 31) : (y >= 40) ? c565(31, 63, 31) : c565((x * 5 / 64) & 31, (y * 3) & 63, ((x ^ y) & 31));
      rows[(y - y0) * W + x] = c;
    }
}
/** The framebuffer file as 0xRRGGBB pixels, from its depth, honouring the pitch. */
static std::vector<uint32_t> readFb(const std::string& path, int w, int h, int bits) {
  std::string raw = slurp(path.c_str());
  int pitch = w * bits / 8 + 32;
  std::vector<uint32_t> out((size_t)w * h);
  for (int y = 0; y < h; y++)
    for (int x = 0; x < w; x++) {
      const uint8_t* p = (const uint8_t*)raw.data() + (size_t)y * pitch + x * bits / 8;
      uint32_t r, g, b;
      if (bits == 16) { uint16_t v = p[0] | p[1] << 8; r = (v >> 11) & 31; g = (v >> 5) & 63; b = v & 31; r = r << 3 | r >> 2; g = g << 2 | g >> 4; b = b << 3 | b >> 2; }
      else { b = p[0]; g = p[1]; r = p[2]; }
      out[(size_t)y * w + x] = r << 16 | g << 8 | b;
    }
  return out;
}
static std::string ppm(const std::vector<uint32_t>& px, int w, int h) {
  std::string s = "P6\n" + std::to_string(w) + " " + std::to_string(h) + "\n255\n";
  for (uint32_t c : px) { s += (char)(c >> 16); s += (char)(c >> 8); s += (char)c; }
  return s;
}
static void ev(std::string& s, int type, int code, int value) { input_event e = {}; e.type = type; e.code = code; e.value = value; s.append((const char*)&e, sizeof e); }

int main(int argc, char** argv) {
  if (argc < 3) return 2;
  setenv("ZINC_RENDER_THREADS", "1", 1);   // the pool is created once per process
  std::string dir = argv[2];
  std::string first;
  for (int bits : {16, 24, 32}) {
    std::string path = dir + "/fb" + std::to_string(bits);
    setenv("ZINC_FBDEV_SIM", path.c_str(), 1);
    sim_fb = getenv("ZINC_FBDEV_SIM");
    setenv("ZINC_FBDEV_SIM_FORMAT", ("64x48x" + std::to_string(bits)).c_str(), 1);
    HalConfig cfg = {64, 48, "t", 1};
    CHECK(fb_init(&cfg));
    HalFrame f = {64, 48, 0, 0, 64, 48, render};
    fb_present(&f);
    fb_shutdown();
    std::string got = ppm(readFb(path, 64, 48, bits), 64, 48);
    if (bits == 16) { CHECK(matchesGolden(argv[1], got)); first = got; }
    CHECK(got == first);   // 16, 24 and 32 bpp: the same picture
    W = 0; xmap = ymap = nullptr; ndev = 0;
  }
  // letterbox: a 64x48 surface on a 128x112 screen is scaled 2x (nearest) and centred vertically
  {
    std::string path = dir + "/fbbox";
    setenv("ZINC_FBDEV_SIM", path.c_str(), 1); sim_fb = getenv("ZINC_FBDEV_SIM");
    setenv("ZINC_FBDEV_SIM_FORMAT", "128x112x32", 1);
    HalConfig cfg = {64, 48, "t", 1};
    CHECK(fb_init(&cfg));
    CHECK(dw == 128 && dh == 96 && dx == 0 && dy == 8);   // 2x: 128 x 96 at (0, 8)
    HalFrame f = {64, 48, 0, 0, 64, 48, render};
    fb_present(&f);
    fb_shutdown();
    auto px = readFb(path, 128, 112, 32);
    std::vector<uint32_t> want = [&] { std::string g = argv[1] ? slurp(argv[1]) : ""; std::vector<uint32_t> v; const uint8_t* p = (const uint8_t*)g.data() + g.size() - 64 * 48 * 3; for (int i = 0; i < 64 * 48; i++) v.push_back(p[i * 3] << 16 | p[i * 3 + 1] << 8 | p[i * 3 + 2]); return v; }();
    for (int y = 0; y < 96; y++) for (int x = 0; x < 128; x++) CHECK(px[(size_t)(y + 8) * 128 + x] == want[(size_t)(y / 2) * 64 + x / 2]);
    CHECK(px[0] == 0 && px[(size_t)111 * 128 + 127] == 0);   // the bars are black
    W = 0; xmap = ymap = nullptr; ndev = 0;
  }
  // multitouch script on a 128x112 screen showing the 64x48 surface at 2x: two fingers down, one moves, then both lift
  {
    std::string script;
    ev(script, EV_ABS, ABS_MT_SLOT, 0); ev(script, EV_ABS, ABS_MT_TRACKING_ID, 7); ev(script, EV_ABS, ABS_MT_POSITION_X, 20); ev(script, EV_ABS, ABS_MT_POSITION_Y, 8 + 10);
    ev(script, EV_ABS, ABS_MT_SLOT, 1); ev(script, EV_ABS, ABS_MT_TRACKING_ID, 8); ev(script, EV_ABS, ABS_MT_POSITION_X, 100); ev(script, EV_ABS, ABS_MT_POSITION_Y, 8 + 60); ev(script, EV_SYN, SYN_REPORT, 0);
    ev(script, EV_ABS, ABS_MT_SLOT, 0); ev(script, EV_ABS, ABS_MT_POSITION_X, 40); ev(script, EV_SYN, SYN_REPORT, 0);
    ev(script, EV_ABS, ABS_MT_SLOT, 0); ev(script, EV_ABS, ABS_MT_TRACKING_ID, -1); ev(script, EV_ABS, ABS_MT_SLOT, 1); ev(script, EV_ABS, ABS_MT_TRACKING_ID, -1); ev(script, EV_SYN, SYN_REPORT, 0);
    std::ofstream(dir + "/touch.evt", std::ios::binary) << script;
    setenv("ZINC_FBDEV_SIM", (dir + "/fbtouch").c_str(), 1); sim_fb = getenv("ZINC_FBDEV_SIM");
    setenv("ZINC_FBDEV_SIM_INPUT", (dir + "/touch.evt").c_str(), 1); sim_input = getenv("ZINC_FBDEV_SIM_INPUT");
    setenv("ZINC_FBDEV_SIM_FORMAT", "128x112x32", 1);
    HalConfig cfg = {64, 48, "t", 1};
    CHECK(fb_init(&cfg) && ndev == 1);
    HalInput in = {};
    fb_poll(&in);   // frame 1: two fingers
    CHECK(in.ntouch == 2 && in.touch[0].id == 7 && in.touch[1].id == 8 && in.pdown);
    CHECK(in.touch[0].x == 10 && in.touch[0].y == 5 && in.touch[1].x == 50 && in.touch[1].y == 30);   // framebuffer pixels back to surface coordinates
    in = {};
    fb_poll(&in);   // frame 2: finger 0 moved
    CHECK(in.ntouch == 2 && in.touch[0].x == 20 && in.touch[1].x == 50);
    in = {};
    fb_poll(&in);   // frame 3: both lifted
    CHECK(in.ntouch == 0 && !in.pdown);
    in = {};
    fb_poll(&in);   // the script is over: nothing new
    CHECK(in.ntouch == 0);
    fb_shutdown();
  }
  printf("fbdev sim ok\n");
}
