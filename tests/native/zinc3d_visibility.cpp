#include "plugins/3d/native/visibility.h"
#include <cassert>
#include <limits>

int main() {
  const float identity[16] = {1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1};
  int x, y; double depth;
  assert(zn3d::projectPoint(identity, 200, 100, .5, .5, .25, x, y, depth));
  assert(x == 150 && y == 25 && depth == .625);
  assert(zn3d::projectPoint(identity, 200, 100, -1, 1, -1, x, y, depth));
  assert(x == 0 && y == 0 && depth == 0);
  assert(!zn3d::projectPoint(identity, 200, 100, 1, 0, 0, x, y, depth));
  assert(!zn3d::projectPoint(identity, 200, 100, 0, -1, 0, x, y, depth));
  assert(!zn3d::projectPoint(identity, 200, 100, 0, 0, 2, x, y, depth));
  assert(!zn3d::projectPoint(identity, 200, 100, std::numeric_limits<double>::quiet_NaN(), 0, 0, x, y, depth));
  const float perspective[16] = {1,0,0,0, 0,1,0,0, 0,0,-1,-1, 0,0,-2,0};
  assert(zn3d::projectPoint(perspective, 200, 100, 1, .5, -2, x, y, depth));
  assert(x == 150 && y == 37 && depth == .5);
  assert(!zn3d::projectPoint(perspective, 200, 100, 0, 0, 1, x, y, depth));
}
