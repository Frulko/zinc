#pragma once
#include <cmath>

namespace zn3d {
// The saved, unflipped view-projection matrix maps world points into the rendered pixel grid.
inline bool projectPoint(const float* m, int width, int height, double x, double y, double z,
                         int& px, int& py, double& depth) {
  const double w = m[3]*x + m[7]*y + m[11]*z + m[15];
  if (!(w > 0) || !std::isfinite(w)) return false;
  const double nx = (m[0]*x + m[4]*y + m[8]*z + m[12])/w;
  const double ny = (m[1]*x + m[5]*y + m[9]*z + m[13])/w;
  const double nz = (m[2]*x + m[6]*y + m[10]*z + m[14])/w;
  if (!(nx >= -1 && nx < 1 && ny > -1 && ny <= 1 && nz >= -1 && nz <= 1)) return false;
  px = (int)((nx*.5 + .5)*width);
  py = (int)((.5 - ny*.5)*height);
  depth = nz*.5 + .5;
  return px >= 0 && px < width && py >= 0 && py < height;
}
}
