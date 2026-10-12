#pragma once
// Optional diagnostics, called on the render thread. GPU bytes describe requested storage, not driver residency.
#include <stdint.h>
struct ZnResourceStats { uint64_t objects, cpuBytes, gpuBytes, borrowedBytes, active; };
using ZnResourceStatsFn = ZnResourceStats (*)(void*);
extern "C" void zn_resource_stats_register(const char* name, ZnResourceStatsFn read, void* owner) __attribute__((weak));
// Returned text is borrowed until the next snapshot on the host thread.
extern "C" const char* zn_resource_stats_json(void) __attribute__((weak));
struct ZnResourceStatsRegistration {
  ZnResourceStatsRegistration(const char* name, ZnResourceStatsFn read, void* owner = nullptr) {
    if (zn_resource_stats_register) zn_resource_stats_register(name, read, owner);
  }
};
