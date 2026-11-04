#pragma once

namespace zn_gl {
// Keep the antialiased corners in the shader; only the fully covered central cross is redundant.
inline bool roundedClipCoversBox(float cx, float cy, float hw, float hh, float r,
                                float x0, float y0, float x1, float y1) {
  return x0 <= x1 && y0 <= y1 && x0 >= cx - hw && x1 <= cx + hw && y0 >= cy - hh && y1 <= cy + hh &&
    ((x0 >= cx - hw + r + 0.5f && x1 <= cx + hw - r - 0.5f) ||
     (y0 >= cy - hh + r + 0.5f && y1 <= cy + hh - r - 0.5f));
}
}
