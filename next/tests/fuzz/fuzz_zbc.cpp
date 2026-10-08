// Fuzz target (ZN-147): the ZBC decoder and verifier on arbitrary bytes. A file that decodes and verifies must disassemble and encode again to the same bytes (the format has one spelling).
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>
#include "zbc/zbc.h"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
  if (size > (1u << 20)) return 0;
  std::vector<std::uint8_t> bytes(data, data + size);
  zn::zbc::Module m;
  std::string err;
  if (!zn::zbc::decode(bytes, m, err)) return 0;
  if (!zn::zbc::verify(m).empty()) return 0;
  (void)zn::zbc::disassemble(m);
  if (zn::zbc::encode(m) != bytes) { std::fprintf(stderr, "a verified ZBC file does not encode back to itself\n"); std::abort(); }
  return 0;
}
