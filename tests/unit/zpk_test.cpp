// ZPK packs (ZN-433): a 10 000-entry round trip through every codec, alignment, determinism, and the refusals of the reader.
//   zpk_test                  the checks; prints "all checks passed" or one line per failure
//   zpk_test pack <dir> <out> packs the files under <dir> (names relative to it): the across-directories test of tests/t0/zpk.sh
//   zpk_test seeds <dir>      small packs of every codec: the corpus of tools/fuzz zpk
#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "zpk/zpk.h"

using namespace zn::zpk;
namespace fs = std::filesystem;

namespace {

int failures = 0;
#define CHECK(c, ...) do { if (!(c)) { ++failures; std::printf("FAIL line %d: ", __LINE__); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

std::uint64_t rng = 0x9e3779b97f4a7c15ull;
std::uint64_t next() { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return rng; }

/** Entry i: text, records (what a dictionary helps), noise (what does not shrink), zeros, empty, and now and then a large one. */
Input make(int i) {
  Input in;
  in.name = "level" + std::to_string(i % 13) + "/item-" + std::to_string(i) + ".bin";
  in.group = static_cast<std::uint16_t>(i % 7);
  in.kind = static_cast<std::uint8_t>(i % 5);
  in.codec = static_cast<Codec>(i % 4);
  const std::size_t n = i % 1000 == 999 ? 200000 : i % 50 == 0 ? 0 : next() % 3000;
  switch (i % 5) {
    case 0: while (in.data.size() < n) in.data += "the quick brown fox " + std::to_string(next() % 10) + " "; break;
    case 1: while (in.data.size() < n) in.data += "{\"id\":" + std::to_string(next() % 100000) + ",\"hp\":100,\"name\":\"goblin\",\"tags\":[\"enemy\",\"cave\"]}\n"; break;
    case 2: while (in.data.size() < n) in.data += static_cast<char>(next()); break;
    case 3: in.data.assign(n, '\0'); break;
    default: while (in.data.size() < n) in.data += static_cast<char>('a' + next() % 4); break;
  }
  in.data.resize(n);
  return in;
}

std::string pack(const std::vector<Input>& inputs, WriteOptions o = {}) {
  std::string out, err;
  if (!write(inputs, o, out, err)) { ++failures; std::printf("FAIL write: %s\n", err.c_str()); }
  return out;
}

void roundTrip() {
  std::vector<Input> inputs;
  for (int i = 0; i < 10000; ++i) inputs.push_back(make(i));
  const std::string bytes = pack(inputs);
  Reader r;
  std::string err;
  if (!r.open(bytes.data(), bytes.size(), err)) { CHECK(false, "open: %s", err.c_str()); return; }
  CHECK(r.count() == inputs.size(), "count %zu", r.count());
  std::map<Codec, int> codecs;
  std::uint64_t raw = 0;
  for (const Input& in : inputs) {
    const long i = r.find(in.name);
    if (i < 0) { CHECK(false, "%s not found", in.name.c_str()); continue; }
    const Entry e = r.entry(static_cast<std::size_t>(i));
    std::string got;
    CHECK(e.name == in.name && e.group == in.group && e.kind == in.kind && e.size == in.data.size(), "%s: row differs", in.name.c_str());
    CHECK(e.offset % 16 == 0, "%s: offset %llu not aligned", in.name.c_str(), static_cast<unsigned long long>(e.offset));
    CHECK(r.read(static_cast<std::size_t>(i), got, err) && got == in.data, "%s: read %s", in.name.c_str(), err.c_str());
    CHECK(r.read(static_cast<std::size_t>(i), got, err) && got == in.data, "%s: second read", in.name.c_str());   // verified once, decoded again
    if (e.codec == Codec::None) { const std::uint8_t* v = r.view(static_cast<std::size_t>(i), err); CHECK(v && std::string(reinterpret_cast<const char*>(v), e.size) == in.data, "%s: view", in.name.c_str()); }
    if (in.codec != Codec::None && in.data.size() > 1000 && in.data.find_first_not_of('\0') == std::string::npos) CHECK(e.codec == in.codec && e.storedSize * 10 < e.size, "%s: zeros not compressed (codec %d, %llu of %llu)", in.name.c_str(), int(e.codec), (unsigned long long)e.storedSize, (unsigned long long)e.size);
    if (in.codec == Codec::None) CHECK(e.codec == Codec::None, "%s: compressed though asked not to", in.name.c_str());
    ++codecs[e.codec];
    raw += in.data.size();
  }
  CHECK(codecs[Codec::Lz4] > 1000 && codecs[Codec::Zstd] > 1000 && codecs[Codec::ZstdDict] > 1000, "codecs used: none %d lz4 %d zstd %d dict %d", codecs[Codec::None], codecs[Codec::Lz4], codecs[Codec::Zstd], codecs[Codec::ZstdDict]);
  CHECK(r.find("level1/item-0.bin") == -1 && r.find("") == -1 && r.find("zzz") == -1, "found a name not in the pack");
  // the data in (group, name) order
  std::vector<Entry> byOffset;
  for (std::size_t i = 0; i < r.count(); ++i) byOffset.push_back(r.entry(i));
  std::sort(byOffset.begin(), byOffset.end(), [](const Entry& a, const Entry& b) { return a.offset != b.offset ? a.offset < b.offset : a.storedSize < b.storedSize; });   // an empty entry shares its offset with the next
  for (std::size_t i = 1; i < byOffset.size(); ++i) {
    const Entry &a = byOffset[i - 1], &b = byOffset[i];
    CHECK(a.group < b.group || (a.group == b.group && a.name < b.name), "data order: %s before %s", std::string(a.name).c_str(), std::string(b.name).c_str());
  }
  // the order of the inputs does not matter
  std::vector<Input> reversed(inputs.rbegin(), inputs.rend());
  CHECK(pack(reversed) == bytes, "the inputs' order changes the pack");
  std::printf("10000 entries: %llu bytes raw, %zu packed (none %d, lz4 %d, zstd %d, zstd-dict %d)\n", static_cast<unsigned long long>(raw), bytes.size(), codecs[Codec::None], codecs[Codec::Lz4], codecs[Codec::Zstd], codecs[Codec::ZstdDict]);
}

void alignment() {
  std::vector<Input> inputs;
  for (int i = 0; i < 9; ++i) inputs.push_back(make(i));
  WriteOptions o;
  o.alignment = 4096;
  const std::string bytes = pack(inputs, o);
  Reader r;
  std::string err, got;
  CHECK(r.open(bytes.data(), bytes.size(), err), "open 4096: %s", err.c_str());
  for (std::size_t i = 0; i < r.count(); ++i) CHECK(r.entry(i).offset % 4096 == 0 && r.read(i, got, err), "entry %zu at 4096", i);
  for (std::uint32_t bad : {0u, 3u, 1u << 21}) {
    o.alignment = bad;
    CHECK(!write(inputs, o, got, err) && err.find("power of two") != std::string::npos, "alignment %u accepted", bad);
  }
}

void refusals() {
  std::string out, err;
  CHECK(!write({{"a", "1"}, {"a", "2"}}, {}, out, err) && err == "two entries are named a", "duplicate: %s", err.c_str());
  CHECK(!write({{"", "1"}}, {}, out, err), "an empty name was accepted");
  Reader r;
  const std::string empty = pack({});
  CHECK(r.open(empty.data(), empty.size(), err) && r.count() == 0 && r.find("a") == -1, "empty pack: %s", err.c_str());

  std::vector<Input> inputs;
  for (int i = 0; i < 40; ++i) inputs.push_back(make(i));
  const std::string good = pack(inputs);
  CHECK(r.open(good.data(), good.size(), err), "open: %s", err.c_str());
  const auto hash = r.indexHash();
  // one byte of an entry's data: that entry is refused when read, the others still read
  const long victim = r.find(inputs[6].name), other = r.find(inputs[7].name);
  std::string bad = good;
  bad[r.entry(static_cast<std::size_t>(victim)).offset + 3] ^= 1;
  CHECK(r.open(bad.data(), bad.size(), err), "a data byte broke the index");
  CHECK(!r.read(static_cast<std::size_t>(victim), out, err) && err == "the pack is corrupted: " + inputs[6].name + " does not match its checksum", "corrupted entry: %s", err.c_str());
  CHECK(r.read(static_cast<std::size_t>(other), out, err) && out == inputs[7].data, "a sound entry beside a broken one: %s", err.c_str());
  CHECK(r.indexHash() == hash, "the index hash covers the data");
  // the index: any byte of it changes the hash the manifest records
  bad = good;
  bad[kHeaderSize + 42] ^= 1;   // a kind
  CHECK(r.open(bad.data(), bad.size(), err) && r.indexHash() != hash, "a TOC byte left the index hash alone");
  struct Case { const char* what; std::size_t at; char x; const char* want; };
  for (const Case& c : {Case{"magic", 0, 1, "not a ZPK pack"}, Case{"version", 4, 1, "this pack is version 0"}, Case{"flags", 6, 1, "header is corrupted"},
                        Case{"count", 8, 1, "header is corrupted"}, Case{"alignment", 12, 3, "header is corrupted"}, Case{"name hash", kHeaderSize, 1, "index is corrupted"},
                        Case{"name length", kHeaderSize + 12, 0x40, "index is corrupted"}, Case{"reserved", kHeaderSize + 44, 1, "index is corrupted"},
                        Case{"codec", kHeaderSize + 43, 8, "index is corrupted"}}) {
    bad = good;
    bad[c.at] ^= c.x;
    CHECK(!r.open(bad.data(), bad.size(), err) && err.find(c.want) != std::string::npos, "%s: '%s'", c.what, err.c_str());
  }
  for (std::size_t cut : {std::size_t(0), std::size_t(31), kHeaderSize + 40 * kRowSize - 1, good.size() - 1})
    CHECK(!r.open(good.data(), cut, err), "a pack cut at %zu opened", cut);
  // a row that claims more bytes than its codec yields
  CHECK(r.open(good.data(), good.size(), err), "reopen: %s", err.c_str());
  std::size_t lz4 = 0;
  while (lz4 < r.count() && r.entry(lz4).codec != Codec::Lz4) ++lz4;
  CHECK(lz4 < r.count(), "no lz4 entry");
  bad = good;
  bad[kHeaderSize + lz4 * kRowSize + 32] ^= 1;   // its size, which the entry's checksum does not cover
  CHECK(r.open(bad.data(), bad.size(), err) && !r.read(lz4, out, err) && err.find("does not decode") != std::string::npos, "lz4 size lie: %s", err.c_str());
}

int packDir(const std::string& dir, const std::string& outPath) {
  std::vector<Input> inputs;
  for (const auto& f : fs::recursive_directory_iterator(dir)) {
    if (!f.is_regular_file()) continue;
    std::ifstream in(f.path(), std::ios::binary);
    std::stringstream ss;
    ss << in.rdbuf();
    const std::string ext = f.path().extension().string();
    const Codec c = ext == ".png" || ext == ".jpg" ? Codec::Lz4 : ss.str().size() < 4096 ? Codec::ZstdDict : Codec::Zstd;
    inputs.push_back({fs::relative(f.path(), dir).generic_string(), ss.str(), 0, 0, c});
  }
  std::string out, err;
  if (!write(std::move(inputs), {}, out, err)) { std::fprintf(stderr, "zpk_test: %s\n", err.c_str()); return 1; }
  std::ofstream(outPath, std::ios::binary) << out;
  return 0;
}

int seeds(const std::string& dir) {
  fs::create_directories(dir);
  for (int k = 0; k < 4; ++k) {
    std::vector<Input> inputs;
    for (int i = 0; i < 24; ++i) { Input in = make(i * 4 + k); in.data.resize(std::min<std::size_t>(in.data.size(), 600)); inputs.push_back(in); }
    WriteOptions o;
    o.alignment = k == 3 ? 64 : 16;
    std::ofstream(dir + "/seed" + std::to_string(k) + ".zpk", std::ios::binary) << pack(inputs, o);
  }
  return failures ? 1 : 0;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc == 4 && std::string(argv[1]) == "pack") return packDir(argv[2], argv[3]);
  if (argc == 3 && std::string(argv[1]) == "seeds") return seeds(argv[2]);
  roundTrip();
  alignment();
  refusals();
  if (failures) { std::printf("%d failure(s)\n", failures); return 1; }
  std::printf("all checks passed\n");
  return 0;
}
