// Our Go Live frames, openable by a second DAVE member (ZN-921). An H.264 access unit as Conn::sendVideo builds it (Annex B, 4-byte start
// codes, SPS, PPS, SEI, IDR and P slices; the ssrc assigned to DAVE_CODEC_H264) is encrypted with libdave's encryptor, cut into RTP
// payloads by the packetiser of video_policy.h (single NAL units and FU-A), put back together as WebRTC's H.264 depacketiser does on the
// viewer (4-byte start codes, FU-A fragments joined), and opened by a decryptor holding the same key ratchet: the bytes must equal the
// original. The key ratchet is a fixed one (the MLS part is libdave's own and proven by a real call: "welcome applied", we decrypt what
// others send); the frame format is what a viewer rejects. libdave's own sources, only the AES-GCM backend is OpenSSL's here instead of
// BoringSSL. tests/t0/discord_voice_dave.sh builds it.
#include <dave/dave_interfaces.h>
#include <openssl/evp.h>

#include <bytes/bytes.h>

#include <cstdio>
#include <cstring>
#include <memory>
#include <vector>

#include "cryptor.h"
#include "common.h"
#include "video_policy.h"

namespace discord::dave {
// AES-128-GCM with the 8-byte truncated tag libdave frames carry
struct EvpCryptor : ICryptor {
  std::vector<uint8_t> key;
  bool run(bool enc, uint8_t* out, const uint8_t* in, size_t n, const uint8_t* nonce, const uint8_t* aad, size_t an, uint8_t* tag) {
    EVP_CIPHER_CTX* c = EVP_CIPHER_CTX_new();
    int l = 0;
    bool ok = EVP_CipherInit_ex(c, EVP_aes_128_gcm(), nullptr, nullptr, nullptr, enc) == 1 &&
              EVP_CIPHER_CTX_ctrl(c, EVP_CTRL_GCM_SET_IVLEN, kAesGcm128NonceBytes, nullptr) == 1 &&
              EVP_CipherInit_ex(c, nullptr, nullptr, key.data(), nonce, enc) == 1 && EVP_CipherUpdate(c, nullptr, &l, aad, (int)an) == 1;
    if (ok && !enc) ok = EVP_CIPHER_CTX_ctrl(c, EVP_CTRL_GCM_SET_TAG, kAesGcm128TruncatedTagBytes, tag) == 1;
    if (ok) ok = EVP_CipherUpdate(c, out, &l, in, (int)n) == 1;
    if (ok && enc) { ok = EVP_CipherFinal_ex(c, out + l, &l) == 1 && EVP_CIPHER_CTX_ctrl(c, EVP_CTRL_GCM_GET_TAG, kAesGcm128TruncatedTagBytes, tag) == 1; }
    else if (ok) ok = EVP_CipherFinal_ex(c, out + l, &l) == 1;
    EVP_CIPHER_CTX_free(c);
    return ok;
  }
  bool Encrypt(ArrayView<uint8_t> o, ArrayView<const uint8_t> p, ArrayView<const uint8_t> n, ArrayView<const uint8_t> a, ArrayView<uint8_t> t) override {
    return run(true, o.data(), p.data(), p.size(), n.data(), a.data(), a.size(), t.data());
  }
  bool Decrypt(ArrayView<uint8_t> o, ArrayView<const uint8_t> c, ArrayView<const uint8_t> t, ArrayView<const uint8_t> n, ArrayView<const uint8_t> a) override {
    return run(false, o.data(), c.data(), c.size(), n.data(), a.data(), a.size(), const_cast<uint8_t*>(t.data()));
  }
};
std::unique_ptr<ICryptor> CreateCryptor(const EncryptionKey& k) {
  auto c = std::make_unique<EvpCryptor>();
  c->key.assign(k.data(), k.data() + k.size());
  return c;
}
}  // namespace discord::dave

using namespace discord::dave;

struct Ratchet : IKeyRatchet {
  EncryptionKey GetKey(KeyGeneration g) noexcept override {
    std::vector<uint8_t> k(16);
    for (size_t i = 0; i < 16; i++) k[i] = (uint8_t)(i * 7 + g + 1);
    return EncryptionKey(k);
  }
  void DeleteKey(KeyGeneration) noexcept override {}
  std::vector<uint8_t> GetDomainIdentity() const noexcept override { return {1, 2, 3}; }
};

static const char* failed = nullptr;
static void check(const char* name, bool ok) { if (!ok && !failed) failed = name; }

static void put(std::vector<uint8_t>& au, std::initializer_list<uint8_t> head, size_t body, uint32_t seed) {
  au.insert(au.end(), {0, 0, 0, 1});
  au.insert(au.end(), head);
  for (size_t i = 0; i < body; i++) { seed = seed * 1664525u + 1013904223u; au.push_back((uint8_t)(seed >> 24)); }
}

/** What the viewer's depacketiser gives: single NAL units and FU-A fragments joined, each behind a 4-byte start code. */
static std::vector<uint8_t> depacketise(const std::vector<std::pair<std::vector<uint8_t>, bool>>& ps) {
  std::vector<uint8_t> f;
  for (const auto& [p, marker] : ps) {
    const uint8_t type = p[0] & 0x1F;
    if (type == 28) {
      if (p[1] & 0x80) { f.insert(f.end(), {0, 0, 0, 1}); f.push_back((uint8_t)((p[0] & 0xE0) | (p[1] & 0x1F))); }
      f.insert(f.end(), p.begin() + 2, p.end());
    } else { f.insert(f.end(), {0, 0, 0, 1}); f.insert(f.end(), p.begin(), p.end()); }
  }
  return f;
}

int main() {
  auto enc = CreateEncryptor();
  enc->SetKeyRatchet(std::make_unique<Ratchet>());
  enc->SetPassthroughMode(false);
  const uint32_t vs = 7687;
  enc->AssignSsrcToCodec(vs, Codec::H264);
  auto dec = CreateDecryptor();
  dec->TransitionToKeyRatchet(std::make_unique<Ratchet>());

  // a key frame (SPS, PPS, SEI, IDR: what VideoToolbox gives, [1,5,6,7,8]) and a few P frames, small and large, with bodies that hold
  // zero runs and start-code look-alikes
  for (int n = 0; n < 40 && !failed; n++) {
    std::vector<uint8_t> au;
    if (n % 10 == 0) {
      put(au, {0x67, 0x64, 0x00, 0x1f, 0xac, 0xd9, 0x40, 0x50, 0x05, 0xbb, 0x01, 0x10, 0x00, 0x00, 0x03, 0x00, 0x10, 0x00, 0x00, 0x03, 0x00, 0x20}, 0, 1);
      put(au, {0x68, 0xeb, 0xe3, 0xcb, 0x22, 0xc0}, 0, 2);
      put(au, {0x06, 0x05, 0x10, 0xaa, 0xbb, 0xcc, 0x80}, 12, 3);
      put(au, {0x65, 0x88, 0x84, 0x00, 0x33, 0xff}, 30000 + n, 4 + n);
    } else {
      put(au, {0x41, 0x9a, 0x24, 0x6c}, n % 3 == 0 ? 60 : 4000 + n * 37, 100 + n);
    }
    if (n == 5) { const uint8_t z[] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3}; au.insert(au.end(), z, z + sizeof z); }   // zero runs in a slice
    std::vector<uint8_t> e(enc->GetMaxCiphertextByteSize(Video, au.size()));
    size_t wr = 0;
    check("encrypt", enc->Encrypt(Video, vs, ArrayView<const uint8_t>(au.data(), au.size()), ArrayView<uint8_t>(e.data(), e.size()), &wr) == IEncryptor::Success);
    e.resize(wr);
    check("the NAL headers stay readable", e.size() > 5 && e[4] == au[4]);
    const auto payloads = rtpPayloads(e, VIDEO_MTU);
    check("one marker, on the last packet", !payloads.empty() && payloads.back().second);
    for (size_t i = 0; i + 1 < payloads.size(); i++) check("no early marker", !payloads[i].second);
    for (const auto& p : payloads) check("a packet fits", p.first.size() <= VIDEO_MTU);
    const std::vector<uint8_t> got = depacketise(payloads);
    check("the viewer's frame is what we encrypted", got == e);
    std::vector<uint8_t> plain(dec->GetMaxPlaintextByteSize(Video, got.size()));
    size_t pw = 0;
    check("decrypt", dec->Decrypt(Video, ArrayView<const uint8_t>(got.data(), got.size()), ArrayView<uint8_t>(plain.data(), plain.size()), &pw) == IDecryptor::Success);
    plain.resize(pw);
    check("decrypted bytes equal the original", plain == au);
  }
  puts(failed ? failed : "ok");
  return failed ? 1 : 0;
}
