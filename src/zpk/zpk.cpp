// The ZPK reader (docs/zpk.md): in place over the caller's mapping, index checked at open, entries checked when first read.
#include "zpk/zpk.h"

#include <algorithm>
#include <climits>
#include <cstring>

extern "C" {
#include "sha256.h"
}
#include "lz4.h"
#define ZSTD_STATIC_LINKING_ONLY   // ZSTD_createDDict_byReference: the dictionary stays in the mapping (zstd is linked statically, pinned)
#include "zstd.h"

namespace zn::zpk {
namespace {

std::uint64_t le(const std::uint8_t* p, int n) {   // every Zinc target is little-endian, but the format says so, not the host
  std::uint64_t v = 0;
  for (int i = n - 1; i >= 0; --i) v = v << 8 | p[i];
  return v;
}

std::string corrupted(std::string_view name) { return "the pack is corrupted: " + std::string(name) + " does not match its checksum"; }

}  // namespace

std::uint64_t nameHash(std::string_view name) {
  std::uint64_t h = 0xcbf29ce484222325ull;
  for (unsigned char c : name) h = (h ^ c) * 0x100000001b3ull;
  return h;
}

bool Reader::open(const void* data, std::size_t size, std::string& err) {
  base_ = static_cast<const std::uint8_t*>(data);
  size_ = size;
  count_ = 0;
  dict_.reset();
  const std::uint8_t* h = base_;
  if (size < kHeaderSize || std::memcmp(h, kMagic, 4) != 0) { err = "not a ZPK pack"; return false; }
  if (le(h + 4, 2) != kVersion) { err = "this pack is version " + std::to_string(le(h + 4, 2)) + ", this zinc reads version 1: update zinc (zinc update)"; return false; }
  const std::uint64_t n = le(h + 8, 4), align = le(h + 12, 4), toc = le(h + 16, 4), strings = le(h + 20, 4), stringsSize = le(h + 24, 4), dictSize = le(h + 28, 4);
  if (le(h + 6, 2) != 0 || align == 0 || align > kMaxPackAlignment || (align & (align - 1)) != 0 || toc != kHeaderSize || strings != kHeaderSize + n * kRowSize ||
      strings + stringsSize + dictSize > size) { err = "the pack's header is corrupted"; return false; }
  const std::uint64_t indexEnd = strings + stringsSize + dictSize;
  std::uint64_t prevHash = 0;
  std::string_view prevName;
  for (std::uint64_t i = 0; i < n; ++i) {
    const std::uint8_t* r = h + toc + i * kRowSize;
    const std::uint64_t hash = le(r, 8), nameAt = le(r + 8, 4), nameLen = le(r + 12, 4), at = le(r + 16, 8), stored = le(r + 24, 8), full = le(r + 32, 8);
    const unsigned codec = r[43];
    if (nameLen == 0 || nameAt + nameLen > stringsSize) { err = "the pack's index is corrupted (a name is outside it)"; return false; }
    const std::string_view name(reinterpret_cast<const char*>(h + strings + nameAt), nameLen);
    const bool ordered = i == 0 || hash > prevHash || (hash == prevHash && name > prevName);
    if (hash != nameHash(name) || !ordered || le(r + 44, 4) != 0 || codec > 3 || (codec == 3 && dictSize == 0) || (codec == 0 && stored != full) ||
        at < indexEnd || at % align != 0 || at > size || stored > size - at) { err = "the pack's index is corrupted (entry " + std::string(name) + ")"; return false; }
    prevHash = hash;
    prevName = name;
  }
  if (dictSize) {
    dict_ = decltype(dict_)(ZSTD_createDDict_byReference(h + strings + stringsSize, dictSize), [](ZSTD_DDict_s* d) { ZSTD_freeDDict(d); });
    if (!dict_) { err = "the pack's dictionary is not valid"; return false; }
  }
  count_ = n;
  indexEnd_ = indexEnd;
  checked_ = std::make_unique<std::atomic<bool>[]>(n);
  return true;
}

Entry Reader::entry(std::size_t i) const {
  const std::uint8_t* r = base_ + kHeaderSize + i * kRowSize;
  Entry e;
  e.name = std::string_view(reinterpret_cast<const char*>(base_ + kHeaderSize + count_ * kRowSize + le(r + 8, 4)), le(r + 12, 4));
  e.offset = le(r + 16, 8);
  e.storedSize = le(r + 24, 8);
  e.size = le(r + 32, 8);
  e.group = static_cast<std::uint16_t>(le(r + 40, 2));
  e.kind = r[42];
  e.codec = static_cast<Codec>(r[43]);
  return e;
}

long Reader::find(std::string_view name) const {
  const std::uint64_t hash = nameHash(name);
  std::size_t lo = 0, hi = count_;
  while (lo < hi) {   // the first row not below (hash, name)
    const std::size_t mid = lo + (hi - lo) / 2;
    const std::uint64_t h = le(base_ + kHeaderSize + mid * kRowSize, 8);
    if (h < hash || (h == hash && entry(mid).name < name)) lo = mid + 1; else hi = mid;
  }
  return lo < count_ && entry(lo).name == name ? static_cast<long>(lo) : -1;
}

std::array<std::uint8_t, 32> Reader::indexHash() const {
  std::array<std::uint8_t, 32> d{};
  SHA256_CTX c;
  sha256_init(&c);
  sha256_update(&c, base_, indexEnd_);
  sha256_final(&c, d.data());
  return d;
}

bool Reader::verify(std::size_t i, const Entry& e, std::string& err) const {
  if (checked_[i].load(std::memory_order_relaxed)) return true;
  BYTE d[32];
  SHA256_CTX c;
  sha256_init(&c);
  sha256_update(&c, base_ + e.offset, e.storedSize);
  sha256_final(&c, d);
  if (std::memcmp(d, base_ + kHeaderSize + i * kRowSize + 48, 16) != 0) { err = corrupted(e.name); return false; }
  checked_[i].store(true, std::memory_order_relaxed);
  return true;
}

bool Reader::read(std::size_t i, std::uint8_t* dst, std::string& err, ZSTD_DCtx* zstd) const {
  const Entry e = entry(i);
  return verify(i, e, err) && inflate(e, base_ + e.offset, dst, err, zstd);
}
bool Reader::decode(std::size_t i, const std::uint8_t* stored, std::uint8_t* dst, std::string& err, ZSTD_DCtx* zstd) const {
  const Entry e = entry(i);
  BYTE d[32];
  SHA256_CTX c;
  sha256_init(&c);
  sha256_update(&c, stored, e.storedSize);
  sha256_final(&c, d);
  if (std::memcmp(d, base_ + kHeaderSize + i * kRowSize + 48, 16) != 0) { err = corrupted(e.name); return false; }
  return inflate(e, stored, dst, err, zstd);
}
bool Reader::inflate(const Entry& e, const std::uint8_t* src, std::uint8_t* dst, std::string& err, ZSTD_DCtx* zstd) const {
  std::size_t got = 0;
  switch (e.codec) {
    case Codec::None: if (e.size) std::memcpy(dst, src, e.size); return true;
    case Codec::Lz4:
      if (e.storedSize > INT_MAX || e.size > INT_MAX) break;
      got = static_cast<std::size_t>(std::max(0, LZ4_decompress_safe(reinterpret_cast<const char*>(src), reinterpret_cast<char*>(dst), static_cast<int>(e.storedSize), static_cast<int>(e.size))));
      break;
    case Codec::Zstd:
    case Codec::ZstdDict: {
      ZSTD_DCtx* own = zstd ? nullptr : ZSTD_createDCtx();
      ZSTD_DCtx* z = zstd ? zstd : own;
      const std::size_t r = e.codec == Codec::Zstd ? ZSTD_decompressDCtx(z, dst, e.size, src, e.storedSize) : ZSTD_decompress_usingDDict(z, dst, e.size, src, e.storedSize, dict_.get());
      ZSTD_freeDCtx(own);
      if (!ZSTD_isError(r)) got = r;
      break;
    }
  }
  if (got != e.size) { err = "the pack is corrupted: " + std::string(e.name) + " does not decode to its size"; return false; }
  return true;
}
bool Reader::read(std::size_t i, std::string& out, std::string& err, ZSTD_DCtx* zstd) const {
  out.resize(entry(i).size);
  return read(i, reinterpret_cast<std::uint8_t*>(out.data()), err, zstd);
}

const std::uint8_t* Reader::view(std::size_t i, std::string& err) const {
  const Entry e = entry(i);
  if (e.codec != Codec::None) { err = std::string(e.name) + " is compressed: read it"; return nullptr; }
  return verify(i, e, err) ? base_ + e.offset : nullptr;
}

}  // namespace zn::zpk
