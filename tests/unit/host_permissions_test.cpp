#include "host/permissions.h"
#include <atomic>
#include <barrier>
#include <thread>

int main() {
  using namespace zn::host::perm;
  configure({}, true, true, ".");
  if (!enforced() || check("fs:read", "private.txt").find("EACCES") != 0) return 1;
  configure({"fs:read", "net:localhost"}, true, true, ".");
  if (!check("fs:read", "private.txt").empty() || !check("net", "localhost").empty()) return 1;
  if (check("fs:write", "private.txt").empty() || check("net", "other.invalid").empty()) return 1;
  configure({}, false, true, ".");
  if (enforced() || !check("fs:write", "private.txt").empty()) return 1;
  // A manifest reset and worker checks share one coherent configuration.
  std::barrier turn(2);
  std::atomic<bool> invalid{false};
  std::thread reader([&] {
    for (int i = 0; i < 8; ++i) {
      turn.arrive_and_wait();
      const auto result = check("fs:read", "private.txt");
      if (!result.empty() && result.rfind("EACCES:", 0) != 0) invalid = true;
      (void)enforced();
      turn.arrive_and_wait();
    }
  });
  for (int i = 0; i < 8; ++i) {
    turn.arrive_and_wait();
    configure(i % 2 ? std::vector<std::string>{"fs:read"} : std::vector<std::string>{}, true, true, ".");
    turn.arrive_and_wait();
  }
  reader.join();
  configure({}, true, false, ".");
  std::thread first([&] { turn.arrive_and_wait(); (void)check("net", "worker.invalid"); });
  turn.arrive_and_wait();
  (void)check("net", "worker.invalid");
  first.join();
  configure({}, true, true, ".");
  return invalid || !enforced() || check("net", "worker.invalid").rfind("EACCES:", 0) != 0;
}
