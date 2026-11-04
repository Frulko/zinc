#include "gl_clip.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <initializer_list>

int main() {
  using zn_gl::roundedClipCoversBox;
  assert(roundedClipCoversBox(0, 0, 20, 30, 8, -5, -29, 5, 29));
  assert(roundedClipCoversBox(0, 0, 20, 30, 8, -19, -5, 19, 5));
  assert(!roundedClipCoversBox(0, 0, 20, 30, 8, -20, -30, -15, -25));
  assert(!roundedClipCoversBox(0, 0, 20, 30, 8, -21, -5, 19, 5));
  assert(!roundedClipCoversBox(0, 0, 20, 30, 8, 5, 0, -5, 1));
  int checked = 0;
  for (float radius : {0.f, 1.f, 7.5f, 20.f})
    for (int y = -125; y <= 125; y += 3)
      for (int x = -85; x <= 85; x += 3) {
        const float x0 = x / 4.f, y0 = y / 4.f, x1 = x0 + 3.75f, y1 = y0 + 5.25f;
        if (!roundedClipCoversBox(0, 0, 20, 30, radius, x0, y0, x1, y1)) continue;
        for (float py : {y0, (y0 + y1) / 2, y1})
          for (float px : {x0, (x0 + x1) / 2, x1}) {
            const float qx = std::fabs(px) - (20 - radius), qy = std::fabs(py) - (30 - radius);
            const float dx = std::fmax(qx, 0), dy = std::fmax(qy, 0);
            const float coverage = qx > 0 && qy > 0 ? std::fmin(1.f, std::fmax(0.f, 0.5f - (std::sqrt(dx * dx + dy * dy) - radius))) : 1.f;
            assert(coverage == 1.f);
            checked++;
          }
      }
  assert(checked > 10000);
  std::printf("gl_clip: %d coverage checks passed\n", checked);
}
