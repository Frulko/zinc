// Frame -> IS31FL3730 column bytes self-check (threshold, bit order, 180 degree rotation, damage skipping).
//   c++ -std=c++17 -DSCROLLPHAT_STUB -I runtime/include plugins/display-scrollphat/test_frame.cpp -o /tmp/sp && /tmp/sp
#define ZP_DISPLAY_SCROLLPHAT_ADDRESS 96
#define ZP_DISPLAY_SCROLLPHAT_I2C ""
#define ZP_DISPLAY_SCROLLPHAT_BRIGHTNESS 255
#define ZP_DISPLAY_SCROLLPHAT_THRESHOLD 96
#define ZP_DISPLAY_SCROLLPHAT_INVERT 0
#define ZP_DISPLAY_SCROLLPHAT_ROTATE rot
#define ZP_DISPLAY_SCROLLPHAT_SCALE 1
#define ZP_DISPLAY_SCROLLPHAT_DEBUG 1
static int rot = 0, both = 1;
#include "scrollphat.cpp"
#include <assert.h>
HalDisplay* hal_display;

static void render(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t i = 0; i < (y1 - y0) * W; i++) rows[i] = 0x202020;   // dim: below the threshold
  if (y0 == 0) rows[0] = 0xFFFFFF;                                     // (0, 0) lit
  if (both && y1 == 5) rows[(4 - y0) * W + 10] = 0x00FF00;                     // (10, 4) lit (green is bright enough)
}

int main() {
  HalConfig cfg = {11, 5, "t", 1};
  assert(init(&cfg) && pwm() == 128);
  HalFrame f = {11, 5, 0, 0, 11, 5, render};
  present(&f);
  assert(shown[0] == 0x01 && shown[10] == 0x10 && frames == 1);  // bit y = row y
  present(&f);
  assert(frames == 1);                                            // same LEDs: nothing sent
  rot = 180;
  present(&f);
  both = 0;
  present(&f);
  assert(shown[0] == 0 && shown[10] == 0x10 && frames == 2);  // (0, 0) shows at the opposite corner
  printf("scrollphat frame ok\n");
}
