// ZPK packs (ZN-433, docs/zpk.md): the indexed container of a game's data. A 32-byte header, a TOC of 64-byte entries sorted by name hash,
// the names, an optional zstd dictionary, then the entries in group order, each aligned and compressed on its own (none, lz4, zstd, zstd with
// the pack's dictionary). The reader works in place over a mapping: opening checks the index only, an entry's bytes are checked against the
// SHA-256 in its TOC row when it is first read. The writer is deterministic: the same inputs give the same bytes, whatever their order.
#pragma once
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>

#include "zn/limits.h"
#include <string>
#include <string_view>
#include <vector>

struct ZSTD_DDict_s;
struct ZSTD_DCtx_s;

namespace zn::zpk {

constexpr char kMagic[4] = {'Z', 'P', 'K', '1'};
constexpr std::uint16_t kVersion = 1;
constexpr std::size_t kHeaderSize = 32, kRowSize = 64;   // the layout is in docs/zpk.md
using zn::kMaxPackAlignment;   // include/zn/limits.h

enum class Codec : std::uint8_t { None = 0, Lz4 = 1, Zstd = 2, ZstdDict = 3 };

/** One row of the TOC: `offset` from the start of the pack, `storedSize` bytes there, `size` once decoded. */
struct Entry {
  std::string_view name;
  std::uint64_t offset = 0, storedSize = 0, size = 0;
  std::uint16_t group = 0;
  std::uint8_t kind = 0;   // the asset kind, opaque to the format
  Codec codec = Codec::None;
};

/** FNV-1a 64 of the name: the TOC's sort key. */
std::uint64_t nameHash(std::string_view name);

class Reader {
 public:
  /** The pack at [data, data + size), which must outlive the reader. Checks the header and every TOC row (bounds, order, names), not the data. */
  bool open(const void* data, std::size_t size, std::string& err);
  std::size_t count() const { return count_; }
  Entry entry(std::size_t i) const;
  /** The index of `name`, or -1. A binary search on the mapped TOC. */
  long find(std::string_view name) const;
  /** SHA-256 of the index (header, TOC, names, dictionary): what a signed manifest records for the pack. */
  std::array<std::uint8_t, 32> indexHash() const;
  /** Entry `i` decoded into `dst` (entry(i).size bytes), its stored bytes checked first. `zstd`: a decoder context the caller owns and keeps for
   *  its thread (an asset worker), reused across reads (small dictionary entries read 30% faster); null: one is made for the read. */
  bool read(std::size_t i, std::uint8_t* dst, std::string& err, ZSTD_DCtx_s* zstd = nullptr) const;
  bool read(std::size_t i, std::string& out, std::string& err, ZSTD_DCtx_s* zstd = nullptr) const;
  /** Entry `i` decoded into `dst` from its stored bytes `stored` (entry(i).storedSize of them), which the caller read itself: a pack on a
   *  slow medium is opened over its index alone (header, TOC, names and dictionary: the header's names offset + names size + dictionary
   *  size bytes, with `size` the whole file's; only find, entry and decode are used then) and each entry read from the file where its row says (targets/n3ds/sdpack_n3ds.cpp). The stored bytes are checked
   *  every time. */
  bool decode(std::size_t i, const std::uint8_t* stored, std::uint8_t* dst, std::string& err, ZSTD_DCtx_s* zstd = nullptr) const;
  /** The bytes of an uncompressed entry in place (no copy), checked; null with `err` otherwise. */
  const std::uint8_t* view(std::size_t i, std::string& err) const;

 private:
  bool verify(std::size_t i, const Entry& e, std::string& err) const;
  bool inflate(const Entry& e, const std::uint8_t* src, std::uint8_t* dst, std::string& err, ZSTD_DCtx_s* zstd) const;
  const std::uint8_t* base_ = nullptr;
  std::size_t size_ = 0, count_ = 0, indexEnd_ = 0;
  std::unique_ptr<ZSTD_DDict_s, void (*)(ZSTD_DDict_s*)> dict_{nullptr, nullptr};
  std::unique_ptr<std::atomic<bool>[]> checked_;   // entries already verified: hashed once
};

struct Input {
  std::string name, data;
  std::uint16_t group = 0;
  std::uint8_t kind = 0;
  Codec codec = Codec::None;   // asked; an entry that does not shrink is stored as None
};

struct WriteOptions {
  std::uint32_t alignment = 16;   // of every entry's data: a power of two (4096 or 2048 where the target reads sectors)
  int zstdLevel = 19, lz4Level = 12;   // lz4 levels above 2 are lz4hc
  std::string dictionary;   // for ZstdDict entries; empty: trained from them (ZDICT), or ZstdDict falls back to Zstd when training fails
};

/** The pack of `inputs`; false with `err` on an empty or repeated name or a bad alignment. */
bool write(std::vector<Input> inputs, const WriteOptions& options, std::string& out, std::string& err);

}  // namespace zn::zpk
