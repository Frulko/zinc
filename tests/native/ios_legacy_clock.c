// Run on the iOS 7 device, linked with targets/ios-legacy/compat.c.
#include "../../targets/ios-legacy/compat.h"
#include <assert.h>
#include <errno.h>
#include <sys/time.h>
#include <unistd.h>

int main(void) {
  struct timespec before, after, raw, wall;
  struct timeval now;
  assert(clock_gettime(CLOCK_MONOTONIC, &before) == 0);
  usleep(3000);
  assert(clock_gettime(CLOCK_MONOTONIC, &after) == 0);
  assert(after.tv_sec > before.tv_sec || (after.tv_sec == before.tv_sec && after.tv_nsec >= before.tv_nsec));
  assert(clock_gettime(CLOCK_MONOTONIC_RAW, &raw) == 0);
  assert(clock_gettime(CLOCK_REALTIME, &wall) == 0);
  assert(gettimeofday(&now, 0) == 0);
  assert(now.tv_sec - wall.tv_sec >= 0 && now.tv_sec - wall.tv_sec <= 1);
  assert(clock_gettime(-1, &raw) == -1 && errno == EINVAL);
  assert(clock_gettime(CLOCK_REALTIME, 0) == -1 && errno == EFAULT);
  return 0;
}
