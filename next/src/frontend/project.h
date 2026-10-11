#pragma once
// zinc.json: the manifest of a project (docs/guide/01-getting-started.md), read with yyjson. `zinc run` applies what concerns the host (window size,
// zoom, resize mode, fullscreen, kiosk, growDrawCommands, the project directory) and reports the keys it does not know.
#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace zn::frontend {

// The game keys (ZN-435, docs/reports/games/toolchain-assets-loading.md §10). Everything is optional: a project without them builds as before.
/** An asset build profile: `texture` (formats in preference order, `|` = the fallback), `maxSize`, `pot`, `audio` (music), `sfx`, `pack`
 *  (none, lz4, zstd, zstd-dict), `split` (none, group); values as text ("2048", "true"). */
using AssetProfile = std::map<std::string, std::string>;
/** Limits of `zinc assets check` in bytes: `download`, `boot`, `gpu`, `ram`, `flash`. */
using AssetBudgets = std::map<std::string, std::uint64_t>;
struct AssetRule { std::string match, as; std::map<std::string, std::string> options; };   // options: the importer's, as text (arrays and objects as JSON)
struct AssetGroup { std::string name; std::vector<std::string> include, exclude; int priority = 0; };
struct Assets {
  std::string dir = "assets";                       // `"assets": "dir"` or `assets.dir`
  std::vector<AssetRule> rules;
  std::vector<AssetGroup> groups;                   // in the manifest's order: the first group that includes an asset takes it
  std::map<std::string, AssetProfile> profiles;
  std::map<std::string, AssetBudgets> budgets;      // by target
  /** The program reads its packs (zinc run builds them, .zapp carries them): groups and what rules make (a sprite atlas) exist only there. */
  bool packed() const { return !rules.empty() || !groups.empty(); }
};
/** `splash`: an image and/or a background colour shown from the first frame (ZN-446). */
struct Splash { bool present = false; std::string image, background, fit = "contain"; int minMs = 0, fadeMs = 0; };
/** `loading`: the screen (`default`, `bar` or a module) run while `groups` are preloaded before main (ZN-447). */
struct Loading { bool present = false; std::string screen = "default"; std::vector<std::string> groups; int minMs = 0, fadeMs = 0; };
/** `launcher`: a module exporting a stage, run before the game on `targets` (none: nowhere) (ZN-448). */
struct Launcher { bool present = false; std::string entry; bool skippable = false; std::vector<std::string> targets; };

struct TargetOptions {
  int width = 0, height = 0;        // 0: not set
  double zoom = 0;                  // 0: not set
  std::string resize;               // "fill" | "letterbox" | ""
  std::string pixelScale;           // "density" (the default: the zoom times the screen density) | "logical" (1x, magnified with nearest filtering) | ""; ZN-425
  bool fullscreen = false, kiosk = false, growDrawCommands = false;
  long heap = 0;
  std::string display;              // the driver name ("" when absent), whether written as a string or as { driver }
  std::string assetProfile;         // targets.<id>.assets.profile: a name of assets.profiles ("" = the target's default)
  AssetProfile assets;              // the other keys of targets.<id>.assets: override the named profile
  Splash splash;                    // targets.<id>.splash: replaces the project's splash on this target
};

/** `"app"` of zinc.json (ZN-231, docs/reports/system-integration.md 5.1): the identity of the app for bundles, the dock, URL schemes and the system modules. */
struct AppInfo {
  bool present = false;
  std::string id, name, version, icon, copyright, category;   // id is reverse DNS: com.example.notes
  bool dock = true;                                          // false: LSUIElement, a tray-only app
  std::vector<std::string> urlSchemes, fileTypes;
  std::string window;                                        // the `window` object as JSON text (title, width, height, minWidth, minHeight, x, y, frame, titleBar, alwaysOnTop, transparent, resizable)
  std::string json;                                          // the whole `app` object as JSON text (what zinc:system/app bakes for the simulator's log)
};

struct Project {
  std::string dir;                  // the directory of the zinc.json
  std::string name;
  std::string entry;                // "entry", else "main" ("" when neither is set)
  std::string profile;              // "profile": the target profile (esp32, ps1...) that sets `number`, the heap budget and typing; "" = the host's
  std::vector<std::string> requires_;
  std::string keyboard;             // "keyboard": "auto" | "touch" | "always" | "never": the default mode of the kit's on-screen keyboard (ZN-227), passed as ZINC_KEYBOARD
  bool webgl = false;               // "webgl": true lets zinc:script contexts create WebGL canvases (ZN-205), passed as ZINC_WEBGL
  bool web = false;                 // "web": true (or an object, its keys kept for later): QuickJS programs start with the web environment (ZN-568), as ZINC_WEB=1
  std::string engine;               // "engine": "quickjs" runs the project on QuickJS-ng, "zinc" on the typed engines; "" = QuickJS for a .js or .mjs entry (ZN-719)
  bool perfHud = false;             // "dev": {"perfHud": true}: zinc run shows the performance panel (ZN-375), passed as ZINC_PERF_HUD
  std::string scheme;               // "scheme": "light" | "dark" | "auto": the initial colour scheme of zinc:ui (ZN-271), passed as ZINC_SCHEME
  std::string text;                 // "text": "shaped" lays out zinc:gfx / zinc:ui text with HarfBuzz and SheenBidi (ZN-224); "" or "simple": the codepoint tables
  std::string uiLayout;             // "ui": {"layout": "classic" | "rn" | "auto"} (ZN-285); "" = not set; "preset": "react-native" sets "rn"
  std::string uiPreset;             // "ui": {"preset"}: "react-native" or ""
  AppInfo app;
  std::vector<std::string> permissions;            // "permissions": `feature` or `feature:operation`; none = no system module usable
  bool permissionsDeclared = false;
  std::string signIdentity, signKeychain, notaryProfile;   // "signing" (ZN-321): the codesign identity ("-" or none: ad hoc), its keychain, the notarytool profile
  std::string updateUrl, updateChannel = "stable", updateKey;   // "update": where the channel manifests are, the channel, the app's Ed25519 public key (ZN-324)                // the "permissions" key is there: the host modules check it at run time (ZN-322)
  std::string scopes;                              // "scopes" as JSON text ({"opener": {"allow": [...]}})
  std::map<std::string, std::vector<std::string>> targetPermissions;   // targets.<name>.permissions: additions, and `-id` removals for that target
  bool fatal = false;                              // parseProject failed on a manifest rule (not on JSON): the command must stop
  Assets assets;
  Splash splash;
  Loading loading;
  Launcher launcher;
  std::map<std::string, TargetOptions> targets;
  std::vector<std::string> warnings;  // unknown keys, one message each
};

// The permissions in force on `target` ("macos", "linux", "esp32"...): the base list plus the target's additions minus its `-id` entries.
std::vector<std::string> permissionsFor(const Project& p, const std::string& target);
// The features a `permissions` entry may name (`notification`, `tray`, `window:state`...): the system modules of lib/std/system.
const std::vector<std::string>& systemFeatures();
// The `app` object of the project being compiled as JSON text ("" when there is none): baked as the constant of the synthetic module zinc:system/app.
void setSystemAppJson(const std::string& json);
void setSystemScopesJson(const std::string& json);   // zinc.json "scopes" as JSON text
const std::string& systemScopesJson();
const std::string& systemAppJson();
// The permissions of the project being compiled (null: none declared); `zinc:system/<feature>` is refused without its permission (Z5006).
void setSystemPermissions(const std::vector<std::string>* granted);
const std::vector<std::string>* systemPermissions();
// The feature whose permission an import of `spec` needs ("zinc:system/tray" -> "tray"), or "" for any other spec (and for zinc:system itself).
std::string systemFeatureOf(const std::string& spec);

// The layout engine of zinc:ui for `target` (ZN-285, docs/reports/layout-engines.md §5): "classic" or "rn". "auto" and no setting follow the target's
// `ui.layout` in targets/capabilities.json; "rn" where the target's `ui.rn` is false fails with `err` naming the reason (`ui.why`).
bool resolveUiLayout(const Project& p, const std::map<std::string, std::string>& caps, const std::string& target, std::string& layout, std::string& err);
// The layout engine of the program being compiled, exported by zinc:platform as UI_LAYOUT ("classic" when nothing set it).
void setUiLayout(const std::string& layout);
const std::string& uiLayout();
// "react-native" when zinc.json has "ui": {"preset": "react-native"}: React Native's style semantics (flex: n, black text) in either layout engine (ZN-288).
void setUiPreset(const std::string& preset);
const std::string& uiPreset();
// Whether a module other than zinc:ui imports zinc:__layout: the AOT then installs and links the engine in classic too (ZN-355).
void noteDirectLayoutUse();
bool directLayoutUse();

// Parses the manifest text. False with `err` set when it is not a JSON object or a typed key has the wrong type.
bool parseProject(const std::string& text, Project& out, std::string& err);

/** The asset profile in force on one target: its default (the `assets` entry of targets/capabilities.json), then the profile
 *  targets.<id>.assets names, then that object's own keys; budgets: the default's, then assets.budgets.<id>. */
struct TargetAssets { std::string target, profile = "default"; AssetProfile keys; AssetBudgets budgets; };
/** One row per target of targets/capabilities.json (`capabilities`: its text), in its order. False with `err` when an entry is not valid. */
bool assetProfiles(const Project& p, const std::string& capabilities, std::vector<TargetAssets>& out, std::string& err);
/** 48MB, 96KB, 1GB, 512B or a number of bytes (KB = 1024 B). */
bool parseByteSize(const std::string& s, std::uint64_t& bytes);
/** The shortest exact form of `bytes` in those units: "48MB". */
std::string byteSize(std::uint64_t bytes);

// The zinc.json that governs `path` (a file or a directory): its own directory first, then each parent. "" when there is none.
std::string findProjectFile(const std::string& path);

// The entry source of a directory argument (`zinc run examples/breakout`): zinc.json "entry"/"main", then src/main.ts[x], main.ts[x]; "" when none exists.
std::string entryOf(const std::string& dir, const Project* project);

/** The loader stage (ZN-447, docs/reports/games/toolchain-assets-loading.md 7.5): a module that the program initialises before its own modules
 *  (loadProgram, the QuickJS engine); the command line makes it from zinc.json `loading` (zn::cli::loaderStageFor). `path` names it in the
 *  project's directory, so a module it imports resolves against the project. Empty source: no stage. */
struct LoaderStage { std::string path, source; };
void setLoaderStage(LoaderStage s);   // the program being compiled (set with the permissions of its zinc.json)
const LoaderStage& loaderStage();

}  // namespace zn::frontend
