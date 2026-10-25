// The device player's server (ZN-792): see player.h. Its requests are those of the agent (server.cpp) that a process which runs its programs
// itself can serve; the others are refused with what the player is. Files through stdio and POSIX directories only (newlib on the consoles).
#include "player.h"

#include "platform/socket.h"
#include <dirent.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>

namespace zn::agent {

namespace {

constexpr std::size_t kMaxRequest = 64 * 1024;   // a player refuses a JSON frame above this (a console's memory)
constexpr long kLogMax = 256 * 1024;              // the log of one run: cut to its end past this

long long now() { return static_cast<long long>(std::time(nullptr)); }

bool slurp(const std::string& path, std::string& out) {
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return false;
  out.clear();
  char buf[16384];
  for (std::size_t n; (n = std::fread(buf, 1, sizeof buf, f)) > 0;) out.append(buf, n);
  std::fclose(f);
  return true;
}
bool spill(const std::string& path, std::string_view data, bool append = false) {
  const std::string tmp = append ? path : path + ".tmp";
  std::FILE* f = std::fopen(tmp.c_str(), append ? "ab" : "wb");
  if (!f) return false;
  const bool ok = std::fwrite(data.data(), 1, data.size(), f) == data.size();
  if (std::fclose(f) != 0 || !ok) return false;
  if (append) return true;
  std::remove(path.c_str());   // newlib's rename does not replace on every console
  return std::rename(tmp.c_str(), path.c_str()) == 0;
}
bool isDir(const std::string& p) { struct stat st{}; return ::stat(p.c_str(), &st) == 0 && S_ISDIR(st.st_mode); }
bool isFile(const std::string& p) { struct stat st{}; return ::stat(p.c_str(), &st) == 0 && S_ISREG(st.st_mode); }
void makeDirs(const std::string& path) {
  for (std::size_t at = path.find('/', 1); ; at = path.find('/', at + 1)) {
    const std::string part = path.substr(0, at);
    if (!part.empty() && part.back() != ':') ::mkdir(part.c_str(), 0777);   // "ms0:" is a device, not a directory
    if (at == std::string::npos) break;
  }
}
void removeTree(const std::string& path) {
  if (DIR* d = ::opendir(path.c_str())) {
    while (dirent* e = ::readdir(d)) {
      const std::string n = e->d_name;
      if (n == "." || n == "..") continue;
      const std::string p = path + "/" + n;
      if (isDir(p)) removeTree(p); else std::remove(p.c_str());
    }
    ::closedir(d);
  }
  ::rmdir(path.c_str());
}
std::vector<std::string> subdirs(const std::string& path) {
  std::vector<std::string> out;
  if (DIR* d = ::opendir(path.c_str())) {
    while (dirent* e = ::readdir(d)) {
      const std::string n = e->d_name;
      if (!n.empty() && n[0] != '.' && isDir(path + "/" + n)) out.push_back(n);
    }
    ::closedir(d);
  }
  std::sort(out.begin(), out.end());
  return out;
}

std::string agentDir(const Player& p) { return p.home + "/agent"; }
std::string appDir(const Player& p, const std::string& name) { return p.home + "/apps/" + name; }
std::string logFile(const Player& p, const std::string& name) { return p.home + "/logs/" + name + ".log"; }

// ---- the paired workstations: the agent's clients.json ----

struct Client { std::string id, name, key; };
std::vector<Client> loadClients(const Player& p) {
  std::vector<Client> out;
  std::string text;
  if (!slurp(agentDir(p) + "/clients.json", text)) return out;
  const Doc d(text);
  for (const Val& c : d.items("clients")) out.push_back({c.str("id"), c.str("name"), unhex(c.str("key"))});
  return out;
}
bool saveClients(const Player& p, const std::vector<Client>& clients) {
  std::vector<std::string> items;
  for (const Client& c : clients) items.push_back(Obj().str("id", c.id).str("name", c.name).str("key", hex(c.key)).done());
  return spill(agentDir(p) + "/clients.json", Obj().raw("clients", array(items)).done() + "\n");
}

// ---- what it says it is ----

std::string appsJson(const Player& p) {
  std::vector<std::string> items;
  for (const std::string& n : subdirs(p.home + "/apps"))
    items.push_back(Obj().str("name", n).str("kind", "zapp").flag("running", n == p.current).num("pid", n == p.current ? p.pid : 0).done());
  return array(items);
}
std::string infoJson(Player& p) {
  Obj o;
  std::vector<std::string> plugins;
  for (const std::string& m : p.plugins) plugins.push_back(jsonText(m));
  o.flag("ok", true).str("id", p.id).str("name", p.name).str("engine", p.engine).str("os", p.os).str("osVersion", p.osVersion).str("arch", p.arch).str("kind", p.kind);
  o.num("cores", 1).flag("player", true).str("profile", p.profile).raw("plugins", array(plugins)).str("address", p.address).flag("shell", false);
  if (p.info) p.info(o);
  o.raw("apps", appsJson(p));
  return o.done();
}

// ---- files: the entries of push and install (wire.cpp's recvTree without std::filesystem) ----

bool recvFiles(Chan& c, const std::string& root, std::uint64_t& files, std::uint64_t& bytes, std::string& err) {
  std::string firstErr;
  const auto note = [&](const std::string& e) { if (firstErr.empty()) firstErr = e; };
  std::FILE* out = nullptr;
  std::uint64_t left = 0;
  for (;;) {
    char type;
    std::string payload;
    if (!recv(c, type, payload, 30000)) { if (out) std::fclose(out); err = "the connection ended during the transfer"; return false; }
    if (type == kOut) {
      if (payload.size() > left) { if (out) std::fclose(out); err = "the transfer does not follow its sizes"; return false; }
      left -= payload.size();
      if (out && std::fwrite(payload.data(), 1, payload.size(), out) == payload.size()) bytes += payload.size();
      else if (out) { note(std::string("write: ") + std::strerror(errno)); std::fclose(out); out = nullptr; }
      if (left == 0 && out) { std::fclose(out); out = nullptr; }
      continue;
    }
    if (type != kJson) continue;
    const Doc d(payload);
    if (left != 0 || !d.ok() || d.has("error")) { if (out) std::fclose(out); err = d.ok() && d.has("error") ? d.str("error") : "the transfer was interrupted"; return false; }
    if (d.flag("end")) break;
    const bool dir = d.has("dir");
    const std::string rel = d.str(dir ? "dir" : "file");
    if (!dir) left = static_cast<std::uint64_t>(d.num("size"));
    if (!dir && rel.empty()) { note("a player takes the members of an app (zinc device deploy unpacks the .zapp), not one file"); continue; }
    if (!safeRel(rel)) { note("refused: the name '" + rel + "' leaves the destination"); continue; }
    const std::string target = rel.empty() ? root : root + "/" + rel;
    if (dir) { makeDirs(target); continue; }
    const std::size_t slash = target.rfind('/');
    if (slash != std::string::npos) makeDirs(target.substr(0, slash));
    out = std::fopen(target.c_str(), "wb");
    if (!out) { note(target + ": " + std::strerror(errno)); continue; }
    ++files;
    if (left == 0) { std::fclose(out); out = nullptr; }
  }
  if (!firstErr.empty()) { err = firstErr; return false; }
  return true;
}

bool sendBytes(Chan& c, std::string_view data) {
  for (std::size_t at = 0; at < data.size(); at += kChunk)
    if (!send(c, kOut, data.substr(at, kChunk))) return false;
  return true;
}

// ---- pairing ----

void pairConnection(Player& p, int fd) {
  Chan c;
  c.fd = fd;
  if (!playerPairing(p) || p.tries >= 3) { sendLine(fd, "ZNA1 closed"); return; }
  ++p.tries;   // counted before the handshake: a try that never ends is a try
  sendLine(fd, "ZNA1 ok");
  std::string err;
  if (!openPake(c, true, p.code, err) || !handshake(c, 10000, err)) {
    if (p.tries >= 3) p.closed = true;   // SELECT gives a new code
    return;
  }
  char type;
  std::string payload;
  if (!recv(c, type, payload, 10000) || type != kJson) return;
  const Doc req(payload);
  Client cl{hex(randomBytes(8)), cleanName(req.str("name")), randomBytes(32)};
  std::vector<Client> clients = loadClients(p);
  clients.push_back(cl);
  if (cl.id.size() != 16 || cl.key.size() != 32 || !saveClients(p, clients)) { refuse(c, "the player could not keep the key"); return; }
  p.code.clear();   // one code, one workstation
  p.paired = cl.name;
  send(c, kJson, Obj().flag("ok", true).str("id", p.id).str("name", p.name).str("client", cl.id).str("key", hex(cl.key)).done());
  std::printf("zinc player: paired with %s (%s)\n", cl.name.c_str(), cl.id.c_str());
  std::fflush(stdout);
}

// ---- a session: one request ----

void stopRunning(Player& p) { if (!p.current.empty() && p.stop) p.stop(); }

// A program asked to replace the one running: the end of the old one is not written in the logs (the new run's log starts empty, and the
// "[exited n]" line that ends a follower in Atelier belongs to the new run).
void replaceRunning(Player& p) { if (!p.current.empty()) { p.replaced = true; stopRunning(p); } }

// The members of the program that `dir` holds start; the answer is its run number.
long long startApp(Player& p, const std::string& app, const std::string& dir, const std::vector<std::string>& args, const Env& env) {
  makeDirs(p.home + "/logs");
  spill(logFile(p, app), "");   // the log of this run (ponytail: one run kept; the agent keeps 4 MiB of them)
  const long long pid = ++p.runs;
  if (p.run) p.run(app, dir, args, env, pid);
  return pid;
}

void session(Player& p, int fd) {
  auto c = std::make_unique<Chan>();
  c->fd = fd;
  sendLine(fd, "ZNA1 ok");
  const std::vector<Client> clients = loadClients(p);
  std::string err;
  if (!openPskServer(*c, [&](const std::string& id) { for (const Client& cl : clients) if (cl.id == id) return cl.key; return std::string(); }, err) ||
      !handshake(*c, 10000, err)) return;
  const std::string who = peerIdentity(*c);
  char type;
  std::string payload;
  if (!recv(*c, type, payload, 10000)) return;   // the request follows the handshake at once
  if (type != kJson || payload.size() > kMaxRequest) { refuse(*c, "not a request"); return; }
  const Doc req(payload);
  const std::string op = req.str("op"), name = req.str("name");
  if (!req.ok() || op.empty()) { refuse(*c, "not a request"); return; }
  const bool named = !name.empty() && name == cleanName(name);
  if (op == "info") send(*c, kJson, infoJson(p));
  else if (op == "top") {
    if (send(*c, kJson, infoJson(p))) p.followers.push_back({std::move(c), Player::Follower::Top, "", 0, now() + 1});
  } else if (op == "apps") send(*c, kJson, Obj().flag("ok", true).raw("apps", appsJson(p)).done());
  else if (op == "install") {
    std::string app = name.empty() ? req.str("base") : name;
    if (app.size() > 5 && app.compare(app.size() - 5, 5, ".zapp") == 0) app.resize(app.size() - 5);
    if (app.empty() || app != cleanName(app)) { refuse(*c, "bad app name"); return; }
    if (!req.str("sig").empty()) { refuse(*c, "a player does not take signed apps yet: deploy it unsigned"); return; }
    if (!send(*c, kJson, Obj().flag("ok", true).done())) return;
    if (app == p.current) replaceRunning(p);
    const std::string dir = appDir(p, app);
    removeTree(dir);
    makeDirs(dir);
    std::uint64_t files = 0, bytes = 0;
    if (!recvFiles(*c, dir, files, bytes, err)) { refuse(*c, err); return; }
    if (!isFile(dir + "/program.zbc")) { removeTree(dir); refuse(*c, "no program.zbc in what was sent: a player runs the bytecode zinc pack makes"); return; }
    send(*c, kJson, Obj().flag("ok", true).str("name", app).num("files", static_cast<long long>(files)).num("bytes", static_cast<long long>(bytes)).done());
  } else if (op == "run") {
    if (!named) { refuse(*c, "bad app name"); return; }
    if (!isFile(appDir(p, name) + "/program.zbc")) { refuse(*c, "no app named " + name + " on this player"); return; }
    replaceRunning(p);
    const long long pid = startApp(p, name, appDir(p, name), req.strs("args"), req.pairs("env"));
    send(*c, kJson, Obj().flag("ok", true).num("pid", pid).done());
  } else if (op == "stop") {
    const bool mine = named && name == p.current && (req.num("pid") == 0 || req.num("pid") == p.pid);
    if (mine) stopRunning(p);
    send(*c, kJson, Obj().flag("ok", true).flag("stopped", mine).done());
  } else if (op == "uninstall") {
    if (!named || !isDir(appDir(p, name))) { refuse(*c, "no app named " + name + " on this player"); return; }
    if (name == p.current) stopRunning(p);
    removeTree(appDir(p, name));
    std::remove(logFile(p, name).c_str());
    send(*c, kJson, Obj().flag("ok", true).done());
  } else if (op == "logs") {
    std::string text;
    if (!named || !slurp(logFile(p, name), text)) { refuse(*c, "no log for " + name + " on this player"); return; }
    if (!send(*c, kJson, Obj().flag("ok", true).done()) || !sendBytes(*c, text)) return;
    const bool until = req.flag("untilExit");
    if (!req.flag("follow") || (until && req.num("pid") <= p.ended)) { send(*c, kExit, "0"); return; }
    p.followers.push_back({std::move(c), Player::Follower::Logs, name, until ? req.num("pid") : 0, 0});
  } else if (op == "screen" || op == "shot") {
    std::string png;
    if (!p.shot || !p.shot(png) || png.empty()) { refuse(*c, "nothing on the player's screen to capture yet"); return; }
    if (send(*c, kJson, Obj().flag("ok", true).str("format", "png").num("bytes", static_cast<long long>(png.size())).done()) && sendBytes(*c, png)) send(*c, kExit, "0");
  } else if (op == "dev") {
    if (req.str("engine") != p.engine) {
      refuse(*c, "this player runs zinc " + p.engine + " and the workstation zinc " + req.str("engine") + ": install the player of this zinc on the console (tools/build-console-core <console> --player)");
      return;
    }
    removeTree(p.home + "/dev");
    makeDirs(p.home + "/dev");
    if (send(*c, kJson, Obj().flag("ok", true).done())) p.followers.push_back({std::move(c), Player::Follower::Dev, "", 0, 0});
  } else if (op == "unpair") {
    std::vector<Client> all = loadClients(p);
    all.erase(std::remove_if(all.begin(), all.end(), [&](const Client& cl) { return cl.id == who; }), all.end());
    saveClients(p, all);
    send(*c, kJson, Obj().flag("ok", true).done());
  } else if (op == "shell") refuse(*c, p.name + " is a player: no shell");
  else if (op == "push" || op == "pull") refuse(*c, p.name + " is a player: no files but its apps (zinc device deploy)");
  else if (op == "connect" || op == "listen" || op == "accepted") refuse(*c, p.name + " is a player: no forwarded ports");
  else if (op == "update") refuse(*c, p.name + " is a player: install its new version on the console (tools/build-console-core <console> --player)");
  else refuse(*c, "this player does not know '" + op + "' (zinc " + p.engine + ")");
}

// A dev session's message: {"start": true, "files", "remove", "args"}, the members, then the program restarted from <home>/dev.
bool devMessage(Player& p, Player::Follower& f, const std::string& payload) {
  const Doc m(payload);
  if (!m.flag("start")) return true;
  const std::string dir = p.home + "/dev";
  for (const std::string& n : m.strs("remove")) if (safeRel(n)) std::remove((dir + "/" + n).c_str());
  std::uint64_t files = 0, bytes = 0;
  std::string err;
  if (m.flag("files") && !recvFiles(*f.c, dir, files, bytes, err)) return refuse(*f.c, err);
  replaceRunning(p);
  const long long pid = startApp(p, "dev", dir, m.strs("args"), {});
  f.pid = pid;
  return send(*f.c, kJson, Obj().flag("ok", true).num("pid", pid).num("files", static_cast<long long>(files)).num("bytes", static_cast<long long>(bytes)).done());
}

}  // namespace

bool playerPairing(Player& p) {
  if (!p.code.empty() && p.codeUntil < now() && p.fixedCode.empty()) playerNewCode(p);   // an unused code is renewed on the screen
  return !p.code.empty() && !p.closed;
}

void playerNewCode(Player& p) {
  p.tries = 0;
  p.closed = false;
  p.codeUntil = now() + 300;
  if (!p.fixedCode.empty()) { p.code = p.fixedCode; return; }
  const std::string r = randomBytes(4);
  std::uint32_t v = 0;
  std::memcpy(&v, r.data(), r.size() < 4 ? r.size() : 4);
  char code[8];
  std::snprintf(code, sizeof code, "%06u", static_cast<unsigned>(v % 1000000u));
  p.code = r.size() == 4 ? code : "";
}

void playerForget(Player& p) { std::remove((agentDir(p) + "/clients.json").c_str()); playerNewCode(p); }

bool playerOpen(Player& p, std::string& err) {
  makeDirs(agentDir(p));
  makeDirs(p.home + "/apps");
  std::string text;
  if (slurp(agentDir(p) + "/agent.json", text)) { const Doc d(text); p.id = d.str("id"); if (p.name.empty()) p.name = d.str("name"); }
  if (p.id.size() != 16) p.id = hex(randomBytes(8));
  if (p.id.size() != 16) { err = "no random numbers (the console's entropy did not start)"; return false; }
  if (p.name.empty()) p.name = cleanName(p.os + "-" + p.id.substr(12));
  spill(agentDir(p) + "/agent.json", Obj().str("id", p.id).str("name", p.name).done() + "\n");
  if (loadClients(p).empty() || !p.fixedCode.empty()) playerNewCode(p);   // no workstation yet: the screen shows a code at once
  p.lfd = ::socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<std::uint16_t>(p.port));
  addr.sin_addr.s_addr = inet_addr(p.bind.c_str());
  int one = 1;
  ::setsockopt(p.lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  socklen_t n = sizeof addr;
  if (p.lfd < 0 || ::bind(p.lfd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) != 0 || ::listen(p.lfd, 4) != 0 ||
      ::getsockname(p.lfd, reinterpret_cast<sockaddr*>(&addr), &n) != 0) {
    err = "cannot listen on port " + std::to_string(p.port) + ": " + std::strerror(errno);
    if (p.lfd >= 0) ::close(p.lfd);
    p.lfd = -1;
    return false;
  }
  p.port = ntohs(addr.sin_port);
  zn::plat::sockNonBlock(p.lfd);
  return true;
}

void playerPoll(Player& p) {
  if (p.lfd < 0) return;
  pollfd l{p.lfd, POLLIN, 0};
  if (::poll(&l, 1, 0) > 0) {
    const int fd = ::accept(p.lfd, nullptr, nullptr);
    if (fd >= 0) {
      prepare(fd);
      std::string line;
      if (!recvLine(fd, line, 5000)) ::close(fd);
      else if (line == "ZNA1 pair") pairConnection(p, fd);   // the Chan closes fd
      else if (line == "ZNA1 sess") session(p, fd);
      else ::close(fd);
    }
  }
  // the sessions that last: the workstation may have left, a dev session sends its starts, top its samples
  for (std::size_t i = 0; i < p.followers.size();) {
    Player::Follower& f = p.followers[i];
    pollfd pf{f.c->fd, POLLIN, 0};
    bool open = true;
    if (::poll(&pf, 1, 0) > 0) open = fill(*f.c);
    char type;
    std::string payload;
    bool bad = false;
    while (open && next(*f.c, type, payload, &bad))
      if (f.kind == Player::Follower::Dev && type == kJson) open = devMessage(p, f, payload);   // ponytail: asset `I` frames are dropped (no dev socket in a core yet)
    if (bad) open = false;
    if (open && f.kind == Player::Follower::Top && now() >= f.next) { open = send(*f.c, kJson, infoJson(p)); f.next = now() + 1; }
    if (!open) {
      if ((f.kind == Player::Follower::Dev || f.kind == Player::Follower::Logs) && f.pid && f.pid == p.pid) stopRunning(p);   // the session ended: so does its program
      p.followers.erase(p.followers.begin() + static_cast<std::ptrdiff_t>(i));
      continue;
    }
    ++i;
  }
}

void playerStarted(Player& p, const std::string& app, long long pid) { p.current = app; p.pid = pid; p.replaced = false; }

void playerOutput(Player& p, std::string_view bytes) {
  if (p.current.empty() || bytes.empty()) return;
  if (p.replaced) {   // the old run's last lines: to its own sessions only
    for (Player::Follower& f : p.followers) if (f.pid == p.pid) send(*f.c, kOut, bytes);
    return;
  }
  const std::string log = logFile(p, p.current);
  struct stat st{};
  if (::stat(log.c_str(), &st) == 0 && st.st_size > kLogMax) {   // its end kept
    std::string text;
    if (slurp(log, text)) spill(log, std::string_view(text).substr(text.size() - kLogMax / 2));
  }
  spill(log, bytes, true);
  for (Player::Follower& f : p.followers)
    if ((f.kind == Player::Follower::Logs && f.app == p.current) || (f.kind == Player::Follower::Dev && f.pid == p.pid)) send(*f.c, kOut, bytes);
}

void playerExited(Player& p, int status) {
  if (p.current.empty()) return;
  playerOutput(p, "[exited " + std::to_string(status) + "]\n");
  p.ended = p.pid;
  for (std::size_t i = 0; i < p.followers.size();) {
    Player::Follower& f = p.followers[i];
    if (f.kind == Player::Follower::Dev && f.pid == p.pid) send(*f.c, kExit, std::to_string(status));
    if (f.kind == Player::Follower::Logs && f.app == p.current && f.pid == p.pid) {   // run -f and deploy follow one run
      send(*f.c, kExit, std::to_string(status));
      p.followers.erase(p.followers.begin() + static_cast<std::ptrdiff_t>(i));
      continue;
    }
    ++i;
  }
  p.current.clear();
  p.replaced = false;
}

}  // namespace zn::agent
