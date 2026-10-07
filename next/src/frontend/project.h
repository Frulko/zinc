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

struct Project {
  std::string dir;                  // the directory of the zinc.json
  std::string name;
  std::string entry;                // "entry", else "main" ("" when neither is set)
  std::string profile;              // "profile": the target profile (esp32, ps1...) that sets `number`, the heap budget and typing; "" = the host's
  std::vector<std::string> requires_;
  std::map<std::string, TargetOptions> targets;
  std::vector<std::string> warnings;  // unknown keys, one message each
};

// Parses the manifest text. False with `err` set when it is not a JSON object or a typed key has the wrong type.
bool parseProject(const std::string& text, Project& out, std::string& err);

// The zinc.json that governs `path` (a file or a directory): its own directory first, then each parent. "" when there is none.
std::string findProjectFile(const std::string& path);

// The entry source of a directory argument (`zinc run examples/breakout`): zinc.json "entry"/"main", then src/main.ts[x], main.ts[x]; "" when none exists.
std::string entryOf(const std::string& dir, const Project* project);

}  // namespace zn::frontend
