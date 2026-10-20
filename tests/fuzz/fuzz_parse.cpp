// Fuzz target (ZN-147): the lexer and parser on arbitrary bytes. Nothing may crash, hang or overflow the stack; diagnostics are the only way to refuse a program.
#include <cstddef>
#include <cstdint>
#include <string_view>
#include "frontend/parser.h"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
  if (size > (1u << 16)) return 0;
  zn::frontend::ParseResult r = zn::frontend::parse(std::string_view(reinterpret_cast<const char*>(data), size));
  (void)r;
  return 0;
}
