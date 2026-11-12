/* Signatures for compiling the browser fixture; executing this host table fails. */
#include "zn/native.h"
static int32_t browser_only(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  (void)self; (void)cx; (void)a; (void)r; return ZN_ERROR;
}
static const ZnExport exports[] = {
  {"edit", "BIUD>I", browser_only, 0}, {"clear", "BIUD>s", browser_only, 0},
  {"fail", "B>n", browser_only, 0}, {"alias", "II>n", browser_only, 0},
  {"doubles", ">D", browser_only, 0}, {"voidValue", ">n", browser_only, 0}
};
const ZnModule* zn_module_ArrayProbe(void) {
  static const ZnModule module = {ZN_ABI_VERSION, sizeof(ZnModule), "ArrayProbe", exports, 6, 0, 0, 0, 0, 0, 0};
  return &module;
}
