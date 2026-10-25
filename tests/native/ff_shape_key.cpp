// Include the replay to exercise its private cache key without a GPU or raster context.
#include "../../targets/console/ff_replay.cpp"
#include <cassert>
int main() {
  using namespace zn::ff;
  Cmd c{}; c.kind = POLY; c.n = 1; c.w = c.h = 10;
  const float triangle[] = {3, 0, 0, 10, 0, 0, 10};
  const float quad[] = {4, 0, 0, 10, 0, 10, 10, 0, 10};
  moved.clear();
  const auto first = shapeKey(c, triangle);
  const auto second = shapeKey(c, triangle);
  assert(first == second);
  const auto other = shapeKey(c, quad);
  assert(other != first);
  assert(shapeKey(c, triangle) == first);
  assert(shapeKey(c, quad) == other);
}
