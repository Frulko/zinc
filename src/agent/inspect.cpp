// The inspector, the frame, the telemetry and the load of an app on a device (ZN-729.05). The device's side is small: the agent gives every
// app it starts a port for its inspector (ZINC_DEVTOOLS_PORT, read by zinc:devtools), keeps it beside the pid, and says it in `apps` with the
// CPU time and the memory of the app's process group; `top` is that answer sent every second. The workstation's side is the four commands
// `zinc device [<device>] inspect|shot|monitor|top`, built on what client.cpp has: a forwarded port, the followed log. Nothing here speaks
// the DevTools protocol in C++: `shot` runs a few lines of Zinc with the WebSocket of zinc:socket, `monitor` pipes the log into `zinc monitor`.
#include "wire.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>
#ifdef __APPLE__
#include <libproc.h>
#include <mach/mach_time.h>
#endif

#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <future>
#include <map>
#include <thread>

namespace zn::agent {

namespace fs = std::filesystem;

namespace {

int fail(const std::string& why) { std::fprintf(stderr, "zinc device: %s\n", why.c_str()); return 1; }

// The CPU time (user and system, in ms) and the resident memory (bytes) of the processes of a group, summed: an app is the group the agent
// started it in (the engine, or the shell of an export and what it runs).
void groupUsage(long group, long long& cpuMs, long long& rss) {
#ifdef __APPLE__
  static const double toNs = [] { mach_timebase_info_data_t t{}; ::mach_timebase_info(&t); return t.denom ? static_cast<double>(t.numer) / t.denom : 1.0; }();   // Apple silicon counts in ticks
  pid_t pids[256];   // ponytail: the first 256 processes of the group
  const int n = ::proc_listpgrppids(static_cast<pid_t>(group), pids, sizeof pids);
  for (int i = 0; i < n && i < 256; ++i) {
    rusage_info_v2 ri{};
    if (::proc_pid_rusage(pids[i], RUSAGE_INFO_V2, reinterpret_cast<rusage_info_t*>(&ri)) != 0) continue;
    cpuMs += static_cast<long long>(static_cast<double>(ri.ri_user_time + ri.ri_system_time) * toNs / 1e6);
    rss += static_cast<long long>(ri.ri_resident_size);
  }
#else
  // /proc/<pid>/stat: "pid (name) state ppid pgrp ... utime stime ... rss"; the name may hold spaces and brackets, so the fields are counted
  // from the last ')': pgrp is the 3rd, utime and stime the 12th and 13th (in clock ticks), rss the 22nd (in pages).
  std::error_code ec;
  for (const auto& e : fs::directory_iterator("/proc", ec)) {
    const std::string name = e.path().filename().string();
    std::string stat;
    if (name.empty() || name[0] < '0' || name[0] > '9' || !readFile(e.path().string() + "/stat", stat)) continue;
    std::vector<long long> f;
    const char* p = stat.c_str() + std::min(stat.rfind(')') + 1, stat.size());
    for (int i = 0; i < 22 && *p; ++i) {
      while (*p == ' ') ++p;
      f.push_back(std::atoll(p));   // the state letter reads as 0
      while (*p && *p != ' ') ++p;
    }
    if (f.size() < 22 || f[2] != group) continue;
    cpuMs += (f[11] + f[12]) * 1000 / ::sysconf(_SC_CLK_TCK);
    rss += f[21] * ::sysconf(_SC_PAGESIZE);
  }
#endif
}

}  // namespace

// ---- the device's side ----

int inspectorPort(Env& env) {
  for (const auto& kv : env) if (kv.first == "ZINC_DEVTOOLS_PORT") return std::atoi(kv.second.c_str());
  // ponytail: a port found free, then closed: another program can take it before the app listens (the app then says "port unavailable" in its
  // log). The app choosing its port (ZINC_DEVTOOLS_PORT=0) and the agent reading it from the log would close the gap.
  const int fd = ::socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  socklen_t n = sizeof a;
  int port = 0;
  if (fd >= 0 && ::bind(fd, reinterpret_cast<sockaddr*>(&a), sizeof a) == 0 && ::getsockname(fd, reinterpret_cast<sockaddr*>(&a), &n) == 0) port = ntohs(a.sin_port);
  if (fd >= 0) ::close(fd);
  if (port > 0) env.emplace_back("ZINC_DEVTOOLS_PORT", std::to_string(port));
  return port;
}

void appStats(Obj& o, const std::string& pidFile, long pid) {
  std::string text;
  readFile(pidFile, text);
  const size_t nl = text.find('\n');
  long long cpuMs = 0, rss = 0;
  groupUsage(pid, cpuMs, rss);
  const long long at = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
  o.num("inspector", nl == std::string::npos ? 0 : std::atoi(text.c_str() + nl + 1)).num("cpuMs", cpuMs).num("rss", rss).num("at", at);
}

void every(Chan& c, int ms, const std::function<std::string()>& what, const std::atomic<bool>& stop) {
  while (!stop && send(c, kJson, what())) {
    pollfd p{c.fd, POLLIN, 0};
    if (::poll(&p, 1, ms) > 0 && !fill(c)) break;   // the workstation left
  }
}

// ---- the workstation's side ----

namespace {

// The port the inspector of a running app listens on, on the device; 0 with the reason said.
int inspectorOf(Device& d, const std::string& app) {
  std::string answer, reply;
  if (!ask(d, Obj().str("op", "apps").done(), answer)) return 0;
  const Doc a(answer);
  for (const Val& x : a.items("apps")) {
    if (x.str("name") != app) continue;
    const int port = static_cast<int>(x.num("inspector"));
    if (!x.flag("running")) { fail(app + " is not running on " + d.name + ": zinc device run " + app); return 0; }
    if (port <= 0) { fail("the agent of " + d.name + " does not say where the inspector of " + app + " is: it was started by an older agent"); return 0; }
    if (!ask(d, Obj().str("op", "connect").num("port", port).done(), reply, false)) { fail(app + " has no inspector (yet): a program gets one with import 'zinc:devtools'"); return 0; }
    return port;
  }
  fail("no app named " + app + " on " + d.name + " (zinc device apps)");
  return 0;
}

// A port of this machine forwarded to `remote` of the device for as long as this process lives; 0 when it could not listen.
int startForward(Device device, int remote) {
  auto port = std::make_shared<std::promise<int>>();
  std::future<int> listening = port->get_future();
  std::thread([device, remote, port]() mutable {
    bool said = false;
    forwardPort(device, 0, remote, [&](int local) { said = true; port->set_value(local); });
    if (!said) port->set_value(0);
  }).detach();
  return listening.get();
}

int cmdInspect(Device& d, const std::vector<std::string>& args) {
  std::string app;
  int local = 0;
  for (size_t i = 0; i < args.size(); ++i) { if (args[i] == "--port" && i + 1 < args.size()) local = std::atoi(args[++i].c_str()); else app = args[i]; }
  if (app.empty()) return fail("usage: zinc device [<device>] inspect <app> [--port n]");
  const int remote = inspectorOf(d, app);
  if (remote <= 0) return 1;
  return forwardPort(d, local, remote, [&](int port) {
    std::printf("inspector of %s on %s: ws://127.0.0.1:%d/zinc\n"
                "  Chrome: devtools://devtools/bundled/inspector.html?ws=127.0.0.1:%d/zinc, or chrome://inspect with localhost:%d among the network targets\n"
                "  Zinc Inspector lists the apps of paired devices by itself. Ctrl-C ends this forwarding.\n",
                app.c_str(), d.name.c_str(), port, port, port);
  });
}

// What asks the inspector for the frame: the engine's own WebSocket (zinc:socket), so no second implementation of it lives in the agent.
const char* const kShot = R"ts(import { WebSocket, MessageEvent } from 'zinc:socket';
import { base64Decode } from 'zinc:web';
import { writeBytes } from 'zinc:fs';
import * as sys from 'zinc:sys';
const a = sys.args();
const ws = new WebSocket('ws://127.0.0.1:' + a[0] + '/zinc');
ws.onopen = () => { ws.send('{"id":1,"method":"Page.captureScreenshot","params":{}}'); };
ws.onmessage = (e: MessageEvent) => {
  const m = JSON.parse(e.data);
  if (m.id === undefined) return;
  const png: string = m.result.data;
  if (png.length === 0) { console.error('the app has drawn no frame yet'); sys.exit(1); }
  writeBytes(a[1], base64Decode(png));
  sys.exit(0);
};
ws.onclose = () => { console.error('the inspector closed the connection'); sys.exit(1); };
setTimeout(() => { console.error('no answer from the inspector'); sys.exit(1); }, 15000);
)ts";

int cmdShot(Device& d, const std::vector<std::string>& args, const std::string& self) {
  if (args.empty() || args.size() > 2) return fail("usage: zinc device [<device>] shot <app> [file.png]");
  const std::string app = args[0], out = args.size() > 1 ? args[1] : app + ".png";
  const int remote = inspectorOf(d, app);
  if (remote <= 0) return 1;
  const int local = startForward(d, remote);
  if (local <= 0) return 1;
  std::error_code ec;
  const fs::path dir = fs::temp_directory_path(ec) / ("zinc-shot-" + std::to_string(::getpid()));
  fs::create_directories(dir, ec);
  const std::string script = (dir / "shot.ts").string();
  if (!writePrivate(script, kShot)) return fail("cannot write " + script);
  fs::remove(out, ec);
  int rc = runTool({self, "run", "-q", script, "--", std::to_string(local), out});
  fs::remove_all(dir, ec);
  std::string png;
  if (rc == 0 && (!readFile(out, png) || png.size() < 24 || png.compare(1, 3, "PNG") != 0)) rc = 1;
  if (rc != 0) fail("no frame from " + app + " on " + d.name);
  else {
    const auto be = [&](size_t at) { return (static_cast<unsigned>(static_cast<unsigned char>(png[at])) << 24) | (static_cast<unsigned char>(png[at + 1]) << 16) | (static_cast<unsigned char>(png[at + 2]) << 8) | static_cast<unsigned char>(png[at + 3]); };
    std::printf("wrote %s (%u x %u, %s on %s)\n", out.c_str(), be(16), be(20), app.c_str(), d.name.c_str());
  }
  std::fflush(stdout);
  ::_exit(rc);   // not a return: the forwarding thread is still in its sessions, and the statics it uses must not be destroyed under it
}

// The app's log, followed, through `zinc monitor`: its words for the zinc:telemetry lines, the other lines as they are.
int cmdMonitor(Device& d, const std::vector<std::string>& args, const std::string& self) {
  if (args.size() != 1) return fail("usage: zinc device [<device>] monitor <app>");
  int p[2];
  if (::pipe(p) != 0) return fail(std::string("pipe: ") + std::strerror(errno));
  std::fflush(stdout);
  const pid_t reader = ::fork();
  if (reader == 0) {
    ::dup2(p[0], STDIN_FILENO);
    ::close(p[0]);
    ::close(p[1]);
    ::execl(self.c_str(), self.c_str(), "monitor", static_cast<char*>(nullptr));
    ::_exit(127);
  }
  ::dup2(p[1], STDOUT_FILENO);
  ::close(p[0]);
  ::close(p[1]);
  const int rc = followLogs(d, args[0]);
  ::close(STDOUT_FILENO);   // the reader prints what it holds and ends
  int status = 0;
  while (reader > 0 && ::waitpid(reader, &status, 0) < 0 && errno == EINTR) {}
  return rc;
}

int cmdTop(Device& d, const std::vector<std::string>& args) {
  long count = -1;
  bool json = false;
  for (size_t i = 0; i < args.size(); ++i) {
    if (args[i] == "-n" && i + 1 < args.size()) count = std::atol(args[++i].c_str());
    else if (args[i] == "--json") json = true;
    else return fail("usage: zinc device [<device>] top [-n count] [--json]");
  }
  std::string sample;
  std::unique_ptr<Chan> c = ask(d, Obj().str("op", "top").done(), sample);   // the answer is the first sample
  if (!c) return 1;
  const bool screen = !json && ::isatty(STDOUT_FILENO);
  std::map<std::string, std::pair<long long, long long>> before;   // per app: its CPU time and the device's clock at the sample before
  for (long i = 0; count < 0 || i < count; ++i) {
    char type = kJson;
    if (i > 0 && (!recv(*c, type, sample) || type != kJson)) return fail("the session with " + d.name + " ended");
    if (json) { std::printf("%s\n", sample.c_str()); if (std::fflush(stdout) != 0) return 0; continue; }   // one sample per line; CPU % is cpuMs over at
    const Doc s(sample);
    char line[320];
    std::snprintf(line, sizeof line, "%s  load %.2f %.2f %.2f  memory %lld MB free of %lld", s.str("name").c_str(), s.real("load1"), s.real("load5"), s.real("load15"), s.num("memFree") >> 20, s.num("memTotal") >> 20);
    std::string text = std::string(screen ? "\033[H\033[J" : "") + line;
    if (s.has("tempC")) { std::snprintf(line, sizeof line, "  %.1f C", s.real("tempC")); text += line; }
    std::snprintf(line, sizeof line, "\n%-24s %8s %7s %10s\n", "APP", "PID", "CPU %", "MEMORY");
    text += line;
    for (const Val& app : s.items("apps")) {
      if (!app.flag("running")) continue;
      const std::string name = app.str("name");
      const long long cpu = app.num("cpuMs"), at = app.num("at");
      char pct[16] = "-";   // a share needs two samples
      if (const auto b = before.find(name); b != before.end() && at > b->second.second) std::snprintf(pct, sizeof pct, "%.1f", 100.0 * static_cast<double>(cpu - b->second.first) / static_cast<double>(at - b->second.second));
      before[name] = {cpu, at};
      std::snprintf(line, sizeof line, "%-24s %8lld %7s %7.1f MB\n", name.c_str(), app.num("pid"), pct, static_cast<double>(app.num("rss")) / 1048576.0);
      text += line;
    }
    std::fputs(text.c_str(), stdout);
    if (std::fflush(stdout) != 0) return 0;   // the reader of our output left
  }
  return 0;
}

}  // namespace

int inspectCommand(Device& d, const std::string& op, const std::vector<std::string>& args, const std::string& self) {
  if (op == "inspect") return cmdInspect(d, args);
  if (op == "shot") return cmdShot(d, args, self);
  if (op == "monitor") return cmdMonitor(d, args, self);
  return cmdTop(d, args);
}

// For a program that shows them (Zinc Inspector): one line "<port> <device> <app>" per inspector forwarded, then "ready". The forwarding
// lasts as long as whoever started this command, so a program that ends without a word leaves nothing behind.
// ponytail: the apps that run when the command starts; started again (Zinc Inspector: Find programs), it sees the new ones.
int inspectAll(std::vector<Device>& paired) {
  int forwarded = 0;
  for (Device& d : paired) {
    std::string answer;
    if (!ask(d, Obj().str("op", "apps").done(), answer)) continue;   // away: said on stderr
    const Doc a(answer);
    for (const Val& app : a.items("apps")) {
      const int remote = static_cast<int>(app.num("inspector"));
      const int local = app.flag("running") && remote > 0 ? startForward(d, remote) : 0;
      if (local <= 0) continue;
      std::printf("%d %s %s\n", local, d.name.c_str(), app.str("name").c_str());
      ++forwarded;
    }
  }
  std::printf("ready\n");
  std::fflush(stdout);
  const pid_t parent = ::getppid();
  while (forwarded > 0 && ::getppid() == parent) ::sleep(1);
  std::fflush(stdout);
  ::_exit(0);   // as in shot: the forwarding threads are still at work
}

}  // namespace zn::agent
