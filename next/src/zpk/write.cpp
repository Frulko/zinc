// The ZPK writer (docs/zpk.md): the build side, kept apart from the reader so a program that only reads packs links no compressor.
#include <algorithm>
#include <cstring>

#include "zpk/zpk.h"

extern "C" {
#include "sha256.h"
}
#include "lz4.h"
#include "lz4hc.h"
#include "zdict.h"
#include "zstd.h"

namespace zn::zpk {
namespace {

void put(std::string& out, std::size_t at, std::uint64_t v, int n) {
  for (int i = 0; i < n; ++i) out[at + i] = static_cast<char>(v >> (8 * i));
}

std::uint64_t alignUp(std::uint64_t v, std::uint64_t a) { return (v + a - 1) / a * a; }

/** `dictionary` trained from the entries that ask for one; empty when there are too few to train on. */
std::string train(const std::vector<Input>& inputs) {
  std::string samples;
  std::vector<std::size_t> sizes;
  for (const Input& in : inputs) if (in.codec == Codec::ZstdDict && !in.data.empty()) { samples += in.data; sizes.push_back(in.data.size()); }
  // zstd's advice: a dictionary about a hundredth of the samples, 110 KB at most
  const std::size_t cap = std::clamp<std::size_t>(samples.size() / 100, 1024, 110 * 1024);
  std::string dict(cap, '\0');
  const std::size_t n = sizes.empty() ? 0 : ZDICT_trainFromBuffer(dict.data(), cap, samples.data(), sizes.data(), static_cast<unsigned>(sizes.size()));
  if (sizes.empty() || ZDICT_isError(n)) return {};
  dict.resize(n);
  return dict;
}

}  // namespace

bool write(std::vector<Input> inputs, const WriteOptions& options, std::string& out, std::string& err) {
  const std::uint64_t align = options.alignment;
  if (align == 0 || align > kMaxAlignment || (align & (align - 1)) != 0) { err = "the alignment must be a power of two up to 1 MiB"; return false; }
  // the data in group order, so what loads together is read in one pass
  std::sort(inputs.begin(), inputs.end(), [](const Input& a, const Input& b) { return a.group != b.group ? a.group < b.group : a.name < b.name; });
  {
    std::vector<std::string_view> names;
    for (const Input& in : inputs) {
      if (in.name.empty()) { err = "an entry has no name"; return false; }
      names.push_back(in.name);
    }
    std::sort(names.begin(), names.end());
    if (auto d = std::adjacent_find(names.begin(), names.end()); d != names.end()) { err = "two entries are named " + std::string(*d); return false; }
  }
  const bool wantsDict = std::any_of(inputs.begin(), inputs.end(), [](const Input& in) { return in.codec == Codec::ZstdDict; });
  std::string dict = wantsDict ? (options.dictionary.empty() ? train(inputs) : options.dictionary) : std::string();
  ZSTD_CCtx* cctx = ZSTD_createCCtx();
  ZSTD_CDict* cdict = dict.empty() ? nullptr : ZSTD_createCDict(dict.data(), dict.size(), options.zstdLevel);
  if (!dict.empty() && !cdict) { ZSTD_freeCCtx(cctx); err = "the zstd dictionary is not valid"; return false; }

  struct Stored { std::string bytes; Codec codec; std::uint8_t sha[32]; };
  std::vector<Stored> stored(inputs.size());
  bool dictUsed = false;
  for (std::size_t i = 0; i < inputs.size(); ++i) {
    const std::string& src = inputs[i].data;
    Codec c = src.empty() ? Codec::None : inputs[i].codec;
    if (c == Codec::ZstdDict && !cdict) c = Codec::Zstd;
    if (c == Codec::Lz4 && src.size() > LZ4_MAX_INPUT_SIZE) c = Codec::Zstd;
    std::string z;
    if (c == Codec::Lz4) {
      z.resize(static_cast<std::size_t>(LZ4_compressBound(static_cast<int>(src.size()))));
      const int n = options.lz4Level > 2 ? LZ4_compress_HC(src.data(), z.data(), static_cast<int>(src.size()), static_cast<int>(z.size()), options.lz4Level)
                                         : LZ4_compress_default(src.data(), z.data(), static_cast<int>(src.size()), static_cast<int>(z.size()));
      z.resize(n > 0 ? static_cast<std::size_t>(n) : 0);
    } else if (c == Codec::Zstd || c == Codec::ZstdDict) {
      z.resize(ZSTD_compressBound(src.size()));
      const std::size_t n = c == Codec::Zstd ? ZSTD_compressCCtx(cctx, z.data(), z.size(), src.data(), src.size(), options.zstdLevel)
                                             : ZSTD_compress_usingCDict(cctx, z.data(), z.size(), src.data(), src.size(), cdict);
      z.resize(ZSTD_isError(n) ? 0 : n);
    }
    if (z.empty() || z.size() >= src.size()) { c = Codec::None; z = src; }   // what does not shrink is stored as it is
    dictUsed |= c == Codec::ZstdDict;
    stored[i].codec = c;
    stored[i].bytes = std::move(z);
    SHA256_CTX s;
    sha256_init(&s);
    sha256_update(&s, reinterpret_cast<const BYTE*>(stored[i].bytes.data()), stored[i].bytes.size());
    sha256_final(&s, stored[i].sha);
  }
  ZSTD_freeCDict(cdict);
  ZSTD_freeCCtx(cctx);
  if (!dictUsed) dict.clear();

  std::vector<std::size_t> toc(inputs.size());   // TOC rows by (name hash, name); the data stays in group order
  for (std::size_t i = 0; i < toc.size(); ++i) toc[i] = i;
  std::vector<std::uint64_t> hashes(inputs.size());
  for (std::size_t i = 0; i < inputs.size(); ++i) hashes[i] = nameHash(inputs[i].name);
  std::sort(toc.begin(), toc.end(), [&](std::size_t a, std::size_t b) { return hashes[a] != hashes[b] ? hashes[a] < hashes[b] : inputs[a].name < inputs[b].name; });

  const std::uint64_t strings = kHeaderSize + inputs.size() * kRowSize;
  std::uint64_t stringsSize = 0;
  for (const Input& in : inputs) stringsSize += in.name.size();
  if (strings + stringsSize + dict.size() > UINT32_MAX) { err = "the pack's index is over 4 GiB"; return false; }
  std::vector<std::uint64_t> at(inputs.size());
  std::uint64_t end = alignUp(strings + stringsSize + dict.size(), align);
  for (std::size_t i = 0; i < inputs.size(); ++i) { at[i] = end; end = alignUp(end + stored[i].bytes.size(), align); }
  if (!inputs.empty()) end = at.back() + stored.back().bytes.size();   // no padding after the last entry

  out.assign(end, '\0');
  std::memcpy(out.data(), kMagic, 4);
  put(out, 4, kVersion, 2);
  put(out, 8, inputs.size(), 4);
  put(out, 12, align, 4);
  put(out, 16, kHeaderSize, 4);
  put(out, 20, strings, 4);
  put(out, 24, stringsSize, 4);
  put(out, 28, dict.size(), 4);
  std::uint64_t name = 0;
  for (std::size_t row = 0; row < toc.size(); ++row) {
    const std::size_t i = toc[row];
    const std::size_t r = kHeaderSize + row * kRowSize;
    put(out, r, hashes[i], 8);
    put(out, r + 8, name, 4);
    put(out, r + 12, inputs[i].name.size(), 4);
    put(out, r + 16, at[i], 8);
    put(out, r + 24, stored[i].bytes.size(), 8);
    put(out, r + 32, inputs[i].data.size(), 8);
    put(out, r + 40, inputs[i].group, 2);
    out[r + 42] = static_cast<char>(inputs[i].kind);
    out[r + 43] = static_cast<char>(stored[i].codec);
    std::memcpy(out.data() + r + 48, stored[i].sha, 16);
    std::memcpy(out.data() + strings + name, inputs[i].name.data(), inputs[i].name.size());
    name += inputs[i].name.size();
  }
  if (!dict.empty()) std::memcpy(out.data() + strings + stringsSize, dict.data(), dict.size());
  for (std::size_t i = 0; i < inputs.size(); ++i) if (!stored[i].bytes.empty()) std::memcpy(out.data() + at[i], stored[i].bytes.data(), stored[i].bytes.size());
  return true;
}

}  // namespace zn::zpk
