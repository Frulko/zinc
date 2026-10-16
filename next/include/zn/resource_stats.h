#pragma once
// Optional diagnostics, called on the render thread. GPU bytes describe requested storage, not driver residency.
#include <stdint.h>
struct ZnResourceStats { uint64_t objects, cpuBytes, gpuBytes, borrowedBytes, active; };
using ZnResourceStatsFn = ZnResourceStats (*)(void*);
// the host (src/host/sys_host.cpp) defines both and defines HOST_DEFINES_RESOURCE_STATS first: a weak attribute on the declaration would make its definitions weak too,
// and an exported weak definition costs dyld a coalescing pass at every launch (tests/t1/launch_time.sh); a plugin or an engine without the host only declares them weak
#ifdef HOST_DEFINES_RESOURCE_STATS
#define ZN_RS_WEAK
#else
#define ZN_RS_WEAK __attribute__((weak))
#endif
extern "C" void zn_resource_stats_register(const char* name, ZnResourceStatsFn read, void* owner) ZN_RS_WEAK;
// Returned text is borrowed until the next snapshot on the host thread.
extern "C" const char* zn_resource_stats_json(void) ZN_RS_WEAK;
struct ZnResourceStatsRegistration {
  ZnResourceStatsRegistration(const char* name, ZnResourceStatsFn read, void* owner = nullptr) {
    if (zn_resource_stats_register) zn_resource_stats_register(name, read, owner);
  }
};
