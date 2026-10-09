#include "tc/tlog.h"

#include <fstream>
#include <sstream>

extern "C" {
#include "sha256.h"  // third_party/sha256 (public domain)
}
#include "tc/tc.h"
#include "yyjson.h"

namespace zn::tc::tlog {
namespace {

Hash sha(std::uint8_t prefix, const std::uint8_t* a, std::size_t na, const std::uint8_t* b = nullptr, std::size_t nb = 0) {
  SHA256_CTX c;
  sha256_init(&c);
  sha256_update(&c, &prefix, 1);
  sha256_update(&c, a, na);
  if (b) sha256_update(&c, b, nb);
  Hash h;
  sha256_final(&c, h.data());
  return h;
}
Hash node(const Hash& l, const Hash& r) { return sha(1, l.data(), 32, r.data(), 32); }

bool fromHex(const std::string& s, Hash& h) {
  if (s.size() != 64) return false;
  for (int i = 0; i < 32; ++i) {
    auto v = [](char c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1; };
    const int hi = v(s[2 * i]), lo = v(s[2 * i + 1]);
    if (hi < 0 || lo < 0) return false;
    h[i] = static_cast<std::uint8_t>(hi * 16 + lo);
  }
  return true;
}
std::string toHex(const Hash& h) { static const char* d = "0123456789abcdef"; std::string r; for (auto b : h) { r += d[b >> 4]; r += d[b & 15]; } return r; }

bool hashes(yyjson_val* arr, std::vector<Hash>& out) {
  size_t i, n; yyjson_val* e;
  yyjson_arr_foreach(arr, i, n, e) { Hash h; if (!yyjson_is_str(e) || !fromHex(yyjson_get_str(e), h)) return false; out.push_back(h); }
  return true;
}

}  // namespace

Hash leafHash(const std::string& entry) { return sha(0, reinterpret_cast<const std::uint8_t*>(entry.data()), entry.size()); }

std::string entryOf(const std::string& path, const std::string& sha256) {
  std::string c;
  tuf::canonical("{\"path\":\"" + path + "\",\"sha256\":\"" + sha256 + "\"}", c);
  return c;
}

bool verifyInclusion(std::uint64_t fn, std::uint64_t size, const Hash& leaf, const std::vector<Hash>& proof, const Hash& root) {
  if (fn >= size) return false;
  std::uint64_t sn = size - 1;
  Hash r = leaf;
  for (const Hash& p : proof) {
    if (sn == 0) return false;
    if ((fn & 1) || fn == sn) {
      r = node(p, r);
      if (!(fn & 1)) while (!(fn & 1) && fn != 0) { fn >>= 1; sn >>= 1; }
    } else {
      r = node(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn == 0 && r == root;
}

bool verifyConsistency(std::uint64_t first, std::uint64_t second, const Hash& firstRoot, const Hash& secondRoot, const std::vector<Hash>& proofIn) {
  if (first == 0 || first > second) return false;
  if (first == second) return proofIn.empty() && firstRoot == secondRoot;
  std::vector<Hash> proof = proofIn;
  if ((first & (first - 1)) == 0) proof.insert(proof.begin(), firstRoot);   // a power of two: the first tree is a node of the second
  if (proof.empty()) return false;
  std::uint64_t fn = first - 1, sn = second - 1;
  while (fn & 1) { fn >>= 1; sn >>= 1; }
  Hash fr = proof[0], sr = proof[0];
  for (std::size_t i = 1; i < proof.size(); ++i) {
    const Hash& c = proof[i];
    if (sn == 0) return false;
    if ((fn & 1) || fn == sn) {
      fr = node(c, fr);
      sr = node(c, sr);
      if (!(fn & 1)) while (!(fn & 1) && fn != 0) { fn >>= 1; sn >>= 1; }
    } else {
      sr = node(sr, c);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn == 0 && fr == firstRoot && sr == secondRoot;
}

bool checkArtifact(const tuf::Fetch& fetch, const std::string& logKey, const std::string& stateFile, const std::string& path, const std::string& sha256, std::string& err) {
  // the checkpoint, signed by the log key over the canonical form of "signed"
  std::string text;
  if (!fetch("log/checkpoint.json", "", text)) { err = "the transparency log has no checkpoint"; return false; }
  yyjson_doc* d = yyjson_read(text.data(), text.size(), 0);
  yyjson_val* sv = yyjson_obj_get(yyjson_doc_get_root(d), "signed");
  char* sj = sv ? yyjson_val_write(sv, 0, nullptr) : nullptr;
  std::string body;
  const bool canon = sj && tuf::canonical(sj, body);
  std::free(sj);
  bool good = false;
  size_t i, n; yyjson_val* s;
  yyjson_arr_foreach(yyjson_obj_get(yyjson_doc_get_root(d), "signatures"), i, n, s) {
    yyjson_val* sig = yyjson_obj_get(s, "sig");
    good = good || (canon && yyjson_is_str(sig) && verifyBytes(body, yyjson_get_str(sig), logKey));
  }
  yyjson_val* sizeV = yyjson_obj_get(sv, "size");
  yyjson_val* rootV = yyjson_obj_get(sv, "root");
  const std::uint64_t size = yyjson_is_int(sizeV) ? yyjson_get_uint(sizeV) : 0;
  Hash root{};
  const bool rootOk = yyjson_is_str(rootV) && fromHex(yyjson_get_str(rootV), root);
  yyjson_doc_free(d);
  if (!good || !rootOk || size == 0) { err = "the checkpoint of the transparency log is not signed by its key"; return false; }
  // consistency with the checkpoint this machine accepted last
  std::ifstream sf(stateFile);
  std::stringstream ss; ss << sf.rdbuf();
  if (yyjson_doc* od = sf ? yyjson_read(ss.str().data(), ss.str().size(), 0) : nullptr) {
    const std::uint64_t oldSize = yyjson_get_uint(yyjson_obj_get(yyjson_doc_get_root(od), "size"));
    Hash oldRoot{};
    const bool ok = fromHex(yyjson_get_str(yyjson_obj_get(yyjson_doc_get_root(od), "root")) ? yyjson_get_str(yyjson_obj_get(yyjson_doc_get_root(od), "root")) : "", oldRoot);
    yyjson_doc_free(od);
    if (ok && oldSize > size) { err = "the transparency log shrank from " + std::to_string(oldSize) + " to " + std::to_string(size) + " entries"; return false; }
    if (ok && oldSize < size) {
      std::string ct;
      std::vector<Hash> proof;
      yyjson_doc* cd = fetch("log/consistency/" + std::to_string(oldSize) + ".json", "", ct) ? yyjson_read(ct.data(), ct.size(), 0) : nullptr;
      const bool have = cd && yyjson_get_uint(yyjson_obj_get(yyjson_doc_get_root(cd), "to")) == size && hashes(yyjson_obj_get(yyjson_doc_get_root(cd), "proof"), proof);
      yyjson_doc_free(cd);
      if (!have || !verifyConsistency(oldSize, size, oldRoot, root, proof)) { err = "the transparency log rewrote its history: its checkpoint of " + std::to_string(size) + " entries does not extend the one of " + std::to_string(oldSize) + " this machine saw"; return false; }
    }
    if (ok && oldSize == size && oldRoot != root) { err = "the transparency log changed its history at " + std::to_string(size) + " entries"; return false; }
  }
  // inclusion of the artifact
  std::string pt;
  std::vector<Hash> proof;
  const Hash leaf = leafHash(entryOf(path, sha256));
  yyjson_doc* pd = fetch("log/proof/" + toHex(leaf) + ".json", "", pt) ? yyjson_read(pt.data(), pt.size(), 0) : nullptr;   // named by the leaf hash
  yyjson_val* pr = yyjson_doc_get_root(pd);
  const bool have = pd && yyjson_get_uint(yyjson_obj_get(pr, "size")) == size && hashes(yyjson_obj_get(pr, "proof"), proof);
  const std::uint64_t index = pd ? yyjson_get_uint(yyjson_obj_get(pr, "index")) : 0;
  yyjson_doc_free(pd);
  if (!have || !verifyInclusion(index, size, leaf, proof, root)) { err = path + " is not in the transparency log (no inclusion proof against its checkpoint)"; return false; }
  std::ofstream(stateFile) << "{\"size\": " << size << ", \"root\": \"" << toHex(root) << "\"}\n";
  return true;
}

}  // namespace zn::tc::tlog
