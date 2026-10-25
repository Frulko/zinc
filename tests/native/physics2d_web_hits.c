#include "../../plugins/physics2d/web/physics2d_web.c"
#include <assert.h>
int main(void) {
  const double gravity[] = {0, 0};
  const int w = p2d_world_create(gravity, 2);
  const double fixed[] = {0, 10, 20}, moving[] = {2, 7, 20, 0, 80, 0, 0, 0, 0, 1, kBullet | kNoSleep};
  const int wall = p2d_body_create(w, fixed, 3), ball = p2d_body_create(w, moving, 11);
  const double circle[] = {1, 0, 0}, small[] = {.53, 0, 0}, material[] = {.2, .6, 1, 0, 0xffffffffu, kEvents};
  assert(p2d_body_shape(wall, kCircle, circle, 3, material, 6));
  assert(p2d_body_shape(ball, kCircle, small, 3, material, 6));
  int hit = 0;
  for (int i = 0; i < 30; i++) {
    p2d_step(w, 1.0/240, 1);
    const int n = p2d_events(w);
    const double* events = p2d_out();
    for (int j = 0; j < n; j += 9) if (events[j] == 1) {
      assert(events[j+7] > 50 && events[j+8] > 0);
      hit++;
    }
  }
  assert(hit == 1);
  p2d_world_destroy(w);
}
