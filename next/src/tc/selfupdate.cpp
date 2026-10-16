// zinc updates itself (docs/guide/07-distribution.md, "Updating zinc"): the engine directory install.sh made (~/.zinc/engine, marked by .zinc-install)
// is replaced by the CLI archive of the release channel, verified (the manifest's Ed25519 signature, the archive's SHA-256), unpacked beside it on the
// same filesystem and swapped in whole: the running zinc keeps its files (they move to engine.prev), the `zinc` link points at engine/bin/zinc.
// The version and the release key are build constants (CMakeLists.txt: ZN_VERSION, ZN_UPDATE_PUBKEY from next/update.pub); only this file sees them.
#include "tc/tc.h"

#include <unistd.h>

#include "platform/platform.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>

// the build defines them (-DZN_VERSION, -DZN_UPDATE_PUBKEY); constants here, not macros of ours (tests/t0/shared_headers)
#ifdef ZN_VERSION
static const char* const kBuildVersion = ZN_VERSION;
#else
static const char* const kBuildVersion = "0.0.0-dev";
#endif
#ifdef ZN_UPDATE_PUBKEY
static const char* const kBuildReleaseKey = ZN_UPDATE_PUBKEY;
#else
static const char* const kBuildReleaseKey = "";
#endif

namespace fs = std::filesystem;

namespace zn::tc {

const char* version() { return kBuildVersion; }
const char* releaseKey() { return kBuildReleaseKey; }

namespace {
const char* const kMarker = ".zinc-install";   // written by install.sh: url=<where it installed from>, channel=<stable|beta>
const char* const kRepo = "zinc-engine/zinc";

bool envOn(const char* name) { const char* v = std::getenv(name); return v && *v && std::strcmp(v, "0") != 0; }
std::string repo() { const char* r = std::getenv("ZINC_UPDATE_REPO"); return r && *r ? r : kRepo; }
std::string releases() { return "https://github.com/" + repo() + "/releases/latest"; }
std::string sh(const std::string& s) { std::string r = "'"; for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; } return r + "'"; }

struct Install {
  fs::path engine;                          // <engine>: bin/zinc is the running binary
  std::map<std::string, std::string> conf;  // the marker's lines
  std::string why;                          // not empty: this zinc does not update itself, and what to do instead
};
Install installOf() {
  Install in;
  const std::string exe = executablePath();
  if (exe.empty()) { in.why = "cannot find the running zinc"; return in; }
  in.engine = fs::path(exe).parent_path().parent_path();
  const std::size_t app = exe.find(".app/Contents/MacOS/");
  std::error_code ec;
  if (app != std::string::npos)
    in.why = "this zinc is the one inside " + exe.substr(0, app + 4) + ": download the new Zinc-Atelier-<version>-macos-<arch>.zip from " + releases() +
             " and put it in place of the app (the zinc CLI installed with install.sh updates itself with zinc update)";
  else if (!fs::exists(in.engine / kMarker, ec))
    in.why = "this zinc was not installed by install.sh (it runs from " + in.engine.string() + "): update it the way it was installed (a source build: git pull, then "
             "tools/build zinc; a package manager: its upgrade command), or install the release with  curl -fsSL " + releases() + "/download/install.sh | sh";
  std::ifstream f(in.engine / kMarker);
  for (std::string l; std::getline(f, l);) if (const std::size_t eq = l.find('='); eq != std::string::npos) in.conf[l.substr(0, eq)] = l.substr(eq + 1);
  return in;
}
std::string channelOf(const Install& in) { auto c = in.conf.find("channel"); return c == in.conf.end() || c->second.empty() ? "stable" : c->second; }
/** The manifest of this machine's CLI archive on `channel`: the argument, $ZINC_UPDATE_URL, the latest release of $ZINC_UPDATE_REPO, where install.sh installed from, the official releases. */
std::string manifestUrl(const Install& in, const std::string& channel, const std::string& arg) {
  if (!arg.empty()) return arg;
  if (const char* u = std::getenv("ZINC_UPDATE_URL"); u && *u) return u;
  std::string base = releases() + "/download";
  if (const auto u = in.conf.find("url"); u != in.conf.end() && !u->second.empty() && !std::getenv("ZINC_UPDATE_REPO")) base = u->second;
  return base + "/zinc-" + zn::plat::osName() + "-" + zn::plat::machine() + (channel == "beta" ? "-beta" : "") + ".manifest";
}
bool haveKey() { return !trustedUpdateKeys().empty(); }

// ~/.zinc/update-check.json: when the last check ran and what it found (the daily notice reads it, zinc doctor and zinc update write it)
struct Cache { long long checked = 0; std::string latest; };
Cache readCache() {
  Cache c;
  std::ifstream f(home() + "/update-check.json");
  std::stringstream ss; ss << f.rdbuf();
  const std::string s = ss.str();
  if (const std::size_t k = s.find("\"checked\": "); k != std::string::npos) c.checked = std::atoll(s.c_str() + k + 11);
  if (const std::size_t k = s.find("\"latest\": \""); k != std::string::npos) c.latest = s.substr(k + 11, s.find('"', k + 11) - k - 11);
  return c;
}
void writeCache(const std::string& latest) {
  std::error_code ec;
  fs::create_directories(home(), ec);
  const std::string to = home() + "/update-check.json", tmp = to + "." + std::to_string(::getpid());
  { std::ofstream(tmp) << "{\"checked\": " << static_cast<long long>(std::time(nullptr)) << ", \"latest\": \"" << latest << "\"}\n"; }
  fs::rename(tmp, to, ec);
}
bool fetch(const std::string& url, UpdateInfo& info, std::string& err, double maxSeconds = 0) {
  return fetchManifest(url, info, err, trustedUpdateKeys(), envOn("ZINC_UPDATE_ALLOW_UNSIGNED"), maxSeconds);
}
/** The first line `cmd` prints, "" when it fails. */
std::string firstLine(const std::string& cmd) {
  FILE* p = ::popen((cmd + " 2>/dev/null").c_str(), "r");
  if (!p) return "";
  char buf[512] = {0};
  const bool got = std::fgets(buf, sizeof buf, p) != nullptr;
  if (::pclose(p) != 0 || !got) return "";
  std::string s = buf;
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();
  return s;
}
std::string versionIn(const fs::path& engine) {
  std::ifstream f(engine / "share" / "zinc" / "VERSION");   // tools/package writes it
  std::string v;
  std::getline(f, v);
  return v.empty() ? "the previous version" : "zinc " + v;
}
void saveConf(const Install& in, const fs::path& engine, const std::string& channel) {
  std::ofstream f(engine / kMarker);
  for (const auto& [k, v] : in.conf) if (k != "channel") f << k << "=" << v << "\n";
  f << "channel=" << channel << "\n";
}

int install(const Install& in, const UpdateInfo& info, const std::string& channel) {
  const fs::path engine = in.engine, parent = engine.parent_path(), stage = parent / (engine.filename().string() + ".incoming");
  const fs::path prev = parent / (engine.filename().string() + ".prev");
  if (::access(parent.string().c_str(), W_OK) != 0 || ::access(engine.string().c_str(), W_OK) != 0) {
    std::fprintf(stderr, "zinc update: cannot write %s: run the update as the user who installed zinc, or install again with  curl -fsSL %s/download/install.sh | sh\n", parent.string().c_str(), releases().c_str());
    return 1;
  }
  std::error_code ec;
  fs::remove_all(stage, ec);
  auto fail = [&](const std::string& why) { fs::remove_all(stage, ec); std::fprintf(stderr, "zinc update: %s; nothing was changed\n", why.c_str()); return 1; };
  std::string archive, err;
  if (!downloadUpdate(info, stage.string(), archive, err)) return fail(err);
  fs::create_directories(stage / "x", ec);
  if (std::system(("tar -xzf " + sh(archive) + " -C " + sh((stage / "x").string()) + " 2>/dev/null").c_str()) != 0) return fail("the archive " + fs::path(archive).filename().string() + " does not unpack");
  fs::path inner;
  int dirs = 0;
  for (const auto& e : fs::directory_iterator(stage / "x", ec)) if (e.is_directory()) { inner = e.path(); ++dirs; }
  if (dirs != 1 || ::access((inner / "bin" / "zinc").string().c_str(), X_OK) != 0) return fail("the archive holds no zinc program (one directory with bin/zinc)");
  const std::string says = firstLine(sh((inner / "bin" / "zinc").string()) + " --version");
  if (says.empty()) return fail("the new zinc does not start on this machine");
  if (says.find(info.version) == std::string::npos) return fail("the archive holds " + says + ", the manifest says " + info.version);
  saveConf(in, inner, channel);
  fs::remove_all(prev, ec);
  fs::rename(engine, prev, ec);   // the running zinc keeps its files: they move, they are not overwritten
  if (ec) return fail("cannot move " + engine.string() + " aside: " + ec.message());
  fs::rename(inner, engine, ec);
  if (ec) { std::error_code e2; fs::rename(prev, engine, e2); return fail("cannot put the new engine in place: " + ec.message()); }
  fs::remove_all(stage, ec);
  writeCache(info.version);
  if (!info.notes.empty()) std::printf("What changed: %s\n", info.notes.c_str());
  std::printf("zinc %s is installed in %s (zinc %s is kept in %s: zinc update --rollback goes back to it)\n", info.version.c_str(), engine.string().c_str(), version(), prev.string().c_str());
  return 0;
}

int rollback(const Install& in) {
  if (!in.why.empty()) { std::fprintf(stderr, "zinc update --rollback: %s\n", in.why.c_str()); return 1; }
  const fs::path engine = in.engine, parent = engine.parent_path(), prev = parent / (engine.filename().string() + ".prev"), aside = parent / (engine.filename().string() + ".rollback");
  if (::access((prev / "bin" / "zinc").string().c_str(), X_OK) != 0) { std::fprintf(stderr, "zinc update --rollback: no previous version in %s (one is kept by each zinc update)\n", prev.string().c_str()); return 1; }
  if (::access(parent.string().c_str(), W_OK) != 0) { std::fprintf(stderr, "zinc update --rollback: cannot write %s\n", parent.string().c_str()); return 1; }
  std::error_code ec;
  fs::remove_all(aside, ec);
  fs::rename(engine, aside, ec);
  if (ec) { std::fprintf(stderr, "zinc update --rollback: cannot move %s aside: %s\n", engine.string().c_str(), ec.message().c_str()); return 1; }
  fs::rename(prev, engine, ec);
  if (ec) { std::error_code e2; fs::rename(aside, engine, e2); std::fprintf(stderr, "zinc update --rollback: %s; nothing was changed\n", ec.message().c_str()); return 1; }
  fs::rename(aside, prev, ec);   // the two swap: --rollback again returns to the newer one
  writeCache("");
  std::printf("%s is back in %s (zinc %s is kept in %s)\n", versionIn(engine).c_str(), engine.string().c_str(), version(), prev.string().c_str());
  return 0;
}

/** The daily check, in a detached grandchild so no command waits for the network: `zinc update --notice-check`. */
void spawnCheck() { zn::plat::spawnDetached({executablePath(), "update", "--notice-check"}); }
bool checksOff() { return envOn("ZINC_NO_UPDATE_CHECK") || envOn("ZINC_CI") || envOn("CI"); }
}  // namespace

int updateCommand(const std::vector<std::string>& args) {
  bool check = false, back = false, notice = false;
  std::string channel, url;
  for (std::size_t k = 0; k < args.size(); ++k) {
    if (args[k] == "--check") check = true;
    else if (args[k] == "--rollback") back = true;
    else if (args[k] == "--notice-check") notice = true;
    else if (args[k] == "--channel" && k + 1 < args.size()) channel = args[++k];
    else if (args[k].rfind("--", 0) != 0 && url.empty()) url = args[k];
    else { std::fprintf(stderr, "usage: zinc update [--check] [--rollback] [--channel stable|beta] [manifest-url]\n"); return 2; }
  }
  if (!channel.empty() && channel != "stable" && channel != "beta") { std::fprintf(stderr, "zinc update: --channel is stable or beta\n"); return 2; }
  const Install in = installOf();
  if (back) return rollback(in);
  if (channel.empty()) channel = channelOf(in);
  UpdateInfo info;
  std::string err;
  if (notice) { if (fetch(manifestUrl(in, channel, ""), info, err, 1.5)) writeCache(info.version); return 0; }
  if (!haveKey() && !envOn("ZINC_UPDATE_ALLOW_UNSIGNED"))
    std::fprintf(stderr, "zinc update: this build has no update key (next/update.pub is the placeholder): signed updates cannot be checked, unsigned ones need ZINC_UPDATE_ALLOW_UNSIGNED=1\n");
  const std::string murl = manifestUrl(in, channel, url);
  if (!fetch(murl, info, err)) { std::fprintf(stderr, "zinc update: %s (%s)\n", err.c_str(), murl.c_str()); return 1; }
  writeCache(info.version);
  if (!newerVersion(info.version, version())) { std::printf("zinc %s is up to date (latest %s on %s)\n", version(), info.version.c_str(), channel.c_str()); return 0; }
  std::printf("zinc %s is available (this is %s)%s%s\n", info.version.c_str(), version(), info.notes.empty() ? "" : ": ", info.notes.c_str());
  std::fflush(stdout);   // before what the install prints on stderr
  if (check) return 10;   // an update exists
  if (!in.why.empty()) { std::fprintf(stderr, "zinc update: %s\n", in.why.c_str()); return 1; }
  return install(in, info, channel);
}

void updateNotice() {
  if (checksOff() || envOn("ZINC_HEADLESS") || envOn("ZINC_DETERMINISTIC") || !::isatty(2) || (std::getenv("ZINC_STEPS") && !std::strcmp(std::getenv("ZINC_STEPS"), "0"))) return;
  ::setenv("ZINC_NO_UPDATE_CHECK", "1", 1);   // the zincs this one starts (zinc dev's runs) stay silent
  if (!installOf().why.empty() || !haveKey()) return;   // a source build, an app bundle, a build without a release key: nothing to say
  const Cache c = readCache();
  if (!c.latest.empty() && newerVersion(c.latest, version())) {
    const bool colour = !std::getenv("NO_COLOR");
    std::fprintf(stderr, "%szinc %s is available: run zinc update%s\n", colour ? "\033[2m" : "", c.latest.c_str(), colour ? "\033[0m" : "");
  }
  if (std::time(nullptr) - c.checked >= 86400) { writeCache(c.latest); spawnCheck(); }   // the stamp first: one check a day, whatever runs meanwhile
}

std::string updateStatus() {
  const Install in = installOf();
  if (!in.why.empty() || !haveKey()) return "";
  if (checksOff()) return "?not checked (ZINC_NO_UPDATE_CHECK or CI)";
  Cache c = readCache();
  if (std::time(nullptr) - c.checked >= 86400 || c.latest.empty()) {
    UpdateInfo info;
    std::string err;
    if (!fetch(manifestUrl(in, channelOf(in), ""), info, err, 1.5)) return "?could not check (offline?)";
    writeCache(c.latest = info.version);
  }
  return newerVersion(c.latest, version()) ? c.latest : "up to date";
}

}  // namespace zn::tc
