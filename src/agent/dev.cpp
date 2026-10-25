// zinc dev --device (ZN-729.03): the loop of zinc dev (src/cli_core.cpp) with the program on a paired device, over one session of the agent.
// The workstation packs the project at each save (zinc pack: the program compiled here, its baked resources, its assets and packs), sends
// the members whose hash changed and asks for a start. The agent keeps them as files in a directory of the session, runs
// `zinc run program.zbc` there, as an unpacked .zapp runs, sends its output back, and writes the bytes of `I` frames to the program's dev
// socket (ZINC_DEV_FD: the asset reload messages of ZN-450, src/host/assets_host.h). The program ends with the session.
// The messages: docs/reports/zinc-next-agent.md.
#include "agent.h"

#include "../cli_core.h"
#include "../zapp.h"
#include "wire.h"
#include "zn/log.h"

#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <map>
#include <mutex>
#include <set>

namespace zn::agent {

namespace fs = std::filesystem;

namespace {

// ---- on the device ----

struct Program { pid_t pid = 0; int out = -1, dev = -1; };   // the version that runs: its output (a pipe), our end of its dev socket

// The programs of the dev sessions end with the agent: nothing else knows them (an app has its pid file, they have none).
struct Live { std::mutex mu; std::set<pid_t> pids; };
Live& live() { static Live* l = new Live; return *l; }   // never freed: the threads of the sessions outlive main
void endAll() {
  std::lock_guard<std::mutex> lock(live().mu);
  for (const pid_t pid : live().pids) ::kill(-pid, SIGTERM);
}
void track(pid_t pid, bool on) {
  static const int atExit = std::atexit(endAll);
  (void)atExit;
  std::lock_guard<std::mutex> lock(live().mu);
  if (on) live().pids.insert(pid); else live().pids.erase(pid);
}

void stop(Program& p, std::mutex& displayMu) {
  if (p.pid > 0) {
    ::kill(p.pid, SIGTERM);    // itself too: a program started a moment ago has no group yet
    ::kill(-p.pid, SIGTERM);
    int status = 0;
    for (int waited = 0;; waited += 5) {
      const pid_t r = ::waitpid(p.pid, &status, WNOHANG);
      if (r == p.pid || (r < 0 && errno != EINTR)) break;
      if (waited == 3000) ::kill(-p.pid, SIGKILL);
      ::usleep(5000);
    }
    track(p.pid, false);
    std::lock_guard<std::mutex> display(displayMu);
    releaseScreen(p.pid);
  }
  if (p.out >= 0) ::close(p.out);
  if (p.dev >= 0) ::close(p.dev);
  p = Program{};
}

// `zinc run program.zbc` in `dir`, in a session of its own: its output in a pipe, its dev socket as descriptor 3.
bool launch(Program& p, const std::string& self, const std::string& dir, const std::vector<std::string>& args, std::string& err, std::mutex& displayMu) {
  int out[2] = {-1, -1}, sv[2] = {-1, -1};
  const int null = ::open("/dev/null", O_RDONLY);
  if (null < 0 || ::pipe(out) != 0 || ::socketpair(AF_UNIX, SOCK_STREAM, 0, sv) != 0) {
    err = std::string("cannot start it: ") + std::strerror(errno);
    for (const int fd : {null, out[0], out[1]}) if (fd >= 0) ::close(fd);
    return false;
  }
  std::vector<std::string> argv = {self, "run", dir + "/program.zbc"};
  std::string project;
  if (!std::filesystem::exists(dir + "/program.zbc")) {   // a project on a JavaScript engine sends its sources (zinc pack): QuickJS unless its zinc.json names one
    const std::string engine = readFile(dir + "/zinc.json", project) ? Doc(project).str("engine") : std::string();
    argv = {self, "run", dir, "--engine", engine.empty() || engine == "zinc" ? "quickjs" : engine};
  }
  if (!args.empty()) argv.push_back("--");
  argv.insert(argv.end(), args.begin(), args.end());
  std::vector<std::string> env = environment({{"ZINC_DEV", "1"}, {"ZINC_DEV_FD", "3"}, {"ZINC_STEPS", "1"}});   // its steps too: building a plugin on a small board takes seconds that must not look like a hang
  const std::vector<char*> argvp = pointers(argv), envp = pointers(env);
  int gate[2];
  if (::pipe(gate) != 0) { err = "cannot create display gate"; for (const int fd : {null, out[0], out[1], sv[0], sv[1]}) ::close(fd); return false; }
  std::lock_guard<std::mutex> display(displayMu);
  const pid_t pid = ::fork();
  if (pid == 0) {
    ::setsid();
    ::close(gate[1]);
    if (!awaitScreen(gate[0])) ::_exit(125);
    ::dup2(null, 0);
    ::dup2(out[1], 1);
    ::dup2(out[1], 2);
    ::dup2(sv[1], 3);   // after the three above: whichever of ours had the number 3 is copied already
    execChild(dir.c_str(), argvp.data(), envp.data(), 4);
  }
  for (const int fd : {null, out[1], sv[1]}) ::close(fd);
  ::close(gate[0]);
  if (pid < 0) { ::close(gate[1]); err = std::string("cannot start it: ") + std::strerror(errno); ::close(out[0]); ::close(sv[0]); return false; }
  if (!handoffScreen(pid, gate[1], err)) { ::waitpid(pid, nullptr, 0); ::close(out[0]); ::close(sv[0]); return false; }
  const timeval wait{2, 0};   // as zinc dev does on this machine: a version that stopped reading costs a save 2 s
  const int room = 4 << 20;   // an atlas page in one write
  ::setsockopt(sv[0], SOL_SOCKET, SO_SNDTIMEO, &wait, sizeof wait);
  ::setsockopt(sv[0], SOL_SOCKET, SO_SNDBUF, &room, sizeof room);
  p = Program{pid, out[0], sv[0]};
  track(pid, true);
  return true;
}

bool feed(int fd, std::string_view bytes) {
  while (!bytes.empty()) {
    const ssize_t n = ::write(fd, bytes.data(), bytes.size());
    if (n < 0 && errno == EINTR) continue;
    if (n <= 0) return false;
    bytes.remove_prefix(static_cast<std::size_t>(n));
  }
  return true;
}

// A start: the version that runs is stopped first (its packs are mapped: its files cannot change under it), then the files change, then
// the new version starts. False once the workstation is gone.
bool restart(Chan& c, Program& p, const Val& m, const std::string& dir, const std::string& self, std::mutex& displayMu) {
  stop(p, displayMu);
  std::error_code ec;
  for (const std::string& name : m.strs("remove")) if (safeRel(name)) fs::remove(dir + "/" + name, ec);
  std::uint64_t files = 0, bytes = 0;
  std::string err;
  if (m.flag("files") && !recvTree(c, dir, files, bytes, err)) return refuse(c, err);
  if (!launch(p, self, dir, m.strs("args"), err, displayMu)) return refuse(c, err);
  return send(c, kJson, Obj().flag("ok", true).num("pid", p.pid).num("files", static_cast<long long>(files)).num("bytes", static_cast<long long>(bytes)).done());
}

}  // namespace

void opDev(Chan& c, const Val& req, const std::string& home, const std::string& self, const std::string& engine, std::mutex& displayMu) {
  // the program is compiled on the workstation, which decides whether its bytecode runs here (devRemote: one series, or --force) and then
  // sends this engine's version; a workstation before that sends its own
  if (req.str("engine") != engine) {
    refuse(c, "this device runs zinc " + engine + " and the workstation zinc " + req.str("engine") + ": update zinc on the workstation, or the device's (zinc device update)");
    return;
  }
  static std::atomic<int> sessions{0};
  std::error_code ec;
  const std::string mine = std::to_string(::getpid()) + "-", dir = home + "/dev/" + mine + std::to_string(++sessions);
  for (const auto& e : fs::directory_iterator(home + "/dev", ec))   // what an agent before this one left
    if (e.path().filename().string().rfind(mine, 0) != 0) fs::remove_all(e.path(), ec);
  fs::remove_all(dir, ec);
  fs::create_directories(dir, ec);
  if (ec || !send(c, kJson, Obj().flag("ok", true).done())) { fs::remove_all(dir, ec); return; }
  // ponytail: one thread relays both ways with blocking sends; a program that prints megabytes while megabytes of assets arrive could
  // stall the session against the workstation's own send. Give the output its own thread if that ever shows.
  Program p;
  long ownerPid = 0;
  for (bool open = true; open;) {
    const char* display = std::getenv("ZINC_AGENT_SCREEN");
    std::string owner;
    if (display && *display && ownerPid > 0 && readFile(std::string(display) + "/device-screen", owner) && std::atol(owner.c_str()) != ownerPid) {
      send(c, kErr, "zinc dev: another app replaced this display session\n");
      break;
    }
    char type = 0;
    std::string payload;
    bool bad = false;
    while (open && next(c, type, payload, &bad)) {
      if (type == kIn) {
        if (p.dev >= 0 && !feed(p.dev, payload)) { ::close(p.dev); p.dev = -1; }   // it stopped reading: its next start brings the files
      } else if (type == kJson) {
        const Doc m(payload);
        if (m.flag("start")) { open = restart(c, p, m, dir, self, displayMu); if (open) ownerPid = p.pid; }
      }
    }
    if (bad || !open) break;
    pollfd fds[2] = {{c.fd, POLLIN, 0}, {p.out, POLLIN, 0}};
    const int n = ::poll(fds, 2, p.pid > 0 && p.out < 0 ? 20 : 500);
    if (n < 0 && errno != EINTR) break;
    if (n > 0 && fds[1].revents) {
      char buf[kChunk];
      const ssize_t got = ::read(p.out, buf, sizeof buf);
      if (got > 0) open = send(c, kOut, std::string_view(buf, static_cast<std::size_t>(got)));
      else if (got == 0 || errno != EINTR) { ::close(p.out); p.out = -1; }   // it closed its output: it is ending
    }
    int status = 0;
    if (p.pid > 0 && p.out < 0 && ::waitpid(p.pid, &status, WNOHANG) == p.pid) {   // ended by itself, all of its output sent
      track(p.pid, false);
      { std::lock_guard<std::mutex> display(displayMu); releaseScreen(p.pid); }
      p.pid = 0;
      stop(p, displayMu);
      open = open && send(c, kExit, std::to_string(exitCode(status)));
    }
    if (n > 0 && fds[0].revents && !fill(c)) open = false;   // the workstation left
  }
  stop(p, displayMu);
  fs::remove_all(dir, ec);
}

// ---- on the workstation ----

namespace {

// zinc pack of the project in `dir` into the file `zapp`; `out` gets what it printed (the diagnostics of a program that does not compile).
bool pack(const std::string& self, const std::string& dir, const std::string& zapp, std::string& out, const std::string& profile) {
  const std::string log = zapp + ".log";
  const pid_t pid = ::fork();
  if (pid == 0) {
    const int fd = ::open(log.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0600);
    ::dup2(fd, 1);
    ::dup2(fd, 2);
    ::setenv("ZINC_STEPS", "0", 1);   // no progress lines: what it prints is the diagnostics
    if (!profile.empty()) ::execl(self.c_str(), self.c_str(), "pack", dir.c_str(), "-o", zapp.c_str(), "--profile", profile.c_str(), static_cast<char*>(nullptr));   // a console's player (ZN-792)
    ::execl(self.c_str(), self.c_str(), "pack", dir.c_str(), "-o", zapp.c_str(), static_cast<char*>(nullptr));
    ::_exit(127);
  }
  int status = 0;
  while (pid > 0 && ::waitpid(pid, &status, 0) < 0 && errno == EINTR) {}
  out.clear();
  readFile(log, out);
  return pid > 0 && WIFEXITED(status) && WEXITSTATUS(status) == 0;
}

struct Session {
  std::unique_ptr<Chan> c;
  std::string self, engine, device, tmp, profile;   // profile: a player's (zinc pack --profile)
  std::map<std::string, std::string> there;   // what the device holds: member -> SHA-256
  bool running = false;

  ~Session() { std::error_code ec; if (!tmp.empty()) fs::remove_all(tmp, ec); }

  void show(char type, const std::string& payload) {
    if (type == kOut || type == kErr) writeAll(type == kOut ? STDOUT_FILENO : STDERR_FILENO, payload.data(), payload.size());
    else if (type == kExit) { running = false; std::fprintf(stderr, "zinc dev: program exited (%s) on %s, waiting for changes...\n", payload.c_str(), device.c_str()); }
  }

  bool poll() {
    pollfd p{c->fd, POLLIN, 0};
    const bool open = ::poll(&p, 1, 0) <= 0 || fill(*c);
    char type = 0;
    std::string payload;
    while (next(*c, type, payload)) show(type, payload);
    return open;
  }

  bool assets(const std::string& messages) {
    if (!running) return false;
    for (std::size_t at = 0; at < messages.size(); at += kChunk)
      if (!send(*c, kIn, std::string_view(messages).substr(at, kChunk))) return false;
    return true;
  }

  bool start(const std::string& dir, const std::vector<std::string>& args, bool over, std::string& out) {
    // ponytail: the archive is written, read back, and its changed members written again for sendTree: three copies of a small project.
    // Pack straight into members when a save of a large app feels it.
    const std::string zapp = tmp + "/app.zapp", stage = tmp + "/stage";
    std::string archive, err;
    std::map<std::string, std::string> files, now;
    if (there.empty()) zn::log::step("pack", dir);   // the first time: compiling a large app takes a moment
    if (!pack(self, dir, zapp, out, profile)) return false;
    if (!readFile(zapp, archive) || !zn::zapp::unpack(archive, engine, files, err)) { out = "the packed project cannot be read: " + err; return false; }
    for (const auto& [name, sha] : Doc(files["manifest.json"]).pairs("files"))
      if (name.rfind("native/", 0) != 0) now[name] = sha;   // The device loads its own plugins; these libraries are for the workstation's architecture.
    std::error_code ec;
    fs::remove_all(stage, ec);
    fs::create_directories(stage, ec);
    std::vector<std::string> gone, argv;
    bool changed = false;
    for (const auto& [name, sha] : now) {
      if (const auto it = there.find(name); it != there.end() && it->second == sha) continue;
      const fs::path to = fs::path(stage) / name;
      fs::create_directories(to.parent_path(), ec);
      if (!writePrivate(to.string(), files[name])) { out = "cannot write " + to.string(); return false; }
      changed = true;
    }
    for (const auto& [name, sha] : there) if (!over && !now.count(name)) gone.push_back(jsonText(name));
    for (const std::string& a : args) argv.push_back(jsonText(a));
    const std::string lost = "the session with " + device + " ended";
    if (!send(*c, kJson, Obj().flag("start", true).flag("files", changed).raw("remove", array(gone)).raw("args", array(argv)).done())) { out = lost; return false; }
    std::uint64_t sentFiles = 0, sentBytes = 0;
    if (changed) sendTree(*c, stage, sentFiles, sentBytes, err, progress(stage));   // a failure here is told to the device, whose refusal is the answer read below
    char type = 0;
    std::string payload;
    running = false;
    for (;;) {
      if (!recv(*c, type, payload, 60000)) { out = lost; return false; }
      if (type == kJson) break;
      show(type, payload);   // the last lines of the version that was running
    }
    const Doc a(payload);
    if (!a.flag("ok")) { there.clear(); out = a.str("error"); return false; }   // what the device holds is not known any more: all of it next time
    if (over) for (const auto& [name, sha] : now) there[name] = sha; else there = now;
    running = true;
    if (sentFiles) std::fprintf(stderr, "zinc dev: %llu file(s), %llu bytes sent to %s\n", static_cast<unsigned long long>(sentFiles), static_cast<unsigned long long>(sentBytes), device.c_str());
    return true;
  }
};

}  // namespace

// "0.6" of "0.6.2+52.g6feb1df0": the series whose engines run one another's bytecode.
static std::string series(const std::string& v) { return v.substr(0, v.find('.', v.find('.') + 1)); }

bool devRemote(std::vector<std::string>& args, const std::string& self, const std::string& engine, bool force, zn::cli::DevRemote& remote) {
  std::string device;
  for (std::size_t i = 0; i < args.size() && args[i] != "--"; ++i) {
    if (args[i] != "--device") continue;
    if (i + 1 >= args.size()) { std::fprintf(stderr, "zinc dev: --device takes the name of a paired device (zinc device list)\n"); return false; }
    device = args[i + 1];
    args.erase(args.begin() + static_cast<std::ptrdiff_t>(i), args.begin() + static_cast<std::ptrdiff_t>(i) + 2);
    break;
  }
  if (device.empty()) return true;
  ::signal(SIGPIPE, SIG_IGN);
  const auto s = std::make_shared<Session>();
  std::string answer, tmp = (fs::temp_directory_path() / "zinc-dev-XXXXXX").string();
  // The program compiled here runs on an engine of the same series (0.6.x): a newer patch reads the same bytecode, and a format that
  // changed is refused by the device's loader with its reason. Another series runs with --force only, at the risk of a crash.
  if (!deviceSession(device, Obj().str("op", "info").done(), answer, s->device)) return false;
  const std::string there = Doc(answer).str("engine");
  if (Doc(answer).flag("player")) s->profile = Doc(answer).str("profile");
  if (there != engine) {
    if (!force && series(there) != series(engine)) {
      const std::string update = "zinc device " + s->device + " update", retry = "zinc dev --device " + s->device + " --force";
      const int w = static_cast<int>(std::max(update.size(), retry.size()));
      std::fprintf(stderr, "zinc dev: %s runs zinc %s and this computer zinc %s: a program compiled here may not run there.\n"
                           "  %-*s  puts this computer's zinc on the device\n  %-*s  tries anyway (the program may crash)\n",
                   s->device.c_str(), there.c_str(), engine.c_str(), w, update.c_str(), w, retry.c_str());
      return false;
    }
    std::fprintf(stderr, "zinc dev: %s runs zinc %s and this computer zinc %s: %s (zinc device %s update aligns them)\n", s->device.c_str(),
                 there.c_str(), engine.c_str(), force && series(there) != series(engine) ? "trying anyway (--force)" : "one series, running anyway",
                 s->device.c_str());
  }
  s->c = deviceSession(device, Obj().str("op", "dev").str("engine", there).done(), answer, s->device);
  if (!s->c) return false;
  if (!::mkdtemp(tmp.data())) { std::fprintf(stderr, "zinc dev: cannot make %s: %s\n", tmp.c_str(), std::strerror(errno)); return false; }
  s->self = self;
  s->engine = engine;
  s->tmp = tmp;
  remote.start = [s](const std::string& dir, const std::vector<std::string>& a, bool over, std::string& out) { return s->start(dir, a, over, out); };
  remote.assets = [s](const std::string& messages) { return s->assets(messages); };
  remote.poll = [s] { return s->poll(); };
  return true;
}

}  // namespace zn::agent
