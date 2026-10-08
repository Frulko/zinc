#pragma once
// The simulator core (ZN-292): a virtual clock with an event queue, a netlist of parts, pins and nets with resolved levels, and a trace recorder. It does not know the program that runs
// on it, a board or a chip: parts reach it through include/zn/sim.h.
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "zn/sim.h"

namespace zn::sim {

// ---- Scheduler: nanoseconds of virtual time; events run in time order, equal times in the order they were scheduled.
class Scheduler {
 public:
  using Fn = std::function<void()>;
  std::uint64_t now() const { return now_; }
  int at(std::uint64_t t_ns, Fn fn);                    // an event at an absolute time (in the past: now); returns its id
  int after(std::uint64_t dt_ns, Fn fn) { return at(now_ + dt_ns, std::move(fn)); }
  int every(std::uint64_t period_ns, Fn fn);            // a periodic event, first fire one period from now; period 0 is refused (-1)
  void cancel(int id);
  void advance(std::uint64_t dt_ns);                    // runs every event up to now + dt and leaves the clock at now + dt
  bool idle() const { return live_ == 0; }
  static std::uint64_t parse(const std::string& duration, bool& ok);   // "250ms", "1h", "10us", "5s", "2m", "1500ns", a bare number is ns

 private:
  struct Ev { std::uint64_t t; std::uint64_t seq; int id; std::uint32_t gen; };
  struct Slot { std::shared_ptr<Fn> fn; std::uint64_t period = 0; std::uint32_t gen = 0; bool live = false; };
  std::vector<Ev> heap_;
  std::vector<Slot> slots_;
  std::vector<int> free_;
  std::uint64_t now_ = 0, seq_ = 0;
  std::size_t live_ = 0;
  void push(Ev e);
  Ev pop();
};

// ---- Netlist: parts own pins; connecting pins merges their nets; a net's level is resolved from the drivers of its pins.
class Netlist {
 public:
  int addPart(const std::string& name);
  int addPin(int part, const std::string& pin);        // a pin id (global)
  int pin(const std::string& part, const std::string& pin) const;   // by "part", "pin" names, -1 when unknown
  void connect(int pinA, int pinB);
  void drive(int pin, int level, int strength);        // Z releases the pin
  int level(int pin) const;                            // the resolved level of the pin's net
  int net(int pin) const;                              // the net's representative (equal for connected pins)
  std::vector<int> pinsOf(int net) const;
  std::string nameOf(int pin) const;                   // "part:pin"
  void onChange(std::function<void(int pin, int level)> cb) { watchers_.push_back(std::move(cb)); }   // every pin whose net level changed
  int pins() const { return static_cast<int>(parts_of_.size()); }

 private:
  struct Drive { int level = ZN_SIM_Z, strength = 0; };
  std::vector<std::string> partNames_, pinNames_;
  std::vector<int> parts_of_, parent_, seen_;          // seen_: the level each pin was last told about
  std::vector<Drive> drives_;
  std::vector<std::vector<int>> members_;              // pins of each representative
  std::vector<std::function<void(int, int)>> watchers_;
  int find(int p) const;
  int resolve(int rep) const;
  void refresh(int rep);
};

// ---- Trace: what the program saw and what the scenario injected, timestamped; versioned binary "ZSIM".
struct TraceEvent { std::uint64_t t_ns; std::uint32_t kind, a, b; std::string data; };
class Trace {
 public:
  void add(std::uint64_t t_ns, std::uint32_t kind, std::uint32_t a = 0, std::uint32_t b = 0, std::string data = "") { events_.push_back({t_ns, kind, a, b, std::move(data)}); }
  const std::vector<TraceEvent>& events() const { return events_; }
  std::string serialize() const;
  static bool parse(const std::string& bytes, Trace& out, std::string& err);
  std::uint64_t hash() const;   // FNV-1a 64 of the serialized form: two runs that saw the same things have the same hash
 private:
  std::vector<TraceEvent> events_;
};

}  // namespace zn::sim
