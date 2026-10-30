// `zinc device`: the workstation's side of the agent. The paired devices and their keys are in <ZINC_HOME>/devices.json (mode 0600). Every
// command is one session; a forwarded port opens one session per connection it takes.
#include "agent.h"

#include "../tc/tc.h"
#include "../frontend/project.h"
#include "../zapp.h"
#include "wire.h"
#include "yyjson.h"
#include "zn/log.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <signal.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/utsname.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <fcntl.h>
#include <map>
#include <sstream>
#include <thread>

namespace zn::agent {

namespace fs = std::filesystem;

namespace {

int fail(const std::string& why) { std::fprintf(stderr, "zinc device: %s\n", why.c_str()); return 1; }

std::string storePath() { return zn::tc::home() + "/devices.json"; }

std::vector<Device> loadDevices() {
  std::vector<Device> out;
  std::string text;
  if (!readFile(storePath(), text)) return out;
  const Doc d(text);
  for (const Val& v : d.items("devices")) out.push_back({v.str("id"), v.str("name"), v.str("client"), unhex(v.str("key")), v.str("host"), static_cast<int>(v.num("port"))});
  return out;
}

bool saveDevices(const std::vector<Device>& devices) {
  std::vector<std::string> items;
  for (const Device& d : devices) items.push_back(Obj().str("id", d.id).str("name", d.name).str("client", d.client).str("key", hex(d.key)).str("host", d.host).num("port", d.port).done());
  std::error_code ec;
  fs::create_directories(zn::tc::home(), ec);
  return writePrivate(storePath(), Obj().raw("devices", array(items)).done() + "\n");
}

// A device named by its name, the start of its id, or its address (host or host:port).
bool isNamed(const Device& d, const std::string& n) {
  return d.name == n || (n.size() >= 4 && d.id.rfind(n, 0) == 0) || (!d.host.empty() && (d.host == n || d.host + ":" + std::to_string(d.port) == n));
}

void remember(const Device& d) {
  std::vector<Device> all = loadDevices();
  // a reflashed device comes back with a new id under its old name or address: the old pairing is dead, and kept it would be picked first
  all.erase(std::remove_if(all.begin(), all.end(), [&](const Device& o) { return o.id == d.id || o.name == d.name || (o.host == d.host && o.port == d.port); }), all.end());
  all.push_back(d);
  saveDevices(all);
}

// A session with a paired device: at its last address, else where the network says it is now (the key proves it is the same device).
std::unique_ptr<Chan> openSession(Device& d, std::string& err, bool mayLook = true) {
  const auto at = [&](const std::string& host, int port) -> std::unique_ptr<Chan> {
    const int fd = dial(host, port, 1500, err);
    if (fd < 0) return nullptr;
    auto c = std::make_unique<Chan>();
    c->fd = fd;
    std::string line;
    if (!sendLine(fd, "ZNA1 sess") || !recvLine(fd, line, 5000) || line != "ZNA1 ok") { err = "what answers at " + host + ":" + std::to_string(port) + " is not a zinc agent"; return nullptr; }
    if (!openPskClient(*c, d.client, d.key, err)) return nullptr;
    std::string why;
    if (!handshake(*c, 10000, why)) { err = d.name + " does not accept this workstation's key (" + why + "): pair again with zinc device pair " + d.name; return nullptr; }
    return c;
  };
  if (!d.host.empty()) if (auto c = at(d.host, d.port)) return c;
  if (!mayLook) return nullptr;
  const std::string first = err;   // what its known address said is the answer worth giving
  for (const Found& f : browse(1200, [&](const Found& f) { return f.id == d.id && (f.host != d.host || f.port != d.port); })) {
    if (f.id != d.id || (f.host == d.host && f.port == d.port)) continue;
    if (auto c = at(f.host, f.port)) { d.host = f.host; d.port = f.port; remember(d); return c; }
  }
  err = first.empty() ? d.name + " is not seen on the network" : first;
  return nullptr;
}

// A session with `req` sent and the device's answer read into `answer`; null, with the reason said, when the device refuses.
std::unique_ptr<Chan> request(Device& d, const std::string& req, std::string& answer, bool mayLook = true, int timeoutMs = 30000) {
  std::string err;
  std::unique_ptr<Chan> c = openSession(d, err, mayLook);
  char type = 0;
  if (!c) { fail(err); return nullptr; }
  if (!send(*c, kJson, req) || !recv(*c, type, answer, timeoutMs) || type != kJson) { fail("the session with " + d.name + " ended early"); return nullptr; }
  const Doc a(answer);
  if (!a.flag("ok")) { fail(a.str("error").empty() ? "the device refused" : a.str("error")); return nullptr; }
  return c;
}

std::string human(long long bytes) {
  char b[32];
  if (bytes >= 1ll << 30) std::snprintf(b, sizeof b, "%.1f GiB", static_cast<double>(bytes) / static_cast<double>(1ll << 30));
  else if (bytes >= 1 << 20) std::snprintf(b, sizeof b, "%.0f MiB", static_cast<double>(bytes) / static_cast<double>(1 << 20));
  else if (bytes >= 1 << 10) std::snprintf(b, sizeof b, "%.0f KiB", static_cast<double>(bytes) / 1024.0);
  else std::snprintf(b, sizeof b, "%lld bytes", bytes);
  return b;
}

}  // namespace

// The progress of a transfer, as step lines where the build's go ("  send       45%  16 MiB of 35 MiB  2.1 MiB/s"): rewritten in place in a
// terminal, a line every half second elsewhere (a pipe is not flooded; Atelier shows the last one), then the whole with its duration.
// ZINC_PROGRESS_MS sets the pause between two lines. Quiet under -q, as every step.
Sent progress(const std::string& path) {
  std::error_code ec;
  std::uint64_t total = 0;   // what sendTree sends: the file, or the regular files of the tree
  if (fs::is_regular_file(path, ec)) total = fs::file_size(path, ec);
  else for (auto it = fs::recursive_directory_iterator(path, fs::directory_options::skip_permission_denied, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec))
    if (!it->is_symlink(ec) && it->is_regular_file(ec)) total += it->file_size(ec);
  const bool tty = ::isatty(STDERR_FILENO);
  const char* e = std::getenv("ZINC_PROGRESS_MS");
  const double every = e ? std::atof(e) : tty ? 200 : 500;
  return [total, tty, every, t0 = std::chrono::steady_clock::now(), last = 0.0](std::uint64_t sent) mutable {
    const double ms = zn::log::since(t0);
    const bool end = sent >= total;
    if (!zn::log::steps() || (!end && ms - last < every)) return;
    last = ms;
    char b[96];
    std::snprintf(b, sizeof b, "%d%%  %s of %s  %.1f MiB/s", static_cast<int>(sent * 100 / total), human(static_cast<long long>(sent)).c_str(), human(static_cast<long long>(total)).c_str(),
                  static_cast<double>(sent) / std::max(ms, 1.0) * 1000.0 / (1 << 20));
    if (tty) std::fputs("\r\033[2K", stderr);
    if (tty && !end) { std::fprintf(stderr, "  %-10s %s", "send", b); std::fflush(stderr); }
    else zn::log::step("send", b, end ? ms : -1);
  };
}

namespace {

std::string baseName(const std::string& path) {
  std::error_code ec;
  const fs::path p = fs::weakly_canonical(path, ec);
  return (ec ? fs::path(path) : p).filename().string();
}

// ---- list, pair, unpair ----

int cmdList(const std::vector<std::string>& args) {
  bool json = false;
  int wait = 1000;
  for (size_t i = 0; i < args.size(); ++i) {
    if (args[i] == "--json") json = true;
    else if (args[i] == "--wait" && i + 1 < args.size()) wait = std::atoi(args[++i].c_str());
    else return fail("usage: zinc device list [--json] [--wait ms]");
  }
  const std::vector<Device> paired = loadDevices();
  const std::vector<Found> found = browse(wait);
  struct Row { std::string name, address, state, kind, id; };
  std::vector<Row> rows;
  for (const Found& f : found) {
    bool known = false, listed = false;
    for (const Device& d : paired) known = known || d.id == f.id;
    for (const Row& r : rows) listed = listed || (!f.id.empty() && r.id == f.id);   // one line for a device that answers on two networks
    if (!listed) rows.push_back({f.name, f.host + ":" + std::to_string(f.port), known ? "paired" : f.pairing ? "pairing open" : "not paired", f.kind, f.id});
  }
  for (const Device& d : paired) {
    bool seen = false;
    for (const Found& f : found) seen = seen || f.id == d.id;
    if (!seen) rows.push_back({d.name, d.host + ":" + std::to_string(d.port), "paired, not seen", "", d.id});
  }
  if (json) {
    std::vector<std::string> items;
    for (const Row& r : rows) items.push_back(Obj().str("name", r.name).str("address", r.address).str("state", r.state).str("kind", r.kind).str("id", r.id).done());
    std::printf("%s\n", array(items).c_str());
    return 0;
  }
  if (rows.empty()) { std::printf("no device found: start `zinc agent` on one (same network), or pair by address: zinc device pair <host[:port]>\n"); return 0; }
  for (const Row& r : rows) std::printf("%-20s %-22s %-17s %s\n", r.name.c_str(), r.address.c_str(), r.state.c_str(), r.kind.c_str());
  return 0;
}

int cmdPair(const std::vector<std::string>& args) {
  if (args.empty() || args.size() > 2) return fail("usage: zinc device pair <name|host[:port]> [code]");
  std::string host = args[0], err, line;
  int port = kPort;
  Chan c;
  const bool address = args[0].find_first_of(".:") != std::string::npos;   // a device's name has neither
  for (const Found& f : address ? std::vector<Found>{} : browse(1200, [&](const Found& f) { return f.name == args[0]; })) {   // by its name: the first of its addresses that answers
    if (f.name != args[0] || c.fd >= 0) continue;
    c.fd = dial(f.host, f.port, 1500, err);
    if (c.fd >= 0) { host = f.host; port = f.port; }
  }
  if (c.fd < 0 && !address) host += ".local";   // not seen by discovery (an agent that came up before the network): its name on the network
  const size_t colon = host.rfind(':');
  if (c.fd < 0 && colon != std::string::npos) { port = std::atoi(host.c_str() + colon + 1); host.resize(colon); }
  std::string code = args.size() == 2 ? args[1] : std::string();
  if (code.empty()) {
    std::fprintf(stderr, "pairing code shown by the device: ");
    std::getline(std::cin, code);
  }
  code.erase(std::remove_if(code.begin(), code.end(), [](char ch) { return ch < '0' || ch > '9'; }), code.end());
  if (code.empty()) return fail("no code");
  if (c.fd < 0) c.fd = dial(host, port, 3000, err);
  if (c.fd < 0) return fail(err);
  if (!sendLine(c.fd, "ZNA1 pair") || !recvLine(c.fd, line, 5000)) return fail("what answers at " + host + ":" + std::to_string(port) + " is not a zinc agent");
  if (line != "ZNA1 ok") return fail("pairing is closed on the device: run `zinc agent pair` there for a new code");
  if (!openPake(c, false, code, err)) return fail(err);
  // 60 s: an Old 3DS at 268 MHz takes seconds over each step of EC J-PAKE; the cause is named, a slow device is not a wrong code
  if (!handshake(c, 60000, err)) return fail("pairing failed: " + err + " (a wrong code closes the pairing after three tries)");
  char type = 0;
  std::string answer;
  if (!send(c, kJson, Obj().str("name", hostName()).done()) || !recv(c, type, answer, 15000) || type != kJson) return fail("the device ended the pairing");
  const Doc a(answer);
  if (!a.flag("ok")) return fail(a.str("error"));
  const Device d{a.str("id"), a.str("name"), a.str("client"), unhex(a.str("key")), host, port};
  if (d.id.empty() || d.key.size() != 32) return fail("the device sent no key");
  remember(d);
  std::printf("paired with %s (%s:%d)\n", d.name.c_str(), host.c_str(), port);
  return 0;
}

// ---- one device ----

int cmdInfo(Device& d, const std::vector<std::string>& args) {
  std::string answer;
  if (!request(d, Obj().str("op", "info").done(), answer)) return 1;
  if (!args.empty() && args[0] == "--json") { std::printf("%s\n", answer.c_str()); return 0; }
  const Doc a(answer);
  std::printf("%s (%s)\n", a.str("name").c_str(), a.str("id").c_str());
  if (!a.str("kind").empty()) std::printf("  kind         %s\n", a.str("kind").c_str());
  if (a.flag("player")) {   // a console's player (ZN-792): no shell, no files, the bytecode of zinc pack --profile
    std::string plugins, apps;
    for (const std::string& m : a.strs("plugins")) plugins += (plugins.empty() ? "" : ", ") + m;
    for (const Val& app : a.items("apps")) apps += (apps.empty() ? "" : ", ") + app.str("name") + (app.flag("running") ? " (running)" : "");
    std::printf("  player       %s, at %s\n  plugins      %s\n  engine       zinc %s\n  apps         %s\n", a.str("profile").empty() ? a.str("os").c_str() : a.str("profile").c_str(),
                a.str("address").c_str(), plugins.empty() ? "none" : plugins.c_str(), a.str("engine").c_str(), apps.empty() ? "none" : apps.c_str());
    if (a.has("memFree")) std::printf("  memory       %s free\n", human(a.num("memFree")).c_str());
    return 0;
  }
  std::printf("  system       %s %s %s\n", a.str("os").c_str(), a.str("osVersion").c_str(), a.str("arch").c_str());
  std::printf("  cpu          %s%s%lld cores", a.str("cpu").c_str(), a.str("cpu").empty() ? "" : ", ", a.num("cores"));
  if (a.has("mhz")) std::printf(", %lld MHz", a.num("mhz"));
  std::printf("\n  memory       %s free of %s\n", human(a.num("memFree")).c_str(), human(a.num("memTotal")).c_str());
  std::printf("  load         %.2f %.2f %.2f\n", a.real("load1"), a.real("load5"), a.real("load15"));
  if (a.has("tempC")) std::printf("  temperature  %.1f C\n", a.real("tempC"));
  std::printf("  disk         %s free of %s\n", human(a.num("diskFree")).c_str(), human(a.num("diskTotal")).c_str());
  const long long up = a.num("uptime");
  std::printf("  uptime       %lld d %lld h %lld min\n", up / 86400, up % 86400 / 3600, up % 3600 / 60);
  std::printf("  engine       zinc %s\n  shell        %s, as %s\n", a.str("engine").c_str(), a.flag("shell") ? "on" : "off", a.str("user").c_str());
  std::string apps;
  for (const Val& app : a.items("apps")) apps += (apps.empty() ? "" : ", ") + app.str("name") + (app.flag("running") ? " (running, pid " + std::to_string(app.num("pid")) + ")" : "");
  std::printf("  apps         %s\n", apps.empty() ? "none" : apps.c_str());
  return 0;
}

volatile std::sig_atomic_t gResized = 0;   // SIGWINCH has nowhere else to write
void onResize(int) { gResized = 1; }

std::string windowSize() {
  struct winsize ws{};
  if (::ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws) != 0 || ws.ws_row == 0) return "24 80";
  return std::to_string(ws.ws_row) + " " + std::to_string(ws.ws_col);
}

int cmdShell(Device& d, std::vector<std::string> args) {
  bool tty = false;
  if (!args.empty() && args[0] == "-t") { tty = true; args.erase(args.begin()); }
  std::string cmd;
  for (const std::string& a : args) cmd += (cmd.empty() ? "" : " ") + a;
  const bool terminal = ::isatty(STDIN_FILENO) && ::isatty(STDOUT_FILENO);
  tty = tty || (cmd.empty() && terminal);
  int rows = 24, cols = 80;
  std::sscanf(windowSize().c_str(), "%d %d", &rows, &cols);
  const char* term = std::getenv("TERM");
  std::string answer;
  std::unique_ptr<Chan> c = request(d, Obj().str("op", "shell").str("cmd", cmd).flag("tty", tty).num("rows", rows).num("cols", cols).str("term", term ? term : "").done(), answer);
  if (!c) return 1;
  struct termios saved{};
  const bool raw = tty && terminal && ::tcgetattr(STDIN_FILENO, &saved) == 0;
  if (raw) {   // every key goes to the device's terminal, Ctrl-C included
    struct termios t = saved;
    ::cfmakeraw(&t);
    ::tcsetattr(STDIN_FILENO, TCSANOW, &t);
    ::signal(SIGWINCH, onResize);
  }
  int code = 255;
  bool done = false, input = true, open = true;
  char buf[kChunk];
  for (;;) {
    char type;
    std::string payload;
    while (next(*c, type, payload)) {   // first what is already here
      if (type == kOut) writeAll(STDOUT_FILENO, payload.data(), payload.size());
      else if (type == kErr) writeAll(STDERR_FILENO, payload.data(), payload.size());
      else if (type == kExit) { code = std::atoi(payload.c_str()); done = true; }
    }
    if (done || !open) break;
    if (gResized) { gResized = 0; send(*c, kWin, windowSize()); }
    pollfd p[2] = {{c->fd, POLLIN, 0}, {input ? STDIN_FILENO : -1, POLLIN, 0}};
    if (::poll(p, 2, -1) < 0) { if (errno == EINTR) continue; break; }
    if (p[1].revents) {
      const ssize_t n = ::read(STDIN_FILENO, buf, sizeof buf);
      if (n > 0) { if (!send(*c, kIn, std::string_view(buf, static_cast<size_t>(n)))) break; }
      else if (n == 0 || errno != EINTR) { input = false; send(*c, kEof, {}); }
    }
    if (p[0].revents) open = fill(*c);
  }
  if (raw) ::tcsetattr(STDIN_FILENO, TCSANOW, &saved);
  if (!done) fail("the session with " + d.name + " was lost");
  return code;
}

int cmdPush(Device& d, const std::vector<std::string>& args, bool quiet = false) {
  if (args.empty() || args.size() > 2) return fail("usage: zinc device [<device>] push <local> [remote]   (remote: from the home directory of the device)");
  std::error_code ec;
  if (!fs::exists(args[0], ec)) return fail(args[0] + ": no such file or directory");
  std::string answer, err;
  std::unique_ptr<Chan> c = request(d, Obj().str("op", "push").str("path", args.size() == 2 ? args[1] : "").str("base", baseName(args[0])).done(), answer);
  if (!c) return 1;
  std::uint64_t files = 0, bytes = 0;
  char type = 0;
  if (!sendTree(*c, args[0], files, bytes, err, quiet ? Sent{} : progress(args[0]))) return fail(err);
  if (!recv(*c, type, answer, 60000) || type != kJson) return fail("the session with " + d.name + " ended early");
  const Doc a(answer);
  if (!a.flag("ok")) return fail(a.str("error"));
  if (!quiet) std::printf("%lld file%s, %s -> %s:%s\n", a.num("files"), a.num("files") == 1 ? "" : "s", human(a.num("bytes")).c_str(), d.name.c_str(), a.str("root").c_str());
  return 0;
}

int cmdPull(Device& d, const std::vector<std::string>& args);

// The frame the device's screen shows (the player, an app, a zinc dev program): the agent asks it of the program, then it comes as a pull.
int cmdScreen(Device& d, const std::vector<std::string>& args) {
  if (args.size() == 1 && args[0] == "--live") return cmdLive(d);
  if (args.size() > 1) return fail("usage: zinc device [<device>] screen [file.png | --live]");
  std::string answer;
  std::unique_ptr<Chan> c = request(d, Obj().str("op", "screen").done(), answer, true, 15000);
  if (!c) return 1;
  const std::string file = args.empty() ? "screen.png" : args[0];
  if (Doc(answer).str("format") == "png") {   // a player (ZN-792) sends the frame itself
    std::string png, payload;
    char type = 0;
    while (recv(*c, type, payload, 30000) && type == kOut) png += payload;
    if (type != kExit || !writePrivate(file, png)) return fail("the frame from " + d.name + " did not arrive whole");
    std::printf("%s (%s)\n", file.c_str(), human(static_cast<long long>(png.size())).c_str());
    return 0;
  }
  c.reset();
  return cmdPull(d, {Doc(answer).str("path"), file});
}

int cmdPull(Device& d, const std::vector<std::string>& args) {
  if (args.empty() || args.size() > 2) return fail("usage: zinc device [<device>] pull <remote> [local]");
  std::string answer, err;
  std::unique_ptr<Chan> c = request(d, Obj().str("op", "pull").str("path", args[0]).done(), answer);
  if (!c) return 1;
  const Doc a(answer);
  const std::string local = args.size() == 2 ? args[1] : ".";
  std::error_code ec;
  const std::string root = fs::is_directory(local, ec) ? local + "/" + a.str("base") : local;
  if (a.str("base").find('/') != std::string::npos || !safeRel(a.str("base"))) return fail("the device sent a bad name");
  std::uint64_t files = 0, bytes = 0;
  if (!recvTree(*c, root, files, bytes, err)) return fail(err);
  std::printf("%llu file%s, %s -> %s\n", static_cast<unsigned long long>(files), files == 1 ? "" : "s", human(static_cast<long long>(bytes)).c_str(), root.c_str());
  return 0;
}

// zinc device <d> update --local [package.tar.gz] | --local --remove (ZN-818): this tree's engine on the device without a release. The
// package is the one tools/build-linux makes for the device's architecture (built here when none is given), sent and unpacked there; the
// device's agent then runs on it, and so do the apps it starts. The paired channel is the trust: a local build has no release signature.
int updateLocal(Device& d, const std::vector<std::string>& args, const std::string& self) {
  std::string package, answer, err;
  bool remove = false;
  for (const std::string& a : args) { if (a == "--remove") remove = true; else if (a != "--local") package = a; }
  if (remove) {
    if (!request(d, Obj().str("op", "engine").flag("remove", true).done(), answer)) return 1;
    std::printf("%s\n", Doc(answer).str("text").c_str());
    return 0;
  }
  if (!request(d, Obj().str("op", "info").done(), answer)) return 1;
  const Doc info(answer);
  if (info.flag("player")) return fail(d.name + " is a player: its engine is its core (tools/build-console-core), not a package");
  if (info.str("os") != "linux") return fail("update --local puts a Linux package on the device; " + d.name + " runs " + info.str("os") + " (zinc update there, or install.sh)");
  const std::string m = info.str("arch");
  const std::string arch = m == "aarch64" || m == "arm64" ? "aarch64" : m.rfind("armv", 0) == 0 ? "armhf" : m == "x86_64" || m == "amd64" ? "x86_64" : m;
  if (package.empty()) {
    const fs::path root = fs::path(self).parent_path().parent_path();
    std::error_code ec;
    if (!fs::exists(root / "tools/build-linux", ec))
      return fail("update --local builds the package with tools/build-linux of zinc's sources, and this zinc is not a source build: give the package (zinc device " + d.name + " update --local zinc-<version>-linux-" + arch + ".tar.gz)");
    std::fprintf(stderr, "building zinc for %s (%s) with tools/build-linux: the first time takes minutes, then only what changed\n", d.name.c_str(), arch.c_str());
    const std::string cmd = "'" + (root / "tools/build-linux").string() + "' --arch " + arch;
    if (std::system(cmd.c_str()) != 0) return fail("tools/build-linux --arch " + arch + " failed");
    fs::file_time_type newest{};
    for (const auto& e : fs::directory_iterator(root / ("dist/linux-" + arch), ec)) {
      const std::string n = e.path().filename().string();
      if (n.rfind("zinc-", 0) == 0 && n.size() > 7 && n.compare(n.size() - 7, 7, ".tar.gz") == 0 && e.last_write_time(ec) > newest) { newest = e.last_write_time(ec); package = e.path().string(); }
    }
    if (package.empty()) return fail("tools/build-linux made no package in " + (root / ("dist/linux-" + arch)).string());
  }
  std::error_code ec;
  if (!fs::is_regular_file(package, ec)) return fail(package + ": not a package file");
  std::unique_ptr<Chan> c = request(d, Obj().str("op", "engine").done(), answer);
  if (!c) return 1;
  std::uint64_t files = 0, bytes = 0;
  char type = 0;
  if (!sendTree(*c, package, files, bytes, err, progress(package))) return fail(err);
  if (!recv(*c, type, answer, 300000) || type != kJson) return fail("the session with " + d.name + " ended early");
  const Doc a(answer);
  if (!a.flag("ok")) return fail(a.str("error"));
  std::printf("%s\n", a.str("text").c_str());
  return 0;
}

// Installs a .zapp or an export directory; `name` gets the name the device gave it.
int install(Device& d, const std::string& path, std::string& name) {
  std::error_code ec;
  if (!fs::exists(path, ec)) return fail(path + ": no such file or directory");
  std::string answer, err, sig;
  readFile(path + ".sig", sig);   // the detached signature zinc sign wrote beside a .zapp: a signed app on the device asks for it
  while (!sig.empty() && (sig.back() == '\n' || sig.back() == ' ')) sig.pop_back();
  // A .zapp goes as a delta when the device holds a version of it: the members whose SHA-256 its manifest shares are taken from the
  // installed archive there, the rest (headers, changed members) sent, the whole checked there by its SHA-256. An agent older than this
  // answers without "manifest" and gets the file whole, as does any mismatch (the second pass). ZINC_DEPLOY_WHOLE=1 always sends it whole.
  std::string archive, who = name;
  std::vector<zn::zapp::TarSpan> spans;
  std::map<std::string, std::string> sums;
  if (fs::is_regular_file(path, ec) && !std::getenv("ZINC_DEPLOY_WHOLE") && readFile(path, archive) && zn::zapp::tarSpans(archive, spans, err))
    for (const auto& sp : spans) if (sp.name == "manifest.json") {
      const Doc m(archive.substr(sp.at, sp.size));
      for (const auto& [n, sha] : m.pairs("files")) sums[n] = sha;
      if (who.empty()) who = cleanName(m.str("name"));
    }
  err.clear();
  for (bool delta = !sums.empty() && !who.empty();; delta = false) {
    std::unique_ptr<Chan> c = request(d, Obj().str("op", "install").str("name", delta ? who : name).str("base", baseName(path)).str("sig", sig).flag("delta", delta).done(), answer);
    if (!c) return 1;
    std::uint64_t files = 0, bytes = 0;
    char type = 0;
    bool sentDelta = false;
    if (delta && Doc(answer).has("manifest")) {
      std::map<std::string, std::string> there;
      for (const auto& [n, sha] : Doc(Doc(answer).str("manifest")).pairs("files")) there[n] = sha;
      std::vector<std::string> recipe;
      std::string patch;
      std::size_t from = 0, kept = 0;
      for (const auto& sp : spans) {
        const auto t = there.find(sp.name), h = sums.find(sp.name);
        if (!sp.file || sp.size == 0 || t == there.end() || h == sums.end() || t->second != h->second) continue;
        if (sp.at > from) { recipe.push_back(Obj().num("new", static_cast<long long>(sp.at - from)).done()); patch.append(archive, from, sp.at - from); }
        recipe.push_back(Obj().str("old", sp.name).done());
        from = sp.at + sp.size;
        ++kept;
      }
      if (from < archive.size()) { recipe.push_back(Obj().num("new", static_cast<long long>(archive.size() - from)).done()); patch.append(archive, from, std::string::npos); }
      const std::string plan = Obj().raw("recipe", array(recipe)).str("sha", zn::tc::sha256Hex(archive)).num("size", static_cast<long long>(archive.size())).done();
      sentDelta = kept > 0 && plan.size() < zn::kMaxAgentFrame / 2;
      if (!send(*c, kJson, sentDelta ? plan : "{}")) return fail("the session with " + d.name + " ended early");
      if (sentDelta) {
        const std::string tmp = (fs::temp_directory_path(ec) / ("zinc-delta-" + std::to_string(::getpid()))).string();
        if (!writePrivate(tmp, patch)) return fail("cannot write " + tmp);
        const bool ok = sendTree(*c, tmp, files, bytes, err, progress(tmp));
        fs::remove(tmp, ec);
        if (!ok) return fail(err);
        zn::log::step("send", "only what changed: " + human(static_cast<long long>(patch.size())) + " of " + human(static_cast<long long>(archive.size())) + ", " +
                      std::to_string(kept) + " file" + (kept == 1 ? "" : "s") + " unchanged");
      }
    }
    if (!sentDelta && !sendTree(*c, path, files, bytes, err, progress(path))) return fail(err);
    if (!recv(*c, type, answer, 120000) || type != kJson) return fail("the session with " + d.name + " ended early");
    const Doc a(answer);
    if (sentDelta && a.flag("whole")) { zn::log::step("send", a.str("error") + ": sending it whole"); continue; }
    if (!a.flag("ok")) return fail(a.str("error"));
    break;
  }
  const Doc a(answer);
  name = a.str("name");
  std::fprintf(stderr, "installed %s on %s (%s)\n", name.c_str(), d.name.c_str(), human(a.num("bytes")).c_str());
  return 0;
}

int logs(Device& d, const std::string& name, bool follow, long long pid = 0) {
  const bool session = pid > 0;
  std::string answer;
  std::unique_ptr<Chan> c = request(d, Obj().str("op", "logs").str("name", name).flag("follow", follow).flag("untilExit", session).num("pid", pid).done(), answer);
  if (!c) return 1;
  char type;
  std::string payload;
  static volatile sig_atomic_t interrupted = 0;
  interrupted = 0;
  const auto previous = session ? ::signal(SIGINT, +[](int) { interrupted = 1; }) : SIG_DFL;
  bool open = true;
  while (!interrupted) {
    while (next(*c, type, payload)) {
      if (type == kExit || (type == kOut && !writeAll(STDOUT_FILENO, payload.data(), payload.size()))) { open = false; break; }
    }
    if (!open) break;
    pollfd p{c->fd, POLLIN, 0};
    if (::poll(&p, 1, 200) > 0) open = fill(*c);
  }
  if (session) ::signal(SIGINT, previous);
  c.reset();
  if (session && interrupted) {
    if (!request(d, Obj().str("op", "stop").str("name", name).num("pid", pid).done(), answer)) return 1;
    std::fprintf(stderr, "stopped %s on %s\n", name.c_str(), d.name.c_str());
    return 130;
  }
  return 0;
}

// `[--env K=V]... [--] args`: what run and deploy pass to the app.
struct Launch { std::vector<std::string> args; std::vector<std::pair<std::string, std::string>> env; bool follow = false; };

int run(Device& d, const std::string& name, const Launch& l) {
  std::vector<std::string> args;
  for (const std::string& a : l.args) args.push_back(jsonText(a));
  Obj env;
  for (const auto& kv : l.env) env.str(kv.first, kv.second);
  std::string answer;
  // the device answers once an update on trial has held (ZINC_AGENT_TRIAL_MS on the device, 5 s by default), so the wait covers a long trial
  // ponytail: a fixed 10 min, above any trial a slow board needs; a "trial running" frame from the agent if one ever needs more
  if (!request(d, Obj().str("op", "run").str("name", name).raw("args", array(args)).raw("env", env.done()).done(), answer, true, 600000)) return 1;
  const Doc a(answer);
  std::fprintf(stderr, "started %s on %s (pid %lld)\n", name.c_str(), d.name.c_str(), a.num("pid"));
  return l.follow ? logs(d, name, true, a.num("pid")) : 0;
}

// Takes --env, -f and what follows -- out of `args`; the rest stays.
Launch launchOptions(std::vector<std::string>& args) {
  Launch l;
  std::vector<std::string> rest;
  for (size_t i = 0; i < args.size(); ++i) {
    if (args[i] == "--") { l.args.assign(args.begin() + static_cast<std::ptrdiff_t>(i) + 1, args.end()); break; }
    if (args[i] == "--env" && i + 1 < args.size()) {
      const std::string kv = args[++i];
      const size_t eq = kv.find('=');
      if (eq != std::string::npos) l.env.emplace_back(kv.substr(0, eq), kv.substr(eq + 1));
    } else if (args[i] == "-f" || args[i] == "--logs") l.follow = true;
    else rest.push_back(args[i]);
  }
  args = rest;
  return l;
}

// Runs a tool to its end. With `out`, what it prints on its standard output is kept there too (it is still printed).
int spawnWait(const std::vector<std::string>& argv, std::string* out = nullptr, bool echo = true) {
  std::vector<char*> p;
  for (const std::string& a : argv) p.push_back(const_cast<char*>(a.c_str()));
  p.push_back(nullptr);
  int fds[2] = {-1, -1};
  if (out && ::pipe(fds) != 0) return 1;
  const pid_t pid = ::fork();
  if (pid == 0) {
    if (out) { ::dup2(fds[1], STDOUT_FILENO); ::close(fds[0]); ::close(fds[1]); }
    if (!echo) { const int null = ::open("/dev/null", O_WRONLY); ::dup2(null, STDERR_FILENO); }   // quiet: its summary line too
    ::signal(SIGPIPE, SIG_DFL);
    ::execv(p[0], p.data());
    ::_exit(127);
  }
  if (out) {
    ::close(fds[1]);
    char buf[4096];
    ssize_t n = 0;
    while (pid > 0 && ((n = ::read(fds[0], buf, sizeof buf)) > 0 || (n < 0 && errno == EINTR)))
      if (n > 0) { out->append(buf, static_cast<size_t>(n)); if (echo) writeAll(STDOUT_FILENO, buf, static_cast<size_t>(n)); }
    ::close(fds[0]);
  }
  int status = 0;
  while (pid > 0 && ::waitpid(pid, &status, 0) < 0 && errno == EINTR) {}
  return pid > 0 && WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}

#ifdef __APPLE__
const char* const kThisOs = "macos";   // the names the agent gives (server.cpp)
#else
const char* const kThisOs = "linux";
#endif
std::string cpuName(const std::string& arch) { return arch == "arm64" ? "aarch64" : arch; }   // uname's two names of one architecture (macOS, Linux)

// The target of `zinc export` for a machine as its agent describes it (`info`: os, arch as uname says it, kind); empty when export has none.
std::string exportTarget(const std::string& os, const std::string& arch, const std::string& kind) {
  if (os != "linux") return "";   // export's macos is the build for this very Mac: nothing crosses to a Mac
  if (cpuName(arch) == "aarch64") return kind.find("Raspberry Pi") != std::string::npos ? "rpi" : "linux";
  if (arch == "armv7l" || arch == "armv8l") return "rpi2";   // a 32-bit system on ARMv7 or later; --target chip names a CHIP
  if (arch == "armv6l") return "rpi1";                       // the first Pi and the Zero
  if (arch == "x86_64") return "x86_64-linux";
  return "";
}

// True when the project names what shows its picture on Linux (zinc.json: a board, `display`, `targets.linux.display`), as a cross build reads it.
bool namesLinuxDisplay(const std::string& dir) {
  std::string text;
  readFile(dir + "/zinc.json", text);
  const Doc j(text);
  return j.has("board") || j.has("display") || yyjson_obj_get(yyjson_obj_get(yyjson_obj_get(j.v, "targets"), "linux"), "display") != nullptr;
}

// Development projects use the installed engine; neither a toolchain nor a second engine travels over the network.
bool sourceProject(const std::string& path, const std::string& stage, std::string& name, std::string& err) {
  std::error_code ec;
  const fs::path root = fs::canonical(path, ec);
  if (ec) { err = "cannot read project: " + ec.message(); return false; }
  std::string text;
  zn::frontend::Project project;
  const bool have = readFile((root / "zinc.json").string(), text);
  if (have && !zn::frontend::parseProject(text, project, err)) return false;
  const std::string entry = zn::frontend::entryOf(root.string(), have ? &project : nullptr);
  if (entry.empty() || !fs::is_regular_file(entry, ec)) { err = "no project entry in " + path; return false; }
  if (name.empty()) name = have && !project.name.empty() ? project.name : root.filename().string();
  const Doc manifest(text);
  std::vector<std::string> roots = {"src", "assets", "plugins", "node_modules", "zinc.json", "zinc.lock", "tsconfig.json", "package.json"};
  roots.push_back(fs::path(entry).lexically_relative(root).generic_string());
  for (const auto& file : fs::directory_iterator(root, ec)) {
    const std::string ext = file.path().extension().string();
    if (file.path().filename().string()[0] != '.' && (ext == ".ts" || ext == ".tsx" || ext == ".js" || ext == ".mjs")) roots.push_back(file.path().filename().string());
  }
  const Val assets{yyjson_obj_get(manifest.v, "assets")};
  if (!manifest.str("assets").empty()) roots.push_back(manifest.str("assets"));
  else if (!assets.str("dir").empty()) roots.push_back(assets.str("dir"));
  const std::string icon = Val{yyjson_obj_get(manifest.v, "app")}.str("icon");
  if (!icon.empty()) roots.push_back(icon);
  const fs::path to = fs::path(stage) / "project";
  fs::create_directories(to, ec);
  const auto copy = [&](const fs::path& file) {
    const fs::path rel = file.lexically_relative(root);
    if (!safeRel(rel.generic_string()) || fs::is_symlink(file, ec)) { err = "source deployment refuses links or paths outside the project: " + rel.string(); return false; }
    if (!fs::is_regular_file(file, ec)) return true;
    fs::create_directories((to / rel).parent_path(), ec);
    if (!ec) fs::copy_file(file, to / rel, fs::copy_options::overwrite_existing, ec);
    if (ec) { err = "cannot copy " + rel.string() + ": " + ec.message(); return false; }
    return true;
  };
  for (const std::string& rel : roots) {
    if (!safeRel(rel)) { err = "source deployment requires project-relative paths: " + rel; return false; }
    const fs::path from = root / rel;
    if (!fs::exists(from, ec)) continue;
    if (!safeRel(fs::weakly_canonical(from, ec).lexically_relative(root).generic_string())) { err = "source path escapes the project: " + rel; return false; }
    if (fs::is_symlink(from, ec)) { err = "source deployment refuses links: " + rel; return false; }
    if (!fs::is_directory(from, ec)) { if (!copy(from)) return false; continue; }
    for (auto it = fs::recursive_directory_iterator(from, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
      const std::string base = it->path().filename().string();
      if (base[0] == '.' || base == "dist" || base == "build") { it.disable_recursion_pending(); continue; }
      if (!copy(it->path())) return false;
      if (ec) break;
    }
    if (ec) { err = "cannot read sources: " + ec.message(); return false; }
  }
  if (!writePrivate(stage + "/run.sh", "#!/bin/sh\ncd \"$(dirname \"$0\")/project\" || exit 1\nexec \"${ZINC_ENGINE:-zinc}\" run . --interp -- \"$@\"\n")) { err = "cannot write project launcher"; return false; }
  return true;
}

// "0.6" of "0.6.2+52.g6feb1df0": the series whose engines run one another's bytecode (dev.cpp has the same).
std::string seriesOf(const std::string& v) { return v.substr(0, v.find('.', v.find('.') + 1)); }

}  // namespace

std::string playerLacks(const std::map<std::string, std::string>& files, const Val& info, const std::string& device) {
  const std::string profile = info.str("profile").empty() ? info.str("os") : info.str("profile");
  if (!files.count("program.zbc"))   // zinc pack of a JavaScript project sends its sources, for QuickJS
    return "the project runs on QuickJS (a JavaScript project), and the " + profile + " player on " + device +
           " runs Zinc bytecode only: a TypeScript project (no \"engine\": \"quickjs\" in its zinc.json) runs there";
  return "";
}

void playerWarnings(const std::string& self, const std::string& dir, const Val& info, const std::string& device) {
  const std::string profile = info.str("profile");
  if (profile.empty()) return;
  std::string out;
  spawnWait({self, "lint", "--target", profile, dir}, &out, false);   // its rule plugin-targets: the plugin.json targets of each plugin used
  const std::vector<std::string> have = info.strs("plugins");   // linked into the player (3d, audio): there whatever their plugin.json says
  std::istringstream lines(out);
  for (std::string line; std::getline(lines, line);) {   // "...: warning plugin-targets [n3ds]: plugin canvas2d is not made for this target (its plugin.json targets: ...) (fix: ...)"
    const std::size_t p = line.find("plugin-targets ["), n = line.find(": plugin ", p == std::string::npos ? 0 : p);
    if (p == std::string::npos || n == std::string::npos) continue;
    const std::string plugin = line.substr(n + 9, line.find(' ', n + 9) - n - 9);
    if (std::find(have.begin(), have.end(), plugin) != have.end()) continue;
    const std::size_t why = line.find(" (its plugin.json", n), whyEnd = line.find(')', why);
    std::fprintf(stderr, "warning: plugin %s is not available on %s (profile %s)%s: the program may stop where it uses it\n", plugin.c_str(), device.c_str(),
                 profile.c_str(), why == std::string::npos || whyEnd == std::string::npos ? "" : line.substr(why, whyEnd + 1 - why).c_str());
  }
}

namespace {

// A player (a console, ZN-792) runs bytecode: the project packed here for its profile, the members of the .zapp sent (no native code: its
// plugins are linked into it), then started and followed as any app.
int deployPlayer(Device& d, const Doc& info, const std::string& path, std::string name, const Launch& l, const std::string& self, bool force) {
  const std::string profile = info.str("profile"), there = info.str("engine"), here = zn::tc::version();
  const std::string what = info.str("kind").empty() ? info.str("os") : info.str("kind");
  if (there != here && seriesOf(there) != seriesOf(here) && !force)
    return fail(d.name + " runs the player of zinc " + there + " and this computer zinc " + here + ": its bytecode may not run there. Install this zinc's player "
                "on it (tools/build-console-core " + (profile.empty() ? std::string("<console>") : profile) + " --player), or --force tries anyway");
  zn::log::step("device", d.name + " is a " + what + " player: packing for --profile " + (profile.empty() ? "of this machine" : profile) + " (bytecode, no native code)");
  std::error_code ec;
  std::string tmp = (fs::temp_directory_path(ec) / "zinc-deploy-XXXXXX").string(), archive, err;
  if (!::mkdtemp(tmp.data())) return fail("cannot create a staging directory");
  struct Gone { std::string dir; ~Gone() { std::error_code e; fs::remove_all(dir, e); } } gone{tmp};
  std::vector<std::string> cmd = {self, "pack", path, "-o", tmp + "/app.zapp"};
  if (!profile.empty()) { cmd.push_back("--profile"); cmd.push_back(profile); }
  if (const int rc = spawnWait(cmd)) return rc;
  std::map<std::string, std::string> files;
  if (!readFile(tmp + "/app.zapp", archive) || !zn::zapp::untar(archive, files, err)) return fail("the packed project cannot be read: " + err);
  if (const std::string why = playerLacks(files, info, d.name); !why.empty()) return fail(why);
  playerWarnings(self, path, info, d.name);
  if (name.empty()) name = cleanName(Doc(files["manifest.json"]).str("name"));
  const std::string app = tmp + "/" + name;
  for (const auto& [member, bytes] : files) {
    if (member == "manifest.json" || member.rfind("native/", 0) == 0) continue;
    const fs::path to = fs::path(app) / member;
    fs::create_directories(to.parent_path(), ec);
    if (!writePrivate(to.string(), bytes)) return fail("cannot write " + to.string());
  }
  if (const int rc = install(d, app, name)) return rc;
  return run(d, name, l);
}

// The project of `dir` installed and started on the device, its log followed: the loop of `zinc run`, on another machine. What is sent
// follows from what the device is: sources for a Pi's installed engine, a .zapp for this system/architecture, else a native export.
int cmdDeploy(Device& d, std::vector<std::string> args, const std::string& self) {
  Launch l = launchOptions(args);
  bool follow = true, pack = false, inspect = false, source = false, force = false, start = true, sourceOnly = false;
  std::string name, path = ".", target, packFor;   // packFor: the device's target when the .zapp is built here for another machine
  for (size_t i = 0; i < args.size(); ++i) {
    if (args[i] == "--no-logs") follow = false;
    else if (args[i] == "--no-run") start = false;   // installed only: zinc device bench starts it itself
    else if (args[i] == "--pack") pack = true;
    else if (args[i] == "--source") sourceOnly = true;   // the sources, compiled by the device's engine (the way before the Mac built them)
    else if (args[i] == "--inspect") inspect = true;
    else if (args[i] == "--force") force = true;
    else if (args[i] == "--target" && i + 1 < args.size()) target = args[++i];
    else if (args[i] == "--name" && i + 1 < args.size()) name = args[++i];
    else path = args[i];
  }
  if (pack && !target.empty()) return fail("--pack sends a .zapp, --target an export: give one of them");
  std::error_code ec;
  std::string made;   // what is built here to be sent: a .zapp in the temporary directory, or the export in the project's dist/
  if (fs::is_directory(path, ec) && !fs::exists(path + "/run.sh", ec)) {   // a project
    std::string why = pack ? "--pack" : "--target " + target;
    if (!pack && target.empty()) {
      std::string answer;
      if (!request(d, Obj().str("op", "info").done(), answer)) return 1;
      const Doc a(answer);
      if (a.flag("player")) {
        if (inspect) return fail(d.name + " is a player: no inspector on a console yet (deploy without --inspect)");
        l.follow = follow;
        return deployPlayer(d, a, path, name, l, self, force);
      }
      struct utsname u{};
      ::uname(&u);
      const std::string os = a.str("os"), arch = a.str("arch"), kind = a.str("kind");
      why = d.name + " is " + os + " " + arch + (kind.empty() ? "" : " (" + kind + ")");
      // a Pi runs the .zapp this machine compiles for it (its plugins cross-built here), as an ESP32 runs the app built here: nothing compiles there
      const bool pi = !inspect && os == "linux" && kind.find("Raspberry Pi") != std::string::npos;
      source = pi && sourceOnly;
      if (pi && !source) {
        packFor = exportTarget(os, arch, kind); pack = !packFor.empty();
        // its engine runs the bytecode compiled here: an older one lacks the runtime rows added since (the load says so, with the way out)
        const std::string there = a.str("engine"), here = zn::tc::version();
        if (pack && there != here)
          zn::log::step("device", d.name + " runs zinc " + there + ", this computer zinc " + here + ": if the app says it was compiled by a newer zinc, "
                        "zinc device " + d.name + " update --local puts this one there");
      }
      else pack = !source && os == kThisOs && cpuName(arch) == cpuName(u.machine);
      if (pack) why += packFor.empty() ? ", as this machine" : ", built here for it";
      else if (!source && (target = exportTarget(os, arch, kind)).empty())
        return fail(why + ": zinc export has no target for it (--target <t> names one; --pack sends a .zapp, which its engine runs without native plugins)");
    }
    // what is sent and why is a note, said as a step of the command (quiet under -q; Atelier shows it as one, not as an error)
    std::vector<std::string> more;
    if (inspect) more.push_back("--inspect");   // the program with the inspector in front, as zinc dev starts it
    zn::log::Phase prepared("device", "prepare project", "prepare", source ? "project sources" : pack ? "app bundle" : "native export (cross compilation included)");
    if (source) {
      zn::log::step("device", why + ": sending the project for its installed engine (no cross compilation)");
      std::string scratch = (fs::temp_directory_path(ec) / "zinc-deploy-XXXXXX").string(), err;
      if (!::mkdtemp(scratch.data())) return fail("cannot create source staging directory");
      made = scratch;
      if (!sourceProject(path, made, name, err)) { fs::remove_all(made, ec); return fail(err); }
    } else if (pack) {   // one file to send, checked on arrival
      zn::log::step("device", why + ": packing a .zapp");
      made = (fs::temp_directory_path(ec) / ("zinc-deploy-" + std::to_string(::getpid()) + ".zapp")).string();
      std::vector<std::string> cmd = {self, "pack", path, "-o", made};
      if (!packFor.empty()) { cmd.push_back("--target"); cmd.push_back(packFor); }
      cmd.insert(cmd.end(), more.begin(), more.end());
      const int rc = spawnWait(cmd);
      if (rc != 0) return rc;
    } else {
      // A Raspberry Pi shows a program on its framebuffer (the prototype's rpi targets): a project that names no display for Linux (a sketch
      // without zinc.json) is built with that driver, or it would run there with no screen and leave after 60 frames.
      const bool fb = target.rfind("rpi", 0) == 0 && !std::getenv("ZINC_DISPLAY") && !namesLinuxDisplay(path);
      if (fb) ::setenv("ZINC_DISPLAY", "fbdev", 1);
      zn::log::step("device", why + ": exporting for " + target + (fb ? ", shown on its framebuffer (ZINC_DISPLAY=fbdev: zinc.json names no display for Linux)" : ""));
      std::string said;
      std::vector<std::string> cmd = {self, "export", path, "--target", target};
      cmd.insert(cmd.end(), more.begin(), more.end());
      const int rc = spawnWait(cmd, &said);
      if (rc != 0) return rc;
      while (!said.empty() && said.back() == '\n') said.pop_back();
      made = said.substr(said.rfind('\n') + 1);   // export's last line: the directory it wrote, dist/<name>-<target>
      if (!fs::exists(made + "/run.sh", ec)) return fail("zinc export --target " + target + " made nothing a device starts (no run.sh in " + made + ")");
      const std::string base = baseName(made), tail = "-" + target;
      if (name.empty() && base.size() > tail.size() && base.compare(base.size() - tail.size(), tail.size(), tail) == 0) name = base.substr(0, base.size() - tail.size());   // the project's name, as its .zapp has it
    }
  } else if (inspect) return fail("--inspect is for a project: a .zapp or an export is sent as it was built (zinc pack --inspect, zinc export --inspect)");
  const int rc = install(d, made.empty() ? path : made, name);
  if (pack && !made.empty()) fs::remove(made, ec);   // the export stays in dist/, as after zinc export
  if (source && !made.empty()) fs::remove_all(made, ec);
  if (rc != 0) return rc;
  if (!start) return 0;
  l.follow = follow;
  return run(d, name, l);
}

// zinc device <d> profile <app> [--frames n] [-o trace.json] [--env K=V] [-- args] (ZN-821): the installed app run there for `frames`
// frames with the frame profiler (ZINC_PROFILE=1: its summary closes the log) and the trace of its frames (ZINC_TRACE), then the trace
// brought here. The trace file there is emptied first, so an app that ends without writing one is not taken for the last profile's.
int cmdProfile(Device& d, std::vector<std::string> args) {
  const char* const use = "usage: zinc device [<device>] profile <app> [--frames n] [-o trace.json] [--env K=V] [-- args]";
  Launch l = launchOptions(args);
  std::string app, out, frames = "600";
  for (size_t i = 0; i < args.size(); ++i) {
    if (args[i] == "--frames" && i + 1 < args.size()) frames = args[++i];
    else if (args[i] == "-o" && i + 1 < args.size()) out = args[++i];
    else if (app.empty() && args[i][0] != '-') app = args[i];
    else return fail(use);
  }
  if (app.empty()) return fail(use);
  std::string answer;
  if (!request(d, Obj().str("op", "info").done(), answer)) return 1;
  const Doc info(answer);
  if (info.flag("player")) return fail(d.name + " is a player: its apps are not profiled through the agent yet");
  if (info.str("home").empty()) return fail("the agent of " + d.name + " is older than zinc device profile: zinc device " + d.name + " update");
  const std::string trace = info.str("home") + "/run/" + app + ".trace.json";
  if (out.empty()) out = app + "-trace.json";
  std::error_code ec;
  const std::string empty = (fs::temp_directory_path(ec) / ("zinc-profile-" + std::to_string(::getpid()))).string();
  if (!writePrivate(empty, "")) return fail("cannot write " + empty);
  const int pushed = cmdPush(d, {empty, trace}, true);
  fs::remove(empty, ec);
  if (pushed != 0) return pushed;
  l.env.emplace_back("ZINC_PROFILE", "1");
  l.env.emplace_back("ZINC_TRACE", trace);
  l.env.emplace_back("ZINC_FRAMES", frames);
  l.follow = true;   // the log to the app's end: the profile's summary is its last lines
  const int rc = run(d, app, l);
  if (rc != 0) return rc;
  fs::remove(out, ec);
  if (cmdPull(d, {trace, out}) != 0) return 1;
  if (fs::file_size(out, ec) == 0) { fs::remove(out, ec); return fail(app + " ended without a trace: does it draw frames (zinc:gfx or zinc:ui)?"); }
  std::printf("trace of %s on %s: %s (open it in https://ui.perfetto.dev or chrome://tracing)\n", app.c_str(), d.name.c_str(), out.c_str());
  return 0;
}

// zinc device <d> bench [zbench run options] (ZN-821): tools/zbench's render suite on the device (agent:<d>: deployed with deploy --no-run,
// started with run --env, its report pulled), its JSON written here. The tool is part of zinc's sources, beside this binary's build/.
int cmdBench(Device& d, const std::vector<std::string>& args, const std::string& self) {
  const fs::path zbench = fs::path(self).parent_path().parent_path() / "tools/zbench";
  std::error_code ec;
  if (!fs::exists(zbench, ec))
    return fail("zinc device bench runs tools/zbench of zinc's sources, and this zinc is not a source build: tools/zbench run agent:" + d.name + " from a checkout");
  std::vector<std::string> argv = {zbench.string(), "run", "agent:" + d.name};
  argv.insert(argv.end(), args.begin(), args.end());
  ::setenv("ZINC", self.c_str(), 1);   // the tool drives the device with this zinc
  return spawnWait(argv);
}

int simple(Device& d, const std::string& op, const std::string& name) {
  std::string answer;
  if (!request(d, Obj().str("op", op).str("name", name).done(), answer)) return 1;
  const Doc a(answer);
  if (op == "stop") std::printf(a.flag("stopped") ? "stopped %s\n" : "%s was not running\n", name.c_str());
  else if (op == "uninstall") std::printf("removed %s\n", name.c_str());
  else for (const Val& app : a.items("apps")) std::printf("%-24s %-7s %s\n", app.str("name").c_str(), app.str("kind").c_str(), app.flag("running") ? ("running, pid " + std::to_string(app.num("pid"))).c_str() : "stopped");
  return 0;
}

// A port of this machine that reaches a port of the device (its own ports only): the inspector or the debugger of an app running there.
int cmdForward(Device& d, const std::vector<std::string>& args, const std::function<void(int port)>& listening = {}) {
  if (args.size() != 2) return fail("usage: zinc device [<device>] forward <local-port|0> <device-port>");
  const int remote = std::atoi(args[1].c_str());
  std::string answer;
  if (!request(d, Obj().str("op", "apps").done(), answer)) return 1;   // the device answers, and its address is the current one
  const int lfd = ::socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = htons(static_cast<std::uint16_t>(std::atoi(args[0].c_str())));
  int one = 1;
  ::setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  if (lfd < 0 || ::bind(lfd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) != 0 || ::listen(lfd, 16) != 0) return fail("cannot listen on port " + args[0] + ": " + std::strerror(errno));
  socklen_t n = sizeof addr;
  ::getsockname(lfd, reinterpret_cast<sockaddr*>(&addr), &n);
  if (listening) listening(ntohs(addr.sin_port));
  else std::printf("forwarding 127.0.0.1:%d to port %d of %s\n", ntohs(addr.sin_port), remote, d.name.c_str());
  std::fflush(stdout);
  for (;;) {
    const int sock = ::accept(lfd, nullptr, nullptr);
    if (sock < 0) { if (errno == EINTR) continue; return fail(std::string("accept: ") + std::strerror(errno)); }
    std::thread([d, sock, remote]() mutable {
      prepare(sock);
      std::string reply;
      if (std::unique_ptr<Chan> c = request(d, Obj().str("op", "connect").num("port", remote).done(), reply, false)) relaySocket(*c, sock, kIn, kOut);
      ::close(sock);
    }).detach();
  }
}

// The other way (adb reverse): a port of the device, on its own address, that reaches a port of this machine. The device names each
// connection it takes on this session; a session of its own carries it.
int cmdReverse(Device& d, const std::vector<std::string>& args) {
  if (args.size() != 2) return fail("usage: zinc device [<device>] reverse <device-port|0> <local-port>");
  const int local = std::atoi(args[1].c_str());
  std::string answer;
  std::unique_ptr<Chan> c = request(d, Obj().str("op", "listen").num("port", std::atoi(args[0].c_str())).done(), answer);
  if (!c) return 1;
  std::printf("port %lld of %s reaches 127.0.0.1:%d\n", Doc(answer).num("port"), d.name.c_str(), local);
  std::fflush(stdout);
  char type;
  std::string payload;
  while (recv(*c, type, payload)) {
    const std::string id = Doc(payload).str("accept");
    if (type != kJson || id.empty()) continue;
    std::thread([d, id, local]() mutable {
      std::string err, reply;
      const int sock = dial("127.0.0.1", local, 3000, err);   // nothing there: the session below is not opened and the device closes its end when the port closes
      if (sock < 0) return;
      if (std::unique_ptr<Chan> s = request(d, Obj().str("op", "accepted").str("id", id).done(), reply, false)) relaySocket(*s, sock, kIn, kOut);
      ::close(sock);
    }).detach();
  }
  return fail("the session with " + d.name + " ended");
}

int usage() {
  std::fprintf(stderr,
               "usage: zinc device list [--json]                        the devices of the network and the paired ones\n"
               "       zinc device pair <name|host[:port]> [code]      pair with the code the device shows (zinc agent pair)\n"
               "       zinc device unpair <device>\n"
               "       zinc device [<device>] info [--json]            what the machine is, its load, its apps\n"
               "       zinc device [<device>] shell [-t] [command]     a command with its exit status, or a terminal\n"
               "       zinc device [<device>] push <local> [remote]    a file or a tree to the device; pull <remote> [local] the other way\n"
               "       zinc device [<device>] deploy [dir] [-- args]   build for the device, install, start, follow the log (--no-logs, --no-run, --env K=V, --name n)\n"
               "                                                       --inspect puts the inspector in front of a program with an interface, as zinc dev does\n"
               "                                                       a .zapp for a machine like this one, else zinc export for its target; --pack, --target <t> decide\n"
               "       zinc device [<device>] install <app.zapp|export-dir> [--name n]\n"
               "       zinc device [<device>] run <app> [-f] [--env K=V] [-- args] | stop <app> | uninstall <app> | apps | logs <app> [-f]\n"
               "       zinc device [<device>] update [<app>] [--url u]  an app from its signed channel, fetched by the device; no app: the engine\n"
               "       zinc device [<device>] update --local [package] | --local --remove  this source tree's engine on the device, without a release (built with tools/build-linux)\n"
               "       zinc device [<device>] forward <local-port|0> <device-port>   a port of the device here (its inspector)\n"
               "       zinc device [<device>] reverse <device-port|0> <local-port>   a port of this machine there (a server an app calls)\n"
               "       zinc device [<device>] inspect <app> [--port n]              its inspector on a port of this machine: the DevTools address\n"
               "       zinc device [<device>] shot <app> [file.png]                 the frame the app shows\n"
               "       zinc device [<device>] screen [file.png]                     what its screen shows (the player, an app, zinc dev)\n"
               "       zinc device [<device>] screen --live                         its screen in a window, driven by this mouse and keyboard\n"
               "       zinc device [<device>] monitor <app>                         its zinc:telemetry lines, as zinc monitor prints them\n"
               "       zinc device [<device>] top [-n count] [--json]               the machine's load and each app's CPU and memory, every second\n"
               "       zinc device [<device>] profile <app> [--frames n] [-o trace.json]   it runs with the frame profiler: the summary, the trace brought here\n"
               "       zinc device [<device>] bench [--scene id,id] [--runs n] [--frames n] [--out file.json]   tools/zbench's render suite there, its JSON here\n"
               "<device> may be left out when one device is paired.\n");
  return 2;
}

}  // namespace

// What inspect.cpp takes from the commands above (wire.h).
std::unique_ptr<Chan> ask(Device& d, const std::string& req, std::string& answer, bool mayLook) { return request(d, req, answer, mayLook); }
int forwardPort(Device& d, int local, int remote, const std::function<void(int port)>& listening) { return cmdForward(d, {std::to_string(local), std::to_string(remote)}, listening); }
int followLogs(Device& d, const std::string& name) { return logs(d, name, true); }
int runTool(const std::vector<std::string>& argv) { return spawnWait(argv); }

int device(const std::vector<std::string>& argsIn, const std::string& self) {
  std::vector<std::string> args = argsIn;
  ::signal(SIGPIPE, SIG_IGN);
  if (args.empty() || args[0] == "--help" || args[0] == "help") return usage();
  const std::string first = args[0];
  if (first == "list") return cmdList({args.begin() + 1, args.end()});
  if (first == "pair") return cmdPair({args.begin() + 1, args.end()});

  std::vector<Device> paired = loadDevices();
  const auto byName = [&](const std::string& n) -> Device* {
    for (Device& d : paired) if (isNamed(d, n)) return &d;
    return nullptr;
  };
  if (first == "unpair") {
    if (args.size() != 2) return usage();
    Device* d = byName(args[1]);
    if (!d) return fail("no paired device named " + args[1]);
    std::string err;
    if (std::unique_ptr<Chan> c = openSession(*d, err)) send(*c, kJson, Obj().str("op", "unpair").done());   // a device that is away forgets us at its next pairing
    const std::string id = d->id;
    paired.erase(std::remove_if(paired.begin(), paired.end(), [&](const Device& o) { return o.id == id; }), paired.end());
    return saveDevices(paired) ? 0 : fail("cannot write " + storePath());
  }

  if (first == "inspect" && args.size() == 2 && args[1] == "--all") return inspectAll(paired);
  static const char* const ops[] = {"info", "shell", "push", "pull", "install", "deploy", "run", "stop", "uninstall", "apps", "logs", "update", "forward", "reverse", "inspect", "shot", "monitor", "top", "screen", "profile", "bench"};
  const auto isOp = [&](const std::string& w) { for (const char* o : ops) if (w == o) return true; return false; };
  Device* d = nullptr;
  if (isOp(first) && !(args.size() > 1 && isOp(args[1]) && byName(first))) {   // a device named like a command ("bench") followed by a command is the device
    if (paired.empty()) return fail("no paired device: zinc device list, then zinc device pair <name>");
    if (paired.size() > 1) return fail("several devices are paired: name one (zinc device list)");
    d = &paired[0];
  } else {
    d = byName(first);
    if (!d) return fail("no paired device named " + first + " (zinc device list)");
    args.erase(args.begin());
    if (args.empty() || !isOp(args[0])) return usage();
  }
  const std::string op = args[0];
  args.erase(args.begin());
  if (op == "info") return cmdInfo(*d, args);
  if (op == "shell") return cmdShell(*d, args);
  if (op == "push") return cmdPush(*d, args);
  if (op == "pull") return cmdPull(*d, args);
  if (op == "screen") return cmdScreen(*d, args);
  if (op == "deploy") return cmdDeploy(*d, args, self);
  if (op == "profile") return cmdProfile(*d, args);
  if (op == "bench") return cmdBench(*d, args, self);
  if (op == "forward") return cmdForward(*d, args);
  if (op == "reverse") return cmdReverse(*d, args);
  if (op == "shot" && !args.empty()) {   // a player has no inspector: the frame of its screen, which shows the app
    std::string answer;
    if (!request(*d, Obj().str("op", "info").done(), answer)) return 1;
    if (Doc(answer).flag("player")) return cmdScreen(*d, {args.size() > 1 ? args[1] : args[0] + ".png"});
  }
  if (op == "inspect" || op == "shot" || op == "monitor" || op == "top") return inspectCommand(*d, op, args, self);
  if (op == "apps") return simple(*d, "apps", "");
  if (op == "update" && std::find(args.begin(), args.end(), "--local") != args.end()) return updateLocal(*d, args, self);
  if (op == "update") {   // the device fetches and checks (ota.cpp); a second answer when the download is done
    std::string app, url, answer;
    for (size_t i = 0; i < args.size(); ++i) { if (args[i] == "--url" && i + 1 < args.size()) url = args[++i]; else app = args[i]; }
    std::unique_ptr<Chan> c = request(*d, Obj().str("op", "update").str("name", app).str("url", url).done(), answer);
    char type = 0;
    if (!c) return 1;
    if (!recv(*c, type, answer, 600000) || type != kJson) return fail("the session with " + d->name + " ended early");
    const Doc a(answer);
    if (!a.flag("ok")) return fail(a.str("error"));
    std::printf("%s\n", a.str("text").c_str());
    return 0;
  }
  if (op == "install") {
    std::string name, path;
    for (size_t i = 0; i < args.size(); ++i) { if (args[i] == "--name" && i + 1 < args.size()) name = args[++i]; else path = args[i]; }
    return path.empty() ? usage() : install(*d, path, name);
  }
  const Launch l = launchOptions(args);
  if (args.size() != 1) return usage();
  if (op == "run") return run(*d, args[0], l);
  if (op == "logs") return logs(*d, args[0], l.follow);
  return simple(*d, op, args[0]);
}

int startForward(const std::string& device, int remote, int local) {
  for (const Device& d : loadDevices()) if (isNamed(d, device)) return startForward(d, remote, local);
  return 0;
}

std::unique_ptr<Chan> deviceSession(const std::string& device, const std::string& req, std::string& answer, std::string& name) {
  std::vector<Device> paired = loadDevices();
  Device* d = nullptr;
  for (Device& o : paired) if (device.empty() ? paired.size() == 1 : isNamed(o, device)) { d = &o; break; }
  if (!d) { fail(device.empty() ? "name the device (zinc device list)" : "no paired device named " + device + " (zinc device list)"); return nullptr; }
  name = d->name;
  return request(*d, req, answer);
}

}  // namespace zn::agent
