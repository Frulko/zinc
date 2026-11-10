#include "assets/cook.h"
#define CGLTF_IMPLEMENTATION
#include "cgltf.h"

#include <cassert>
#include <filesystem>
#include <iostream>

int main(int argc, char** argv) {
  assert(argc == 3);
  for (const char* name : {"psp30", "vita60", "n3ds30", "ios60"}) {
    zn::assets::CookProfile profile;
    profile.name = name;
    profile.triBudget = 1;
    const std::string out = std::string(argv[2]) + "/budget-" + name;
    zn::assets::CookReceipt rejected;
    std::string err;
    assert(!zn::assets::cook(argv[1], profile, out, rejected, err));
    assert(!rejected.ok);
    assert(err == "budget overrun: cell default section triangles 2 > 1");
    assert(rejected.error == err);
    assert(!std::filesystem::exists(out));

    profile.triBudget = 2;
    zn::assets::CookReceipt accepted;
    assert(zn::assets::cook(argv[1], profile, out, accepted, err));
    assert(accepted.ok && accepted.triangles == 2 && accepted.vertices == 4);
    assert(accepted.quantErr > 1e-6);
    std::cout << name << ": " << rejected.error << "; budget 2 accepted\n";
  }
}
