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
// Quality (RFC 3550 6.4): each second a sender report for our streams with a receiver report block per stream we receive (loss, jitter,
// the last sender report's time); the server's reports on ours give their loss, jitter and round trip (report()), and their loss steers
// the video encoder's bitrate (down by half the loss above 10%, up 8% a report under 2%). setLimits() is the ultra low data mode.
#define ZRT_HOSTED_CPP
#include "zinc_native_discordvoice.h"
#define MONOCYPHER_CPP_NAMESPACE zn_voice_monocypher
#include "../../../third_party/monocypher/monocypher.c"
#include "../../audio/vendor/miniaudio.h"
#include "opus.h"
#include "dave/dave.h"
#include "../../webrtc/native/media.h"
#include "video_policy.h"
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
#include <set>
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
const int PT_RTX = 102;                                  // H.264's RTX: resent video packets (NACK)
const int PT_H264 = 101;                                  // what Select Protocol's codecs declare (index.ts); its RTX (102) is not read
const size_t VIDEO_MTU = 1100;                            // payload bytes per video packet
const double PLI_EVERY_MS = 1000;                         // at most one key frame asked per stream and second
const double VAD_LEVEL = 0.01, VAD_HOLD_MS = 300;         // voice activity: above this RMS (the default, setAudio's threshold), and for this long after
const int SILENCE_FRAMES = 5;                             // sent after speech, as the official clients do
const uint8_t SILENCE[3] = {0xF8, 0xFF, 0xFE};
const size_t JITTER_MAX = 8;                              // frames kept per speaker (160 ms); older ones are dropped
const size_t JITTER_START = 2;                            // frames buffered before a speaker is played
const int AUDIO_BPS = 64000;                              // Opus at full quality; setLimits() lowers it
const double RTX_KEEP_MS = 500;                          // how long a sent video packet can be asked for again
const double REPORT_MS = 1000;                            // RTCP sender and receiver reports
const int MIN_VIDEO_BPS = 50000;                          // the loss-based bitrate does not go under this
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
/** The wall clock as NTP: seconds since 1900 and their fraction (sender reports), and its middle 32 bits (the round trip's units, 1/65536 s). */
uint64_t ntpNow() {
  const double t = std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count() + 2208988800.0;
  return (uint64_t)t << 32 | (uint64_t)((t - floor(t)) * 4294967296.0);
}
uint32_t ntpMid(uint64_t ntp) { return (uint32_t)(ntp >> 16); }
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
    if (!rtcp && (p[0] & 0x20) && !out.empty()) {   // padding (RFC 3550 5.1: its last byte counts it), e.g. the official client's probes
      const size_t pad = out.back();
      if (pad > out.size()) return false;
      out.resize(out.size() - pad);
    }
    return true;
  }
};

/** The NAL unit types of an Annex B frame, one bit each (the diagnostic: 1 slice, 5 IDR, 6 SEI, 7 SPS, 8 PPS, 9 AUD). */
std::string nalList(uint32_t m) { std::string s; for (int t = 0; t < 32; t++) if (m >> t & 1) s += (s.empty() ? "" : ",") + std::to_string(t); return s; }
uint32_t nalTypes(const std::vector<uint8_t>& f) {
  uint32_t m = 0;
  for (size_t i = 0; i + 3 < f.size(); i++) if (f[i] == 0 && f[i + 1] == 0 && f[i + 2] == 1) { m |= 1u << (f[i + 3] & 0x1F); i += 2; }
  return m;
}

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
  double keys = 0, openFail = 0, daveFail = 0, decFail = 0;   // the diagnostic (report()): key frames, failures by stage, NAL types seen
  uint32_t nals = 0;
  // the video thread's own
  std::unique_ptr<media::VideoDecoder> dec;
  std::vector<uint32_t> back;
};

/** What we receive of one SSRC (RFC 3550 A.1, A.8): the highest sequence and its wraps, packets, bytes, the interarrival jitter in its
 *  clock's units, and the last sender report it sent (for our report block's LSR and DLSR). */
struct Rx {
  bool init = false, video = false;
  uint16_t maxSeq = 0;
  uint32_t cycles = 0, base = 0, expPrior = 0, recPrior = 0, lsr = 0;
  uint64_t received = 0, bytes = 0;
  int64_t lastTransit = 0;
  double jitter = 0, lsrAt = 0;
  uint32_t extMax() const { return cycles + maxSeq; }
  int64_t lost() const { return std::max<int64_t>(0, (int64_t)extMax() - base + 1 - (int64_t)received); }
  void packet(uint16_t seq, uint32_t ts, size_t n, double now) {
    const int clock = video ? 90000 : RATE;
    const int64_t transit = (int64_t)(now * clock / 1000) - (int64_t)ts;
    if (!init) { init = true; base = seq; maxSeq = seq; lastTransit = transit; }
    else {
      const uint16_t d = (uint16_t)(seq - maxSeq);
      if (d < 3000) { if (seq < maxSeq) cycles += 65536; maxSeq = seq; }
      const int64_t dt = transit - lastTransit;
      lastTransit = transit;
      if (dt > -clock && dt < clock) jitter += ((double)(dt < 0 ? -dt : dt) - jitter) / 16;   // a frame's packets share a timestamp
    }
    received++; bytes += n;
  }
};
/** The server's last report block on one of our streams. */
struct Remote { double fraction = 0, lost = 0, jitter = 0, rtt = -1; bool seen = false; };

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
  std::map<uint32_t, Rx> rx;           // what we receive, by SSRC
  Remote remote[2];                    // the server's reports on our voice and on our video
  double sentBytes[2] = {0, 0};        // payload bytes of our voice and of our video
  int audioBps = AUDIO_BPS;            // setLimits(): the Opus target
  double reportAt = 0;
  // the worker's own
  media::OpusEnc* enc = nullptr;
  int encAudioBps = AUDIO_BPS;
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
  std::set<std::string> roster;         // every member of the group now, kept across epochs (libdave hands out only the change)
  std::string me, daveFailure;
  int daveVersion = 0;
  double daveStats[2] = {0, 0};        // frames that could not be encrypted, frames that could not be decrypted
  double vstats[5] = {0, 0, 0, 0, 0};  // videoStats()
  double nackIn = 0, firIn = 0, rtxSent = 0;   // the diagnostic: feedback asked of us, packets resent
  double keysSent = 0;                 // the diagnostic (report()): our key frames, the NAL types we sent, packets of other payload types
  uint32_t nalsSent = 0;
  std::map<uint32_t, std::pair<int, double>> otherPt;   // SSRC -> its payload type, packets
  // video (under vmu): the streams watched by SSRC, our camera's SSRC and its newest frame; vmu is taken after mu, never before
  std::mutex vmu;
  std::condition_variable vcv;
  std::map<uint32_t, std::shared_ptr<Watch>> watches;
  uint32_t vssrc = 0;
  int vbps = 0, vfps = 30;              // our stream's bitrate and rate (videoSend), 0: from its size
  int capScale = 1, capFps = 0, capBps = 0;   // setLimits(): frames 1/capScale the size, at most capFps a second and capBps
  int adaptBps = 0;                     // the bitrate the server's loss reports allow (0: not lowered yet)
  int curBps = 0, curW = 0, curH = 0;   // what the encoder runs at now (report())
  double sendAt = -1e9;                 // the last frame taken (the rate cap)
  int keyMs = 0;                        // a key frame at least this often (Session Description's keyframe_interval), 0: on PLI only
  double keyAt = -1e9;                  // the video thread's: our last key frame
  std::vector<uint32_t> pend;
  int pw = 0, ph = 0;
  bool hasPend = false, forceKey = false;
  std::thread vth;
  // the video thread's own
  std::unique_ptr<media::VideoEncoder> venc;
  int encBps = 0, encFps = 0;
  uint16_t vseq = 0;
  uint32_t vrtx = 0;                    // our stream's RTX SSRC (0: none), its sequence, and the last ~500 ms of packets for NACK (under mu)
  uint16_t rtxSeq = 0;
  struct Sent { uint16_t seq; uint32_t ts; bool marker; double at; std::vector<uint8_t> body; };
  std::deque<Sent> sentRing;

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
  void resend(uint16_t seq);
  void report(double now);
  int videoCap(int w, int h) const;
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
  if ((p[1] & 0x7f) == PT_H264 || ((p[1] & 0x7f) == PT_OPUS && audio)) {
    Rx& r = rx[be32(p + 8)];
    r.video = (p[1] & 0x7f) == PT_H264;
    r.packet(be16(p + 2), be32(p + 4), n, now);
  }
  if ((p[1] & 0x7f) == PT_H264) { videoPacket(p, n, now); return; }
  if ((p[1] & 0x7f) != PT_OPUS || !audio) {   // RTX (we ask for key frames instead) and the rest, counted for the diagnostic
    auto& o = otherPt[be32(p + 8)];
    o.first = p[1] & 0x7f; o.second++;
    return;
  }
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
  int abps;
  { std::lock_guard<std::mutex> g(mu); m = mute; d = deaf; p = ptt; h = held; gin = inGain; gout = outGain; gate = threshold; abps = audioBps; }
  if (abps != encAudioBps) { media::opusSetBitrate(enc, abps); encAudioBps = abps; }   // 16 kbit/s and under: DTX, voice, wideband, FEC for 15%
  if (frame(pcm)) {
    if (gin != 1) for (float& v : pcm) v = std::max(-1.0f, std::min(1.0f, (float)(v * gin)));
    myLevel = rms(pcm, FRAME * CH);
    { std::lock_guard<std::mutex> g(mu); level = myLevel; }
    if (myLevel > gate) voiceAt = now;
    const bool send = !m && (p ? h : now - voiceAt < VAD_HOLD_MS);
    uint8_t opus[1500];
    int n = 0;
    if (send) { n = media::opusEncode(enc, pcm, opus, sizeof opus); silence = SILENCE_FRAMES; if (n > 0 && n <= 2) n = 0; }   // DTX: a 1-2 byte frame is silence, not sent
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
        sentBytes[0] += (double)frame.size();
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
    if (now - reportAt >= REPORT_MS) { reportAt = now; report(now); }
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
  if (!cipher.open(p, n, pkt)) { stats[2]++; std::lock_guard<std::mutex> g(x->m); x->openFail++; return; }
  pkt.insert(pkt.begin(), p, p + 12);   // the reassembler reads a packet: the fixed header, without the extension (opened above)
  pkt[0] = 0x80;
  { std::lock_guard<std::mutex> g(x->m); x->re.push(pkt.data(), pkt.size(), (int64_t)now); }
  vcv.notify_one();
}
/** RTCP (under mu), each packet of a compound one: a PLI asks us for a key frame; a sender report's time is kept for our report block
 *  on its stream; a report block on one of our streams gives its loss, jitter and round trip, and on our video steers the bitrate. */
void Conn::rtcp(const uint8_t* p, size_t n) {
  std::vector<uint8_t> all;
  if (!cipher.open(p, n, all, true)) return;
  all.insert(all.begin(), p, p + 8);
  const double now = nowMs();
  const uint32_t mid = ntpMid(ntpNow());
  for (size_t at = 0; at + 8 <= all.size();) {
    const uint8_t* q = all.data() + at;
    const size_t len = std::min(all.size() - at, 4 * ((size_t)be16(q + 2) + 1));
    const int count = q[0] & 0x1f;
    at += len;
    if (q[1] == 206 && (count == 1 || count == 4)) {   // PLI, or FIR (RFC 5104): the SFU may relay either
      if (count == 1) vstats[4]++; else firIn++;
      std::lock_guard<std::mutex> g(vmu); forceKey = true; continue;
    }
    if (q[1] == 205 && count == 1 && len >= 16) {   // Generic NACK: PID and a bitmask of the 16 packets after it, resent as RTX
      nackIn++;
      for (size_t f = 12; f + 4 <= len; f += 4) {
        const uint16_t pid = be16(q + f), blp = be16(q + f + 2);
        resend(pid);
        for (int b = 0; b < 16; b++) if (blp >> b & 1) resend((uint16_t)(pid + b + 1));
      }
      continue;
    }
    if (q[1] != 200 && q[1] != 201) continue;
    size_t b = 8;
    if (q[1] == 200) {
      if (len < 28) continue;
      auto it = rx.find(be32(q + 4));
      if (it != rx.end()) { it->second.lsr = be32(q + 10); it->second.lsrAt = now; }
      b = 28;
    }
    for (int k = 0; k < count && b + 24 <= len; k++, b += 24) {
      const uint8_t* r = q + b;
      const uint32_t of = be32(r);
      if (of != ssrc && (of != vssrc || of == 0)) continue;
      const bool video = of != ssrc;
      Remote& x = remote[video ? 1 : 0];
      x.seen = true;
      x.fraction = r[4] / 256.0;
      x.lost = (double)(int32_t)((uint32_t)r[5] << 24 | (uint32_t)r[6] << 16 | (uint32_t)r[7] << 8) / 256;   // 24-bit signed
      x.jitter = be32(r + 12) / (video ? 90000.0 : (double)RATE);
      const uint32_t lsr = be32(r + 16), dlsr = be32(r + 20);
      if (lsr != 0 && (int32_t)(mid - lsr - dlsr) >= 0) x.rtt = (double)(mid - lsr - dlsr) / 65536.0;
      if (!video) continue;
      std::lock_guard<std::mutex> g(vmu);   // the loss-based half of WebRTC's congestion control (GCC)
      const int cap = videoCap(curW, curH), cur = adaptBps > 0 ? std::min(adaptBps, cap) : cap;
      if (x.fraction > 0.10) adaptBps = std::max(MIN_VIDEO_BPS, (int)(cur * (1 - 0.5 * x.fraction)));
      else if (x.fraction < 0.02 && adaptBps > 0) adaptBps = adaptBps * 1.08 >= cap ? 0 : (int)(adaptBps * 1.08);
    }
  }
}
/** One packet of our video again, as RTX (RFC 4588: its own SSRC, type and sequence, the original sequence first in the payload); mu held. */
void Conn::resend(uint16_t seq) {
  if (vrtx == 0) return;
  for (const Sent& s : sentRing) {
    if (s.seq != seq) continue;
    uint8_t hdr[16] = {0x90, (uint8_t)(PT_RTX | (s.marker ? 0x80 : 0)), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xBE, 0xDE, 0, 1};
    hdr[2] = (uint8_t)(rtxSeq >> 8); hdr[3] = (uint8_t)rtxSeq; rtxSeq++;
    put32(hdr + 4, s.ts); put32(hdr + 8, vrtx);
    std::vector<uint8_t> body(s.body.begin(), s.body.begin() + 4);   // the extension element, then the original sequence, then the payload
    body.push_back((uint8_t)(seq >> 8)); body.push_back((uint8_t)seq);
    body.insert(body.end(), s.body.begin() + 4, s.body.end());
    const std::vector<uint8_t> pkt = cipher.seal(hdr, sizeof hdr, counter++, body.data(), body.size());
    rtxSent++;
    sendRaw(pkt.data(), pkt.size());
    return;
  }
}
/** The most our video may use at w x h: videoSend's bitrate (0: from the size), under setLimits()'s cap (under vmu). */
int Conn::videoCap(int w, int h) const {
  const int base = vbps > 0 ? vbps : std::max(300000, std::min(2500000, w * h * 3));   // about 0.1 bit per pixel at 30 fps
  return capBps > 0 ? std::min(base, capBps) : base;
}
/** Each second (the worker, mu taken here): a sender report for our voice (a Go Live connection: for its video, or a receiver report
 *  before it sends) with a report block per stream received since the last one, and a sender report for our video. */
void Conn::report(double now) {
  std::lock_guard<std::mutex> g(mu);
  uint32_t vs;
  { std::lock_guard<std::mutex> v(vmu); vs = vssrc; }
  const uint64_t ntp = ntpNow();
  auto sr = [&](uint32_t from, uint32_t rtpTs, double packets, double bytes, bool blocks, bool rr = false) {
    std::vector<uint8_t> body;
    auto u32 = [&](uint32_t v) { uint8_t b[4]; put32(b, v); body.insert(body.end(), b, b + 4); };
    if (!rr) { u32((uint32_t)(ntp >> 32)); u32((uint32_t)ntp); u32(rtpTs); u32((uint32_t)packets); u32((uint32_t)bytes); }
    int count = 0;
    if (blocks) for (auto& [id, r] : rx) {
      if (count == 31) break;
      const uint32_t expected = r.extMax() - r.base + 1, expInt = expected - r.expPrior, recInt = (uint32_t)r.received - r.recPrior;
      r.expPrior = expected; r.recPrior = (uint32_t)r.received;
      if (recInt == 0) continue;   // not received since the last report
      const int lostInt = (int)expInt - (int)recInt;
      const uint32_t fraction = expInt == 0 || lostInt <= 0 ? 0 : (uint32_t)((lostInt << 8) / (int)expInt);
      const uint32_t lost = (uint32_t)std::min<int64_t>(r.lost(), 0x7fffff);
      u32(id); u32(fraction << 24 | lost); u32(r.extMax()); u32((uint32_t)r.jitter);
      u32(r.lsr); u32(r.lsr != 0 ? (uint32_t)((now - r.lsrAt) / 1000 * 65536) : 0);
      count++;
    }
    uint8_t hdr[8] = {(uint8_t)(0x80 | count), (uint8_t)(rr ? 201 : 200), 0, 0};
    const size_t words = (8 + body.size()) / 4 - 1;
    hdr[2] = (uint8_t)(words >> 8); hdr[3] = (uint8_t)words;
    put32(hdr + 4, from);
    const std::vector<uint8_t> pkt = cipher.seal(hdr, 8, counter++, body.data(), body.size());
    sendRaw(pkt.data(), pkt.size());
  };
  const uint32_t vts = (uint32_t)(int64_t)(now * 90);
  if (audio) sr(ssrc, ts, stats[0], sentBytes[0], true);
  if (vs != 0) sr(vs, vts, vstats[1], sentBytes[1], !audio);
  else if (!audio) sr(ssrc, 0, 0, 0, true, true);   // watching only: a receiver report (we send no media there)
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
  {
    std::lock_guard<std::mutex> v(vmu);
    const int cap = videoCap(w, h);
    bps = adaptBps > 0 ? std::min(adaptBps, cap) : cap;
    fps = capFps > 0 ? std::min(vfps, capFps) : vfps;
    curBps = bps; curW = w; curH = h;
  }
  if (!venc || venc->w != w || venc->h != h || encFps != fps) {
    venc.reset(media::h264Encoder(w, h, bps, fps));
    encBps = bps; encFps = fps;
    key = true;
  } else if (encBps != bps) { venc->setRate(bps, fps); encBps = bps; }   // the loss reports: no new encoder, no key frame
  std::vector<uint8_t> au;
  bool isKey = false;
  int every, capped;
  { std::lock_guard<std::mutex> v(vmu); every = keyMs; capped = capBps; }
  if (keyDue(nowMs(), keyAt, every, capped > 0)) key = true;
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
    if (daveEncryptorEncrypt(daveEnc, DAVE_MEDIA_TYPE_VIDEO, vs, au.data(), au.size(), e.data(), e.size(), &wr) != DAVE_ENCRYPTOR_RESULT_CODE_SUCCESS) {   // no key ratchet yet: the next frame is a key frame again, not a P-frame nobody can start from
      daveStats[0]++;
      std::lock_guard<std::mutex> v(vmu); forceKey = true;
      return;
    }
    e.resize(wr);
    au.swap(e);
  }
  vstats[0]++;
  if (isKey) { keysSent++; keyAt = nowMs(); }
  nalsSent |= nalTypes(au);
  // the NAL units between start codes (00 00 01; the one leading zero of a 4-byte one is not part of the unit before it, as WebRTC's
  // FindNaluIndices splits: a DAVE-encrypted unit may end in zero bytes of its own, and they must reach the receiver)
  std::vector<std::pair<size_t, size_t>> nals;
  size_t start = std::string::npos;
  for (size_t i = 0; i < au.size(); i++) {
    if (!(i + 3 <= au.size() && au[i] == 0 && au[i + 1] == 0 && au[i + 2] == 1)) continue;
    if (start != std::string::npos) { size_t end = i; if (end > start && au[end - 1] == 0) end--; if (end > start) nals.push_back({start, end - start}); }
    start = i + 3;
    i += 2;
  }
  if (start != std::string::npos && start < au.size()) nals.push_back({start, au.size() - start});
  // the header, with the playout-delay extension the clients put on every video packet (one-byte form: id 5 and length-1 = 2, then min
  // and max delay 0 in 12 bits each: 3 bytes, as Discord-video-stream sends it; WebRTC ignores the 2-byte form): its 4-byte header is
  // authenticated, its body travels encrypted with the payload
  uint8_t hdr[16] = {0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xBE, 0xDE, 0, 1};
  put32(hdr + 4, ts); put32(hdr + 8, vs);
  std::vector<uint8_t> body;
  auto packet = [&](const uint8_t* a, size_t an, const uint8_t* b, size_t bn, bool marker) {
    hdr[1] = (uint8_t)(PT_H264 | (marker ? 0x80 : 0));
    hdr[2] = (uint8_t)(vseq >> 8); hdr[3] = (uint8_t)vseq; vseq++;
    body.assign({0x52, 0, 0, 0});
    body.insert(body.end(), a, a + an);
    if (bn) body.insert(body.end(), b, b + bn);
    const std::vector<uint8_t> pkt = cipher.seal(hdr, sizeof hdr, counter++, body.data(), body.size());
    vstats[1]++;
    sentBytes[1] += (double)body.size();
    sentRing.push_back({(uint16_t)(vseq - 1), ts, marker, nowMs(), body});
    while (!sentRing.empty() && nowMs() - sentRing.front().at > RTX_KEEP_MS) sentRing.pop_front();
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
        if (daveDecryptorDecrypt(d, DAVE_MEDIA_TYPE_VIDEO, f.data(), f.size(), plain.data(), plain.size(), &wr) != DAVE_DECRYPTOR_RESULT_CODE_SUCCESS) {
          daveStats[1]++; std::lock_guard<std::mutex> l(x.m); x.daveFail++; continue;
        }
        plain.resize(wr);
        f.swap(plain);
      }
    }
    { std::lock_guard<std::mutex> g(x.m); x.nals |= nalTypes(f); if (key) x.keys++; }
    if (!x.dec) x.dec.reset(media::h264Decoder());
    if (!x.dec) return;   // no H.264 decoder on this system
    x.dec->fit(fw, fh);
    int w = 0, h = 0;
    if (!x.dec->decode(f.data(), f.size(), x.back, w, h)) { std::lock_guard<std::mutex> g(x.m); x.decFail++; continue; }
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
void signatureOf(DAVECommitResultHandle r, uint64_t id, uint8_t** sig, size_t* n) { daveCommitResultGetRosterMemberSignature(r, id, sig, n); }
void signatureOf(DAVEWelcomeResultHandle r, uint64_t id, uint8_t** sig, size_t* n) { daveWelcomeResultGetRosterMemberSignature(r, id, sig, n); }
/** Folds a commit's or a welcome's result into the group's members: libdave gives the change since the last epoch (added members with
 *  a signature, removed ones with none), not the roster, so the members already there must stay (they all need the new epoch's key). */
template <class R> void changeOf(Conn* c, R r, uint64_t* ids, size_t n, bool replace) {
  std::vector<std::string> who;
  std::vector<bool> has;
  for (size_t i = 0; i < n; i++) {
    uint8_t* sig = nullptr;
    size_t sn = 0;
    signatureOf(r, ids[i], &sig, &sn);
    if (sig) daveFree(sig);
    who.push_back(std::to_string(ids[i]));
    has.push_back(sn > 0);
  }
  if (ids) daveFree(ids);
  applyRosterChange(c->roster, who, has, replace);
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
    media::OpusEnc* enc = media::opusEncoder(CH, AUDIO_BPS);   // voice, in-band FEC; setLimits() changes its bitrate (opusSetBitrate)
    if (!enc) { err = "discord-voice: Opus encoder"; return false; }
    c->fake = audio && fakeMic();
    c->audio = audio;
    if (audio) openDevices(c);   // devices first, then the worker uses them
    std::lock_guard<std::mutex> g(c->mu);
    if (c->started) { media::opusFree(enc); err = "discord-voice: already started"; return false; }
    if (!c->cipher.init(m, vec(key))) { media::opusFree(enc); err = "discord-voice: the key must be 32 bytes"; return false; }
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
    media::opusFree(c->enc);
    ::close(c->fd);
    delete c;
    conns[h] = nullptr;
  }
  void videoSend(int32_t h, uint32_t ssrc, uint32_t rtxSsrc, int32_t bitrate, int32_t fps, int32_t keyframeMs) override {
    Conn* c = at(h);
    if (!c) return;
    std::lock_guard<std::mutex> g(c->mu);
    if (ssrc && c->daveEnc) daveEncryptorAssignSsrcToCodec(c->daveEnc, ssrc, DAVE_CODEC_H264);
    std::lock_guard<std::mutex> v(c->vmu);
    c->vrtx = ssrc ? rtxSsrc : 0; c->sentRing.clear();
    c->vssrc = ssrc; c->vbps = bitrate; c->vfps = fps > 0 ? fps : 30; c->keyMs = std::max(0, keyframeMs); c->forceKey = true; c->hasPend = false;
  }
  void keyFrame(int32_t h) override {
    Conn* c = at(h);
    if (!c) return;
    std::lock_guard<std::mutex> v(c->vmu);
    c->forceKey = true;
  }
  bool sendImage(int32_t h, int32_t image) override {
    Conn* c = at(h);
    const uint32_t* px = nullptr;
    int32_t w = 0, ih = 0, s = 0;
    if (!c || !zrt::raster::dyn_view(image, &px, &w, &ih, &s) || !px || w < 16 || ih < 16) return false;
    std::lock_guard<std::mutex> g(c->vmu);
    if (!c->vssrc) return true;
    const double now = nowMs(), fps = c->capFps > 0 ? std::min(c->vfps, c->capFps) : c->vfps;
    if (now - c->sendAt < 900.0 / fps) return true;   // over the rate: this frame is skipped
    c->sendAt = now;
    const int k = std::max(1, std::min(c->capScale, std::min(w, ih) / 16));
    const int ow = (w / k) & ~1, oh = (ih / k) & ~1;   // whole chroma samples for the encoder
    c->pend.resize((size_t)ow * oh);   // the one copy: the camera rewrites its image on its own thread, the encoder reads this one
    if (k == 1) for (int r = 0; r < oh; r++) memcpy(c->pend.data() + (size_t)r * ow, px + (size_t)r * s, (size_t)ow * 4);
    else for (int r = 0; r < oh; r++) for (int x = 0; x < ow; x++) c->pend[(size_t)r * ow + x] = px[(size_t)r * k * s + (size_t)x * k];   // nearest
    c->pw = ow; c->ph = oh; c->hasPend = true;
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
  void setLimits(int32_t h, int32_t audioBps, int32_t videoScale, int32_t videoFps, int32_t videoBps) override {
    Conn* c = at(h);
    if (!c) return;
    std::lock_guard<std::mutex> g(c->mu);
    c->audioBps = audioBps > 0 ? audioBps : AUDIO_BPS;
    std::lock_guard<std::mutex> v(c->vmu);
    c->capScale = std::max(1, videoScale); c->capFps = std::max(0, videoFps); c->capBps = std::max(0, videoBps);
  }
  zrt::String report(int32_t h) override {
    Conn* c = at(h);
    if (!c) return str("");
    std::lock_guard<std::mutex> g(c->mu);
    std::lock_guard<std::mutex> v(c->vmu);
    auto n = [](double x) { char b[32]; snprintf(b, sizeof b, "%.6g", x); return std::string(b); };
    std::string out;
    auto row = [&](std::initializer_list<std::string> f) { if (!out.empty()) out += RS; bool first = true; for (const std::string& x : f) { if (!first) out += FS; out += x; first = false; } };
    if (c->audio) row({"out", "audio", n(c->ssrc), n(c->sentBytes[0]), n(c->stats[0]), n(c->audioBps), "0", "0", "0", "0"});
    if (c->vssrc) row({"out", "video", n(c->vssrc), n(c->sentBytes[1]), n(c->vstats[1]), n(c->curBps), n(c->vstats[0]), n(c->curW), n(c->curH), n(c->vstats[4]),
                       n(c->keysSent), nalList(c->nalsSent), n(c->nackIn), n(c->firIn), n(c->rtxSent)});
    for (int k = 0; k < 2; k++) {
      const Remote& x = c->remote[k];
      if (x.seen && (k == 0 ? c->audio : c->vssrc != 0)) row({"remote", k ? "video" : "audio", n(k ? c->vssrc : c->ssrc), n(x.fraction), n(x.lost), n(x.jitter), n(x.rtt)});
    }
    for (auto& [id, r] : c->rx) {
      double decoded = 0, dropped = 0, keys = 0, openFail = 0, daveFail = 0, decFail = 0;
      uint32_t nals = 0;
      std::string user;
      auto u = c->users.find(id);
      if (u != c->users.end()) user = u->second;
      auto w = c->watches.find(id);
      if (w != c->watches.end()) {
        Watch& x = *w->second;
        std::lock_guard<std::mutex> l(x.m);
        decoded = x.decoded; dropped = (double)x.re.dropped; user = x.user;
        keys = x.keys; openFail = x.openFail; daveFail = x.daveFail; decFail = x.decFail; nals = x.nals;
      }
      row({"in", r.video ? "video" : "audio", n(id), user, n((double)r.bytes), n((double)r.received), n((double)r.lost()), n(r.jitter / (r.video ? 90000.0 : RATE)), n(decoded), n(dropped),
           n(keys), nalList(nals), n(openFail), n(daveFail), n(decFail)});
    }
    for (auto& [id, o] : c->otherPt) row({"other", std::to_string(o.first), n(id), n(o.second)});
    return str(out);
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
    if (res == 1) { uint64_t* ids = nullptr; size_t n = 0; daveCommitResultGetRosterMemberIds(r, &ids, &n); changeOf(c, r, ids, n, false); }
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
    changeOf(c, r, rid, n, true);   // a welcome starts a group: its change is everyone
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
    std::set<std::string> who = c->roster;
    who.insert(c->me);
    for (auto& [u, d] : c->daveDec) who.insert(u);   // decryptors already made: the key ratchet is null for a user who left
    { std::lock_guard<std::mutex> v(c->vmu); c->forceKey = true; }   // our encryptor has a new key: a key frame the viewers can start from
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
    if (!c.init(modeOf(cstr(mode)), vec(key)) || !c.open(p.data(), p.size(), out, p.size() > 1 && p[1] >= 200 && p[1] <= 206)) return arr({});
    return arr(out);
  }
};

NativeDiscordVoice* zinc_create_DiscordVoice() {
  static HostDiscordVoice inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
