#include "tc/plugin_build.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <dlfcn.h>
#include <cassert>
namespace fs = std::filesystem;
static void write(const fs::path& p, const std::string& s) { std::ofstream(p) << s; }
int main(int argc, char** argv) {
  assert(argc == 3);
  const fs::path source = fs::absolute(argv[1]), tmp = fs::absolute(argv[2]), root = tmp / "engine", plugin = tmp / "bare-hw";
  fs::create_directories(root / "runtime/include"); fs::create_directories(plugin);
  for (const char* part : {"include", "src"}) fs::create_directory_symlink(source / part, root / part);
  for (const auto& e : fs::directory_iterator(source / "runtime")) if (e.path().filename() != "include") fs::create_symlink(e.path(), root / "runtime" / e.path().filename());
  for (const auto& e : fs::directory_iterator(source / "runtime/include")) if (e.path().filename() != "hw.h") fs::create_symlink(e.path(), root / "runtime/include" / e.path().filename());
  const auto header = root / "runtime/include/hw.h";
  fs::copy_file(source / "runtime/include/hw.h", header);
  { std::ofstream f(header, std::ios::app); f << "\n#define ZN_HW_CACHE_VALUE 21\n"; }
  write(plugin / "plugin.json", "{\"name\":\"bare-hw\",\"kind\":\"display\"}");
  write(plugin / "driver.cpp", "#include \"hw.h\"\nextern \"C\" int hw_cache_value() { return ZN_HW_CACHE_VALUE; }\n");
  zn::frontend::FoundPlugin p; p.dir = plugin.string(); p.manifest.name = "bare-hw"; p.manifest.kind = "display";
  const std::string target = zn::tc::pluginTarget(); p.manifest.targets = {target}; p.manifest.targetSettings[target].sources = {"driver.cpp"};
  auto build = [&] {
    zn::tc::PluginLib lib; std::string err;
    if (!zn::tc::buildPlugin(p, root.string(), tmp.string(), target, lib, err)) { std::cerr << err << '\n'; std::abort(); }
    return lib;
  };
  auto value = [](const zn::tc::PluginLib& lib) {
    void* d = dlopen(lib.shared.c_str(), RTLD_NOW | RTLD_LOCAL); assert(d);
    auto fn = (int(*)())dlsym(d, "hw_cache_value"); assert(fn); int v = fn(); dlclose(d); return v;
  };
  auto first = build(); assert(first.rebuilt && value(first) == 21);
  zn::tc::PluginLib hit;
  assert(zn::tc::pluginUpToDate(p, root.string(), tmp.string(), target, hit));
  assert(!build().rebuilt);
  { std::ofstream f(header, std::ios::app); f << "\n#undef ZN_HW_CACHE_VALUE\n#define ZN_HW_CACHE_VALUE 42\n"; }
  assert(!zn::tc::pluginUpToDate(p, root.string(), tmp.string(), target, hit));
  auto second = build(); assert(second.rebuilt && second.shared != first.shared && value(second) == 42);
  assert(zn::tc::pluginUpToDate(p, root.string(), tmp.string(), target, hit));
  assert(!build().rebuilt);
  std::cout << "bare hw cache invalidation ok\n";
}
