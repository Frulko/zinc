// The asset build (ZN-434): rules, the importer registry, the content-addressed cache, groups to packs, report.json. See assets.h.
#include "assets/assets.h"

#include "assets/sprite.h"
#include "res/codec.h"
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
// `side`: the bytes of the file a source names and its importer also reads (the image of a sprite sheet), empty for the others
using ImportFn = bool (*)(const std::string& name, const std::string& in, const std::string& side, const Opts& o, std::string& out, std::string& err);

bool importCopy(const std::string&, const std::string& in, const std::string&, const Opts&, std::string& out, std::string&) { out = in; return true; }

void put16(std::string& o, unsigned v) { o += static_cast<char>(v & 0xff); o += static_cast<char>(v >> 8); }
unsigned scaleTo(unsigned v, unsigned max) { return (v * max + 127) / 255; }

bool importImage(const std::string& name, const std::string& in, const std::string&, const Opts& o, std::string& out, std::string& err) {
  const std::string fmtName = o.count("format") ? o.at("format") : "rgba8";
  const Format fmt = fmtName == "rgba8" ? Format::Rgba8 : fmtName == "rgb565" ? Format::Rgb565 : fmtName == "rgba4444" ? Format::Rgba4444 : Format{};
  if (fmt == Format{}) { err = "format \"" + fmtName + "\" is not rgba8, rgb565 or rgba4444"; return false; }
  const int scale = std::max(1, std::min(8, o.count("scale") ? std::atoi(o.at("scale").c_str()) : 1));
  int w = 0, h = 0, k = scale;
  std::vector<std::uint8_t> rgba;
  const auto* bytes = reinterpret_cast<const std::uint8_t*>(in.data());
  if (fs::path(name).extension() == ".svg") {   // drawn at `scale` pixels per unit, at most 1024 pixels wide, as the baker does
    if (!res::rasterizeSvg(in, 0, w, h, rgba, err)) return false;
    k = std::max(1, std::min(scale, 1024 / std::max(1, w)));
    if (k > 1 && !res::rasterizeSvg(in, w * k, w, h, rgba, err)) return false;
  } else if (!res::imageSize(bytes, in.size(), w, h) || static_cast<long long>(w) * h > (1LL << 26) || !res::decodeRgba(bytes, in.size(), w, h, rgba)) {
    err = "not a PNG, JPEG, WebP, BMP or GIF image this importer reads (or larger than 2^26 pixels)";
    return false;
  }
  out = zimHeader(static_cast<int>(fmt), k, true, w, h);
  out.reserve(kImageHeader + rgba.size());
  for (std::size_t i = 0; i + 3 < rgba.size(); i += 4) {
    const unsigned a = rgba[i + 3], r = (rgba[i] * a + 127) / 255, g = (rgba[i + 1] * a + 127) / 255, b = (rgba[i + 2] * a + 127) / 255;
    if (fmt == Format::Rgba8) { out += static_cast<char>(r); out += static_cast<char>(g); out += static_cast<char>(b); out += static_cast<char>(a); }
    else if (fmt == Format::Rgb565) put16(out, (scaleTo(r, 31) << 11) | (scaleTo(g, 63) << 5) | scaleTo(b, 31));
    else put16(out, (scaleTo(r, 15) << 12) | (scaleTo(g, 15) << 8) | (scaleTo(b, 15) << 4) | scaleTo(a, 15));
  }
  return true;
}

struct Importer { const char* id; int version; Kind kind; ImportFn run; };
// Built-in importers (the importer decision of ZN-434: codecs come as pinned command-line tools run as subprocesses, data formats as Zinc
// scripts, both from plugins; these need neither). A version changes when an importer's output for the same input changes. A sprite's
// artifact is its trimmed frames, never an entry: the frames of one atlas become its table and pages when their pack is written (sprite.h).
const Importer kImporters[] = {
  {"copy", 1, Kind::Data, importCopy},
  {"image", 1, Kind::Image, importImage},
  {"sprite", 1, Kind::Image, importSprite},
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

// ---------------------------------------------------------------- the build
bool build(const Options& opt, Report& report, std::string& err) {
  const auto t0 = Clock::now();
  report = Report{};
  std::error_code ec;
  if (!fs::is_directory(opt.sourceDir, ec)) { err = opt.sourceDir + " is not a directory"; return false; }
  std::vector<std::string> names;   // relative, '/' separated, sorted; hidden files and directories (.DS_Store, .git) stay out
  for (auto it = fs::recursive_directory_iterator(opt.sourceDir, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    const std::string rel = it->path().lexically_relative(opt.sourceDir).generic_string();   // lexical: a linked file keeps its own name (fs::relative would follow the link)
    if (rel.empty() || rel[0] == '.' || rel.find("/.") != std::string::npos) { if (it->is_directory(ec)) it.disable_recursion_pending(); continue; }
    if (it->is_regular_file(ec)) names.push_back(rel);
  }
  if (ec) { err = opt.sourceDir + ": " + ec.message(); return false; }
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
  // atlas: the atlas of a sprite; sheet: the image a sprite sheet (JSON) names, read with it
  struct Entry { std::string name, key; const Importer* imp; Opts opts; std::string data; bool loaded = false; std::string atlas, sheet; };
  auto readSource = [&](const Entry& e, std::string& bytes, std::string& side) {
    if (!readFile(fs::path(opt.sourceDir) / e.name, bytes)) { err = e.name + ": cannot read the file"; return false; }
    if (!e.sheet.empty() && !readFile(fs::path(opt.sourceDir) / e.sheet, side)) { err = e.name + ": cannot read the image of the sheet, " + e.sheet; return false; }
    return true;
  };
  auto import = [&](Entry& e, const std::string& bytes, const std::string& side) {
    std::string ierr;
    if (!e.imp->run(e.name, bytes, side, e.opts, e.data, ierr)) { err = e.name + ": " + ierr; return false; }
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
    if (!imp) { err = name + ": no importer \"" + id + "\" (built in: copy, image, sprite)"; return false; }
    if (imp->kind == Kind::Image && !o.count("scale")) {   // an SVG is drawn for 2x screens; a raster image is as many pixels per point as its @Nx says
      static const std::regex hi("@([1-8])x\\.[^.]+$");
      std::smatch m;
      o["scale"] = fs::path(name).extension() == ".svg" ? "2" : std::regex_search(name, m, hi) ? m[1].str() : "1";
    }
    Entry e{name, {}, imp, std::move(o), {}, false, {}, {}};
    if (imp->run == importSprite) {
      e.atlas = e.opts.count("atlas") ? e.opts.at("atlas") : "sprites";
      if (fs::path(name).extension() == ".json") {
        std::string json;
        if (!readFile(fs::path(opt.sourceDir) / name, json)) { err = name + ": cannot read the file"; return false; }
        e.sheet = sheetImage(name, json);
        if (e.sheet.empty()) { err = name + ": not a sprite sheet (TexturePacker or Aseprite JSON with meta.image in the assets directory)"; return false; }
        sheets.insert(e.sheet);
      }
    }
    sources.push_back(std::move(e));
  }
  std::map<std::string, std::vector<Entry>> packs;   // by group name
  std::map<std::string, std::pair<std::string, std::string>> atlases;   // the group and the packing options of each atlas: one of each
  for (Entry& e : sources) {
    if (!e.atlas.empty() && sheets.count(e.name)) continue;
    const auto t = Clock::now();
    std::string bytes, side;
    if (!readSource(e, bytes, side)) return false;
    Key k;
    k.add("zinc-asset 1").add(e.imp->id).add(std::to_string(e.imp->version)).add(opt.tool);
    for (const auto& [key, v] : e.opts) k.add(key).add(v);
    k.add(bytes);
    if (!e.sheet.empty()) k.add(side);
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
    report.items.push_back({e.name, e.imp->id, group, bytes.size() + side.size(), outBytes, msSince(t), hit});
    if (!hit) ++report.imported;
    packs[group].push_back(std::move(e));
  }
  if (report.imported && !opt.cacheDir.empty()) trim(opt.cacheDir);

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
    Key k;
    k.add("zpk 1").add(opt.profile);
    for (const Entry& e : entries) k.add(e.name).add(e.key).add(std::string(1, static_cast<char>(e.imp->kind)));
    const std::string key = k.hex() + ":" + std::to_string(entries.size());
    const fs::path path = fs::path(opt.outDir) / file;
    std::uint64_t size = fs::file_size(path, ec);
    if (ec || before[file] != key) {
      const zpk::Codec codec = opt.profile == "release" ? zpk::Codec::Zstd : zpk::Codec::None;
      std::vector<zpk::Input> inputs;
      std::map<std::string, std::vector<std::pair<std::string, std::string>>> frames;   // the sprites of each atlas
      std::map<std::string, const Opts*> packing;
      for (Entry& e : entries) {
        if (!e.loaded && !readFile(artifactPath(opt.cacheDir, e.key), e.data)) {   // trimmed by another build since: imported again
          std::string bytes, side;
          if (!readSource(e, bytes, side) || !import(e, bytes, side)) return false;
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
    }
    after[file] = key;
    report.packs.push_back({file, group, entries.size(), size});
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
  std::uint64_t src = 0, outBytes = 0;
  std::string s = "{\n  \"version\": 1,\n  \"target\": " + jsonString(opt.target) + ",\n  \"profile\": " + jsonString(opt.profile) + ",\n  \"assets\": [";
  for (std::size_t i = 0; i < r.items.size(); ++i) {
    const Item& it = r.items[i];
    src += it.sourceBytes;
    outBytes += it.outputBytes;
    s += std::string(i ? "," : "") + "\n    {\"name\": " + jsonString(it.name) + ", \"importer\": " + jsonString(it.importer) + ", \"group\": " + jsonString(it.group) +
         ", \"sourceBytes\": " + std::to_string(it.sourceBytes) + ", \"outputBytes\": " + std::to_string(it.outputBytes) + ", \"ms\": " + ms(it.ms) +
         ", \"cached\": " + (it.cached ? "true" : "false") + "}";
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
       ", \"sourceBytes\": " + std::to_string(src) + ", \"outputBytes\": " + std::to_string(outBytes) + ", \"packBytes\": " + std::to_string(packBytes) +
       ", \"ms\": " + ms(r.ms) + "}\n}\n";
  return s;
}

}  // namespace zn::assets
