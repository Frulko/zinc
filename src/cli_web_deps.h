#pragma once
// zinc dev --target web and the packages of node_modules (docs/targets/web.md, "npm packages"): Vite's dependency pre-bundling model. The bare imports of the
// program are bundled once with the pinned esbuild into ES modules served at /__deps/<id>.js, kept in <project>/.zinc/web-deps/<key>/ by the hash of the
// lockfile, the packages' package.json files and the imports, so a save of the app's own code never bundles them again.
#include <string>

namespace zn::cli {

struct DepsResult {
  std::string dir;   // the folder /__deps/ is served from ("" when the program imports no package)
  std::string key;   // changes when a package, the lockfile or the set of imports changes (the dev server reloads the page)
  bool built = false;   // bundled now (false: the cache had it)
  std::string error;    // esbuild's messages when it failed
};

/** Pre-bundles the `packages` of stage.json (written by `zinc bundle --stage`) for the project in `projectDir`. */
DepsResult prebundleDeps(const std::string& projectDir, const std::string& stageJson);

}  // namespace zn::cli
