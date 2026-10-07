#pragma once
// zinc.json: the manifest of a project (docs/guide/01-getting-started.md), read with yyjson. `zinc run` applies what concerns the host (window size,
// zoom, resize mode, fullscreen, kiosk, growDrawCommands, the project directory) and reports the keys it does not know.
#include <map>
#include <string>
#include <vector>

namespace zn::frontend {

struct TargetOptions {
  int width = 0, height = 0;        // 0: not set
  double zoom = 0;                  // 0: not set
  std::string resize;               // "fill" | "letterbox" | ""
  bool fullscreen = false, kiosk = false, growDrawCommands = false;
  long heap = 0;
  std::string display;              // the driver name ("" when absent), whether written as a string or as { driver }
};

/** `"app"` of zinc.json (ZN-231, docs/reports/system-integration.md 5.1): the identity of the app for bundles, the dock, URL schemes and the system modules. */
struct AppInfo {
  bool present = false;
  std::string id, name, version, icon, copyright, category;   // id is reverse DNS: com.example.notes
  bool dock = true;                                          // false: LSUIElement, a tray-only app
  std::vector<std::string> urlSchemes, fileTypes;
  std::string window;                                        // the `window` object as JSON text (read by the HAL window creation, ZN-233)
};

struct Project {
  std::string dir;                  // the directory of the zinc.json
  std::string name;
  std::string entry;                // "entry", else "main" ("" when neither is set)
  std::string profile;              // "profile": the target profile (esp32, ps1...) that sets `number`, the heap budget and typing; "" = the host's
  std::vector<std::string> requires_;
  AppInfo app;
  std::vector<std::string> permissions;            // "permissions": `feature` or `feature:operation`; none = no system module usable
  std::string scopes;                              // "scopes" as JSON text ({"opener": {"allow": [...]}})
  std::map<std::string, std::vector<std::string>> targetPermissions;   // targets.<name>.permissions: additions, and `-id` removals for that target
  bool fatal = false;                              // parseProject failed on a manifest rule (not on JSON): the command must stop
  std::map<std::string, TargetOptions> targets;
  std::vector<std::string> warnings;  // unknown keys, one message each
};

// The permissions in force on `target` ("macos", "linux", "esp32"...): the base list plus the target's additions minus its `-id` entries.
std::vector<std::string> permissionsFor(const Project& p, const std::string& target);
// The features a `permissions` entry may name (`notification`, `tray`, `window:state`...): the system modules of lib/std/system.
const std::vector<std::string>& systemFeatures();
// The permissions of the project being compiled (null: none declared); `zinc:system/<feature>` is refused without its permission (Z5006).
void setSystemPermissions(const std::vector<std::string>* granted);
const std::vector<std::string>* systemPermissions();
// The feature whose permission an import of `spec` needs ("zinc:system/tray" -> "tray"), or "" for any other spec (and for zinc:system itself).
std::string systemFeatureOf(const std::string& spec);

// Parses the manifest text. False with `err` set when it is not a JSON object or a typed key has the wrong type.
bool parseProject(const std::string& text, Project& out, std::string& err);

// The zinc.json that governs `path` (a file or a directory): its own directory first, then each parent. "" when there is none.
std::string findProjectFile(const std::string& path);

// The entry source of a directory argument (`zinc run examples/breakout`): zinc.json "entry"/"main", then src/main.ts[x], main.ts[x]; "" when none exists.
std::string entryOf(const std::string& dir, const Project* project);

}  // namespace zn::frontend
