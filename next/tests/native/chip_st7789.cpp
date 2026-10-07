// display-st7789 on the host (ZN-128): the real driver with a host stub of esp_lcd (tests/native/stubs) against the ST7789 panel model and the CST820 touch model, with the
// settings of the board preset boards/esp32-2432s022.json. The frame equals the golden image, damage costs only its bounding box, touch scripts reach the pointer, wrong init is caught.
//   usage: chip_st7789 <golden.ppm>
#define ZP_DISPLAY_ST7789_CONTROLLER "st7789"
#define ZP_DISPLAY_ST7789_BUS "i80"
#define ZP_DISPLAY_ST7789_MOSI 23
#define ZP_DISPLAY_ST7789_SCLK 18
#define ZP_DISPLAY_ST7789_DATA 15, 13, 12, 14, 27, 25, 33, 32
#define ZP_DISPLAY_ST7789_WR 4
#define ZP_DISPLAY_ST7789_RD 2
#define ZP_DISPLAY_ST7789_CS 17
#define ZP_DISPLAY_ST7789_DC 16
#define ZP_DISPLAY_ST7789_RST (-1)
#define ZP_DISPLAY_ST7789_BL 0
#define ZP_DISPLAY_ST7789_BRIGHTNESS 255
#define ZP_DISPLAY_ST7789_HZ 10000000
#define ZP_DISPLAY_ST7789_LINES 6
#define ZP_DISPLAY_ST7789_XOFF 0
#define ZP_DISPLAY_ST7789_YOFF 0
#define ZP_DISPLAY_ST7789_MADCTL 8
#define ZP_DISPLAY_ST7789_INVERT 0
#define ZP_DISPLAY_ST7789_TOUCH "cst820"
#define ZP_DISPLAY_ST7789_TSDA 21
#define ZP_DISPLAY_ST7789_TSCL 22
#define ZP_DISPLAY_ST7789_TADDRESS 21
#define ZP_DISPLAY_ST7789_TSWAP 0
#define ZP_DISPLAY_ST7789_TFLIPX 0
#define ZP_DISPLAY_ST7789_TFLIPY 0
#define ZP_DISPLAY_ST7789_TDEBUG 0
#define ZP_DISPLAY_ST7789_PERF 0
#define ZP_DISPLAY_ST7789_DEBUG 0
#include "st7789.cpp"
#include "chip_common.h"
#include "sim/chips/cst820.h"
#include "sim/chips/st7789.h"
HalDisplay* hal_display;

static int clockx = 100;   // a small box that moves between frames: the damage
static uint32_t paint(int x, int y) {
  if (x < 60 && y < 60) return 0xFF0000;                       // red, green, blue squares: the colour order shows
  if (x >= 60 && x < 120 && y < 60) return 0x00FF00;
  if (x >= 120 && x < 180 && y < 60) return 0x0000FF;
  if (y >= 300) return 0xFFFFFF;                               // a white strip at the bottom: MADCTL MY would flip it
  if (x >= clockx && x < clockx + 40 && y >= 100 && y < 110) return 0xFFFF00;
  return (x ^ y) & 16 ? 0x303030 : 0x101010;
}
static void render(uint32_t* rows, int32_t y0, int32_t y1) { for (int32_t y = y0; y < y1; y++) for (int x = 0; x < W; x++) rows[(y - y0) * W + x] = paint(x, y); }
static int dx0 = 0, dx1 = 0;
static void render_damage(uint32_t* rows, int32_t y0, int32_t y1) {   // only the damaged rectangle (dx0..dx1, rows 100..109), the rest keeps the sentinel
  for (int32_t y = y0; y < y1; y++) if (y >= 100 && y < 110) for (int x = dx0; x < dx1; x++) rows[(y - y0) * W + x] = paint(x, y);
}

struct Rig {
  zn::sim::St7789 panel{240, 320};
  zn::sim::Cst820 touch;
  zn_hw_model pm, tm;
  Rig() { panel.panelBgr = true; pm = panel.model(); tm = touch.model(); zn_stub_lcd = &pm; zn_hw_sim_attach_i2c(21, &tm); }
};

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  { zn_stub_lcd = nullptr; HalConfig cfg = {240, 320, "t", 1}; CHECK(!init(&cfg)); }   // no bus: the driver says so and disables itself
  Rig rig;
  HalConfig cfg = {240, 320, "t", 1};
  CHECK(init(&cfg));
  CHECK(rig.touch.noSleep && zinc_display_touch());
  HalFrame f = {240, 320, 0, 0, 240, 320, render};
  present(&f);
  for (const auto& e : rig.panel.errors) fprintf(stderr, "panel: %s\n", e.c_str());
  CHECK(rig.panel.errors.empty());
  CHECK(rig.panel.on && !rig.panel.sleeping && rig.panel.colmod == 0x55 && rig.panel.madctl == 8 && !rig.panel.inverted);
  CHECK(rig.panel.writes == 240 * 320);
  CHECK(rig.panel.fb[0] == 0xFF0000 && rig.panel.fb[70] == 0x00FF00 && rig.panel.fb[130] == 0x0000FF);   // BGR glass + MADCTL BGR: the colours are right
  CHECK(rig.panel.fb[(size_t)310 * 240 + 5] == 0xFFFFFF);
  CHECK(matchesGolden(argv[1], rig.panel.ppm()));
  // damage: the box moves 8 px, only its bounding box (48 x 10) goes over the bus
  rig.panel.resetWrites();
  clockx = 108; dx0 = 100; dx1 = 148;
  HalFrame d = {240, 320, dx0, 100, dx1, 110, render, render_damage};
  present(&d);
  CHECK(rig.panel.errors.empty() && rig.panel.writes == 48 * 10);
  CHECK(rig.panel.fb[(size_t)105 * 240 + 120] == 0xFFFF00 && rig.panel.fb[(size_t)105 * 240 + 102] == ((((102 ^ 105) & 16) ? 0x303030 : 0x101010)));
  // touch: finger down at (30, 200), then released
  HalInput in = {};
  rig.touch.touch(30, 200);
  poll(&in);
  CHECK(in.pdown && in.ntouch == 1 && in.px == 30 && in.py == 200);
  rig.touch.release();
  poll(&in);
  CHECK(!in.pdown && in.px == 30 && in.py == 200);   // the pointer stays where the finger left
  rig.touch.touch(500, 900);
  poll(&in);
  CHECK(in.px == 239 && in.py == 319);               // clamped to the screen
  // wrong init is caught: no sleep-out, 18 bpp, MADCTL mirrored
  { Rig r2; CHECK(init(&cfg)); present(&f); CHECK(r2.panel.errors.empty()); }
  { Rig r3; r3.panel.sleeping = false; r3.panel.on = true; r3.panel.colmod = 0x66; r3.panel.pixels(0x2C, (const uint8_t*)"\0\0", 2); CHECK(!r3.panel.errors.empty()); }   // pixels in 18 bpp
  { Rig r4; r4.panel.param(0x29, nullptr, 0); CHECK(!r4.panel.errors.empty()); }   // display on while asleep
  printf("st7789 model ok\n");
}
