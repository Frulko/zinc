// zinc examples and the example:<name> names (ZN-774.33): the graded catalogue learn/catalog.txt, one line per example
// (name|stars|module|path|title|line|lesson, docs in the file), read here, by Atelier's start view and by tests/t1/examples_catalog.sh.
// The folders it names ship in the release archive (tools/package), so example:<name> works the same in the repository and installed.
#include "cli_core.h"
#include "frontend/diagnostics.h"
#include "i18n/i18n.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace zn::cli {
namespace {
namespace fs = std::filesystem;
using zn::i18n::tr;

const char* const kModules[] = {"drawing", "scene", "canvas", "interface"};

std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  std::string cur;
  std::istringstream is(s);
  while (std::getline(is, cur, sep)) out.push_back(cur);
  if (!s.empty() && s.back() == sep) out.emplace_back();
  return out;
}
std::string stars(int n) {
  std::string s;
  for (int i = 0; i < 4; ++i) s += i < n ? "\xE2\x98\x85" : "\xE2\x98\x86";   // ★ ☆
  return s;
}
}  // namespace

std::vector<CatalogEntry> readCatalog(const std::string& engineRoot) {
  std::vector<CatalogEntry> out;
  std::ifstream f(fs::path(engineRoot) / "learn" / "catalog.txt");
  for (std::string line; std::getline(f, line);) {
    if (line.empty() || line[0] == '#') continue;
    const std::vector<std::string> p = split(line, '|');
    if (p.size() < 6) continue;
    out.push_back({p[0], std::atoi(p[1].c_str()), p[2], p[3], p[4], p[5], p.size() > 6 ? p[6] : ""});
  }
  return out;
}

std::string exampleDir(const std::string& spec, const std::string& engineRoot, std::string& err) {
  const std::string name = spec.substr(spec.find(':') + 1);
  const std::vector<CatalogEntry> all = readCatalog(engineRoot);
  std::vector<std::string> names;
  for (const CatalogEntry& e : all) {
    if (e.name == name) return (fs::path(engineRoot) / e.path).lexically_normal().string();
    names.push_back(e.name);
  }
  const std::string guess = zn::frontend::nearest(name, names);
  err = guess.empty() ? tr("cli.examples.none", {{"name", name}}) : tr("cli.examples.guess", {{"name", name}, {"guess", "example:" + guess}});
  return "";
}

int examples(const std::vector<std::string>& args, const std::string& engineRoot) {
  const std::string only = args.size() > 2 ? args[2] : "";
  const std::vector<CatalogEntry> all = readCatalog(engineRoot);
  if (all.empty()) { std::fprintf(stderr, "%s\n", tr("cli.examples.missing", {{"path", (fs::path(engineRoot) / "learn" / "catalog.txt").string()}}).c_str()); return 1; }
  bool shown = false;
  for (const char* m : kModules) {
    if (!only.empty() && only != m) continue;
    std::printf("%s%s\n", shown ? "\n" : "", m);
    shown = true;
    for (int s = 1; s <= 4; ++s)   // by grade, then in the catalogue's order
      for (const CatalogEntry& e : all)
        if (e.module == m && e.stars == s) {
          std::string name = e.name;
          if (name.size() < 34) name += std::string(34 - name.size(), ' ');
          std::printf("  %s %s %s\n", stars(e.stars).c_str(), name.c_str(), e.line.c_str());
        }
  }
  if (!shown) { std::fprintf(stderr, "%s\n", tr("cli.examples.module", {{"module", only}}).c_str()); return 2; }
  std::printf("\n%s\n", tr("cli.examples.how").c_str());
  return 0;
}

}  // namespace zn::cli
