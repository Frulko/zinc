// The driver through hw.h against a model of the SSD1306 (ZN-126): command sequence, column/page window and GDDRAM contents equal what the driver says the panel shows.
//   c++ -std=c++17 -DSSD1306_STUB -DZN_HW_SIM -I runtime/include plugins/display-ssd1306/test_hw.cpp -o /tmp/ssd_hw && /tmp/ssd_hw
#define ZP_DISPLAY_SSD1306_ADDRESS 60
#define ZP_DISPLAY_SSD1306_SDA 21
#define ZP_DISPLAY_SSD1306_SCL 22
#define ZP_DISPLAY_SSD1306_FREQ 400000
#define ZP_DISPLAY_SSD1306_I2C ""
#define ZP_DISPLAY_SSD1306_DITHER "threshold"
#define ZP_DISPLAY_SSD1306_THRESHOLD 128
#define ZP_DISPLAY_SSD1306_INVERT 0
#define ZP_DISPLAY_SSD1306_FLIP 0
#define ZP_DISPLAY_SSD1306_CONTRAST 207
#define ZP_DISPLAY_SSD1306_SCALE 1
#define ZP_DISPLAY_SSD1306_DEBUG 0
#include "ssd1306.cpp"
#include <assert.h>
HalDisplay* hal_display;

struct Oled { uint8_t gddram[8][128]; int col0 = 0, col1 = 127, page0 = 0, page1 = 7, col = 0, page = 0; bool on = false; int contrast = -1; };
static Oled oled;
static int oled_write(void* u, const uint8_t* d, int n) {
  Oled* o = (Oled*)u;
  if (d[0] == 0x00) {   // commands
    for (int i = 1; i < n; i++) {
      uint8_t c = d[i];
      if (c == 0x21) { o->col0 = d[i + 1]; o->col1 = d[i + 2]; o->col = o->col0; i += 2; }
      else if (c == 0x22) { o->page0 = d[i + 1]; o->page1 = d[i + 2]; o->page = o->page0; i += 2; }
      else if (c == 0x81) { o->contrast = d[i + 1]; i++; }
      else if (c == 0xAF) o->on = true;
      else if (c == 0xD5 || c == 0xA8 || c == 0xD3 || c == 0x8D || c == 0x20 || c == 0xDA || c == 0xD9 || c == 0xDB) i++;   // one argument
    }
  } else if (d[0] == 0x40) {   // data: fills the window, column by column then page by page
    for (int i = 1; i < n; i++) {
      o->gddram[o->page][o->col] = d[i];
      if (++o->col > o->col1) { o->col = o->col0; if (++o->page > o->page1) o->page = o->page0; }
    }
  } else return 0;
  return 1;
}
static zn_hw_model model = {oled_write, nullptr, &oled};

static void render(uint32_t* rows, int32_t y0, int32_t y1) {   // a diagonal line and a box
  for (int32_t y = y0; y < y1; y++)
    for (int x = 0; x < W; x++) rows[(y - y0) * W + x] = (x == y * 2 || (x > 100 && y > 40)) ? 0xFFFFFF : 0;
}

int main() {
  HalConfig cfg = {128, 64, "t", 1};
  assert(!init(&cfg));
  zn_hw_sim_attach_i2c(60, &model);
  assert(init(&cfg));
  assert(oled.on && oled.contrast == 207);
  HalFrame f = {128, 64, 0, 0, 128, 64, render};
  present(&f);
  for (int p = 0; p < P; p++) assert(!memcmp(oled.gddram[p], shown + p * W, W));
  assert((oled.gddram[0][0] & 1) && (oled.gddram[0][2] & 2) && (oled.gddram[1][16] & 1) && oled.gddram[7][127] == 0xFF);   // the diagonal and the lit box (a column that is 0xFF is sent too)
  printf("ssd1306 hw ok\n");
}
