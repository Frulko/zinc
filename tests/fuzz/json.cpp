// JSON.parse without a type (runtime/zrt_dyn.h, DYN-09): parse, stringify, parse again; the second round must
// succeed and print the same text.
#include "fuzz.h"

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > (1 << 16)) return 0;
  zrt::Dyn v = zrt::json_parse(zfuzz::str(d, n));
  if (zrt::g_err.p) { zfuzz::clear(); return 0; }
  zrt::String a = zrt::dyn_stringify(v);
  zrt::Dyn w = zrt::json_parse(a);
  if (zrt::g_err.p) __builtin_trap();  // JSON.stringify output must parse
  if (!(zrt::dyn_stringify(w) == a)) __builtin_trap();
  (void)zrt::dyn_str_of(v);
  return 0;
}
