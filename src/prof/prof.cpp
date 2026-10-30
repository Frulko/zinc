#include "prof/prof.h"

#include <pthread.h>
#include <time.h>

#include <algorithm>
#include <atomic>
#include <memory>
#include <csignal>
#include <cstdio>
#include <fstream>
#include <map>
#ifndef _WIN32
#include <sys/time.h>
#endif
#include "platform/platform.h"

#include "rt/worker.h"
#include "vm/vm.h"
#include "zn/host.h"
#include "zn/runtime.h"

namespace zn::prof {
namespace {

using rt::Frame;
using rt::Func;
using rt::Machine;

// ---- the sampler: one track per thread that runs a program (the main one, each worker). ITIMER_PROF sends SIGPROF to the thread that spends the
// CPU; the handler finds that thread's track and copies its call stack (function indices) into memory the track reserved before it runs.
// A sample is: the time (two words, microseconds), the depth, then the function indices from the one running to the outermost caller.
struct Track {
  std::atomic<bool> live{false};
  pthread_t th{};
  Machine* m = nullptr;
  const zbc::Module* mod = nullptr;
  std::string name;
  int tid = 1;                      // the trace's thread id: 1 the main thread, 100 + id a worker (as zn::host::threadTrace names them)
  std::vector<std::uint32_t> buf;
  std::size_t used = 0, samples = 0, dropped = 0;
};
constexpr int kTracks = 33;          // the main thread and 32 workers
struct Sampler {
  Track tracks[kTracks];
  std::atomic<int> n{0};
  int hz = 1000;
};
Sampler* g = nullptr;

std::uint64_t nowUs() {   // async-signal-safe
  timespec ts{};
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return static_cast<std::uint64_t>(ts.tv_sec) * 1000000u + static_cast<std::uint64_t>(ts.tv_nsec) / 1000u;
}

[[maybe_unused]] void onProf(int) {   // no SIGPROF on Windows
  Sampler* s = g;
  if (!s) return;
  const int n = std::min(s->n.load(std::memory_order_acquire), kTracks);
  Track* t = nullptr;
  for (int k = 0; k < n && !t; ++k) if (s->tracks[k].live.load(std::memory_order_acquire) && pthread_equal(s->tracks[k].th, pthread_self())) t = &s->tracks[k];
  if (!t) return;   // a thread that runs no program (the loop's, a raster band)
  Machine* m = t->m;
  if (!m->curFn) return;
  if (t->used + 68 > t->buf.size()) { ++t->dropped; return; }
  const Func* base = m->funcs.data();
  const std::uint64_t now = nowUs();
  std::uint32_t* p = &t->buf[t->used + 3];
  std::uint32_t d = 0;
  p[d++] = static_cast<std::uint32_t>(m->curFn - base);
  for (const Frame* f = m->fp; f > m->frames.get() && d < 64;) {
    --f;
    if (f->fn) p[d++] = static_cast<std::uint32_t>(f->fn - base);
  }
  t->buf[t->used] = static_cast<std::uint32_t>(now);
  t->buf[t->used + 1] = static_cast<std::uint32_t>(now >> 32);
  t->buf[t->used + 2] = d;
  t->used += 3 + d;
  ++t->samples;
}

// A thread's track, before its program runs (on that thread: the handler compares pthread_self).
void addTrack(Machine& m, const std::string& name, int tid, std::size_t words) {
  if (!g) return;
  const int k = g->n.fetch_add(1, std::memory_order_acq_rel);   // the handler skips a track until it is live
  if (k >= kTracks) return;   // ponytail: the 33rd thread on is not sampled
  Track& t = g->tracks[k];
  t.th = pthread_self();
  t.m = &m;
  t.mod = m.mod;
  t.name = name;
  t.tid = tid;
  t.buf.assign(words, 0);
  m.trackFn = true;
  t.live.store(true, std::memory_order_release);
}
void endTrack(Machine& m) {
  if (!g) return;
  for (int k = 0; k < std::min(g->n.load(std::memory_order_acquire), kTracks); ++k) if (g->tracks[k].m == &m) g->tracks[k].live.store(false, std::memory_order_release);
}
void onWorker(Machine& m, int id, const std::string& entry, bool begin) {
  if (begin) addTrack(m, "zinc worker " + entry + "#" + std::to_string(id), 100 + id, std::size_t(1) << 20);   // 1M words: about 25k samples
  else endTrack(m);
}

void startTimer(Machine& m, const void* data) {
  const auto* o = static_cast<const ProfileOptions*>(data);
  addTrack(m, "main", 1, std::size_t(1) << 22);   // 4M words: about 100k samples of a typical depth
  g->hz = o->hz > 0 ? o->hz : 1000;
#ifdef _WIN32
  std::fprintf(stderr, "zinc profile: no sampling on Windows yet (no SIGPROF): the report has no samples\n");
  // ponytail: a sampler thread that suspends the program's threads (SuspendThread, GetThreadContext) when zinc profile is ported
#else
  struct sigaction sa;
  sa.sa_handler = onProf;
  sigemptyset(&sa.sa_mask);
  sa.sa_flags = SA_RESTART;
  sigaction(SIGPROF, &sa, nullptr);
  itimerval it;
  it.it_interval.tv_sec = 0; it.it_interval.tv_usec = 1000000 / g->hz;
  it.it_value = it.it_interval;
  setitimer(ITIMER_PROF, &it, nullptr);
#endif
}

void stopTimer(Machine& m, const void*) {
#ifndef _WIN32
  itimerval off{};
  setitimer(ITIMER_PROF, &off, nullptr);
  signal(SIGPROF, SIG_IGN);
#endif
  endTrack(m);
}

std::string jsonStr(const std::string& s) {
  std::string r = "\"";
  for (char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += c; } else if (static_cast<unsigned char>(c) < 0x20) r += ' '; else r += c; }
  return r + "\"";
}

struct Sample { std::uint64_t t; std::vector<std::uint32_t> st; };   // st: root first
std::vector<Sample> samplesOf(const Track& t) {
  std::vector<Sample> v;
  for (std::size_t at = 0; at < t.used;) {
    Sample s;
    s.t = t.buf[at] | static_cast<std::uint64_t>(t.buf[at + 1]) << 32;
    const std::uint32_t d = t.buf[at + 2];
    s.st.assign(t.buf.begin() + static_cast<std::ptrdiff_t>(at + 3), t.buf.begin() + static_cast<std::ptrdiff_t>(at + 3 + d));
    at += 3 + d;
    std::reverse(s.st.begin(), s.st.end());
    v.push_back(std::move(s));
  }
  return v;
}
std::string fnName(const Track& t, std::uint32_t f) { return t.mod && f < t.mod->functions.size() ? t.mod->functions[f].name : std::string("?"); }

// A thread's samples as the slices of a flame chart: consecutive samples that share their callers continue the same slices; a gap of more than
// two periods (the thread waited) closes them.
void traceSlices(const Track& t, const std::vector<Sample>& ss, std::uint64_t period, std::string& o) {
  struct Open { std::uint32_t fn; std::uint64_t t0; };
  std::vector<Open> open;
  std::uint64_t last = 0;
  auto close = [&](std::size_t keep, std::uint64_t at) {
    while (open.size() > keep) {
      const Open& x = open.back();
      o += ",{\"name\":" + jsonStr(fnName(t, x.fn)) + ",\"cat\":\"zinc.sample\",\"ph\":\"X\",\"pid\":1,\"tid\":" + std::to_string(t.tid) + ",\"ts\":" + std::to_string(x.t0) +
           ",\"dur\":" + std::to_string(at > x.t0 ? at - x.t0 : 1) + "}";
      open.pop_back();
    }
  };
  for (const Sample& s : ss) {
    if (!open.empty() && s.t > last + 2 * period) close(0, last + period);
    std::size_t k = 0;
    while (k < open.size() && k < s.st.size() && open[k].fn == s.st[k]) ++k;
    close(k, s.t);
    for (; k < s.st.size(); ++k) open.push_back({s.st[k], s.t});
    last = s.t;
  }
  close(0, last + period);
}

}  // namespace

rt::Result profile(const zbc::Module& m, std::string& out, const ProfileOptions& o, std::string& report) {
  auto sampler = std::make_unique<Sampler>();
  g = sampler.get();
  rt::worker::machineHook = onWorker;
  if (!o.trace.empty()) rt::worker::traceThreads(1, nowUs, nullptr);   // the workers' messages as flows, on the samples' clock
  rt::Result res = vm::runHooked(m, out, startTimer, &o, stopTimer, nullptr);
  rt::worker::machineHook = nullptr;
  std::string flows;
  if (!o.trace.empty()) { std::size_t n = 0; const char* p = rt::worker::traceThreads(0, nullptr, &n); flows.assign(p, n); }
  g = nullptr;
  const double dt = 1.0 / sampler->hz;
  const int nt = std::min(sampler->n.load(), kTracks);
  std::vector<std::vector<Sample>> per(static_cast<std::size_t>(nt));
  for (int k = 0; k < nt; ++k) per[static_cast<std::size_t>(k)] = samplesOf(sampler->tracks[k]);
  // the frames: each module's functions once (the instances of a worker share theirs)
  std::map<const zbc::Module*, std::size_t> offset;
  std::vector<std::string> frames;
  for (int k = 0; k < nt; ++k) {
    const zbc::Module* md = sampler->tracks[k].mod;
    if (!md || offset.count(md)) continue;
    offset[md] = frames.size();
    for (const auto& f : md->functions) frames.push_back(f.name);
  }
  if (!o.folded.empty()) {
    std::map<std::string, std::uint64_t> folded;
    for (int k = 0; k < nt; ++k) {
      const Track& t = sampler->tracks[k];
      for (const Sample& s : per[static_cast<std::size_t>(k)]) {
        std::string key = k ? t.name : "";   // a worker's stacks under its thread's name; the main thread's as they were
        for (std::uint32_t f : s.st) key += (key.empty() ? "" : ";") + fnName(t, f);
        ++folded[key];
      }
    }
    std::ofstream f(o.folded);
    for (auto& [k, n] : folded) f << k << ' ' << n << '\n';
  }
  if (!o.speedscope.empty()) {   // one profile per thread
    std::ofstream f(o.speedscope);
    f << "{\"$schema\":\"https://www.speedscope.app/file-format-schema.json\",\"exporter\":\"zinc profile\",\"name\":\"zinc\",\"activeProfileIndex\":0,\"shared\":{\"frames\":[";
    for (std::size_t k = 0; k < frames.size(); ++k) f << (k ? "," : "") << "{\"name\":" << jsonStr(frames[k]) << "}";
    f << "]},\"profiles\":[";
    for (int k = 0; k < nt; ++k) {
      const Track& t = sampler->tracks[k];
      const auto& ss = per[static_cast<std::size_t>(k)];
      const std::size_t off = t.mod ? offset[t.mod] : 0;
      f << (k ? "," : "") << "{\"type\":\"sampled\",\"name\":" << jsonStr(k ? t.name : "interpreter") << ",\"unit\":\"seconds\",\"startValue\":0,\"endValue\":" << ss.size() * dt << ",\"samples\":[";
      for (std::size_t i = 0; i < ss.size(); ++i) {
        f << (i ? "," : "") << "[";
        for (std::size_t j = 0; j < ss[i].st.size(); ++j) f << (j ? "," : "") << off + ss[i].st[j];
        f << "]";
      }
      f << "],\"weights\":[";
      for (std::size_t i = 0; i < ss.size(); ++i) f << (i ? "," : "") << dt;
      f << "]}";
    }
    f << "]}\n";
  }
  if (!o.trace.empty()) {   // Chrome trace (Perfetto, chrome://tracing): a named track per thread, its sampled calls as slices, the workers' message flows
    std::string tr = "[{\"name\":\"process_name\",\"ph\":\"M\",\"pid\":1,\"tid\":1,\"args\":{\"name\":\"zinc\"}}";
    for (int k = 0; k < nt; ++k) {
      const Track& t = sampler->tracks[k];
      tr += ",{\"name\":\"thread_name\",\"ph\":\"M\",\"pid\":1,\"tid\":" + std::to_string(t.tid) + ",\"args\":{\"name\":" + jsonStr(t.name) + "}}";
      traceSlices(t, per[static_cast<std::size_t>(k)], static_cast<std::uint64_t>(1000000 / sampler->hz), tr);
    }
    tr += flows + "]\n";
    std::ofstream f(o.trace);
    f << tr;
  }
  char line[256];
  report.clear();
  for (int k = 0; k < nt; ++k) {   // a table per thread: functions by self time
    const Track& t = sampler->tracks[k];
    const auto& ss = per[static_cast<std::size_t>(k)];
    if (k && ss.empty()) continue;
    const std::size_t nf = t.mod ? t.mod->functions.size() : 0;
    struct Row { std::uint64_t self = 0, total = 0; };
    std::vector<Row> rows(nf);
    for (const Sample& s : ss) {
      if (!s.st.empty() && s.st.back() < nf) ++rows[s.st.back()].self;
      std::vector<std::uint32_t> seen;
      for (std::uint32_t f : s.st) if (f < nf && std::find(seen.begin(), seen.end(), f) == seen.end()) { seen.push_back(f); ++rows[f].total; }
    }
    std::vector<std::size_t> order(nf);
    for (std::size_t i = 0; i < nf; ++i) order[i] = i;
    std::sort(order.begin(), order.end(), [&](std::size_t a, std::size_t b) { return rows[a].self != rows[b].self ? rows[a].self > rows[b].self : rows[a].total > rows[b].total; });
    if (k == 0) std::snprintf(line, sizeof line, "zinc profile: %zu samples at %d Hz (%.0f ms of CPU)%s\n", ss.size(), sampler->hz, static_cast<double>(ss.size()) * dt * 1000, t.dropped ? ", some samples dropped" : "");
    else std::snprintf(line, sizeof line, "zinc profile: thread %s: %zu samples (%.0f ms of CPU)%s\n", t.name.c_str(), ss.size(), static_cast<double>(ss.size()) * dt * 1000, t.dropped ? ", some samples dropped" : "");
    report += line;
    report += "   self%     self ms   total%    total ms  function\n";
    const double n = ss.empty() ? 1.0 : static_cast<double>(ss.size());
    for (std::size_t i = 0; i < order.size() && i < 30; ++i) {
      const Row& r = rows[order[i]];
      if (!r.total) break;
      std::snprintf(line, sizeof line, "%7.1f%% %10.1f %7.1f%% %11.1f  @%s\n", 100.0 * static_cast<double>(r.self) / n, static_cast<double>(r.self) * dt * 1000, 100.0 * static_cast<double>(r.total) / n,
                    static_cast<double>(r.total) * dt * 1000, t.mod->functions[order[i]].name.c_str());
      report += line;
    }
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
  double peakRssMb = static_cast<double>(zn::plat::maxRssBytes()) / (1024.0 * 1024.0);
  // what the loaded groups of zinc:assets hold (ZN-436): data outside the objects counted here, freed by unloadGroup
  double assetsPeak = 0, assetsLeft = 0;
  if (zn::host::hostSys) {
    zn::host::HostArg a[1], res;
    a[0].i = 1;
    zn::host::hostSys(static_cast<int>(Rt::HostAssetsStat), a, &res);
    assetsPeak = res.d;
    a[0].i = 0;
    zn::host::hostSys(static_cast<int>(Rt::HostAssetsStat), a, &res);
    assetsLeft = res.d;
  }
  std::string& r = *mo->report;
  char line[320];
  if (mo->json) {
    r = "{\"allocs\":" + std::to_string(s.allocs) + ",\"frees\":" + std::to_string(s.frees) + ",\"retains\":" + std::to_string(s.retains) + ",\"releases\":" + std::to_string(s.releases) +
        ",\"peakLiveObjects\":" + std::to_string(s.peakLive) + ",\"peakObjectBytes\":" + std::to_string(s.peakBytes) + ",\"leaked\":" + std::to_string(leaked);
    if (assetsPeak > 0) { std::snprintf(line, sizeof line, ",\"assetsPeakBytes\":%.0f,\"assetsBytesAtExit\":%.0f", assetsPeak, assetsLeft); r += line; }
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
  if (assetsPeak > 0) { std::snprintf(line, sizeof line, "          assets: peak %.0f bytes resident, %.0f at exit\n", assetsPeak, assetsLeft); r += line; }
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
