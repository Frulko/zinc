// zinc:osc: one UDP datagram (runtime/mod/osc.cpp, decode). Datagrams are at most 2048 bytes on the wire.
#include "fuzz.h"
#include "../../runtime/mod/osc.cpp"
using namespace zrt;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > 2048) return 0;
  Ref<osc::OscMessage> m = osc::decode(d, (int32_t)n);
  if (m.p) (void)(m->address.bytes() + m->numbers.length() + m->strings.length());
  zfuzz::clear();
  return 0;
}
