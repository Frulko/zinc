// The driver through hw.h against a model of the IS31FL3730 (ZN-126): the bytes that reach the chip leave its column registers equal to what the driver says it shows.
//   c++ -std=c++17 -DSCROLLPHAT_STUB -DZN_HW_SIM -I runtime/include plugins/display-scrollphat/test_hw.cpp -o /tmp/sp_hw && /tmp/sp_hw
#define ZP_DISPLAY_SCROLLPHAT_ADDRESS 96
#define ZP_DISPLAY_SCROLLPHAT_I2C ""
#define ZP_DISPLAY_SCROLLPHAT_BRIGHTNESS 255
#define ZP_DISPLAY_SCROLLPHAT_THRESHOLD 96
#define ZP_DISPLAY_SCROLLPHAT_INVERT 0
#define ZP_DISPLAY_SCROLLPHAT_ROTATE 0
#define ZP_DISPLAY_SCROLLPHAT_SCALE 1
#define ZP_DISPLAY_SCROLLPHAT_DEBUG 0
#include "scrollphat.cpp"
#include <assert.h>
HalDisplay* hal_display;

struct Is31 { uint8_t reg[0x20]; uint8_t latched[11]; int updates = 0; };
static Is31 chip;
static int is31_write(void* u, const uint8_t* d, int n) {   // register byte, then auto-incremented data; a write to 0x0C latches the columns
  Is31* c = (Is31*)u;
  for (int i = 1; i < n; i++) {
    int r = d[0] + i - 1;
    c->reg[r] = d[i];
    if (r == 0x0C) { memcpy(c->latched, c->reg + 1, 11); c->updates++; }
  }
  return 1;
}
static zn_hw_model model = {is31_write, nullptr, &chip};

static void render(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t i = 0; i < (y1 - y0) * W; i++) rows[i] = 0;
  if (y0 == 0) rows[0] = 0xFFFFFF;
  if (y1 == 5) rows[(4 - y0) * W + 10] = 0xFFFFFF;
}

int main() {
  assert(!strcmp(ZN_HW_BACKEND, "sim"));
  HalConfig cfg = {11, 5, "t", 1};
  assert(!init(&cfg));                          // no chip on the bus: the driver disables itself
  zn_hw_sim_attach_i2c(96, &model);
  assert(init(&cfg));
  assert(chip.reg[0x00] == 0x03 && chip.reg[0x19] == 128);   // 5x11 mode, full brightness
  HalFrame f = {11, 5, 0, 0, 11, 5, render};
  present(&f);
  assert(chip.updates == 1 && chip.latched[0] == 0x01 && chip.latched[10] == 0x10 && !memcmp(chip.latched, shown, 11));
  present(&f);
  assert(chip.updates == 1);                    // same LEDs: nothing sent
  shutdown();
  assert(chip.reg[1] == 0 && chip.reg[11] == 0);  // blanked at exit
  printf("scrollphat hw ok\n");
}
