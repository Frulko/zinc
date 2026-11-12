#include "platform/power.h"
#include <cassert>
#include <iostream>
int main(int argc, char** argv) {
  uint32_t b[8] = {32, 0x80000000, 0x30046, 4, 0x80000004, 0xf000f, 0, 0};
  assert(zn::power::decodeThrottle(b, 8) == 0xf000f);
  b[4] = 0; assert(!zn::power::decodeThrottle(b, 8));
  b[4] = 0x80000000; assert(!zn::power::decodeThrottle(b, 8));
  b[4] = 0x80000004; b[1] = 0; assert(!zn::power::decodeThrottle(b, 8));
  if (argc > 1) std::cout << (argc > 2 ? zn::power::probe(argv[1]).summary() : zn::power::probe(argv[1]).json()) << '\n';
}
