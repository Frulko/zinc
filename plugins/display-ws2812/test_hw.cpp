// The driver through hw.h and SPI against a decoder of the 3-SPI-bits-per-bit WS2812 stream (ZN-126): the LED bytes decoded from the wire equal the driver's own.
//   c++ -std=c++17 -DWS2812_STUB -DZN_HW_SIM -I runtime/include plugins/display-ws2812/test_hw.cpp -o /tmp/ws_hw && /tmp/ws_hw
#define ZP_DISPLAY_WS2812_ROTATE 0
#define ZP_DISPLAY_WS2812_ORIGIN "top-left"
#define ZP_DISPLAY_WS2812_VERTICAL 0
#define ZP_DISPLAY_WS2812_SERPENTINE 1
#define ZP_DISPLAY_WS2812_PIN 13
#define ZP_DISPLAY_WS2812_SPIDEV ""
#define ZP_DISPLAY_WS2812_BRIGHTNESS 255
#define ZP_DISPLAY_WS2812_GAMMA 1
#define ZP_DISPLAY_WS2812_ORDER "GRB"
#define ZP_DISPLAY_WS2812_SCALE 1
#define ZP_DISPLAY_WS2812_DEBUG 0
#include "ws2812.cpp"
#include <assert.h>
HalDisplay* hal_display;

static uint8_t decoded[8 * 8 * 3];
static int frames_seen;
static int spi_write(void*, const uint8_t* d, int n) {
  int bytes = (n - 96) / 3;
  assert(bytes == 8 * 8 * 3);
  for (int i = 0; i < bytes; i++) {
    uint32_t v = d[i * 3] << 16 | d[i * 3 + 1] << 8 | d[i * 3 + 2];
    uint8_t b = 0;
    for (int k = 7; k >= 0; k--) { uint32_t tri = (v >> (k * 3)) & 7; assert(tri == 4 || tri == 6); b = b << 1 | (tri == 6); }
    decoded[i] = b;
  }
  frames_seen++;
  return 1;
}
static zn_hw_model model = {spi_write, nullptr, nullptr};

static void render(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t i = 0; i < (y1 - y0) * W; i++) rows[i] = 0;
  if (y0 == 0) { rows[0] = 0xFF0000; rows[1] = 0x00FF00; rows[W + 7] = 0x0000FF; }
}

int main() {
  HalConfig cfg = {8, 8, "t", 1};
  assert(!init(&cfg));
  zn_hw_sim_attach_spi(&model);
  assert(init(&cfg));
  HalFrame f = {8, 8, 0, 0, 8, 8, render};
  present(&f);
  assert(frames_seen == 1 && !memcmp(decoded, leds, sizeof decoded));
  assert(decoded[0] == 0 && decoded[1] == 255 && decoded[2] == 0);   // first LED red in GRB order
  printf("ws2812 hw ok\n");
}
