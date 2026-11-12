#define ZN_NO_MIMALLOC
#include "../../targets/console/host_console.cpp"
#include <cassert>
namespace zn::host { HostCall hostSys = nullptr; }
namespace zn::rt { const char* gDeviceProfile = nullptr; }
extern "C" const char* hal_env(const char*) { return nullptr; }
extern "C" uint64_t hal_time_us() { return 0; }
extern "C" void hal_sleep_us(uint64_t) {}
extern "C" void hal_log_err(const char*, size_t) {}
int main() {
  zn_console_install_host();
  for (auto row : {zn::Rt::HostFsTryLock, zn::Rt::HostFsUnlock}) {
    zn::host::HostArg result;
    zn::host::hostSys(static_cast<int>(row), nullptr, &result);
    assert(result.i == 0);
    zn::host::hostSys(static_cast<int>(zn::Rt::HostFsFailed), nullptr, &result);
    assert(result.i == 1);
    zn::host::hostSys(static_cast<int>(zn::Rt::HostFsError), nullptr, &result);
    assert(std::string(static_cast<const char*>(result.p), result.n).rfind("ENOTSUP:", 0) == 0);
  }
  std::puts("console filesystem locks: unavailable");
}
