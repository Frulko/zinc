#include "zn/host.h"
namespace zn::host { HostCall hostSys = nullptr; }
#include "../../targets/wasm/host_wasi.cpp"
#include <cassert>
int main() {
  zn_wasm_assets_host = [](int, const zn::host::HostArg*, zn::host::HostArg* r) { r->i = 77; };
  for (auto row : {zn::Rt::HostFsTryLock, zn::Rt::HostFsUnlock}) {
    zn::host::HostArg result;
    zn::host::hostSys(static_cast<int>(row), nullptr, &result);
    assert(result.i == 0);
    zn::host::hostSys(static_cast<int>(zn::Rt::HostFsFailed), nullptr, &result);
    assert(result.i == 1);
    zn::host::hostSys(static_cast<int>(zn::Rt::HostFsError), nullptr, &result);
    assert(std::string(static_cast<const char*>(result.p), result.n).rfind("ENOTSUP:", 0) == 0);
    zn::host::hostSys(static_cast<int>(zn::Rt::HostFsFailed), nullptr, &result);
    assert(result.i == 77);
  }
  std::puts("WASI filesystem locks: unavailable");
}
