// zinc.json game keys (ZN-435, docs/reports/games/toolchain-assets-loading.md §10): the report's example parses into every field, each error
// stops the manifest (fatal, with its line), unknown keys inside the new objects are warnings, sizes read and print, the asset profile of a
// target merges its default, the named profile and its own keys, and the defaults of targets/capabilities.json are valid.
// Run from the repository root (it reads targets/capabilities.json); prints "all checks passed" or one line per failure.
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#include "frontend/project.h"

using namespace zn::frontend;

namespace {

int failures = 0;
#define CHECK(c, ...) do { if (!(c)) { ++failures; std::printf("FAIL line %d: ", __LINE__); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

const char* kExample = R"({
  "name": "coin-rush",
  "entry": "src/main.ts",
  "assets": {
    "dir": "art",
    "rules": [
      { "match": "sprites/**/*.{png,svg}", "as": "sprite", "atlas": "sprites", "trim": true, "extrude": 1 },
      { "match": "models/**/*.glb", "as": "model", "lods": [1, 0.5, 0.2] },
      { "match": "data/**", "as": "copy" },
      { "match": "textures/**/*_n.png", "srgb": false }
    ],
    "groups": {
      "boot":   { "include": ["fonts/**", "sprites/ui/**"], "exclude": ["sprites/ui/big/**"], "priority": 2 },
      "menu":   { "include": ["music/menu.flac"] },
      "level1": { "include": ["levels/level1.tmj"], "priority": -1 }
    },
    "profiles": {
      "desktop": { "texture": "bc7|bc1", "audio": "opus:96", "sfx": "opus:64", "pack": "zstd" },
      "web":     { "texture": "ktx2:uastc", "audio": "opus:64", "pack": "none", "split": "group" },
      "pi":      { "texture": "etc1|rgba4444", "maxSize": 1024, "pot": true, "audio": "vorbis:q2", "sfx": "adpcm", "pack": "lz4" }
    },
    "budgets": {
      "rpi1":  { "download": "48MB", "gpu": "40MB", "boot": "4MB" },
      "esp32": { "flash": "2MB", "ram": "96KB" },
      "wasm":  { "boot": 3145728 }
    }
  },
  "splash":   { "image": "assets/splash.png", "background": "#101418", "fit": "cover", "minMs": 0, "fadeMs": 150 },
  "launcher": { "entry": "src/launcher.tsx", "skippable": true, "targets": ["macos", "linux"] },
  "loading":  { "screen": "src/loading.ts", "groups": ["boot", "menu", "default"], "minMs": 300, "fadeMs": 150 },
  "targets": {
    "macos": { "width": 960, "height": 540, "assets": { "profile": "desktop", "maxSize": 4096 } },
    "rpi1":  { "assets": { "profile": "pi" }, "splash": "assets/splash-pi.png" },
    "wasm":  { "splash": { "background": "#000" } }
  }
})";

void example() {
  Project p;
  std::string err;
  CHECK(parseProject(kExample, p, err), "the example: %s", err.c_str());
  CHECK(p.warnings.empty(), "the example warns: %s", p.warnings.empty() ? "" : p.warnings[0].c_str());
  const Assets& a = p.assets;
  CHECK(a.dir == "art", "dir %s", a.dir.c_str());
  CHECK(a.rules.size() == 4, "%zu rules", a.rules.size());
  if (a.rules.size() == 4) {
    const AssetRule& r = a.rules[0];
    CHECK(r.match == "sprites/**/*.{png,svg}" && r.as == "sprite" && r.options.size() == 3 && r.options.at("atlas") == "sprites" && r.options.at("trim") == "true" &&
          r.options.at("extrude") == "1", "rule 0: %s %s, %zu options", r.match.c_str(), r.as.c_str(), r.options.size());
    CHECK(a.rules[1].options.count("lods") && a.rules[1].options.at("lods") == "[1,0.5,0.2]", "an array option is kept as JSON");
    CHECK(a.rules[3].as.empty() && a.rules[3].options.at("srgb") == "false", "a rule without \"as\" only sets options");
  }
  CHECK(a.groups.size() == 3 && a.groups[0].name == "boot" && a.groups[1].name == "menu" && a.groups[2].name == "level1", "groups keep the manifest's order");
  if (a.groups.size() == 3) {
    CHECK(a.groups[0].include.size() == 2 && a.groups[0].exclude.size() == 1 && a.groups[0].exclude[0] == "sprites/ui/big/**" && a.groups[0].priority == 2, "group boot");
    CHECK(a.groups[2].priority == -1 && a.groups[1].priority == 0, "priorities");
  }
  CHECK(a.profiles.size() == 3 && a.profiles.at("desktop").at("texture") == "bc7|bc1" && a.profiles.at("web").at("split") == "group", "profiles");
  if (a.profiles.count("pi")) {
    const AssetProfile& pi = a.profiles.at("pi");
    CHECK(pi.at("maxSize") == "1024" && pi.at("pot") == "true" && pi.at("audio") == "vorbis:q2" && pi.at("sfx") == "adpcm" && pi.at("pack") == "lz4", "profile pi");
  }
  CHECK(a.budgets.at("rpi1").at("download") == 48ull << 20 && a.budgets.at("rpi1").at("boot") == 4ull << 20 && a.budgets.at("esp32").at("ram") == 96 * 1024 &&
        a.budgets.at("wasm").at("boot") == 3145728, "budgets");
  CHECK(p.splash.present && p.splash.image == "assets/splash.png" && p.splash.background == "#101418" && p.splash.fit == "cover" && p.splash.fadeMs == 150, "splash");
  CHECK(p.launcher.present && p.launcher.entry == "src/launcher.tsx" && p.launcher.skippable && p.launcher.targets.size() == 2, "launcher");
  CHECK(p.loading.present && p.loading.screen == "src/loading.ts" && p.loading.groups.size() == 3 && p.loading.minMs == 300 && p.loading.fadeMs == 150, "loading");
  const TargetOptions& mac = p.targets["macos"];
  CHECK(mac.width == 960 && mac.assetProfile == "desktop" && mac.assets.size() == 1 && mac.assets.at("maxSize") == "4096", "targets.macos.assets");
  CHECK(p.targets["rpi1"].assetProfile == "pi" && p.targets["rpi1"].splash.image == "assets/splash-pi.png", "targets.rpi1");
  CHECK(p.targets["wasm"].splash.background == "#000" && p.targets["wasm"].splash.fit == "contain", "targets.wasm.splash");
}

void defaults() {
  Project p;
  std::string err;
  CHECK(parseProject(R"({"name": "x"})", p, err), "%s", err.c_str());
  CHECK(p.assets.dir == "assets" && p.assets.rules.empty() && p.assets.groups.empty() && p.assets.profiles.empty() && p.assets.budgets.empty(), "assets defaults");
  CHECK(!p.splash.present && !p.loading.present && !p.launcher.present, "absent keys are not present");
  Project s;
  CHECK(parseProject(R"({"assets": "media", "splash": "s.png"})", s, err) && s.assets.dir == "media" && s.splash.present && s.splash.image == "s.png", "the string forms");
  Project w;
  CHECK(parseProject(R"({"assets": {"rulez": [], "profiles": {"x": {"texure": "bc1"}}}, "splash": {"image": "a", "color": "#fff"}, "loading": {"bar": 1},
                         "launcher": {"entry": "l.ts", "skip": true}, "targets": {"macos": {"assets": {"profil": "x"}}}})", w, err), "%s", err.c_str());
  std::string all;
  for (const std::string& x : w.warnings) all += x + "; ";
  for (const char* key : {"assets.rulez", "assets.profiles.x.texure", "splash.color", "loading.bar", "launcher.skip", "targets.macos.assets.profil"})
    CHECK(all.find(std::string("unknown key \"") + key + "\"") != std::string::npos, "no warning for %s: %s", key, all.c_str());
}

void errors() {
  struct Case { const char* json; const char* err; };
  const Case cases[] = {
    {R"({"assets": 3})", "\"assets\" must be the assets directory or an object"},
    {R"({"assets": ""})", "\"assets\" must name the assets directory"},
    {R"({"assets": {"dir": 1}})", "assets.dir must be the assets directory"},
    {R"({"assets": {"rules": {}}})", "assets.rules must be an array"},
    {R"({"assets": {"rules": [3]}})", "assets.rules[0] must be an object"},
    {R"({"assets": {"rules": [{"match": "*"}, {"as": "copy"}]}})", "assets.rules[1] needs \"match\""},
    {R"({"assets": {"rules": [{"match": 1}]}})", "assets.rules[0].match must be a string"},
    {R"({"assets": {"rules": [{"match": "*", "as": 2}]}})", "assets.rules[0].as must be a string"},
    {R"({"assets": {"groups": []}})", "assets.groups must be an object"},
    {R"({"assets": {"groups": {"boot": {}}}})", "assets.groups.boot needs \"include\""},
    {R"({"assets": {"groups": {"boot": {"include": [1]}}}})", "assets.groups.boot needs \"include\""},
    {R"({"assets": {"groups": {"boot": {"include": ["*"], "exclude": "x"}}}})", "assets.groups.boot.exclude must be an array of globs"},
    {R"({"assets": {"groups": {"boot": {"include": ["*"], "priority": "high"}}}})", "assets.groups.boot.priority must be an integer"},
    {R"({"assets": {"profiles": []}})", "assets.profiles must be an object"},
    {R"({"assets": {"profiles": {"pi": 1}}})", "assets.profiles.pi must be an object"},
    {R"({"assets": {"profiles": {"pi": {"texture": "etc3"}}}})", "assets.profiles.pi.texture names \"etc3\", not a texture format"},
    {R"({"assets": {"profiles": {"pi": {"texture": "etc1|"}}}})", "assets.profiles.pi.texture names \"\", not a texture format"},
    {R"({"assets": {"profiles": {"pi": {"texture": 1}}}})", "assets.profiles.pi.texture must be texture formats"},
    {R"({"assets": {"profiles": {"pi": {"maxSize": 0}}}})", "assets.profiles.pi.maxSize must be a number of pixels from 1 to 16384"},
    {R"({"assets": {"profiles": {"pi": {"maxSize": 2048.5}}}})", "assets.profiles.pi.maxSize must be a number of pixels"},
    {R"({"assets": {"profiles": {"pi": {"pot": "yes"}}}})", "assets.profiles.pi.pot must be true or false"},
    {R"({"assets": {"profiles": {"pi": {"audio": "ogg"}}}})", "assets.profiles.pi.audio must be an audio codec"},
    {R"({"assets": {"profiles": {"pi": {"sfx": 5}}}})", "assets.profiles.pi.sfx must be an audio codec"},
    {R"({"assets": {"profiles": {"pi": {"pack": "gzip"}}}})", "assets.profiles.pi.pack must be \"none\", \"lz4\", \"zstd\" or \"zstd-dict\""},
    {R"({"assets": {"profiles": {"pi": {"split": "file"}}}})", "assets.profiles.pi.split must be \"none\" or \"group\""},
    {R"({"assets": {"budgets": []}})", "assets.budgets must be an object"},
    {R"({"assets": {"budgets": {"rpi1": 3}}})", "assets.budgets.rpi1 must be an object of limits"},
    {R"({"assets": {"budgets": {"rpi1": {"vram": "1MB"}}}})", "assets.budgets.rpi1.vram is not a budget"},
    {R"({"assets": {"budgets": {"rpi1": {"gpu": "40 MiB"}}}})", "assets.budgets.rpi1.gpu must be a size"},
    {R"({"assets": {"budgets": {"rpi1": {"gpu": -1}}}})", "assets.budgets.rpi1.gpu must be a size"},
    {R"({"splash": 1})", "splash must be an image path or an object"},
    {R"({"splash": {"fit": "contain"}})", "splash needs an \"image\" or a \"background\""},
    {R"({"splash": {"image": 1}})", "splash.image must be a path"},
    {R"({"splash": {"background": "red"}})", "splash.background must be a colour"},
    {R"({"splash": {"image": "a.png", "fit": "stretch"}})", "splash.fit must be \"contain\", \"cover\" or \"center\""},
    {R"({"splash": {"image": "a.png", "minMs": -1}})", "splash.minMs must be a number of milliseconds"},
    {R"({"splash": {"image": "a.png", "fadeMs": 1.5}})", "splash.fadeMs must be a number of milliseconds"},
    {R"({"loading": true})", "\"loading\" must be an object"},
    {R"({"loading": {"screen": 1}})", "loading.screen must be \"default\", \"bar\" or a module"},
    {R"({"loading": {"groups": "boot"}})", "loading.groups must be an array of group names"},
    {R"({"loading": {"groups": ["boot"]}})", "loading.groups names \"boot\", which assets.groups does not define"},
    {R"({"loading": {"minMs": "300"}})", "loading.minMs must be a number of milliseconds"},
    {R"({"loading": {"fadeMs": 700000}})", "loading.fadeMs must be a number of milliseconds"},
    {R"({"launcher": "src/l.ts"})", "\"launcher\" must be an object"},
    {R"({"launcher": {"skippable": true}})", "launcher.entry must name the launcher's module"},
    {R"({"launcher": {"entry": "l.ts", "skippable": 1}})", "launcher.skippable must be true or false"},
    {R"({"launcher": {"entry": "l.ts", "targets": "macos"}})", "launcher.targets must be an array of target names"},
    {R"({"targets": {"macos": {"assets": "desktop"}}})", "targets.macos.assets must be an object"},
    {R"({"targets": {"macos": {"assets": {"profile": "desktop"}}}})", "targets.macos.assets.profile names \"desktop\", which assets.profiles does not define"},
    {R"({"targets": {"macos": {"assets": {"pack": "rar"}}}})", "targets.macos.assets.pack must be"},
    {R"({"targets": {"macos": {"splash": {"background": "#12"}}}})", "targets.macos.splash.background must be a colour"},
    {"{\n  \"name\": \"x\",\n  \"assets\": {\n    \"profiles\": { \"pi\": { \"pack\": \"rar\" } }\n  }\n}", "line 4: assets.profiles.pi.pack must be"},
  };
  for (const Case& c : cases) {
    Project p;
    std::string err;
    const bool ok = parseProject(c.json, p, err);
    CHECK(!ok && p.fatal && err.find(c.err) != std::string::npos && err.rfind("line ", 0) == 0, "%s: expected \"%s\", got %s (%s)", c.json, c.err,
          ok ? "success" : err.c_str(), p.fatal ? "fatal" : "not fatal");
  }
}

void sizes() {
  std::uint64_t b = 0;
  CHECK(parseByteSize("48MB", b) && b == 48ull << 20, "48MB: %llu", static_cast<unsigned long long>(b));
  CHECK(parseByteSize("96KB", b) && b == 96 * 1024, "96KB");
  CHECK(parseByteSize("1GB", b) && b == 1ull << 30, "1GB");
  CHECK(parseByteSize("512B", b) && b == 512 && parseByteSize("512", b) && b == 512, "bytes");
  CHECK(parseByteSize("1.5MB", b) && b == 1536 * 1024, "1.5MB");
  CHECK(parseByteSize("48mb", b) && b == 48ull << 20, "units in lower case");
  for (const char* bad : {"MB", "", "1.2.3MB", "48 MB", "48TB", ".5MB", "-1"}) CHECK(!parseByteSize(bad, b), "\"%s\" read as a size", bad);
  CHECK(byteSize(48ull << 20) == "48MB" && byteSize(1536 * 1024) == "1536KB" && byteSize(1ull << 30) == "1GB" && byteSize(1000) == "1000B" && byteSize(0) == "0B", "byteSize");
}

void profiles() {
  const char* caps = R"({"$comment": "x",
    "a": {"touch": true, "assets": {"texture": "bc7", "pack": "zstd", "maxSize": 8192, "budgets": {"ram": "1GB", "gpu": "512MB"}}},
    "b": {"touch": false}})";
  Project p;
  std::string err;
  CHECK(parseProject(R"({"assets": {"profiles": {"desktop": {"pack": "lz4", "maxSize": 1024}}, "budgets": {"a": {"gpu": "256MB"}}},
                         "targets": {"a": {"assets": {"profile": "desktop", "pot": true}}}})", p, err), "%s", err.c_str());
  std::vector<TargetAssets> rows;
  CHECK(assetProfiles(p, caps, rows, err), "%s", err.c_str());
  CHECK(rows.size() == 2 && rows[0].target == "a" && rows[1].target == "b", "one row per target, in the file's order");
  if (rows.size() == 2) {
    const TargetAssets& a = rows[0];
    CHECK(a.profile == "desktop" && a.keys.at("texture") == "bc7" && a.keys.at("pack") == "lz4" && a.keys.at("maxSize") == "1024" && a.keys.at("pot") == "true",
          "the default, then the named profile, then the target's keys");
    CHECK(a.budgets.at("ram") == 1ull << 30 && a.budgets.at("gpu") == 256ull << 20, "budgets: the default's, then the project's");
    CHECK(rows[1].profile == "default" && rows[1].keys.empty() && rows[1].budgets.empty(), "a target without defaults");
  }
  rows.clear();
  CHECK(!assetProfiles(p, R"({"a": {"assets": {"pack": "rar"}}})", rows, err) && err.find("targets/capabilities.json: a.assets.pack must be") == 0, "a bad default: %s", err.c_str());
  CHECK(!assetProfiles(p, R"({"a": {"assets": {"budgets": {"vram": 1}}}})", rows, err) && err.find("a.assets.budgets.vram is not a budget") != std::string::npos, "%s", err.c_str());

  // the shipped defaults: every target has a valid entry with formats, a pack codec and (but the simulator) budgets
  std::ifstream in("targets/capabilities.json");
  std::stringstream ss;
  ss << in.rdbuf();
  rows.clear();
  Project none;
  CHECK(assetProfiles(none, ss.str(), rows, err), "targets/capabilities.json: %s", err.c_str());
  CHECK(rows.size() >= 9, "%zu targets", rows.size());
  for (const TargetAssets& t : rows)
    CHECK(t.keys.count("texture") && t.keys.count("maxSize") && t.keys.count("audio") && t.keys.count("pack") && (t.target == "sim" || !t.budgets.empty()),
          "target %s: incomplete default", t.target.c_str());
}

}  // namespace

// zinc.json "permissions" and "permissionStrings" into the platforms' manifests: the iOS Info.plist (usage strings, orientations), the
// AndroidManifest.xml lines (CAMERA with the camera feature optional), the macOS usage strings with their defaults.
void permissions() {
  Project p;
  std::string err;
  CHECK(parseProject(R"({ "name": "webcam", "app": { "id": "dev.zinc.webcam", "name": "Webcam", "version": "1.2", "orientation": "portrait" },
    "permissions": ["camera", "fs"], "permissionStrings": { "camera": "Webcam shows your camera & saves photos." },
    "targets": { "android": { "permissions": ["microphone"] } } })", p, err), "parse: %s", err.c_str());
  const std::string ios = iosInfoPlist(p);
  for (const char* want : {"<key>CFBundleIdentifier</key><string>dev.zinc.webcam</string>", "<key>CFBundleShortVersionString</key><string>1.2</string>",
                           "<key>NSCameraUsageDescription</key><string>Webcam shows your camera &amp; saves photos.</string>",
                           "<array><string>UIInterfaceOrientationPortrait</string></array>", "<key>UILaunchScreen</key><dict/>"})
    CHECK(ios.find(want) != std::string::npos, "iOS Info.plist lacks %s:\n%s", want, ios.c_str());
  CHECK(ios.find("NSMicrophoneUsageDescription") == std::string::npos, "the microphone is Android's only");
  const std::string android = androidManifestPermissions(p);
  CHECK(android == "    <uses-permission android:name=\"android.permission.CAMERA\" />\n"
                   "    <uses-permission android:name=\"android.permission.RECORD_AUDIO\" />\n"
                   "    <uses-feature android:name=\"android.hardware.camera\" android:required=\"false\" />\n", "AndroidManifest lines:\n%s", android.c_str());
  auto mac = usageStrings(p, "macos", "Webcam");
  CHECK(mac.size() == 1 && mac[0].first == "NSCameraUsageDescription" && mac[0].second == "Webcam shows your camera & saves photos.", "macOS usage strings");
  Project q;
  CHECK(parseProject(R"({ "name": "q", "permissions": ["camera", "location"] })", q, err), "parse q");
  auto d = usageStrings(q, "macos", "Q");
  CHECK(d.size() == 3 && d[0].second == "Q uses the camera." && d[2].first == "NSLocationUsageDescription", "macOS defaults");
  Project open;
  CHECK(parseProject(R"({ "name": "o" })", open, err), "parse o");
  CHECK(androidManifestPermissions(open) == "    <uses-permission android:name=\"android.permission.INTERNET\" />\n", "no permissions declared: INTERNET only");
  Project bad;
  CHECK(!parseProject(R"({ "name": "b", "permissionStrings": ["camera"] })", bad, err) && err.find("permissionStrings") != std::string::npos, "a list is refused: %s", err.c_str());
}

int main() {
  example();
  permissions();
  defaults();
  errors();
  sizes();
  profiles();
  if (failures) { std::printf("%d failures\n", failures); return 1; }
  std::printf("all checks passed\n");
  return 0;
}
