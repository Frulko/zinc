// zinc:gl in an AOT program (ZN-562): the generated main calls installGl, which sends the Rt::HostGl* rows to zn_webgl_host, linked from zn_gl.
// Only in zn_gl: zinc itself finds zn_webgl_host in libzn_webgl at the first call (src/main.cpp).
#include "gl/webgl_js.h"
#include "zn/host.h"
#include "zn/runtime.h"

extern "C" void zn_webgl_host(int row, const zn::host::HostArg* a, zn::host::HostArg* r);
extern "C" void zn_webgl_host_hooks(const zn::gl::PresentHooks* hooks);
extern "C" zn::host::HostFast zn_webgl_fast(int row);

namespace zn::host {
void installGl() {
  zn_webgl_host_hooks(static_cast<const zn::gl::PresentHooks*>(glPresentHooks()));
  hostGl = zn_webgl_host;
  for (int r = static_cast<int>(zn::Rt::HostGlCreate); r <= static_cast<int>(zn::Rt::HostGlPresent); ++r) hostFast[r] = zn_webgl_fast(r);   // ZN-562.03
}
}  // namespace zn::host
