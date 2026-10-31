// zinc doc (ZN-856): the site. What goes in it:
//  - a project (zinc.json): its pages (zinc.json doc.pages, default docs/), the API of its sources (doc.api, default src/), the plugins of its
//    plugins/ folder and the engine plugins it imports;
//  - a plugin (plugin.json, no zinc.json): that plugin alone, its overview as the home page;
//  - the engine (--std, or the engine's own checkout): docs/guide, the standard library (lib/std and the lib/*.d.ts modules), every plugin.
// A plugin's pages: plugins/<name>/docs/ (index.md the overview, other .md and .mdx pages ordered by `order:` then file name, images beside
// them); in the engine, docs/plugins/<name>.md is the overview when the plugin has no docs/index.md. Its API: the entry's exports and the
// records and functions of its native spec. Links between pages are rewritten to the site; a link that leads outside it keeps its text only.
#include "doc/doc.h"
#include "doc/internal.h"

#include "frontend/modules.h"
#include "frontend/plugin_manifest.h"
#include "platform/socket.h"
#include "res/codec.h"
#include "tc/tc.h"
#include "yyjson.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <map>
#include <set>
#include <sstream>
#include <thread>

namespace zn::doc {
namespace {
namespace fs = std::filesystem;

bool readText(const fs::path& p, std::string& out) {
  std::ifstream f(p, std::ios::binary);
  if (!f) return false;
  std::ostringstream ss;
  ss << f.rdbuf();
  out = ss.str();
  return true;
}
bool writeText(const fs::path& p, const std::string& s) {
  std::error_code ec;
  fs::create_directories(p.parent_path(), ec);
  std::ofstream f(p, std::ios::binary);
  f << s;
  return static_cast<bool>(f);
}
std::string norm(const fs::path& p) { return fs::absolute(p).lexically_normal().generic_string(); }
std::string jsonStr(std::string_view s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += static_cast<char>(c); }
    else if (c == '\n') o += "\\n";
    else if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else if (c == '<') o += "\\u003c";   // never closes the script
    else o += static_cast<char>(c);
  }
  return o + "\"";
}
std::string pretty(std::string stem) {   // 02-getting-started -> Getting started
  std::size_t i = 0;
  while (i < stem.size() && (std::isdigit(static_cast<unsigned char>(stem[i])) || stem[i] == '-' || stem[i] == '_' || stem[i] == '.')) i++;
  if (i < stem.size()) stem = stem.substr(i);
  for (auto& c : stem) if (c == '-' || c == '_') c = ' ';
  if (!stem.empty()) stem[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(stem[0])));
  return stem;
}
std::string excerpt(const std::string& text, std::size_t n) {
  std::string s;
  bool space = false;
  for (char c : text) {
    if (c == '\n' || c == '\t' || c == ' ' || c == '\r') { space = !s.empty(); continue; }
    if (space) s += ' ';
    space = false;
    s += c;
    if (s.size() >= n) break;
  }
  if (s.size() >= n) {   // cut on a character boundary
    while (!s.empty() && (static_cast<unsigned char>(s.back()) & 0xC0) == 0x80) s.pop_back();
    if (!s.empty() && static_cast<unsigned char>(s.back()) >= 0xC0) s.pop_back();
    s += "…";
  }
  return s;
}
std::string firstSentence(const std::string& md) {
  const std::size_t tag = md.rfind("@", 0) == 0 ? 0 : md.find("\n@");   // the text before the JSDoc tags
  std::string s = excerpt(tag == std::string::npos ? md : md.substr(0, tag), 400);
  const std::size_t dot = s.find(". ");
  if (dot != std::string::npos && dot < 200) s = s.substr(0, dot + 1);
  else if (s.size() > 160) s = excerpt(s, 160);
  return s;
}
// `to` (a path from the site root) as written in the page at `from`
std::string rel(const std::string& from, const std::string& to) {
  std::string up;
  for (char c : from) if (c == '/') up += "../";
  return up + to;
}
std::string rootOf(const std::string& from) { return rel(from, ""); }

struct Page {
  std::string url, title, lead, group, crumb;
  std::string src;          // the Markdown source; empty for a generated page
  bool mdx = false;
  int order = 0;
  std::string html, text;
  std::vector<Heading> toc;
  std::string kind = "page";
};
struct NavEntry { std::string title, url, badge; std::vector<NavEntry> kids; };
struct NavGroup { std::string title; std::vector<NavEntry> entries; };
struct ApiPage { std::string url, title, group, intro; std::vector<std::pair<std::string, Module>> sections; };   // section title (or "") and module

struct Plugin {
  zn::frontend::PluginManifest m;
  std::string dir, prefix;   // prefix: plugins/<name>/, or "" for a plugin documented alone
  std::vector<std::size_t> pages;   // indices into Site::pages, the overview first
  std::size_t api = SIZE_MAX;       // index into Site::apis
};

struct Search { std::string t, u, s, x, k, kind; };

struct Site {
  std::string engineRoot, root, out, title, description, theme, mode;
  std::vector<std::string> pagesDirs, apiPaths;
  std::vector<std::pair<std::string, std::string>> pageGroups;   // the sidebar groups of pages: title, URL prefix
  std::vector<Page> pages;
  std::vector<ApiPage> apis;
  std::vector<Plugin> plugins;
  std::vector<NavGroup> nav;
  std::map<std::string, std::string> bySrc;     // a Markdown source (normalised) -> its page
  std::map<std::string, std::string> symbols;   // a name (Name, module.Name, Name.member) -> page#anchor
  std::map<std::string, std::string> assets;    // a copied file (normalised) -> its path in the site
  std::set<std::string> inputs;                 // what was read: zinc doc --serve watches it
  std::vector<std::string> warnings;
  std::vector<Search> search;
  bool home = false;   // a page of the project is the home page
  int symbolCount = 0;
};

void warn(Site& s, const std::string& w) { s.warnings.push_back(w); }

// ---- collect ----

// The .md and .mdx files of a folder and its sub-folders; with `only`, the files of the folder itself whose names it lists.
std::vector<fs::path> markdownIn(const fs::path& dir, Site& s, const std::set<std::string>* only) {
  std::vector<fs::path> v;
  std::error_code ec;
  if (!fs::is_directory(dir, ec)) return v;
  s.inputs.insert(norm(dir));
  for (auto it = fs::recursive_directory_iterator(dir, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (it->is_directory()) { if (only) it.disable_recursion_pending(); else s.inputs.insert(norm(it->path())); continue; }
    if (only && !only->count(it->path().stem().string())) continue;
    const std::string e = it->path().extension().string();
    if (e == ".md" || e == ".mdx") v.push_back(it->path());
  }
  std::sort(v.begin(), v.end());
  return v;
}

// The front matter's `order` and `title` before rendering (the nav needs the order; rendering comes later)
int frontOrder(const fs::path& p) {
  std::string src;
  if (!readText(p, src) || src.rfind("---", 0) != 0) return 1000;
  const std::size_t e = src.find("\n---", 3);
  const std::size_t o = src.find("\norder:");
  if (o == std::string::npos || o > e) return 1000;
  return std::atoi(src.c_str() + o + 7);
}

void addPages(Site& s, const fs::path& dir, const std::string& prefix, const std::string& group, std::vector<std::size_t>* into, const std::set<std::string>* only = nullptr) {
  if (!into && std::none_of(s.pageGroups.begin(), s.pageGroups.end(), [&](const auto& g) { return g.first == group; })) s.pageGroups.emplace_back(group, prefix);
  for (const auto& p : markdownIn(dir, s, only)) {
    const fs::path relp = p.lexically_relative(dir);
    std::string stem = relp.generic_string();
    stem = stem.substr(0, stem.size() - p.extension().string().size());
    std::string lower = stem;
    for (auto& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    const bool index = lower == "index" || (lower == "readme" && !fs::exists(dir / "index.md") && !fs::exists(dir / "index.mdx"));
    Page pg;
    std::string slug;
    for (std::size_t i = 0; i < stem.size(); i++) {
      const char c = stem[i];
      slug += c == ' ' ? '-' : static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    }
    if (lower.size() > 7 && lower.substr(lower.size() - 7) == "/readme") slug = slug.substr(0, slug.size() - 6) + "index";
    pg.url = prefix + (index ? "index" : slug) + ".html";
    pg.src = norm(p);
    pg.mdx = p.extension() == ".mdx";
    pg.group = group;
    pg.order = index ? -1 : frontOrder(p);
    pg.title = pretty(p.stem().string());
    s.bySrc[pg.src] = pg.url;
    s.inputs.insert(pg.src);
    if (into) into->push_back(s.pages.size());
    s.pages.push_back(std::move(pg));
  }
}

std::string moduleSlug(std::string name) {
  if (name.rfind("zinc:", 0) == 0) name = name.substr(5);
  for (auto& c : name) if (c == '/' || c == ':' || c == '@' || c == ' ') c = '-';
  return name;
}

void readModules(Site& s, const fs::path& file, const std::string& name, const std::string& shown, std::vector<Module>& out, int depth = 0) {
  std::string src;
  if (!readText(file, src)) return;
  s.inputs.insert(norm(file));
  const std::string ext = file.extension().string();
  const bool dts = file.string().size() > 5 && file.string().substr(file.string().size() - 5) == ".d.ts";
  auto mods = extractApi(src, name, shown, ext == ".tsx" || ext == ".jsx", dts);
  for (auto& m : mods) {
    for (const auto& r : m.reexports) {   // export * from './x': its declarations belong to this module
      if (depth > 4) break;
      fs::path t = file.parent_path() / r;
      for (const char* e : {"", ".ts", ".tsx", "/index.ts"}) {
        std::error_code ec;
        fs::path c = fs::path(t.string() + e);
        if (fs::is_regular_file(c, ec)) {
          std::vector<Module> sub;
          readModules(s, c, name, shown, sub, depth + 1);
          for (auto& sm : sub) for (auto& it : sm.items) m.items.push_back(std::move(it));
          break;
        }
      }
    }
    out.push_back(std::move(m));
  }
}

void addPlugin(Site& s, const fs::path& dir, bool alone) {
  std::string text, err;
  std::vector<std::string> warnings;
  Plugin pl;
  if (!readText(dir / "plugin.json", text) || !zn::frontend::parsePluginManifest(text, pl.m, err, warnings)) { warn(s, dir.string() + ": plugin.json: " + err); return; }
  s.inputs.insert(norm(dir / "plugin.json"));
  pl.dir = norm(dir);
  if (pl.m.name.empty()) pl.m.name = dir.filename().string();
  pl.prefix = alone ? "" : "plugins/" + pl.m.name + "/";
  const std::string group = pl.m.name;
  // pages: plugins/<name>/docs/, else (or for the overview) docs/plugins/<name>.md of the engine
  addPages(s, dir / "docs", pl.prefix, group, &pl.pages);
  const bool hasIndex = std::any_of(pl.pages.begin(), pl.pages.end(), [&](std::size_t i) { return s.pages[i].url == pl.prefix + "index.html"; });
  const fs::path engineDoc = fs::path(s.engineRoot) / "docs" / "plugins" / (pl.m.name + ".md");
  std::error_code ec;
  if (fs::is_regular_file(engineDoc, ec)) {
    if (hasIndex) s.bySrc[norm(engineDoc)] = pl.prefix + "index.html";
    else {
      Page pg;
      pg.url = pl.prefix + "index.html";
      pg.src = norm(engineDoc);
      pg.group = group;
      pg.order = -1;
      pg.title = pl.m.name;
      s.bySrc[pg.src] = pg.url;
      s.inputs.insert(pg.src);
      pl.pages.insert(pl.pages.begin(), s.pages.size());
      s.pages.push_back(std::move(pg));
    }
  } else if (!hasIndex) {   // no overview written: one from plugin.json
    Page pg;
    pg.url = pl.prefix + "index.html";
    pg.group = group;
    pg.order = -1;
    pg.title = pl.m.module.empty() ? pl.m.name : pl.m.module;
    pg.lead = pl.m.description;
    pg.text = pl.m.description;
    pl.pages.insert(pl.pages.begin(), s.pages.size());
    s.pages.push_back(std::move(pg));
  }
  std::stable_sort(pl.pages.begin(), pl.pages.end(), [&](std::size_t a, std::size_t b) { return s.pages[a].order < s.pages[b].order; });
  // API: the entry's exports and the native spec
  ApiPage api;
  api.url = pl.prefix + "api.html";
  api.title = (pl.m.module.empty() ? pl.m.name : pl.m.module);
  api.group = group;
  const fs::path entry = dir / pl.m.entry;
  auto shown = [&](const fs::path& f) {
    const std::string n = norm(f);
    const std::string r = fs::path(n).lexically_relative(alone ? fs::path(norm(dir)).parent_path() : fs::path(s.root)).generic_string();
    return r.empty() || r.rfind("..", 0) == 0 ? fs::path(n).lexically_relative(fs::path(s.engineRoot)).generic_string() : r;
  };
  if (fs::is_regular_file(entry, ec) && !pl.m.module.empty()) {
    std::vector<Module> mods;
    readModules(s, entry, pl.m.module, shown(entry), mods);
    for (auto& m : mods) if (!m.items.empty()) api.sections.emplace_back(m.name == pl.m.module ? "" : m.name, std::move(m));
  }
  fs::path spec = pl.m.nativeSpec.empty() ? fs::path() : dir / pl.m.nativeSpec;
  if (spec.empty() && fs::is_directory(dir / "native", ec))
    for (const auto& e : fs::directory_iterator(dir / "native", ec)) { const std::string n = e.path().filename().string(); if (n.size() > 8 && n.substr(n.size() - 8) == ".spec.ts") { spec = e.path(); break; } }
  if (!spec.empty() && fs::is_regular_file(spec, ec)) {
    std::vector<Module> mods;
    readModules(s, spec, pl.m.module.empty() ? pl.m.name : pl.m.module, shown(spec), mods);
    for (auto& m : mods) if (!m.items.empty()) { m.overview.clear(); api.sections.emplace_back("Native interface", std::move(m)); }
  }
  if (!api.sections.empty()) { pl.api = s.apis.size(); s.apis.push_back(std::move(api)); }
  s.plugins.push_back(std::move(pl));
}

// The engine plugins a project imports: zinc:<x> named in its sources
std::set<std::string> importedModules(const fs::path& root, Site& s) {
  std::set<std::string> used;
  std::error_code ec;
  for (const char* d : {"src", "lib", "app"}) {
    if (!fs::is_directory(root / d, ec)) continue;
    for (auto it = fs::recursive_directory_iterator(root / d, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
      const std::string e = it->path().extension().string();
      if (e != ".ts" && e != ".tsx" && e != ".js" && e != ".jsx") continue;
      std::string src;
      if (!readText(it->path(), src)) continue;
      for (std::size_t p = src.find("zinc:"); p != std::string::npos; p = src.find("zinc:", p + 5)) {
        if (p == 0 || (src[p - 1] != '\'' && src[p - 1] != '"')) continue;
        const std::size_t e2 = src.find_first_of("'\"", p);
        if (e2 != std::string::npos) used.insert(src.substr(p, e2 - p));
      }
    }
  }
  (void)s;
  return used;
}

bool collect(Site& s) {
  std::error_code ec;
  const fs::path root(s.root);
  if (s.mode == "engine") {
    s.title = "Zinc";
    s.description = "The reference of the Zinc engine: the guides, the standard library and every plugin, with their API.";
    // the published part of docs/ (as site/docs-map.mjs publishes it); reports and working notes stay out
    static const std::set<std::string> topics = {"ui-kit", "ui", "plugins", "boards", "studio", "dev-mode", "licenses", "nuxt-ui", "react-native", "templates",
                                                 "diagnostics", "zapp", "desktop-integration", "engines", "diagnostics-vs-tsc", "figma-ui", "zpk", "ir-format"};
    for (const auto& [d, title] : std::vector<std::pair<std::string, std::string>>{{"start", "Start"}, {"learn", "Learn"}, {"guide", "Guides"}, {"reference", "Reference"}, {"targets", "Targets"}})
      addPages(s, root / "docs" / d, d + "/", title, nullptr);
    addPages(s, root / "docs", "topics/", "Topics", nullptr, &topics);
    // the standard library: the modules written in Zinc, then the host modules declared in lib/*.d.ts
    for (std::string_view spec : zn::frontend::stdModuleSpecs()) {
      const fs::path f = root / "lib" / "std" / std::string(zn::frontend::stdModuleFile(spec));
      std::vector<Module> mods;
      readModules(s, f, std::string(spec), fs::path(norm(f)).lexically_relative(root).generic_string(), mods);
      for (auto& m : mods) {
        if (m.items.empty()) continue;
        ApiPage a;
        a.title = m.name;
        a.url = "api/" + moduleSlug(m.name) + ".html";
        a.group = "Standard library";
        a.sections.emplace_back("", std::move(m));
        s.apis.push_back(std::move(a));
      }
    }
    for (const char* d : {"modules.d.ts", "gfx.d.ts", "ui.d.ts", "zinc.d.ts"}) {
      std::vector<Module> mods;
      const fs::path f = root / "lib" / d;
      readModules(s, f, std::string(d) == "zinc.d.ts" ? "Globals" : "", std::string("lib/") + d, mods);
      for (auto& m : mods) {
        if (m.items.empty() || m.name.empty()) continue;
        ApiPage a;
        a.title = m.name;
        a.url = "api/" + moduleSlug(m.name) + ".html";
        a.group = "Built-in modules";
        a.sections.emplace_back("", std::move(m));
        s.apis.push_back(std::move(a));
      }
    }
    std::vector<fs::path> dirs;
    for (const auto& e : fs::directory_iterator(root / "plugins", ec)) if (fs::is_regular_file(e.path() / "plugin.json", ec)) dirs.push_back(e.path());
    std::sort(dirs.begin(), dirs.end());
    for (const auto& d : dirs) addPlugin(s, d, false);
    return true;
  }
  if (s.mode == "plugin") {
    addPlugin(s, root, true);
    if (s.plugins.empty()) return false;
    const Plugin& p = s.plugins.back();
    s.title = p.m.module.empty() ? p.m.name : p.m.module;
    s.description = p.m.description;
    s.home = true;
    return true;
  }
  // a project
  for (const auto& d : s.pagesDirs) addPages(s, root / d, "guide/", "Guides", nullptr);
  for (auto& pg : s.pages)   // the project's index page is the home page
    if (pg.url == "guide/index.html") { pg.url = "index.html"; s.bySrc[pg.src] = pg.url; s.home = true; }
  for (const auto& a : s.apiPaths) {
    const fs::path p = root / a;
    std::vector<fs::path> files;
    if (fs::is_regular_file(p, ec)) files.push_back(p);
    else if (fs::is_directory(p, ec)) {
      s.inputs.insert(norm(p));
      for (auto it = fs::recursive_directory_iterator(p, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
        if (it->is_directory()) { s.inputs.insert(norm(it->path())); continue; }
        const std::string n = it->path().filename().string(), e = it->path().extension().string();
        if ((e == ".ts" || e == ".tsx") && n.find(".test.") == std::string::npos && n.rfind("test-", 0) != 0) files.push_back(it->path());
      }
    }
    std::sort(files.begin(), files.end());
    for (const auto& f : files) {
      std::string name = fs::path(norm(f)).lexically_relative(root).generic_string();
      const std::string shown = name;
      name = name.substr(0, name.rfind('.'));
      if (name.size() > 2 && name.substr(name.size() - 2) == ".d") name.resize(name.size() - 2);
      std::vector<Module> mods;
      readModules(s, f, name, shown, mods);
      for (auto& m : mods) {
        if (m.items.empty()) continue;
        ApiPage ap;
        ap.title = m.name;
        ap.url = "api/" + moduleSlug(m.name) + ".html";
        ap.group = "API";
        ap.sections.emplace_back("", std::move(m));
        s.apis.push_back(std::move(ap));
      }
    }
  }
  // its plugins: those of its plugins/ folder, and the engine plugins its sources import
  const std::set<std::string> used = importedModules(root, s);
  std::vector<std::string> problems;
  for (const auto& fp : zn::frontend::discoverPlugins(s.engineRoot, s.root, problems)) {
    const bool own = norm(fp.dir).rfind(norm(root) + "/", 0) == 0;
    if (own || (!fp.manifest.module.empty() && used.count(fp.manifest.module))) addPlugin(s, fp.dir, false);
  }
  return true;
}

// ---- links and assets ----

std::string copyAsset(Site& s, const std::string& abs) {
  auto it = s.assets.find(abs);
  if (it != s.assets.end()) return it->second;
  std::string relp;
  for (const auto& [base, prefix] : std::vector<std::pair<std::string, std::string>>{{norm(s.root), "assets/"}, {norm(s.engineRoot), "assets/zinc/"}}) {
    const std::string r = fs::path(abs).lexically_relative(base).generic_string();
    if (!r.empty() && r.rfind("..", 0) != 0) { relp = prefix + r; break; }
  }
  if (relp.empty()) { std::uint32_t h = 2166136261u; for (char c : abs) h = (h ^ static_cast<unsigned char>(c)) * 16777619u; char b[16]; std::snprintf(b, sizeof b, "%08x", h); relp = std::string("assets/ext/") + b + "-" + fs::path(abs).filename().string(); }
  for (auto& c : relp) if (c == ' ') c = '-';
  s.assets[abs] = relp;
  s.inputs.insert(abs);
  return relp;
}

std::string decodeUrl(const std::string& u) {
  std::string o;
  for (std::size_t i = 0; i < u.size(); i++) {
    if (u[i] == '%' && i + 2 < u.size() && std::isxdigit(static_cast<unsigned char>(u[i + 1])) && std::isxdigit(static_cast<unsigned char>(u[i + 2]))) {
      o += static_cast<char>(std::stoi(u.substr(i + 1, 2), nullptr, 16));
      i += 2;
    } else o += u[i];
  }
  return o;
}

// A link or image written in the page `from` (whose source is `srcDir/...`): the URL to write, "" when it leads nowhere
std::string resolve(Site& s, const std::string& from, const std::string& srcDir, const std::string& raw, bool image, int& w, int& h) {
  if (raw.empty()) return {};
  if (raw[0] == '#') return raw;
  if (raw.find("://") != std::string::npos || raw.rfind("mailto:", 0) == 0 || raw.rfind("data:", 0) == 0 || raw.rfind("tel:", 0) == 0) return raw;
  std::string path = raw, frag;
  const std::size_t hash = path.find('#');
  if (hash != std::string::npos) { frag = path.substr(hash); path = path.substr(0, hash); }
  const std::size_t q = path.find('?');
  if (q != std::string::npos) path = path.substr(0, q);
  path = decodeUrl(path);
  const fs::path base = path[0] == '/' ? fs::path(s.root) : fs::path(srcDir);
  const std::string abs = norm(base / (path[0] == '/' ? path.substr(1) : path));
  std::error_code ec;
  auto page = [&](const std::string& a) -> std::string { auto it = s.bySrc.find(a); return it == s.bySrc.end() ? std::string() : rel(from, it->second) + frag; };
  if (std::string p = page(abs); !p.empty()) return p;
  if (fs::is_directory(abs, ec)) {
    for (const char* n : {"/index.md", "/index.mdx", "/README.md"}) if (std::string p = page(abs + n); !p.empty()) return p;
    return {};
  }
  if (!fs::is_regular_file(abs, ec)) return {};
  const std::string ext = fs::path(abs).extension().string();
  if (ext == ".md" || ext == ".mdx" || ext == ".ts" || ext == ".tsx" || ext == ".cpp" || ext == ".h") return {};   // outside the site
  const std::string out = copyAsset(s, abs);
  if (image) {
    std::string bytes;
    if (readText(abs, bytes)) zn::res::imageSize(reinterpret_cast<const std::uint8_t*>(bytes.data()), bytes.size(), w, h);
  }
  return rel(from, out) + frag;
}

PageCtx ctxFor(Site& s, const std::string& from, const std::string& srcDir) {
  PageCtx c;
  c.link = [&s, from, srcDir](const std::string& url, bool image, int& w, int& h) {
    std::string r = resolve(s, from, srcDir, url, image, w, h);
    if (r.empty()) warn(s, from + ": " + (image ? "image" : "link") + " '" + url + "' leads nowhere in the site");
    return r;
  };
  c.apiRef = [&s, from](const std::string& name) {
    auto it = s.symbols.find(name);
    return it == s.symbols.end() ? std::string() : rel(from, it->second);
  };
  return c;
}

// ---- rendering ----

const char* kindShort(const std::string& k) {
  static const std::map<std::string, const char*> m = {{"function", "fn"}, {"class", "cl"}, {"interface", "in"}, {"type", "ty"}, {"const", "co"}, {"enum", "en"},
                                                       {"namespace", "ns"}, {"method", "fn"}, {"property", "pr"}, {"getter", "ge"}, {"setter", "se"}, {"constructor", "new"}, {"call", "fn"}};
  auto it = m.find(k);
  return it == m.end() ? "·" : it->second;
}

std::string codeBlock(const std::string& code, const std::string& lang, const std::function<std::string(std::string_view)>& link) {
  return "<div class=\"code-block\"><pre><code>" + highlight(code, lang, link) + "</code></pre><button class=\"copy\" type=\"button\" aria-label=\"Copy\">Copy</button></div>\n";
}

void renderApi(Site& s, ApiPage& a, Page& pg) {
  pg.url = a.url;
  pg.title = a.title;
  pg.group = a.group;
  pg.kind = "api";
  const std::string srcDir = a.sections.empty() ? s.root : (fs::path(s.root) / a.sections.front().second.file).parent_path().string();
  PageCtx ctx = ctxFor(s, a.url, srcDir);
  auto md = [&](const std::string& text) { Rendered r = renderMarkdown(text, false, ctx, false); return r.html; };
  const auto typeLink = [&](std::string_view name) -> std::string {   // a name of this page first, then of the site
    for (const auto& sec : a.sections) { auto it = s.symbols.find(sec.second.name + "." + std::string(name)); if (it != s.symbols.end()) return rel(a.url, it->second); }
    auto it = s.symbols.find(std::string(name));
    return it == s.symbols.end() ? std::string() : rel(a.url, it->second);
  };
  std::string h;
  std::set<std::string> ids;
  static const std::vector<std::string> order = {"class", "interface", "function", "type", "const", "enum", "namespace"};
  for (auto& [title, m] : a.sections) {
    std::stable_sort(m.items.begin(), m.items.end(), [&](const Item& x, const Item& y) {
      return std::find(order.begin(), order.end(), x.kind) < std::find(order.begin(), order.end(), y.kind);
    });
    if (!title.empty()) {
      const std::string id = slugify(title);
      h += "<h2 id=\"" + id + "\">" + escapeHtml(title) + "<a class=\"anchor\" href=\"#" + id + "\">#</a></h2>\n";
      pg.toc.push_back({2, id, title});
    }
    h += "<p class=\"api-source\">" + escapeHtml(m.file) + "</p>\n";
    if (!m.overview.empty()) { h += md(docMarkdown(m.overview)); pg.text += m.overview + "\n"; }
    h += "<nav class=\"api-summary\">";
    for (const auto& it : m.items)
      h += "<a href=\"#" + escapeHtml(it.name) + "\"><span class=\"kind kind-" + it.kind + "\">" + kindShort(it.kind) + "</span>" + escapeHtml(it.name) + "</a>";
    h += "</nav>\n";
    for (const auto& it : m.items) {
      std::string id = it.name;
      for (int n = 2; ids.count(id); n++) id = it.name + "-" + std::to_string(n);
      ids.insert(id);
      h += "<section class=\"api-item\" id=\"" + escapeHtml(id) + "\"><h3><span class=\"kind kind-" + it.kind + "\">" + kindShort(it.kind) + "</span>" + escapeHtml(it.name) +
           "<a class=\"anchor\" href=\"#" + escapeHtml(id) + "\">#</a></h3>\n";
      h += codeBlock(it.sig, "ts", typeLink);
      if (!it.doc.empty()) h += md(docMarkdown(it.doc));
      pg.toc.push_back({3, id, it.name});
      s.search.push_back({it.name, a.url + "#" + id, a.title, firstSentence(it.doc), "api", it.kind});
      s.symbolCount++;
      if (!it.members.empty()) {
        h += "<div class=\"api-members\">\n";
        std::set<std::string> mids;
        for (const auto& mb : it.members) {
          std::string mid = id + "." + mb.name;
          for (int n = 2; mids.count(mid); n++) mid = id + "." + mb.name + "-" + std::to_string(n);
          mids.insert(mid);
          h += "<div class=\"api-member\" id=\"" + escapeHtml(mid) + "\"><h4><span class=\"kind kind-" + mb.kind + "\">" + kindShort(mb.kind) + "</span>" +
               escapeHtml(mb.name.empty() ? "(call)" : mb.name) + "</h4>" + codeBlock(mb.sig, "ts", typeLink);
          if (!mb.doc.empty()) h += "<div class=\"doc\">" + md(docMarkdown(mb.doc)) + "</div>";
          h += "</div>\n";
          if (!mb.name.empty()) s.search.push_back({it.name + "." + mb.name, a.url + "#" + mid, a.title, firstSentence(mb.doc), "api", mb.kind});
          s.symbolCount++;
        }
        h += "</div>\n";
      }
      h += "</section>\n";
      pg.text += it.name + " ";
    }
  }
  pg.html = h;
  for (auto& w : ctx.warnings) warn(s, a.url + ": " + w);
}

void symbolsOf(Site& s) {
  for (const auto& a : s.apis)
    for (const auto& [title, m] : a.sections) {
      std::set<std::string> ids;
      for (const auto& it : m.items) {
        std::string id = it.name;
        for (int n = 2; ids.count(id); n++) id = it.name + "-" + std::to_string(n);
        ids.insert(id);
        const std::string url = a.url + "#" + id;
        s.symbols.emplace(it.name, url);
        s.symbols.emplace(m.name + "." + it.name, url);
        for (const auto& mb : it.members) s.symbols.emplace(it.name + "." + mb.name, a.url + "#" + id + "." + mb.name);
      }
    }
}

void renderPage(Site& s, Page& pg) {
  if (pg.src.empty()) return;
  std::string src;
  if (!readText(pg.src, src)) { warn(s, pg.src + ": cannot be read"); return; }
  PageCtx ctx = ctxFor(s, pg.url, fs::path(pg.src).parent_path().string());
  Rendered r = renderMarkdown(src, pg.mdx, ctx);
  for (auto& w : ctx.warnings) warn(s, pg.url + ": " + w);
  pg.html = std::move(r.html);
  pg.text = std::move(r.text);
  pg.toc = std::move(r.toc);
  if (r.front.count("title")) pg.title = r.front["title"];
  else if (!r.title.empty()) pg.title = r.title;
  if (r.front.count("description")) pg.lead = r.front["description"];
}

// ---- the page frame ----

const char* kSearchIcon = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-3.5-3.5\"/></svg>";

std::string navHtml(const Site& s, const std::string& url) {
  std::string h;
  std::function<bool(const NavEntry&)> contains = [&](const NavEntry& e) {
    if (e.url == url) return true;
    for (const auto& k : e.kids) if (contains(k)) return true;
    return false;
  };
  std::function<void(const NavEntry&)> entry = [&](const NavEntry& e) {
    if (e.kids.empty()) {
      h += "<li><a href=\"" + escapeHtml(rel(url, e.url)) + "\"" + (e.url == url ? " class=\"current\" aria-current=\"page\"" : "") + ">" + escapeHtml(e.title) +
           (e.badge.empty() ? "" : "<span class=\"kind\">" + escapeHtml(e.badge) + "</span>") + "</a></li>";
      return;
    }
    h += std::string("<li><details") + (contains(e) ? " open" : "") + "><summary>" + escapeHtml(e.title) + "</summary><ul>";
    for (const auto& k : e.kids) entry(k);
    h += "</ul></details></li>";
  };
  for (const auto& g : s.nav) {
    h += "<div class=\"group\"><p class=\"group-title\">" + escapeHtml(g.title) + "</p><ul>";
    for (const auto& e : g.entries) entry(e);
    h += "</ul></div>";
  }
  return h;
}

std::string frame(const Site& s, const Page& pg, const std::string& body, const Page* prev, const Page* next, const std::string& crumbs) {
  const std::string root = rootOf(pg.url);
  const bool toc = pg.toc.size() >= 2;
  std::string h = "<!doctype html>\n<html lang=\"en\" data-root=\"" + root + "\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n";
  h += "<title>" + escapeHtml(pg.url == "index.html" ? s.title : pg.title + " · " + s.title) + "</title>\n";
  if (!pg.lead.empty()) h += "<meta name=\"description\" content=\"" + escapeHtml(pg.lead) + "\">\n";
  h += "<meta name=\"generator\" content=\"zinc doc\">\n";
  // an icon in the page itself: no request for /favicon.ico
  h += "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23b6e340'/%3E%3C/svg%3E\">\n";
  h += "<script>try{var t=localStorage.getItem('zdoc-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>\n";
  h += "<link rel=\"stylesheet\" href=\"" + root + "_zdoc/style.css\">\n";
  if (!s.theme.empty()) h += "<link rel=\"stylesheet\" href=\"" + root + "_zdoc/theme.css\">\n";
  h += "</head>\n<body>\n<header class=\"top\">\n";
  h += "<button class=\"icon-btn menu-btn\" type=\"button\" aria-label=\"Menu\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M4 7h16M4 12h16M4 17h16\"/></svg></button>\n";
  std::string initial = s.title.empty() ? "Z" : s.title.substr(s.title.rfind(':') == std::string::npos ? 0 : s.title.rfind(':') + 1, 1);
  for (auto& c : initial) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  h += "<a class=\"brand\" href=\"" + root + "index.html\"><span class=\"mark\">" + escapeHtml(initial) + "</span>" + escapeHtml(s.title) + "<span class=\"sub\">docs</span></a>\n";
  h += "<div class=\"spacer\"></div>\n<button class=\"search-btn\" type=\"button\">" + std::string(kSearchIcon) + "<span>Search</span><kbd>/</kbd></button>\n";
  h += "<button class=\"icon-btn theme-toggle\" type=\"button\" aria-label=\"Light or dark\"><svg class=\"moon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z\"/></svg>"
       "<svg class=\"sun\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/></svg></button>\n";
  h += "</header>\n";
  if (pg.url == "index.html" && !s.home) h += "<div class=\"hero-glow\"></div>\n";
  h += std::string("<div class=\"layout") + (toc ? "" : " no-toc") + "\">\n<nav class=\"sidebar\" aria-label=\"Site\">" + navHtml(s, pg.url) + "</nav>\n<main><article class=\"prose\">\n";
  if (!crumbs.empty()) h += "<div class=\"breadcrumb\">" + crumbs + "</div>\n";
  h += body;
  if (prev || next) {
    h += "<nav class=\"pager\">";
    if (prev) h += "<a class=\"prev\" href=\"" + escapeHtml(rel(pg.url, prev->url)) + "\"><small>Previous</small>" + escapeHtml(prev->title) + "</a>";
    if (next) h += "<a class=\"next\" href=\"" + escapeHtml(rel(pg.url, next->url)) + "\"><small>Next</small>" + escapeHtml(next->title) + "</a>";
    h += "</nav>\n";
  }
  h += "<footer class=\"foot\">Built with zinc doc.</footer>\n</article></main>\n";
  if (toc) {
    h += "<aside class=\"toc\"><p class=\"toc-title\">On this page</p><ul>";
    for (const auto& t : pg.toc) h += "<li class=\"l" + std::to_string(t.level) + "\"><a href=\"#" + escapeHtml(t.id) + "\">" + escapeHtml(t.text) + "</a></li>";
    h += "</ul></aside>\n";
  }
  h += "</div>\n<div class=\"search\" role=\"dialog\" aria-label=\"Search\"><div class=\"search-panel\"><div class=\"search-input\">" + std::string(kSearchIcon) +
       "<input type=\"search\" placeholder=\"Search the docs\" aria-label=\"Search\"><kbd>esc</kbd></div><ul class=\"search-results\"></ul></div></div>\n";
  h += "<script src=\"" + root + "_zdoc/search-index.js\" defer></script>\n<script src=\"" + root + "_zdoc/doc.js\" defer></script>\n</body>\n</html>\n";
  return h;
}

std::string card(const std::string& title, const std::string& href, const std::string& text, const std::string& icon = {}) {
  return "<div class=\"card\">" + (icon.empty() ? std::string() : "<span class=\"card-icon\">" + escapeHtml(icon) + "</span>") + "<p class=\"card-title\"><a href=\"" + escapeHtml(href) + "\">" +
         escapeHtml(title) + "</a></p><p>" + escapeHtml(text) + "</p></div>";
}

void buildNav(Site& s) {
  for (const auto& [title, prefix] : s.pageGroups) {   // the pages of each folder, sub-folders as entries with their pages under them
    NavGroup guides{title, {}};
    std::vector<Page*> gp;
    for (auto& p : s.pages) if (p.group == title && p.url != "index.html") gp.push_back(&p);
    std::stable_sort(gp.begin(), gp.end(), [](const Page* a, const Page* b) { return a->order != b->order ? a->order < b->order : a->url < b->url; });
    std::map<std::string, std::size_t> dirs;
    for (Page* p : gp) {
      const std::string r = p->url.substr(prefix.size());
      const std::size_t slash = r.find('/');
      if (slash == std::string::npos) { guides.entries.push_back({p->title, p->url, "", {}}); continue; }
      const std::string d = r.substr(0, slash);
      if (!dirs.count(d)) { dirs[d] = guides.entries.size(); guides.entries.push_back({pretty(d), "", "", {}}); }
      NavEntry& e = guides.entries[dirs[d]];
      if (p->url.size() > 11 && p->url.substr(p->url.size() - 11) == "/index.html") { e.title = p->title; e.kids.insert(e.kids.begin(), {"Overview", p->url, "", {}}); }
      else e.kids.push_back({p->title, p->url, "", {}});
    }
    if (!guides.entries.empty()) s.nav.push_back(std::move(guides));
  }
  std::map<std::string, NavGroup> apiGroups;
  std::vector<std::string> apiOrder;
  for (const auto& a : s.apis) {
    bool plugin = false;
    for (const auto& p : s.plugins) if (p.api != SIZE_MAX && &s.apis[p.api] == &a) plugin = true;
    if (plugin) continue;
    if (!apiGroups.count(a.group)) { apiGroups[a.group] = {a.group, {}}; apiOrder.push_back(a.group); }
    apiGroups[a.group].entries.push_back({a.title, a.url, "", {}});
  }
  for (const auto& g : apiOrder) s.nav.push_back(std::move(apiGroups[g]));
  if (s.mode == "plugin" && !s.plugins.empty()) {
    const Plugin& p = s.plugins.front();
    NavGroup g{"Plugin", {}};
    for (std::size_t i : p.pages) g.entries.push_back({s.pages[i].url == "index.html" ? "Overview" : s.pages[i].title, s.pages[i].url, "", {}});
    if (p.api != SIZE_MAX) g.entries.push_back({"API reference", s.apis[p.api].url, "", {}});
    s.nav.push_back(std::move(g));
    return;
  }
  if (!s.plugins.empty()) {
    NavGroup g{"Plugins", {}};
    for (const auto& p : s.plugins) {
      NavEntry e{p.m.name, "", "", {}};
      for (std::size_t i : p.pages) e.kids.push_back({s.pages[i].url == p.prefix + "index.html" ? "Overview" : s.pages[i].title, s.pages[i].url, "", {}});
      if (p.api != SIZE_MAX) e.kids.push_back({"API reference", s.apis[p.api].url, "", {}});
      g.entries.push_back(std::move(e));
    }
    s.nav.push_back(std::move(g));
  }
}

void flatten(const std::vector<NavEntry>& es, std::vector<std::string>& out) {
  for (const auto& e : es) { if (!e.url.empty()) out.push_back(e.url); flatten(e.kids, out); }
}

std::string homeBody(Site& s) {
  std::string h = "<div class=\"hero\"><h1>" + escapeHtml(s.title) + "</h1>";
  if (!s.description.empty()) h += "<p class=\"lead\">" + escapeHtml(s.description) + "</p>";
  std::vector<std::string> order;
  for (const auto& g : s.nav) flatten(g.entries, order);
  h += "<div class=\"actions\">";
  if (!s.pageGroups.empty() && !order.empty()) h += "<a class=\"btn primary\" href=\"" + escapeHtml(order.front()) + "\">Get started →</a>";
  if (!s.apis.empty()) h += "<a class=\"btn\" href=\"" + escapeHtml(s.apis.front().url) + "\">API reference</a>";
  h += "<button class=\"btn search-btn\" type=\"button\" style=\"min-width:0\">" + std::string(kSearchIcon) + "Search <kbd>/</kbd></button></div></div>\n";
  for (const auto& g : s.nav) {
    if (g.title == "Plugins") continue;
    h += "<h2 id=\"" + slugify(g.title) + "\">" + escapeHtml(g.title) + "</h2>\n<div class=\"cards\">";
    for (const auto& e : g.entries) {
      std::string url = e.url.empty() && !e.kids.empty() ? e.kids.front().url : e.url;
      std::string lead;
      for (const auto& p : s.pages) if (p.url == url) lead = p.lead.empty() ? excerpt(p.text, 110) : p.lead;
      for (const auto& a : s.apis) if (a.url == url && !a.sections.empty()) lead = firstSentence(a.sections.front().second.overview.empty() ? std::to_string(a.sections.front().second.items.size()) + " declarations" : a.sections.front().second.overview);
      h += card(e.title, url, lead);
    }
    h += "</div>\n";
  }
  if (!s.plugins.empty()) {
    h += "<h2 id=\"plugins\">Plugins</h2>\n<div class=\"cards\">";
    for (const auto& p : s.plugins) h += card(p.m.name, p.prefix + "index.html", excerpt(p.m.description, 120), p.m.name.substr(0, 1));
    h += "</div>\n";
  }
  return h;
}

std::string pluginHeader(const Site& s, const Plugin& p, const std::string& from) {
  std::string h = "<div class=\"plugin-meta\">";
  if (!p.m.module.empty()) h += "<span class=\"badge accent\">" + escapeHtml(p.m.module) + "</span>";
  for (const auto& t : p.m.targets) h += "<span class=\"badge\">" + escapeHtml(t) + "</span>";
  if (!p.m.license.empty()) h += "<span class=\"badge\">" + escapeHtml(p.m.license) + "</span>";
  if (p.api != SIZE_MAX) h += "<a class=\"badge\" href=\"" + escapeHtml(rel(from, s.apis[p.api].url)) + "\">API reference →</a>";
  h += "</div>\n";
  if (!p.m.module.empty() && p.api != SIZE_MAX) {
    std::string names;
    int n = 0;
    for (const auto& [title, m] : s.apis[p.api].sections) {
      if (!title.empty()) continue;
      for (const auto& it : m.items) if (n < 3 && (it.kind == "class" || it.kind == "function") && it.name.find("Error") == std::string::npos) { names += (n ? ", " : "") + it.name; n++; }
    }
    if (!names.empty()) h += codeBlock("import { " + names + " } from '" + p.m.module + "';", "ts", {});
  }
  return h;
}

bool writeSite(Site& s, std::string& err) {
  std::error_code ec;
  const fs::path out(s.out);
  if ((norm(s.root) + "/").rfind(norm(out) + "/", 0) == 0) { err = s.out + " holds the sources: choose another --out"; return false; }
  if (fs::exists(out, ec)) {
    if (!fs::is_directory(out, ec)) { err = s.out + " is a file"; return false; }
    if (!fs::is_empty(out, ec) && !fs::exists(out / "_zdoc", ec)) { err = s.out + " is not empty and was not made by zinc doc: choose another --out"; return false; }
    for (const auto& e : fs::directory_iterator(out, ec)) fs::remove_all(e.path(), ec);
  }
  fs::create_directories(out / "_zdoc", ec);
  if (ec) { err = "cannot write " + s.out + ": " + ec.message(); return false; }
  writeText(out / "_zdoc" / "style.css", kStyleCss);
  writeText(out / "_zdoc" / "doc.js", kDocJs);
  if (!s.theme.empty()) { std::string css; readText(s.theme, css); writeText(out / "_zdoc" / "theme.css", css); }
  std::string idx = "window.ZDOC_INDEX=[\n";
  for (const auto& e : s.search) {
    idx += "{\"t\":" + jsonStr(e.t) + ",\"u\":" + jsonStr(e.u) + (e.s.empty() ? "" : ",\"s\":" + jsonStr(e.s)) + (e.x.empty() ? "" : ",\"x\":" + jsonStr(e.x)) + ",\"k\":" + jsonStr(e.k) +
           (e.kind.empty() ? "" : ",\"kind\":" + jsonStr(e.kind)) + "},\n";
  }
  idx += "];\n";
  writeText(out / "_zdoc" / "search-index.js", idx);
  for (const auto& [abs, relp] : s.assets) {
    const fs::path dst = out / relp;
    fs::create_directories(dst.parent_path(), ec);
    std::string bytes;
    int w = 0, h = 0;
    // a screenshot wider than 2400 px is written at 2400 (twice the widest column): the site stays light on a modest machine
    if (readText(abs, bytes) && zn::res::imageSize(reinterpret_cast<const std::uint8_t*>(bytes.data()), bytes.size(), w, h) && w > 2400) {
      std::vector<std::uint8_t> rgba;
      if (zn::res::decodeRgba(reinterpret_cast<const std::uint8_t*>(bytes.data()), bytes.size(), w, h, rgba)) {
        const int nw = 2400, nh = static_cast<int>(static_cast<long long>(h) * nw / w);
        std::vector<std::uint8_t> small(static_cast<std::size_t>(nw) * nh * 4);
        // box filter: the copy is for reading, not for print
        for (int y = 0; y < nh; y++)
          for (int x = 0; x < nw; x++) {
            const int x0 = x * w / nw, x1 = std::max(x0 + 1, (x + 1) * w / nw), y0 = y * h / nh, y1 = std::max(y0 + 1, (y + 1) * h / nh);
            unsigned sum[4] = {0, 0, 0, 0}, n = 0;
            for (int yy = y0; yy < y1; yy++) for (int xx = x0; xx < x1; xx++) { for (int c = 0; c < 4; c++) sum[c] += rgba[(static_cast<std::size_t>(yy) * w + xx) * 4 + c]; n++; }
            for (int c = 0; c < 4; c++) small[(static_cast<std::size_t>(y) * nw + x) * 4 + c] = static_cast<std::uint8_t>(sum[c] / n);
          }
        const auto png = zn::res::encodePng(small.data(), nw, nh, 4);
        writeText(dst, std::string(png.begin(), png.end()));
        continue;
      }
    }
    fs::copy_file(abs, dst, fs::copy_options::overwrite_existing, ec);
  }
  // pages, in nav order for prev and next
  std::vector<std::string> order;
  for (const auto& g : s.nav) flatten(g.entries, order);
  std::map<std::string, const Page*> byUrl;
  for (const auto& p : s.pages) byUrl[p.url] = &p;
  for (const auto& p : s.pages) {
    const Page* prev = nullptr;
    const Page* next = nullptr;
    const auto it = std::find(order.begin(), order.end(), p.url);
    if (it != order.end()) {
      if (it != order.begin()) prev = byUrl[*(it - 1)];
      if (it + 1 != order.end()) next = byUrl[*(it + 1)];
    }
    std::string crumbs;
    std::string body;
    if (!p.crumb.empty()) crumbs = p.crumb;
    body += "<h1>" + escapeHtml(p.title) + "</h1>\n";
    if (!p.lead.empty()) body += "<p class=\"lead\">" + escapeHtml(p.lead) + "</p>\n";
    for (const auto& pl : s.plugins) if (p.url == pl.prefix + "index.html" && p.kind == "page") body += pluginHeader(s, pl, p.url);
    if (p.kind == "home") body = p.html; else body += p.html;
    if (!writeText(out / p.url, frame(s, p, body, p.kind == "home" ? nullptr : prev, p.kind == "home" ? nullptr : next, crumbs))) { err = "cannot write " + (out / p.url).string(); return false; }
  }
  return true;
}

// Everything: collect, render, write. `pagesCount` for the summary.
bool build(Site& s, std::string& err) {
  if (!collect(s)) { err = "nothing to document in " + s.root; return false; }
  symbolsOf(s);
  for (auto& p : s.pages) renderPage(s, p);
  for (auto& a : s.apis) { Page pg; renderApi(s, a, pg); s.pages.push_back(std::move(pg)); }
  buildNav(s);
  // breadcrumbs, and the search entries of pages and their sections
  for (auto& p : s.pages) {
    std::string group = p.group;
    for (const auto& pl : s.plugins) if (p.group == pl.m.name && s.mode != "plugin") group = "Plugins / " + pl.m.name;
    p.crumb = group.empty() || p.url == "index.html" ? "" : "<a href=\"" + escapeHtml(rootOf(p.url)) + "index.html\">Home</a><span>" + escapeHtml(group) + "</span>";
    if (p.kind == "api") continue;
    s.search.push_back({p.title, p.url, group, excerpt(p.lead.empty() ? p.text : p.lead + " " + p.text, 1200), "page", ""});
    for (const auto& t : p.toc) s.search.push_back({t.text, p.url + "#" + t.id, p.title, "", "heading", ""});
  }
  if (!s.home && !std::any_of(s.pages.begin(), s.pages.end(), [](const Page& p) { return p.url == "index.html"; })) {
    Page home;
    home.url = "index.html";
    home.title = s.title;
    home.kind = "home";
    home.html = homeBody(s);
    s.pages.push_back(std::move(home));
  }
  return writeSite(s, err);
}

// ---- --serve ----

std::uint64_t stamp(const std::set<std::string>& inputs) {
  std::uint64_t h = 1469598103934665603ull;
  std::error_code ec;
  for (const auto& p : inputs) {
    const auto t = fs::last_write_time(p, ec);
    const std::uint64_t v = ec ? 0 : static_cast<std::uint64_t>(t.time_since_epoch().count());
    const std::uint64_t n = ec || fs::is_directory(p, ec) ? 0 : static_cast<std::uint64_t>(fs::file_size(p, ec));
    h = (h ^ v) * 1099511628211ull;
    h = (h ^ n) * 1099511628211ull;
  }
  return h;
}

const char* mime(const std::string& ext) {
  static const std::map<std::string, const char*> m = {{".html", "text/html; charset=utf-8"}, {".css", "text/css; charset=utf-8"}, {".js", "text/javascript; charset=utf-8"},
                                                       {".json", "application/json"}, {".png", "image/png"}, {".jpg", "image/jpeg"}, {".jpeg", "image/jpeg"}, {".gif", "image/gif"},
                                                       {".svg", "image/svg+xml"}, {".webp", "image/webp"}, {".ico", "image/x-icon"}, {".txt", "text/plain; charset=utf-8"},
                                                       {".pdf", "application/pdf"}, {".mp4", "video/mp4"}, {".webm", "video/webm"}, {".woff2", "font/woff2"}};
  auto it = m.find(ext);
  return it == m.end() ? "application/octet-stream" : it->second;
}

void sendAll(int fd, const std::string& data) {
  std::size_t at = 0;
  while (at < data.size()) {
    const long n = zn::plat::sockWrite(fd, data.data() + at, data.size() - at);
    if (n <= 0) return;
    at += static_cast<std::size_t>(n);
  }
}

// One request (its head, read whole) answered from the folder `out`; the connection closes after it.
void answer(int fd, const std::string& req, const std::string& out, const std::string& version) {
  std::istringstream ls(req.substr(0, req.find("\r\n")));
  std::string method, target;
  ls >> method >> target;
  auto reply = [&](int code, const char* status, const char* type, const std::string& body) {
    std::string head = "HTTP/1.1 " + std::to_string(code) + " " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + std::to_string(body.size()) +
                       "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n";
    sendAll(fd, head + (method == "HEAD" ? std::string() : body));
  };
  if (method != "GET" && method != "HEAD") { reply(405, "Method Not Allowed", "text/plain", "GET only\n"); return; }
  std::string path = decodeUrl(target.substr(0, target.find_first_of("?#")));
  if (path == "/__zdoc/version") { reply(200, "OK", "text/plain", version); return; }
  if (path.empty() || path[0] != '/' || path.find("..") != std::string::npos || path.find('\0') != std::string::npos) { reply(400, "Bad Request", "text/plain", "bad path\n"); return; }
  fs::path file = fs::path(out) / path.substr(1);
  std::error_code ec;
  if (fs::is_directory(file, ec)) file /= "index.html";
  std::string body;
  if (!fs::is_regular_file(file, ec) || !readText(file, body)) { reply(404, "Not Found", "text/html; charset=utf-8", "<!doctype html><title>Not found</title><p>Not found: " + escapeHtml(path) + "</p>"); return; }
  reply(200, "OK", mime(file.extension().string()), body);
}

int serve(const std::function<bool(std::string&, std::size_t&)>& rebuild, const Site& site, int port, bool portGiven) {
#ifndef _WIN32
  std::signal(SIGPIPE, SIG_IGN);
#endif
  zn::plat::netInit();
  const int fd = static_cast<int>(::socket(AF_INET, SOCK_STREAM, 0));
  if (fd < 0) { std::fprintf(stderr, "zinc doc: no socket\n"); return 1; }
  int one = 1;
  ::setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&one), sizeof one);
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);   // this machine only
  bool bound = false;
  for (int i = 0; i < (portGiven ? 1 : 20) && !bound; i++) {
    a.sin_port = htons(static_cast<std::uint16_t>(port + (port ? i : 0)));
    bound = ::bind(fd, reinterpret_cast<sockaddr*>(&a), sizeof a) == 0;
  }
  if (!bound || ::listen(fd, 16) != 0) { std::fprintf(stderr, "zinc doc: port %d is taken (--port another, or --port 0 for any free one)\n", port); zn::plat::sockClose(fd); return 1; }
  socklen_t len = sizeof a;
  ::getsockname(fd, reinterpret_cast<sockaddr*>(&a), &len);
  const int actual = ntohs(a.sin_port);
  std::printf("zinc doc: serving %s\n  http://127.0.0.1:%d/\n  (pages rebuild when their sources change; Ctrl-C stops)\n", site.out.c_str(), actual);
  std::fflush(stdout);
  std::set<std::string> inputs = site.inputs;
  std::uint64_t seen = stamp(inputs);
  const std::string out = site.out;
  int version = 1;
  auto last = std::chrono::steady_clock::now();
  // the connections a browser opens ahead (and keeps idle) wait in `clients` without holding up the others
  struct Client { int fd; std::string req; std::chrono::steady_clock::time_point since; };
  std::vector<Client> clients;
  for (;;) {
    using Sock = decltype(pollfd::fd);   // a SOCKET on Windows
    std::vector<pollfd> fds{{static_cast<Sock>(fd), POLLIN, 0}};
    for (const auto& c : clients) fds.push_back({static_cast<Sock>(c.fd), POLLIN, 0});
    if (zn::plat::sockPoll(fds.data(), static_cast<unsigned>(fds.size()), 300) > 0) {
      for (std::size_t i = fds.size(); i-- > 1;) {
        if (!(fds[i].revents & (POLLIN | POLLHUP | POLLERR))) continue;
        Client& c = clients[i - 1];
        char buf[4096];
        const long n = zn::plat::sockRead(c.fd, buf, sizeof buf);
        if (n > 0) c.req.append(buf, static_cast<std::size_t>(n));
        const bool whole = c.req.find("\r\n\r\n") != std::string::npos;
        if (whole) answer(c.fd, c.req, out, std::to_string(version));
        if (whole || n <= 0 || c.req.size() > 16384) { zn::plat::sockClose(c.fd); clients.erase(clients.begin() + static_cast<std::ptrdiff_t>(i - 1)); }
      }
      if (fds[0].revents & POLLIN) {
        const int c = static_cast<int>(::accept(fd, nullptr, nullptr));
        if (c >= 0) clients.push_back({c, {}, std::chrono::steady_clock::now()});
      }
    }
    const auto now = std::chrono::steady_clock::now();
    for (std::size_t i = clients.size(); i-- > 0;)
      if (now - clients[i].since > std::chrono::seconds(10)) { zn::plat::sockClose(clients[i].fd); clients.erase(clients.begin() + static_cast<std::ptrdiff_t>(i)); }
    if (now - last < std::chrono::milliseconds(500)) continue;
    last = now;
    const std::uint64_t st = stamp(inputs);
    if (st == seen) continue;
    std::string err;
    std::size_t pages = 0;
    if (rebuild(err, pages)) version++;
    else std::fprintf(stderr, "zinc doc: %s\n", err.c_str());
    std::fflush(stdout);
    inputs = site.inputs;   // rebuild replaced the site: new pages are watched too
    seen = stamp(inputs);
  }
}

// `zinc doc --cheatsheet`: one page from lib/*.d.ts (raylib's cheatsheet), one line per export with its signature and the first sentence of
// its comment, grouped by module. Generated, so it never drifts from the declarations (tests/t0/cheatsheet.sh diffs docs/cheatsheet.md).
std::string cheatsheet(const fs::path& root) {
  std::string md =
      "# Cheat sheet\n\n"
      "Every function of the engine's modules on one page: its signature and what it does. Import a module with "
      "`import * as gfx from 'zinc:gfx'` (or name the functions you use). The full reference with every comment is `zinc doc --std`.\n\n"
      "<!-- Generated by `zinc doc --cheatsheet --out docs/cheatsheet.md` from lib/*.d.ts: edit the declarations, not this page. -->\n";
  for (const char* d : {"gfx.d.ts", "modules.d.ts", "zinc.d.ts"}) {
    std::string src;
    if (!readText(root / "lib" / d, src)) continue;
    const bool globals = std::string(d) == "zinc.d.ts";
    for (const auto& m : extractApi(src, globals ? "Globals" : "", std::string("lib/") + d, false, true)) {
      if (m.name.empty()) continue;
      std::string lines;
      auto line = [&](std::string sig, const std::string& doc) {
        for (auto& c : sig) if (c == '\n') c = ' ';
        for (const char* k : {"declare ", "function "}) if (sig.rfind(k, 0) == 0) sig.erase(0, std::strlen(k));   // the keywords say nothing more here
        std::string note = firstSentence(doc);
        if (note.rfind("---", 0) == 0) note.clear();   // a section rule of the file (// ---- Zinc intrinsics ----), not a comment of this one
        lines += "- `" + sig + "`" + (note.empty() ? "" : " " + note) + "\n";
      };
      for (const auto& it : m.items) {
        if (it.kind == "interface" || it.kind == "type" || it.kind == "namespace") continue;
        if (globals && it.kind != "function") {
          // `declare var Math: Math`: the members of its interface (Math.floor, JSON.parse...) are what a beginner calls; the
          // constructors of the checker's types (Array, String...) say nothing more
          const std::size_t colon = it.sig.rfind(": ");
          const std::string type = colon == std::string::npos ? "" : it.sig.substr(colon + 2);
          for (const auto& t : m.items)
            if (t.kind == "interface" && t.name == type && type.find("Constructor") == std::string::npos)
              for (const auto& mb : t.members) if (mb.kind == "method" || mb.kind == "property") line(it.name + "." + (mb.sig.rfind("readonly ", 0) == 0 ? mb.sig.substr(9) : mb.sig), mb.doc);
          if (it.sig.rfind("declare const ", 0) == 0) line(it.sig, it.doc);
          continue;
        }
        line(it.sig.empty() ? it.name : it.sig, it.doc);
      }
      if (!lines.empty()) md += "\n## " + m.name + "\n\n" + lines;
    }
  }
  return md;
}

int usage() {
  std::fprintf(stderr, "usage: zinc doc [dir] [--std] [--out dir] [--serve [--port n]]\n       zinc doc --cheatsheet [--out file]\n");
  return 2;
}

}  // namespace

int run(const std::vector<std::string>& args, const std::string& engineRoot) {
  std::string dir = ".", out;
  bool std_ = false, serveIt = false, portGiven = false, sheet = false;
  int port = 7878;
  for (std::size_t i = 2; i < args.size(); i++) {
    const std::string& a = args[i];
    if (a == "--std") std_ = true;
    else if (a == "--cheatsheet") sheet = true;
    else if (a == "--serve") serveIt = true;
    else if ((a == "--out" || a == "-o") && i + 1 < args.size()) out = args[++i];
    else if (a == "--port" && i + 1 < args.size()) { port = std::atoi(args[++i].c_str()); portGiven = true; }
    else if (!a.empty() && a[0] == '-') return usage();
    else dir = a;
  }
  if (sheet) {
    const std::string md = cheatsheet(engineRoot);
    if (out.empty()) { std::fputs(md.c_str(), stdout); return 0; }
    if (!writeText(out, md)) { std::fprintf(stderr, "zinc doc: cannot write %s\n", out.c_str()); return 1; }
    return 0;
  }
  std::error_code ec;
  Site base;
  base.engineRoot = norm(engineRoot);
  base.root = norm(std_ ? engineRoot : dir);
  const fs::path root(base.root);
  if (!fs::is_directory(root, ec)) { std::fprintf(stderr, "zinc doc: %s is not a directory\n", dir.c_str()); return 2; }
  if (std_ || (!fs::exists(root / "zinc.json", ec) && fs::is_directory(root / "lib" / "std", ec) && fs::is_directory(root / "plugins", ec))) base.mode = "engine";
  else if (!fs::exists(root / "zinc.json", ec) && fs::exists(root / "plugin.json", ec)) base.mode = "plugin";
  else base.mode = "project";
  // zinc.json "doc": { "title", "description", "pages", "api", "theme" }
  std::string zj;
  base.pagesDirs = {"docs"};
  base.apiPaths = {"src"};
  if (readText(root / "zinc.json", zj)) {
    base.inputs.insert(norm(root / "zinc.json"));
    if (yyjson_doc* d = yyjson_read(zj.data(), zj.size(), 0)) {
      yyjson_val* r = yyjson_doc_get_root(d);
      auto str = [](yyjson_val* o, const char* k) { yyjson_val* v = yyjson_obj_get(o, k); return yyjson_is_str(v) ? std::string(yyjson_get_str(v)) : std::string(); };
      auto list = [](yyjson_val* o, const char* k, std::vector<std::string>& into) {
        yyjson_val* v = yyjson_obj_get(o, k);
        if (yyjson_is_str(v)) into = {yyjson_get_str(v)};
        else if (yyjson_is_arr(v)) { into.clear(); std::size_t i, n; yyjson_val* e; yyjson_arr_foreach(v, i, n, e) if (yyjson_is_str(e)) into.emplace_back(yyjson_get_str(e)); }
      };
      base.title = str(r, "name");
      base.description = str(r, "description");
      if (yyjson_val* doc = yyjson_obj_get(r, "doc"); yyjson_is_obj(doc)) {
        if (!str(doc, "title").empty()) base.title = str(doc, "title");
        if (!str(doc, "description").empty()) base.description = str(doc, "description");
        list(doc, "pages", base.pagesDirs);
        list(doc, "api", base.apiPaths);
        if (!str(doc, "theme").empty()) base.theme = norm(root / str(doc, "theme"));
      }
      yyjson_doc_free(d);
    }
  }
  if (base.title.empty()) base.title = root.filename().string();
  if (base.theme.empty()) for (const char* t : {"docs/theme.css", "theme.css"}) if (fs::is_regular_file(root / t, ec) && base.mode != "engine") { base.theme = norm(root / t); break; }
  if (!base.theme.empty()) base.inputs.insert(base.theme);
  if (out.empty()) out = std_ && base.root != norm(fs::current_path()) ? (fs::path(zn::tc::home()) / "doc" / "std").string() : (root / "build" / "doc").string();
  base.out = norm(out);

  Site site;
  std::size_t pagesCount = 0;
  auto once = [&](std::string& err, std::size_t& pages) {
    const auto t0 = std::chrono::steady_clock::now();
    site = base;
    if (!build(site, err)) return false;
    pages = site.pages.size();
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    std::printf("zinc doc: %zu pages, %d symbols, %zu plugins in %.0f ms -> %s\n", pages, site.symbolCount, site.plugins.size(), ms, (fs::path(site.out) / "index.html").string().c_str());
    if (!site.warnings.empty()) {
      std::fprintf(stderr, "zinc doc: %zu warnings (links to pages outside the site keep their text only)\n", site.warnings.size());
      const bool all = std::getenv("ZINC_DOC_WARNINGS") != nullptr;
      for (std::size_t i = 0; i < site.warnings.size() && (all || i < 8); i++) std::fprintf(stderr, "  %s\n", site.warnings[i].c_str());
      if (!all && site.warnings.size() > 8) std::fprintf(stderr, "  ... ZINC_DOC_WARNINGS=1 lists them all\n");
    }
    std::fflush(stdout);
    return true;
  };
  std::string err;
  if (!once(err, pagesCount)) { std::fprintf(stderr, "zinc doc: %s\n", err.c_str()); return 1; }
  if (!serveIt) return 0;
  return serve(once, site, port, portGiven);
}

}  // namespace zn::doc
