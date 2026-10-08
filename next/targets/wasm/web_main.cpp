// The browser entry of the WASI interpreter (ZN-135): the page's worker hands a .zbc to `zn_run`; the program's output goes to stdout (the glue forwards it to the console).
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

#include "rt/rt.h"
#include "vm/vm.h"
#include "zbc/zbc.h"

static unsigned char gScratch[1 << 16];   // strings the glue returns to the runtime (a host row that answers with a string)

extern "C" {
__attribute__((export_name("zn_scratch"))) unsigned char* zn_scratch() { return gScratch; }
__attribute__((export_name("zn_scratch_size"))) int zn_scratch_size() { return static_cast<int>(sizeof gScratch); }
__attribute__((export_name("zn_alloc"))) void* zn_alloc(int n) { return std::malloc(static_cast<std::size_t>(n)); }
__attribute__((export_name("zn_run"))) int zn_run(const std::uint8_t* zbc, int len) {
  std::vector<std::uint8_t> bytes(zbc, zbc + len);
  zn::zbc::Module m;
  std::string err;
  if (!zn::zbc::decode(bytes, m, err)) { std::fprintf(stderr, "%s\n", err.c_str()); return 1; }
  err = zn::zbc::verify(m);
  if (!err.empty()) { std::fprintf(stderr, "invalid ZBC: %s\n", err.c_str()); return 1; }
  std::string out;
  auto res = zn::vm::run(m, out, false);
  return zn::rt::report(res, out, false);
}
}
