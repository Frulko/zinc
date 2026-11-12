// Directly exercise shared host ownership; caller strings are immortal to isolate
// this check from the runtime allocator and generated thunk caches.
#include "../../plugins/i2c/native/i2c.host.cpp"
#include "../../plugins/spi/native/spi.host.cpp"
#include <thread>
#include <barrier>
#include <cassert>
namespace zrt { bool idle_frame = false; }
int main() {
  HostI2C i2c;
  HostSPI spi;
  auto path = zrt::String::from("sim", 3);
  path.s->rc = zrt::IMMORTAL;
  std::barrier ready(2);
  auto run = [&](int id) {
    for (int i = 0; i < 30; i++) {
      int a = i2c.open(path, 107), b = spi.open(path, 1000000, id);
      assert(a >= 0 && b >= 0);
      ready.arrive_and_wait();
      if (id == 0) { assert(i2c.open(path, 128) == -1); assert(!HostI2C::err.empty()); }
      else { assert(spi.open(path, 0, 0) == -1); assert(!HostSPI::err.empty()); }
      ready.arrive_and_wait();
      if (id == 0) assert(HostSPI::err.empty());
      else assert(HostI2C::err.empty());
      i2c.close(a); spi.close(b);
      int c = i2c.open(path, 107), d = spi.open(path, 1, 0);
      assert(c >= 0 && d >= 0 && c != a && d != b);
      i2c.close(a); spi.close(b);
      assert(i2c.at(c) && spi.at(d));
      i2c.close(c); spi.close(d);
      ready.arrive_and_wait();
    }
  };
  std::thread a(run, 0), b(run, 1); a.join(); b.join();
  path.s->rc = 1;
}
