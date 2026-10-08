// zinc:gfx for the browser (ZN-135): every graphics row of the runtime goes to one JavaScript import, `zn.gfx(id, args, result)`; the glue (glue/worker.mjs) decodes the
// arguments by the row's signature (the table below is exported) and draws on an OffscreenCanvas.
#include <cstdint>

#include "zn/host.h"
#include "zn/runtime.h"

extern "C" __attribute__((import_module("zn"), import_name("gfx"))) void zn_js_gfx(int id, const zn::host::HostArg* args, zn::host::HostArg* result);

extern "C" {
__attribute__((export_name("zn_row_sig"))) const char* zn_row_sig(int id) { return id >= 0 && id < static_cast<int>(zn::Rt::Count) ? zn::kRtInfo[id].sig : ""; }
__attribute__((export_name("zn_row_name"))) const char* zn_row_name(int id) { return id >= 0 && id < static_cast<int>(zn::Rt::Count) ? zn::kRtInfo[id].name : ""; }
__attribute__((export_name("zn_row_count"))) int zn_row_count() { return static_cast<int>(zn::Rt::Count); }
__attribute__((export_name("zn_row_arg_size"))) int zn_row_arg_size() { return static_cast<int>(sizeof(zn::host::HostArg)); }
}

namespace {
void call(int id, const zn::host::HostArg* a, zn::host::HostArg* r) { zn_js_gfx(id, a, r); }
struct Install { Install() { zn::host::hostGfx = call; } } gInstall;
}  // namespace
