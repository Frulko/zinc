// The system host of the console cores (ZN-454: psp, vita, ps2, n3ds, ios-legacy): the zinc:sys, loop, fs and storage rows a program needs, without
// libuv (no epoll or kqueue on a console), in the style of targets/wasm/host_wasi.cpp but with a real clock and real files. Everything goes through the
// HAL the core links (runtime/include/hal.h: hal_time_us, hal_sleep_us, hal_env, hal_log_err) and the C library's stdio, so one file serves every console;
// the console's HAL file adds one function, zn_console_data_dir(), the writable directory of the app (ms0:/PSP/GAME/<app>/, ux0:data/<id>/...).
//
// Rows served:
//   zinc:sys   args (zn_console_set_args), env (hal_env), platform (ZN_CONSOLE_PLATFORM), pid (1), cwd and launchDir (the data directory), locale (en-US),
//              isatty (0), writeErr, randomByte, utf8 length / byte / decode, bytesToString, allocations and live blocks, device (the HAL's hal_device: battery,
//              network, motion, gyro, vibrate, reartouch, microphone, stereo, eye, storage; "" for what it lacks)
//   loop       real (1 unless ZINC_DETERMINISTIC or ZINC_CLOCK=virtual: then waits advance a virtual clock), now, wait (hal_sleep_us), epoch
//              (gettimeofday); no events (evNext "", evReady 0, evActive 0, nativePoll 0)
//   zinc:fs    failed, error, readText, writeText, appendText, exists, load and byte, writeBytes, remove (a file), rename, copyFile: stdio only, relative
//              paths under the data directory
//   storage    get, set, remove, keys: the desktop's `key TAB value` file (src/host/sys_host.cpp), storage.kv in the data directory
//   time zone  UTC (offset 0, name "UTC")
// Any other row (processes, sockets, HTTP, directories, stat, regex, crypto...) is reported once on the HAL's error log and answers 0 / "".
#include <sys/time.h>
#include <unistd.h>

#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "hal.h"
#include "rt/rt.h"
#include "zn/host.h"
#include "zn/runtime.h"

#ifndef ZN_CONSOLE_PLATFORM
#define ZN_CONSOLE_PLATFORM "console"
#endif

extern "C" __attribute__((weak)) const char* zn_console_data_dir(void) { return ""; }   // the console's HAL gives its own
extern "C" __attribute__((weak)) const char* hal_device(const char*, const char*) { return nullptr; }   // the hardware the HAL answers for (ZN-759)

namespace {
using zn::host::HostArg;
using zn::Rt;

std::vector<std::string> gArgs;
std::string gOut, gError;
bool gFailed = false;
std::vector<unsigned char> gBytes;
std::vector<std::string> gKeys;
bool gVirtual = false;
double gVirtualNow = 0;
std::uint64_t gStartUs = 0;

void ret(HostArg* r, std::string s) { gOut = std::move(s); r->p = gOut.data(); r->n = static_cast<std::uint32_t>(gOut.size()); }
std::string str(const HostArg& a) { return std::string(static_cast<const char*>(a.p), a.n); }
bool envSet(const char* n) { const char* v = hal_env(n); return v && *v && *v != '0'; }

std::string dataDir() { const char* d = zn_console_data_dir(); return d ? d : ""; }
// a relative path is the app's: under the data directory (a device name such as ms0: or ux0: makes it absolute)
std::string at(const std::string& p) {
  const std::string d = dataDir();
  if (d.empty() || p.empty() || p[0] == '/' || p.find(':') != std::string::npos) return p;
  return d.back() == '/' ? d + p : d + "/" + p;
}
const char* codeOf(int e) { return e == ENOENT ? "ENOENT" : e == EACCES ? "EACCES" : e == EEXIST ? "EEXIST" : e == EISDIR ? "EISDIR" : "EIO"; }
void fail(const char* op, const std::string& path) { gFailed = true; gError = std::string(codeOf(errno)) + ": " + op + " " + path; }

bool readAll(const std::string& path, std::vector<unsigned char>& out) {
  std::FILE* f = std::fopen(at(path).c_str(), "rb");
  if (!f) { fail("open", path); return false; }
  out.clear();
  unsigned char buf[4096];
  for (std::size_t n; (n = std::fread(buf, 1, sizeof buf, f)) > 0;) out.insert(out.end(), buf, buf + n);
  std::fclose(f);
  return true;
}
bool writeAll(const std::string& path, const char* p, std::size_t n, bool append) {
  std::FILE* f = std::fopen(at(path).c_str(), append ? "ab" : "wb");
  if (!f) { fail("open", path); return false; }
  const bool ok = std::fwrite(p, 1, n, f) == n;
  if (std::fclose(f) != 0 || !ok) { fail("write", path); return false; }
  return true;
}
std::string bytesOf(const HostArg& v) {   // an array of bytes, one slot each
  std::string out;
  const auto* p = static_cast<const std::uint64_t*>(v.p);
  for (std::uint32_t i = 0; i < v.n; ++i) out += static_cast<char>(p[i] & 0xFF);
  return out;
}
std::string utf8Decode(const std::uint64_t* p, std::size_t n) {   // each invalid sequence becomes U+FFFD, as src/host/sys_host.cpp and TextDecoder do
  std::string out;
  for (std::size_t i = 0; i < n;) {
    const unsigned b = static_cast<unsigned>(p[i] & 0xFF);
    const int len = b < 0x80 ? 1 : (b >= 0xC2 && b <= 0xDF) ? 2 : (b >= 0xE0 && b <= 0xEF) ? 3 : (b >= 0xF0 && b <= 0xF4) ? 4 : 0;
    if (len == 0) { out += "\xEF\xBF\xBD"; ++i; continue; }
    unsigned lo = 0x80, hi = 0xBF;
    if (b == 0xE0) lo = 0xA0; else if (b == 0xED) hi = 0x9F; else if (b == 0xF0) lo = 0x90; else if (b == 0xF4) hi = 0x8F;
    std::size_t k = 1;
    for (; k < static_cast<std::size_t>(len); ++k) {
      if (i + k >= n) break;
      const unsigned c = static_cast<unsigned>(p[i + k] & 0xFF);
      if (c < (k == 1 ? lo : 0x80u) || c > (k == 1 ? hi : 0xBFu)) break;
    }
    if (k < static_cast<std::size_t>(len)) { out += "\xEF\xBF\xBD"; i += k; continue; }
    for (std::size_t j = 0; j < k; ++j) out += static_cast<char>(p[i + j] & 0xFF);
    i += k;
  }
  return out;
}

// storage: the desktop's format (key TAB value lines, backslash, tab and newline escaped), read and rewritten whole: the stores are small
std::string esc(const std::string& s) { std::string r; for (char c : s) r += c == '\\' ? "\\\\" : c == '\t' ? "\\t" : c == '\n' ? "\\n" : std::string(1, c); return r; }
std::string unesc(const std::string& s) {
  std::string r;
  for (std::size_t i = 0; i < s.size(); ++i) {
    if (s[i] == '\\' && i + 1 < s.size()) { const char c = s[++i]; r += c == 't' ? '\t' : c == 'n' ? '\n' : c; } else r += s[i];
  }
  return r;
}
std::string storagePath() { const char* p = hal_env("ZINC_STORAGE"); return p && *p ? p : at("storage.kv"); }
std::map<std::string, std::string> storageLoad() {
  std::map<std::string, std::string> m;
  std::vector<unsigned char> b;
  const std::string path = storagePath();
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return m;
  unsigned char buf[4096];
  for (std::size_t n; (n = std::fread(buf, 1, sizeof buf, f)) > 0;) b.insert(b.end(), buf, buf + n);
  std::fclose(f);
  std::string text(b.begin(), b.end());
  for (std::size_t from = 0; from < text.size();) {
    std::size_t nl = text.find('\n', from);
    if (nl == std::string::npos) nl = text.size();
    const std::string line = text.substr(from, nl - from);
    const std::size_t t = line.find('\t');
    if (t != std::string::npos) m[unesc(line.substr(0, t))] = unesc(line.substr(t + 1));
    from = nl + 1;
  }
  return m;
}
void storageSave(const std::map<std::string, std::string>& m) {
  std::string text;
  for (const auto& [k, v] : m) text += esc(k) + '\t' + esc(v) + '\n';
  if (std::FILE* f = std::fopen(storagePath().c_str(), "wb")) { std::fwrite(text.data(), 1, text.size(), f); std::fclose(f); }
}

double nowMs() { return gVirtual ? gVirtualNow : static_cast<double>(hal_time_us() - gStartUs) / 1000.0; }
void waitMs(double ms) {
  if (!(ms > 0)) return;
  if (gVirtual) { gVirtualNow += ms; return; }
  for (std::uint64_t left = static_cast<std::uint64_t>(ms * 1000.0); left > 0;) {   // a HAL may cap one sleep (hal_posix: a second)
    const std::uint64_t t0 = hal_time_us();
    hal_sleep_us(left);
    const std::uint64_t spent = hal_time_us() - t0;
    if (spent == 0) break;   // a clock coarser than the wait: the sleep was the wait
    left = spent >= left ? 0 : left - spent;
  }
}

void call(int id, const HostArg* a, HostArg* r) {
  auto n = [&](int k) { return static_cast<int>(a[k].i); };
  switch (static_cast<Rt>(id)) {
    case Rt::HostSysArgsCount: r->i = static_cast<std::int64_t>(gArgs.size()); break;
    case Rt::HostSysArg: ret(r, n(0) >= 0 && static_cast<std::size_t>(n(0)) < gArgs.size() ? gArgs[static_cast<std::size_t>(n(0))] : ""); break;
    case Rt::HostSysEnv: { const char* v = hal_env(str(a[0]).c_str()); ret(r, v ? v : ""); break; }
    case Rt::HostSysPlatform: ret(r, ZN_CONSOLE_PLATFORM); break;
    case Rt::HostSysPid: r->i = 1; break;
    case Rt::HostSysCwd: case Rt::HostSysLaunchDir: ret(r, dataDir()); break;
    case Rt::HostSysLocale: ret(r, "en-US"); break;
    case Rt::HostSysIsatty: r->i = 0; break;
    case Rt::HostSysWriteErr: hal_log_err(static_cast<const char*>(a[0].p), a[0].n); break;
    case Rt::HostSysRandomByte: r->i = std::rand() & 0xFF; break;
    case Rt::HostSysUtf8Len: r->i = a[0].n; break;
    case Rt::HostSysUtf8Byte: r->i = static_cast<std::uint32_t>(n(1)) < a[0].n ? static_cast<unsigned char>(static_cast<const char*>(a[0].p)[n(1)]) : 0; break;
    case Rt::HostSysUtf8Decode: ret(r, utf8Decode(static_cast<const std::uint64_t*>(a[0].p), a[0].n)); break;
    case Rt::HostSysBytesToString: ret(r, bytesOf(a[0])); break;
    case Rt::HostSysAllocations: r->d = static_cast<double>(zn::rt::gAllocs); break;
    case Rt::HostSysLiveBlocks: r->d = static_cast<double>(zn::rt::gAllocs - zn::rt::gFrees); break;
    case Rt::HostSysDevice: {   // storage: where zinc:storage keeps its keys (the PS2's memory card)
      const std::string q = str(a[0]);
      const char* d = hal_device(q.c_str(), str(a[1]).c_str());
      std::string where = d ? d : q == "storage" ? storagePath() : "";
      char cwd[256];   // a relative place is the working directory's (the PSP's game folder)
      if (!d && q == "storage" && where.find(':') == std::string::npos && where[0] != '/' && getcwd(cwd, sizeof cwd)) where = std::string(cwd) + "/" + where;
      ret(r, where);
      break;
    }
    case Rt::HostLoopReal: r->i = gVirtual ? 0 : 1; break;
    case Rt::HostLoopNow: r->d = nowMs(); break;
    case Rt::HostLoopWait: waitMs(a[0].d); break;
    case Rt::HostLoopEpoch: { timeval tv{}; gettimeofday(&tv, nullptr); r->d = static_cast<double>(tv.tv_sec) * 1000.0 + static_cast<double>(tv.tv_usec) / 1000.0; break; }
    case Rt::HostEvNext: ret(r, ""); break;
    case Rt::HostEvReady: case Rt::HostEvActive: case Rt::HostNativePoll: r->i = 0; break;
    case Rt::HostFsFailed: r->i = gFailed; gFailed = false; break;
    case Rt::HostFsError: ret(r, gError); break;
    case Rt::HostFsReadText: { std::vector<unsigned char> b; ret(r, readAll(str(a[0]), b) ? std::string(b.begin(), b.end()) : ""); break; }
    case Rt::HostFsWriteText: writeAll(str(a[0]), static_cast<const char*>(a[1].p), a[1].n, false); break;
    case Rt::HostFsAppendText: writeAll(str(a[0]), static_cast<const char*>(a[1].p), a[1].n, true); break;
    case Rt::HostFsExists: { std::FILE* f = std::fopen(at(str(a[0])).c_str(), "rb"); r->i = f != nullptr; if (f) std::fclose(f); break; }
    case Rt::HostFsLoad: r->i = readAll(str(a[0]), gBytes) ? static_cast<std::int64_t>(gBytes.size()) : 0; break;
    case Rt::HostFsByte: r->i = n(0) >= 0 && static_cast<std::size_t>(n(0)) < gBytes.size() ? gBytes[static_cast<std::size_t>(n(0))] : 0; break;
    case Rt::HostFsWriteBytes: { const std::string d = bytesOf(a[1]); writeAll(str(a[0]), d.data(), d.size(), false); break; }
    case Rt::HostFsRemove: r->i = std::remove(at(str(a[0])).c_str()) == 0; break;
    case Rt::HostFsRename: if (std::rename(at(str(a[0])).c_str(), at(str(a[1])).c_str()) != 0) fail("rename", str(a[0])); break;
    case Rt::HostFsCopyFile: { std::vector<unsigned char> b; if (readAll(str(a[0]), b)) writeAll(str(a[1]), reinterpret_cast<const char*>(b.data()), b.size(), false); break; }
    case Rt::HostStorageGet: { auto m = storageLoad(); auto it = m.find(str(a[0])); ret(r, it == m.end() ? "" : it->second); break; }
    case Rt::HostStorageSet: { auto m = storageLoad(); m[str(a[0])] = str(a[1]); storageSave(m); break; }
    case Rt::HostStorageRemove: { auto m = storageLoad(); m.erase(str(a[0])); storageSave(m); break; }
    case Rt::HostStorageKeysCount: { gKeys.clear(); for (auto& kv : storageLoad()) gKeys.push_back(kv.first); r->i = static_cast<std::int64_t>(gKeys.size()); break; }
    case Rt::HostStorageKey: ret(r, n(0) >= 0 && static_cast<std::size_t>(n(0)) < gKeys.size() ? gKeys[static_cast<std::size_t>(n(0))] : ""); break;
    case Rt::HostTzOffset: case Rt::HostTzOffsetIn: r->d = 0; break;
    case Rt::HostTzName: ret(r, "UTC"); break;
    default: {
      static std::set<int> seen;
      if (seen.insert(id).second) {
        char line[160];
        const int k = std::snprintf(line, sizeof line, "console host: %s is not available on %s\n", zn::kRtInfo[id].name, ZN_CONSOLE_PLATFORM);
        hal_log_err(line, static_cast<std::size_t>(k > 0 ? k : 0));
      }
      r->i = 0; r->d = 0; ret(r, "");
    }
  }
}
}  // namespace

// The core's entry gives the program's arguments (argv after the program) and installs the host before the program starts.
extern "C" void zn_console_set_args(int argc, const char* const* argv) { gArgs.assign(argv, argv + (argc > 0 ? argc : 0)); }
extern "C" void zn_console_install_host(void) {
  const char* clock = hal_env("ZINC_CLOCK");
  gVirtual = envSet("ZINC_DETERMINISTIC") || (clock && !std::strcmp(clock, "virtual"));
  if (clock && !std::strcmp(clock, "real")) gVirtual = false;
  gStartUs = hal_time_us();
  std::srand(static_cast<unsigned>(gStartUs));
  zn::host::hostSys = call;
}
// the graphics host's installGfx installs the system host through this (src/host/sys_host.cpp on the desktop)
void zn::host::installSys() { zn_console_install_host(); }
