// The ws2812 driver (Linux SPI encoding, through hw.h) against the WS2812 chain model: legal stream, and the matrix laid out from the board's wiring equals the golden image (ZN-127).
//   usage: chip_ws2812 <golden.ppm>
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
#include "chip_common.h"
#include "sim/chips/ws2812.h"
HalDisplay* hal_display;

static void render(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t y = y0; y < y1; y++)
    for (int x = 0; x < W; x++) rows[(y - y0) * W + x] = y == 0 && x < 3 ? (0xFF0000 >> (8 * x)) : y == 3 && x == 6 ? 0xFFFF00 : x == y ? 0x808080 : 0;   // R G B on the first row, a yellow dot, a grey diagonal
}

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  zn::sim::Ws2812 chip;
  zn_hw_model m = chip.model();
  zn_hw_sim_attach_spi(&m);
  HalConfig cfg = {8, 8, "t", 1};
  CHECK(init(&cfg));
  HalFrame f = {8, 8, 0, 0, 8, 8, render};
  present(&f);
  CHECK(chip.errors.empty() && chip.frames == 1 && chip.bytes.size() == 8 * 8 * 3);
  zn::sim::Ws2812::Wiring w;
  w.serpentine = true;                                  // the driver's own options: row-major serpentine, origin top-left, GRB
  CHECK(chip.at(w, 0, 0) == 0xFF0000 && chip.at(w, 1, 0) == 0x00FF00 && chip.at(w, 2, 0) == 0x0000FF);
  CHECK(chip.at(w, 6, 3) == 0xFFFF00);
  CHECK(matchesGolden(argv[1], chip.ppm(w)));
  // wrong wiring (not serpentine) lays the same chain out differently: the golden catches it
  zn::sim::Ws2812::Wiring flat = w; flat.serpentine = false;
  CHECK(chip.ppm(flat) != chip.ppm(w));
  // a broken stream is reported
  uint8_t bad[96 + 9] = {};
  bad[0] = 0x07;                                        // 111 is no WS2812 bit
  zn::sim::Ws2812 other;
  other.write(bad, sizeof bad);
  CHECK(!other.errors.empty());
  printf("ws2812 model ok\n");
}
