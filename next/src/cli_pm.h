#pragma once
// npm packages for the web target (docs/targets/web.md, "npm packages"): which package manager a project uses and the commands that call it.
// Zinc never installs a manager and never bundles one: pnpm, yarn, npm and bun are the person's, found on PATH, and Node is needed only by them.
#include <string>
#include <utility>
#include <vector>

namespace zn::cli {

struct PackageManager {
  std::string name;       // npm, pnpm, yarn or bun
  std::string dir;        // the nearest folder with a package.json (where the manager runs)
  std::string lockfile;   // the lockfile found from there upwards (a workspace keeps it at its root), "" when none
  std::string why;        // "packageManager field of package.json", "pnpm-lock.yaml", "no lockfile: npm is the default"
  bool berry = false;     // yarn 2+ (a .yarnrc.yml or a berry yarn.lock)
};

/** The manager of the project in `dir`: the `packageManager` field of the nearest package.json (or of the workspace root), else the lockfile found upwards, else npm. */
PackageManager detectPackageManager(const std::string& dir);
/** The absolute path of an executable on PATH, "" when it is not there. */
std::string findOnPath(const std::string& exe);
/** The lockfile of the project (or of its workspace) and package.json, for the dev server's change detection and the pre-bundle cache key: "" when none. */
std::string lockfileOf(const std::string& dir);

/** `zinc add npm:<pkg>[@version]... [-D] [dir]` and `zinc remove npm:<pkg>...`: the project's manager adds or removes them. */
int npmAdd(const std::vector<std::string>& args, bool remove);
/** The `npm:` packages of an `add` / `remove` command line? (then npmAdd handles it) */
bool isNpmCommand(const std::vector<std::string>& args);
/** `zinc install [--frozen] [dir]` when the project has a package.json: the manager installs it. -1: no package.json (the plugin flow alone), else the exit code. */
int npmInstall(const std::vector<std::string>& args);
/** Found managers and Node for `zinc doctor`: {name, "version at /path"} (missing ones have an empty second member). */
std::vector<std::pair<std::string, std::string>> packageManagersFound();
/** `zinc explain P0001`.. : "" for another code. */
std::string pmExplain(const std::string& code);

}  // namespace zn::cli
