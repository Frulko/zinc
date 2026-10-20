// Dependency pre-bundling for zinc dev --target web (cli_web_deps.h).
#include "cli_web_deps.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>

#include "cli_pm.h"
#include "qjs/qjs.h"
#include "tc/tc.h"
#include "yyjson.h"

namespace fs = std::filesystem;

namespace zn::cli {
namespace {

std::string readAll(const fs::path& p) { std::ifstream in(p, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
std::string q(const std::string& s) { std::string r = "'"; for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; } return r + "'"; }
std::string js(const std::string& s) { std::string r = "\""; for (char c : s) { if (c == '"' || c == '\\') r += '\\'; r += c; } return r + "\""; }

struct Pkg { std::string spec, id; std::vector<std::string> names; bool def = false, all = false; };

// the stub esbuild bundles for one package: it exports what the program imports from it, so a CommonJS package gets real named exports
std::string stubOf(const Pkg& p) {
  std::string t;
  if (p.all) t += "export * from " + js(p.spec) + ";\nimport * as __ns from " + js(p.spec) + ";\nexport { __ns as __zincNs };\n";   // the dev server turns `import * as x` into `import { __zincNs as x }`: esbuild's namespace, with a CommonJS package's names too
  std::string list;
  for (const std::string& n : p.names) list += (list.empty() ? "" : ", ") + n;
  if (!list.empty()) t += "export { " + list + " } from " + js(p.spec) + ";\n";
  if (p.def) t += "export { default } from " + js(p.spec) + ";\n";
  return t.empty() ? "import " + js(p.spec) + ";\n" : t;
}

// package.json of the package a specifier names, found as node resolves it (symlinks followed: a pnpm store or a workspace link)
std::string packageJsonOf(const fs::path& from, const std::string& spec) {
  if (spec.empty() || spec[0] == '/' || spec[0] == '.') return "";
  const std::size_t cut = spec[0] == '@' ? spec.find('/', spec.find('/') + 1) : spec.find('/');
  const std::string name = spec.substr(0, cut);
  for (fs::path d = from; !d.empty(); d = d.parent_path()) {
    std::error_code ec;
    const fs::path f = d / "node_modules" / name / "package.json";
    if (fs::exists(f, ec)) return readAll(f);
    if (d == d.root_path() || d == d.parent_path()) break;
  }
  return "";
}

}  // namespace

DepsResult prebundleDeps(const std::string& projectDir, const std::string& stageJson) {
  DepsResult r;
  yyjson_doc* doc = yyjson_read(stageJson.data(), stageJson.size(), 0);
  yyjson_val* arr = doc ? yyjson_obj_get(yyjson_doc_get_root(doc), "packages") : nullptr;
  std::vector<Pkg> pkgs;
  std::size_t i, n;
  yyjson_val* v;
  if (yyjson_is_arr(arr)) yyjson_arr_foreach(arr, i, n, v) {
    Pkg p;
    auto s = [&](const char* k) { yyjson_val* x = yyjson_obj_get(v, k); return yyjson_is_str(x) ? std::string(yyjson_get_str(x)) : std::string(); };
    p.spec = s("spec");
    p.id = s("id");
    p.def = yyjson_get_bool(yyjson_obj_get(v, "default"));
    p.all = yyjson_get_bool(yyjson_obj_get(v, "all"));
    size_t k, kn;
    yyjson_val* nv;
    yyjson_arr_foreach(yyjson_obj_get(v, "names"), k, kn, nv) p.names.push_back(yyjson_get_str(nv));
    pkgs.push_back(p);
  }
  yyjson_doc_free(doc);
  if (pkgs.empty()) return r;

  const fs::path project = fs::absolute(projectDir).lexically_normal();
  std::string keyText = zn::tc::esbuildVersion() + "\n" + zn::qjs::webResolveFlags(false) + "\n";
  keyText += readAll(zn::cli::lockfileOf(project.string()).empty() ? fs::path() : fs::path(zn::cli::lockfileOf(project.string()))) + "\n" + readAll(project / "package.json") + "\n";
  for (const Pkg& p : pkgs) keyText += p.spec + "\n" + stubOf(p) + packageJsonOf(project, p.spec) + "\n";
  r.key = zn::tc::sha256Hex(keyText).substr(0, 12);

  const fs::path root = project / ".zinc" / "web-deps", out = root / r.key, entries = root / ("entry-" + r.key);
  r.dir = out.string();
  std::error_code ec;
  if (fs::exists(out / ".done", ec)) return r;

  std::string esbuild, err;
  if (!zn::tc::ensureEsbuild(esbuild, err)) { r.error = err; return r; }
  fs::remove_all(out, ec);
  fs::remove_all(entries, ec);
  fs::create_directories(entries, ec);
  std::string cmd = q(esbuild);
  for (const Pkg& p : pkgs) {
    std::ofstream(entries / (p.id + ".js")) << stubOf(p);   // inside the project: esbuild finds node_modules from here, as for the program's own files
    cmd += " " + q((entries / (p.id + ".js")).string());
  }
  cmd += " --bundle --splitting --format=esm" + zn::qjs::webResolveFlags(false) + " --legal-comments=none --log-level=warning --color=false --outbase=" + q(entries.string()) +
         " --entry-names=[name] --chunk-names=chunks/[name]-[hash] --outdir=" + q(out.string());
  FILE* p = popen(("cd " + q(project.string()) + " && " + cmd + " 2>&1").c_str(), "r");
  if (!p) { r.error = "cannot start esbuild"; return r; }
  std::string log;
  char buf[4096];
  for (std::size_t got; (got = std::fread(buf, 1, sizeof buf, p)) > 0;) log.append(buf, got);
  const int rc = pclose(p);
  fs::remove_all(entries, ec);
  if (rc != 0) { r.error = "warning W0605: esbuild could not pre-bundle the packages of node_modules the program imports:\n" + log; fs::remove_all(out, ec); return r; }
  if (!log.empty()) std::fputs(log.c_str(), stderr);
  std::ofstream(out / ".done") << "ok\n";
  for (const auto& e : fs::directory_iterator(root, ec)) if (e.path() != out && e.path().filename().string().find('.') == std::string::npos && e.path().filename().string().size() == 12) fs::remove_all(e.path(), ec);   // earlier keys
  r.built = true;
  return r;
}

}  // namespace zn::cli
