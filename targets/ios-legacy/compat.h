#pragma once
#include <time.h>

// iOS 7 has Mach clocks but predates the POSIX clock_gettime entry point.
#define CLOCK_REALTIME 0
#define CLOCK_MONOTONIC 6
#define CLOCK_MONOTONIC_RAW 4
#ifdef __cplusplus
extern "C" {
#endif
int clock_gettime(int clock, struct timespec* time);
#ifdef __cplusplus
}
#endif
