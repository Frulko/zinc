// The Scroll pHAT driver against the IS31FL3730 model (ZN-128): the 11x5 picture equals the golden, a missing latch write or configuration leaves the panel dark.
//   usage: chip_scrollphat <golden.pbm>
#define ZP_DISPLAY_SCROLLPHAT_ADDRESS 96
#define ZP_DISPLAY_SCROLLPHAT_I2C ""
#define ZP_DISPLAY_SCROLLPHAT_BRIGHTNESS 255
#define ZP_DISPLAY_SCROLLPHAT_THRESHOLD 96
#define ZP_DISPLAY_SCROLLPHAT_INVERT 0
#define ZP_DISPLAY_SCROLLPHAT_ROTATE 0
#define ZP_DISPLAY_SCROLLPHAT_SCALE 1
#define ZP_DISPLAY_SCROLLPHAT_DEBUG 0
#include "scrollphat.cpp"
#include "chip_common.h"
#include "sim/chips/is31fl3730.h"
HalDisplay* hal_display;

static void render(uint32_t* rows, int32_t y0, int32_t y1) {   // a snake: a row of 5 lit LEDs, a corner and a lone one
  for (int32_t y = y0; y < y1; y++)
    for (int x = 0; x < W; x++) rows[(y - y0) * W + x] = (y == 0 && x < 5) || (x == 4 && y < 3) || (x == 10 && y == 4) ? 0xFFFFFF : 0;
}

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  zn::sim::Is31fl3730 chip;
  Tee tee{chip.model(), {}};
  zn_hw_model m = tee.model();
  zn_hw_sim_attach_i2c(96, &m);
  HalConfig cfg = {11, 5, "t", 1};
  CHECK(init(&cfg));
  HalFrame f = {11, 5, 0, 0, 11, 5, render};
  present(&f);
  CHECK(chip.errors.empty() && chip.running() && chip.reg[0x19] == 128 && chip.updates == 1);
  CHECK(matchesGolden(argv[1], chip.pbm()));
  // mutations of the captured stream: no configuration byte (0x00 0x03 -> 0x00 0x00), no latch write (0x0C)
  auto replay = [&](int mode) {
    zn::sim::Is31fl3730 c;
    for (auto w : tee.log) {
      if (mode == 1 && w.size() == 2 && w[0] == 0x00) w[1] = 0x00;
      if (mode == 2 && w.size() > 2 && w[0] == 0x01) w.resize(w.size() - 1);   // the column write loses its trailing update byte
      c.write(w.data(), (int)w.size());
    }
    return c.pbm();
  };
  CHECK(replay(0) == chip.pbm());
  CHECK(replay(1) != chip.pbm());
  CHECK(replay(2) != chip.pbm());
  printf("scrollphat model ok\n");
}
