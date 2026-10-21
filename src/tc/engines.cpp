#include "tc/engines.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <memory>
#include <sstream>

#include "platform/platform.h"
#include "tc/tc.h"
#include "tc/tuf.h"
#include "yyjson.h"
#include "zn/log.h"

namespace fs = std::filesystem;

namespace zn::tc::engines {
namespace {

fs::path root() { return fs::path(home()) / "engines"; }

std::string readText(const fs::path& p) { std::ifstream f(p, std::ios::binary); std::stringstream ss; ss << f.rdbuf(); return ss.str(); }

// The fields of a pack's "custom" object (the index's, or pack.json's copy of it)
bool parseCustom(yyjson_val* c, Pack& p) {
  if (!yyjson_is_obj(c)) return false;
  auto s = [&](const char* k) { yyjson_val* v = yyjson_obj_get(c, k); return yyjson_is_str(v) ? std::string(yyjson_get_str(v)) : std::string(); };
  auto n = [&](const char* k) { yyjson_val* v = yyjson_obj_get(c, k); return yyjson_is_int(v) ? static_cast<int>(yyjson_get_sint(v)) : 0; };
  p.kind = s("kind"); p.library = s("library"); p.upstream = s("upstream");
  p.abi = n("zn_engine_abi"); p.napi = n("napi");
  if (p.kind.empty()) p.kind = "engine";
  // the one file zinc opens: a plain name inside the pack, never a path out of it
  return !p.library.empty() && p.library.find('/') == std::string::npos && p.library.find('\\') == std::string::npos && p.library != "." && p.library != "..";
}

// engines/<name>/<version>/<host>.tar.xz of the top-level role (native code: never a delegated publisher's), for this machine
struct Offer { tuf::Target target; Pack pack; };
bool offers(const std::string& engineRoot, const std::string& name, std::vector<Offer>& out, std::unique_ptr<tuf::Client>& index, std::string& err) {
  if (!tuf::openIndex(engineRoot, index, err)) return false;
  std::vector<tuf::Target> all;
  if (!index->all(all, err)) return false;
  const std::string tail = "/" + hostName() + ".tar.xz";
  for (const tuf::Target& t : all) {
    if (t.role != "targets" || t.path.rfind("engines/", 0) != 0 || t.path.size() <= tail.size() || t.path.compare(t.path.size() - tail.size(), tail.size(), tail)) continue;
    const std::string mid = t.path.substr(8, t.path.size() - 8 - tail.size());   // <name>/<version>
    const std::size_t slash = mid.find('/');
    if (slash == std::string::npos || mid.find('/', slash + 1) != std::string::npos) continue;
    Offer o{t, {}};
    o.pack.name = mid.substr(0, slash); o.pack.version = mid.substr(slash + 1);
    if (!name.empty() && o.pack.name != name) continue;
    yyjson_doc* d = yyjson_read(t.custom.data(), t.custom.size(), 0);
    const bool ok = d && parseCustom(yyjson_doc_get_root(d), o.pack);
    yyjson_doc_free(d);
    if (ok) out.push_back(o);
  }
  std::sort(out.begin(), out.end(), [](const Offer& a, const Offer& b) { return a.pack.name != b.pack.name ? a.pack.name < b.pack.name : newerVersion(a.pack.version, b.pack.version); });
  return true;
}

bool prefixOf(const std::string& want, const std::string& version) {   // "15.6" matches 15.6.75.19, not 15.60
  return want.empty() || version == want || (version.rfind(want + ".", 0) == 0);
}

std::string mb(long long n) { char b[32]; std::snprintf(b, sizeof b, "%.1f MB", static_cast<double>(n) / 1e6); return b; }

bool installOffer(tuf::Client& index, const Offer& o, Pack& out, std::string& err) {
  const auto t0 = std::chrono::steady_clock::now();
  zn::log::step("engine", o.pack.name + " " + o.pack.version + ": downloading " + mb(o.target.length) + " from the signed index");
  std::string bytes;
  if (!index.download(o.target, bytes, err)) return false;   // its length and SHA-256 as the signed targets role says, else refused
  zn::log::step("engine", "checked: SHA-256 " + o.target.sha256.substr(0, 16) + "..., signed by the index's release role", zn::log::since(t0));
  std::error_code ec;
  const fs::path base = root() / o.pack.name, dest = base / o.pack.version, tmp = base / (".tmp-" + o.pack.version), archive = base / (".tmp-" + o.pack.version + ".tar.xz");
  fs::create_directories(base, ec);
  fs::remove_all(tmp, ec);
  fs::create_directories(tmp, ec);
  { std::ofstream f(archive, std::ios::binary); f << bytes; if (!f) { err = "cannot write " + archive.string(); return false; } }
  const int rc = zn::plat::run({"tar", "-xf", archive.string(), "-C", tmp.string()});
  fs::remove(archive, ec);
  if (rc != 0) { fs::remove_all(tmp, ec); err = "cannot unpack the " + o.pack.name + " pack (tar -xf, exit " + std::to_string(rc) + ")"; return false; }
  if (!fs::is_regular_file(tmp / o.pack.library, ec)) { fs::remove_all(tmp, ec); err = "the " + o.pack.name + " pack has no " + o.pack.library; return false; }
  {
    std::ofstream f(tmp / "pack.json");
    f << "{\"name\":\"" << o.pack.name << "\",\"version\":\"" << o.pack.version << "\",\"host\":\"" << hostName() << "\",\"sha256\":\"" << o.target.sha256
      << "\",\"custom\":" << (o.target.custom.empty() ? "{}" : o.target.custom) << "}\n";
  }
  fs::remove_all(dest, ec);
  fs::rename(tmp, dest, ec);
  if (ec) { fs::remove_all(tmp, ec); err = "cannot move the pack into " + dest.string() + ": " + ec.message(); return false; }
  out = o.pack;
  out.dir = dest.string();
  zn::log::step("engine", o.pack.name + " " + o.pack.version + " installed in " + zn::log::shortPath(dest.string()), zn::log::since(t0));
  return true;
}

bool removeDir(const Pack& p) {
  std::error_code ec;
  fs::remove_all(p.dir, ec);
  if (fs::is_empty(fs::path(p.dir).parent_path(), ec)) fs::remove(fs::path(p.dir).parent_path(), ec);
  return !ec;
}

void split(const std::string& arg, std::string& name, std::string& version) {
  const std::size_t at = arg.find('@');
  name = arg.substr(0, at);
  version = at == std::string::npos ? "" : arg.substr(at + 1);
}

}  // namespace

std::vector<Pack> installed(const std::string& name) {
  std::vector<Pack> r;
  std::error_code ec;
  for (const auto& n : fs::directory_iterator(root(), ec)) {
    if (!n.is_directory() || (!name.empty() && n.path().filename() != name)) continue;
    for (const auto& v : fs::directory_iterator(n.path(), ec)) {
      const std::string text = readText(v.path() / "pack.json");   // a pack zinc installed; the SDK of an older tools/v8-pack has none
      if (text.empty()) continue;
      yyjson_doc* d = yyjson_read(text.data(), text.size(), 0);
      Pack p;
      if (d && parseCustom(yyjson_obj_get(yyjson_doc_get_root(d), "custom"), p)) {
        p.name = n.path().filename().string(); p.version = v.path().filename().string(); p.dir = v.path().string();
        r.push_back(p);
      }
      yyjson_doc_free(d);
    }
  }
  std::sort(r.begin(), r.end(), [](const Pack& a, const Pack& b) { return a.name != b.name ? a.name < b.name : newerVersion(a.version, b.version); });
  return r;
}

bool find(const std::string& name, int abi, Pack& out) {
  for (const Pack& p : installed(name)) if (p.abi == abi) { out = p; return true; }
  return false;
}

bool install(const std::string& engineRoot, const std::string& name, const std::string& version, int abi, Pack& out, std::string& err) {
  std::unique_ptr<tuf::Client> index;
  std::vector<Offer> all;
  if (!offers(engineRoot, name, all, index, err)) { err = "the signed index cannot be read: " + err; return false; }
  std::string other;
  for (const Offer& o : all) {
    if (!prefixOf(version, o.pack.version)) continue;
    if (o.pack.abi == abi) return installOffer(*index, o, out, err);
    if (other.find(" " + std::to_string(o.pack.abi) + ",") == std::string::npos) other += " " + std::to_string(o.pack.abi) + ",";
  }
  const std::string what = name + (version.empty() ? "" : " " + version);
  if (!other.empty()) { other.pop_back(); err = "the index has " + what + " packs for engine ABI" + other + " only; this zinc speaks ABI " + std::to_string(abi) + " (zinc update brings the zinc they are made for)"; }
  else err = "the index has no " + what + " pack for " + hostName() + " (zinc engine list --available lists those it has)";
  return false;
}

bool locate(const std::string& engineRoot, const std::string& name, int abi, bool preferPack, std::string& path, Pack* pack, std::string& err) {
#if defined(__APPLE__)
  const std::string file = "libzn_engine_" + name + ".dylib";
#else
  const std::string file = "libzn_engine_" + name + ".so";
#endif
  std::string upper = name;
  for (char& ch : upper) ch = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
  if (const char* env = std::getenv(("ZINC_ENGINE_" + upper).c_str()); env && *env) { path = env; return true; }
  const fs::path exeDir = fs::path(executablePath()).parent_path();
  std::error_code ec;
  Pack p;
  const bool have = find(name, abi, p);
  if (have && preferPack) { path = p.path(); if (pack) *pack = p; return true; }
  for (const fs::path& c : {exeDir / file, (exeDir / "../Resources/engines" / name / file).lexically_normal()})
    if (fs::exists(c, ec)) { path = c.string(); return true; }
  if (!have && !install(engineRoot, name, "", abi, p, err)) {
    err = "the " + name + " engine is not installed and could not be downloaded: " + err + "\n  connect to the network and run zinc engine install " + name +
          ", or name your own build with ZINC_ENGINE_" + upper + "=<path of " + file + ">";
    return false;
  }
  path = p.path();
  if (pack) *pack = p;
  return true;
}

int command(const std::vector<std::string>& args, const std::string& engineRoot, int abi) {
  const std::string sub = args.empty() ? "list" : args[0];
  const std::string arg = args.size() > 1 ? args[1] : "";
  std::string name, version, err;
  split(arg, name, version);
  if (sub == "list") {
    const bool available = arg == "--available";
    std::error_code ec;
    for (const auto& e : fs::directory_iterator(fs::path(executablePath()).parent_path(), ec)) {   // built with zinc, beside it (jsc on macOS; a source build's v8)
      const std::string n = e.path().filename().string();
      if (n.rfind("libzn_engine_", 0) == 0) std::printf("%-8s beside zinc   %s\n", n.substr(13, n.find('.') - 13).c_str(), e.path().string().c_str());
    }
    const std::vector<Pack> have = installed();
    for (const Pack& p : have)
      std::printf("%-8s %-12s %s (%s, ABI %d%s)\n", p.name.c_str(), p.version.c_str(), p.dir.c_str(), p.upstream.c_str(), p.abi, p.abi == abi ? "" : ", not this zinc's: zinc engine update");
    if (have.empty()) std::printf("no engine pack installed: they are downloaded on first use (zinc run --engine v8), or by zinc engine install <name>\n");
    if (!available) return 0;
    std::unique_ptr<tuf::Client> index;
    std::vector<Offer> all;
    if (!offers(engineRoot, "", all, index, err)) { std::fprintf(stderr, "zinc engine list: the signed index cannot be read: %s\n", err.c_str()); return 1; }
    std::printf("in the index for %s:\n", hostName().c_str());
    for (const Offer& o : all)
      std::printf("  %-8s %-12s %s, ABI %d%s, %s\n", o.pack.name.c_str(), o.pack.version.c_str(), o.pack.upstream.c_str(), o.pack.abi, o.pack.abi == abi ? "" : " (not this zinc's)", mb(o.target.length).c_str());
    return 0;
  }
  if (sub == "install") {
    if (name.empty()) { std::fprintf(stderr, "usage: zinc engine install <name>[@version]\n"); return 2; }
    Pack p;
    if (!install(engineRoot, name, version, abi, p, err)) { std::fprintf(stderr, "zinc engine install: %s\n", err.c_str()); return 1; }
    std::printf("%s %s: %s\n", p.name.c_str(), p.version.c_str(), p.path().c_str());
    return 0;
  }
  if (sub == "update") {
    const bool notice = arg == "--notice-check";   // the daily check (notice()): which newer packs exist, written for the next command to say
    std::vector<std::string> names;
    for (const Pack& p : installed(notice ? "" : name)) if (std::find(names.begin(), names.end(), p.name) == names.end()) names.push_back(p.name);
    if (names.empty()) { if (!notice) std::printf("no engine pack installed%s (they are downloaded on first use: zinc run --engine v8)\n", name.empty() ? "" : (" for " + name).c_str()); return 0; }
    std::unique_ptr<tuf::Client> index;
    std::vector<Offer> all;
    if (!offers(engineRoot, "", all, index, err)) { if (!notice) std::fprintf(stderr, "zinc engine update: the signed index cannot be read: %s\n", err.c_str()); return 1; }
    int rc = 0;
    for (const std::string& n : names) {
      const std::vector<Pack> have = installed(n);
      const Offer* best = nullptr;
      for (const Offer& o : all) if (o.pack.name == n && o.pack.abi == abi) { best = &o; break; }
      if (notice) { std::ofstream(root() / n / "available") << (best ? best->pack.version : "") << "\n"; continue; }
      if (!best) { std::printf("%s: no pack for this zinc (ABI %d) in the index\n", n.c_str(), abi); continue; }
      const Pack* current = nullptr;
      for (const Pack& p : have) if (p.abi == abi) { current = &p; break; }
      if (current && !newerVersion(best->pack.version, current->version)) { std::printf("%s %s is up to date\n", n.c_str(), current->version.c_str()); continue; }
      Pack p;
      if (!installOffer(*index, *best, p, err)) { std::fprintf(stderr, "zinc engine update: %s\n", err.c_str()); rc = 1; continue; }
      for (const Pack& old : have) if (old.version != p.version) removeDir(old);   // ponytail: the older ones go (tens of MB each); an exported app carries its own copy
      std::printf("%s %s: %s\n", p.name.c_str(), p.version.c_str(), p.path().c_str());
    }
    return rc;
  }
  if (sub == "remove") {
    if (name.empty()) { std::fprintf(stderr, "usage: zinc engine remove <name>[@version]\n"); return 2; }
    int n = 0;
    for (const Pack& p : installed(name)) if (prefixOf(version, p.version) && removeDir(p)) { std::printf("removed %s %s\n", p.name.c_str(), p.version.c_str()); ++n; }
    if (!n) { std::fprintf(stderr, "zinc engine remove: no %s%s pack installed (zinc engine list)\n", name.c_str(), version.empty() ? "" : ("@" + version).c_str()); return 1; }
    std::error_code ec;
    if (installed(name).empty()) fs::remove(root() / name / "available", ec), fs::remove(root() / name, ec);
    return 0;
  }
  std::fprintf(stderr, "usage: zinc engine list [--available] | install <name>[@version] | update [name] | remove <name>[@version]\n");
  return 2;
}

void notice() {
  const std::vector<Pack> have = installed();
  if (have.empty()) return;
  const bool colour = !std::getenv("NO_COLOR");
  std::string last;
  for (const Pack& p : have) {
    if (p.name == last) continue;   // the newest of each name
    last = p.name;
    std::string latest = readText(root() / p.name / "available");
    while (!latest.empty() && (latest.back() == '\n' || latest.back() == ' ')) latest.pop_back();
    if (!latest.empty() && newerVersion(latest, p.version))
      std::fprintf(stderr, "%s%s %s is available: zinc engine update %s%s\n", colour ? "\033[2m" : "", p.name.c_str(), latest.c_str(), p.name.c_str(), colour ? "\033[0m" : "");
  }
  const fs::path stamp = root() / ".checked";
  std::error_code ec;
  const auto when = fs::last_write_time(stamp, ec);
  const auto age = ec ? std::chrono::hours(48) : std::chrono::duration_cast<std::chrono::hours>(fs::file_time_type::clock::now() - when);
  if (age < std::chrono::hours(24)) return;
  std::ofstream(stamp) << std::time(nullptr) << "\n";   // the stamp first: one check a day, whatever runs meanwhile
  zn::plat::spawnDetached({executablePath(), "engine", "update", "--notice-check"});
}

std::string summary() {
  std::string s, last;
  for (const Pack& p : installed()) if (p.name != last) { s += (s.empty() ? "" : ", ") + p.name + " " + p.version; last = p.name; }
  return s;
}

}  // namespace zn::tc::engines
