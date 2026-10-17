// npm packages for the web target: the package manager of a project and the commands that call it (cli_pm.h).
#include "cli_pm.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

#ifndef _WIN32
#include <sys/wait.h>
#endif

#include "yyjson.h"

namespace fs = std::filesystem;

namespace zn::cli {
namespace {

std::string readAll(const fs::path& p) { std::ifstream in(p, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
std::string q(const std::string& s) { std::string r = "'"; for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; } return r + "'"; }
int status(int rc) {
#ifdef _WIN32
  return rc;
#else
  return rc == -1 ? 1 : (WIFEXITED(rc) ? WEXITSTATUS(rc) : 1);
#endif
}

// the `packageManager` field ("pnpm@9.1.0+sha512.x") of the package.json in `dir`
std::string packageManagerField(const fs::path& dir) {
  const std::string t = readAll(dir / "package.json");
  yyjson_doc* doc = yyjson_read(t.data(), t.size(), 0);
  std::string v;
  if (doc) { yyjson_val* f = yyjson_obj_get(yyjson_doc_get_root(doc), "packageManager"); if (yyjson_is_str(f)) v = yyjson_get_str(f); yyjson_doc_free(doc); }
  return v;
}

struct Lock { const char* file; const char* manager; };
const Lock kLocks[] = {{"pnpm-lock.yaml", "pnpm"}, {"bun.lock", "bun"}, {"bun.lockb", "bun"}, {"yarn.lock", "yarn"}, {"package-lock.json", "npm"}, {"npm-shrinkwrap.json", "npm"}};

const char* installHint(const std::string& m) {
  if (m == "pnpm") return "corepack enable pnpm   (or: npm install -g pnpm, or https://pnpm.io/installation)";
  if (m == "yarn") return "corepack enable yarn   (or: npm install -g yarn, or https://yarnpkg.com/getting-started/install)";
  if (m == "bun") return "curl -fsSL https://bun.sh/install | bash   (https://bun.sh)";
  return "install Node.js, which brings npm: https://nodejs.org";
}

// Both preconditions of a manager run: the manager itself and (all but bun) Node. A message with the command to run when one is missing, "" when ready.
std::string missingTool(const PackageManager& pm) {
  if (findOnPath(pm.name).empty())
    return "error P0001: this project uses " + pm.name + " (" + pm.why + ") and it is not on this machine. Zinc never installs a package manager; run:\n  " + installHint(pm.name) +
           "\nthen run this command again (zinc explain P0001).";
  if (pm.name != "bun" && findOnPath("node").empty())
    return "error P0002: " + pm.name + " is a Node.js program and Node.js is not on this machine. Node is needed only to install npm packages (zinc run, dev and export need none); run:\n  " +
           installHint("npm") + "\nthen run this command again (zinc explain P0002).";
  return "";
}

std::string versionOf(const std::string& exe) {
  FILE* p = popen((q(exe) + " --version 2>/dev/null").c_str(), "r");
  if (!p) return "";
  char b[128] = {0};
  std::string v;
  if (std::fgets(b, sizeof b, p)) v = b;
  pclose(p);
  while (!v.empty() && (v.back() == '\n' || v.back() == '\r')) v.pop_back();
  return v;
}

// the folder whose package.json a command works on: `dir` or its nearest ancestor that has one ("" when none)
std::string packageDir(const std::string& dir) {
  for (fs::path d = fs::absolute(dir).lexically_normal(); !d.empty(); d = d.parent_path()) {
    std::error_code ec;
    if (fs::exists(d / "package.json", ec)) return d.string();
    if (d == d.root_path() || d == d.parent_path()) break;
  }
  return "";
}

int run(const PackageManager& pm, const std::string& verb, const std::vector<std::string>& pkgs, bool dev, bool frozen, bool offline) {
  // the verb of each manager: install everything / add / remove, the flags for a frozen lockfile and for a development dependency
  std::string v, flags;
  if (verb == "install") {
    v = "install";
    if (frozen) flags = pm.name == "npm" ? "" : pm.name == "yarn" && pm.berry ? " --immutable" : " --frozen-lockfile";
    if (frozen && pm.name == "npm") v = "ci";
    if (offline && (pm.name == "npm" || pm.name == "pnpm")) flags += " --offline";
  } else if (verb == "add") {
    v = pm.name == "npm" ? "install" : "add";
    if (dev) flags = " -D";
  } else v = pm.name == "npm" ? "uninstall" : "remove";
  std::string cmd = q(pm.name) + " " + v + flags;
  for (const std::string& p : pkgs) cmd += " " + q(p);
  std::fprintf(stderr, "zinc: %s (in %s; %s)\n", (pm.name + " " + v + flags + (pkgs.empty() ? "" : " " + pkgs[0] + (pkgs.size() > 1 ? " ..." : ""))).c_str(), pm.dir.c_str(), pm.why.c_str());
  return status(std::system(("cd " + q(pm.dir) + " && " + cmd).c_str()));
}

}  // namespace

std::string findOnPath(const std::string& exe) {
  const char* path = std::getenv("PATH");
  if (!path) return "";
#ifdef _WIN32
  const char sep = ';';
  const char* exts[] = {".exe", ".cmd", ".bat", ""};
#else
  const char sep = ':';
  const char* exts[] = {""};
#endif
  std::stringstream ss(path);
  std::string d;
  while (std::getline(ss, d, sep)) {
    if (d.empty()) continue;
    for (const char* e : exts) {
      std::error_code ec;
      const fs::path f = fs::path(d) / (exe + e);
      if (fs::is_regular_file(f, ec) && (fs::status(f, ec).permissions() & fs::perms::owner_exec) != fs::perms::none) return f.string();
    }
  }
  return "";
}

PackageManager detectPackageManager(const std::string& dir) {
  PackageManager pm;
  pm.dir = packageDir(dir);
  const fs::path start = pm.dir.empty() ? fs::absolute(dir).lexically_normal() : fs::path(pm.dir);
  std::string field;
  for (fs::path d = start; !d.empty(); d = d.parent_path()) {   // the nearest package.json that names a manager, the nearest lockfile
    std::error_code ec;
    if (field.empty() && fs::exists(d / "package.json", ec)) field = packageManagerField(d);
    if (pm.lockfile.empty()) for (const Lock& l : kLocks) if (fs::exists(d / l.file, ec)) { pm.lockfile = (d / l.file).string(); break; }
    if (d == d.root_path() || d == d.parent_path()) break;
  }
  if (!field.empty()) {
    pm.name = field.substr(0, field.find('@'));
    pm.why = "packageManager field of package.json: " + field.substr(0, field.find('+'));
    pm.berry = pm.name == "yarn" && field.size() > pm.name.size() + 1 && field[pm.name.size() + 1] >= '2';
  } else if (!pm.lockfile.empty()) {
    const std::string base = fs::path(pm.lockfile).filename().string();
    for (const Lock& l : kLocks) if (base == l.file) pm.name = l.manager;
    pm.why = base;
  } else {
    pm.name = "npm";
    pm.why = "no lockfile and no packageManager field: npm is the default";
  }
  if (pm.name != "npm" && pm.name != "pnpm" && pm.name != "yarn" && pm.name != "bun") { pm.why = "packageManager field names " + pm.name + ", which zinc does not drive: npm is used"; pm.name = "npm"; }
  if (pm.name == "yarn" && !pm.berry && !pm.lockfile.empty()) {   // a berry lockfile has a __metadata block; a project may also carry .yarnrc.yml
    std::error_code ec;
    pm.berry = fs::exists(fs::path(pm.lockfile).parent_path() / ".yarnrc.yml", ec) || readAll(pm.lockfile).find("__metadata:") != std::string::npos;
  }
  return pm;
}

std::string lockfileOf(const std::string& dir) { return detectPackageManager(dir).lockfile; }

bool isNpmCommand(const std::vector<std::string>& args) {
  for (std::size_t i = 2; i < args.size(); ++i) if (args[i].rfind("npm:", 0) == 0) return true;
  return false;
}

int npmAdd(const std::vector<std::string>& args, bool remove) {
  std::vector<std::string> pkgs;
  std::string dir = ".";
  bool dev = false;
  for (std::size_t i = 2; i < args.size(); ++i) {
    const std::string& a = args[i];
    if (a.rfind("npm:", 0) == 0 && a.size() > 4) pkgs.push_back(a.substr(4));
    else if (a == "-D" || a == "--dev") dev = true;
    else if (a[0] != '-') dir = a;
    else { std::fprintf(stderr, "zinc %s: unknown option %s\nusage: zinc %s npm:<package>[@version]... [-D] [dir]\n", remove ? "remove" : "add", a.c_str(), remove ? "remove" : "add"); return 2; }
  }
  if (pkgs.empty()) { std::fprintf(stderr, "zinc %s: no package (write npm:<name>, e.g. zinc add npm:zustand)\n", remove ? "remove" : "add"); return 2; }
  PackageManager pm = detectPackageManager(dir);
  if (pm.dir.empty()) {   // a Zinc project that has no package.json yet: a minimal one, the way `npm init -y` starts
    pm.dir = fs::absolute(dir).lexically_normal().string();
    std::ofstream(fs::path(pm.dir) / "package.json") << "{\n  \"name\": " << '"' << fs::path(pm.dir).filename().string() << '"' << ",\n  \"private\": true,\n  \"type\": \"module\"\n}\n";
    std::fprintf(stderr, "zinc: no package.json here: wrote a minimal one in %s\n", pm.dir.c_str());
  }
  if (const std::string miss = missingTool(pm); !miss.empty()) { std::fprintf(stderr, "zinc %s: %s\n", remove ? "remove" : "add", miss.c_str()); return 1; }
  return run(pm, remove ? "remove" : "add", pkgs, dev, false, false);
}

int npmInstall(const std::vector<std::string>& args) {
  std::string dir = ".";
  bool frozen = false, offline = false;
  for (std::size_t i = 2; i < args.size(); ++i) {
    if (args[i] == "--frozen") frozen = true;
    else if (args[i] == "--offline") offline = true;
    else if (args[i][0] != '-') dir = args[i];
  }
  std::error_code ec;
  if (!fs::exists(fs::path(dir) / "package.json", ec)) return -1;   // only a package.json in the project's own folder: a parent's belongs to a parent
  PackageManager pm = detectPackageManager(dir);
  if (const std::string miss = missingTool(pm); !miss.empty()) { std::fprintf(stderr, "zinc install: %s\n", miss.c_str()); return 1; }
  return run(pm, "install", {}, false, frozen, offline);
}

std::vector<std::pair<std::string, std::string>> packageManagersFound() {
  std::vector<std::pair<std::string, std::string>> out;
  for (const char* n : {"node", "npm", "pnpm", "yarn", "bun"}) {
    const std::string exe = findOnPath(n);
    out.push_back({n, exe.empty() ? "" : versionOf(exe) + " at " + exe});
  }
  return out;
}

std::string pmExplain(const std::string& code) {
  struct E { const char *code, *title, *why, *fix, *example; };
  static const E table[] = {
    {"P0001", "The package manager of the project is not on this machine",
     "`zinc add npm:<package>` and `zinc install` hand npm packages to the manager the project already uses, found from its package.json `packageManager` field or its lockfile (pnpm-lock.yaml, yarn.lock, "
     "package-lock.json, bun.lock) and, with neither, npm. Zinc does not install or ship a package manager, so a project whose manager is missing is told the command to run.",
     "Run the command the message prints (usually `corepack enable pnpm` or `npm install -g pnpm`), or change the project's manager by deleting its lockfile and the packageManager field.",
     "zinc add npm:zustand   # error P0001: this project uses pnpm (pnpm-lock.yaml) and it is not on this machine"},
    {"P0002", "Node.js is not on this machine",
     "npm, pnpm and yarn are Node.js programs, so adding or installing npm packages needs Node. Running, building and exporting an app that already has its node_modules does not: the engine reads the packages "
     "itself and links them with its own pinned esbuild. bun brings its own runtime.",
     "Install Node.js (https://nodejs.org) or use bun, then run the command again.",
     "zinc install   # error P0002: npm is a Node.js program and Node.js is not on this machine"},
  };
  for (const E& e : table)
    if (code == e.code) return std::string(e.code) + ": " + e.title + "\n\nWhy: " + e.why + "\nFix: " + e.fix + "\n\nExample:\n" + e.example + "\n";
  return "";
}

}  // namespace zn::cli
