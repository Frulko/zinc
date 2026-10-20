// Fuzz target (ZN-433): the ZPK reader on arbitrary bytes. A pack that opens must find every one of its names at its own row, and reading
// any entry must succeed or refuse with a message, never crash; an entry that reads must have its stated size.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
extern "C" {
#include "sha256.h"
}
#include "zpk/zpk.h"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
  std::vector<std::uint8_t> pack(data, data + size);
  zn::zpk::Reader r;
  std::string err, out;
  if (!r.open(pack.data(), pack.size(), err)) return 0;
  // an entry's checksum is integrity, not authenticity (anyone can compute it; the signed manifest covers the index): set every row's to
  // its mutated bytes, so the decoders see what the fuzzer makes of them instead of a checksum refusal
  for (std::size_t i = 0; i < r.count(); ++i) {
    const zn::zpk::Entry e = r.entry(i);
    SHA256_CTX c;
    BYTE d[32];
    sha256_init(&c);
    sha256_update(&c, pack.data() + e.offset, e.storedSize);
    sha256_final(&c, d);
    std::memcpy(pack.data() + zn::zpk::kHeaderSize + i * zn::zpk::kRowSize + 48, d, 16);
  }
  if (!r.open(pack.data(), pack.size(), err)) { std::fprintf(stderr, "the checksums changed whether the index opens\n"); std::abort(); }
  (void)r.indexHash();
  for (std::size_t i = 0; i < r.count(); ++i) {
    const zn::zpk::Entry e = r.entry(i);
    if (r.find(e.name) != static_cast<long>(i)) { std::fprintf(stderr, "an opened pack does not find its own name\n"); std::abort(); }
    if (e.size > (16u << 20)) continue;   // the asset manager checks a row's size against its budget before it decodes
    if (r.read(i, out, err) && out.size() != e.size) { std::fprintf(stderr, "an entry read to another size\n"); std::abort(); }
    (void)r.view(i, err);
  }
  return 0;
}
