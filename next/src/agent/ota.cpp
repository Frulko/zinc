// The agent as a service, and updates over the air (ZN-729.04). `zinc agent install` writes the launchd agent or the systemd user unit that
// starts the daemon with the machine. An app whose zinc.json has update.publicKey is replaced only by a .zapp signed with that key and of
// a higher version: pushed with its detached signature (zinc sign), or fetched from its channel, whose manifest is signed (zinc publish).
// The version it replaces stays beside it as previous.zapp while the new one is on trial (the file `trial`): started and gone at once with
// an error, the previous version comes back. No cryptography here: zn::tc checks the signatures (Ed25519, monocypher) and the SHA-256.
#include "../frontend/project.h"
#include "../tc/tc.h"
#include "../zapp.h"
#include "wire.h"

#include <fcntl.h>
#include <pwd.h>
#include <signal.h>
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>

#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <map>
#include <thread>

extern char** environ;

namespace zn::agent {

namespace fs = std::filesystem;

namespace {

// ---- what an app says of its updates ----

struct App { std::string key, url, channel, version; };

App appOf(const std::string& zincJson) {
  zn::frontend::Project p;
  std::string err;
  if (!zn::frontend::parseProject(zincJson, p, err)) return {};
  return {p.updateKey, p.updateUrl, p.updateChannel, p.app.version.empty() ? "0.0.0" : p.app.version};
}

// ponytail: the installed archive is read whole for its zinc.json; keep the four fields beside it when apps reach hundreds of megabytes
App installed(const std::string& dir) {
  std::string archive, err;
  std::map<std::string, std::string> members;
  if (!readFile(dir + "/app.zapp", archive) || !zn::zapp::untar(archive, members, err)) return {};
  return appOf(members["zinc.json"]);
}

// The version to come back to goes with the new one in `fresh` (`dest` itself for an update in place), which is then on trial: the installed
// archive, or the one it was itself on trial against when it never started (it is not known to work). A second name, never a copy.
std::error_code keepPrevious(const std::string& dest, const std::string& fresh, const std::string& version) {
  std::string was;
  std::error_code ec;
  const bool pending = readFile(dest + "/trial", was) && fs::exists(dest + "/previous.zapp", ec);
  ec.clear();
  if (!(pending && dest == fresh)) {
    fs::remove(fresh + "/previous.zapp", ec);
    fs::create_hard_link(dest + (pending ? "/previous.zapp" : "/app.zapp"), fresh + "/previous.zapp", ec);
  }
  if (!ec) writePrivate(fresh + "/trial", pending ? was : version + "\n");
  return ec;
}

std::string no(const std::string& why) { return Obj().flag("ok", false).str("error", why).done(); }
std::string yes(const std::string& text) { return Obj().flag("ok", true).str("text", text).done(); }

// ---- the service ----

// `quiet`: its output is dropped (a command that may fail for a reason nobody needs to read).
int runCommand(const std::vector<std::string>& argv, bool quiet = false) {
  std::vector<char*> p;
  for (const std::string& a : argv) p.push_back(const_cast<char*>(a.c_str()));
  p.push_back(nullptr);
  pid_t pid = 0;
  int status = 0;
  posix_spawn_file_actions_t files;
  ::posix_spawn_file_actions_init(&files);
  if (quiet) for (const int fd : {1, 2}) ::posix_spawn_file_actions_addopen(&files, fd, "/dev/null", O_WRONLY, 0);
  const int failed = ::posix_spawnp(&pid, p[0], &files, nullptr, p.data(), environ);
  ::posix_spawn_file_actions_destroy(&files);
  if (failed != 0) return 127;
  while (::waitpid(pid, &status, 0) < 0 && errno == EINTR) {}
  return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}

std::string xml(const std::string& s) {
  std::string r;
  for (const char c : s) r += c == '&' ? "&amp;" : c == '<' ? "&lt;" : c == '>' ? "&gt;" : std::string(1, c);
  return r;
}

// One word of a systemd unit, quoted, with what systemd would expand doubled: % everywhere, $ in a command line (`exec`) only.
std::string unitWord(const std::string& s, bool exec) {
  std::string r = "\"";
  for (const char c : s) r += c == '"' || c == '\\' ? std::string("\\") + c : c == '$' && exec ? "$$" : c == '%' ? "%%" : std::string(1, c);
  return r + "\"";
}

// An address curl is given: never something it would read as an option.
bool address(const std::string& url) { return url.find("://") != std::string::npos && url[0] != '-'; }

struct Service { std::string path, text; std::vector<std::vector<std::string>> then; std::string said; };

// The file that starts `argv` with the machine and the commands that load it (`install`) or unload it. As the user, never as root: on
// macOS a launchd agent of the user's session (at login; the apps it starts can open windows), on Linux a unit of the user's systemd with
// lingering turned on (at boot, before anyone logs in).
Service service(const std::string& os, bool install, const std::vector<std::string>& argv) {
  Service s;
  const char* h = std::getenv("HOME");
  const std::string home = h ? h : "", zincHome = std::getenv("ZINC_HOME") ? std::getenv("ZINC_HOME") : "";
  const passwd* pw = ::getpwuid(::getuid());
  const std::string user = pw ? pw->pw_name : "";
  if (os == "macos") {
    const std::string label = "dev.zinc.agent", domain = "gui/" + std::to_string(::getuid());
    s.path = home + "/Library/LaunchAgents/" + label + ".plist";
    s.text = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n"
             "<plist version=\"1.0\">\n<dict>\n  <key>Label</key><string>" + label + "</string>\n  <key>ProgramArguments</key>\n  <array>\n";
    for (const std::string& a : argv) s.text += "    <string>" + xml(a) + "</string>\n";
    s.text += "  </array>\n";
    if (!zincHome.empty()) s.text += "  <key>EnvironmentVariables</key><dict><key>ZINC_HOME</key><string>" + xml(zincHome) + "</string></dict>\n";
    // the log goes where the agent bounds the logs of its apps (a name no app can have)
    const std::string log = xml(zn::tc::home() + "/agent/logs/.agent.log");
    s.text += "  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n  <key>StandardOutPath</key><string>" + log + "</string>\n  <key>StandardErrorPath</key><string>" + log + "</string>\n</dict>\n</plist>\n";
    s.then.push_back({"launchctl", "bootout", domain + "/" + label});   // an older one, when there is one
    if (install) s.then.push_back({"launchctl", "bootstrap", domain, s.path});
    s.said = "the agent starts at each login of " + user + " (launchd agent " + label + ")";
  } else {
    const char* x = std::getenv("XDG_CONFIG_HOME");
    s.path = (x && *x ? std::string(x) : home + "/.config") + "/systemd/user/zinc-agent.service";
    s.text = "[Unit]\nDescription=Zinc device agent\n\n[Service]\nExecStart=";
    for (const std::string& a : argv) s.text += unitWord(a, true) + (&a == &argv.back() ? "\n" : " ");
    if (!zincHome.empty()) s.text += "Environment=" + unitWord("ZINC_HOME=" + zincHome, false) + "\n";
    // KillMode=process: the apps the agent started outlive it, as they do without systemd (the default ends the whole control group)
    s.text += "Restart=always\nRestartSec=5\nKillMode=process\n\n[Install]\nWantedBy=default.target\n";
    if (install) s.then = {{"systemctl", "--user", "daemon-reload"}, {"systemctl", "--user", "enable", "--now", "zinc-agent.service"}, {"loginctl", "enable-linger", user}};   // lingering: the user's units start at boot
    else s.then = {{"systemctl", "--user", "disable", "--now", "zinc-agent.service"}};
    s.said = "the agent starts when the machine boots, as " + user + " (systemd user unit zinc-agent.service, lingering on)";
  }
  return s;
}

}  // namespace

int serviceCommand(const std::vector<std::string>& args, const std::string& self) {
  const bool install = args[0] == "install";
#ifdef __APPLE__
  const std::string here = "macos";
#else
  const std::string here = "linux";
#endif
  std::string os = here;
  bool print = false;
  std::vector<std::string> argv = {self, "agent"};
  for (size_t i = 1; i < args.size(); ++i) {
    const std::string& a = args[i];
    const bool more = i + 1 < args.size();
    if (a == "--print") print = true;
    else if (a == "--os" && more) os = args[++i];
    else if (install && (a == "--port" || a == "--bind" || a == "--name") && more) { argv.push_back(a); argv.push_back(args[++i]); }
    else if (install && (a == "--no-shell" || a == "--no-mdns")) argv.push_back(a);
    else { std::fprintf(stderr, "usage: zinc agent install [--print] [--os macos|linux] [--port n] [--bind address] [--name name] [--no-shell] [--no-mdns]\n       zinc agent uninstall [--print]\n"); return 2; }
  }
  if ((os != "macos" && os != "linux") || (os != here && !print)) { std::fprintf(stderr, "zinc agent %s: --os is macos or linux, and another system's file can only be printed (--print)\n", args[0].c_str()); return 2; }
  const Service s = service(os, install, argv);
  if (print) {   // what would be written and run; nothing is touched
    std::printf("# %s %s\n%s", install ? "writes" : "removes", s.path.c_str(), install ? s.text.c_str() : "");
    for (const auto& cmd : s.then) { std::printf("# then:"); for (const std::string& w : cmd) std::printf(" %s", w.c_str()); std::printf("\n"); }
    return 0;
  }
  if (::geteuid() == 0) { std::fprintf(stderr, "zinc agent %s: not as root: run it as the user the apps belong to\n", args[0].c_str()); return 2; }
  std::error_code ec;
  if (!install) {
    for (const auto& cmd : s.then) runCommand(cmd, true);   // not loaded: nothing to say
    fs::remove(s.path, ec);
    if (os == "linux") runCommand({"systemctl", "--user", "daemon-reload"});
    std::printf("removed %s: the agent no longer starts with the machine\n", s.path.c_str());
    return 0;
  }
  fs::create_directories(fs::path(s.path).parent_path(), ec);
  fs::create_directories(zn::tc::home() + "/agent/logs", ec);
  if (std::FILE* f = std::fopen(s.path.c_str(), "w")) { std::fputs(s.text.c_str(), f); std::fclose(f); }
  else { std::fprintf(stderr, "zinc agent install: cannot write %s: %s\n", s.path.c_str(), std::strerror(errno)); return 1; }
  for (const auto& cmd : s.then) {
    const int rc = runCommand(cmd, cmd[1] == "bootout");
    if (rc == 0 || cmd[1] == "bootout") continue;   // nothing to unload the first time
    if (cmd[0] == "loginctl") { std::fprintf(stderr, "zinc agent install: lingering could not be turned on: the agent starts at login only, until: sudo loginctl enable-linger %s\n", cmd.back().c_str()); continue; }
    std::fprintf(stderr, "zinc agent install: %s %s failed (%d); the file is %s\n", cmd[0].c_str(), cmd[1].c_str(), rc, s.path.c_str());
    return 1;
  }
  std::printf("%s\n%s\nzinc agent pair gives the code a workstation pairs with; zinc agent uninstall removes the service\n", s.path.c_str(), s.said.c_str());
  return 0;
}

// ---- signed updates ----

bool otaAdmit(const std::string& dest, const std::string& fresh, const std::string& sigHex, std::string& err) {
  const App old = installed(dest);
  if (old.key.empty()) return true;   // no key: replaced by whoever is paired, as before
  const std::string name = fs::path(dest).filename().string();
  std::string archive, why;
  std::map<std::string, std::string> members;
  if (!readFile(fresh + "/app.zapp", archive)) { err = name + " is a signed app (update.publicKey): only a .zapp signed with its key replaces it, not a directory"; return false; }
  if (sigHex.empty()) { err = name + " is a signed app (update.publicKey): this .zapp is unsigned, refused (zinc sign <app.zapp> <seed> writes the .sig that install sends with it)"; return false; }
  if (!zn::tc::verifyBytes(archive, sigHex, old.key)) { err = "the signature does not verify with the key of " + name + " (" + old.key.substr(0, 16) + "...): refused, nothing was installed"; return false; }
  const App now = zn::zapp::untar(archive, members, why) ? appOf(members["zinc.json"]) : App{};
  if (!zn::tc::newerVersion(now.version, old.version)) { err = name + " " + old.version + " is installed: " + (now.version.empty() ? "an unreadable version" : now.version) + " is not newer, refused"; return false; }
  if (const std::error_code ec = keepPrevious(dest, fresh, old.version)) { err = "cannot keep the previous version: " + ec.message(); return false; }
  return true;
}

bool otaRolledBack(const std::string& home, const std::string& name, long pid, std::string& why) {
  const std::string dir = home + "/apps/" + name, pidFile = home + "/run/" + name + ".pid";
  std::string was, text, log;
  if (!readFile(dir + "/trial", was)) return false;   // not an update on trial
  while (!was.empty() && was.back() == '\n') was.pop_back();
  // The time an update must hold. A slow board may need more to reach its first frame than the 5 s the engine's own trial uses (ZN-324.02).
  const char* knob = std::getenv("ZINC_AGENT_TRIAL_MS");
  const int window = knob && std::atoi(knob) > 0 ? std::atoi(knob) : 5000;
  int waited = 0;
  for (; waited < window && readFile(pidFile, text) && std::atol(text.c_str()) == pid; waited += 50) std::this_thread::sleep_for(std::chrono::milliseconds(50));
  int status = 0;
  if (waited < window) {   // it ended: its status is the line the agent wrote at the end of its log, before it removed the pid file
    readFile(home + "/logs/" + name + ".log", log);
    const size_t at = log.rfind("[exited ");
    status = at == std::string::npos ? -1 : std::atoi(log.c_str() + at + 8);
  }
  if (status == -1 || status == 128 + SIGTERM || status == 128 + SIGKILL) return false;   // stopped by someone: on trial again at its next start
  std::error_code ec;
  fs::remove(dir + "/trial", ec);
  if (status == 0) { fs::remove(dir + "/previous.zapp", ec); return false; }   // it holds, or it did its work and left
  fs::rename(dir + "/previous.zapp", dir + "/app.zapp", ec);
  if (ec) return false;   // no previous version to come back to
  why = "the update of " + name + " exited at once (status " + std::to_string(status) + "): it was rolled back, version " + was + " is back and started. What the update printed:\n" +
        log.substr(log.size() > 800 ? log.size() - 800 : 0);
  return true;
}

std::string otaUpdate(const std::string& home, const std::string& engine, const std::string& name, const std::string& urlArg) {
  zn::tc::UpdateInfo info;
  std::string err, path;
  if (name.empty()) {   // the engine: what `zinc update` does, with the keys this device trusts
    const char* env = std::getenv("ZINC_UPDATE_URL");
    const std::string url = !urlArg.empty() ? urlArg : env ? env : "";
    if (!address(url)) return no("no channel for the engine: zinc device update --url <manifest-url>, or ZINC_UPDATE_URL on the device");
    if (!zn::tc::fetchManifest(url, info, err)) return no(err);
    if (!zn::tc::newerVersion(info.version, engine)) return yes("zinc " + engine + " is up to date (latest " + info.version + ")");
    if (!zn::tc::downloadUpdate(info, zn::tc::home() + "/updates", path, err)) return no(err);
    // ponytail: verified and left there, as zinc update leaves it; replacing the running engine and restarting the agent is the package's step
    return yes("zinc " + info.version + " downloaded and verified on the device (it runs " + engine + "): " + path + "\ninstall it there, then restart the agent");
  }
  const std::string dir = home + "/apps/" + name;
  App old = name == cleanName(name) ? installed(dir) : App{};
  if (old.version.empty()) return no("no app named " + name + " was installed from a .zapp on this device");
  if (!urlArg.empty()) old.url = urlArg;
  if (old.key.empty() || !address(old.url)) return no(name + " has no channel: its zinc.json needs \"update\": { \"url\": ..., \"publicKey\": ... }");
  // the rule of zinc update-app: the address of a manifest, or of the directory that holds <channel>.manifest
  const bool isManifest = old.url.size() > 9 && old.url.compare(old.url.size() - 9, 9, ".manifest") == 0;
  if (!zn::tc::fetchManifest(isManifest ? old.url : old.url + (old.url.back() == '/' ? "" : "/") + old.channel + ".manifest", info, err, {old.key})) return no(err);
  if (!zn::tc::newerVersion(info.version, old.version))
    return zn::tc::newerVersion(old.version, info.version) ? no("refused: the " + old.channel + " channel offers " + info.version + ", older than " + old.version) : yes(name + " " + old.version + " is up to date");
  const std::string stage = home + "/apps/.incoming-" + hex(randomBytes(6));
  std::string archive;
  std::map<std::string, std::string> members;
  std::error_code ec;
  // the manifest is signed and names the archive's SHA-256, which downloadUpdate checks: the archive is the publisher's
  bool ok = zn::tc::downloadUpdate(info, stage, path, err) && readFile(path, archive) && zn::zapp::unpack(archive, engine, members, err);
  const App now = ok ? appOf(members["zinc.json"]) : App{};
  if (ok && !zn::tc::newerVersion(now.version, old.version)) { ok = false; err = "the archive of the channel is version " + now.version + ", not newer than " + old.version; }
  if (ok) {   // the running app keeps the files it opened; the new version is the one its next start runs
    ec = keepPrevious(dir, dir, old.version);
    if (!ec) fs::rename(path, dir + "/app.zapp", ec);
    if (ec) { ok = false; err = dir + ": " + ec.message(); }
  }
  fs::remove_all(stage, ec);
  if (!ok) return no(err.empty() ? "the update could not be read" : err);
  return yes(name + " " + now.version + " is installed (it was " + old.version + "): zinc device run " + name + " starts it; the previous version comes back if it exits at once");
}

}  // namespace zn::agent
