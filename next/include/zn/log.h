#pragma once
// What the engine says while it works (ZN-368), on stderr and only when asked: ZINC_LOG=<level> or ZINC_LOG=<module>=<level>,... (levels: info, debug,
// trace; modules: build, plugin, run, ui, ...; `*` for all), and `zinc -v` (every module at info) or `-vv` (debug), which set it. ZINC_LOG_FORMAT=json (or
// `--log-format json`) writes one JSON object per line: {"t": seconds since start, "module", "level", "msg", "ms" when timed}. Header only: the CLI, the
// toolchain and the graphics host share one state per process (inline variables).
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>

namespace zn::log {

enum Level { Off = 0, Info = 1, Debug = 2, Trace = 3 };

struct State {
  bool read = false, json = false;
  int all = Off;
  std::map<std::string, int> modules;
  std::chrono::steady_clock::time_point t0 = std::chrono::steady_clock::now();
};
inline State gState;

inline int levelOf(const std::string& s) { return s == "trace" ? Trace : s == "debug" ? Debug : s == "info" || s == "1" ? Info : Off; }

inline State& state() {
  State& st = gState;
  if (st.read) return st;
  st.read = true;
  const char* f = std::getenv("ZINC_LOG_FORMAT");
  st.json = f && !std::strcmp(f, "json");
  const char* e = std::getenv("ZINC_LOG");
  std::string spec = e ? e : "", item;
  for (std::size_t i = 0; i <= spec.size(); ++i) {
    if (i < spec.size() && spec[i] != ',') { item += spec[i]; continue; }
    const std::size_t eq = item.find('=');
    if (eq == std::string::npos) st.all = levelOf(item);
    else if (item.compare(0, eq, "*") == 0) st.all = levelOf(item.substr(eq + 1));
    else st.modules[item.substr(0, eq)] = levelOf(item.substr(eq + 1));
    item.clear();
  }
  return st;
}

inline bool on(const char* module, int level) {
  State& st = state();
  auto it = st.modules.find(module);
  return (it != st.modules.end() ? it->second : st.all) >= level;
}

inline std::string jsonEscape(const std::string& s) {
  std::string r;
  for (char c : s) {
    if (c == '"' || c == '\\') { r += '\\'; r += c; }
    else if (static_cast<unsigned char>(c) < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); r += b; }
    else r += c;
  }
  return r;
}

// One line: "zinc[build] parse 3.21 ms" or the JSON object. `ms` < 0: no duration.
inline void write(const char* module, int level, const std::string& msg, double ms = -1) {
  if (!on(module, level)) return;
  State& st = state();
  const double t = std::chrono::duration<double>(std::chrono::steady_clock::now() - st.t0).count();
  static const char* names[] = {"off", "info", "debug", "trace"};
  if (st.json) {
    if (ms >= 0) std::fprintf(stderr, "{\"t\":%.4f,\"module\":\"%s\",\"level\":\"%s\",\"msg\":\"%s\",\"ms\":%.3f}\n", t, module, names[level], jsonEscape(msg).c_str(), ms);
    else std::fprintf(stderr, "{\"t\":%.4f,\"module\":\"%s\",\"level\":\"%s\",\"msg\":\"%s\"}\n", t, module, names[level], jsonEscape(msg).c_str());
  } else {
    if (ms >= 0) std::fprintf(stderr, "zinc[%s] %s %.2f ms\n", module, msg.c_str(), ms);
    else std::fprintf(stderr, "zinc[%s] %s\n", module, msg.c_str());
  }
}

// A timed phase: written with its duration when it ends (when the module's level allows it; costs one clock read otherwise).
struct Phase {
  const char* module;
  std::string name;
  int level;
  std::chrono::steady_clock::time_point t0 = std::chrono::steady_clock::now();
  Phase(const char* m, std::string n, int l = Info) : module(m), name(std::move(n)), level(l) {}
  ~Phase() { if (on(module, level)) write(module, level, name, std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count()); }
};

}  // namespace zn::log
