// zinc lint: a registry of rules over the engine's own lexer and loader (docs/reports/zinc-lint-migrate.md). Source rules read every .tsx/.jsx
// file of the path; target rules load the program once per target with that profile in force (its platform files, its plugin checks) and
// compare what it uses with targets/capabilities.json, the zinc.json of the project and the plugin.json of each plugin it imports.
#include "lint/lint.h"
#include "platform/platform.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <sstream>
#include <tuple>

#include "frontend/capabilities.h"
#include "frontend/lexer.h"
#include "frontend/modules.h"
#include "frontend/plugin_manifest.h"
#include "frontend/profile.h"
#include "frontend/project.h"
#include "yyjson.h"

namespace fs = std::filesystem;
namespace fe = zn::frontend;

namespace zn::lint {
namespace {

struct Rule { const char* id; const char* severity; const char* scope; const char* summary; const char* fix; };
const Rule kRules[] = {
    {"jsx-classname", "error", "source", "`class` on a JSX element or as a component's prop (Z0006)", "zinc migrate jsx-classname --apply"},
    {"jsx-capitalised-tag", "error", "source", "a lowercase JSX tag (Z0007)", "zinc migrate jsx-capitalised-tags --apply"},
    {"compile", "error", "target", "the program does not load for the target (syntax, imports, permissions: what zinc check reports first)", "zinc check --profile <target>"},
    {"plugin-requires", "error", "target", "an imported plugin's plugin.json \"requires\" does not hold on the target (Z5005)", "a platform file (x.<target>.tsx) without the import, or another target"},
    {"project-requires", "error", "target", "zinc.json \"requires\" does not hold on the target", "another target, or fewer requirements"},
    {"ui-layout", "error", "target", "zinc.json \"ui\".\"layout\" asks for an engine the target cannot build", "\"layout\": \"auto\""},
    {"assets-flash", "error", "target", "the asset files do not fit the target's flash budget", "smaller or fewer assets for that target (zinc.json targets.<id>.assets)"},
    {"plugin-targets", "warning", "target", "an imported plugin does not name the target in plugin.json \"targets\"", "a platform file (x.<target>.tsx) without the import"},
    {"module-requires", "warning", "target", "an imported module's `@requires` comment does not hold on the target", "a platform file, or a lighter module"},
    {"ui-tier", "warning", "target", "a style the target's UI tier draws in a simpler form (what lib/std/ui.ts tierWarn logs at run time)", "a two-stop linear gradient along an axis, or an image"},
    {"screen-size", "warning", "target", "a fixed size larger than the target's screen", "a relative size (w-full, flex-1) or a responsive variant"},
    {"assets-memory", "warning", "target", "the assets, decoded in the target's texture format, against its ram and gpu budgets (an estimate)", "zinc assets build --target <target> for the measure"},
    {"texture-size", "warning", "target", "an image larger than the target's maxSize", "a smaller image for that target"},
};
const Rule& rule(const std::string& id) { for (const Rule& r : kRules) if (id == r.id) return r; return kRules[2]; }

struct Finding {
  std::string file;
  int line = 0, col = 0;
  std::string rule, message;
  std::vector<std::string> targets;   // empty: a source rule
  bool error() const { return std::string(zn::lint::rule(rule).severity) == "error"; }
};

std::string readAll(const fs::path& p) { std::ifstream in(p, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
bool readFile(const std::string& path, std::string& out) {
  std::error_code ec;
  if (!fs::is_regular_file(path, ec)) return false;
  out = readAll(path);
  return true;
}
bool ends(const std::string& s, const char* x) { std::size_t n = std::char_traits<char>::length(x); return s.size() >= n && s.compare(s.size() - n, n, x) == 0; }
bool starts(const std::string& s, const char* x) { return s.rfind(x, 0) == 0; }
std::string shown(const std::string& p) {
  std::error_code ec;
  fs::path rel = fs::absolute(p, ec).lexically_normal().lexically_relative(fs::current_path(ec));
  return rel.empty() ? p : rel.generic_string();
}
std::string canon(const std::string& p) { std::error_code ec; fs::path c = fs::weakly_canonical(p, ec); return ec ? fs::absolute(p).lexically_normal().string() : c.string(); }
bool under(const std::string& file, const std::string& dir) { return !dir.empty() && file.size() > dir.size() && file.compare(0, dir.size(), dir) == 0 && file[dir.size()] == '/'; }

// ---- style costs per tier: the static view of lib/std/ui.ts paintGradient and drawTiles (tierWarn 1, 2 and 4)
std::string tierCost(std::string c, int tier) {
  std::size_t br = c.find('['), colon = c.rfind(':', br == std::string::npos ? std::string::npos : br);
  if (colon != std::string::npos) c = c.substr(colon + 1);   // hover:bg-conic is still a conic gradient
  if (!c.empty() && c[0] == '-') c = c.substr(1);
  if (tier < 3 && (starts(c, "bg-conic") || c.find("conic-gradient(") != std::string::npos)) return "a conic gradient is drawn as the average of its stops";
  if (tier > 1) return "";
  auto angled = [&] {
    if (starts(c, "bg-gradient-to-") || starts(c, "bg-linear-to-")) return ends(c, "-tr") || ends(c, "-br") || ends(c, "-bl") || ends(c, "-tl") || c.find("/") != std::string::npos;
    if (!starts(c, "bg-linear-")) return false;
    const std::string n = c.substr(10);
    if (n.empty() || !std::isdigit(static_cast<unsigned char>(n[0]))) return n.empty() || n[0] == '[';
    return std::atof(n.c_str()) != static_cast<int>(std::atof(n.c_str()) / 90) * 90.0;
  };
  bool positioned = (starts(c, "from-") || starts(c, "via-") || starts(c, "to-")) && ends(c, "%");
  if (starts(c, "via-") || starts(c, "bg-radial") || c.find("radial-gradient(") != std::string::npos || c.find("repeating-") != std::string::npos || positioned || angled())
    return "a gradient beyond two stops along an axis is drawn from its first to its last colour";
  if (c == "bg-repeat" || c == "bg-repeat-x" || c == "bg-repeat-y" || c == "bg-repeat-space" || c == "bg-repeat-round")
    return std::string("an image repeated beyond ") + (tier <= 0 ? "16" : "64") + " tiles is drawn as that many larger tiles at most";
  return "";
}

// The fixed size in px a class sets along an axis ('w' or 'h'), or -1: w-[480px], min-w-[480px], w-120 (4 px a step), size-80.
int fixedSize(const std::string& c, char axis) {
  if (c.find(':') != std::string::npos) return -1;   // a variant (md:w-[900px]) applies where it fits
  std::string v;
  for (const std::string& p : {std::string(1, axis) + "-", "min-" + std::string(1, axis) + "-", std::string("size-")}) if (starts(c, p.c_str())) { v = c.substr(p.size()); break; }
  if (v.empty()) return -1;
  if (v.front() == '[' && v.back() == ']') { v = v.substr(1, v.size() - 2); if (ends(v, "px")) v.resize(v.size() - 2); return v.find_first_not_of("0123456789.") == std::string::npos ? static_cast<int>(std::atof(v.c_str())) : -1; }
  return v.find_first_not_of("0123456789.") == std::string::npos ? static_cast<int>(std::atof(v.c_str()) * 4) : -1;
}

// ---- the assets of a project, estimated without building them
struct Image { std::string file; int w, h; };
struct AssetEstimate { std::uint64_t files = 0, other = 0, pixels = 0; std::vector<Image> images; };
AssetEstimate estimateAssets(const fs::path& dir) {
  AssetEstimate e;
  std::error_code ec;
  for (auto it = fs::recursive_directory_iterator(dir, fs::directory_options::skip_permission_denied, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (!it->is_regular_file(ec)) continue;
    const std::uint64_t size = it->file_size(ec);
    e.files += size;
    std::ifstream in(it->path(), std::ios::binary);
    unsigned char h[24] = {};
    in.read(reinterpret_cast<char*>(h), sizeof h);
    if (in.gcount() == 24 && h[0] == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') {   // the size from the IHDR chunk
      const int w = (h[16] << 24) | (h[17] << 16) | (h[18] << 8) | h[19], hh = (h[20] << 24) | (h[21] << 16) | (h[22] << 8) | h[23];
      e.images.push_back({it->path().string(), w, hh});
      e.pixels += static_cast<std::uint64_t>(w) * static_cast<std::uint64_t>(hh);
    } else e.other += size;   // ponytail: PNG only; a JPEG or WebP counts its file size until a rule needs its pixels
  }
  return e;
}
double bytesPerPixel(const std::string& textures) {   // the first format the target's GPU takes
  const std::string f = textures.substr(0, textures.find('|'));
  if (f == "rgba8") return 4;
  if (f == "bc7" || f == "clut8" || f == "astc") return 1;
  if (f == "bc1" || f == "etc1" || f == "etc2" || f == "clut4") return 0.5;
  return 2;   // rgb565, rgba4444, rgba5551
}

// 1.4 MB, 96 KB, 512 B: a size a person reads (the estimates are not exact anyway)
std::string human(std::uint64_t b) {
  char buf[32];
  if (b >= (1ull << 20)) std::snprintf(buf, sizeof buf, "%.1f MB", static_cast<double>(b) / (1 << 20));
  else if (b >= 1024) std::snprintf(buf, sizeof buf, b < 10240 ? "%.1f KB" : "%.0f KB", static_cast<double>(b) / 1024);
  else std::snprintf(buf, sizeof buf, "%llu B", static_cast<unsigned long long>(b));
  return buf;
}

std::string q(const std::string& s) {
  std::string o = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if (c == '\n') o += "\\n";
    else if (static_cast<unsigned char>(c) < 32) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += c;
  }
  return o + "\"";
}

struct Linter {
  std::string engineRoot, capsJson, capsText, projectDir, projectFile, entry;
  fe::Project project;
  bool haveProject = false;
  std::vector<Finding> found;
  std::map<std::string, std::vector<ClassUse>> classCache;
  std::vector<fe::FoundPlugin> plugins;
  mutable std::map<std::string, std::string> canonical;   // a few hundred files x every target: one realpath each
  const std::string& cn(const std::string& p) const { auto it = canonical.find(p); return it != canonical.end() ? it->second : canonical.emplace(p, canon(p)).first->second; }

  void add(const std::string& file, int line, int col, const std::string& id, const std::string& msg, const std::string& target) {
    for (Finding& f : found)
      if (f.file == file && f.line == line && f.col == col && f.rule == id && f.message == msg) { if (std::find(f.targets.begin(), f.targets.end(), target) == f.targets.end()) f.targets.push_back(target); return; }
    found.push_back({file, line, col, id, msg, target.empty() ? std::vector<std::string>{} : std::vector<std::string>{target}});
  }
  void addAt(const std::string& file, std::string_view text, std::uint32_t at, const std::string& id, const std::string& msg, const std::string& target) {
    auto lc = fe::lineCol(text, at);
    add(shown(file), static_cast<int>(lc.line), static_cast<int>(lc.col), id, msg, target);
  }

  void sourceRules(const fs::path& root) {
    std::vector<fs::path> files;
    std::error_code ec;
    if (fs::is_directory(root, ec)) {
      static const std::set<std::string> skip = {"node_modules", "build", "dist", ".git", "third_party", "vendor", ".zinc"};
      for (auto it = fs::recursive_directory_iterator(root, fs::directory_options::skip_permission_denied, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
        if (it->is_symlink(ec)) { if (it->is_directory(ec)) it.disable_recursion_pending(); continue; }
        if (it->is_directory(ec)) { if (skip.count(it->path().filename().string())) it.disable_recursion_pending(); continue; }
        if (ends(it->path().string(), ".tsx") || ends(it->path().string(), ".jsx")) files.push_back(it->path());
      }
      std::sort(files.begin(), files.end());
    } else files.push_back(root);
    for (const fs::path& f : files) {
      const std::string text = readAll(f), name = f.lexically_normal().string();
      for (const Codemod& cm : codemods())
        for (const Site& s : scanFile(cm, name, text))
          if (s.start == 0 || text[s.start - 1] != '/')   // a closing tag is the same element
            addAt(name, text, s.start, cm.id == std::string("jsx-classname") ? "jsx-classname" : "jsx-capitalised-tag", s.message, "");
    }
  }

  // The project's own files among those the program loaded: not the standard library, not a plugin.
  bool userFile(const std::string& path) const {
    const std::string c = cn(path);
    if (!under(c, cn(projectDir))) return false;
    for (const auto& p : plugins) if (under(c, cn(p.dir))) return false;
    return true;
  }
  // Where the program imports `spec`: the first quoted occurrence in a loaded file outside the plugin itself (`skipDir`), else the entry.
  std::tuple<std::string, int, int> importSite(const fe::Program& prog, const std::string& spec, const std::string& skipDir) const {
    for (const fe::SourceFile& f : prog.files) {
      if (under(cn(f.path), skipDir)) continue;
      const std::string& text = f.original.empty() ? f.text : f.original;
      for (const char* qch : {"'", "\""}) {
        std::size_t at = text.find(qch + spec + qch);
        if (at != std::string::npos) { auto lc = fe::lineCol(text, static_cast<std::uint32_t>(at)); return {shown(f.path), static_cast<int>(lc.line), static_cast<int>(lc.col)}; }
      }
    }
    return {shown(entry), 1, 1};
  }

  void targetRules(const std::string& t) {
    const fe::Profile* p = fe::findProfile(t);
    fe::applyProfile(*p);
    fe::Caps caps = fe::capsFromFile(*p, capsJson);
    auto opt = project.targets.find(t);
    if (opt != project.targets.end() && opt->second.width > 0) caps["width"] = std::to_string(opt->second.width);
    if (opt != project.targets.end() && opt->second.height > 0) caps["height"] = std::to_string(opt->second.height);
    const std::string zj = projectFile.empty() ? "" : shown(projectFile);
    if (haveProject) {
      if (std::string why = fe::explain(project.requires_, caps, t); !why.empty()) add(zj, 0, 0, "project-requires", "requires " + why, t);
    }
    std::string layout = "classic", lerr;
    if (!fe::resolveUiLayout(project, caps, t, layout, lerr)) { add(zj, 0, 0, "ui-layout", lerr, t); layout = "classic"; }
    if (entry.empty()) return;
    static std::vector<std::string> granted;
    granted = fe::permissionsFor(project, t);
    fe::setSystemPermissions(&granted);
    fe::setUiLayout(layout);
    fe::setUiPreset(project.uiPreset);
    fe::Program prog = fe::loadProgram(entry, readFile, false, engineRoot + "/lib/std");
    for (const fe::Diag& d : prog.diags) {
      const std::string code = d.code ? d.code : "";
      if (code == "Z0006" || code == "Z0007") continue;   // the source rules say it, with the codemod
      // the project's own files only: lint builds no plugin, so a plugin's native part is not there (Z5011) and the loader falls back to the
      // stand-ins of the old simulator, which zinc run does not read; zinc check stays the whole compile
      if (code != "Z5005" && d.file < prog.files.size() && !userFile(prog.files[d.file].path)) continue;
      const std::string line = fe::formatDiag(prog, d);   // file:line:col: error Zxxxx: title: detail
      std::size_t a = line.find(':'), b = line.find(':', a + 1), m = line.find(": error ");
      std::string msg = m == std::string::npos ? line : line.substr(m + 8);
      add(shown(line.substr(0, a)), std::atoi(line.c_str() + a + 1), std::atoi(line.c_str() + b + 1), code == "Z5005" ? "plugin-requires" : "compile", msg, t);
    }
    const int tier = caps["tier"].size() == 2 ? caps["tier"][1] - '0' : 4;
    for (const fe::SourceFile& f : prog.files) {
      const std::string& text = f.original.empty() ? f.text : f.original;
      // @requires in the leading comment of a module (docs/targets/capabilities.md): a warning where it does not hold
      std::size_t r = text.find("@requires");
      if (r != std::string::npos && r < 512) {
        std::string reqLine = text.substr(r + 9, text.find('\n', r) - r - 9);
        if (std::size_t e = reqLine.find("*/"); e != std::string::npos) reqLine.resize(e);
        std::vector<std::string> reqs;
        std::istringstream in(reqLine);
        for (std::string w; in >> w;) reqs.push_back(w);
        if (std::string why = fe::explain(reqs, caps, t); !why.empty()) addAt(f.path, text, static_cast<std::uint32_t>(r), "module-requires", "this module requires " + why, t);
      }
      if (!userFile(f.path) || !(ends(f.path, ".tsx") || ends(f.path, ".jsx"))) continue;
      auto hit = classCache.find(f.path);
      if (hit == classCache.end()) hit = classCache.emplace(f.path, classNames(text)).first;
      const bool fixedScreen = caps["desktop"] != "true" && t != "wasm" && t != "web";
      const int sw = std::atoi(caps["width"].c_str()), sh = std::atoi(caps["height"].c_str());
      for (const ClassUse& u : hit->second) {
        if (std::string why = tierCost(u.cls, tier); !why.empty()) addAt(f.path, text, u.at, "ui-tier", u.cls + ": " + why + " on tier T" + std::to_string(tier), t);
        if (!fixedScreen) continue;
        if (int w = fixedSize(u.cls, 'w'); w > sw && sw > 0) addAt(f.path, text, u.at, "screen-size", u.cls + " is " + std::to_string(w) + " px wide, the screen " + std::to_string(sw), t);
        if (int h = fixedSize(u.cls, 'h'); h > sh && sh > 0) addAt(f.path, text, u.at, "screen-size", u.cls + " is " + std::to_string(h) + " px tall, the screen " + std::to_string(sh), t);
      }
    }
    // the plugins the program loaded: their plugin.json "targets" name where they are made to run
    std::set<std::string> seen;
    for (const fe::SourceFile& f : prog.files) {
      const std::string c = cn(f.path);
      for (const auto& pl : plugins) {
        if (!under(c, cn(pl.dir)) || !seen.insert(pl.manifest.name).second) continue;
        const auto& ts = pl.manifest.targets;
        auto lists = [&](const std::string& x) { return std::find(ts.begin(), ts.end(), x) != ts.end(); };
        if (ts.empty() || lists(t)) continue;
        if (t == "sim" && (lists("macos") || lists("linux"))) continue;   // the simulator runs on the host, with the host's plugins
        std::string list;
        for (const std::string& x : ts) list += (list.empty() ? "" : ", ") + x;
        auto [file, line, col] = importSite(prog, pl.manifest.module.empty() ? pl.manifest.name : pl.manifest.module, cn(pl.dir));
        add(file, line, col, "plugin-targets", "plugin " + pl.manifest.name + " is not made for this target (its plugin.json targets: " + list + ")", t);
      }
    }
  }

  void assetRules(const std::vector<std::string>& targets) {
    if (!haveProject) return;
    const fs::path dir = fs::path(projectDir) / project.assets.dir;
    std::error_code ec;
    if (!fs::is_directory(dir, ec)) return;
    std::vector<fe::TargetAssets> rows;
    std::string err;
    if (!fe::assetProfiles(project, capsText, rows, err)) { add(shown(projectFile), 0, 0, "compile", err, ""); return; }
    const AssetEstimate e = estimateAssets(dir);
    const std::string where = shown(dir.string());
    for (const fe::TargetAssets& row : rows) {
      if (std::find(targets.begin(), targets.end(), row.target) == targets.end()) continue;
      const std::string& t = row.target;
      auto key = [&](const char* k) { auto it = row.keys.find(k); return it == row.keys.end() ? std::string() : it->second; };
      auto budget = [&](const char* k) { auto it = row.budgets.find(k); return it == row.budgets.end() ? std::uint64_t(0) : it->second; };
      const std::uint64_t textures = static_cast<std::uint64_t>(static_cast<double>(e.pixels) * bytesPerPixel(key("texture")));
      if (std::uint64_t b = budget("flash"); b && e.files > b) add(where, 0, 0, "assets-flash", "the assets take " + human(e.files) + ", over the " + human(b) + " flash budget", t);
      if (std::uint64_t b = budget("ram"); b && textures + e.other > b)
        add(where, 0, 0, "assets-memory", "the assets decode to about " + human(textures + e.other) + " (images as " + key("texture").substr(0, key("texture").find('|')) + "), over the " + human(b) + " ram budget", t);
      if (std::uint64_t b = budget("gpu"); b && textures > b) add(where, 0, 0, "assets-memory", "the images take about " + human(textures) + " as textures, over the " + human(b) + " gpu budget", t);
      const int maxSize = std::atoi(key("maxSize").c_str());
      for (const Image& im : e.images)
        if (maxSize > 0 && std::max(im.w, im.h) > maxSize) add(shown(im.file), 0, 0, "texture-size", std::to_string(im.w) + "x" + std::to_string(im.h) + " is larger than the " + std::to_string(maxSize) + " px maxSize", t);
    }
  }
};

std::string place(const Finding& f) { return f.file + (f.line > 0 ? ":" + std::to_string(f.line) + ":" + std::to_string(f.col) : ""); }

}  // namespace

int lint(const std::vector<std::string>& args, const std::string& engineRoot) {
  const char* usage = "usage: zinc lint [--target <profile> | --all-targets] [--json] [--rules] [path]\n";
  std::string path = ".", only;
  bool all = false, json = false;
  for (std::size_t i = 2; i < args.size(); ++i) {
    const std::string& a = args[i];
    if (a == "--all-targets") all = true;
    else if (a == "--json") json = true;
    else if (a == "--rules") {
      for (const Rule& r : kRules) std::printf("%-20s %-8s %-7s %s (fix: %s)\n", r.id, r.severity, r.scope, r.summary, r.fix);
      return 0;
    } else if (a == "--target" && i + 1 < args.size()) only = args[++i];
    else if (a.rfind("--", 0) == 0) { std::fprintf(stderr, "zinc lint: unknown option %s\n%s", a.c_str(), usage); return 2; }
    else path = a;
  }
  std::error_code ec;
  if (!fs::exists(path, ec)) { std::fprintf(stderr, "zinc lint: no such file or directory: %s\n%s", path.c_str(), usage); return 2; }
  Linter L;
  L.engineRoot = engineRoot;
  L.capsJson = engineRoot + "/targets/capabilities.json";
  L.capsText = readAll(L.capsJson);
  L.projectFile = fe::findProjectFile(path);
  if (!L.projectFile.empty()) {
    std::string err;
    L.haveProject = fe::parseProject(readAll(L.projectFile), L.project, err) || !L.project.fatal;
    if (!L.haveProject) { std::fprintf(stderr, "zinc lint: %s: %s\n", L.projectFile.c_str(), err.c_str()); return 2; }
  }
  const bool isDir = fs::is_directory(path, ec);
  L.projectDir = !L.projectFile.empty() ? fs::path(L.projectFile).parent_path().string() : isDir ? path : fs::path(path).parent_path().string();
  if (L.projectDir.empty()) L.projectDir = ".";
  L.entry = isDir ? fe::entryOf(path, L.haveProject ? &L.project : nullptr) : path;
  std::vector<std::string> problems;
  L.plugins = fe::discoverPlugins(engineRoot, L.projectDir, problems);   // the checkout (or package) root holds plugins/

  // the targets in force decide the exit code; --all-targets adds every profile of targets/capabilities.json to the matrix
  std::vector<std::string> inForce, run;
  if (!only.empty()) {
    if (!fe::findProfile(only)) {
      std::string names;
      for (const std::string& n : fe::profileNames()) names += " " + n;
      std::fprintf(stderr, "zinc lint: unknown target %s (profiles:%s)\n", only.c_str(), names.c_str());
      return 2;
    }
    inForce.push_back(only);
  } else {
    for (const auto& [t, o] : L.project.targets) {
      if (fe::findProfile(t)) inForce.push_back(t);
      else std::fprintf(stderr, "zinc lint: zinc.json target %s has no profile: not checked\n", t.c_str());
    }
    if (!L.project.profile.empty() && fe::findProfile(L.project.profile) && std::find(inForce.begin(), inForce.end(), L.project.profile) == inForce.end()) inForce.push_back(L.project.profile);
    if (inForce.empty()) inForce.push_back(zn::plat::osName());
  }
  run = inForce;
  if (all) {
    if (yyjson_doc* doc = yyjson_read(L.capsText.data(), L.capsText.size(), 0)) {
      yyjson_obj_iter it = yyjson_obj_iter_with(yyjson_doc_get_root(doc));
      while (yyjson_val* k = yyjson_obj_iter_next(&it)) {
        const std::string t = yyjson_get_str(k);
        if (fe::findProfile(t) && std::find(run.begin(), run.end(), t) == run.end()) run.push_back(t);
      }
      yyjson_doc_free(doc);
    }
  }

  L.sourceRules(path);
  for (const std::string& t : run) L.targetRules(t);
  L.assetRules(run);

  std::stable_sort(L.found.begin(), L.found.end(), [](const Finding& a, const Finding& b) { return a.targets.empty() > b.targets.empty(); });
  int errors = 0, warnings = 0;
  auto counts = [&](const Finding& f) {
    if (f.targets.empty()) return true;
    for (const std::string& t : f.targets) if (std::find(inForce.begin(), inForce.end(), t) != inForce.end()) return true;
    return false;
  };
  for (const Finding& f : L.found) if (counts(f)) (f.error() ? errors : warnings)++;
  // the matrix: per target, refuses (an error, the source's included), warns or ok
  struct Row { std::string target, tier, status, reason; int errors = 0, warnings = 0; };
  std::vector<Row> matrix;
  for (const std::string& t : run) {
    Row r{t, fe::capsFromFile(*fe::findProfile(t), L.capsJson)["tier"], "ok", ""};
    for (const Finding& f : L.found) {
      if (!f.targets.empty() && std::find(f.targets.begin(), f.targets.end(), t) == f.targets.end()) continue;
      if (f.error()) { if (!r.errors++) r.reason = f.rule + ": " + f.message; }
      else if (!r.warnings++ && r.reason.empty()) r.reason = f.rule + ": " + f.message;
    }
    if (r.errors) r.status = "refuses";
    else if (r.warnings) { r.status = "warns"; if (r.warnings > 1) r.reason += " (+" + std::to_string(r.warnings - 1) + ")"; }
    matrix.push_back(r);
  }

  if (json) {
    std::string out = "{\n  \"targets\": [";
    for (std::size_t i = 0; i < inForce.size(); ++i) out += (i ? ", " : "") + q(inForce[i]);
    out += "],\n  \"diagnostics\": [";
    for (std::size_t i = 0; i < L.found.size(); ++i) {
      const Finding& f = L.found[i];
      std::string ts;
      for (std::size_t k = 0; k < f.targets.size(); ++k) ts += (k ? ", " : "") + q(f.targets[k]);
      out += std::string(i ? "," : "") + "\n    {\"file\": " + q(f.file) + ", \"line\": " + std::to_string(f.line) + ", \"col\": " + std::to_string(f.col) + ", \"rule\": " + q(f.rule) +
             ", \"severity\": " + q(rule(f.rule).severity) + ", \"targets\": [" + ts + "], \"message\": " + q(f.message) + ", \"fix\": " + q(rule(f.rule).fix) + "}";
    }
    out += L.found.empty() ? "]" : "\n  ]";
    if (all) {
      out += ",\n  \"matrix\": [";
      for (std::size_t i = 0; i < matrix.size(); ++i)
        out += std::string(i ? "," : "") + "\n    {\"target\": " + q(matrix[i].target) + ", \"tier\": " + q(matrix[i].tier) + ", \"status\": " + q(matrix[i].status) + ", \"errors\": " +
               std::to_string(matrix[i].errors) + ", \"warnings\": " + std::to_string(matrix[i].warnings) + ", \"reason\": " + q(matrix[i].reason) + "}";
      out += "\n  ]";
    }
    std::fputs((out + "\n}\n").c_str(), stdout);
  } else {
    for (const Finding& f : L.found) {
      if (!all && !counts(f)) continue;
      std::string ts;
      for (const std::string& t : f.targets) ts += (ts.empty() ? " [" : ", ") + t;
      if (!ts.empty()) ts += "]";
      std::printf("%s: %s %s%s: %s (fix: %s)\n", place(f).c_str(), rule(f.rule).severity, f.rule.c_str(), ts.c_str(), f.message.c_str(), rule(f.rule).fix);
    }
    if (all) {
      std::printf("\n%-8s %-4s %-8s %s\n", "target", "tier", "status", "reason");
      for (const Row& r : matrix) std::printf(r.reason.empty() ? "%-8s %-4s %s%s\n" : "%-8s %-4s %-8s %s\n", r.target.c_str(), r.tier.c_str(), r.status.c_str(), r.reason.c_str());
    }
    std::string ts;
    for (const std::string& t : inForce) ts += (ts.empty() ? "" : ", ") + t;
    std::fflush(stdout);
    std::fprintf(stderr, "zinc lint: %d error%s, %d warning%s (%s)\n", errors, errors == 1 ? "" : "s", warnings, warnings == 1 ? "" : "s", ts.c_str());
  }
  return errors ? 1 : 0;
}

}  // namespace zn::lint
