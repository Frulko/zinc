// LED order self-check for the common 8x32 flexible panel (column-serpentine, data in at the top-left) and GRB bytes.
//   c++ -std=c++17 -DWS2812_STUB -I runtime/include plugins/display-ws2812/test_map.cpp -o /tmp/ws2812_map && /tmp/ws2812_map
#define ZP_DISPLAY_WS2812_ROTATE 0
#define ZP_DISPLAY_WS2812_ORIGIN "top-left"
#define ZP_DISPLAY_WS2812_VERTICAL 1
#define ZP_DISPLAY_WS2812_SERPENTINE 1
#define ZP_DISPLAY_WS2812_PIN 13
#define ZP_DISPLAY_WS2812_SPIDEV ""
#define ZP_DISPLAY_WS2812_BRIGHTNESS 255
#define ZP_DISPLAY_WS2812_GAMMA 1
#define ZP_DISPLAY_WS2812_ORDER "GRB"
#define ZP_DISPLAY_WS2812_SCALE 1
#define ZP_DISPLAY_WS2812_DEBUG 1
#include "ws2812.cpp"
#include <assert.h>
HalDisplay* hal_display;

static void render(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t i = 0; i < (y1 - y0) * W; i++) rows[i] = 0;
  if (y0 == 0) rows[31] = 0xFF0000;  // one red pixel at (31, 0)
}

int main() {
  HalConfig cfg = {32, 8, "t", 1};
  assert(init(&cfg));
  assert(led_index(0, 0) == 0 && led_index(0, 7) == 7);      // first column runs down
  assert(led_index(1, 7) == 8 && led_index(1, 0) == 15);     // second column runs up
  assert(led_index(31, 0) == 255 && led_index(31, 7) == 248);
  HalFrame f = {32, 8, 0, 0, 32, 8, render};
  present(&f);
  assert(leds[255 * 3 + 0] == 0 && leds[255 * 3 + 1] == 255 && leds[255 * 3 + 2] == 0);  // GRB: red is the 2nd byte
  printf("ws2812 mapping ok\n");
}
