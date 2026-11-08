// zinc help <name>, --search, --index, --docs (ZN-774.27): help at hand, offline. A standard-library name prints its doc comment, its
// signature and one example, read from lib/*.d.ts and lib/std (as zinc doc does) and from the docs' code; the lessons, guides, error
// explanations and API pages are the engine's own docs built once by `zinc doc --std` into $ZINC_HOME/docs/<version>/ (stamped, rebuilt
// for another version, nothing fetched); --search and --index read that site's search index plus the commands, the one list Atelier's help
// box shows.
#include "doc/doc.h"
#include "doc/internal.h"
#include "frontend/modules.h"
#include "tc/tc.h"
#include "yyjson.h"
#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#ifdef _WIN32
#include <io.h>
#define dup _dup
#define dup2 _dup2
#define close _close
#else
#include <fcntl.h>
#include <unistd.h>
#endif

namespace zn::doc {
namespace {
namespace fs = std::filesystem;

std::string slurp(const fs::path& p) { std::ifstream f(p, std::ios::binary); std::stringstream ss; ss << f.rdbuf(); return ss.str(); }
std::string lower(std::string s) { for (auto& c : s) c = (char)std::tolower((unsigned char)c); return s; }
std::string trim(const std::string& s) {
  std::size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
  return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}
bool wordAt(const std::string& s, std::size_t at, std::size_t n) {   // s[at, at+n) is a whole identifier
  auto id = [](char c) { return std::isalnum((unsigned char)c) || c == '_' || c == '$'; };
  return (at == 0 || (!id(s[at - 1]) && s[at - 1] != '.')) && (at + n >= s.size() || !id(s[at + n]));
}

struct Found { std::string module, page, sig, doc; };
// The declaration of `name` (a function, a class, a const... or Type.member) in the standard library: lib/std modules, then lib/*.d.ts.
bool lookup(const fs::path& root, const std::string& name, Found& f) {
  std::vector<std::pair<fs::path, std::string>> files;
  for (std::string_view spec : zn::frontend::stdModuleSpecs()) files.emplace_back(root / "lib" / "std" / std::string(zn::frontend::stdModuleFile(spec)), std::string(spec));
  for (const char* d : {"gfx.d.ts", "modules.d.ts", "zinc.d.ts"}) files.emplace_back(root / "lib" / d, std::string(d) == "zinc.d.ts" ? "Globals" : "");
  const std::size_t dot = name.find('.');
  const std::string head = dot == std::string::npos ? name : name.substr(0, dot), tail = dot == std::string::npos ? "" : name.substr(dot + 1);
  for (const auto& [file, spec] : files) {
    const std::string src = slurp(file);
    if (src.empty() || src.find(head) == std::string::npos) continue;
    const std::string ext = file.extension().string();
    const bool dts = file.string().size() > 5 && file.string().compare(file.string().size() - 5, 5, ".d.ts") == 0;
    for (const auto& m : extractApi(src, spec, file.filename().string(), ext == ".tsx", dts)) {
      if (m.name.empty()) continue;
      std::string slug = m.name.rfind("zinc:", 0) == 0 ? m.name.substr(5) : m.name;
      for (auto& c : slug) if (c == '/' || c == ':' || c == '@' || c == ' ') c = '-';
      for (const auto& it : m.items) {
        if (it.name != head) continue;
        if (tail.empty()) { f = {m.name, "api/" + slug + ".html#" + it.name, it.sig.empty() ? it.name : it.sig, it.doc}; return true; }
        for (const auto& mb : it.members)
          if (mb.name == tail) { f = {m.name, "api/" + slug + ".html#" + name, mb.sig, mb.doc}; return true; }
      }
    }
  }
  return false;
}

// What the docs say of `name` when its declaration has no comment: the reference table row that starts with it (`name(...)` | what it does |).
std::string tableText(const fs::path& root, const std::string& name) {
  std::error_code ec;
  for (const char* d : {"reference", ""}) {
    const fs::path dir = root / "docs" / d;
    if (!fs::is_directory(dir, ec)) continue;
    std::vector<fs::path> mds;
    for (const auto& e : fs::directory_iterator(dir, ec)) if (e.path().extension() == ".md") mds.push_back(e.path());
    std::sort(mds.begin(), mds.end());
    for (const auto& p : mds) {
      std::istringstream in(slurp(p));
      for (std::string l; std::getline(in, l);) {
        if (l.rfind("| `", 0) != 0) continue;
        const std::size_t end = l.find(" | ", 2);
        if (end == std::string::npos) continue;
        const std::string cell = l.substr(2, end - 2);
        const std::size_t at = cell.find("`" + name);
        if (at == std::string::npos || !wordAt(cell, at + 1, name.size())) continue;
        const std::size_t next = l.find(" |", end + 3);
        return trim(l.substr(end + 3, next == std::string::npos ? std::string::npos : next - end - 3));
      }
    }
  }
  return "";
}

// One line of code that uses `name`: the doc comment's @example first, else the first call in a code block of the reference, the
// lessons or the start pages (not an import, not its own declaration).
std::string exampleOf(const fs::path& root, const std::string& name, const std::string& doc, std::string& from) {
  const std::size_t ex = doc.find("@example");
  if (ex != std::string::npos) {
    std::istringstream in(doc.substr(ex + 8));
    for (std::string l; std::getline(in, l);) if (!trim(l).empty() && trim(l).rfind("```", 0) != 0) { from = "its doc comment"; return trim(l); }
  }
  std::error_code ec;
  const std::string call = (name.find('.') == std::string::npos ? name : name.substr(name.find('.') + 1)) + "(";
  for (const char* d : {"reference", "learn", "start", "guide"}) {
    std::vector<fs::path> mds;
    for (const auto& e : fs::directory_iterator(root / "docs" / d, ec)) if (e.path().extension() == ".md") mds.push_back(e.path());
    std::sort(mds.begin(), mds.end());
    for (const auto& p : mds) {
      std::istringstream in(slurp(p));
      bool code = false;
      for (std::string l; std::getline(in, l);) {
        if (trim(l).rfind("```", 0) == 0) { code = !code; continue; }
        if (!code) continue;
        const std::string t = trim(l);
        const std::size_t at = t.find(call);
        if (at == std::string::npos || !wordAt(t, at, call.size() - 1) || t.rfind("import", 0) == 0 || t.find("function " + call) != std::string::npos) continue;
        from = fs::path(p).lexically_relative(root).generic_string();
        return t;
      }
    }
  }
  return "";
}

// The doc comment as plain lines: no JSDoc tags after the text, no Markdown backquotes.
std::string plain(const std::string& doc) {
  std::string s = doc.substr(0, doc.find("\n@"));
  if (s.rfind("@", 0) == 0) s.clear();
  s.erase(std::remove(s.begin(), s.end(), '`'), s.end());
  return trim(s);
}

/** The engine's docs as a site, built once per version: <home>/docs/<version>/ with VERSION; "" when it cannot be built. */
std::string offlineDocs(const std::string& root, const std::string& version) {
  const fs::path dir = fs::path(zn::tc::home()) / "docs" / (version.empty() ? "dev" : version);
  std::error_code ec;
  if (slurp(dir / "VERSION") == version + "\n" && fs::exists(dir / "_zdoc" / "search-index.js", ec)) return dir.string();
  fs::remove_all(dir, ec);
  fs::create_directories(dir.parent_path(), ec);
  // zinc doc prints its summary and warnings: here they are noise, the caller prints where the docs are
  std::fflush(stdout); std::fflush(stderr);
  const int out = dup(1), err = dup(2);
#ifdef _WIN32
  FILE* nul = std::fopen("NUL", "w");
#else
  FILE* nul = std::fopen("/dev/null", "w");
#endif
  if (nul) { dup2(fileno(nul), 1); dup2(fileno(nul), 2); }
  const int rc = run({"zinc", "doc", "--std", "--out", dir.string()}, root);
  std::fflush(stdout); std::fflush(stderr);
  if (out >= 0) { dup2(out, 1); close(out); }
  if (err >= 0) { dup2(err, 2); close(err); }
  if (nul) std::fclose(nul);
  if (rc != 0) return "";
  std::ofstream(dir / "VERSION") << version << "\n";
  return dir.string();
}

struct Entry { std::string title, section, path, kind; };   // kind: page, heading, api, command; path: a page of the docs, or `zinc <cmd>`
std::vector<Entry> indexOf(const std::string& docs, const std::vector<std::pair<std::string, std::string>>& commands) {
  std::vector<Entry> out;
  for (const auto& [n, s] : commands) out.push_back({n, s, "zinc " + n, "command"});
  std::string js = slurp(fs::path(docs) / "_zdoc" / "search-index.js");
  const std::size_t a = js.find('['), b = js.rfind(']');
  if (a == std::string::npos || b == std::string::npos) return out;
  yyjson_doc* d = yyjson_read(js.data() + a, b - a + 1, YYJSON_READ_ALLOW_INVALID_UNICODE | YYJSON_READ_ALLOW_TRAILING_COMMAS);   // JavaScript: a comma after the last entry; an excerpt cut at 1200 bytes can split a character
  if (!d) return out;
  yyjson_val* arr = yyjson_doc_get_root(d);
  std::size_t i, n;
  yyjson_val* v;
  auto str = [](yyjson_val* o, const char* k) { const char* s = yyjson_get_str(yyjson_obj_get(o, k)); return std::string(s ? s : ""); };
  yyjson_arr_foreach(arr, i, n, v) out.push_back({str(v, "t"), str(v, "s"), str(v, "u"), str(v, "k")});
  yyjson_doc_free(d);
  return out;
}

// How well an entry answers a query: the whole title, then a title that starts with it, then a title that has every word of it, then the
// section. Lessons and pages first among equals, then the error codes and guides' headings, commands, the API last (it is the largest).
int score(const Entry& e, const std::string& q) {
  const std::string t = lower(e.title), s = lower(e.section);
  int base = 0;
  std::string bare = t.size() > 3 && t.find(". ") != std::string::npos && std::isdigit((unsigned char)t[0]) ? t.substr(t.find(". ") + 2) : t;   // "1. A window and a shape"
  if (bare.rfind("the ", 0) == 0 && q.rfind("the ", 0) != 0) bare.erase(0, 4);   // "3. The keyboard" answers "keyboard"
  const std::string code = t.substr(0, t.find(':'));   // "z0103: type is not assignable"
  if (t == q || bare == q || code == q || t == "zinc:" + q) base = 1000;
  else if (t.rfind(q, 0) == 0 || bare.rfind(q, 0) == 0) base = 600;
  else {
    std::istringstream in(q);
    bool all = true;
    for (std::string w; in >> w;) if (t.find(w) == std::string::npos) all = false;
    if (all) base = 300;
    else if (s.find(q) != std::string::npos) base = 100;
    else return 0;
  }
  const int kind = e.kind == "page" ? 40 : e.kind == "heading" ? 30 : e.kind == "command" ? 20 : 0;
  return base + kind - (int)std::min<std::size_t>(t.size(), 19);
}

int usage() {
  std::fprintf(stderr, "usage: zinc help <name> | zinc help --search <words> | zinc help --index | zinc help --docs [page]\n");
  return 2;
}
}  // namespace

int help(const std::vector<std::string>& args, const std::string& root, const std::vector<std::pair<std::string, std::string>>& commands, const std::string& version) {
  if (args.size() < 3) return usage();
  const std::string& a = args[2];
  if (a == "--docs") {   // the offline docs: the folder, or one page of it
    const std::string docs = offlineDocs(root, version);
    if (docs.empty()) { std::fprintf(stderr, "zinc help: the docs cannot be built from %s\n", root.c_str()); return 1; }
    std::printf("%s\n", (fs::path(docs) / (args.size() > 3 ? args[3] : "index.html")).string().c_str());
    return 0;
  }
  if (a == "--index" || a == "--search") {
    const std::string docs = offlineDocs(root, version);
    const auto all = indexOf(docs, commands);
    if (a == "--index") {   // kind, title, section, path: tab-separated, one entry a line (Atelier's help box)
      for (const auto& e : all) std::printf("%s\t%s\t%s\t%s\n", e.kind.c_str(), e.title.c_str(), e.section.c_str(), e.kind == "command" ? e.path.c_str() : (docs + "/" + e.path).c_str());
      return 0;
    }
    std::string q;
    for (std::size_t i = 3; i < args.size(); i++) q += (q.empty() ? "" : " ") + args[i];
    q = lower(trim(q));
    if (q.empty()) return usage();
    std::vector<std::pair<int, const Entry*>> hits;
    for (const auto& e : all) if (int s = score(e, q)) hits.emplace_back(s, &e);
    std::stable_sort(hits.begin(), hits.end(), [](const auto& x, const auto& y) { return x.first > y.first; });
    if (hits.empty()) { std::fprintf(stderr, "zinc help: nothing found for \"%s\"\n", q.c_str()); return 1; }
    for (std::size_t i = 0; i < hits.size() && i < 8; i++) {
      const Entry& e = *hits[i].second;
      std::printf("%-8s %s  (%s)  %s\n", e.kind.c_str(), e.title.c_str(), e.section.c_str(), e.kind == "command" ? ("zinc help " + e.title).c_str() : e.path.c_str());
    }
    return 0;
  }
  if (a[0] == '-') return usage();
  Found f;
  if (!lookup(root, a, f)) {
    std::fprintf(stderr, "zinc help: %s is not a command nor a name of the standard library. zinc help --search %s looks in the docs.\n", a.c_str(), a.c_str());
    return 2;
  }
  std::string sig = f.sig;
  for (const char* k : {"declare ", "export ", "function "}) if (sig.rfind(k, 0) == 0) sig.erase(0, std::strlen(k));
  std::replace(sig.begin(), sig.end(), '\n', ' ');
  std::string text = plain(f.doc);
  if (text.empty()) text = tableText(root, a.substr(a.find('.') == std::string::npos ? 0 : a.find('.') + 1));
  std::string from;
  const std::string ex = exampleOf(root, a, f.doc, from);
  std::printf("%s  (%s)\n\n  %s\n", a.c_str(), f.module.c_str(), sig.c_str());
  if (!text.empty()) std::printf("\n%s\n", text.c_str());
  if (!ex.empty()) std::printf("\nExample (%s):\n  %s\n", from.c_str(), ex.c_str());
  std::printf("\nMore: zinc help --docs %s\n", f.page.c_str());
  return 0;
}

}  // namespace zn::doc
