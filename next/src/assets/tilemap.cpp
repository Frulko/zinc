// Tile maps (ZN-443): Tiled .tmj and LDtk .ldtk to the text table zinc:tilemap reads, the tiles they use cut out of their tilesets as frames
// of an atlas. See tilemap.h; the table is described in docs/reports/zinc-next-assets.md ("Tile maps").
#include "assets/tilemap.h"

#include "assets/sprite.h"
#include "res/codec.h"
#include "stb_image.h"   // its inflate (the baker's stb_image, in zn_res): Tiled's zlib and gzip layer data
#include "yyjson.h"
#include "zstd.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <memory>
#include <set>
#include <unordered_map>

namespace fs = std::filesystem;

namespace zn::assets {
namespace {

using Side = std::map<std::string, std::string>;
constexpr std::uint32_t kFlipX = 0x80000000u, kFlipY = 0x40000000u, kFlipDiagonal = 0x20000000u, kGidMask = 0x0fffffffu;   // Tiled's gid bits

/** A file `from` names, as a path of the assets directory; "" when it is outside it. */
std::string rel(const std::string& from, const std::string& path) {
  const std::string p = (fs::path(from).parent_path() / path).lexically_normal().generic_string();
  return path.empty() || p.empty() || p[0] == '/' || p == ".." || p.rfind("../", 0) == 0 ? std::string() : p;
}
std::string lowerExt(const std::string& name) {
  std::string e = fs::path(name).extension().string();
  std::transform(e.begin(), e.end(), e.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return e;
}

struct Doc {   // a parsed JSON document, freed with its scope
  yyjson_doc* d;
  explicit Doc(const std::string& s) : d(yyjson_read(s.data(), s.size(), 0)) {}
  ~Doc() { yyjson_doc_free(d); }
  Doc(const Doc&) = delete;
  Doc& operator=(const Doc&) = delete;
  yyjson_val* root() const { return yyjson_doc_get_root(d); }
};
yyjson_val* get(yyjson_val* o, const char* k) { return yyjson_obj_get(o, k); }
double num(yyjson_val* o, const char* k, double def = 0) { yyjson_val* v = get(o, k); return yyjson_is_num(v) ? yyjson_get_num(v) : def; }
int inum(yyjson_val* o, const char* k, int def = 0) { return static_cast<int>(std::lround(num(o, k, def))); }
std::string str(yyjson_val* o, const char* k) { yyjson_val* v = get(o, k); return yyjson_is_str(v) ? yyjson_get_str(v) : std::string(); }
bool boolean(yyjson_val* o, const char* k, bool def) { yyjson_val* v = get(o, k); return yyjson_is_bool(v) ? yyjson_get_bool(v) : def; }
std::string jsonText(yyjson_val* v) {
  char* s = yyjson_val_write(v, 0, nullptr);
  std::string out = s ? s : "null";
  std::free(s);
  return out;
}

bool isTiled(yyjson_val* root) { return str(root, "type") == "map"; }
bool isLdtk(yyjson_val* root) { return yyjson_is_obj(get(root, "defs")) && (yyjson_is_arr(get(root, "levels")) || yyjson_is_arr(get(root, "worlds"))); }
bool notAMap(const std::string& name, yyjson_val* root, std::string& err) {
  const std::string e = lowerExt(name);
  if (e == ".tmx" || e == ".tsx") err = "a Tiled XML file: save it as JSON (.tmj), or `tiled --export-map json " + fs::path(name).filename().string() + " out.tmj`";
  else if (!isTiled(root) && !isLdtk(root)) err = "not a Tiled JSON map (.tmj) or an LDtk project (.ldtk)";
  else return false;
  return true;
}

std::vector<yyjson_val*> ldtkLevels(yyjson_val* root) {   // the levels of the project and of each of its worlds (LDtk's multi-worlds)
  std::vector<yyjson_val*> out;
  size_t i, n, j, m;
  yyjson_val *lv, *w;
  yyjson_arr_foreach(get(root, "levels"), i, n, lv) out.push_back(lv);
  yyjson_arr_foreach(get(root, "worlds"), j, m, w) yyjson_arr_foreach(get(w, "levels"), i, n, lv) out.push_back(lv);
  return out;
}

std::string esc(const std::string& s) {   // a table field: no tab or line break of its own
  std::string o;
  for (char c : s) {
    if (c == '\\') o += "\\\\";
    else if (c == '\t') o += "\\t";
    else if (c == '\n') o += "\\n";
    else if (c == '\r') o += "\\r";
    else o += c;
  }
  return o;
}
std::string fmt(double v) { char b[32]; std::snprintf(b, sizeof b, "%.9g", v); return b; }
/** "#RRGGBB" or "#AARRGGBB" (Tiled) to 0xRRGGBB and its alpha 0..1; false for anything else. */
bool color(const std::string& s, std::uint32_t& rgb, double& alpha) {
  if (s.size() != 7 && s.size() != 9) return false;
  if (s[0] != '#') return false;
  const std::uint32_t v = static_cast<std::uint32_t>(std::strtoul(s.c_str() + 1, nullptr, 16));
  rgb = v & 0xffffff;
  alpha = s.size() == 9 ? (v >> 24) / 255.0 : 1;
  return true;
}
std::uint32_t mulRgb(std::uint32_t a, std::uint32_t b) {
  std::uint32_t o = 0;
  for (int s = 0; s < 24; s += 8) o |= (((a >> s & 0xff) * (b >> s & 0xff) + 127) / 255) << s;
  return o;
}

bool base64(const std::string& s, std::string& out) {
  static const std::string kAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::uint32_t v = 0;
  int bits = 0;
  for (char c : s) {
    if (c == '=') break;
    if (c == ' ' || c == '\n' || c == '\r' || c == '\t') continue;
    const std::size_t p = kAlphabet.find(c);
    if (p == std::string::npos) return false;
    v = (v << 6) | static_cast<std::uint32_t>(p);
    bits += 6;
    if (bits >= 8) { bits -= 8; out += static_cast<char>((v >> bits) & 0xff); }
  }
  return true;
}
bool inflate(const std::string& in, std::size_t at, bool zlibHeader, std::size_t expect, std::string& out) {
  if (at > in.size()) return false;
  int len = 0;
  char* p = stbi_zlib_decode_malloc_guesssize_headerflag(in.data() + at, static_cast<int>(in.size() - at), static_cast<int>(expect), &len, zlibHeader);
  if (!p) return false;
  out.assign(p, static_cast<std::size_t>(len));
  std::free(p);
  return true;
}
/** Where the deflate data of a gzip member starts (RFC 1952: the fixed header, then the optional fields its flags announce). */
std::size_t gzipBody(const std::string& s) {
  if (s.size() < 10 || static_cast<unsigned char>(s[0]) != 0x1f || static_cast<unsigned char>(s[1]) != 0x8b || s[2] != 8) return std::string::npos;
  const unsigned flags = static_cast<unsigned char>(s[3]);
  std::size_t at = 10;
  if (flags & 4) at += 2 + (static_cast<unsigned char>(s[at]) | static_cast<unsigned char>(s[at + 1]) << 8);
  for (unsigned f : {8u, 16u}) if (flags & f) { while (at < s.size() && s[at]) ++at; ++at; }   // the file name, the comment
  if (flags & 2) at += 2;
  return at;
}

/** The gids of a Tiled tile layer: a JSON array (the CSV encoding), or base64 of little-endian u32, uncompressed, zlib, gzip or zstd. */
bool tiledCells(yyjson_val* l, std::size_t n, std::vector<std::uint32_t>& gids, std::string& err) {
  yyjson_val* d = get(l, "data");
  gids.clear();
  if (yyjson_is_arr(d)) {
    size_t i, m;
    yyjson_val* v;
    yyjson_arr_foreach(d, i, m, v) gids.push_back(static_cast<std::uint32_t>(yyjson_get_num(v)));
  } else if (yyjson_is_str(d)) {
    const std::string enc = str(l, "encoding"), comp = str(l, "compression");
    std::string raw, bytes;
    if (enc != "base64" || !base64(yyjson_get_str(d), raw)) { err = "its data is neither an array nor base64"; return false; }
    bool ok = true;
    if (comp.empty()) bytes = std::move(raw);
    else if (comp == "zlib") ok = inflate(raw, 0, true, n * 4, bytes);
    else if (comp == "gzip") ok = inflate(raw, gzipBody(raw), false, n * 4, bytes);
    else if (comp == "zstd") {
      bytes.resize(n * 4);
      const std::size_t r = ZSTD_decompress(bytes.data(), bytes.size(), raw.data(), raw.size());
      ok = !ZSTD_isError(r) && r == bytes.size();
    } else { err = "its compression \"" + comp + "\" is not zlib, gzip or zstd"; return false; }
    if (!ok) { err = "its " + comp + " data does not decompress"; return false; }
    for (std::size_t i = 0; i + 3 < bytes.size(); i += 4) {
      std::uint32_t g = 0;
      for (int k = 0; k < 4; ++k) g |= static_cast<std::uint32_t>(static_cast<unsigned char>(bytes[i + k])) << (8 * k);
      gids.push_back(g);
    }
  }
  if (gids.size() != n) { err = "it has " + std::to_string(gids.size()) + " cells, not width x height = " + std::to_string(n); return false; }
  return true;
}

struct Image { int w = 0, h = 0; std::vector<std::uint8_t> rgba; };

/** The table being written and the tiles it uses. */
struct Out {
  const Side& side;
  std::string& err;
  std::map<std::string, Image> images;
  std::vector<Cut> cuts;
  std::set<std::string> cut;
  std::map<std::string, int> tiles;   // "frame\tdx\tdy" to its index, from 1 (0 is an empty cell)
  std::string tileRows, body;

  /** The index of a tile: the rectangle (x, y, w, h) of `image`, transposed (Tiled's diagonal flip: the texels' x and y swapped), drawn
   *  (dx, dy) from the top left corner of its cell. 0 with `err` when it is not inside the image. */
  int tile(const std::string& image, int x, int y, int w, int h, bool transposed, double dx, double dy) {
    auto src = side.find(image);
    if (src == side.end()) { err = "the tileset image " + image + " was not read"; return 0; }
    Image& im = images[image];
    if (im.rgba.empty()) {
      const auto* b = reinterpret_cast<const std::uint8_t*>(src->second.data());
      if (!res::imageSize(b, src->second.size(), im.w, im.h) || static_cast<long long>(im.w) * im.h > (1LL << 26) ||
          !res::decodeRgba(b, src->second.size(), im.w, im.h, im.rgba)) { err = "the tileset image " + image + " is not a PNG, JPEG, WebP, BMP or GIF image this importer reads"; return 0; }
    }
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > im.w || y + h > im.h) {
      err = "the tile at " + std::to_string(x) + "," + std::to_string(y) + " (" + std::to_string(w) + " x " + std::to_string(h) + ") is not inside " + image;
      return 0;
    }
    const std::string frame = image + "#" + std::to_string(x) + "," + std::to_string(y) + "," + std::to_string(w) + "," + std::to_string(h) + (transposed ? ",t" : "");
    if (cut.insert(frame).second) {
      Cut c{frame, transposed ? h : w, transposed ? w : h, {}};
      c.rgba.resize(static_cast<std::size_t>(w) * h * 4);
      for (int v = 0; v < c.h; ++v)
        for (int u = 0; u < c.w; ++u) {
          const int sx = transposed ? x + v : x + u, sy = transposed ? y + u : y + v;
          std::memcpy(&c.rgba[(static_cast<std::size_t>(v) * c.w + u) * 4], &im.rgba[(static_cast<std::size_t>(sy) * im.w + sx) * 4], 4);
        }
      cuts.push_back(std::move(c));
    }
    const std::string key = esc(frame) + "\t" + fmt(dx) + "\t" + fmt(dy);
    auto [it, fresh] = tiles.emplace(key, static_cast<int>(tiles.size()) + 1);
    if (fresh) tileRows += "tile\t" + key + "\n";
    return it->second;
  }
  void prop(const std::string& name, const std::string& type, yyjson_val* v) {
    body += "prop\t" + esc(name) + "\t" + type + "\t" + esc(yyjson_is_null(v) || !v ? std::string() : yyjson_is_str(v) ? yyjson_get_str(v) : jsonText(v)) + "\n";
  }
  void layer(const std::string& name, int cols, int rows, double cellW, double cellH, double x, double y, double opacity, bool visible, double px,
             double py, std::uint32_t tint) {
    body += "layer\t" + esc(name);
    for (double v : {static_cast<double>(cols), static_cast<double>(rows), cellW, cellH, x, y, opacity}) body += "\t" + fmt(v);
    body += std::string("\t") + (visible ? "1" : "0") + "\t" + fmt(px) + "\t" + fmt(py) + "\t" + std::to_string(tint) + "\n";
  }
  void row(const char* kind, const std::vector<std::uint32_t>& v) {
    body += kind;
    char sep = '\t';
    for (std::uint32_t c : v) { body += sep; body += std::to_string(c); sep = ','; }
    body += "\n";
  }
};

// ---------------------------------------------------------------- Tiled
struct Tileset { std::uint32_t first = 0; std::string image; int tw = 0, th = 0, columns = 0, count = 0, margin = 0, spacing = 0; double ox = 0, oy = 0; };

void tiledProps(Out& o, yyjson_val* props) {
  size_t i, n;
  yyjson_val* p;
  yyjson_arr_foreach(props, i, n, p) {
    std::string type = str(p, "type");
    if (type.empty()) type = "string";
    else if (type == "class") type = "json";
    o.prop(str(p, "name"), type, get(p, "value"));
  }
}

struct Tiled {
  Out& o;
  std::vector<Tileset> sets;
  int tw = 0, th = 0, cols = 0, rows = 0;
  std::unordered_map<std::uint32_t, std::uint32_t> byGid = {};   // the cells already made: a big map repeats few tiles

  /** A gid (flip bits included) to a cell: the tile's index times 4, plus 1 when mirrored in x, 2 in y. */
  bool cell(std::uint32_t gid, bool object, std::uint32_t& out) {
    out = 0;
    const std::uint32_t id = gid & kGidMask;
    if (!id) return true;
    if (auto it = byGid.find(gid); !object && it != byGid.end()) { out = it->second; return true; }
    const Tileset* s = nullptr;
    for (const Tileset& t : sets) if (t.first <= id) s = &t;
    const std::uint32_t local = s ? id - s->first : 0;
    if (!s || s->columns <= 0 || (s->count > 0 && local >= static_cast<std::uint32_t>(s->count))) { o.err = "the tile " + std::to_string(id) + " is in no tileset"; return false; }
    const bool d = gid & kFlipDiagonal;
    const int x = s->margin + static_cast<int>(local % s->columns) * (s->tw + s->spacing), y = s->margin + static_cast<int>(local / s->columns) * (s->th + s->spacing);
    // in a cell, a tile stands on the cell's bottom left corner (taller tiles reach into the row above); a tile object is placed by its own x, y
    const int k = o.tile(s->image, x, y, s->tw, s->th, d, object ? 0 : s->ox, object ? 0 : th - (d ? s->tw : s->th) + s->oy);
    if (!k) return false;
    out = static_cast<std::uint32_t>(k) * 4 + (gid & kFlipX ? 1 : 0) + (gid & kFlipY ? 2 : 0);
    if (!object) byGid[gid] = out;
    return true;
  }

  struct Inherited { double x = 0, y = 0, opacity = 1, px = 1, py = 1; bool visible = true; std::uint32_t tint = 0xffffff; };

  bool layers(yyjson_val* list, const Inherited& up) {
    size_t i, n;
    yyjson_val* l;
    yyjson_arr_foreach(list, i, n, l) {
      Inherited me = up;
      me.x += num(l, "offsetx");
      me.y += num(l, "offsety");
      me.opacity *= num(l, "opacity", 1);
      me.visible = me.visible && boolean(l, "visible", true);
      me.px *= num(l, "parallaxx", 1);
      me.py *= num(l, "parallaxy", 1);
      std::uint32_t tint;
      double tintAlpha;
      if (color(str(l, "tintcolor"), tint, tintAlpha)) { me.tint = mulRgb(me.tint, tint); me.opacity *= tintAlpha; }
      const std::string type = str(l, "type"), name = str(l, "name");
      if (type == "group") { if (!layers(get(l, "layers"), me)) return false; continue; }
      if (type != "tilelayer" && type != "objectgroup") continue;   // image layers are not drawn yet
      const bool tiles = type == "tilelayer";
      o.layer(name, tiles ? cols : 0, tiles ? rows : 0, tw, th, me.x, me.y, me.opacity, me.visible, me.px, me.py, me.tint);
      tiledProps(o, get(l, "properties"));
      if (tiles) {
        std::vector<std::uint32_t> gids;
        if (!tiledCells(l, static_cast<std::size_t>(cols) * rows, gids, o.err)) { o.err = "the layer " + name + ": " + o.err; return false; }
        for (std::uint32_t& g : gids) if (!cell(g, false, g)) return false;
        o.row("cells", gids);
        continue;
      }
      size_t j, m;
      yyjson_val* obj;
      yyjson_arr_foreach(get(l, "objects"), j, m, obj) {
        std::string shape = "rect", points;
        for (const char* s : {"point", "ellipse"}) if (boolean(obj, s, false)) shape = s;
        for (const char* s : {"polygon", "polyline"}) {
          yyjson_val* pts = get(obj, s);
          if (!yyjson_is_arr(pts)) continue;
          shape = s;
          size_t k, q;
          yyjson_val* pt;
          yyjson_arr_foreach(pts, k, q, pt) points += (points.empty() ? "" : ",") + fmt(num(pt, "x")) + "," + fmt(num(pt, "y"));
        }
        if (yyjson_is_obj(get(obj, "text"))) shape = "text";
        std::uint32_t tile = 0;
        if (yyjson_is_num(get(obj, "gid"))) {   // a tile object: its tile's bottom left corner is at (x, y)
          shape = "tile";
          if (!cell(static_cast<std::uint32_t>(num(obj, "gid")), true, tile)) return false;
        }
        std::string cls = str(obj, "type");
        if (cls.empty()) cls = str(obj, "class");
        o.body += "object\t" + fmt(num(obj, "id")) + "\t" + esc(str(obj, "name")) + "\t" + esc(cls) + "\t" + shape;
        for (const char* k : {"x", "y", "width", "height", "rotation"}) o.body += "\t" + fmt(num(obj, k));
        o.body += "\t" + std::to_string(tile) + "\t" + points + "\n";
        tiledProps(o, get(obj, "properties"));
      }
    }
    return true;
  }
};

bool tiledMap(Out& o, const std::string& name, yyjson_val* root) {
  if (str(root, "orientation") != "orthogonal") { o.err = "the map is " + str(root, "orientation") + ": only orthogonal maps are imported yet"; return false; }
  if (boolean(root, "infinite", false)) { o.err = "an infinite map: not imported yet (turn Infinite off in the map's properties)"; return false; }
  Tiled t{o, {}, inum(root, "tilewidth"), inum(root, "tileheight"), inum(root, "width"), inum(root, "height")};
  std::vector<std::unique_ptr<Doc>> docs;   // external tilesets, alive while their values are read
  size_t i, n;
  yyjson_val* ts;
  yyjson_arr_foreach(get(root, "tilesets"), i, n, ts) {
    Tileset s;
    s.first = static_cast<std::uint32_t>(num(ts, "firstgid"));
    yyjson_val* def = ts;
    std::string base = name;
    if (!str(ts, "source").empty()) {
      base = rel(name, str(ts, "source"));
      auto it = o.side.find(base);
      if (it == o.side.end()) { o.err = "the tileset " + str(ts, "source") + " was not read"; return false; }
      docs.push_back(std::make_unique<Doc>(it->second));
      def = docs.back()->root();
      if (!yyjson_is_obj(def)) { o.err = "the tileset " + base + " is not JSON (.tsj)"; return false; }
    }
    s.image = rel(base, str(def, "image"));
    if (s.image.empty()) { o.err = "the tileset " + str(def, "name") + " has no image in the assets directory (collections of images are not imported yet)"; return false; }
    s.tw = inum(def, "tilewidth"); s.th = inum(def, "tileheight"); s.columns = inum(def, "columns"); s.count = inum(def, "tilecount");
    s.margin = inum(def, "margin"); s.spacing = inum(def, "spacing");
    s.ox = num(get(def, "tileoffset"), "x"); s.oy = num(get(def, "tileoffset"), "y");
    t.sets.push_back(std::move(s));
  }
  std::sort(t.sets.begin(), t.sets.end(), [](const Tileset& a, const Tileset& b) { return a.first < b.first; });
  std::uint32_t bg = 0;
  double alpha = 0;
  const bool hasBg = color(str(root, "backgroundcolor"), bg, alpha);
  o.body += "level\t" + esc(fs::path(name).stem().string()) + "\t0\t0\t" + std::to_string(t.cols * t.tw) + "\t" + std::to_string(t.rows * t.th) + "\t" +
            (hasBg ? std::to_string(bg) : std::string("-1")) + "\n";
  tiledProps(o, get(root, "properties"));
  return t.layers(get(root, "layers"), {});
}

// ---------------------------------------------------------------- LDtk
void ldtkFields(Out& o, yyjson_val* fields) {
  size_t i, n;
  yyjson_val* f;
  yyjson_arr_foreach(fields, i, n, f) {
    const std::string t = str(f, "__type");
    const char* type = t == "Int" ? "int" : t == "Float" ? "float" : t == "Bool" ? "bool" : t == "String" || t == "Multilines" ? "string" : t == "Color" ? "color"
                     : t == "FilePath" ? "file" : t.rfind("LocalEnum.", 0) == 0 || t.rfind("ExternEnum.", 0) == 0 ? "enum" : "json";
    o.prop(str(f, "__identifier"), type, get(f, "__value"));
  }
}

bool ldtkProject(Out& o, const std::string& name, yyjson_val* root) {
  struct Set { std::string image; int grid = 0; };
  std::map<int, Set> sets;
  std::map<std::array<int, 5>, int> seen;   // (tileset, source x, y, offset in the cell x, y) to the tile: a level repeats few tiles
  size_t i, n;
  yyjson_val* v;
  yyjson_arr_foreach(get(get(root, "defs"), "tilesets"), i, n, v) sets[inum(v, "uid")] = {rel(name, str(v, "relPath")), inum(v, "tileGridSize")};
  for (yyjson_val* lv : ldtkLevels(root)) {
    std::uint32_t bg = 0;
    double alpha = 0;
    const bool hasBg = color(str(lv, "__bgColor"), bg, alpha);
    o.body += "level\t" + esc(str(lv, "identifier"));
    for (const char* k : {"worldX", "worldY", "pxWid", "pxHei"}) o.body += "\t" + fmt(num(lv, k));
    o.body += "\t" + (hasBg ? std::to_string(bg) : std::string("-1")) + "\n";
    ldtkFields(o, get(lv, "fieldInstances"));
    yyjson_val* list = get(lv, "layerInstances");
    for (size_t k = yyjson_arr_size(list); k-- > 0;) {   // the first layer is on top
      yyjson_val* li = yyjson_arr_get(list, k);
      const std::string type = str(li, "__type"), lname = str(li, "__identifier");
      const int g = inum(li, "__gridSize"), cols = inum(li, "__cWid"), rows = inum(li, "__cHei");
      const double x = num(li, "__pxTotalOffsetX"), y = num(li, "__pxTotalOffsetY"), opacity = num(li, "__opacity", 1);
      const bool visible = boolean(li, "visible", true);
      if (type == "Entities") {
        o.layer(lname, 0, 0, g, g, x, y, opacity, visible, 1, 1, 0xffffff);
        size_t j, m;
        yyjson_val* e;
        yyjson_arr_foreach(get(li, "entityInstances"), j, m, e) {   // placed by their pivot: the record has the top left corner
          const double w = num(e, "width"), h = num(e, "height");
          yyjson_val* pivot = get(e, "__pivot");
          yyjson_val* px = get(e, "px");
          const double ex = yyjson_get_num(yyjson_arr_get(px, 0)) - yyjson_get_num(yyjson_arr_get(pivot, 0)) * w;
          const double ey = yyjson_get_num(yyjson_arr_get(px, 1)) - yyjson_get_num(yyjson_arr_get(pivot, 1)) * h;
          o.body += "object\t" + esc(str(e, "iid")) + "\t" + esc(str(e, "__identifier")) + "\t" + esc(str(e, "__identifier")) + "\trect\t" + fmt(ex) + "\t" + fmt(ey) +
                    "\t" + fmt(w) + "\t" + fmt(h) + "\t0\t0\t\n";
          ldtkFields(o, get(e, "fieldInstances"));
        }
        continue;
      }
      // tiles in display order (the first beneath): a cell's first tile goes to the layer, its second to a second layer of the same name...
      std::vector<std::vector<std::uint32_t>> stacks;
      std::vector<int> depth(static_cast<std::size_t>(std::max(0, cols * rows)), 0);
      yyjson_val* tiles = get(li, type == "Tiles" ? "gridTiles" : "autoLayerTiles");
      const auto set = sets.find(inum(li, "__tilesetDefUid", -1));
      size_t j, m;
      yyjson_val* t;
      yyjson_arr_foreach(tiles, j, m, t) {
        if (set == sets.end() || g <= 0) { o.err = "the layer " + lname + " has tiles and no tileset"; return false; }
        yyjson_val* px = get(t, "px");
        yyjson_val* src = get(t, "src");
        const int tx = static_cast<int>(yyjson_get_num(yyjson_arr_get(px, 0))), ty = static_cast<int>(yyjson_get_num(yyjson_arr_get(px, 1)));
        const int cx = tx / g, cy = ty / g;
        if (tx < 0 || ty < 0 || cx >= cols || cy >= rows) continue;   // outside the level: LDtk does not draw it either
        const std::array<int, 5> key = {set->first, static_cast<int>(yyjson_get_num(yyjson_arr_get(src, 0))), static_cast<int>(yyjson_get_num(yyjson_arr_get(src, 1))),
                                        tx - cx * g, ty - cy * g};
        int& k2 = seen[key];
        if (!k2) k2 = o.tile(set->second.image, key[1], key[2], set->second.grid, set->second.grid, false, key[3], key[4]);
        if (!k2) return false;
        const std::size_t c = static_cast<std::size_t>(cy) * cols + cx;
        const int d = depth[c]++;
        if (d >= static_cast<int>(stacks.size())) stacks.emplace_back(depth.size(), 0);
        stacks[d][c] = static_cast<std::uint32_t>(k2) * 4 + (inum(t, "f") & 3);
      }
      if (stacks.empty()) stacks.emplace_back(depth.size(), 0);   // an IntGrid layer without tiles keeps its values
      for (std::size_t d = 0; d < stacks.size(); ++d) {
        o.layer(lname, cols, rows, g, g, x, y, opacity, visible, 1, 1, 0xffffff);
        o.row("cells", stacks[d]);
        if (d == 0 && type == "IntGrid") {
          std::vector<std::uint32_t> ints;
          yyjson_val* iv;
          yyjson_arr_foreach(get(li, "intGridCsv"), j, m, iv) ints.push_back(static_cast<std::uint32_t>(yyjson_get_num(iv)));
          o.row("ints", ints);
        }
      }
    }
  }
  return true;
}

}  // namespace

bool tilemapDeps(const std::string& name, const std::string& json, const std::function<bool(const std::string&, std::string&)>& read,
                 std::vector<std::string>& deps, std::string& err) {
  Doc doc(json);
  yyjson_val* root = doc.root();
  if (notAMap(name, root, err)) return false;
  std::set<std::string> out;
  auto add = [&](const std::string& from, const std::string& path, const char* what) {
    const std::string p = rel(from, path);
    if (p.empty()) { err = what + std::string(" ") + path + " is not in the assets directory"; return std::string(); }
    out.insert(p);
    return p;
  };
  if (isTiled(root)) {
    size_t i, n;
    yyjson_val* ts;
    yyjson_arr_foreach(get(root, "tilesets"), i, n, ts) {
      const std::string source = str(ts, "source");
      if (source.empty()) {
        if (add(name, str(ts, "image"), "the tileset image").empty()) return false;
        continue;
      }
      const std::string p = add(name, source, "the tileset");
      if (p.empty()) return false;
      if (lowerExt(p) == ".tsx") { err = "the tileset " + source + " is Tiled XML: export it as JSON (.tsj) and name that in the map"; return false; }
      std::string bytes;
      if (!read(p, bytes)) { err = "cannot read the tileset " + p; return false; }
      Doc t(bytes);
      if (add(p, str(t.root(), "image"), "the tileset image").empty()) return false;
    }
  } else {
    for (yyjson_val* lv : ldtkLevels(root)) {
      if (yyjson_is_str(get(lv, "externalRelPath"))) { err = "the level " + str(lv, "identifier") + " is in a file of its own: not imported yet (turn off \"Save levels to separate files\")"; return false; }
      size_t i, n;
      yyjson_val* li;
      yyjson_arr_foreach(get(lv, "layerInstances"), i, n, li)
        if (yyjson_is_str(get(li, "__tilesetRelPath")) && add(name, str(li, "__tilesetRelPath"), "the tileset image").empty()) return false;
    }
  }
  deps.assign(out.begin(), out.end());
  return true;
}

bool importTilemap(const std::string& name, const std::string& in, const Side& side, const std::map<std::string, std::string>& opts, std::string& out, std::string& err) {
  Doc doc(in);
  yyjson_val* root = doc.root();
  if (notAMap(name, root, err)) return false;
  Out o{side, err, {}, {}, {}, {}, {}, {}};
  if (!(isTiled(root) ? tiledMap(o, name, root) : ldtkProject(o, name, root))) return false;
  const auto atlas = opts.find("atlas");
  const std::string table = "zinc-tilemap\t1\natlas\t" + esc(atlas == opts.end() ? kTileAtlas : atlas->second) + "\n" + o.tileRows + o.body;
  const std::string frames = spriteArtifact(std::move(o.cuts));
  out = "ZTM1";
  for (int k = 0; k < 4; ++k) out += static_cast<char>((frames.size() >> (8 * k)) & 0xff);
  out += frames;
  out += table;
  return true;
}

bool splitTilemap(const std::string& a, std::string& frames, std::string& table) {
  if (a.size() < 8 || a.compare(0, 4, "ZTM1") != 0) return false;
  std::size_t n = 0;
  for (int k = 0; k < 4; ++k) n |= static_cast<std::size_t>(static_cast<unsigned char>(a[4 + k])) << (8 * k);
  if (8 + n > a.size()) return false;
  frames = a.substr(8, n);
  table = a.substr(8 + n);
  return true;
}

}  // namespace zn::assets
