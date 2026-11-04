#include "zn/thread_local.h"
#include <atomic>
#include <cassert>
#include <thread>

std::atomic<int> destroyed{0};
struct State {
  int number = 7;
  char bytes[8]{};
  ~State() { ++destroyed; }
};
struct Other { int number = 11; };

int main() {
  auto& main = zn::threadLocal<State>();
  main.number = 42;
  auto run = [] {
    auto& state = zn::threadLocal<State>();
    assert(state.number == 7 && state.bytes[0] == 0);
    state.number = 19;
    assert(&state == &zn::threadLocal<State>());
    assert(zn::threadLocal<Other>().number == 11);
    ZN_THREAD_LOCAL(int, local, = 5);
    assert(local == 5);
    local = 9;
  };
  std::thread a(run), b(run);
  a.join(); b.join();
  assert(main.number == 42);
  assert(destroyed == 2);
}
