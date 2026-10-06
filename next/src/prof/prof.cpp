#include "prof/prof.h"

#include <algorithm>
#include <csignal>
#include <cstdio>
#include <fstream>
#include <map>
#include <sys/resource.h>
#include <sys/time.h>

#include "vm/vm.h"

namespace zn::prof {
namespace {

using rt::Frame;
using rt::Func;
using rt::Machine;

// ---- the sampler: the signal handler only copies function indices into memory reserved before the run
struct Sampler {
  Machine* m = nullptr;
  std::vector<std::uint32_t> buf;  // samples: depth, then the function indices from the one running to the outermost caller
  std::size_t used = 0, samples = 0, dropped = 0;
  int hz = 1000;
};
Sampler g;

void onProf(int) {
  Machine* m = g.m;
  if (!m || !m->curFn) return;
  if (g.used + 66 > g.buf.size()) { ++g.dropped; return; }
  const Func* base = m->funcs.data();
  std::uint32_t* p = &g.buf[g.used + 1];
  std::uint32_t d = 0;
  p[d++] = static_cast<std::uint32_t>(m->curFn - base);
  for (const Frame* f = m->fp; f > m->frames.data() && d < 64;) {
    --f;
    if (f->fn) p[d++] = static_cast<std::uint32_t>(f->fn - base);
  }
  g.buf[g.used] = d;
  g.used += 1 + d;
  ++g.samples;
}

void startTimer(Machine& m, const void* data) {
  const auto* o = static_cast<const ProfileOptions*>(data);
  g.m = &m;
  g.hz = o->hz > 0 ? o->hz : 1000;
  struct sigaction sa;
  sa.sa_handler = onProf;
  sigemptyset(&sa.sa_mask);
  sa.sa_flags = SA_RESTART;
  sigaction(SIGPROF, &sa, nullptr);
  itimerval it;
  it.it_interval.tv_sec = 0; it.it_interval.tv_usec = 1000000 / g.hz;
  it.it_value = it.it_interval;
  setitimer(ITIMER_PROF, &it, nullptr);
}

void stopTimer(Machine&, const void*) {
  itimerval off{};
  setitimer(ITIMER_PROF, &off, nullptr);
  signal(SIGPROF, SIG_IGN);
  g.m = nullptr;
}

std::string jsonStr(const std::string& s) {
  std::string r = "\"";
  for (char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += c; } else if (static_cast<unsigned char>(c) < 0x20) r += ' '; else r += c; }
  return r + "\"";
}

}  // namespace

rt::Result profile(const zbc::Module& m, std::string& out, const ProfileOptions& o, std::string& report) {
  g = Sampler{};
  g.buf.assign(1u << 22, 0);  // 4M words: about 100k samples of a typical depth
  rt::Result res = vm::runHooked(m, out, startTimer, &o, stopTimer, nullptr);
  const double dt = 1.0 / g.hz;
  struct Row { std::uint64_t self = 0, total = 0; };
  std::vector<Row> rows(m.functions.size());
  std::map<std::string, std::uint64_t> folded;
  std::vector<std::vector<std::uint32_t>> stacks;  // root first
  for (std::size_t at = 0; at < g.used;) {
    std::uint32_t d = g.buf[at];
    std::vector<std::uint32_t> st(g.buf.begin() + static_cast<std::ptrdiff_t>(at + 1), g.buf.begin() + static_cast<std::ptrdiff_t>(at + 1 + d));
    at += 1 + d;
    std::reverse(st.begin(), st.end());
    if (!st.empty() && st.back() < rows.size()) ++rows[st.back()].self;
    std::vector<std::uint32_t> seen;
    for (std::uint32_t f : st) if (f < rows.size() && std::find(seen.begin(), seen.end(), f) == seen.end()) { seen.push_back(f); ++rows[f].total; }
    std::string key;
    for (std::uint32_t f : st) key += (key.empty() ? "" : ";") + (f < m.functions.size() ? m.functions[f].name : std::string("?"));
    ++folded[key];
    stacks.push_back(std::move(st));
  }
  if (!o.folded.empty()) { std::ofstream f(o.folded); for (auto& [k, n] : folded) f << k << ' ' << n << '\n'; }
  if (!o.speedscope.empty()) {
    std::ofstream f(o.speedscope);
    f << "{\"$schema\":\"https://www.speedscope.app/file-format-schema.json\",\"exporter\":\"zinc profile\",\"name\":\"zinc\",\"activeProfileIndex\":0,\"shared\":{\"frames\":[";
    for (std::size_t k = 0; k < m.functions.size(); ++k) f << (k ? "," : "") << "{\"name\":" << jsonStr(m.functions[k].name) << "}";
    f << "]},\"profiles\":[{\"type\":\"sampled\",\"name\":\"interpreter\",\"unit\":\"seconds\",\"startValue\":0,\"endValue\":" << g.samples * dt << ",\"samples\":[";
    for (std::size_t k = 0; k < stacks.size(); ++k) {
      f << (k ? "," : "") << "[";
      for (std::size_t j = 0; j < stacks[k].size(); ++j) f << (j ? "," : "") << stacks[k][j];
      f << "]";
    }
    f << "],\"weights\":[";
    for (std::size_t k = 0; k < stacks.size(); ++k) f << (k ? "," : "") << dt;
    f << "]}]}\n";
  }
  std::vector<std::size_t> order(rows.size());
  for (std::size_t k = 0; k < order.size(); ++k) order[k] = k;
  std::sort(order.begin(), order.end(), [&](std::size_t a, std::size_t b) { return rows[a].self != rows[b].self ? rows[a].self > rows[b].self : rows[a].total > rows[b].total; });
  char line[256];
  std::snprintf(line, sizeof line, "zinc profile: %zu samples at %d Hz (%.0f ms of CPU)%s\n", g.samples, g.hz, g.samples * dt * 1000, g.dropped ? ", some samples dropped" : "");
  report = line;
  report += "   self%     self ms   total%    total ms  function\n";
  double n = g.samples ? static_cast<double>(g.samples) : 1.0;
  for (std::size_t k = 0; k < order.size() && k < 30; ++k) {
    const Row& r = rows[order[k]];
    if (!r.total) break;
    std::snprintf(line, sizeof line, "%7.1f%% %10.1f %7.1f%% %11.1f  @%s\n", 100.0 * static_cast<double>(r.self) / n, static_cast<double>(r.self) * dt * 1000, 100.0 * static_cast<double>(r.total) / n,
                  static_cast<double>(r.total) * dt * 1000, m.functions[order[k]].name.c_str());
    report += line;
  }
  return res;
}

// ---- zinc mem
namespace {

struct MemOut {
  std::string* report;
  bool json;
};

std::string classLabel(const rt::ClassRT& c) { return c.name; }

void finishMem(Machine& m, const void* data) {
  const auto* mo = static_cast<const MemOut*>(data);
  rt::MemStats& s = *m.mem;
  std::map<std::uint32_t, std::uint64_t> leaks;
  std::uint64_t leaked = 0;
  for (const rt::Obj* o : m.allocated) {
    if (o->rc == rt::kImmortal) continue;
    ++leaks[o->cls->id];
    ++leaked;
    s.perClass[o->cls->id].payloadBytes += m.payloadBytes(o);  // survivors count their storage too
  }
  rusage ru{};
  getrusage(RUSAGE_SELF, &ru);
#ifdef __APPLE__
  double peakRssMb = static_cast<double>(ru.ru_maxrss) / (1024.0 * 1024.0);
#else
  double peakRssMb = static_cast<double>(ru.ru_maxrss) / 1024.0;
#endif
  std::string& r = *mo->report;
  char line[320];
  if (mo->json) {
    r = "{\"allocs\":" + std::to_string(s.allocs) + ",\"frees\":" + std::to_string(s.frees) + ",\"retains\":" + std::to_string(s.retains) + ",\"releases\":" + std::to_string(s.releases) +
        ",\"peakLiveObjects\":" + std::to_string(s.peakLive) + ",\"peakObjectBytes\":" + std::to_string(s.peakBytes) + ",\"leaked\":" + std::to_string(leaked);
    std::snprintf(line, sizeof line, ",\"processPeakRssMb\":%.2f,\"classes\":[", peakRssMb);
    r += line;
    bool first = true;
    for (std::size_t k = 0; k < s.perClass.size(); ++k) {
      const rt::ClassMem& c = s.perClass[k];
      if (!c.allocs) continue;
      r += std::string(first ? "" : ",") + "{\"name\":" + jsonStr(classLabel(m.classes[k])) + ",\"allocs\":" + std::to_string(c.allocs) + ",\"peakLive\":" + std::to_string(c.peakLive) +
           ",\"headerBytes\":" + std::to_string(c.headerBytes) + ",\"payloadBytes\":" + std::to_string(c.payloadBytes) + ",\"leaked\":" + std::to_string(leaks[static_cast<std::uint32_t>(k)]) + "}";
      first = false;
    }
    r += "]}\n";
    return;
  }
  std::snprintf(line, sizeof line, "zinc mem: %llu allocations, %llu frees, peak %llu live objects (%llu bytes of objects), %llu left at exit\n",
                static_cast<unsigned long long>(s.allocs), static_cast<unsigned long long>(s.frees), static_cast<unsigned long long>(s.peakLive), static_cast<unsigned long long>(s.peakBytes),
                static_cast<unsigned long long>(leaked));
  r = line;
  std::snprintf(line, sizeof line, "          reference counting: %llu retains, %llu releases; process peak RSS %.1f MB\n", static_cast<unsigned long long>(s.retains),
                static_cast<unsigned long long>(s.releases), peakRssMb);
  r += line;
  r += "   allocs  peak live   object bytes  storage bytes  left  class\n";
  std::vector<std::size_t> order;
  for (std::size_t k = 0; k < s.perClass.size(); ++k) if (s.perClass[k].allocs) order.push_back(k);
  std::sort(order.begin(), order.end(), [&](std::size_t a, std::size_t b) { return s.perClass[a].headerBytes + s.perClass[a].payloadBytes > s.perClass[b].headerBytes + s.perClass[b].payloadBytes; });
  for (std::size_t k : order) {
    const rt::ClassMem& c = s.perClass[k];
    std::snprintf(line, sizeof line, "%9llu %10llu %14llu %14llu %5llu  %s\n", static_cast<unsigned long long>(c.allocs), static_cast<unsigned long long>(c.peakLive),
                  static_cast<unsigned long long>(c.headerBytes), static_cast<unsigned long long>(c.payloadBytes), static_cast<unsigned long long>(leaks[static_cast<std::uint32_t>(k)]),
                  classLabel(m.classes[k]).c_str());
    r += line;
  }
}

void enableMem(Machine& m, const void*) { m.enableMem(); }

}  // namespace

rt::Result memory(const zbc::Module& m, std::string& out, bool json, std::string& report) {
  MemOut mo{&report, json};
  rt::Result res = vm::runHooked(m, out, enableMem, nullptr, finishMem, &mo);
  return res;
}

}  // namespace zn::prof
