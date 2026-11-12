#include "../../src/tc/bundle.cpp"
#include <cassert>

int main(int argc, char** argv) {
  assert(argc == 2);
  const fs::path root = argv[1], macos = root / "Contents/MacOS", resources = root / "Contents/Resources";
  fs::create_directories(macos);
  std::string error;
  assert(zn::tc::placeModuleLicenses(macos, resources, error));
  std::ofstream(macos / "libzn_text_module.LICENSE") << "new license";
  fs::create_directories(resources);
  std::ofstream(resources / "libzn_text_module.LICENSE") << "old license";
  assert(zn::tc::placeModuleLicenses(macos, resources, error));
  assert(!fs::exists(macos / "libzn_text_module.LICENSE"));
  std::ifstream file(resources / "libzn_text_module.LICENSE");
  std::string contents((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
  assert(contents == "new license");
  assert(zn::tc::placeModuleLicenses(macos, resources, error));
}
