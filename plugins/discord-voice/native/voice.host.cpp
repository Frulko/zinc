// zinc:discord-voice for macos and linux: the media of a Discord voice connection (docs/reports/discord-client-research.md 4.3).
// One worker thread per connection owns everything after the voice gateway's Ready: the UDP socket and IP discovery, then every 20 ms one
// Opus frame of the microphone encrypted and sent, and the received packets decrypted, decoded into a jitter buffer per SSRC and mixed
// into the output. The audio devices (miniaudio, the copy of plugins/audio/vendor) only move samples through two buffers under a mutex.
// Transport encryption, the _rtpsize modes: the RTP header (and the 4-byte header of an extension) is the additional data, the payload
// (with the extension's body) is encrypted, a 32-bit counter is appended and is the nonce, zero-padded to 12 bytes (AES-256-GCM, the
// engine's mbedTLS through PSA) or 24 (XChaCha20-Poly1305, Monocypher 4.0.2, the AEAD of libsodium's crypto_aead_xchacha20poly1305_ietf).
// DAVE, the end-to-end layer (docs/reports/discord-client-research.md 4.5): libdave's C API (vendor/libdave on mlspp and BoringSSL) holds
// the MLS group; index.ts feeds it the voice gateway's messages, and each Opus frame is encrypted by it before the transport encryption
// (and decrypted after it, with the decryptor of the user its SSRC belongs to).
// Video (docs/reports/discord-client-research.md 5): H.264 on the same UDP socket and keys, the way the desktop client sends it (protocol
// "udp", not WebRTC). A second thread per connection encodes our camera (VideoToolbox, plugins/webrtc/native/media.h) and decodes the
// streams the program watches: only those, at the size they are shown (the decoder scales), into three buffers per stream (the decoder's,
// the newest frame, the image's) swapped instead of copied. Packets of a stream nobody watches are dropped before they are opened.
#define ZRT_HOSTED_CPP
#include "zinc_native_discordvoice.h"
#define MONOCYPHER_CPP_NAMESPACE zn_voice_monocypher
#include "../../../third_party/monocypher/monocypher.c"
#include "../../audio/vendor/miniaudio.h"
#include "opus.h"
#include "dave/dave.h"
#include "../../webrtc/native/media.h"
#include <dlfcn.h>
#include <stdio.h>
#include <psa/crypto.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <math.h>
#include <netdb.h>
#include <poll.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

// The program's runtime images (zinc:gfx), as plugins/camera reaches them: a headless program does not link the rasterizer, and then a
// stream has no image (-1).
template <class F> static F host_fn(const char* name, F self) { F f = reinterpret_cast<F>(dlsym(RTLD_DEFAULT, name)); return f != self ? f : nullptr; }
namespace zrt { namespace raster {
__attribute__((weak)) int32_t dyn_wrap(int32_t w, int32_t h, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster8dyn_wrapEiiPKji", &dyn_wrap); return f ? f(w, h, px, s) : -1; }
__attribute__((weak)) void dyn_update(int32_t id, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster10dyn_updateEiPKji", &dyn_update); if (f) f(id, px, s); }
__attribute__((weak)) void dyn_destroy(int32_t id) { static auto f = host_fn("_ZN3zrt6raster11dyn_destroyEi", &dyn_destroy); if (f) f(id); }
__attribute__((weak)) bool dyn_view(int32_t id, const uint32_t** px, int32_t* w, int32_t* h, int32_t* s) { static auto f = host_fn("_ZN3zrt6raster8dyn_viewEiPPKjPiS4_S4_", &dyn_view); return f ? f(id, px, w, h, s) : false; }
}}

namespace {
const char FS = '\x1f', RS = '\x1e';
const int RATE = 48000, CH = 2, FRAME = 960;            // 20 ms of stereo at 48 kHz
const int PT_OPUS = 0x78;
const int PT_H264 = 101;                                  // what Select Protocol's codecs declare (index.ts); its RTX (102) is not read
const size_t VIDEO_MTU = 1100;                            // payload bytes per video packet
const double PLI_EVERY_MS = 1000;                         // at most one key frame asked per stream and second
const double VAD_LEVEL = 0.01, VAD_HOLD_MS = 300;         // voice activity: above this RMS (the default, setAudio's threshold), and for this long after
const int SILENCE_FRAMES = 5;                             // sent after speech, as the official clients do
const uint8_t SILENCE[3] = {0xF8, 0xFF, 0xFE};
const size_t JITTER_MAX = 8;                              // frames kept per speaker (160 ms); older ones are dropped
const size_t JITTER_START = 2;                            // frames buffered before a speaker is played
enum Mode { NONE = -1, AES_GCM = 0, XCHACHA = 1 };
const char* MODE_NAMES[] = {"aead_aes256_gcm_rtpsize", "aead_xchacha20_poly1305_rtpsize"};

std::string err;
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
std::string cstr(const zrt::String& s) { return std::string(s.ptr(), s.bytes()); }
std::vector<uint8_t> vec(const zrt::Array<uint8_t>& a) { return a.a ? std::vector<uint8_t>(a.a->data, a.a->data + a.a->len) : std::vector<uint8_t>(); }
zrt::Array<uint8_t> arr(const std::vector<uint8_t>& v) {
  zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap((int32_t)v.size());
  if (!v.empty()) memcpy(r.a->data, v.data(), v.size());
  r.a->len = (int32_t)v.size();
  return r;
}
inline uint16_t be16(const uint8_t* p) { return (uint16_t)(p[0] << 8 | p[1]); }
inline uint32_t be32(const uint8_t* p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
inline void put32(uint8_t* p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; }
double nowMs() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
int modeOf(const std::string& m) { for (int i = 0; i < 2; i++) if (m == MODE_NAMES[i]) return i; return NONE; }
bool fakeMic() { const char* v = getenv("ZINC_FAKE_MICROPHONE"); return v && *v && strcmp(v, "0") != 0; }
const char* FAKE_IN = "zinc:fake-microphone\x1fZinc Fake Microphone\x1e", *FAKE_OUT = "zinc:fake-speakers\x1fZinc Fake Speakers\x1e";
// The devices: one miniaudio context for the listing and the opening, ids as zinc:microphone writes them (the same backend's name for a
// device), so an id of its devices() opens the same microphone here.
ma_context ctx;
bool ctxOk = false, ctxTried = false;
ma_context* context() {
  if (!ctxTried) { ctxTried = true; ctxOk = ma_context_init(nullptr, 0, nullptr, &ctx) == MA_SUCCESS; }
  return ctxOk ? &ctx : nullptr;
}
std::string idOf(const ma_device_info& d, int i) {
  switch (ctx.backend) {
    case ma_backend_coreaudio: return d.id.coreaudio;
    case ma_backend_pulseaudio: return d.id.pulse;
    case ma_backend_alsa: return d.id.alsa;
    default: return "device:" + std::to_string(i);
  }
}
double rms(const float* s, int n) { double a = 0; for (int i = 0; i < n; i++) a += (double)s[i] * s[i]; return n ? sqrt(a / n) : 0; }

// ---------------------------------------------------------------- the transport encryption
struct Cipher {
  int mode = NONE;
  uint8_t key[32] = {0};
  psa_key_id_t kid = 0;
  bool init(int m, const std::vector<uint8_t>& k) {
    if (m == NONE || k.size() != 32) return false;
    mode = m;
    memcpy(key, k.data(), 32);
    if (m == AES_GCM) {
      static bool psa = psa_crypto_init() == PSA_SUCCESS;
      if (!psa) return false;
      psa_key_attributes_t at = PSA_KEY_ATTRIBUTES_INIT;
      psa_set_key_type(&at, PSA_KEY_TYPE_AES);
      psa_set_key_bits(&at, 256);
      psa_set_key_usage_flags(&at, PSA_KEY_USAGE_ENCRYPT | PSA_KEY_USAGE_DECRYPT);
      psa_set_key_algorithm(&at, PSA_ALG_GCM);
      if (psa_import_key(&at, key, 32, &kid) != PSA_SUCCESS) { kid = 0; return false; }
    }
    return true;
  }
  ~Cipher() { if (kid) psa_destroy_key(kid); zn_voice_monocypher::crypto_wipe(key, 32); }

  /** header + encrypted payload + tag + counter. */
  std::vector<uint8_t> seal(const uint8_t* hdr, size_t hn, uint32_t counter, const uint8_t* pl, size_t pn) const {
    std::vector<uint8_t> out(hn + pn + 16 + 4);
    memcpy(out.data(), hdr, hn);
    uint8_t nonce[24] = {0};
    put32(nonce, counter);
    if (mode == AES_GCM) {
      size_t len = 0;
      if (psa_aead_encrypt(kid, PSA_ALG_GCM, nonce, 12, hdr, hn, pl, pn, out.data() + hn, pn + 16, &len) != PSA_SUCCESS || len != pn + 16) return {};
    } else zn_voice_monocypher::crypto_aead_lock(out.data() + hn, out.data() + hn + pn, key, nonce, hdr, hn, pl, pn);
    put32(out.data() + hn + pn + 16, counter);
    return out;
  }
  /** The payload of a packet, the extension's body skipped; false when it does not authenticate. RTCP: its 8-byte header is the additional
   *  data. */
  bool open(const uint8_t* p, size_t n, std::vector<uint8_t>& out, bool rtcp = false) const {
    if (n < 12) return false;
    size_t hn = rtcp ? 8 : 12 + 4 * (size_t)(p[0] & 0x0f);   // CSRCs
    const bool ext = !rtcp && (p[0] & 0x10) != 0;
    if (ext) hn += 4;                                // the extension's profile and length are authenticated, its body is encrypted
    if (n < hn + 16 + 4) return false;
    const size_t cn = n - hn - 16 - 4;
    uint8_t nonce[24] = {0};
    memcpy(nonce, p + n - 4, 4);
    out.resize(cn);
    if (mode == AES_GCM) {
      size_t len = 0;
      std::vector<uint8_t> tmp(cn + 16);
      if (psa_aead_decrypt(kid, PSA_ALG_GCM, nonce, 12, p, hn, p + hn, cn + 16, tmp.data(), tmp.size(), &len) != PSA_SUCCESS) return false;
      memcpy(out.data(), tmp.data(), cn);
    } else if (zn_voice_monocypher::crypto_aead_unlock(out.data(), p + hn + cn, key, nonce, p, hn, p + hn, cn) != 0) return false;
    if (ext) {
      const size_t skip = 4 * (size_t)be16(p + hn - 2);
      if (skip > out.size()) return false;
      out.erase(out.begin(), out.begin() + (long)skip);
    }
    return true;
  }
};

std::vector<uint8_t> rtpHeader(uint16_t seq, uint32_t ts, uint32_t ssrc) {
  std::vector<uint8_t> h(12);
  h[0] = 0x80; h[1] = PT_OPUS; h[2] = (uint8_t)(seq >> 8); h[3] = (uint8_t)seq;
  put32(h.data() + 4, ts); put32(h.data() + 8, ssrc);
  return h;
}

// ---------------------------------------------------------------- a connection
/** One camera we watch: its packets in, frames out at most fitW x fitH. `m` guards the reassembly, the fit and the two buffers the
 *  threads hand each other (ready, fresh); `back` is the video thread's, `shown` and `img` the program's. */
struct Watch {
  std::mutex m;
  media::Reassembler re{media::Reassembler::H264};
  std::string user;
  uint32_t ssrc = 0;
  int fitW = 0, fitH = 0, rw = 0, rh = 0, sw = 0, sh = 0, img = -1;
  bool fresh = false;
  std::vector<uint32_t> ready, shown;
  double pliAt = -1e9, decoded = 0;     // under m
  // the video thread's own
  std::unique_ptr<media::VideoDecoder> dec;
  std::vector<uint32_t> back;
};

struct Speaker {
  OpusDecoder* dec = nullptr;
  std::deque<std::vector<float>> frames;
  bool primed = false, seen = false;
  uint16_t seq = 0;
  double level = 0, heardAt = 0;
  ~Speaker() { if (dec) opus_decoder_destroy(dec); }
};

struct Conn {
  int fd = -1;
  uint32_t ssrc = 0;
  std::thread th;
  std::atomic<bool> run{true};
  std::mutex mu;                       // what the program's thread reads or sets: below
  std::string disc;                    // IP discovery's answer
  bool started = false, audio = true;  // audio false: a Go Live connection (video only: no devices, voice not decoded)
  Cipher cipher;
  bool mute = false, deaf = false, ptt = false, held = false;
  std::map<uint32_t, std::string> users;
  std::string speakingNow;             // the records of speaking(), written each tick
  double stats[6] = {0, 0, 0, 0, 0, 0};
  // the worker's own
  OpusEncoder* enc = nullptr;
  uint16_t seq = 0;
  uint32_t ts = 0, counter = 0;
  int silence = 0;
  double voiceAt = -1e9, sentAt = -1e9, myLevel = 0;
  long long tone = 0;                  // the fake microphone's next sample
  std::map<uint32_t, Speaker> speakers;
  // the devices and their buffers (under amu)
  bool fake = false, capOn = false;
  std::atomic<bool> playOn{false};
  ma_device cap, play;
  // the program's audio choices (under mu): the devices ('' the system's default), the gains, the voice activity threshold, a gain per user
  std::string inDev, outDev;
  double inGain = 1, outGain = 1, threshold = VAD_LEVEL, level = 0;
  std::map<std::string, double> userGain;
  std::mutex amu;
  std::vector<float> captured, toPlay;
  // DAVE (under mu): the MLS session, our encryptor, a decryptor per user, the users of the last commit or welcome
  DAVESessionHandle dave = nullptr;
  DAVEEncryptorHandle daveEnc = nullptr;
  std::map<std::string, DAVEDecryptorHandle> daveDec;
  std::vector<std::string> roster;
  std::string me, daveFailure;
  int daveVersion = 0;
  double daveStats[2] = {0, 0};        // frames that could not be encrypted, frames that could not be decrypted
  double vstats[5] = {0, 0, 0, 0, 0};  // videoStats()
  // video (under vmu): the streams watched by SSRC, our camera's SSRC and its newest frame; vmu is taken after mu, never before
  std::mutex vmu;
  std::condition_variable vcv;
  std::map<uint32_t, std::shared_ptr<Watch>> watches;
  uint32_t vssrc = 0;
  int vbps = 0, vfps = 30;              // our stream's bitrate and rate (videoSend), 0: from its size
  std::vector<uint32_t> pend;
  int pw = 0, ph = 0;
  bool hasPend = false, forceKey = false;
  std::thread vth;
  // the video thread's own
  std::unique_ptr<media::VideoEncoder> venc;
  int encBps = 0, encFps = 0;
  uint16_t vseq = 0;

  ~Conn() {
    if (daveEnc) daveEncryptorDestroy(daveEnc);
    for (auto& [u, d] : daveDec) daveDecryptorDestroy(d);
    if (dave) daveSessionDestroy(dave);
  }
  DAVEDecryptorHandle decryptor(const std::string& user) {
    auto it = daveDec.find(user);
    if (it != daveDec.end()) return it->second;
    DAVEDecryptorHandle d = daveDecryptorCreate();
    daveDec[user] = d;
    return d;
  }

  void sendRaw(const uint8_t* p, size_t n) { (void)::send(fd, p, n, 0); }
  void discover() {
    uint8_t q[74] = {0};
    q[1] = 1; q[3] = 70;
    put32(q + 4, ssrc);
    sendRaw(q, sizeof q);
  }
  void loop();
  void videoLoop();
  void videoPacket(const uint8_t* p, size_t n, double now);
  void rtcp(const uint8_t* p, size_t n);
  void sendVideo(const std::vector<uint32_t>& px, int w, int h, bool key);
  void decodeAll(Watch& x);
  void pli(uint32_t source);
  void received(const uint8_t* p, size_t n, double now);
  void tick(double now);
  bool frame(float* pcm);
};

void Conn::received(const uint8_t* p, size_t n, double now) {
  std::lock_guard<std::mutex> g(mu);
  if (n == 74 && be16(p) == 2) {         // IP discovery's answer: our address (null-terminated) and port
    char a[65] = {0};
    memcpy(a, p + 8, 64);
    disc = std::string(a) + FS + std::to_string(be16(p + 72));
    return;
  }
  if (!started || n < 12) return;
  if (p[1] >= 200 && p[1] <= 206) { rtcp(p, n); return; }
  if ((p[1] & 0x7f) == PT_H264) { videoPacket(p, n, now); return; }
  if ((p[1] & 0x7f) != PT_OPUS || !audio) return;   // RTX (we ask for key frames instead) and the rest
  stats[1]++;
  std::vector<uint8_t> pl;
  if (!cipher.open(p, n, pl)) { stats[2]++; return; }
  const uint32_t from = be32(p + 8);
  const uint16_t sq = be16(p + 2);
  Speaker& s = speakers[from];
  if (s.seen && (int16_t)(sq - s.seq) <= 0) { stats[5]++; return; }   // late or repeated
  s.seen = true; s.seq = sq;
  if (pl.size() == 3 && !memcmp(pl.data(), SILENCE, 3)) { s.heardAt = 0; s.level = 0; return; }   // the end of their speech
  if (daveVersion > 0) {   // end-to-end: the frame is the sender's own encryption, opened with their key ratchet
    auto u = users.find(from);
    if (u == users.end()) { daveStats[1]++; return; }
    DAVEDecryptorHandle d = decryptor(u->second);
    std::vector<uint8_t> plain(daveDecryptorGetMaxPlaintextByteSize(d, DAVE_MEDIA_TYPE_AUDIO, pl.size()));
    size_t w = 0;
    if (daveDecryptorDecrypt(d, DAVE_MEDIA_TYPE_AUDIO, pl.data(), pl.size(), plain.data(), plain.size(), &w) != DAVE_DECRYPTOR_RESULT_CODE_SUCCESS) { daveStats[1]++; return; }
    plain.resize(w);
    pl.swap(plain);
  }
  if (!s.dec) { int e = 0; s.dec = opus_decoder_create(RATE, CH, &e); if (e != OPUS_OK) { s.dec = nullptr; return; } }
  std::vector<float> pcm((size_t)FRAME * CH * 6);   // up to 120 ms in one packet
  const int got = opus_decode_float(s.dec, pl.data(), (opus_int32)pl.size(), pcm.data(), FRAME * 6, 0);
  if (got <= 0) { stats[2]++; return; }
  stats[3]++;
  for (int off = 0; off + FRAME <= got; off += FRAME) s.frames.emplace_back(pcm.begin() + (long)off * CH, pcm.begin() + (long)(off + FRAME) * CH);
  while (s.frames.size() > JITTER_MAX) { s.frames.pop_front(); stats[5]++; }
  s.level = rms(pcm.data(), got * CH);
  s.heardAt = now;
}

/** One 20 ms frame of the microphone, false when not enough came in yet. */
bool Conn::frame(float* pcm) {
  if (fake) {   // a 440 Hz tone at -10 dBFS, a function of the sample index only
    for (int i = 0; i < FRAME; i++, tone++) pcm[2 * i] = pcm[2 * i + 1] = (float)(0.3 * sin(2 * M_PI * 440.0 * (double)tone / RATE));
    return true;
  }
  std::lock_guard<std::mutex> g(amu);
  if (captured.size() < (size_t)FRAME * CH) return false;
  memcpy(pcm, captured.data(), sizeof(float) * FRAME * CH);
  captured.erase(captured.begin(), captured.begin() + FRAME * CH);
  return true;
}

void Conn::tick(double now) {
  float pcm[FRAME * CH];
  bool m, d, p, h;
  double gin, gout, gate;
  { std::lock_guard<std::mutex> g(mu); m = mute; d = deaf; p = ptt; h = held; gin = inGain; gout = outGain; gate = threshold; }
  if (frame(pcm)) {
    if (gin != 1) for (float& v : pcm) v = std::max(-1.0f, std::min(1.0f, (float)(v * gin)));
    myLevel = rms(pcm, FRAME * CH);
    { std::lock_guard<std::mutex> g(mu); level = myLevel; }
    if (myLevel > gate) voiceAt = now;
    const bool send = !m && (p ? h : now - voiceAt < VAD_HOLD_MS);
    uint8_t opus[1500];
    int n = 0;
    if (send) { n = opus_encode_float(enc, pcm, FRAME, opus, sizeof opus); silence = SILENCE_FRAMES; }
    else if (silence > 0) { memcpy(opus, SILENCE, 3); n = 3; silence--; }
    if (n > 0) {
      std::lock_guard<std::mutex> g(mu);
      std::vector<uint8_t> frame(opus, opus + n);
      if (daveVersion > 0 && n != 3) {   // end-to-end first; the silence frame passes as it is (the decryptors skip it)
        std::vector<uint8_t> e(daveEncryptorGetMaxCiphertextByteSize(daveEnc, DAVE_MEDIA_TYPE_AUDIO, frame.size()));
        size_t w = 0;
        if (daveEncryptorEncrypt(daveEnc, DAVE_MEDIA_TYPE_AUDIO, ssrc, frame.data(), frame.size(), e.data(), e.size(), &w) != DAVE_ENCRYPTOR_RESULT_CODE_SUCCESS) {
          daveStats[0]++;   // no key yet (the group is being made): nothing leaves unencrypted
          frame.clear();
        } else { e.resize(w); frame.swap(e); }
      }
      if (!frame.empty()) {
        const std::vector<uint8_t> hdr = rtpHeader(seq++, ts, ssrc);
        const std::vector<uint8_t> pkt = cipher.seal(hdr.data(), hdr.size(), counter++, frame.data(), frame.size());
        stats[0]++;
        if (n != 3) sentAt = now;   // speaking: what actually left, not what DAVE held back
        sendRaw(pkt.data(), pkt.size());
      }
    }
    ts += FRAME;
  }
  // the mix: each speaker plays once it has JITTER_START frames, and buffers again after an underrun
  // ponytail: no reordering and no loss concealment (Opus PLC/FEC); add them when real calls show gaps.
  float out[FRAME * CH] = {0};
  std::string rec;
  {
    std::lock_guard<std::mutex> g(mu);
    for (auto& [id, s] : speakers) {
      if (!s.primed && s.frames.size() >= JITTER_START) s.primed = true;
      if (s.primed && s.frames.empty()) s.primed = false;
      if (!s.primed) continue;
      const std::vector<float>& f = s.frames.front();
      double k = gout;
      auto u = users.find(id);
      if (u != users.end()) { auto ug = userGain.find(u->second); if (ug != userGain.end()) k *= ug->second; }
      for (int i = 0; i < FRAME * CH; i++) out[i] += (float)(f[(size_t)i] * k);
      s.frames.pop_front();
      stats[4]++;
    }
    for (auto& [id, s] : speakers)
      if (now - s.heardAt < VAD_HOLD_MS) {
        auto u = users.find(id);
        if (!rec.empty()) rec += RS;
        rec += (u != users.end() ? u->second : std::to_string(id)) + FS + std::to_string(s.level);
      }
    if (now - sentAt < 100) { if (!rec.empty()) rec += RS; rec += std::string("me") + FS + std::to_string(myLevel); }
    speakingNow = rec;
  }
  if (playOn && !d) {
    for (float& v : out) v = v > 1 ? 1 : v < -1 ? -1 : v;
    std::lock_guard<std::mutex> g(amu);
    if (toPlay.size() > (size_t)FRAME * CH * 10) toPlay.clear();   // the output fell behind by 200 ms: start again at now
    toPlay.insert(toPlay.end(), out, out + FRAME * CH);
  }
}

void Conn::loop() {
  double next = nowMs(), asked = 0;
  uint8_t buf[2048];
  while (run) {
    double now = nowMs();
    bool media, known;
    { std::lock_guard<std::mutex> g(mu); media = started; known = !disc.empty(); }
    if (!known && now - asked > 1000) { discover(); asked = now; }   // again each second: UDP may lose it
    pollfd pf = {fd, POLLIN, 0};
    const int wait = media ? (int)std::max(0.0, next - now) : 50;
    if (poll(&pf, 1, wait) > 0)
      for (;;) {
        const ssize_t n = recv(fd, buf, sizeof buf, 0);
        if (n <= 0) break;
        received(buf, (size_t)n, nowMs());
      }
    if (!media) { next = nowMs(); continue; }
    now = nowMs();
    if (now >= next) {
      tick(now);
      next += FRAME * 1000.0 / RATE;
      if (now - next > 200) next = now;   // asleep for a while: no burst to catch up
    }
  }
}

// ---------------------------------------------------------------- video
/** A video packet (the worker, under mu): opened only when its stream is watched, then reassembled. */
void Conn::videoPacket(const uint8_t* p, size_t n, double now) {
  std::shared_ptr<Watch> x;
  { std::lock_guard<std::mutex> g(vmu); auto it = watches.find(be32(p + 8)); if (it != watches.end()) x = it->second; }
  if (!x) return;
  std::vector<uint8_t> pkt;
  if (!cipher.open(p, n, pkt)) { stats[2]++; return; }
  pkt.insert(pkt.begin(), p, p + 12);   // the reassembler reads a packet: the fixed header, without the extension (opened above)
  pkt[0] = 0x80;
  { std::lock_guard<std::mutex> g(x->m); x->re.push(pkt.data(), pkt.size(), (int64_t)now); }
  vcv.notify_one();
}
/** RTCP (under mu): a PLI asks us for a key frame. */
void Conn::rtcp(const uint8_t* p, size_t n) {
  std::vector<uint8_t> body;
  if (!cipher.open(p, n, body, true)) return;
  if (p[1] == 206 && (p[0] & 0x1f) == 1) { vstats[4]++; std::lock_guard<std::mutex> g(vmu); forceKey = true; }
}
/** Asks the sender of the stream `source` for a key frame (RTCP PLI; video thread). */
void Conn::pli(uint32_t source) {
  uint8_t hdr[8] = {0x81, 206, 0, 2}, body[4];
  put32(hdr + 4, ssrc);
  put32(body, source);
  std::lock_guard<std::mutex> g(mu);
  const std::vector<uint8_t> pkt = cipher.seal(hdr, 8, counter++, body, 4);
  vstats[3]++;
  sendRaw(pkt.data(), pkt.size());
}
/** One camera frame: encoded, end-to-end encrypted, cut into RTP packets (RFC 6184: single NAL units and FU-A) and sent (video thread). */
void Conn::sendVideo(const std::vector<uint32_t>& px, int w, int h, bool key) {
  int bps, fps;
  { std::lock_guard<std::mutex> v(vmu); bps = vbps > 0 ? vbps : std::max(300000, std::min(2500000, w * h * 3)); fps = vfps; }   // about 0.1 bit per pixel at 30 fps
  if (!venc || venc->w != w || venc->h != h || encBps != bps || encFps != fps) {
    venc.reset(media::h264Encoder(w, h, bps, fps));
    encBps = bps; encFps = fps;
    key = true;
  }
  std::vector<uint8_t> au;
  bool isKey = false;
  if (!venc || !venc->encode(px.data(), w, h, (int64_t)nowMs(), key, au, isKey)) return;
  for (size_t i = 0; i + 4 <= au.size();) { const size_t len = be32(&au[i]); au[i] = au[i + 1] = au[i + 2] = 0; au[i + 3] = 1; i += 4 + len; }   // AVCC -> Annex B, in place
  const uint32_t ts = (uint32_t)(int64_t)(nowMs() * 90);   // the 90 kHz clock
  std::lock_guard<std::mutex> g(mu);
  if (!started) return;
  uint32_t vs;
  { std::lock_guard<std::mutex> v(vmu); vs = vssrc; }
  if (vs == 0) return;
  if (daveVersion > 0) {   // end-to-end first: libdave leaves the NAL headers readable and keeps start codes out of what it encrypts
    std::vector<uint8_t> e(daveEncryptorGetMaxCiphertextByteSize(daveEnc, DAVE_MEDIA_TYPE_VIDEO, au.size()));
    size_t wr = 0;
    if (daveEncryptorEncrypt(daveEnc, DAVE_MEDIA_TYPE_VIDEO, vs, au.data(), au.size(), e.data(), e.size(), &wr) != DAVE_ENCRYPTOR_RESULT_CODE_SUCCESS) { daveStats[0]++; return; }
    e.resize(wr);
    au.swap(e);
  }
  vstats[0]++;
  // the NAL units between start codes (00 00 01; the leading zero of a 4-byte one is not part of the unit before it)
  std::vector<std::pair<size_t, size_t>> nals;
  size_t start = std::string::npos;
  for (size_t i = 0; i < au.size(); i++) {
    if (!(i + 3 <= au.size() && au[i] == 0 && au[i + 1] == 0 && au[i + 2] == 1)) continue;
    if (start != std::string::npos) { size_t end = i; while (end > start && au[end - 1] == 0) end--; if (end > start) nals.push_back({start, end - start}); }
    start = i + 3;
    i += 2;
  }
  if (start != std::string::npos && start < au.size()) nals.push_back({start, au.size() - start});
  // the header, with the playout-delay extension (id 5, 0) the clients put on every video packet: its 4-byte header is authenticated,
  // its body travels encrypted with the payload
  uint8_t hdr[16] = {0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xBE, 0xDE, 0, 1};
  put32(hdr + 4, ts); put32(hdr + 8, vs);
  std::vector<uint8_t> body;
  auto packet = [&](const uint8_t* a, size_t an, const uint8_t* b, size_t bn, bool marker) {
    hdr[1] = (uint8_t)(PT_H264 | (marker ? 0x80 : 0));
    hdr[2] = (uint8_t)(vseq >> 8); hdr[3] = (uint8_t)vseq; vseq++;
    body.assign({0x51, 0, 0, 0});
    body.insert(body.end(), a, a + an);
    if (bn) body.insert(body.end(), b, b + bn);
    const std::vector<uint8_t> pkt = cipher.seal(hdr, sizeof hdr, counter++, body.data(), body.size());
    vstats[1]++;
    sendRaw(pkt.data(), pkt.size());
  };
  for (size_t k = 0; k < nals.size(); k++) {
    const uint8_t* d = au.data() + nals[k].first;
    const size_t len = nals[k].second;
    const bool last = k + 1 == nals.size();
    if (len <= VIDEO_MTU) { packet(d, len, nullptr, 0, last); continue; }
    for (size_t o = 1; o < len;) {   // FU-A: the indicator, then the header with S on the first fragment and E on the last
      const size_t take = std::min(VIDEO_MTU - 2, len - o);
      const uint8_t fu[2] = {(uint8_t)((d[0] & 0xE0) | 28), (uint8_t)((d[0] & 0x1F) | (o == 1 ? 0x80 : 0) | (o + take == len ? 0x40 : 0))};
      packet(fu, 2, d + o, take, last && o + take == len);
      o += take;
    }
  }
}
/** Every whole frame of a watched stream: end-to-end decrypted, decoded at its fit into `back`, handed over as `ready` (video thread). */
void Conn::decodeAll(Watch& x) {
  for (;;) {
    std::vector<uint8_t> f;
    int lost = 0, fw, fh;
    bool key = false, got, ask = false;
    const double now = nowMs();
    {
      std::lock_guard<std::mutex> g(x.m);
      got = x.re.pop(f, (int64_t)now, lost, key);
      fw = x.fitW; fh = x.fitH;
      if ((x.re.needKey() || x.decoded == 0) && now - x.pliAt > PLI_EVERY_MS) { x.pliAt = now; ask = true; }   // a loss, or nothing shown yet
    }
    if (ask) pli(x.ssrc);
    if (!got) return;
    {
      std::lock_guard<std::mutex> g(mu);
      if (daveVersion > 0) {
        DAVEDecryptorHandle d = decryptor(x.user);
        std::vector<uint8_t> plain(daveDecryptorGetMaxPlaintextByteSize(d, DAVE_MEDIA_TYPE_VIDEO, f.size()));
        size_t wr = 0;
        if (daveDecryptorDecrypt(d, DAVE_MEDIA_TYPE_VIDEO, f.data(), f.size(), plain.data(), plain.size(), &wr) != DAVE_DECRYPTOR_RESULT_CODE_SUCCESS) { daveStats[1]++; continue; }
        plain.resize(wr);
        f.swap(plain);
      }
    }
    if (!x.dec) x.dec.reset(media::h264Decoder());
    if (!x.dec) return;   // no H.264 decoder on this system
    x.dec->fit(fw, fh);
    int w = 0, h = 0;
    if (!x.dec->decode(f.data(), f.size(), x.back, w, h)) continue;
    { std::lock_guard<std::mutex> g(x.m); x.back.swap(x.ready); x.rw = w; x.rh = h; x.fresh = true; x.decoded++; }
    std::lock_guard<std::mutex> g(mu);
    vstats[2]++;
  }
}
void Conn::videoLoop() {
  std::vector<uint32_t> px;
  while (run) {
    std::vector<std::shared_ptr<Watch>> ws;
    int w = 0, h = 0;
    bool have = false, key = false;
    {
      std::unique_lock<std::mutex> l(vmu);
      vcv.wait_for(l, std::chrono::milliseconds(20));
      if (hasPend) { px.swap(pend); w = pw; h = ph; hasPend = false; key = forceKey; forceKey = false; have = vssrc != 0; }
      for (auto& [id, x] : watches) ws.push_back(x);
    }
    if (have) sendVideo(px, w, h, key);
    for (auto& x : ws) decodeAll(*x);
    std::lock_guard<std::mutex> l(vmu);
    if (!hasPend) pend.swap(px);   // the buffer goes back for the next frame
  }
}

void onCapture(ma_device* dv, void*, const void* in, ma_uint32 n) {
  Conn* c = (Conn*)dv->pUserData;
  const float* s = (const float*)in;
  std::lock_guard<std::mutex> g(c->amu);
  if (c->captured.size() < (size_t)RATE * CH) c->captured.insert(c->captured.end(), s, s + (size_t)n * CH);   // at most a second
}
void onPlay(ma_device* dv, void* out, const void*, ma_uint32 n) {
  Conn* c = (Conn*)dv->pUserData;
  float* o = (float*)out;
  std::lock_guard<std::mutex> g(c->amu);
  const size_t want = (size_t)n * CH, have = std::min(want, c->toPlay.size());
  memcpy(o, c->toPlay.data(), have * sizeof(float));
  memset(o + have, 0, (want - have) * sizeof(float));
  c->toPlay.erase(c->toPlay.begin(), c->toPlay.begin() + (long)have);
}

/** Opens (or opens again, on a change of device) the microphone and the speakers chosen ('' or one not found: the system's default); no
 *  device is not fatal (we still hear, or still speak). Called on the program's thread; the worker only reads playOn and the buffers. */
void openDevices(Conn* c) {
  if (c->capOn) { ma_device_uninit(&c->cap); c->capOn = false; }
  if (c->playOn) { c->playOn = false; ma_device_uninit(&c->play); }
  if (c->fake || !context()) return;
  std::string in, out;
  { std::lock_guard<std::mutex> g(c->mu); in = c->inDev; out = c->outDev; }
  ma_device_info *plays = nullptr, *caps = nullptr;
  ma_uint32 np = 0, nc = 0;
  const ma_device_id *pin = nullptr, *pout = nullptr;
  if (ma_context_get_devices(&ctx, &plays, &np, &caps, &nc) == MA_SUCCESS) {
    for (ma_uint32 i = 0; i < nc; i++) if (!in.empty() && idOf(caps[i], (int)i) == in) pin = &caps[i].id;
    for (ma_uint32 i = 0; i < np; i++) if (!out.empty() && idOf(plays[i], (int)i) == out) pout = &plays[i].id;
  }
  ma_device_config cc = ma_device_config_init(ma_device_type_capture);
  cc.capture.pDeviceID = pin; cc.capture.format = ma_format_f32; cc.capture.channels = CH; cc.sampleRate = RATE; cc.dataCallback = onCapture; cc.pUserData = c;
  c->capOn = ma_device_init(&ctx, &cc, &c->cap) == MA_SUCCESS;
  if (c->capOn && ma_device_start(&c->cap) != MA_SUCCESS) { ma_device_uninit(&c->cap); c->capOn = false; }
  ma_device_config pc = ma_device_config_init(ma_device_type_playback);
  pc.playback.pDeviceID = pout; pc.playback.format = ma_format_f32; pc.playback.channels = CH; pc.sampleRate = RATE; pc.dataCallback = onPlay; pc.pUserData = c;
  bool on = ma_device_init(&ctx, &pc, &c->play) == MA_SUCCESS;
  if (on && ma_device_start(&c->play) != MA_SUCCESS) { ma_device_uninit(&c->play); on = false; }
  c->playOn = on;
}

Conn* conns[8];
Conn* at(int32_t h) { return h >= 0 && h < 8 ? conns[h] : nullptr; }

std::vector<std::string> fields(const std::string& s) {
  std::vector<std::string> out;
  if (s.empty()) return out;
  size_t a = 0;
  for (;;) { size_t b = s.find(FS, a); out.push_back(s.substr(a, b == std::string::npos ? std::string::npos : b - a)); if (b == std::string::npos) break; a = b + 1; }
  return out;
}
std::vector<uint8_t> taken(uint8_t* p, size_t n) { std::vector<uint8_t> v(p, p + n); if (p) daveFree(p); return v; }
void daveFailed(const char* source, const char* reason, void* user) {
  Conn* c = (Conn*)user;
  c->daveFailure = std::string(source ? source : "") + ": " + (reason ? reason : "");
}
void daveLog(DAVELoggingSeverity sev, const char* file, int line, const char* msg) {
  if (sev >= DAVE_LOGGING_SEVERITY_WARNING && sev != DAVE_LOGGING_SEVERITY_NONE && getenv("DISCORD_LOG")) fprintf(stderr, "dave: %s (%s:%d)\n", msg, file, line);
}
/** The users of a commit's or a welcome's roster, as decimal snowflakes. */
std::vector<std::string> rosterOf(uint64_t* ids, size_t n) {
  std::vector<std::string> out;
  for (size_t i = 0; i < n; i++) out.push_back(std::to_string(ids[i]));
  if (ids) daveFree(ids);
  return out;
}
void passthrough(Conn* c) {
  c->daveVersion = 0;
  daveEncryptorSetPassthroughMode(c->daveEnc, true);
  for (auto& [u, d] : c->daveDec) daveDecryptorTransitionToPassthroughMode(d, true);
}
}  // namespace

struct HostDiscordVoice : NativeDiscordVoice {
  int32_t connect(zrt::String host, int32_t port, uint32_t ssrc) override {
    int slot = -1;
    for (int i = 0; i < 8 && slot < 0; i++) if (!conns[i]) slot = i;
    if (slot < 0) { err = "discord-voice: too many connections"; return -1; }
    addrinfo hints{}, *res = nullptr;
    hints.ai_socktype = SOCK_DGRAM;
    const std::string h = cstr(host), p = std::to_string(port);
    if (getaddrinfo(h.c_str(), p.c_str(), &hints, &res) != 0 || !res) { err = "discord-voice: cannot resolve " + h; return -1; }
    const int fd = socket(res->ai_family, SOCK_DGRAM, 0);
    if (fd < 0 || ::connect(fd, res->ai_addr, res->ai_addrlen) != 0) {
      freeaddrinfo(res); if (fd >= 0) ::close(fd);
      err = "discord-voice: cannot open UDP to " + h + ":" + p; return -1;
    }
    freeaddrinfo(res);
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
    Conn* c = new Conn();
    c->fd = fd; c->ssrc = ssrc;
    conns[slot] = c;
    c->th = std::thread([c] { c->loop(); });
    c->vth = std::thread([c] { c->videoLoop(); });
    err.clear();
    return slot;
  }
  zrt::String error() override { return str(err); }
  zrt::String discovered(int32_t h) override {
    Conn* c = at(h);
    if (!c) return str("");
    std::lock_guard<std::mutex> g(c->mu);
    return str(c->disc);
  }
  zrt::String modes() override { return str(std::string(MODE_NAMES[0]) + FS + MODE_NAMES[1]); }
  bool start(int32_t h, zrt::String mode, zrt::Array<uint8_t> key, bool audio) override {
    Conn* c = at(h);
    if (!c) { err = "discord-voice: no such connection"; return false; }
    const int m = modeOf(cstr(mode));
    if (m == NONE) { err = "discord-voice: unknown encryption mode " + cstr(mode); return false; }
    int e = 0;
    OpusEncoder* enc = opus_encoder_create(RATE, CH, OPUS_APPLICATION_VOIP, &e);
    if (e != OPUS_OK) { err = "discord-voice: Opus encoder"; return false; }
    opus_encoder_ctl(enc, OPUS_SET_BITRATE(64000));
    opus_encoder_ctl(enc, OPUS_SET_INBAND_FEC(1));
    opus_encoder_ctl(enc, OPUS_SET_PACKET_LOSS_PERC(5));
    c->fake = audio && fakeMic();
    c->audio = audio;
    if (audio) openDevices(c);   // devices first, then the worker uses them
    std::lock_guard<std::mutex> g(c->mu);
    if (c->started) { opus_encoder_destroy(enc); err = "discord-voice: already started"; return false; }
    if (!c->cipher.init(m, vec(key))) { opus_encoder_destroy(enc); err = "discord-voice: the key must be 32 bytes"; return false; }
    c->enc = enc;
    c->started = true;
    err.clear();
    return true;
  }
  void controls(int32_t h, bool mute, bool deaf, bool ptt, bool held) override {
    Conn* c = at(h);
    if (!c) return;
    std::lock_guard<std::mutex> g(c->mu);
    c->mute = mute; c->deaf = deaf; c->ptt = ptt; c->held = held;
  }
  zrt::String devices(bool output) override {
    if (fakeMic()) return str(output ? FAKE_OUT : FAKE_IN);
    std::string out;
    ma_device_info *plays = nullptr, *caps = nullptr;
    ma_uint32 np = 0, nc = 0;
    if (context() && ma_context_get_devices(&ctx, &plays, &np, &caps, &nc) == MA_SUCCESS) {
      ma_device_info* l = output ? plays : caps;
      for (ma_uint32 i = 0, n = output ? np : nc; i < n; i++) out += idOf(l[i], (int)i) + FS + l[i].name + RS;
    }
    return str(out);
  }
  void setDevices(int32_t h, zrt::String input, zrt::String output) override {
    Conn* c = at(h);
    if (!c) return;
    bool again;
    {
      std::lock_guard<std::mutex> g(c->mu);
      again = c->started && (c->inDev != cstr(input) || c->outDev != cstr(output));
      c->inDev = cstr(input); c->outDev = cstr(output);
    }
    if (again) openDevices(c);
  }
  void setAudio(int32_t h, double inputGain, double outputGain, double threshold) override {
    Conn* c = at(h);
    if (!c) return;
    std::lock_guard<std::mutex> g(c->mu);
    c->inGain = std::max(0.0, inputGain); c->outGain = std::max(0.0, outputGain); c->threshold = std::max(0.0, threshold);
  }
  void setUserVolume(int32_t h, zrt::String user, double gain) override {
    Conn* c = at(h);
    if (!c) return;
    std::lock_guard<std::mutex> g(c->mu);
    if (gain == 1) c->userGain.erase(cstr(user)); else c->userGain[cstr(user)] = std::max(0.0, gain);
  }
  double level(int32_t h) override {
    Conn* c = at(h);
    if (!c) return 0;
    std::lock_guard<std::mutex> g(c->mu);
    return c->level;
  }
  void bind(int32_t h, uint32_t ssrc, zrt::String user) override {
    Conn* c = at(h);
    if (!c) return;
    std::lock_guard<std::mutex> g(c->mu);
    c->users[ssrc] = cstr(user);
  }
  zrt::String speaking(int32_t h) override {
    Conn* c = at(h);
    if (!c) return str("");
    std::lock_guard<std::mutex> g(c->mu);
    return str(c->speakingNow);
  }
  zrt::Array<double> stats(int32_t h) override {
    zrt::Array<double> r = zrt::Array<double>::with_cap(6);
    r.a->len = 6;
    Conn* c = at(h);
    for (int i = 0; i < 6; i++) r.a->data[i] = 0;
    if (c) { std::lock_guard<std::mutex> g(c->mu); for (int i = 0; i < 6; i++) r.a->data[i] = c->stats[i]; }
    return r;
  }
  void close(int32_t h) override {
    Conn* c = at(h);
    if (!c) return;
    c->run = false;
    c->vcv.notify_all();
    c->th.join();
    c->vth.join();
    for (auto& [id, x] : c->watches) if (x->img >= 0) zrt::raster::dyn_destroy(x->img);
    if (c->capOn) ma_device_uninit(&c->cap);
    if (c->playOn) ma_device_uninit(&c->play);
    if (c->enc) opus_encoder_destroy(c->enc);
    ::close(c->fd);
    delete c;
    conns[h] = nullptr;
  }
  void videoSend(int32_t h, uint32_t ssrc, int32_t bitrate, int32_t fps) override {
    Conn* c = at(h);
    if (!c) return;
    std::lock_guard<std::mutex> g(c->mu);
    if (ssrc && c->daveEnc) daveEncryptorAssignSsrcToCodec(c->daveEnc, ssrc, DAVE_CODEC_H264);
    std::lock_guard<std::mutex> v(c->vmu);
    c->vssrc = ssrc; c->vbps = bitrate; c->vfps = fps > 0 ? fps : 30; c->forceKey = true; c->hasPend = false;
  }
  bool sendImage(int32_t h, int32_t image) override {
    Conn* c = at(h);
    const uint32_t* px = nullptr;
    int32_t w = 0, ih = 0, s = 0;
    if (!c || !zrt::raster::dyn_view(image, &px, &w, &ih, &s) || !px || w < 16 || ih < 16) return false;
    w &= ~1; ih &= ~1;   // whole chroma samples for the encoder
    std::lock_guard<std::mutex> g(c->vmu);
    if (!c->vssrc) return true;
    c->pend.resize((size_t)w * ih);   // the one copy: the camera rewrites its image on its own thread, the encoder reads this one
    for (int r = 0; r < ih; r++) memcpy(c->pend.data() + (size_t)r * w, px + (size_t)r * s, (size_t)w * 4);
    c->pw = w; c->ph = ih; c->hasPend = true;
    c->vcv.notify_one();
    return true;
  }
  void watch(int32_t h, uint32_t ssrc, zrt::String user, int32_t width, int32_t height) override {
    Conn* c = at(h);
    if (!c) return;
    std::shared_ptr<Watch> x;
    {
      std::lock_guard<std::mutex> g(c->vmu);
      auto it = c->watches.find(ssrc);
      if (width <= 0 || height <= 0) {
        if (it == c->watches.end()) return;
        x = it->second;
        c->watches.erase(it);
      } else if (it != c->watches.end()) x = it->second;
      else { x = std::make_shared<Watch>(); x->ssrc = ssrc; c->watches[ssrc] = x; }
    }
    std::lock_guard<std::mutex> g(x->m);
    x->user = cstr(user);
    if (width <= 0 || height <= 0) { if (x->img >= 0) zrt::raster::dyn_destroy(x->img); x->img = -1; return; }
    if (x->fitW != width || x->fitH != height) { x->fitW = width; x->fitH = height; x->pliAt = -1e9; x->decoded = 0; }   // a new size from the next key frame, asked now
  }
  int32_t videoImage(int32_t h, uint32_t ssrc) override {
    Conn* c = at(h);
    if (!c) return -1;
    std::shared_ptr<Watch> x;
    { std::lock_guard<std::mutex> g(c->vmu); auto it = c->watches.find(ssrc); if (it == c->watches.end()) return -1; x = it->second; }
    std::lock_guard<std::mutex> g(x->m);
    if (x->fresh) {   // the newest frame becomes the image's buffer; the image's old one goes back to the decoder's side
      x->fresh = false;
      x->ready.swap(x->shown);
      if (x->img < 0 || x->sw != x->rw || x->sh != x->rh) {
        if (x->img >= 0) zrt::raster::dyn_destroy(x->img);
        x->sw = x->rw; x->sh = x->rh;
        x->img = zrt::raster::dyn_wrap(x->sw, x->sh, x->shown.data(), x->sw);
      } else zrt::raster::dyn_update(x->img, x->shown.data(), x->sw);
    }
    return x->img;
  }
  zrt::Array<double> videoStats(int32_t h) override {
    zrt::Array<double> r = zrt::Array<double>::with_cap(5);
    r.a->len = 5;
    Conn* c = at(h);
    for (int i = 0; i < 5; i++) r.a->data[i] = 0;
    if (c) { std::lock_guard<std::mutex> g(c->mu); for (int i = 0; i < 5; i++) r.a->data[i] = c->vstats[i]; }
    return r;
  }
  int32_t daveVersion() override { return daveMaxSupportedProtocolVersion(); }
  zrt::Array<uint8_t> daveInit(int32_t h, int32_t version, zrt::String channelId, zrt::String userId) override {
    Conn* c = at(h);
    if (!c) return arr({});
    std::lock_guard<std::mutex> g(c->mu);
    static bool sink = (daveSetLogSinkCallback(daveLog), true);
    (void)sink;
    c->me = cstr(userId);
    c->roster.clear();
    if (!c->daveEnc) {
      c->daveEnc = daveEncryptorCreate();
      daveEncryptorAssignSsrcToCodec(c->daveEnc, c->ssrc, DAVE_CODEC_OPUS);
      std::lock_guard<std::mutex> v(c->vmu);
      if (c->vssrc) daveEncryptorAssignSsrcToCodec(c->daveEnc, c->vssrc, DAVE_CODEC_H264);
    }
    if (version <= 0) {   // no end-to-end encryption in this call (any more)
      passthrough(c);
      if (c->dave) daveSessionReset(c->dave);
      return arr({});
    }
    if (!c->dave) c->dave = daveSessionCreate(nullptr, "", daveFailed, c);
    daveSessionInit(c->dave, (uint16_t)version, strtoull(cstr(channelId).c_str(), nullptr, 10), c->me.c_str());
    if (c->daveVersion == 0) { c->daveVersion = version; daveEncryptorSetPassthroughMode(c->daveEnc, false); }   // from now on nothing leaves without a key
    uint8_t* kp = nullptr;
    size_t n = 0;
    daveSessionGetMarshalledKeyPackage(c->dave, &kp, &n);
    return arr(taken(kp, n));
  }
  void daveExternalSender(int32_t h, zrt::Array<uint8_t> bytes) override {
    Conn* c = at(h);
    if (!c || !c->dave) return;
    std::lock_guard<std::mutex> g(c->mu);
    const std::vector<uint8_t> b = vec(bytes);
    daveSessionSetExternalSender(c->dave, b.data(), b.size());
  }
  zrt::Array<uint8_t> daveProposals(int32_t h, zrt::Array<uint8_t> bytes, zrt::String recognized) override {
    Conn* c = at(h);
    if (!c || !c->dave) return arr({});
    std::lock_guard<std::mutex> g(c->mu);
    const std::vector<uint8_t> b = vec(bytes);
    const std::vector<std::string> ids = fields(cstr(recognized));
    std::vector<const char*> p;
    for (const std::string& s : ids) p.push_back(s.c_str());
    uint8_t* out = nullptr;
    size_t n = 0;
    daveSessionProcessProposals(c->dave, b.data(), b.size(), p.data(), p.size(), &out, &n);
    return arr(taken(out, n));
  }
  int32_t daveCommit(int32_t h, zrt::Array<uint8_t> bytes) override {
    Conn* c = at(h);
    if (!c || !c->dave) return -1;
    std::lock_guard<std::mutex> g(c->mu);
    const std::vector<uint8_t> b = vec(bytes);
    DAVECommitResultHandle r = daveSessionProcessCommit(c->dave, b.data(), b.size());
    if (!r) return -1;
    const int32_t res = daveCommitResultIsFailed(r) ? -1 : daveCommitResultIsIgnored(r) ? 0 : 1;
    if (res == 1) { uint64_t* ids = nullptr; size_t n = 0; daveCommitResultGetRosterMemberIds(r, &ids, &n); c->roster = rosterOf(ids, n); }
    daveCommitResultDestroy(r);
    return res;
  }
  int32_t daveWelcome(int32_t h, zrt::Array<uint8_t> bytes, zrt::String recognized) override {
    Conn* c = at(h);
    if (!c || !c->dave) return -1;
    std::lock_guard<std::mutex> g(c->mu);
    const std::vector<uint8_t> b = vec(bytes);
    const std::vector<std::string> ids = fields(cstr(recognized));
    std::vector<const char*> p;
    for (const std::string& s : ids) p.push_back(s.c_str());
    DAVEWelcomeResultHandle r = daveSessionProcessWelcome(c->dave, b.data(), b.size(), p.data(), p.size());
    if (!r) return -1;
    uint64_t* rid = nullptr;
    size_t n = 0;
    daveWelcomeResultGetRosterMemberIds(r, &rid, &n);
    c->roster = rosterOf(rid, n);
    daveWelcomeResultDestroy(r);
    return 1;
  }
  void daveExecute(int32_t h, int32_t version) override {
    Conn* c = at(h);
    if (!c || !c->daveEnc) return;
    std::lock_guard<std::mutex> g(c->mu);
    if (version <= 0 || !c->dave) { passthrough(c); return; }
    c->daveVersion = version;
    daveEncryptorSetPassthroughMode(c->daveEnc, false);
    // the key ratchets of the new epoch: ours for the encryptor, each other member's for its decryptor
    std::vector<std::string> who = c->roster;
    if (std::find(who.begin(), who.end(), c->me) == who.end()) who.push_back(c->me);
    for (const std::string& u : who) {
      DAVEKeyRatchetHandle k = daveSessionGetKeyRatchet(c->dave, u.c_str());
      if (!k) continue;
      if (u == c->me) daveEncryptorSetKeyRatchet(c->daveEnc, k);
      else { DAVEDecryptorHandle d = c->decryptor(u); daveDecryptorTransitionToPassthroughMode(d, false); daveDecryptorTransitionToKeyRatchet(d, k); }
      daveKeyRatchetDestroy(k);
    }
  }
  zrt::String daveState(int32_t h) override {
    Conn* c = at(h);
    if (!c) return str("");
    std::lock_guard<std::mutex> g(c->mu);
    const bool keyed = c->daveEnc && daveEncryptorHasKeyRatchet(c->daveEnc);
    const std::string s = std::to_string(c->daveVersion) + FS + (keyed ? "1" : "0") + FS + std::to_string((long long)c->daveStats[0]) + FS +
                          std::to_string((long long)c->daveStats[1]) + FS + c->daveFailure;
    c->daveFailure.clear();
    return str(s);
  }
  zrt::Array<uint8_t> header(int32_t seq, uint32_t timestamp, uint32_t ssrc) override { return arr(rtpHeader((uint16_t)seq, timestamp, ssrc)); }
  zrt::Array<uint8_t> seal(zrt::String mode, zrt::Array<uint8_t> key, zrt::Array<uint8_t> header, uint32_t counter, zrt::Array<uint8_t> payload) override {
    Cipher c;
    if (!c.init(modeOf(cstr(mode)), vec(key))) return arr({});
    const std::vector<uint8_t> h = vec(header), p = vec(payload);
    return arr(c.seal(h.data(), h.size(), counter, p.data(), p.size()));
  }
  zrt::Array<uint8_t> unseal(zrt::String mode, zrt::Array<uint8_t> key, zrt::Array<uint8_t> packet) override {
    Cipher c;
    std::vector<uint8_t> out;
    const std::vector<uint8_t> p = vec(packet);
    if (!c.init(modeOf(cstr(mode)), vec(key)) || !c.open(p.data(), p.size(), out)) return arr({});
    return arr(out);
  }
};

NativeDiscordVoice* zinc_create_DiscordVoice() {
  static HostDiscordVoice inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
