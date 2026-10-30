// threads_test <program.zbc> [threads]: the runtime's state is per thread (D181, docs/reports/threads-ui-compute-animation.md step 1). The module
// runs once alone, then on N threads at once (each its own Machine, its own heap and event loop, as a worker's); every output must equal the
// one of the run alone. Built with -DZN_TSAN=ON it is the race check (tests/t0/threads_two.sh).
#include <cstdio>
#include <fstream>
#include <iterator>
#include <string>
#include <thread>
#include <vector>

#include "rt/rt.h"
#include "vm/vm.h"
#include "zbc/zbc.h"
#include "zn/host.h"

int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: threads_test <program.zbc> [threads]\n"); return 2; }
  const int n = argc > 2 ? std::atoi(argv[2]) : 2;
  std::ifstream in(argv[1], std::ios::binary);
  std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  zn::zbc::Module mod;
  std::string err;
  if (!zn::zbc::decode(bytes, mod, err) || !(err = zn::zbc::verify(mod)).empty()) { std::fprintf(stderr, "threads_test: %s\n", err.c_str()); return 2; }
  zn::host::installSys();
  auto run = [&](std::string& out) {
    zn::rt::gOnWorker = true;   // a worker's thread: no native registry, no window
    zn::rt::Result r = zn::rt::runModuleHooked(mod, out, false, nullptr, nullptr, nullptr, nullptr, 0, 0, false);   // the output kept, not written
    if (!r.ok) out += "\nerror: " + r.error;
  };
  std::string alone;
  std::thread([&] { run(alone); }).join();
  std::vector<std::string> outs(static_cast<std::size_t>(n));
  std::vector<std::thread> ts;
  for (int i = 0; i < n; ++i) ts.emplace_back([&, i] { run(outs[static_cast<std::size_t>(i)]); });
  for (auto& t : ts) t.join();
  int bad = 0;
  for (int i = 0; i < n; ++i)
    if (outs[static_cast<std::size_t>(i)] != alone) { std::fprintf(stderr, "thread %d printed:\n%s\nalone:\n%s\n", i, outs[static_cast<std::size_t>(i)].c_str(), alone.c_str()); ++bad; }
  if (bad) return 1;
  std::fputs(alone.c_str(), stdout);
  return 0;
}
