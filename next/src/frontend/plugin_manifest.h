#pragma once
// plugin.json: the manifest of a plugin (plugins/<name>/plugin.json), read with yyjson. Only what the frontend needs is typed; the rest is kept as JSON text
// for the tasks that build and link plugins (native-module ABI, display drivers).
#include <map>
#include <string>
#include <string_view>
#include <vector>

namespace zn::frontend {

struct PluginManifest {
  std::string name;
  std::string kind = "module";           // "module" or "display"
  std::string module;                    // the specifier it provides: "zinc:pixelfont" (empty for display plugins)
  std::string entry = "index.ts";        // the Zinc source of the module, relative to the plugin directory
  std::string description;
  std::vector<std::string> requires_;    // capabilities the plugin needs
  std::map<std::string, std::string> aliases;  // `modules`: bare import specifiers (three/addons/...) the plugin answers, to the file that serves them
  std::vector<std::string> targets;      // names of the targets it supports (macos, linux, rpi1, esp32, wasm, rmpp, ps2, sim)
  std::string optionsJson;               // the `options` object as JSON text ("" when absent)
  std::string targetsJson;               // the `targets` object as JSON text
};

// Parses the manifest text. False with `err` set when it is not a JSON object or a typed key has the wrong type. Unknown top-level keys are not an error: they go to `warnings`.
bool parsePluginManifest(std::string_view text, PluginManifest& out, std::string& err, std::vector<std::string>& warnings);

// One line per plugin of `dir` (a directory of plugin directories): `name kind module entry targets`, sorted by name; the manifests that do not load are described in `problems`.
std::string describePlugins(const std::string& dir, std::vector<std::string>& problems);

}  // namespace zn::frontend
