// The browser worker's asset boundary: the shared ZPK reader validates every entry before JS receives it.
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include "zpk/zpk.h"
#include "zn/zim.h"

namespace {
constexpr std::size_t kBudget = 256u << 20;
enum class State { Idle, Decoding, Ready, Failed };
struct Entry { std::string name, bytes, pixels; int kind = 0, w = 0, h = 0, scale = 1; };
struct Pack {
  State state = State::Idle;
  std::vector<Entry> entries;
  std::string error;
  bool transition(State next) {
    const bool valid = next == State::Idle || (state == State::Idle && next == State::Decoding) ||
      (state == State::Decoding && (next == State::Ready || next == State::Failed));
    if (valid) state = next;
    return valid;
  }
} pack;
const Entry* at(unsigned i) { return pack.state == State::Ready && i < pack.entries.size() ? &pack.entries[i] : nullptr; }
bool image(Entry& e) {
  const auto* p = reinterpret_cast<const std::uint8_t*>(e.bytes.data());
  const std::size_t n = e.bytes.size();
  auto le = [&](int i) { return std::uint32_t(p[i]) | std::uint32_t(p[i + 1]) << 8 | std::uint32_t(p[i + 2]) << 16 | std::uint32_t(p[i + 3]) << 24; };
  std::string rgba;
  if (n >= zn::zim::kHeader && std::memcmp(p, "ZIM1", 4) == 0) {
    const auto* f = zn::zim::format(p[4]);
    const auto w = le(8), h = le(12);
    if (!f || !(f->id <= 4 || f->id == 16) || !w || !h || w > 4096 || h > 4096 ||
        zn::zim::dataBytes(*f, w, h, (p[6] & zn::zim::Mipmaps) != 0) > n - zn::zim::kHeader) return false;
    e.w = w; e.h = h; e.scale = p[5] ? p[5] : 1;
    rgba.resize(std::size_t(w) * h * 4);
    for (std::size_t i = 0; i < std::size_t(w) * h; ++i) {
      const auto c = zn::zim::argb(*f, p + zn::zim::kHeader, i, (p[6] & zn::zim::Premultiplied) != 0);
      rgba[i * 4] = c >> 16; rgba[i * 4 + 1] = c >> 8; rgba[i * 4 + 2] = c; rgba[i * 4 + 3] = c >> 24;
    }
  } else {
    // KTX2 stays compressed until image() asks the worker to load the optional transcoder.
    static constexpr unsigned char magic[] = {0xab, 'K', 'T', 'X', ' ', '2', '0', 0xbb, 13, 10, 26, 10};
    return n >= sizeof magic && std::memcmp(p, magic, sizeof magic) == 0;
  }

  e.pixels.swap(rgba);
  return true;
}
}
#define EXPORT(name) extern "C" __attribute__((export_name(#name)))
EXPORT(zn_pack_close) void zn_pack_close() { pack.entries.clear(); pack.error.clear(); pack.transition(State::Idle); }
EXPORT(zn_pack_decode) int zn_pack_decode(const void* data, unsigned size) {
  zn_pack_close();
  pack.transition(State::Decoding);
  zn::zpk::Reader reader;
  bool ok = size <= kBudget && reader.open(data, size, pack.error);
  if (ok && reader.count() > kBudget / sizeof(Entry)) { pack.error = "asset pack index exceeds the decode budget"; ok = false; }
  std::size_t resident = ok ? reader.count() * sizeof(Entry) : 0;
  for (std::size_t i = 0; ok && i < reader.count(); ++i) {
    const auto entry = reader.entry(i);
    if (entry.size > kBudget - resident) { pack.error = "asset pack exceeds the browser's 256 MB decode budget"; ok = false; break; }
    Entry e; e.name = entry.name; e.kind = entry.kind;
    ok = reader.read(i, e.bytes, pack.error);
    if (ok && e.kind == 1 && !image(e)) { pack.error = "cannot decode image " + e.name; ok = false; }
    if (e.bytes.size() + e.pixels.size() > kBudget - resident) { pack.error = "decoded images exceed the browser's 256 MB decode budget"; ok = false; }
    resident += e.bytes.size() + e.pixels.size();
    if (ok) pack.entries.push_back(std::move(e));
  }
  if (!ok) { if (pack.error.empty()) pack.error = "invalid or oversized asset pack"; pack.entries.clear(); }
  pack.transition(ok ? State::Ready : State::Failed);
  return ok ? static_cast<int>(pack.entries.size()) : -1;
}
EXPORT(zn_asset_error) const char* zn_asset_error() { return pack.error.c_str(); }
EXPORT(zn_pack_name) const char* zn_pack_name(unsigned i) { const auto* e = at(i); return e ? e->name.c_str() : ""; }
EXPORT(zn_pack_data) const char* zn_pack_data(unsigned i) { const auto* e = at(i); return e ? e->bytes.data() : nullptr; }
EXPORT(zn_pack_size) unsigned zn_pack_size(unsigned i) { const auto* e = at(i); return e ? e->bytes.size() : 0; }
EXPORT(zn_pack_kind) int zn_pack_kind(unsigned i) { const auto* e = at(i); return e ? e->kind : -1; }
EXPORT(zn_pack_width) int zn_pack_width(unsigned i) { const auto* e = at(i); return e ? e->w : 0; }
EXPORT(zn_pack_height) int zn_pack_height(unsigned i) { const auto* e = at(i); return e ? e->h : 0; }
EXPORT(zn_pack_scale) int zn_pack_scale(unsigned i) { const auto* e = at(i); return e ? e->scale : 1; }

EXPORT(zn_pack_pixels) const char* zn_pack_pixels(unsigned i) { const auto* e = at(i); return e ? e->pixels.data() : nullptr; }
