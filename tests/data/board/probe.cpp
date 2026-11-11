#include "platform/board.h"
#include <cassert>
#include <iostream>
int main(int argc, char** argv) {
  if (argc == 2) { std::cout << zn::board::probe(argv[1]).json() << '\n'; return 0; }
  unsigned code, ram; std::string model, soc;
  while (std::cin >> std::hex >> code >> std::dec >> ram >> soc) {
    std::getline(std::cin,model); model.erase(0,1);
    const auto r = zn::board::decode(code);
    if (r.ramMB != ram || r.soc != soc || r.model != model) { std::cerr << "revision " << std::hex << code << " -> " << r.model << '/' << r.soc << '/' << std::dec << r.ramMB << '\n'; return 1; }
  }
  assert(zn::board::decode(0).model.empty());
  assert(zn::board::decode(0xffffff).soc.empty());
  assert(zn::board::decode(0xf).ramMB == 512);
  assert(zn::board::decode(0x100000f).ramMB == 512);
  assert(zn::board::decode(0xfa020d3).model == "Raspberry Pi 3 Model B Plus");
  assert(zn::board::decode(0xf04170).ramMB == 0);
}
