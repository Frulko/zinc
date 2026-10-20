// The ssd1306 driver against the SSD1306 model: the frame the chip would show equals the golden bitmap, and wrong init bytes are caught (ZN-127).
//   usage: chip_ssd1306 <golden.pbm>      build: tests/t1/chip_models.sh
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
#include "chip_common.h"
#include "sim/chips/ssd1306.h"
HalDisplay* hal_display;

static void render(uint32_t* rows, int32_t y0, int32_t y1) {   // an L, a diagonal and a lit box: asymmetric, so a mirrored or flipped panel shows
  for (int32_t y = y0; y < y1; y++)
    for (int x = 0; x < W; x++) rows[(y - y0) * W + x] = (x < 3 && y < 20) || (y == 19 && x < 12) || x == y * 2 || (x > 100 && y > 40) ? 0xFFFFFF : 0;
}

static std::vector<std::vector<uint8_t>> capture() {
  zn::sim::Ssd1306 chip;
  Tee tee{chip.model(), {}};
  zn_hw_model m = tee.model();
  zn_hw_sim_attach_i2c(60, &m);
  HalConfig cfg = {128, 64, "t", 1};
  if (!init(&cfg)) { fprintf(stderr, "init failed\n"); exit(1); }
  HalFrame f = {128, 64, 0, 0, 128, 64, render};
  present(&f);
  return tee.log;
}
static zn::sim::Ssd1306 replay(const std::vector<std::vector<uint8_t>>& stream) {
  zn::sim::Ssd1306 chip;
  for (const auto& w : stream) chip.write(w.data(), (int)w.size());
  return chip;
}
/** Changes the first occurrence of `from` in the command bytes (after a control byte 0x00) to `to`; `after`: the byte that follows `from` instead (an argument). */
static bool mutate(std::vector<std::vector<uint8_t>>& s, uint8_t from, uint8_t to, bool argument = false) {
  for (auto& w : s) if (w[0] == 0x00) for (size_t i = 1; i < w.size(); i++) if (w[i] == from) { w[i + argument] = to; return true; }
  return false;
}

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  auto stream = capture();
  zn::sim::Ssd1306 good = replay(stream);
  good.height = 64;
  for (const auto& e : good.errors) fprintf(stderr, "model: %s\n", e.c_str());
  CHECK(good.errors.empty());
  CHECK(good.on && good.chargePump && good.addrMode == 0 && good.mux == 64);
  CHECK(matchesGolden(argv[1], good.pbm(128)));
  { auto s = stream; CHECK(mutate(s, 0x14, 0x10)); auto c = replay(s); CHECK(!c.errors.empty()); }        // charge pump off, display on: dark panel
  { auto s = stream; CHECK(mutate(s, 0x20, 0x02, true)); auto c = replay(s); CHECK(!c.errors.empty()); }        // 0x20 0x00 -> 0x20 0x02: page mode, the windows are ignored
  { auto s = stream; CHECK(mutate(s, 0xA1, 0xA0)); auto c = replay(s); c.height = 64; CHECK(c.pbm(128) != good.pbm(128)); }   // segment remap lost: mirrored panel
  { auto s = stream; CHECK(mutate(s, 0xC8, 0xC0)); auto c = replay(s); c.height = 64; CHECK(c.pbm(128) != good.pbm(128)); }   // COM scan direction lost: flipped panel
  printf("ssd1306 model ok\n");
}
