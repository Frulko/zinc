#include "zapp.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <vector>

#include "tc/tc.h"
#include "yyjson.h"

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

std::string pack(const std::map<std::string, std::string>& files, const std::string& name, const std::string& engine) {
  std::string manifest = "{\n  \"format\": " + std::to_string(kFormat) + ",\n  \"engine\": " + jsonString(engine) + ",\n  \"name\": " + jsonString(name) + ",\n  \"files\": {";
  bool first = true;
  for (const auto& [n, bytes] : files) { manifest += std::string(first ? "\n" : ",\n") + "    " + jsonString(n) + ": " + jsonString(zn::tc::sha256Hex(bytes)); first = false; }
  manifest += "\n  },\n  \"signature\": \"\"\n}\n";
  std::vector<TarEntry> entries{{"manifest.json", manifest}};
  for (const auto& [n, bytes] : files) entries.push_back({n, bytes});   // std::map: sorted names
  return ustar(entries);
}

bool untar(const std::string& archive, std::map<std::string, std::string>& files, std::string& err) {
  files.clear();
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
    if (h[156] == '0' || h[156] == 0) files[name] = archive.substr(at + 512, size);   // files; directories are implied by the names
    at += 512 + (size + 511) / 512 * 512;
  }
  return true;
}

bool unpack(const std::string& archive, const std::string& engine, std::map<std::string, std::string>& files, std::string& err) {
  if (!untar(archive, files, err)) return false;
  auto m = files.find("manifest.json");
  if (m == files.end()) { err = "not a .zapp archive (no manifest.json)"; return false; }
  yyjson_doc* doc = yyjson_read(m->second.data(), m->second.size(), 0);
  yyjson_val* r = doc ? yyjson_doc_get_root(doc) : nullptr;
  if (!yyjson_is_obj(r)) { yyjson_doc_free(doc); err = "the archive's manifest.json is not valid"; return false; }
  const long long fmt = yyjson_get_sint(yyjson_obj_get(r, "format"));
  const char* eng = yyjson_get_str(yyjson_obj_get(r, "engine"));
  bool ok = true;
  if (fmt > kFormat) { err = "this archive is format " + std::to_string(fmt) + ", this zinc reads format " + std::to_string(kFormat) + ": update zinc (zinc update)"; ok = false; }
  else if (eng && versionKey(eng) > versionKey(engine)) { err = std::string("this archive was made for zinc ") + eng + ", this is zinc " + engine + ": update zinc (zinc update)"; ok = false; }
  std::size_t listed = 0;
  yyjson_val* fs = yyjson_obj_get(r, "files");
  std::size_t i, n; yyjson_val *k, *v;
  if (ok && yyjson_is_obj(fs)) yyjson_obj_foreach(fs, i, n, k, v) {
    ++listed;
    auto f = files.find(yyjson_get_str(k));
    if (f == files.end()) { err = std::string("the archive is incomplete: ") + yyjson_get_str(k) + " is missing"; ok = false; break; }
    if (!yyjson_is_str(v) || zn::tc::sha256Hex(f->second) != yyjson_get_str(v)) { err = std::string("the archive is corrupted: ") + yyjson_get_str(k) + " does not match its checksum"; ok = false; break; }
  }
  if (ok && listed + 1 != files.size()) { err = "the archive holds files its manifest does not list"; ok = false; }
  yyjson_doc_free(doc);
  return ok;
}

}  // namespace zn::zapp
