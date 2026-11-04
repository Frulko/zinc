#include "compat.h"
#include <errno.h>
#include <mach/mach_time.h>
#include <sys/time.h>

int clock_gettime(int clock, struct timespec* time) {
  if (!time) { errno = EFAULT; return -1; }
  if (clock == CLOCK_REALTIME) {
    struct timeval wall;
    if (gettimeofday(&wall, 0)) return -1;
    time->tv_sec = wall.tv_sec;
    time->tv_nsec = wall.tv_usec * 1000;
    return 0;
  }
  if (clock != CLOCK_MONOTONIC && clock != CLOCK_MONOTONIC_RAW) { errno = EINVAL; return -1; }
  mach_timebase_info_data_t scale;
  mach_timebase_info(&scale);
  uint64_t ticks = mach_absolute_time();
  uint64_t ns = ticks / scale.denom * scale.numer + ticks % scale.denom * scale.numer / scale.denom;
  time->tv_sec = ns / 1000000000;
  time->tv_nsec = ns % 1000000000;
  return 0;
}
