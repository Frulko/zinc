#pragma once
// zinc export --target web and zinc dev --target web (docs/targets/web.md, docs/reports/zinc-web-export.md): the program as plain JavaScript
// (the `zinc bundle` transform, esbuild only to link and minify) on the browser's own engine, with a thin host layer (targets/web/runtime.js).
#include <string>
#include <vector>

namespace zn::cli {

struct WebArgs {
  std::string dir, entry, name, version, engineRoot, out;   // the project; out: the folder to write (export)
  std::string render, browsers;                              // "" : zinc.json web.render / web.browsers, else the defaults
  bool strict = false, noPwa = false, sourcemap = false, check = false, lan = false, prerender = false;
  int port = 8000;
};

/** `zinc export --target web`: a static folder (index.html, hashed JS and assets, a service worker and a manifest, precompressed copies, _headers). --check
 *  only reports what the browsers of the target set cannot run. Returns the exit code. */
int exportWeb(const WebArgs& a);
/** `zinc dev --target web`: serves the project unbundled on http://127.0.0.1:<port> with a WebSocket for hot reload; runs until interrupted. */
int devWeb(const WebArgs& a);
/** `zinc explain W0601`: the warnings of the web export (not checker errors, so not in the Z registry of include/zn/diagnostics.h); "" for another code. */
std::string webExplain(const std::string& code);
/** Whether `version` of `browser` is covered by the feature table (targets/web/browsers.json): the logic `--check` uses, exposed for the T0 test. */
std::string webCheckReport(const std::string& browsersJson, const std::string& browsers, const std::vector<std::string>& features, const std::string& who);

}  // namespace zn::cli
