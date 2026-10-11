// The asset build (ZN-434): rules, the importer registry, the content-addressed cache, groups to packs, report.json. See assets.h.
#include "assets/assets.h"

#include "assets/model.h"
#include "assets/sprite.h"
#include "assets/texture.h"
#include "assets/tilemap.h"
#include "res/codec.h"
#include "zn/zim.h"
#include "zpk/zpk.h"

#define XXH_INLINE_ALL
#include "xxhash.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <regex>
#include <set>
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>

namespace fs = std::filesystem;

namespace zn::assets {
namespace {

using Clock = std::chrono::steady_clock;
double msSince(Clock::time_point t) { return std::chrono::duration<double, std::milli>(Clock::now() - t).count(); }

bool readFile(const fs::path& p, std::string& out) {   // one read into a buffer of the file's size (a stringstream copies twice)
  std::ifstream in(p, std::ios::binary | std::ios::ate);
  if (!in) return false;
  out.resize(static_cast<std::size_t>(in.tellg()));
  in.seekg(0);
  return static_cast<bool>(in.read(out.data(), static_cast<std::streamsize>(out.size())));
}

fs::path artifactPath(const std::string& cacheDir, const std::string& key) { return fs::path(cacheDir) / key.substr(0, 2) / key; }

/** Written aside and renamed, so a reader never sees half a file (two builds may share the cache). */
bool writeAtomic(const fs::path& p, std::string_view bytes) {
  std::error_code ec;
  fs::create_directories(p.parent_path(), ec);
  const fs::path tmp = p.string() + "." + std::to_string(::getpid()) + ".tmp";
  {
    std::ofstream o(tmp, std::ios::binary);
    o.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
    if (!o) { fs::remove(tmp, ec); return false; }
  }
  fs::rename(tmp, p, ec);
  if (ec) fs::remove(tmp, ec);
  return !ec;
}

std::string jsonString(std::string_view s) {
  std::string o = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if (static_cast<unsigned char>(c) < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += c;
  }
  return o + "\"";
}

// ---------------------------------------------------------------- globs
/** `*` and `?` within a name, `**` across directories (`**` followed by `/` also matches no directory), `{a,b}` alternatives. */
std::regex globRegex(const std::string& g) {
  std::string r;
  int braces = 0;
  for (std::size_t i = 0; i < g.size(); ++i) {
    const char c = g[i];
    if (c == '*' && i + 1 < g.size() && g[i + 1] == '*') {
      if (i + 2 < g.size() && g[i + 2] == '/') { r += "(?:.*/)?"; i += 2; }
      else { r += ".*"; ++i; }
    } else if (c == '*') r += "[^/]*";
    else if (c == '?') r += "[^/]";
    else if (c == '{') { r += "(?:"; ++braces; }
    else if (c == '}' && braces) { r += ")"; --braces; }
    else if (c == ',' && braces) r += "|";
    else if (std::string_view("\\^$.|+()[]{}").find(c) != std::string_view::npos) { r += '\\'; r += c; }
    else r += c;
  }
  return std::regex(r, std::regex::ECMAScript | std::regex::optimize);
}

// ---------------------------------------------------------------- importers
using Opts = std::map<std::string, std::string>;
// `side`: the bytes of the files a source names and its importer also reads, by name (the image of a sprite sheet, the tilesets of a map)
using Side = std::map<std::string, std::string>;
// `opt`: the build's options (the texture importer's encoder); the rest is what the importer's output depends on (its key)
using ImportFn = bool (*)(const Options& opt, const std::string& name, const std::string& in, const Side& side, const Opts& o, std::string& out, std::string& err);

bool importCopy(const Options&, const std::string&, const std::string& in, const Side&, const Opts&, std::string& out, std::string&) { out = in; return true; }

void put16(std::string& o, unsigned v) { o += static_cast<char>(v & 0xff); o += static_cast<char>(v >> 8); }
unsigned scaleTo(unsigned v, unsigned max) { return (v * max + 127) / 255; }

bool importImage(const Options&, const std::string& name, const std::string& in, const Side&, const Opts& o, std::string& out, std::string& err) {
  const std::string fmtName = o.count("format") ? o.at("format") : "rgba8";
  const Format fmt = fmtName == "rgba8" ? Format::Rgba8 : fmtName == "rgb565" ? Format::Rgb565 : fmtName == "rgba4444" ? Format::Rgba4444 : Format{};
  if (fmt == Format{}) { err = "format \"" + fmtName + "\" is not rgba8, rgb565 or rgba4444 (GPU formats: the texture importer)"; return false; }
  int w = 0, h = 0, k = 1;
  std::vector<std::uint8_t> rgba;
  if (!decodeImage(name, in, o, w, h, k, rgba, err)) return false;
  out = zimHeader(static_cast<int>(fmt), k, zim::Premultiplied, w, h);
  out.reserve(kImageHeader + rgba.size());
  for (std::size_t i = 0; i + 3 < rgba.size(); i += 4) {
    const unsigned a = rgba[i + 3], r = (rgba[i] * a + 127) / 255, g = (rgba[i + 1] * a + 127) / 255, b = (rgba[i + 2] * a + 127) / 255;
    if (fmt == Format::Rgba8) { out += static_cast<char>(r); out += static_cast<char>(g); out += static_cast<char>(b); out += static_cast<char>(a); }
    else if (fmt == Format::Rgb565) put16(out, (scaleTo(r, 31) << 11) | (scaleTo(g, 63) << 5) | scaleTo(b, 31));
    else put16(out, (scaleTo(r, 15) << 12) | (scaleTo(g, 15) << 8) | (scaleTo(b, 15) << 4) | scaleTo(a, 15));
  }
  return true;
}

bool importSpriteFile(const Options&, const std::string& name, const std::string& in, const Side& side, const Opts& o, std::string& out, std::string& err) {
  return importSprite(name, in, side.empty() ? std::string() : side.begin()->second, o, out, err);
}
bool importTilemapFile(const Options&, const std::string& name, const std::string& in, const Side& side, const Opts& o, std::string& out, std::string& err) {
  return importTilemap(name, in, side, o, out, err);
}
bool importTextureFile(const Options& opt, const std::string& name, const std::string& in, const Side&, const Opts& o, std::string& out, std::string& err) {
  return importTexture(opt.basisu, name, in, o, out, err);
}
bool importModelFile(const Options& opt, const std::string& name, const std::string& in, const Side& side, const Opts& o, std::string& out, std::string& err) {
  return importModel(opt.gltfpack, opt.basisu, name, in, side, o, out, err);
}

struct Importer { const char* id; int version; Kind kind; ImportFn run; };
// Built-in importers (the importer decision of ZN-434: codecs come as pinned command-line tools run as subprocesses, data formats as Zinc
// scripts, both from plugins; these need neither). A version changes when an importer's output for the same input changes. A sprite's
// artifact is its trimmed frames, never an entry: the frames of one atlas become its table and pages when their pack is written (sprite.h).
// A tile map's artifact is its table, the entry <map>.tilemap, and the frames of its tiles, which go to their atlas like a sprite's (tilemap.h).
const Importer kImporters[] = {
  {"copy", 1, Kind::Data, importCopy},
  {"image", 1, Kind::Image, importImage},
  {"sprite", 1, Kind::Image, importSpriteFile},
  {"tilemap", 1, Kind::Data, importTilemapFile},
  {"texture", 1, Kind::Image, importTextureFile},
  {"model", 1, Kind::Data, importModelFile},   // a bundle of entries (model.h): the model, its LODs, its textures
};
const Importer* findImporter(const std::string& id) {
  for (const Importer& i : kImporters) if (id == i.id) return &i;
  return nullptr;
}

const std::vector<Rule>& builtinRules() {
  static const std::vector<Rule> r = {{"**", "copy", {}}, {"**/*.{png,jpg,jpeg,webp,svg}", "image", {}}};
  return r;
}

std::uint64_t cacheBudget() {
  const char* mb = std::getenv("ZINC_ASSET_CACHE_MB");
  return mb && std::atoll(mb) > 0 ? static_cast<std::uint64_t>(std::atoll(mb)) << 20 : 2ull << 30;
}

/** Keeps the cache within its budget: the least recently used artifacts go first (a hit touches its file), down to three quarters. */
void trim(const std::string& cacheDir) {
  struct F { fs::file_time_type t; std::uint64_t size; fs::path p; };
  std::vector<F> all;
  std::uint64_t total = 0;
  std::error_code ec;
  for (auto it = fs::recursive_directory_iterator(cacheDir, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (!it->is_regular_file(ec)) continue;
    F f{it->last_write_time(ec), it->file_size(ec), it->path()};
    total += f.size;
    all.push_back(std::move(f));
  }
  const std::uint64_t budget = cacheBudget();
  if (total <= budget) return;
  std::sort(all.begin(), all.end(), [](const F& a, const F& b) { return a.t < b.t; });
  for (const F& f : all) {
    if (total <= budget / 4 * 3) break;
    if (fs::remove(f.p, ec)) total -= f.size;
  }
}

/** The report's packBytes of the items of `group`: what their entries take in the pack (the TOC's stored sizes); `outputs`: the entries of an
 *  item that makes several (a model), by its name. */
void storedSizes(const void* pack, std::size_t size, const std::string& group, const std::map<std::string, std::vector<std::string>>& outputs, Report& report) {
  zpk::Reader r;
  std::string err;
  if (!r.open(pack, size, err)) return;
  for (Item& it : report.items) {
    if (it.group != group) continue;
    const auto o = outputs.find(it.name);
    const std::vector<std::string> names = o != outputs.end() ? o->second : std::vector<std::string>{it.importer == std::string("tilemap") ? it.name + ".tilemap" : it.name};
    it.packBytes = 0;
    for (const std::string& n : names) if (const long i = r.find(n); i >= 0) it.packBytes += r.entry(static_cast<std::size_t>(i)).storedSize;
  }
}

}  // namespace

// ---------------------------------------------------------------- keys and the cache
Key& Key::add(std::string_view part) {
  const XXH128_hash_t h = XXH3_128bits(part.data(), part.size());
  XXH128_canonical_t c;
  XXH128_canonicalFromHash(&c, h);
  digests_.append(reinterpret_cast<const char*>(c.digest), sizeof c.digest);
  return *this;
}
std::string Key::hex() const {
  XXH128_canonical_t c;
  XXH128_canonicalFromHash(&c, XXH3_128bits(digests_.data(), digests_.size()));
  static const char* d = "0123456789abcdef";
  std::string s;
  for (unsigned char b : c.digest) { s += d[b >> 4]; s += d[b & 15]; }
  return s;
}

bool cached(const std::string& cacheDir, const std::string& key, const std::function<bool(std::string&, std::string&)>& make, std::string& out,
            bool& hit, std::string& err) {
  const fs::path p = cacheDir.empty() ? fs::path() : artifactPath(cacheDir, key);
  std::error_code ec;
  hit = !cacheDir.empty() && readFile(p, out);
  if (hit) { fs::last_write_time(p, fs::file_time_type::clock::now(), ec); return true; }   // recently used: kept when the cache is trimmed
  if (!make(out, err)) return false;
  if (!cacheDir.empty()) writeAtomic(p, out);   // a cache that cannot be written only costs the next build its time
  return true;
}

bool bake(const std::vector<std::string>& sources, const res::Options& opt, const std::string& cacheDir, const std::string& tool,
          std::vector<std::uint8_t>& blob, bool& hit, std::string& err) {
  Key k;
  k.add("font-baker 1").add(tool).add(std::to_string(opt.hiScale)).add(opt.wholeFonts ? "whole" : "subset");
  std::string lib;
  for (bool b : opt.library) lib += b ? '1' : '0';
  k.add(lib).add(std::to_string(sources.size()));
  for (const std::string& s : sources) k.add(s);
  k.add("leave").add(std::to_string(opt.leave.size()));
  for (const std::string& s : opt.leave) k.add(s);
  for (const std::string& dir : {opt.fontDir, opt.assetsDir}) {   // names and bytes of what the baker may read: fonts, images, texts
    std::vector<fs::path> files;
    std::error_code ec;
    if (!dir.empty())
      for (auto it = fs::recursive_directory_iterator(dir, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec))
        if (it->is_regular_file(ec) && res::bakerReads(it->path().extension().string())) files.push_back(it->path());
    std::sort(files.begin(), files.end());
    k.add("dir").add(std::to_string(files.size()));
    std::string bytes;
    for (const fs::path& f : files) k.add(fs::relative(f, dir, ec).generic_string()).add(readFile(f, bytes) ? bytes : std::string("\x01unreadable"));
  }
  std::string out;
  if (!cached(cacheDir, k.hex(), [&](std::string& o, std::string& e) {
        std::vector<std::uint8_t> b;
        if (!res::bake(sources, opt, b, e)) return false;
        o.assign(b.begin(), b.end());
        return true;
      }, out, hit, err)) return false;
  if (!hit && !cacheDir.empty()) trim(cacheDir);
  blob.assign(out.begin(), out.end());
  return true;
}

bool splash(const Splash& s, const std::string& cacheDir, const std::string& tool, std::string& out, std::string& artifact, std::string& err, bool* hitOut) {
  std::string bytes;
  if (!s.image.empty() && !readFile(s.image, bytes)) { err = "splash: cannot read " + s.image; return false; }
  const std::string ext = fs::path(s.image).extension().string();
  Key k;
  k.add("zinc-splash 1").add(tool).add(std::to_string(s.background)).add(std::to_string(s.fit)).add(std::to_string(s.minMs)).add(std::to_string(s.fadeMs)).add(ext).add(bytes);
  const std::string key = k.hex();
  bool hit = false;
  auto u32 = [](std::string& o, std::uint32_t v) { for (int i = 0; i < 4; ++i) o += static_cast<char>(v >> (8 * i) & 0xff); };
  if (!cached(cacheDir, key, [&](std::string& o, std::string& e) {
        o = "ZSP1";
        u32(o, s.background);
        o += static_cast<char>(s.fit);
        o.append(3, '\0');
        u32(o, s.minMs);
        u32(o, s.fadeMs);
        if (s.image.empty()) return true;
        std::string zim;
        // an SVG drawn as large as the importer goes (8 pixels a unit, 1024 wide at most): the splash usually fills a window
        if (!importImage(Options{}, s.image, bytes, {}, Opts{{"scale", ext == ".svg" ? "8" : "1"}}, zim, e)) { e = "splash " + s.image + ": " + e; return false; }
        o += zim;
        return true;
      }, out, hit, err)) return false;
  artifact = cacheDir.empty() ? std::string() : artifactPath(cacheDir, key).string();
  if (hitOut) *hitOut = hit;
  return true;
}

std::string importerFor(const std::string& name, const std::vector<Rule>& rules) {
  std::string id;
  for (const auto* list : {&builtinRules(), &rules})
    for (const Rule& r : *list) {
      try { if (!r.as.empty() && std::regex_match(name, globRegex(r.match))) id = r.as; }
      catch (const std::regex_error&) {}   // build() names the bad glob
    }
  return id;
}

// ---------------------------------------------------------------- the build
bool build(const Options& opt, Report& report, std::string& err) {
  const auto t0 = Clock::now();
  report = Report{};
  std::error_code ec;
  const bool haveDir = fs::is_directory(opt.sourceDir, ec);
  if (!haveDir && !opt.splash.on) { err = opt.sourceDir + " is not a directory"; return false; }
  std::vector<std::string> names;   // relative, '/' separated, sorted; hidden files and directories (.DS_Store, .git) stay out
  for (auto it = fs::recursive_directory_iterator(opt.sourceDir, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    const std::string rel = it->path().lexically_relative(opt.sourceDir).generic_string();   // lexical: a linked file keeps its own name (fs::relative would follow the link)
    if (rel.empty() || rel[0] == '.' || rel.find("/.") != std::string::npos) { if (it->is_directory(ec)) it.disable_recursion_pending(); continue; }
    if (it->is_regular_file(ec)) names.push_back(rel);
  }
  if (ec && haveDir) { err = opt.sourceDir + ": " + ec.message(); return false; }
  std::sort(names.begin(), names.end());

  struct R { std::regex re; const Rule* rule; };
  std::vector<R> rules;
  for (const auto* list : {&builtinRules(), &opt.rules})
    for (const Rule& r : *list) {
      try { rules.push_back({globRegex(r.match), &r}); }
      catch (const std::regex_error&) { err = "the rule \"" + r.match + "\" is not a valid glob"; return false; }
    }
  struct G { std::string name; std::vector<std::regex> include, exclude; };
  std::vector<G> groups;
  auto compile = [&](const std::string& group, const std::vector<std::string>& globs, std::vector<std::regex>& out) {
    for (const std::string& glob : globs) {
      try { out.push_back(globRegex(glob)); }
      catch (const std::regex_error&) { err = "the group " + group + " names \"" + glob + "\", which is not a valid glob"; return false; }
    }
    return true;
  };
  for (const Group& g : opt.groups) {
    groups.push_back({g.name, {}, {}});
    if (!compile(g.name, g.include, groups.back().include) || !compile(g.name, g.exclude, groups.back().exclude)) return false;
  }
  auto any = [](const std::vector<std::regex>& globs, const std::string& name) { return std::any_of(globs.begin(), globs.end(), [&](const std::regex& re) { return std::regex_match(name, re); }); };

  // an artifact found in the cache is only read when its pack must be written: an unchanged project reads each source once and nothing else
  // atlas: the atlas of a sprite or of a map's tiles; deps: the files it reads besides itself (the image of a sprite sheet, a map's tilesets)
  struct Entry { std::string name, key; const Importer* imp; Opts opts; std::string data; bool loaded = false; std::string atlas; std::vector<std::string> deps; };
  auto readSource = [&](const Entry& e, std::string& bytes, Side& side) {
    if (!readFile(fs::path(opt.sourceDir) / e.name, bytes)) { err = e.name + ": cannot read the file"; return false; }
    for (const std::string& d : e.deps)
      if (!readFile(fs::path(opt.sourceDir) / d, side[d])) { err = e.name + ": cannot read " + d + ", which it names"; return false; }
    return true;
  };
  auto import = [&](Entry& e, const std::string& bytes, const Side& side) {
    std::string ierr;
    if (!e.imp->run(opt, e.name, bytes, side, e.opts, e.data, ierr)) { err = e.name + ": " + ierr; return false; }
    e.loaded = true;
    if (!opt.cacheDir.empty()) writeAtomic(artifactPath(opt.cacheDir, e.key), e.data);   // a cache that cannot be written only costs the next build its time
    return true;
  };
  std::vector<Entry> sources;
  std::set<std::string> sheets;   // images that sprite sheets read: when a sprite rule takes one too, it is not a frame of its own
  for (const std::string& name : names) {
    std::string id;
    Opts o;
    for (const R& r : rules)
      if (std::regex_match(name, r.re)) {
        if (!r.rule->as.empty()) id = r.rule->as;
        for (const auto& [k, v] : r.rule->options) o[k] = v;
      }
    const Importer* imp = findImporter(id);
    if (!imp) { err = name + ": no importer \"" + id + "\" (built in: copy, image, sprite, tilemap, texture, model)"; return false; }
    if (imp->run == importTextureFile || imp->run == importModelFile) {   // the target's profile, unless the rule says: part of the key, so each profile has its own artifact
      const std::string pre = imp->run == importModelFile ? "texture." : "";   // a model's textures, as a texture rule's
      auto prof = [&](const char* k) { auto it = opt.targetProfile.find(k); return it == opt.targetProfile.end() ? std::string() : it->second; };
      if (!o.count(pre + "format")) o[pre + "format"] = opt.profile == "release" && !prof("texture").empty() ? prof("texture") : "rgba8";   // dev: no encoder to wait for
      for (const char* k : {"maxSize", "pot"}) if (!o.count(pre + k) && !prof(k).empty()) o[pre + k] = prof(k);
    }
    if (imp->kind == Kind::Image && !o.count("scale")) {   // an SVG is drawn for 2x screens; a raster image is as many pixels per point as its @Nx says
      static const std::regex hi("@([1-8])x\\.[^.]+$");
      std::smatch m;
      o["scale"] = fs::path(name).extension() == ".svg" ? "2" : std::regex_search(name, m, hi) ? m[1].str() : "1";
    }
    Entry e{name, {}, imp, std::move(o), {}, false, {}, {}};
    if (imp->run == importSpriteFile) {
      e.atlas = e.opts.count("atlas") ? e.opts.at("atlas") : "sprites";
      if (fs::path(name).extension() == ".json") {
        std::string json;
        if (!readFile(fs::path(opt.sourceDir) / name, json)) { err = name + ": cannot read the file"; return false; }
        e.deps = {sheetImage(name, json)};
        if (e.deps[0].empty()) { err = name + ": not a sprite sheet (TexturePacker or Aseprite JSON with meta.image in the assets directory)"; return false; }
        sheets.insert(e.deps[0]);
      }
    } else if (imp->run == importTilemapFile) {
      e.atlas = e.opts.count("atlas") ? e.opts.at("atlas") : kTileAtlas;
      std::string json;
      if (!readFile(fs::path(opt.sourceDir) / name, json)) { err = name + ": cannot read the file"; return false; }
      auto read = [&](const std::string& f, std::string& bytes) { return readFile(fs::path(opt.sourceDir) / f, bytes); };
      if (!tilemapDeps(name, json, read, e.deps, err)) { err = name + ": " + err; return false; }
    } else if (imp->run == importModelFile) {
      std::string model;
      if (!readFile(fs::path(opt.sourceDir) / name, model)) { err = name + ": cannot read the file"; return false; }
      if (!modelDeps(name, model, e.deps, err)) { err = name + ": " + err; return false; }
    }
    sources.push_back(std::move(e));
  }
  std::map<std::string, std::vector<std::string>> outputs;   // the entries of the models, by name
  std::map<std::string, std::vector<Entry>> packs;   // by group name
  std::map<std::string, std::pair<std::string, std::string>> atlases;   // the group and the packing options of each atlas: one of each
  for (Entry& e : sources) {
    if (!e.atlas.empty() && sheets.count(e.name)) continue;
    const auto t = Clock::now();
    std::string bytes;
    Side side;
    if (!readSource(e, bytes, side)) return false;
    Key k;
    k.add("zinc-asset 1").add(e.imp->id).add(std::to_string(e.imp->version)).add(opt.tool);
    for (const auto& [key, v] : e.opts) k.add(key).add(v);
    k.add(bytes);
    if (!e.deps.empty()) k.add(e.name);   // the files it names are found from its place, and a map's tiles are named by their image's path
    for (const auto& [d, b] : side) k.add(d).add(b);
    e.key = k.hex();
    std::uint64_t outBytes = 0;
    const bool hit = !opt.cacheDir.empty() && (outBytes = fs::file_size(artifactPath(opt.cacheDir, e.key), ec), !ec);
    if (hit) fs::last_write_time(artifactPath(opt.cacheDir, e.key), fs::file_time_type::clock::now(), ec);   // recently used: kept when the cache is trimmed
    else if (!import(e, bytes, side)) return false;
    else outBytes = e.data.size();
    std::string group = "default";
    for (const G& g : groups)
      if (any(g.include, e.name) && !any(g.exclude, e.name)) { group = g.name; break; }
    if (!e.atlas.empty()) {
      std::string packing;
      for (const char* key : {"extrude", "padding", "maxSize", "pot"}) packing += std::string(key) + "=" + (e.opts.count(key) ? e.opts.at(key) : "") + " ";
      auto [it, fresh] = atlases.emplace(e.atlas, std::make_pair(group, packing));
      if (!fresh && it->second.first != group) { err = e.name + ": the atlas " + e.atlas + " has frames in the groups " + it->second.first + " and " + group + ": an atlas is loaded with one group"; return false; }
      if (!fresh && it->second.second != packing) { err = e.name + ": the rules give the atlas " + e.atlas + " two settings of extrude, padding, maxSize or pot"; return false; }
    }
    std::uint64_t sourceBytes = bytes.size();
    for (const auto& [d, b] : side) sourceBytes += b.size();
    report.items.push_back({e.name, e.imp->id, group, sourceBytes, outBytes, msSince(t), hit, {}, 0, 0});
    if (e.imp->kind == Kind::Image) {   // its layout and GPU bytes, from the artifact's header (a cached one: its first bytes only)
      std::string head = e.data.substr(0, 512);
      if (!e.loaded) {
        std::ifstream in(artifactPath(opt.cacheDir, e.key), std::ios::binary);
        head.resize(512);
        in.read(head.data(), 512);
        head.resize(static_cast<std::size_t>(std::max<std::streamsize>(0, in.gcount())));
      }
      describeImage(head, report.items.back().format, report.items.back().gpuBytes);
    }
    if (e.imp->run == importModelFile) {   // its entries, and the GPU bytes of its textures, from the bundle's directory (a cached one: read in place)
      auto bytesAt = [&](std::uint64_t off, std::size_t n) {
        if (e.loaded) return e.data.substr(std::min<std::size_t>(off, e.data.size()), n);
        std::string s(n, '\0');
        std::ifstream in(artifactPath(opt.cacheDir, e.key), std::ios::binary);
        in.seekg(static_cast<std::streamoff>(off));
        in.read(s.data(), static_cast<std::streamsize>(n));
        s.resize(static_cast<std::size_t>(std::max<std::streamsize>(0, in.gcount())));
        return s;
      };
      std::vector<BundleEntry> dir;
      std::size_t want = 4096, need = 0;
      std::string head = bytesAt(0, want);
      while (!bundleDirectory(head, dir, need) && need > head.size() && head.size() == want) head = bytesAt(0, want = need * 2);
      Item& it = report.items.back();
      it.format = e.opts.count("format") ? e.opts.at("format") : "glb";
      for (const BundleEntry& b : dir) {
        outputs[e.name].push_back(b.name);
        std::string f;
        std::uint64_t gpu = 0;
        if (b.kind == Kind::Image && describeImage(bytesAt(b.offset, 512), f, gpu)) it.gpuBytes += gpu;
      }
    }
    if (!hit) ++report.imported;
    packs[group].push_back(std::move(e));
  }
  if (report.imported && !opt.cacheDir.empty()) trim(opt.cacheDir);
  // the engine splash (ZN-446): an entry of boot.zpk of its own, stored as it is so that the host maps it before anything else starts
  std::string splashData;
  if (opt.splash.on) {
    const auto t = Clock::now();
    std::string artifact;
    bool hit = false;
    if (!splash(opt.splash, opt.cacheDir, opt.tool, splashData, artifact, err, &hit)) return false;
    const std::uint64_t src = opt.splash.image.empty() ? 0 : fs::file_size(opt.splash.image, ec);
    report.items.push_back({kSplashEntry, "splash", "boot", src, splashData.size(), msSince(t), hit, {}, 0, 0});
    if (!hit) ++report.imported;
    packs["boot"];   // a pack of the splash alone when no asset is in the group
  }

  // one pack per group, rewritten only when one of its entries or the profile changed (.packs keeps each pack's key and size)
  fs::create_directories(opt.outDir, ec);
  const fs::path index = fs::path(opt.outDir) / ".packs";
  std::map<std::string, std::string> before, after;
  {
    std::ifstream in(index);
    for (std::string file, key; in >> file >> key;) before[file] = key;
  }
  for (auto& [group, entries] : packs) {
    const std::string file = group + ".zpk";
    // the target's pack codec in a release build (its profile's `pack`), none in a dev build: entries mapped as they are
    auto pk = opt.targetProfile.find("pack");
    const std::string packCodec = opt.profile != "release" ? "none" : pk == opt.targetProfile.end() ? "zstd" : pk->second;
    Key k;
    k.add("zpk 1").add(opt.profile).add(packCodec);
    for (const Entry& e : entries) k.add(e.name).add(e.key).add(std::string(1, static_cast<char>(e.imp->kind)));
    const bool withSplash = opt.splash.on && group == "boot";
    if (withSplash) k.add(kSplashEntry).add(splashData);
    const std::string key = k.hex() + ":" + std::to_string(entries.size() + withSplash);
    const fs::path path = fs::path(opt.outDir) / file;
    std::uint64_t size = fs::file_size(path, ec);
    if (ec || before[file] != key) {
      const zpk::Codec codec = packCodec == "lz4" ? zpk::Codec::Lz4 : packCodec == "zstd" ? zpk::Codec::Zstd : packCodec == "zstd-dict" ? zpk::Codec::ZstdDict : zpk::Codec::None;
      std::vector<zpk::Input> inputs;
      if (withSplash) inputs.push_back({kSplashEntry, splashData, 0, Kind::SplashFrame, zpk::Codec::None});
      std::map<std::string, std::vector<std::pair<std::string, std::string>>> frames;   // the sprites of each atlas
      std::map<std::string, const Opts*> packing;
      for (Entry& e : entries) {
        if (!e.loaded && !readFile(artifactPath(opt.cacheDir, e.key), e.data)) {   // trimmed by another build since: imported again
          std::string bytes;
          Side side;
          if (!readSource(e, bytes, side) || !import(e, bytes, side)) return false;
        }
        if (e.imp->run == importModelFile) {   // the model, its LODs and its textures: entries of their own
          std::vector<BundleEntry> parts;
          if (!splitBundle(e.data, parts)) { err = e.name + ": a damaged model artifact"; return false; }
          for (BundleEntry& b : parts) inputs.push_back({b.name, std::move(b.data), 0, static_cast<Kind>(b.kind), codec});
          continue;
        }
        if (e.imp->run == importTilemapFile) {   // its table is an entry, its tiles are frames of its atlas
          std::string tiles, table;
          if (!splitTilemap(e.data, tiles, table)) { err = e.name + ": a damaged tile map artifact"; return false; }
          inputs.push_back({e.name + ".tilemap", std::move(table), 0, Kind::Data, codec});
          e.data = std::move(tiles);
        }
        if (!e.atlas.empty()) { frames[e.atlas].push_back({e.name, std::move(e.data)}); packing.emplace(e.atlas, &e.opts); continue; }
        inputs.push_back({e.name, std::move(e.data), 0, e.imp->kind, codec});
      }
      for (const auto& [atlas, list] : frames) {
        std::vector<zpk::Input> made;
        if (!buildAtlas(atlas, list, *packing[atlas], made, err)) return false;
        for (zpk::Input& m : made) { m.codec = codec; inputs.push_back(std::move(m)); }
      }
      std::string bytes;
      if (!zpk::write(std::move(inputs), zpk::WriteOptions{}, bytes, err)) { err = file + ": " + err; return false; }
      if (!writeAtomic(path, bytes)) { err = "cannot write " + path.string(); return false; }
      size = bytes.size();
      storedSizes(bytes.data(), bytes.size(), group, outputs, report);
    } else if (const int fd = ::open(path.c_str(), O_RDONLY); fd >= 0) {   // unchanged: its TOC read in place
      void* m = size ? ::mmap(nullptr, size, PROT_READ, MAP_PRIVATE, fd, 0) : MAP_FAILED;   // ponytail: POSIX mmap, as the CLI's other file code
      ::close(fd);
      if (m != MAP_FAILED) { storedSizes(m, size, group, outputs, report); ::munmap(m, size); }
    }
    after[file] = key;
    report.packs.push_back({file, group, entries.size() + withSplash, size});
  }
  for (const auto& e : fs::directory_iterator(opt.outDir, ec))   // packs of groups that are gone
    if (e.path().extension() == ".zpk" && !after.count(e.path().filename().string())) fs::remove(e.path(), ec);
  std::string idx;
  for (const auto& [file, key] : after) idx += file + " " + key + "\n";
  if (!writeAtomic(index, idx)) { err = "cannot write " + index.string(); return false; }
  report.ms = msSince(t0);
  if (!writeAtomic(fs::path(opt.outDir) / "report.json", reportJson(opt, report))) { err = "cannot write the report in " + opt.outDir; return false; }
  return true;
}

std::string reportJson(const Options& opt, const Report& r) {
  auto ms = [](double v) { char b[32]; std::snprintf(b, sizeof b, "%.3f", v); return std::string(b); };
  std::uint64_t src = 0, outBytes = 0, gpu = 0;
  std::string s = "{\n  \"version\": 1,\n  \"target\": " + jsonString(opt.target) + ",\n  \"profile\": " + jsonString(opt.profile) + ",\n  \"assets\": [";
  for (std::size_t i = 0; i < r.items.size(); ++i) {
    const Item& it = r.items[i];
    src += it.sourceBytes;
    outBytes += it.outputBytes;
    gpu += it.gpuBytes;
    s += std::string(i ? "," : "") + "\n    {\"name\": " + jsonString(it.name) + ", \"importer\": " + jsonString(it.importer) + ", \"group\": " + jsonString(it.group) +
         ", \"sourceBytes\": " + std::to_string(it.sourceBytes) + ", \"outputBytes\": " + std::to_string(it.outputBytes) + ", \"ms\": " + ms(it.ms) +
         ", \"cached\": " + (it.cached ? "true" : "false") + ", \"packBytes\": " + std::to_string(it.packBytes) +
         (it.format.empty() ? std::string() : ", \"format\": " + jsonString(it.format) + ", \"gpuBytes\": " + std::to_string(it.gpuBytes)) + "}";
  }
  s += std::string(r.items.empty() ? "" : "\n  ") + "],\n  \"packs\": [";
  std::uint64_t packBytes = 0;
  for (std::size_t i = 0; i < r.packs.size(); ++i) {
    const Pack& p = r.packs[i];
    packBytes += p.bytes;
    s += std::string(i ? "," : "") + "\n    {\"file\": " + jsonString(p.file) + ", \"group\": " + jsonString(p.group) + ", \"entries\": " + std::to_string(p.entries) +
         ", \"bytes\": " + std::to_string(p.bytes) + "}";
  }
  s += std::string(r.packs.empty() ? "" : "\n  ") + "],\n  \"totals\": {\"assets\": " + std::to_string(r.items.size()) + ", \"imported\": " + std::to_string(r.imported) +
       ", \"sourceBytes\": " + std::to_string(src) + ", \"outputBytes\": " + std::to_string(outBytes) + ", \"packBytes\": " + std::to_string(packBytes) + ", \"gpuBytes\": " + std::to_string(gpu) +
       ", \"ms\": " + ms(r.ms) + "}\n}\n";
  return s;
}

}  // namespace zn::assets
