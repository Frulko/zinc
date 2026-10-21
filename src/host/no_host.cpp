// zinc without the graphics host (-DZN_HOST_GFX=OFF: the headless build, the first Windows build of docs/reports/zinc-windows-port.md): the entries
// of src/host that main.cpp and zinc:canvas2d call answer "no host" instead of leaving the link without them. Linked only when zn_host_gfx is not built.
#include <cstdint>
#include <string>
#include <vector>

#include "host/permissions.h"
#include "zn/host.h"

namespace zn::host {
const void* glPresentHooks() { return nullptr; }
bool installResources(const std::uint8_t*, std::size_t) { return false; }
bool installResourcesFile(const char*) { return false; }
bool replayScene(const char*, const char*) { return false; }
bool benchScene(const char*, int, int, RenderBench&) { return false; }
int strokeCheck(int) { return -1; }
bool damageCheck(const char*, const char*, int&, bool&, int*) { return false; }
bool scrollCheck(const char*, const char*, ScrollCheck&) { return false; }
namespace perm {
void configure(const std::vector<std::string>&, bool, bool, const std::string&) {}
}  // namespace perm
}  // namespace zn::host

namespace zrt::raster {
void dyn_set_alpha(std::int32_t, bool) {}
}  // namespace zrt::raster
