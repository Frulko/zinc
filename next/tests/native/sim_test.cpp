// The simulator core (ZN-292): out-of-order events run in time order, an hour of a 1 ms timer is fast, a net of three pins resolves levels, a trace round-trips.
#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

#include "sim/sim.h"

using namespace zn::sim;
static int fails = 0;
#define CHECK(c, msg) do { if (!(c)) { std::printf("FAIL: %s\n", msg); ++fails; } } while (0)

int main() {
  {   // events scheduled out of order run in time order; equal times in the order they were scheduled
    Scheduler s;
    std::vector<int> order;
    s.at(300, [&] { order.push_back(3); });
    s.at(100, [&] { order.push_back(1); });
    s.at(200, [&] { order.push_back(2); });
    s.at(200, [&] { order.push_back(22); });
    s.advance(250);
    CHECK((order == std::vector<int>{1, 2, 22}), "events run in time order, ties in scheduling order");
    CHECK(s.now() == 250, "the clock stops at now + dt");
    s.advance(100);
    CHECK((order == std::vector<int>{1, 2, 22, 3}), "the rest runs on the next advance");
  }
  {   // one hour of a 1 ms timer, under a second of wall time
    Scheduler s;
    std::uint64_t n = 0;
    s.every(1000000, [&] { ++n; });
    auto t0 = std::chrono::steady_clock::now();
    s.advance(3600ull * 1000000000ull);
    double sec = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    CHECK(n == 3600000, "3.6 million ticks in an hour");
    CHECK(sec < 1.0, "advance(1h) of a 1 ms timer finishes in under a second");
    std::printf("1 h of a 1 ms timer: %llu ticks in %.3f s\n", static_cast<unsigned long long>(n), sec);
  }
  {   // cancel (also from inside), periodic that cancels itself, reuse of ids
    Scheduler s;
    int a = 0, id = -1, b = 0;
    id = s.every(10, [&] { if (++a == 3) s.cancel(id); });
    int once = s.at(15, [&] { ++b; });
    s.cancel(once);
    int again = s.at(20, [&] { b += 10; });
    (void)again;
    s.advance(1000);
    CHECK(a == 3 && b == 10, "a periodic event cancels itself, a cancelled one never runs, a reused id fires only its own event");
    bool ok = false;
    CHECK(Scheduler::parse("250ms", ok) == 250000000ull && ok, "250ms");
    CHECK(Scheduler::parse("1h", ok) == 3600000000000ull && ok, "1h");
    Scheduler::parse("5parsecs", ok);
    CHECK(!ok, "an unknown unit is refused");
  }
  {   // a net of three pins
    Netlist n;
    int mcu = n.addPart("mcu"), led = n.addPart("led"), btn = n.addPart("btn");
    int p1 = n.addPin(mcu, "GPIO2"), p2 = n.addPin(led, "A"), p3 = n.addPin(btn, "OUT");
    std::vector<std::string> changes;
    n.onChange([&](int pin, int level) { changes.push_back(n.nameOf(pin) + "=" + std::to_string(level)); });
    n.connect(p1, p2); n.connect(p2, p3);
    CHECK(n.net(p1) == n.net(p3) && n.pinsOf(p1).size() == 3, "three pins on one net");
    CHECK(n.level(p3) == ZN_SIM_Z, "nothing drives the net: Z");
    n.drive(p1, ZN_SIM_HIGH, ZN_SIM_STRONG);
    CHECK(n.level(p2) == ZN_SIM_HIGH && n.level(p3) == ZN_SIM_HIGH, "a driver sets the level of every pin of the net");
    n.drive(p3, ZN_SIM_LOW, ZN_SIM_STRONG);
    CHECK(n.level(p1) == ZN_SIM_X, "two strong drivers that disagree: X");
    n.drive(p3, ZN_SIM_LOW, ZN_SIM_PULL);
    CHECK(n.level(p1) == ZN_SIM_HIGH, "a pull resistor loses against a driver");
    n.drive(p1, ZN_SIM_Z, ZN_SIM_STRONG);
    CHECK(n.level(p2) == ZN_SIM_LOW, "released driver: the pull-down decides");
    CHECK(n.pin("led", "A") == p2 && n.pin("led", "K") == -1, "pins are found by part and name");
    CHECK(!changes.empty() && changes.front() == "mcu:GPIO2=1", "watchers hear the level changes");
  }
  {   // a trace round-trips and hashes the same
    Trace t;
    t.add(1000, 1, 2, 3, "hello"); t.add(2000, 2);
    Trace u; std::string err;
    CHECK(Trace::parse(t.serialize(), u, err) && u.events().size() == 2 && u.events()[0].data == "hello" && u.events()[1].t_ns == 2000, "a trace parses back");
    CHECK(u.hash() == t.hash(), "same events, same hash");
    Trace v;
    CHECK(!Trace::parse("junk", v, err), "junk is refused");
  }
  if (fails == 0) std::printf("sim core: ok\n");
  return fails ? 1 : 0;
}
