#pragma once
// Engine packs (ZN-773.04): the JavaScript engines beside QuickJS (V8; later others) and the extension modules (WebAssembly) are downloaded on first
// use, not shipped with zinc. A pack is a target of the signed plugin index (src/tc/tuf.h, D41): engines/<name>/<version>/<host>.tar.xz, whose
// "custom" says {kind: "engine" | "module", library, zn_engine_abi, napi, upstream}. tools/engine-pack makes one from a build. Installed, it is
//
//   ~/.zinc/engines/<name>/<version>/<library>    the module zinc dlopens (libzn_engine_v8.dylib), its rpath @loader_path/lib
//   ~/.zinc/engines/<name>/<version>/lib/         what it loads (libv8*.dylib, icudtl.dat), relative to it
//   ~/.zinc/engines/<name>/<version>/pack.json    the signed custom object, the version and the archive's SHA-256
//
// The SDK to build a module against (tools/v8-pack: include/ and lib/) is not a pack: it lives in ~/.zinc/sdk/<name>/<version>.
#include <string>
#include <vector>

namespace zn::tc::engines {

struct Pack {
  std::string name, version, kind, library, upstream, dir;
  int abi = 0, napi = 0;
  std::string path() const { return dir + "/" + library; }
};

// The installed packs (of `name`, or all), newest version first per name.
std::vector<Pack> installed(const std::string& name = "");
// The newest installed pack of `name` built for `abi`; false when there is none.
bool find(const std::string& name, int abi, Pack& out);
// Downloads the newest pack of `name` built for `abi` from the signed index (`version`: that version or a prefix of it, "" for the newest), checks its
// length, SHA-256 and signatures (the TUF client), unpacks and installs it. Step lines say what happens; `err` says why not and what to do.
bool install(const std::string& engineRoot, const std::string& name, const std::string& version, int abi, Pack& out, std::string& err);
// The module of `name` (libzn_engine_<name>.dylib): $ZINC_ENGINE_<NAME> (your own build), beside zinc (built with it: jsc, a source build's v8),
// Resources/engines/<name>/ of the app the executable is in (an exported app's pack), the newest installed pack, else the pack downloaded now. `preferPack` (zinc export)
// takes an installed pack before the module beside zinc, whose libraries may be the build machine's. `pack` is set when the module is a pack's.
bool locate(const std::string& engineRoot, const std::string& name, int abi, bool preferPack, std::string& path, Pack* pack, std::string& err);
// `zinc engine list [--available] | install <name>[@version] | update [name] | remove <name>[@version]`; `abi` is ZN_ENGINE_ABI of this zinc.
int command(const std::vector<std::string>& args, const std::string& engineRoot, int abi);
// One dim line per installed engine with a newer pack in the index (written by the daily check), and that check started once a day.
void notice();
// zinc doctor: "v8 15.6.75.19" for each installed pack, "" when none.
std::string summary();

}  // namespace zn::tc::engines
