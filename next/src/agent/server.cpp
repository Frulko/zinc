// `zinc agent`: the daemon on the device. One thread per connection, one request per connection (a forwarded port or a shell is a connection
// of its own, so nothing is multiplexed). Its files live in <ZINC_HOME>/agent: agent.json (who this device is), clients.json (the paired
// workstations and their keys, mode 0600), pairing.json (the code of an open pairing), apps/<name>/, logs/<name>.log, run/<name>.pid.
#include "agent.h"

#include "../tc/tc.h"
#include "../zapp.h"
#include "wire.h"

#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <poll.h>
#include <signal.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <sys/utsname.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>
#ifdef __APPLE__
#include <mach/mach.h>
#include <sys/sysctl.h>
#include <util.h>
#else
#include <pty.h>
#endif

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <filesystem>
#include <functional>
#include <map>
#include <mutex>
#include <thread>

extern char** environ;

namespace zn::agent {

namespace fs = std::filesystem;

namespace {

std::atomic<bool> gStop{false};   // set by SIGINT and SIGTERM: a signal handler has nowhere else to write
void onStop(int) { gStop = true; }

constexpr std::uintmax_t kLogMax = 4u << 20, kLogKeep = 1u << 20;

struct Client { std::string id, name, key, added; };

struct State {
  std::string home, self, engine, name, id, os, kind;
  int port = kPort;
  bool shell = true;
  std::mutex mu;       // clients.json
  std::mutex pairMu;   // one pairing attempt at a time, so the tries are counted
  std::string pairCode;
  int pairTries = 0;
  std::atomic<int> live{0};
  std::mutex parkMu;                    // connections a reversed port took, each waiting for the workstation's session to carry it
  std::map<std::string, int> parked;
};

void say(const std::string& line) { std::printf("zinc agent: %s\n", line.c_str()); std::fflush(stdout); }

std::string stamp() {
  char b[32];
  const std::time_t t = std::time(nullptr);
  std::strftime(b, sizeof b, "%Y-%m-%d %H:%M:%S", std::localtime(&t));
  return b;
}

// ---- the paired workstations ----

std::vector<Client> loadClients(const std::string& home) {
  std::vector<Client> out;
  std::string text;
  if (!readFile(home + "/clients.json", text)) return out;
  const Doc d(text);
  for (const Val& c : d.items("clients")) out.push_back({c.str("id"), c.str("name"), unhex(c.str("key")), c.str("added")});
  return out;
}

bool saveClients(const std::string& home, const std::vector<Client>& clients) {
  std::vector<std::string> items;
  for (const Client& c : clients) items.push_back(Obj().str("id", c.id).str("name", c.name).str("key", hex(c.key)).str("added", c.added).done());
  return writePrivate(home + "/clients.json", Obj().raw("clients", array(items)).done() + "\n");
}

// ---- pairing ----

// A new code, valid five minutes; it replaces the one before.
std::string openPairing(const std::string& home) {
  const std::string r = randomBytes(4);
  if (r.size() != 4) return std::string();
  std::uint32_t v = 0;
  std::memcpy(&v, r.data(), 4);
  char code[8];
  std::snprintf(code, sizeof code, "%06u", v % 1000000u);
  return writePrivate(home + "/pairing.json", Obj().str("code", code).num("until", static_cast<long long>(std::time(nullptr)) + 300).done()) ? code : std::string();
}

std::string pairingCode(const std::string& home) {
  std::string text;
  if (!readFile(home + "/pairing.json", text)) return std::string();
  const Doc d(text);
  if (d.num("until") < static_cast<long long>(std::time(nullptr))) { ::unlink((home + "/pairing.json").c_str()); return std::string(); }
  return d.str("code");
}

void handlePair(State& s, int fd) {
  Chan c;
  c.fd = fd;
  std::lock_guard<std::mutex> lock(s.pairMu);
  const std::string code = pairingCode(s.home);
  if (code != s.pairCode) { s.pairCode = code; s.pairTries = 0; }
  if (code.empty() || s.pairTries >= 3) { sendLine(fd, "ZNA1 closed"); return; }
  ++s.pairTries;   // counted before the handshake: a try that never ends is a try
  sendLine(fd, "ZNA1 ok");
  std::string err;
  if (!openPake(c, true, code, err) || !handshake(c, 10000, err)) {
    say("a pairing attempt failed (" + std::to_string(s.pairTries) + " of 3)");
    if (s.pairTries >= 3) { ::unlink((s.home + "/pairing.json").c_str()); say("pairing closed after three wrong codes: zinc agent pair opens it again"); }
    return;
  }
  char type;
  std::string payload;
  if (!recv(c, type, payload, 10000) || type != kJson) return;
  const Doc req(payload);
  Client cl{hex(randomBytes(8)), cleanName(req.str("name")), randomBytes(32), stamp()};
  bool saved = false;
  if (cl.id.size() == 16 && cl.key.size() == 32) {
    std::lock_guard<std::mutex> files(s.mu);
    std::vector<Client> clients = loadClients(s.home);
    clients.push_back(cl);
    saved = saveClients(s.home, clients);
  }
  if (!saved) { refuse(c, "the device could not keep the key"); return; }
  ::unlink((s.home + "/pairing.json").c_str());   // one code, one workstation
  send(c, kJson, Obj().flag("ok", true).str("id", s.id).str("name", s.name).str("client", cl.id).str("key", hex(cl.key)).done());
  say("paired with " + cl.name + " (" + cl.id + ")");
}

// ---- what the machine is ----

std::string firstLine(const std::string& path) {
  std::string text;
  if (!readFile(path, text)) return std::string();
  text = text.substr(0, text.find('\n'));
  while (!text.empty() && (text.back() == '\0' || text.back() == ' ' || text.back() == '\r')) text.pop_back();
  return text;
}

#ifdef __APPLE__
std::string sysctlText(const char* name) {
  char b[256] = "";
  size_t n = sizeof b - 1;
  return ::sysctlbyname(name, b, &n, nullptr, 0) == 0 ? std::string(b) : std::string();
}
std::uint64_t sysctlNumber(const char* name) {
  std::uint64_t v = 0;
  size_t n = sizeof v;
  return ::sysctlbyname(name, &v, &n, nullptr, 0) == 0 ? v : 0;
}
#else
// The value of "<key>: value" (or "<key>\t: value") in a /proc file; in kB for /proc/meminfo.
std::string procField(const std::string& path, const std::string& key) {
  std::string text;
  if (!readFile(path, text)) return std::string();
  size_t at = 0;
  while (at < text.size()) {
    const size_t end = std::min(text.find('\n', at), text.size());
    const std::string line = text.substr(at, end - at);
    const size_t colon = line.find(':');
    if (colon != std::string::npos) {
      std::string k = line.substr(0, colon);
      while (!k.empty() && (k.back() == ' ' || k.back() == '\t')) k.pop_back();
      if (k == key) { size_t v = colon + 1; while (v < line.size() && (line[v] == ' ' || line[v] == '\t')) ++v; return line.substr(v); }
    }
    at = end + 1;
  }
  return std::string();
}
#endif

std::string machineKind() {
#ifdef __APPLE__
  return sysctlText("hw.model");
#else
  std::string m = firstLine("/proc/device-tree/model");   // a Raspberry Pi, a CHIP, a board
  if (m.empty()) m = firstLine("/sys/devices/virtual/dmi/id/product_name");
  return m;
#endif
}

pid_t runningPid(const State& s, const std::string& name) {
  const long pid = std::atol(firstLine(s.home + "/run/" + name + ".pid").c_str());
  return pid > 0 && ::kill(static_cast<pid_t>(pid), 0) == 0 ? static_cast<pid_t>(pid) : 0;
}

std::string appsJson(const State& s) {
  std::vector<std::string> items;
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(s.home + "/apps", ec)) {
    const std::string name = e.path().filename().string();
    if (name.empty() || name[0] == '.' || !e.is_directory(ec)) continue;
    const pid_t pid = runningPid(s, name);
    items.push_back(Obj().str("name", name).str("kind", fs::exists(e.path() / "app.zapp", ec) ? "zapp" : "export").flag("running", pid > 0).num("pid", pid).done());
  }
  std::sort(items.begin(), items.end());
  return array(items);
}

std::string infoJson(const State& s) {
  struct utsname u{};
  ::uname(&u);
  Obj o;
  o.flag("ok", true).str("id", s.id).str("name", s.name).str("engine", s.engine).str("os", s.os).str("osVersion", u.release).str("arch", u.machine).str("kind", s.kind);
  o.num("cores", std::thread::hardware_concurrency());
  double load[3] = {0, 0, 0};
  ::getloadavg(load, 3);
  o.real("load1", load[0]).real("load5", load[1]).real("load15", load[2]);
#ifdef __APPLE__
  o.str("cpu", sysctlText("machdep.cpu.brand_string")).num("memTotal", static_cast<long long>(sysctlNumber("hw.memsize")));
  vm_statistics64_data_t vm{};
  mach_msg_type_number_t n = HOST_VM_INFO64_COUNT;
  if (::host_statistics64(mach_host_self(), HOST_VM_INFO64, reinterpret_cast<host_info64_t>(&vm), &n) == KERN_SUCCESS)
    o.num("memFree", static_cast<long long>(vm.free_count + vm.inactive_count) * static_cast<long long>(::sysconf(_SC_PAGESIZE)));   // what Activity Monitor calls available, roughly
  struct timeval boot{};
  size_t bn = sizeof boot;
  if (::sysctlbyname("kern.boottime", &boot, &bn, nullptr, 0) == 0) o.num("uptime", static_cast<long long>(std::time(nullptr) - boot.tv_sec));
#else
  std::string cpu = procField("/proc/cpuinfo", "model name");
  if (cpu.empty()) cpu = procField("/proc/cpuinfo", "Model");
  if (cpu.empty()) cpu = procField("/proc/cpuinfo", "Hardware");
  o.str("cpu", cpu);
  o.num("memTotal", std::atoll(procField("/proc/meminfo", "MemTotal").c_str()) * 1024).num("memFree", std::atoll(procField("/proc/meminfo", "MemAvailable").c_str()) * 1024);
  const long long khz = std::atoll(firstLine("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq").c_str());
  if (khz > 0) o.num("mhz", khz / 1000);
  const std::string temp = firstLine("/sys/class/thermal/thermal_zone0/temp");
  if (!temp.empty()) o.real("tempC", std::atof(temp.c_str()) / 1000.0);
  o.num("uptime", std::atoll(firstLine("/proc/uptime").c_str()));
#endif
  struct statvfs d{};
  if (::statvfs(s.home.c_str(), &d) == 0)
    o.num("diskTotal", static_cast<long long>(d.f_blocks) * static_cast<long long>(d.f_frsize)).num("diskFree", static_cast<long long>(d.f_bavail) * static_cast<long long>(d.f_frsize));
  const char* user = std::getenv("USER");
  o.str("user", user ? user : "").flag("shell", s.shell).raw("apps", appsJson(s));
  return o.done();
}

// ---- processes ----

// This process's environment with `extra` replacing or adding variables, as the strings execve takes.
std::vector<std::string> environment(const std::vector<std::pair<std::string, std::string>>& extra) {
  std::vector<std::string> env;
  for (char** e = environ; e && *e; ++e) {
    const std::string_view kv(*e);
    const std::string_view key = kv.substr(0, kv.find('='));
    bool replaced = false;
    for (const auto& x : extra) replaced = replaced || x.first == key;
    if (!replaced) env.emplace_back(kv);
  }
  for (const auto& x : extra) env.push_back(x.first + "=" + x.second);
  return env;
}

std::vector<char*> pointers(std::vector<std::string>& v) {
  std::vector<char*> p;
  for (std::string& x : v) p.push_back(x.data());
  p.push_back(nullptr);
  return p;
}

// In the child, between fork and exec: only calls that are safe there (other threads hold locks we will never see released).
[[noreturn]] void execChild(const char* dir, char* const* argv, char* const* envp) {
  if (dir && ::chdir(dir) != 0) ::_exit(126);
  ::signal(SIGPIPE, SIG_DFL);                      // the agent ignores it, and an ignored signal stays ignored across exec: `yes | head` would complain
  for (int fd = 3; fd < 4096; ++fd) ::close(fd);   // the sockets of the other sessions are not this program's
  ::execve(argv[0], argv, envp);
  ::_exit(127);
}

int exitCode(int status) { return WIFEXITED(status) ? WEXITSTATUS(status) : 128 + (WIFSIGNALED(status) ? WTERMSIG(status) : 0); }

// Ends a process group: asked first, killed when it has not gone after `graceMs`.
void endGroup(pid_t pid, int sig, int graceMs) {
  ::kill(-pid, sig);
  for (int waited = 0; waited < graceMs && ::kill(pid, 0) == 0; waited += 50) std::this_thread::sleep_for(std::chrono::milliseconds(50));
  if (::kill(pid, 0) == 0) ::kill(-pid, SIGKILL);
}

bool stopApp(const State& s, const std::string& name) {
  const pid_t pid = runningPid(s, name);
  if (pid <= 0) return false;
  endGroup(pid, SIGTERM, 3000);
  ::unlink((s.home + "/run/" + name + ".pid").c_str());
  return true;
}

// Starts an installed app in a session of its own, its output appended to its log: it outlives this agent, and a new agent finds it by its
// pid file. ponytail: the pid alone names it; a recycled pid would be taken for the app (add the start time if that ever bites).
pid_t startApp(const State& s, const std::string& name, const std::vector<std::string>& args, const std::vector<std::pair<std::string, std::string>>& extraEnv, std::string& err) {
  const std::string dir = s.home + "/apps/" + name;
  std::error_code ec;
  std::vector<std::string> argv;
  if (fs::exists(dir + "/app.zapp", ec)) {
    argv = {s.self, "run", dir + "/app.zapp"};
    if (!args.empty()) argv.push_back("--");
  } else if (fs::exists(dir + "/run.sh", ec)) {
    argv = {"/bin/sh", dir + "/run.sh"};
  } else {
    err = "no app named " + name + " on this device";
    return 0;
  }
  argv.insert(argv.end(), args.begin(), args.end());
  stopApp(s, name);
  fs::create_directories(s.home + "/logs", ec);
  fs::create_directories(s.home + "/run", ec);
  const int log = ::open((s.home + "/logs/" + name + ".log").c_str(), O_WRONLY | O_CREAT | O_TRUNC | O_APPEND, 0600);
  const int null = ::open("/dev/null", O_RDONLY);
  if (log < 0 || null < 0) { err = std::string("cannot open the log: ") + std::strerror(errno); if (log >= 0) ::close(log); if (null >= 0) ::close(null); return 0; }
  std::vector<std::string> env = environment(extraEnv);
  const std::vector<char*> argvp = pointers(argv), envp = pointers(env);
  const pid_t pid = ::fork();
  if (pid == 0) {
    ::setsid();
    ::dup2(null, 0);
    ::dup2(log, 1);
    ::dup2(log, 2);
    execChild(dir.c_str(), argvp.data(), envp.data());
  }
  ::close(log);
  ::close(null);
  if (pid < 0) { err = std::string("cannot start it: ") + std::strerror(errno); return 0; }
  const std::string pidFile = s.home + "/run/" + name + ".pid", logFile = s.home + "/logs/" + name + ".log";
  writePrivate(pidFile, std::to_string(pid) + "\n");
  std::thread([pid, pidFile, logFile] {   // its end goes in its log, and its pid file with it
    int status = 0;
    while (::waitpid(pid, &status, 0) < 0 && errno == EINTR) {}
    if (std::FILE* f = std::fopen(logFile.c_str(), "a")) { std::fprintf(f, "[exited %d]\n", exitCode(status)); std::fclose(f); }
    if (std::atol(firstLine(pidFile).c_str()) == pid) ::unlink(pidFile.c_str());
  }).detach();
  return pid;
}

// The logs are appended to by the apps themselves, so they are bounded from outside: past kLogMax the last kLogKeep bytes go to <name>.log.1
// and the log starts again. ponytail: lines written between the copy and the truncation are lost (logrotate's copytruncate has the same gap).
void boundLogs(const std::string& home) {
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(home + "/logs", ec)) {
    if (e.path().extension() != ".log" || e.file_size(ec) <= kLogMax) continue;
    std::string text;
    if (!readFile(e.path().string(), text)) continue;
    writePrivate(e.path().string() + ".1", text.substr(text.size() > kLogKeep ? text.size() - kLogKeep : 0));
    if (::truncate(e.path().c_str(), 0) != 0) continue;
  }
}

// ---- the operations ----

std::string homePath(std::string path) {   // as a shell would read it from the home directory
  const char* h = std::getenv("HOME");
  const std::string home = h ? h : "/";
  if (path.empty() || path == "~") return home;
  if (path.rfind("~/", 0) == 0) return home + path.substr(1);
  return path[0] == '/' ? path : home + "/" + path;
}

void opShell(State& s, Chan& c, const Val& req) {
  if (!s.shell) { refuse(c, "the shell is turned off on this device (zinc agent --no-shell)"); return; }
  const std::string cmd = req.str("cmd");
  const bool tty = req.flag("tty");
  const char* sh = std::getenv("SHELL");
  const std::string shell = sh && *sh ? sh : "/bin/sh";
  std::vector<std::string> argv = {shell, "-l"};
  if (!cmd.empty()) { argv[1] = "-lc"; argv.push_back(cmd); }
  std::vector<std::string> env = environment(tty ? std::vector<std::pair<std::string, std::string>>{{"TERM", req.str("term").empty() ? "xterm-256color" : req.str("term")}} : std::vector<std::pair<std::string, std::string>>{});
  const std::vector<char*> argvp = pointers(argv), envp = pointers(env);
  const std::string home = homePath("~");
  int master = -1, in[2] = {-1, -1}, out[2] = {-1, -1}, er[2] = {-1, -1};
  pid_t pid;
  if (tty) {
    struct winsize ws{};
    ws.ws_row = static_cast<unsigned short>(req.num("rows") > 0 ? req.num("rows") : 24);
    ws.ws_col = static_cast<unsigned short>(req.num("cols") > 0 ? req.num("cols") : 80);
    pid = ::forkpty(&master, nullptr, nullptr, &ws);
  } else {
    if (::pipe(in) != 0 || ::pipe(out) != 0 || ::pipe(er) != 0) { refuse(c, "cannot start a shell: no pipes"); return; }
    pid = ::fork();
  }
  if (pid == 0) {
    if (!tty) {
      ::setsid();
      ::dup2(in[0], 0);
      ::dup2(out[1], 1);
      ::dup2(er[1], 2);
    }
    execChild(home.c_str(), argvp.data(), envp.data());
  }
  if (!tty) { ::close(in[0]); ::close(out[1]); ::close(er[1]); }
  if (pid < 0) { refuse(c, std::string("cannot start a shell: ") + std::strerror(errno)); return; }
  int a = tty ? master : out[0], b = tty ? -1 : er[0], toChild = tty ? master : in[1];
  bool peerGone = !send(c, kJson, Obj().flag("ok", true).done());
  char buf[kChunk];
  // ponytail: the writes to the child block; a paste larger than the terminal's buffer into a program that prints as much without reading
  // would stall this session (queue the input if it ever happens)
  bool open = true;
  while (!peerGone) {
    char type;
    std::string payload;
    while (next(c, type, payload)) {   // first what is already here
      if (type == kIn && toChild >= 0) writeAll(toChild, payload.data(), payload.size());
      else if (type == kEof && tty) writeAll(master, "\x04", 1);
      else if (type == kEof && toChild >= 0) { ::close(toChild); toChild = -1; }
      else if (type == kWin && tty) {
        struct winsize ws{};
        int rows = 0, cols = 0;
        if (std::sscanf(payload.c_str(), "%d %d", &rows, &cols) == 2) { ws.ws_row = static_cast<unsigned short>(rows); ws.ws_col = static_cast<unsigned short>(cols); ::ioctl(master, TIOCSWINSZ, &ws); }
      }
    }
    if (!open) { peerGone = true; break; }
    if (a < 0 && b < 0) break;
    pollfd p[3] = {{c.fd, POLLIN, 0}, {a, POLLIN, 0}, {b, POLLIN, 0}};
    if (::poll(p, 3, -1) < 0) { if (errno == EINTR) continue; break; }
    for (int i = 1; i <= 2 && !peerGone; ++i) {
      int& fd = i == 1 ? a : b;
      if (fd < 0 || !p[i].revents) continue;
      const ssize_t n = ::read(fd, buf, sizeof buf);
      if (n > 0) peerGone = !send(c, i == 1 ? kOut : kErr, std::string_view(buf, static_cast<size_t>(n)));
      else if (n == 0 || (errno != EINTR && errno != EAGAIN)) { if (fd != master) ::close(fd); fd = -1; }   // EIO: the terminal's last process ended
    }
    if (p[0].revents) open = fill(c);
  }
  if (peerGone) endGroup(pid, SIGHUP, 2000);   // the workstation went away: its command goes with it
  if (master >= 0) ::close(master);
  if (!tty && toChild >= 0) ::close(toChild);
  if (!tty && a >= 0) ::close(a);
  if (!tty && b >= 0) ::close(b);
  int status = 0;
  while (::waitpid(pid, &status, 0) < 0 && errno == EINTR) {}
  if (!peerGone) send(c, kExit, std::to_string(exitCode(status)));
}

void opPush(Chan& c, const Val& req) {
  const std::string base = req.str("base");
  if (base.find('/') != std::string::npos || !safeRel(base)) { refuse(c, "bad name"); return; }
  const std::string path = homePath(req.str("path"));
  std::error_code ec;
  const std::string root = fs::is_directory(path, ec) && !base.empty() ? path + "/" + base : path;   // into a directory, as cp does
  if (!send(c, kJson, Obj().flag("ok", true).str("root", root).done())) return;
  std::uint64_t files = 0, bytes = 0;
  std::string err;
  if (recvTree(c, root, files, bytes, err)) send(c, kJson, Obj().flag("ok", true).num("files", static_cast<long long>(files)).num("bytes", static_cast<long long>(bytes)).str("root", root).done());
  else refuse(c, err);
}

void opPull(Chan& c, const Val& req) {
  const std::string path = homePath(req.str("path"));
  std::error_code ec;
  if (!fs::exists(path, ec)) { refuse(c, path + ": no such file or directory"); return; }
  if (!send(c, kJson, Obj().flag("ok", true).str("base", fs::path(path).filename().string()).flag("dir", fs::is_directory(path, ec)).done())) return;
  std::uint64_t files = 0, bytes = 0;
  std::string err;
  sendTree(c, path, files, bytes, err);
}

void opInstall(State& s, Chan& c, const Val& req) {
  std::error_code ec;
  const std::string stage = s.home + "/apps/.incoming-" + hex(randomBytes(6));
  fs::create_directories(stage, ec);
  if (ec || !send(c, kJson, Obj().flag("ok", true).done())) { fs::remove_all(stage, ec); return; }
  std::uint64_t files = 0, bytes = 0;
  std::string err, name = req.str("name").empty() ? std::string() : cleanName(req.str("name")), kind;
  const std::string payload = stage + "/payload", app = stage + "/app";
  bool ok = recvTree(c, payload, files, bytes, err);
  if (ok && fs::is_regular_file(payload, ec)) {   // a .zapp: checked as zinc run checks it, kept as the file it is
    // ponytail: the archive is read whole to check it; stream it through zapp::unpackTo when apps reach hundreds of megabytes
    std::string archive;
    std::map<std::string, std::string> members;
    ok = readFile(payload, archive) && zn::zapp::unpack(archive, s.engine, members, err);
    if (ok && name.empty()) { const Doc m(members["manifest.json"]); if (!m.str("name").empty()) name = cleanName(m.str("name")); }
    if (ok) { fs::create_directories(app, ec); fs::rename(payload, app + "/app.zapp", ec); }
    else if (err.empty()) err = "the archive could not be read";
    kind = "zapp";
  } else if (ok && fs::exists(payload + "/run.sh", ec)) {   // what zinc export writes
    if (name.empty() && !req.str("base").empty()) name = cleanName(req.str("base"));
    fs::rename(payload, app, ec);
    kind = "export";
  } else if (ok) {
    ok = false;
    err = "neither a .zapp nor an export directory (it has no run.sh)";
  }
  if (ok && name.empty()) { ok = false; err = "the app has no name: give one with --name"; }
  if (ok) {
    stopApp(s, name);
    const std::string dest = s.home + "/apps/" + name;
    fs::remove_all(dest, ec);
    fs::rename(app, dest, ec);
    if (ec) { ok = false; err = dest + ": " + ec.message(); }
  }
  fs::remove_all(stage, ec);
  if (ok) send(c, kJson, Obj().flag("ok", true).str("name", name).str("kind", kind).num("bytes", static_cast<long long>(bytes)).done());
  else refuse(c, err);
}

// The log of an app, then what it adds while the workstation stays (follow), until it goes.
void opLogs(State& s, Chan& c, const Val& req) {
  const std::string name = req.str("name"), path = s.home + "/logs/" + name + ".log";
  const int fd = name == cleanName(name) ? ::open(path.c_str(), O_RDONLY | O_CLOEXEC) : -1;
  if (fd < 0) { refuse(c, "no log for " + name + " on this device"); return; }
  bool ok = send(c, kJson, Obj().flag("ok", true).done());
  const bool follow = req.flag("follow");
  char buf[kChunk];
  off_t at = 0;
  while (ok && !gStop) {
    struct stat st{};
    if (::fstat(fd, &st) == 0 && st.st_size < at) at = 0;   // the log started again
    const ssize_t n = ::pread(fd, buf, sizeof buf, at);
    if (n > 0) { at += n; ok = send(c, kOut, std::string_view(buf, static_cast<size_t>(n))); continue; }
    if (!follow) break;
    pollfd p{c.fd, POLLIN, 0};
    if (::poll(&p, 1, 200) > 0 && !fill(c)) ok = false;   // the workstation left
  }
  ::close(fd);
  if (ok) send(c, kExit, "0");
}

void opConnect(Chan& c, const Val& req) {
  const long long port = req.num("port");
  std::string err;
  const int sock = port > 0 && port < 65536 ? dial("127.0.0.1", static_cast<int>(port), 3000, err) : -1;   // this machine's own ports only
  if (sock < 0) { refuse(c, "nothing listens on port " + std::to_string(port) + " of the device"); return; }
  if (send(c, kJson, Obj().flag("ok", true).done())) relaySocket(c, sock, kOut, kIn);
  ::close(sock);
}

// A port of the device that reaches a port of the workstation (adb reverse): the agent listens here, on this machine's own address only;
// each connection it takes is parked under a name sent on this session, and the workstation opens a session of its own to carry it.
void opListen(State& s, Chan& c, const Val& req) {
  const int lfd = ::socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = htons(static_cast<std::uint16_t>(req.num("port")));
  int one = 1;
  ::setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  socklen_t n = sizeof addr;
  if (lfd < 0 || ::bind(lfd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) != 0 || ::listen(lfd, 16) != 0 || ::getsockname(lfd, reinterpret_cast<sockaddr*>(&addr), &n) != 0) {
    refuse(c, "the device cannot listen on port " + std::to_string(req.num("port")) + ": " + std::strerror(errno));
    if (lfd >= 0) ::close(lfd);
    return;
  }
  ::fcntl(lfd, F_SETFD, FD_CLOEXEC);
  std::vector<std::string> mine;
  bool open = send(c, kJson, Obj().flag("ok", true).num("port", ntohs(addr.sin_port)).done());
  while (open && !gStop) {
    pollfd p[2] = {{c.fd, POLLIN, 0}, {lfd, POLLIN, 0}};
    if (::poll(p, 2, 500) <= 0) continue;
    if (p[0].revents && !fill(c)) break;   // the workstation left: the port closes with it
    if (!p[1].revents) continue;
    const int fd = ::accept(lfd, nullptr, nullptr);
    if (fd < 0) continue;
    prepare(fd);
    const std::string id = hex(randomBytes(8));
    { std::lock_guard<std::mutex> lock(s.parkMu); s.parked[id] = fd; }
    mine.push_back(id);
    open = send(c, kJson, Obj().str("accept", id).done());
  }
  ::close(lfd);
  std::lock_guard<std::mutex> lock(s.parkMu);
  for (const std::string& id : mine) if (const auto it = s.parked.find(id); it != s.parked.end()) { ::close(it->second); s.parked.erase(it); }   // never fetched
}

void opAccepted(State& s, Chan& c, const Val& req) {
  int fd = -1;
  {
    std::lock_guard<std::mutex> lock(s.parkMu);
    if (const auto it = s.parked.find(req.str("id")); it != s.parked.end()) { fd = it->second; s.parked.erase(it); }
  }
  if (fd < 0) { refuse(c, "no such connection"); return; }
  if (send(c, kJson, Obj().flag("ok", true).done())) relaySocket(c, fd, kOut, kIn);
  ::close(fd);
}

void handleSession(State& s, int fd) {
  Chan c;
  c.fd = fd;
  sendLine(fd, "ZNA1 ok");
  std::vector<Client> clients;
  { std::lock_guard<std::mutex> files(s.mu); clients = loadClients(s.home); }
  std::string err;
  if (!openPskServer(c, [&](const std::string& id) { for (const Client& cl : clients) if (cl.id == id) return cl.key; return std::string(); }, err) || !handshake(c, 10000, err)) return;
  const std::string who = peerIdentity(c);
  std::string whoName = who;
  for (const Client& cl : clients) if (cl.id == who) whoName = cl.name;
  char type;
  std::string payload;
  if (!recv(c, type, payload, 30000) || type != kJson) return;
  const Doc req(payload);
  const std::string op = req.str("op"), name = req.str("name");
  if (!req.ok() || op.empty()) { refuse(c, "not a request"); return; }
  say(whoName + ": " + op + (name.empty() ? "" : " " + name));   // who did what; never a command's text, which may hold a secret
  const bool named = !name.empty() && name == cleanName(name);   // an app's name is a directory's name here
  if (op == "info") send(c, kJson, infoJson(s));
  else if (op == "shell") opShell(s, c, req);
  else if (op == "push") opPush(c, req);
  else if (op == "pull") opPull(c, req);
  else if (op == "install") opInstall(s, c, req);
  else if (op == "logs") opLogs(s, c, req);
  else if (op == "connect") opConnect(c, req);
  else if (op == "listen") opListen(s, c, req);
  else if (op == "accepted") opAccepted(s, c, req);
  else if (op == "apps") send(c, kJson, Obj().flag("ok", true).raw("apps", appsJson(s)).done());
  else if (op == "run" || op == "stop" || op == "uninstall") {
    std::error_code ec;
    if (!named) refuse(c, "bad app name");
    else if (op == "run") {
      const pid_t pid = startApp(s, name, req.strs("args"), req.pairs("env"), err);
      if (pid > 0) send(c, kJson, Obj().flag("ok", true).num("pid", pid).done()); else refuse(c, err);
    } else if (op == "stop") {
      send(c, kJson, Obj().flag("ok", true).flag("stopped", stopApp(s, name)).done());
    } else if (!fs::exists(s.home + "/apps/" + name, ec)) {
      refuse(c, "no app named " + name + " on this device");
    } else {
      stopApp(s, name);
      fs::remove_all(s.home + "/apps/" + name, ec);
      fs::remove(s.home + "/logs/" + name + ".log", ec);
      fs::remove(s.home + "/logs/" + name + ".log.1", ec);
      send(c, kJson, Obj().flag("ok", true).done());
    }
  } else if (op == "unpair") {
    std::lock_guard<std::mutex> files(s.mu);
    std::vector<Client> all = loadClients(s.home);
    all.erase(std::remove_if(all.begin(), all.end(), [&](const Client& cl) { return cl.id == who; }), all.end());
    saveClients(s.home, all);
    send(c, kJson, Obj().flag("ok", true).done());
  } else {
    refuse(c, "this agent does not know '" + op + "' (zinc " + s.engine + ")");
  }
}

void serveConnection(State& s, int fd) {
  prepare(fd);
  std::string line;
  if (!recvLine(fd, line, 5000)) ::close(fd);
  else if (line == "ZNA1 pair") handlePair(s, fd);
  else if (line == "ZNA1 sess") handleSession(s, fd);
  else ::close(fd);
  --s.live;
}

int usage() {
  std::fprintf(stderr, "usage: zinc agent [--port n] [--bind address] [--name name] [--no-shell] [--no-mdns] [--allow-root]\n"
                       "       zinc agent pair            a new pairing code for one workstation\n"
                       "       zinc agent clients         the paired workstations\n"
                       "       zinc agent forget <client> forget a workstation (its name or id)\n");
  return 2;
}

}  // namespace

int serve(const std::vector<std::string>& args, const std::string& self, const std::string& engine) {
  State& s = *new State;   // never freed: the threads of the sessions still open at exit hold it
  s.home = zn::tc::home() + "/agent";
  s.self = self;
  s.engine = engine;
  std::error_code ec;
  fs::create_directories(s.home + "/apps", ec);
  ::chmod(s.home.c_str(), 0700);
  if (ec) { std::fprintf(stderr, "zinc agent: cannot use %s: %s\n", s.home.c_str(), ec.message().c_str()); return 1; }

  for (const auto& e : fs::directory_iterator(s.home + "/apps", ec))   // an install the last agent did not finish
    if (e.path().filename().string().rfind(".incoming-", 0) == 0 && (args.empty() || args[0][0] == '-')) fs::remove_all(e.path(), ec);

  if (!args.empty() && args[0] == "pair") {
    const std::string code = openPairing(s.home);
    if (code.empty()) { std::fprintf(stderr, "zinc agent: cannot write the pairing code under %s\n", s.home.c_str()); return 1; }
    std::printf("pairing code: %s\nvalid for 5 minutes and three tries, for one workstation: zinc device pair <this device>\n", code.c_str());
    return 0;
  }
  if (!args.empty() && args[0] == "clients") {
    for (const Client& c : loadClients(s.home)) std::printf("%s  %-24s %s\n", c.id.c_str(), c.name.c_str(), c.added.c_str());
    return 0;
  }
  if (!args.empty() && args[0] == "forget") {
    if (args.size() != 2) return usage();
    std::vector<Client> all = loadClients(s.home);
    const size_t before = all.size();
    all.erase(std::remove_if(all.begin(), all.end(), [&](const Client& c) { return c.id == args[1] || c.name == args[1]; }), all.end());
    if (all.size() == before) { std::fprintf(stderr, "zinc agent: no paired workstation named %s\n", args[1].c_str()); return 1; }
    return saveClients(s.home, all) ? 0 : 1;
  }

  std::string bind = "0.0.0.0", name;
  bool mdns = true, allowRoot = false;
  for (size_t i = 0; i < args.size(); ++i) {
    const std::string& a = args[i];
    const bool more = i + 1 < args.size();
    if (a == "--port" && more) s.port = std::atoi(args[++i].c_str());
    else if (a == "--bind" && more) bind = args[++i];
    else if (a == "--name" && more) name = cleanName(args[++i]);
    else if (a == "--no-shell") s.shell = false;
    else if (a == "--no-mdns") mdns = false;
    else if (a == "--allow-root") allowRoot = true;
    else return usage();
  }
  if (::geteuid() == 0 && !allowRoot) {
    std::fprintf(stderr, "zinc agent: not as root: every paired workstation would be root on this machine (--allow-root to insist)\n");
    return 2;
  }

  std::string text;
  if (readFile(s.home + "/agent.json", text)) { const Doc d(text); s.id = d.str("id"); s.name = d.str("name"); }
  if (s.id.size() != 16) s.id = hex(randomBytes(8));
  if (s.id.size() != 16) { std::fprintf(stderr, "zinc agent: this build has no TLS\n"); return 1; }
  if (!name.empty()) s.name = name;
  if (s.name.empty()) s.name = cleanName(hostName());
  writePrivate(s.home + "/agent.json", Obj().str("id", s.id).str("name", s.name).done() + "\n");
#ifdef __APPLE__
  s.os = "macos";
#else
  s.os = "linux";
#endif
  s.kind = machineKind();

  // ponytail: IPv4 only, like the discovery; an IPv6 listener when a network without IPv4 shows up
  const int lfd = ::socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<std::uint16_t>(s.port));
  int one = 1;
  ::setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  if (lfd < 0 || ::inet_pton(AF_INET, bind.c_str(), &addr.sin_addr) != 1 || ::bind(lfd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) != 0 || ::listen(lfd, 32) != 0) {
    std::fprintf(stderr, "zinc agent: cannot listen on %s:%d: %s\n", bind.c_str(), s.port, std::strerror(errno));
    return 1;
  }
  socklen_t alen = sizeof addr;
  ::getsockname(lfd, reinterpret_cast<sockaddr*>(&addr), &alen);
  s.port = ntohs(addr.sin_port);
  ::fcntl(lfd, F_SETFD, FD_CLOEXEC);

  ::signal(SIGPIPE, SIG_IGN);
  ::signal(SIGINT, onStop);
  ::signal(SIGTERM, onStop);
  say(s.name + " (" + s.id + ") listening on " + bind + ":" + std::to_string(s.port) + (s.shell ? "" : ", shell off"));
  if (loadClients(s.home).empty()) {
    const std::string open = pairingCode(s.home);
    const std::string code = open.empty() ? openPairing(s.home) : open;
    if (!code.empty()) say("no workstation is paired yet. pairing code: " + code + " (5 minutes, three tries)");
  }

  const std::function<Txt()> txt = [&s] { return Txt{{"id", s.id}, {"v", "1"}, {"os", s.os}, {"kind", s.kind}, {"pair", pairingCode(s.home).empty() ? "0" : "1"}}; };
  std::thread announcer;
  if (mdns) announcer = std::thread([&] { announce(s.name, s.port, bind, txt, gStop); });

  for (int tick = 0; !gStop; ++tick) {
    pollfd p{lfd, POLLIN, 0};
    if (::poll(&p, 1, 500) > 0) {
      const int fd = ::accept(lfd, nullptr, nullptr);
      if (fd >= 0 && s.live >= 64) ::close(fd);   // a scan of the port does not get a thread each
      else if (fd >= 0) { ++s.live; std::thread(serveConnection, std::ref(s), fd).detach(); }
    }
    if (tick % 4 == 3) boundLogs(s.home);   // every two seconds: a few stat calls
  }
  if (announcer.joinable()) announcer.join();
  ::close(lfd);
  say("stopped");
  return 0;
}

}  // namespace zn::agent
