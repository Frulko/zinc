#include "zapp.h"

#include <unistd.h>

#include "platform/platform.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <vector>

extern "C" {
#include "sha256.h"  // third_party/sha256: the members are hashed as they stream
}
#include "tc/tc.h"
#include "yyjson.h"
#include "zn/bytecode.h"
#include "zn/runtime.h"

namespace zn::zapp {
namespace {

void octal(char* field, std::size_t width, unsigned long long v) {   // width includes the terminating NUL
  std::snprintf(field, width, "%0*llo", static_cast<int>(width - 1), v);
}

std::string header(const std::string& name, std::size_t size, unsigned mode = 0644, char type = '0') {
  char h[512];
  std::memset(h, 0, sizeof h);
  std::string base = name, prefix;
  if (name.size() > 100) {   // ustar: a long name is prefix / name, split at a slash
    const std::size_t cut = name.rfind('/', 155);
    prefix = name.substr(0, cut);
    base = name.substr(cut + 1);
  }
  std::memcpy(h, base.data(), base.size());
  octal(h + 100, 8, mode);
  octal(h + 108, 8, 0);
  octal(h + 116, 8, 0);
  octal(h + 124, 12, size);
  octal(h + 136, 12, 0);   // time 0: the same archive every time
  std::memset(h + 148, ' ', 8);
  h[156] = type;
  std::memcpy(h + 257, "ustar", 6);
  std::memcpy(h + 263, "00", 2);
  std::memcpy(h + 345, prefix.data(), prefix.size());
  unsigned sum = 0;
  for (unsigned char c : h) sum += c;
  std::snprintf(h + 148, 8, "%06o", sum);
  return std::string(h, sizeof h);
}

std::string jsonString(const std::string& s) {
  std::string o = "\"";
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; }
  return o + "\"";
}

/** Major, minor, patch of "a.b.c" for an ordering; missing parts are 0. */
long long versionKey(const std::string& v) {
  long long k = 0;
  std::istringstream in(v);
  std::string part;
  for (int i = 0; i < 3; ++i) { long long n = 0; if (std::getline(in, part, '.')) n = std::atoll(part.c_str()); k = k * 100000 + n; }
  return k;
}

}  // namespace

std::string ustar(const std::vector<TarEntry>& entries) {
  std::string out;
  for (const TarEntry& e : entries) {
    out += header(e.name, e.dir ? 0 : e.data.size(), e.dir ? 0755 : e.mode, e.dir ? '5' : '0');
    if (e.dir) continue;
    out += e.data;
    out.append((512 - e.data.size() % 512) % 512, '\0');
  }
  out.append(1024, '\0');
  return out;
}

std::string ar(const std::vector<std::pair<std::string, std::string>>& members) {
  std::string out = "!<arch>\n";
  for (const auto& [name, data] : members) {
    char h[61];
    std::snprintf(h, sizeof h, "%-16s%-12s%-6s%-6s%-8s%-10zu`\n", name.c_str(), "0", "0", "0", "100644", data.size());
    out.append(h, 60);
    out += data;
    if (data.size() % 2) out += '\n';
  }
  return out;
}

std::string pack(const std::map<std::string, std::string>& files, const std::string& name, const std::string& engine, unsigned zbc, unsigned rt) {
  std::string manifest = "{\n  \"format\": " + std::to_string(kFormat) + ",\n  \"engine\": " + jsonString(engine);
  if (zbc) manifest += ",\n  \"needs\": {\"zbc\": " + std::to_string(zbc) + ", \"rt\": " + std::to_string(rt) + "}";
  manifest += ",\n  \"name\": " + jsonString(name) + ",\n  \"files\": {";
  bool first = true;
  for (const auto& [n, bytes] : files) { manifest += std::string(first ? "\n" : ",\n") + "    " + jsonString(n) + ": " + jsonString(zn::tc::sha256Hex(bytes)); first = false; }
  manifest += "\n  },\n  \"signature\": \"\"\n}\n";
  std::vector<TarEntry> entries{{"manifest.json", manifest}};
  for (const auto& [n, bytes] : files) entries.push_back({n, bytes});   // std::map: sorted names
  return ustar(entries);
}

bool tarSpans(const std::string& archive, std::vector<TarSpan>& spans, std::string& err) {
  spans.clear();
  std::size_t at = 0;
  while (at + 512 <= archive.size()) {
    const char* h = archive.data() + at;
    bool zero = true;
    for (int i = 0; i < 512; ++i) if (h[i] != 0) { zero = false; break; }
    if (zero) break;
    if (std::memcmp(h + 257, "ustar", 5) != 0) { err = "not a ustar archive (no header at byte " + std::to_string(at) + ")"; return false; }
    unsigned sum = 0;
    for (int i = 0; i < 512; ++i) sum += (i >= 148 && i < 156) ? ' ' : static_cast<unsigned char>(h[i]);
    if (std::strtoul(std::string(h + 148, 8).c_str(), nullptr, 8) != sum) { err = "the archive is corrupted (a header checksum is wrong)"; return false; }
    std::string name(h, strnlen(h, 100)), prefix(h + 345, strnlen(h + 345, 155));
    if (!prefix.empty()) name = prefix + "/" + name;
    const std::size_t size = std::strtoull(std::string(h + 124, 12).c_str(), nullptr, 8);
    if (name.empty() || name.find("..") != std::string::npos || name[0] == '/') { err = "the archive names a file outside it: " + name; return false; }
    if (at + 512 + size > archive.size()) { err = "the archive is truncated"; return false; }
    spans.push_back({name, at + 512, size, h[156] == '0' || h[156] == 0});   // directories are implied by the names
    at += 512 + (size + 511) / 512 * 512;
  }
  return true;
}

bool untar(const std::string& archive, std::map<std::string, std::string>& files, std::string& err) {
  files.clear();
  std::vector<TarSpan> spans;
  if (!tarSpans(archive, spans, err)) return false;
  for (const TarSpan& s : spans) if (s.file) files[s.name] = archive.substr(s.at, s.size);
  return true;
}

namespace {
// manifest.json: its format and engine checked, the SHA-256 of each listed file in `sums`
bool readManifest(const std::string& text, const std::string& engine, std::map<std::string, std::string>& sums, std::string& err) {
  yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
  yyjson_val* r = doc ? yyjson_doc_get_root(doc) : nullptr;
  if (!yyjson_is_obj(r)) { yyjson_doc_free(doc); err = "the archive's manifest.json is not valid"; return false; }
  const long long fmt = yyjson_get_sint(yyjson_obj_get(r, "format"));
  const char* eng = yyjson_get_str(yyjson_obj_get(r, "engine"));
  bool ok = true;
  if (fmt > kFormat) { err = "this archive is format " + std::to_string(fmt) + ", this zinc reads format " + std::to_string(kFormat) + ": update zinc (zinc update)"; ok = false; }
  else if (yyjson_val* needs = yyjson_obj_get(r, "needs"); yyjson_is_obj(needs)) {   // a compiled program: what it uses, not who packed it
    const long long zbc = yyjson_get_sint(yyjson_obj_get(needs, "zbc")), rt = yyjson_get_sint(yyjson_obj_get(needs, "rt"));
    const long long have = static_cast<long long>(zn::Rt::Count), reads = zn::kZbcVersion;
    if (zbc != reads) { err = "this app is bytecode version " + std::to_string(zbc) + ", this zinc engine reads version " + std::to_string(reads) + (zbc > reads ? ": update zinc (zinc update)" : ": pack the app again with this zinc"); ok = false; }
    else if (rt > have) { err = "this app needs a newer zinc engine (runtime call " + std::to_string(rt - 1) + ", this engine has " + std::to_string(have) + "): update zinc (zinc update)"; ok = false; }
  }
  else if (eng && versionKey(eng) > versionKey(engine)) { err = std::string("this archive was made for zinc ") + eng + ", this is zinc " + engine + ": update zinc (zinc update)"; ok = false; }
  yyjson_val* fs = yyjson_obj_get(r, "files");
  std::size_t i, n; yyjson_val *k, *v;
  if (ok && yyjson_is_obj(fs)) yyjson_obj_foreach(fs, i, n, k, v) sums[yyjson_get_str(k)] = yyjson_is_str(v) ? yyjson_get_str(v) : "";
  yyjson_doc_free(doc);
  return ok;
}
std::string corrupted(const std::string& name) { return "the archive is corrupted: " + name + " does not match its checksum"; }
std::string missing(const std::string& name) { return "the archive is incomplete: " + name + " is missing"; }
const char* kUnlisted = "the archive holds files its manifest does not list";
}  // namespace

bool unpack(const std::string& archive, const std::string& engine, std::map<std::string, std::string>& files, std::string& err) {
  if (!untar(archive, files, err)) return false;
  auto m = files.find("manifest.json");
  if (m == files.end()) { err = "not a .zapp archive (no manifest.json)"; return false; }
  std::map<std::string, std::string> sums;
  if (!readManifest(m->second, engine, sums, err)) return false;
  for (const auto& [name, sum] : sums) {
    auto f = files.find(name);
    if (f == files.end()) { err = missing(name); return false; }
    if (zn::tc::sha256Hex(f->second) != sum) { err = corrupted(name); return false; }
  }
  if (sums.size() + 1 != files.size()) { err = kUnlisted; return false; }
  return true;
}

bool unpackTo(const std::string& path, std::uint64_t offset, std::uint64_t size, const std::string& engine, const std::string& cacheRoot, std::string& dir, std::string& err) {
  namespace fs = std::filesystem;
  std::ifstream in(path, std::ios::binary);
  if (!in) { err = "cannot read it"; return false; }
  struct Member { std::string name; std::uint64_t at, size; };
  std::vector<Member> members;   // the headers only: the data is skipped
  char h[512];
  for (std::uint64_t at = 0; at + 512 <= size;) {
    in.seekg(static_cast<std::streamoff>(offset + at));
    if (!in.read(h, 512)) { err = "the archive is truncated"; return false; }
    bool zero = true;
    for (int i = 0; i < 512; ++i) if (h[i] != 0) { zero = false; break; }
    if (zero) break;
    if (std::memcmp(h + 257, "ustar", 5) != 0) { err = "not a ustar archive (no header at byte " + std::to_string(at) + ")"; return false; }
    unsigned sum = 0;
    for (int i = 0; i < 512; ++i) sum += (i >= 148 && i < 156) ? ' ' : static_cast<unsigned char>(h[i]);
    if (std::strtoul(std::string(h + 148, 8).c_str(), nullptr, 8) != sum) { err = "the archive is corrupted (a header checksum is wrong)"; return false; }
    std::string name(h, strnlen(h, 100)), prefix(h + 345, strnlen(h + 345, 155));
    if (!prefix.empty()) name = prefix + "/" + name;
    const std::uint64_t n = std::strtoull(std::string(h + 124, 12).c_str(), nullptr, 8);
    if (name.empty() || name.find("..") != std::string::npos || name[0] == '/') { err = "the archive names a file outside it: " + name; return false; }
    if (at + 512 + n > size) { err = "the archive is truncated"; return false; }
    if (h[156] == '0' || h[156] == 0) members.push_back({name, at + 512, n});
    at += 512 + (n + 511) / 512 * 512;
  }
  auto read = [&](const Member& m, std::string& out) { out.resize(m.size); in.clear(); in.seekg(static_cast<std::streamoff>(offset + m.at)); return static_cast<bool>(in.read(out.data(), static_cast<std::streamsize>(m.size))); };
  const Member* man = nullptr;
  for (const Member& m : members) if (m.name == "manifest.json") man = &m;
  if (!man) { err = "not a .zapp archive (no manifest.json)"; return false; }
  std::string manifest;
  std::map<std::string, std::string> sums;
  if (man->size > (16u << 20) || !read(*man, manifest)) { err = "the archive's manifest.json is not valid"; return false; }
  if (!readManifest(manifest, engine, sums, err)) return false;
  std::map<std::string, const Member*> byName;
  for (const Member& m : members) byName[m.name] = &m;
  for (const auto& [name, s] : sums) if (!byName.count(name)) { err = missing(name); return false; }
  if (sums.size() + 1 != byName.size()) { err = kUnlisted; return false; }
  dir = (fs::path(cacheRoot) / zn::tc::sha256Hex(manifest).substr(0, 24)).string();   // the manifest names every file's hash: the content
  long long fileSize = 0, mtime = 0;
  if (!zn::plat::fileStamp(path, fileSize, mtime)) { err = "cannot read it"; return false; }
  const std::string stamp = path + "\t" + std::to_string(fileSize) + "\t" + std::to_string(mtime / 1000000000LL) + "." + std::to_string(mtime % 1000000000LL) + "\t" + std::to_string(offset);
  std::error_code ec;
  const fs::path stamps = fs::path(dir) / ".checked";   // the files (path, size, time, offset) found whole: they are not read again
  const bool have = fs::exists(fs::path(dir) / "manifest.json", ec);
  if (have) { std::ifstream sf(stamps); for (std::string l; std::getline(sf, l);) if (l == stamp) return true; }
  // check every member as it streams (1 MB at a time); the first time, into a directory of its own that becomes `dir` once whole
  const fs::path tmp = have ? fs::path() : fs::path(dir + ".part" + std::to_string(::getpid()));
  std::vector<char> buf(1 << 20);
  for (const auto& [name, want] : sums) {
    const Member& m = *byName[name];
    std::ofstream out;
    if (!have) { fs::create_directories((tmp / name).parent_path(), ec); out.open(tmp / name, std::ios::binary); }
    SHA256_CTX ctx;
    sha256_init(&ctx);
    in.clear(); in.seekg(static_cast<std::streamoff>(offset + m.at));
    for (std::uint64_t left = m.size; left > 0;) {
      const std::size_t n = static_cast<std::size_t>(std::min<std::uint64_t>(left, buf.size()));
      if (!in.read(buf.data(), static_cast<std::streamsize>(n))) { err = "the archive is truncated"; fs::remove_all(tmp, ec); return false; }
      sha256_update(&ctx, reinterpret_cast<const BYTE*>(buf.data()), n);
      if (!have) out.write(buf.data(), static_cast<std::streamsize>(n));
      left -= n;
    }
    BYTE d[32];
    sha256_final(&ctx, d);
    static const char* hex = "0123456789abcdef";
    std::string got;
    for (BYTE b : d) { got += hex[b >> 4]; got += hex[b & 15]; }
    if (got != want) { err = corrupted(name); fs::remove_all(tmp, ec); return false; }
  }
  if (!have) {
    { std::ofstream mo(tmp / "manifest.json", std::ios::binary); mo << manifest; }
    fs::create_directories(fs::path(dir).parent_path(), ec);
    fs::rename(tmp, dir, ec);
    if (ec) fs::remove_all(tmp, ec);   // another run unpacked it first
  }
  std::ofstream(stamps, std::ios::app) << stamp << "\n";
  return true;
}

}  // namespace zn::zapp
