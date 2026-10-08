// The system host of the WASI build (ZN-135): what zinc:sys needs to run the pure programs: a virtual clock (a run is deterministic: waiting advances it, nothing sleeps), no events, no
// processes or files. Rows it does not know are reported once on stderr and return zero / "".
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <set>
#include <string>

#include "zn/host.h"
#include "zn/runtime.h"

namespace {
double gNow = 0;       // virtual milliseconds since the start
std::string gOut;
void ret(zn::host::HostArg* r, const std::string& s) { gOut = s; r->p = gOut.data(); r->n = static_cast<std::uint32_t>(gOut.size()); }

void call(int id, const zn::host::HostArg* a, zn::host::HostArg* r) {
  using zn::Rt;
  switch (static_cast<Rt>(id)) {
    case Rt::HostSysArgsCount: r->i = 0; break;
    case Rt::HostSysArg: ret(r, ""); break;
    case Rt::HostSysEnv: { const char* v = std::getenv(std::string(static_cast<const char*>(a[0].p), a[0].n).c_str()); ret(r, v ? v : ""); break; }
    case Rt::HostSysPlatform: ret(r, "wasm"); break;
    case Rt::HostSysPid: r->i = 1; break;
    case Rt::HostLoopReal: r->i = 0; break;                 // deterministic: the clock is virtual
    case Rt::HostLoopNow: r->d = gNow; break;
    case Rt::HostLoopWait: gNow += a[0].d > 0 ? a[0].d : 0; break;
    case Rt::HostLoopEpoch: { timespec ts; clock_gettime(CLOCK_REALTIME, &ts); r->d = static_cast<double>(ts.tv_sec) * 1000.0 + static_cast<double>(ts.tv_nsec) / 1e6; break; }
    case Rt::HostEvNext: ret(r, ""); break;
    case Rt::HostEvReady: r->i = 0; break;
    case Rt::HostEvActive: r->i = 0; break;
    case Rt::HostNativePoll: r->i = 0; break;
    case Rt::HostSysAllocations: case Rt::HostSysLiveBlocks: r->d = 0; break;
    default: {
      static std::set<int> seen;
      if (seen.insert(id).second) std::fprintf(stderr, "wasm host: row %s is not available\n", zn::kRtInfo[id].name);
      r->i = 0; r->d = 0; ret(r, "");
    }
  }
}
struct Install { Install() { zn::host::hostSys = call; } } gInstall;
}  // namespace
