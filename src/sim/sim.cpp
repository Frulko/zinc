#include "sim/sim.h"

#include <algorithm>
#include <cstdlib>

namespace zn::sim {

// ---- Scheduler
void Scheduler::push(Ev e) {
  heap_.push_back(e);
  std::push_heap(heap_.begin(), heap_.end(), [](const Ev& a, const Ev& b) { return a.t != b.t ? a.t > b.t : a.seq > b.seq; });
}
Scheduler::Ev Scheduler::pop() {
  std::pop_heap(heap_.begin(), heap_.end(), [](const Ev& a, const Ev& b) { return a.t != b.t ? a.t > b.t : a.seq > b.seq; });
  Ev e = heap_.back();
  heap_.pop_back();
  return e;
}
int Scheduler::at(std::uint64_t t_ns, Fn fn) {
  int id;
  if (!free_.empty()) { id = free_.back(); free_.pop_back(); } else { id = static_cast<int>(slots_.size()); slots_.emplace_back(); }
  Slot& s = slots_[static_cast<std::size_t>(id)];
  s.fn = std::make_shared<Fn>(std::move(fn)); s.period = 0; s.live = true; ++s.gen;
  ++live_;
  push({t_ns < now_ ? now_ : t_ns, seq_++, id, s.gen});
  return id;
}
int Scheduler::every(std::uint64_t period_ns, Fn fn) {
  if (period_ns == 0) return -1;
  int id = at(now_ + period_ns, std::move(fn));
  slots_[static_cast<std::size_t>(id)].period = period_ns;
  return id;
}
void Scheduler::cancel(int id) {
  if (id < 0 || static_cast<std::size_t>(id) >= slots_.size() || !slots_[static_cast<std::size_t>(id)].live) return;
  Slot& s = slots_[static_cast<std::size_t>(id)];
  s.live = false; s.fn.reset(); ++s.gen;   // the queued entry is stale now
  free_.push_back(id);
  --live_;
}
void Scheduler::advance(std::uint64_t dt_ns) {
  const std::uint64_t target = now_ + dt_ns;
  while (!heap_.empty() && heap_.front().t <= target) {
    Ev e = pop();
    Slot& s = slots_[static_cast<std::size_t>(e.id)];
    if (!s.live || s.gen != e.gen) continue;   // cancelled
    now_ = e.t;
    std::shared_ptr<Fn> fn = s.fn;
    if (s.period > 0) push({e.t + s.period, seq_++, e.id, s.gen});   // re-armed before it runs, so it can cancel itself
    else { s.live = false; s.fn.reset(); ++s.gen; free_.push_back(e.id); --live_; }
    (*fn)();
  }
  now_ = target;
}
std::uint64_t Scheduler::parse(const std::string& d, bool& ok) {
  ok = false;
  char* end = nullptr;
  double v = std::strtod(d.c_str(), &end);
  if (end == d.c_str() || v < 0) return 0;
  std::string unit(end);
  double mult = unit.empty() || unit == "ns" ? 1 : unit == "us" ? 1e3 : unit == "ms" ? 1e6 : unit == "s" ? 1e9 : unit == "m" ? 60e9 : unit == "h" ? 3600e9 : -1;
  if (mult < 0) return 0;
  ok = true;
  return static_cast<std::uint64_t>(v * mult + 0.5);
}

// ---- Netlist
int Netlist::addPart(const std::string& name) { partNames_.push_back(name); return static_cast<int>(partNames_.size()) - 1; }
int Netlist::addPin(int part, const std::string& pin) {
  const int id = static_cast<int>(parts_of_.size());
  parts_of_.push_back(part); pinNames_.push_back(pin); parent_.push_back(id); seen_.push_back(ZN_SIM_Z); drives_.emplace_back(); members_.push_back({id});
  return id;
}
int Netlist::pin(const std::string& part, const std::string& pinName) const {
  for (std::size_t i = 0; i < parts_of_.size(); ++i) if (pinNames_[i] == pinName && partNames_[static_cast<std::size_t>(parts_of_[i])] == part) return static_cast<int>(i);
  return -1;
}
int Netlist::find(int p) const { while (parent_[static_cast<std::size_t>(p)] != p) p = parent_[static_cast<std::size_t>(p)]; return p; }
int Netlist::net(int p) const { return find(p); }
std::vector<int> Netlist::pinsOf(int n) const { return members_[static_cast<std::size_t>(find(n))]; }
std::string Netlist::nameOf(int p) const { return partNames_[static_cast<std::size_t>(parts_of_[static_cast<std::size_t>(p)])] + ":" + pinNames_[static_cast<std::size_t>(p)]; }
int Netlist::resolve(int rep) const {
  int best = 0, level = ZN_SIM_Z;
  for (int p : members_[static_cast<std::size_t>(rep)]) {
    const Drive& d = drives_[static_cast<std::size_t>(p)];
    if (d.level == ZN_SIM_Z || d.strength == 0) continue;
    if (d.strength > best) { best = d.strength; level = d.level; }
    else if (d.strength == best && d.level != level) level = ZN_SIM_X;
  }
  return level;
}
void Netlist::refresh(int rep) {
  const int now = resolve(rep);
  for (int p : members_[static_cast<std::size_t>(rep)]) {
    int& seen = seen_[static_cast<std::size_t>(p)];
    if (seen == now) continue;
    seen = now;
    for (auto& w : watchers_) w(p, now);
  }
}
void Netlist::connect(int a, int b) {
  int ra = find(a), rb = find(b);
  if (ra == rb) return;
  if (members_[static_cast<std::size_t>(ra)].size() < members_[static_cast<std::size_t>(rb)].size()) std::swap(ra, rb);
  parent_[static_cast<std::size_t>(rb)] = ra;
  auto& big = members_[static_cast<std::size_t>(ra)];
  auto& small = members_[static_cast<std::size_t>(rb)];
  big.insert(big.end(), small.begin(), small.end());
  small.clear();
  refresh(ra);
}
void Netlist::drive(int p, int level, int strength) {
  drives_[static_cast<std::size_t>(p)] = {level, level == ZN_SIM_Z ? 0 : strength};
  refresh(find(p));
}
int Netlist::level(int p) const { return resolve(find(p)); }

// ---- Trace
namespace {
void put32(std::string& s, std::uint32_t v) { for (int i = 0; i < 4; ++i) s += static_cast<char>((v >> (8 * i)) & 255); }
void put64(std::string& s, std::uint64_t v) { for (int i = 0; i < 8; ++i) s += static_cast<char>((v >> (8 * i)) & 255); }
std::uint32_t get32(const std::string& s, std::size_t at) { std::uint32_t v = 0; for (int i = 0; i < 4; ++i) v |= static_cast<std::uint32_t>(static_cast<unsigned char>(s[at + static_cast<std::size_t>(i)])) << (8 * i); return v; }
std::uint64_t get64(const std::string& s, std::size_t at) { std::uint64_t v = 0; for (int i = 0; i < 8; ++i) v |= static_cast<std::uint64_t>(static_cast<unsigned char>(s[at + static_cast<std::size_t>(i)])) << (8 * i); return v; }
}  // namespace
std::string Trace::serialize() const {
  std::string s = "ZSIM";
  put32(s, 1); put32(s, static_cast<std::uint32_t>(events_.size()));
  for (const TraceEvent& e : events_) { put64(s, e.t_ns); put32(s, e.kind); put32(s, e.a); put32(s, e.b); put32(s, static_cast<std::uint32_t>(e.data.size())); s += e.data; }
  return s;
}
bool Trace::parse(const std::string& b, Trace& out, std::string& err) {
  if (b.size() < 12 || b.compare(0, 4, "ZSIM") != 0) { err = "not a ZSIM trace"; return false; }
  if (get32(b, 4) != 1) { err = "unsupported trace version " + std::to_string(get32(b, 4)); return false; }
  const std::uint32_t n = get32(b, 8);
  std::size_t at = 12;
  out.events_.clear();
  for (std::uint32_t i = 0; i < n; ++i) {
    if (at + 24 > b.size()) { err = "truncated trace"; return false; }
    TraceEvent e{get64(b, at), get32(b, at + 8), get32(b, at + 12), get32(b, at + 16), {}};
    const std::uint32_t len = get32(b, at + 20);
    at += 24;
    if (at + len > b.size()) { err = "truncated trace"; return false; }
    e.data = b.substr(at, len); at += len;
    out.events_.push_back(std::move(e));
  }
  return true;
}
std::uint64_t Trace::hash() const {
  std::uint64_t h = 1469598103934665603ull;
  for (unsigned char c : serialize()) { h ^= c; h *= 1099511628211ull; }
  return h;
}

}  // namespace zn::sim
