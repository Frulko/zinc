// zinc:webrtc for macos and linux: libdatachannel's C API (vendor/libdatachannel/include/rtc/rtc.h). Its callbacks come from its own threads
// (the ICE agent of libjuice, the SCTP thread of usrsctp, its thread pool): each one only appends a record to one queue under a mutex, and
// the program's thread takes them with next(). No callback calls into the engine.
// TLS (DTLS 1.2 with a self-signed ECDSA certificate) is the engine's mbedTLS: the plugin compiles against its headers and its library
// resolves the symbols in the zinc that loads it (or in the program, compiled), so there is one TLS stack in the process.
//
// Media (audio and video tracks): a transceiver is one media section of the SDP, a libdatachannel track (its id is the transceiver's id).
// This file writes the media sections itself (codecs, direction, SSRC, msid) and sets them on the track before each offer or answer, so the
// negotiation is the Web's: setCodecPreferences, directions, removed sections. Once a negotiation ends, the send side gets libdatachannel's
// packetizer of the chosen codec with its RTCP handlers (sender reports, NACK answers, PLI and REMB callbacks) and the receive side its RTCP
// session (receiver reports, PLI, REMB); received RTP comes to this file raw and media.cpp puts the frames together (its reassembly is the
// jitter buffer). Each transceiver has a worker thread that encodes, decodes and sends; the program's thread only copies frames and samples
// in and out (sendImage, sendAudio, remoteFrame, remoteAudio).
#define ZRT_HOSTED_CPP
#include "zinc_native_webrtc.h"
#include "rtc/rtc.h"
#include "media.h"
#include <dlfcn.h>
#include <math.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <random>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <thread>
#include <vector>
extern "C" long long zn_impair_wire_bytes(uint32_t ssrc);   // impair.cpp: the RTP bytes sent on the wire with an SSRC
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // zinc.json "permissions" (src/host/permissions.cpp)

// Runtime images of zinc:gfx (the remote video, the camera's frames): a headless program compiled without the rasterizer has none (-1);
// loaded by zinc, each fallback asks the process for the real function first (as plugins/camera does).
template <class F> static F host_fn(const char* name, F self) { F f = reinterpret_cast<F>(dlsym(RTLD_DEFAULT, name)); return f != self ? f : nullptr; }
namespace zrt { namespace raster {
__attribute__((weak)) int32_t dyn_wrap(int32_t w, int32_t h, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster8dyn_wrapEiiPKji", &dyn_wrap); return f ? f(w, h, px, s) : -1; }
__attribute__((weak)) void dyn_update(int32_t id, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster10dyn_updateEiPKji", &dyn_update); if (f) f(id, px, s); }
__attribute__((weak)) void dyn_destroy(int32_t id) { static auto f = host_fn("_ZN3zrt6raster11dyn_destroyEi", &dyn_destroy); if (f) f(id); }
__attribute__((weak)) bool dyn_view(int32_t id, const uint32_t** px, int32_t* w, int32_t* h, int32_t* s) { static auto f = host_fn("_ZN3zrt6raster8dyn_viewEiPPKjPiS4_S4_", &dyn_view); return f ? f(id, px, w, h, s) : false; }
}}

namespace {
const char FS = '\x1f', RS = '\x1e';
struct Ev { std::string rec; std::vector<uint8_t> bin; };
struct Count { long long bytesSent = 0, bytesReceived = 0, messagesSent = 0, messagesReceived = 0; };
std::mutex mu;                    // guards q, counts and owner, which the callbacks touch
std::deque<Ev> q;
std::map<int, Count> counts;      // by peer connection
std::map<int, int> owner;         // data channel -> its peer connection
std::vector<uint8_t> lastBin;
std::string err;
thread_local std::string lastLog;   // libdatachannel's error message for a call that failed on this thread
std::vector<std::pair<int, std::chrono::steady_clock::time_point>> dying;   // closed connections, deleted a little later (see next())

zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
std::string cstr(const zrt::String& s) { return std::string(s.ptr(), s.bytes()); }
std::string num(long long v) { return std::to_string(v); }
std::string dbl(double v) { char b[40]; snprintf(b, sizeof b, "%.6g", v); return b; }
int64_t nowMs() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
void push(std::string rec, const char* data = nullptr, int size = 0) {
  std::lock_guard<std::mutex> l(mu);
  Ev e;
  e.rec = std::move(rec);
  if (data && size > 0) e.bin.assign((const uint8_t*)data, (const uint8_t*)data + size);
  q.push_back(std::move(e));
}
// The reason of a failed call: what libdatachannel logged for it, else `what`.
bool fail(const std::string& what) {
  err = lastLog.empty() ? what : what + ": " + lastLog;
  lastLog.clear();
  return false;
}
std::vector<std::string> split(const std::string& s, char c) {
  std::vector<std::string> out;
  std::string cur;
  for (char ch : s) if (ch == c) { out.push_back(cur); cur.clear(); } else cur += ch;
  out.push_back(cur);
  return out;
}

// ---- SDP: the media sections of a description, and the ones this file writes
struct Codec { int pt = -1; std::string name; int clock = 0, channels = 0; std::string fmtp; int maxptime = 0; };   // maxptime: the section's a=maxptime (ms, 0: none)
struct Section { std::string kind, mid, direction = "sendrecv", stream, track; bool removed = false; std::vector<Codec> codecs; double bps = 0; };

std::vector<Section> sections(const std::string& sdp) {
  std::vector<Section> out;
  for (std::string line : split(sdp, '\n')) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.compare(0, 2, "m=") == 0) {
      Section s;
      std::vector<std::string> f = split(line.substr(2), ' ');
      s.kind = f[0];
      s.removed = f.size() > 1 && f[1] == "0";
      for (size_t i = 3; i < f.size(); i++) { Codec c; c.pt = atoi(f[i].c_str()); s.codecs.push_back(c); }
      out.push_back(s);
      continue;
    }
    if (out.empty()) continue;
    Section& s = out.back();
    if (line.compare(0, 5, "b=AS:") == 0) { s.bps = atof(line.c_str() + 5) * 1000; continue; }
    if (line.compare(0, 7, "b=TIAS:") == 0) { s.bps = atof(line.c_str() + 7); continue; }
    if (line.compare(0, 2, "a=") != 0) continue;
    const std::string a = line.substr(2);
    auto codec = [&](int pt) -> Codec* { for (Codec& c : s.codecs) if (c.pt == pt) return &c; return nullptr; };
    if (a.compare(0, 4, "mid:") == 0) s.mid = a.substr(4);
    else if (a.compare(0, 8, "maxptime") == 0 && a.size() > 9) { const int mp = atoi(a.c_str() + 9); for (Codec& c : s.codecs) c.maxptime = mp; }
    else if (a == "sendrecv" || a == "sendonly" || a == "recvonly" || a == "inactive") s.direction = a;
    else if (a.compare(0, 5, "msid:") == 0) { std::vector<std::string> f = split(a.substr(5), ' '); s.stream = f[0]; if (f.size() > 1) s.track = f[1]; }
    else if (a.compare(0, 7, "rtpmap:") == 0) {
      const size_t sp = a.find(' ');
      Codec* c = sp == std::string::npos ? nullptr : codec(atoi(a.c_str() + 7));
      if (!c) continue;
      std::vector<std::string> f = split(a.substr(sp + 1), '/');
      c->name = f[0]; c->clock = f.size() > 1 ? atoi(f[1].c_str()) : 0; c->channels = f.size() > 2 ? atoi(f[2].c_str()) : 0;
    } else if (a.compare(0, 5, "fmtp:") == 0) {
      const size_t sp = a.find(' ');
      Codec* c = sp == std::string::npos ? nullptr : codec(atoi(a.c_str() + 5));
      if (c) c->fmtp = a.substr(sp + 1);
    }
  }
  return out;
}
std::string lower(std::string s) { for (char& c : s) c = (char)tolower((unsigned char)c); return s; }
std::string fmtpValue(const std::string& fmtp, const std::string& key) {
  for (std::string kv : split(fmtp, ';')) {
    while (!kv.empty() && kv[0] == ' ') kv.erase(0, 1);
    if (lower(kv.substr(0, key.size() + 1)) == key + "=") return lower(kv.substr(key.size() + 1));
  }
  return "";
}
// The codecs this build takes, by the name of its mimeType: VP8 and Opus always; H.264 constrained baseline with packetization mode 1 when
// the machine encodes and decodes it in hardware (media::h264Available).
bool supported(const Codec& c) {
  const std::string n = lower(c.name);
  if (n == "vp8") return c.clock == 90000;
  if (n == "opus") return c.clock == 48000;
  if (n == "h264") {
    const std::string p = fmtpValue(c.fmtp, "profile-level-id");
    return c.clock == 90000 && media::h264Available() && fmtpValue(c.fmtp, "packetization-mode") == "1" && (p.compare(0, 4, "42e0") == 0 || p.compare(0, 4, "42c0") == 0);
  }
  return false;
}
Codec ours(const std::string& name) {
  Codec c;
  const std::string n = lower(name);
  if (n == "vp8") { c.pt = 96; c.name = "VP8"; c.clock = 90000; }
  else if (n == "h264") { c.pt = 102; c.name = "H264"; c.clock = 90000; c.fmtp = "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"; }
  else if (n == "opus") { c.pt = 111; c.name = "opus"; c.clock = 48000; c.channels = 2; c.fmtp = "minptime=10;useinbandfec=1;x-zinc-dred=1"; }   // x-zinc-dred: this side decodes Opus DRED (other peers ignore the key)
  return c;
}
std::vector<std::string> defaults(bool video) {
  if (!video) return {"opus"};
  if (media::h264Available()) return {"H264", "VP8"};   // the hardware codec first, VP8 for the peers without it
  return {"VP8"};
}
std::string reverse(const std::string& d) { return d == "sendonly" ? "recvonly" : d == "recvonly" ? "sendonly" : d; }
bool sends(const std::string& d) { return d == "sendrecv" || d == "sendonly"; }
bool receives(const std::string& d) { return d == "sendrecv" || d == "recvonly"; }
std::string join(bool send, bool recv) { return send && recv ? "sendrecv" : send ? "sendonly" : recv ? "recvonly" : "inactive"; }

// ---- transceivers
struct Stats {
  // sent
  long long bytesSent = 0, packetsSent = 0, framesEncoded = 0, keyFramesEncoded = 0, pliReceived = 0, encodeUs = 0, samplesSent = 0;
  int sentWidth = 0, sentHeight = 0, targetBitrate = 0, rembBitrate = 0;
  // received
  long long bytesReceived = 0, packetsReceived = 0, framesDecoded = 0, keyFramesDecoded = 0, pliSent = 0, samplesReceived = 0, concealed = 0, framesDropped = 0;
  long long fecSamples = 0, fecPackets = 0, dredSamples = 0;   // audio rebuilt from the in-band FEC and the deep redundancy (not concealed)
  int recvWidth = 0, recvHeight = 0;
  int64_t baseSeq = -1, maxSeq = -1;
  double jitter = 0, transit = 0;
  bool haveTransit = false;
  // the peer's receiver reports on what this side sends
  double rtt = -1, fractionLost = 0, remoteJitter = 0;
  double lossHeld = 0;   // fractionLost held at its peaks: up at once, down by a tenth of the gap per report (the FEC and DRED size)
  long long remoteLost = 0;
  std::deque<int64_t> sentTimes, decodedTimes;   // the last second of frames, for framesPerSecond
};
struct Tx {
  int id = -1, pc = -1;
  bool video = true;
  std::string mid, direction = "sendrecv", current, streams, trackId, cname;
  std::vector<std::string> prefs;             // setCodecPreferences, mimeType names in order; empty: defaults()
  uint32_t ssrc = 0;
  bool stopped = false, remoteSends = false, fire = false;
  std::string remoteStream, remoteTrack;
  Codec send, recv;                           // negotiated (pt -1: none)
  std::map<int, Codec> recvByPt;              // what the peer may send, by payload type
  int chainPt = -2;                           // the payload type the media handlers were set for (-1: receive only)
  double maxBitrate = 0, maxFramerate = 0, scaleDown = 1;
  bool active = true;
  int64_t lastSent = 0;
  std::atomic<bool> wantKey{false};
  std::atomic<int> remb{0};
  // the worker
  std::thread th;
  std::mutex m;
  std::condition_variable cv;
  bool quit = false;
  std::vector<uint32_t> pend;                 // the newest frame to send
  int pw = 0, ph = 0;
  int64_t pms = 0;
  bool hasPend = false;
  std::vector<float> pcm;                     // samples to send, 48 kHz mono
  struct In { std::vector<uint8_t> p; int64_t at; };
  std::deque<In> rtp;                         // received packets
  // results, for the program's thread
  std::vector<uint32_t> frame, shown;
  int fw = 0, fh = 0, sw = 0, sh = 0, frames = 0, shownIndex = -1, img = -1;
  std::vector<float> audio;
  Stats st;
};
std::mutex txMu;   // guards txs (the callbacks look transceivers up)
std::map<int, std::shared_ptr<Tx>> txs;
struct Pc { bool remoteOffer = false; std::string cname; std::map<std::string, int> pending; };   // pending: remote mid -> track id from onTrack
std::map<int, Pc> pcInfo;   // guarded by txMu
std::mt19937 rng{std::random_device{}()};

std::shared_ptr<Tx> txOf(int id) {
  std::lock_guard<std::mutex> l(txMu);
  auto it = txs.find(id);
  return it == txs.end() ? nullptr : it->second;
}
std::vector<std::shared_ptr<Tx>> txsOf(int pc) {
  std::vector<std::shared_ptr<Tx>> out;
  std::lock_guard<std::mutex> l(txMu);
  for (auto& kv : txs) if (kv.second->pc == pc) out.push_back(kv.second);
  return out;
}

// A media section for this transceiver: the codecs of its preferences the peer has (an answer: in the offer's payload types; an offer
// again: the ones the last negotiation used), its direction and, when it sends, its SSRC and msid.
std::string describe(Tx& t, const Section* remote, bool answer) {
  std::vector<Codec> cs;
  for (const std::string& name : t.prefs.empty() ? defaults(t.video) : t.prefs) {
    Codec c = ours(name);
    if (c.pt < 0) continue;
    if (remote)
      for (const Codec& r : remote->codecs)
        if (lower(r.name) == lower(c.name) && supported(r)) { c.pt = r.pt; if (lower(c.name) == "h264") c.fmtp = r.fmtp; break; }
    if (answer) {
      bool there = false;
      for (const Codec& r : remote->codecs) there = there || (r.pt == c.pt && lower(r.name) == lower(c.name));
      if (!there) continue;
    }
    bool dup = false;
    for (const Codec& x : cs) dup = dup || x.pt == c.pt;
    if (!dup) cs.push_back(c);
  }
  std::string dir = t.direction;
  if (answer) dir = join(sends(t.direction) && receives(remote->direction), receives(t.direction) && sends(remote->direction));
  const bool removed = t.stopped || cs.empty() || (answer && remote->removed);
  if (cs.empty()) cs.push_back(ours(t.video ? "VP8" : "opus"));   // a removed section still names a format
  std::string s = std::string("m=") + (t.video ? "video" : "audio") + (removed ? " 0" : " 9") + " UDP/TLS/RTP/SAVPF";
  for (const Codec& c : cs) s += " " + num(c.pt);
  s += "\r\nc=IN IP4 0.0.0.0\r\na=mid:" + t.mid + "\r\na=" + (removed ? "inactive" : dir) + "\r\na=rtcp-mux\r\na=rtcp-rsize\r\n";
  for (const Codec& c : cs) {
    s += "a=rtpmap:" + num(c.pt) + " " + c.name + "/" + num(c.clock) + (c.channels ? "/" + num(c.channels) : "") + "\r\n";
    if (!c.fmtp.empty()) s += "a=fmtp:" + num(c.pt) + " " + c.fmtp + "\r\n";
    if (t.video) s += "a=rtcp-fb:" + num(c.pt) + " nack\r\na=rtcp-fb:" + num(c.pt) + " nack pli\r\na=rtcp-fb:" + num(c.pt) + " goog-remb\r\n";
  }
  if (!removed && sends(dir)) {
    const std::string stream = t.streams.empty() ? "-" : split(t.streams, ',')[0], track = t.trackId.empty() ? "-" : t.trackId;
    s += "a=ssrc:" + num(t.ssrc) + " cname:" + t.cname + "\r\na=ssrc:" + num(t.ssrc) + " msid:" + stream + " " + track + "\r\na=msid:" + stream + " " + track + "\r\n";
  }
  return s;
}
const Section* find(const std::vector<Section>& ss, const std::string& mid) {
  for (const Section& s : ss) if (s.mid == mid) return &s;
  return nullptr;
}
std::string description(int pc, bool remote) {
  auto fetch = [&](auto f) {
    int n = f(nullptr, 0);
    for (int tries = 0; n > 0 && tries < 4; tries++) {
      std::string s((size_t)n + 4096, '\0');
      const int r = f(&s[0], (int)s.size());
      if (r == RTC_ERR_TOO_SMALL) { n = (int)s.size() * 2; continue; }
      if (r < 0) return std::string();
      s.resize(strlen(s.c_str()));
      return s;
    }
    return std::string();
  };
  return remote ? fetch([&](char* b, int n) { return rtcGetRemoteDescription(pc, b, n); }) : fetch([&](char* b, int n) { return rtcGetLocalDescription(pc, b, n); });
}
// Before an offer or an answer: every transceiver's section set on its track (rtcAddTrack with an existing mid replaces its description).
// ponytail: each call gives the same track a new id that libdatachannel keeps until the connection is deleted (a few per negotiation).
void syncTracks(int pc) {
  bool answer;
  { std::lock_guard<std::mutex> l(txMu); answer = pcInfo[pc].remoteOffer; }
  const std::vector<Section> remote = sections(description(pc, true));
  for (auto& t : txsOf(pc)) {
    const Section* r = find(remote, t->mid);
    if (answer && !r) continue;   // a section of ours the offer does not have yet: in our next offer
    std::string d = describe(*t, r, answer && r);
    rtcAddTrack(pc, d.c_str());
  }
}

// The description the program gives setLocalDescription, edited or not ("SDP munging"): libdatachannel only takes its type, so what an
// edit changes in a media section against the one this file would write becomes the transceiver's: the codecs kept and their order, the
// direction, a bandwidth line (maxBitrate).
void munged(int pc, const std::string& sdp) {
  if (sdp.empty()) return;
  bool answer;
  { std::lock_guard<std::mutex> l(txMu); answer = pcInfo[pc].remoteOffer; }
  const std::vector<Section> given = sections(sdp), remote = sections(description(pc, true));
  for (auto& t : txsOf(pc)) {
    const Section* g = find(given, t->mid);
    if (!g || g->removed) continue;
    const Section* r = find(remote, t->mid);
    const std::vector<Section> mine = sections(describe(*t, r, answer && r));
    if (mine.empty()) continue;
    std::vector<std::string> names, ours;
    for (const Codec& c : g->codecs) if (supported(c)) names.push_back(c.name);
    for (const Codec& c : mine[0].codecs) ours.push_back(c.name);
    if (!names.empty() && names != ours) t->prefs = names;
    if (g->direction != mine[0].direction) t->direction = g->direction;
    if (g->bps > 0) t->maxBitrate = g->bps;
  }
}

// ---- the callbacks of a transceiver's track, on libdatachannel's threads
void RTC_API onTrackMessage(int tr, const char* msg, int size, void*) {
  if (size < 12) return;
  const uint8_t* p = (const uint8_t*)msg;
  const int pt = p[1] & 0x7F;
  if (pt >= 64 && pt <= 95) return;   // RTCP (RFC 5761): the session and the interceptor read it
  auto t = txOf(tr);
  if (!t) return;
  std::lock_guard<std::mutex> l(t->m);
  if (t->rtp.size() > 2000) t->rtp.pop_front();   // a worker that cannot keep up loses the oldest
  t->rtp.push_back({std::vector<uint8_t>(p, p + size), nowMs()});
  t->cv.notify_one();
}
void RTC_API onPli(int tr, void*) {
  if (auto t = txOf(tr)) { t->wantKey = true; std::lock_guard<std::mutex> l(t->m); t->st.pliReceived++; }
}
void RTC_API onRemb(int tr, unsigned int bitrate, void*) { if (auto t = txOf(tr)) t->remb = (int)bitrate; }
// Every incoming RTP and RTCP packet of a connection, decrypted, before the tracks: the receiver reports of the peer (RR or SR report
// blocks) give the round trip time, the loss and the jitter of what this side sends.
// The return value is a copy, never `msg`: libdatachannel's MediaInterceptor (capi.cpp at the pinned commit) moves a message it is given
// back out of its list and never puts the list back, so the tracks would get a null message; a copy leaves the original where it was.
// ponytail: one copy per packet (a few hundred a second); return `msg` once the interceptor swaps its result in.
void* RTC_API onIntercept(int pc, const char* msg, int size, void*) {
  void* copy = rtcCreateOpaqueMessage((void*)msg, size);
  const uint8_t* p = (const uint8_t*)msg;
  if (size < 8 || (p[0] >> 6) != 2 || p[1] < 200 || p[1] > 206) return copy;
  const uint64_t ntp = (uint64_t)((std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count() + 2208988800.0) * 4294967296.0);
  const uint32_t now = (uint32_t)(ntp >> 16);
  for (int o = 0; o + 8 <= size;) {
    const uint8_t* h = p + o;
    const int len = ((h[2] << 8 | h[3]) + 1) * 4, rc = h[0] & 31;
    if (o + len > size) break;
    const int first = h[1] == 201 ? 8 : h[1] == 200 ? 28 : -1;
    for (int b = 0; first > 0 && b < rc && first + (b + 1) * 24 <= len; b++) {
      const uint8_t* r = h + first + b * 24;
      const uint32_t ssrc = (uint32_t)r[0] << 24 | r[1] << 16 | r[2] << 8 | r[3];
      const uint32_t lsr = (uint32_t)r[16] << 24 | r[17] << 16 | r[18] << 8 | r[19], dlsr = (uint32_t)r[20] << 24 | r[21] << 16 | r[22] << 8 | r[23];
      for (auto& t : txsOf(pc)) {
        if (t->ssrc != ssrc) continue;
        std::lock_guard<std::mutex> l(t->m);
        t->st.fractionLost = r[4] / 256.0;
        t->st.lossHeld = t->st.fractionLost > t->st.lossHeld ? t->st.fractionLost : t->st.lossHeld + (t->st.fractionLost - t->st.lossHeld) / 10;
        t->st.remoteLost = (r[5] << 16 | r[6] << 8 | r[7]);
        const uint32_t jit = (uint32_t)r[12] << 24 | r[13] << 16 | r[14] << 8 | r[15];
        t->st.remoteJitter = t->send.clock > 0 ? jit / (double)t->send.clock : 0;
        if (lsr != 0) { const uint32_t d = now - lsr - dlsr; if (d < 0x7FFFFFFF) t->st.rtt = d / 65536.0; }
      }
    }
    o += len;
  }
  return copy;
}

// ---- the worker of a transceiver: encode and send, receive and decode
void sendFrame(Tx& t, const std::vector<uint8_t>& data, uint32_t ts) {
  rtcSetTrackRtpTimestamp(t.id, ts);
  rtcSendMessage(t.id, (const char*)data.data(), (int)data.size());
}
int videoBitrate(Tx& t, int w, int h, int fps) {
  int bps = (int)((double)w * h * fps / 10);   // 640x480 at 30 fps: about 920 kbit/s
  if (bps < 150000) bps = 150000;
  if (bps > 2500000) bps = 2500000;
  if (t.maxBitrate > 0 && bps > t.maxBitrate) bps = (int)t.maxBitrate;
  const int r = t.remb;
  if (r > 0 && bps > r) bps = r < 50000 ? 50000 : r;
  return bps;
}
// The audio of `lost` packets missing before `frame` (each as long as it), into t.audio: the last packet from the in-band FEC of this one,
// the earlier ones from its deep redundancy (DRED) as far back as it reaches, the rest concealed (deep PLC). Called with t.m held.
const int kDredMs = 200;   // the past each packet carries for a Zinc peer: a burst of 3 packets of 60 ms
void recoverAudio(Tx& t, media::OpusDec* adec, const std::vector<uint8_t>& frame, int lost, float* buf) {
  int dur = media::opusSamples(frame.data(), (int)frame.size());
  if (dur <= 0 || dur > 5760) dur = 960;
  const int gap = lost * dur;
  const bool fec = media::opusHasFec(frame.data(), (int)frame.size());
  const int dred = gap > dur || !fec ? media::opusDredParse(adec, frame.data(), (int)frame.size(), gap) : 0;
  for (int pos = 0; pos < gap;) {
    const int left = gap - pos;   // samples between here and the packet: the DRED offset
    int n;
    if (left <= dur && fec) {   // the packet just before this one: its LBRR copy rides in this packet
      n = media::opusDecode(adec, frame.data(), (int)frame.size(), buf, left, true);
      if (n > 0) { t.st.fecSamples += n; t.st.fecPackets++; }
    } else {
      const int room = fec ? left - dur : left, c = room < 960 ? room : 960;   // up to the FEC part, by 20 ms
      if (dred >= left) { n = media::opusDredDecode(adec, left, buf, c); if (n > 0) t.st.dredSamples += n; }
      else { n = media::opusDecode(adec, nullptr, 0, buf, c); if (n > 0) t.st.concealed += n; }
    }
    if (n <= 0) break;
    t.audio.insert(t.audio.end(), buf, buf + n);
    pos += n;
  }
}
void work(std::shared_ptr<Tx> tp) {
  Tx& t = *tp;
  std::unique_ptr<media::VideoEncoder> enc;
  std::unique_ptr<media::VideoDecoder> dec;
  std::unique_ptr<media::Reassembler> rs;
  media::OpusEnc* aenc = nullptr;
  int aencBps = 0, aencLoss = -1;
  bool aencDred = false;
  media::OpusDec* adec = nullptr;
  std::string encName;
  int decPt = -1;
  int64_t firstMs = -1, lastKeyAsk = 0;
  uint32_t ts0 = (uint32_t)rng(), audioTs = ts0;
  std::vector<uint32_t> px, scaled, out;
  std::vector<float> pcm;
  std::vector<uint8_t> bytes, frame;
  std::deque<Tx::In> in;
  for (;;) {
    bool havePx = false;
    int w = 0, h = 0;
    int64_t ms = 0;
    Codec sendC, recvC;
    std::map<int, Codec> byPt;
    {
      std::unique_lock<std::mutex> l(t.m);
      t.cv.wait_for(l, std::chrono::milliseconds(20), [&] { return t.quit || t.hasPend || t.pcm.size() >= 960 || !t.rtp.empty(); });
      if (t.quit) break;
      if (t.hasPend) { px.swap(t.pend); w = t.pw; h = t.ph; ms = t.pms; t.hasPend = false; havePx = true; }
      if (t.pcm.size() >= 960) { pcm.insert(pcm.end(), t.pcm.begin(), t.pcm.end()); t.pcm.clear(); }
      in.swap(t.rtp);
      sendC = t.send; recvC = t.recv; byPt = t.recvByPt;
    }
    // video out
    if (havePx && t.video && sendC.pt >= 0) {
      int ow = w, oh = h;
      const uint32_t* src = px.data();
      if (t.scaleDown > 1) {
        ow = (int)(w / t.scaleDown) & ~1; oh = (int)(h / t.scaleDown) & ~1;
        if (ow < 16) ow = 16;
        if (oh < 16) oh = 16;
        scaled.resize((size_t)ow * oh);
        media::scale(px.data(), w, h, scaled.data(), ow, oh);
        src = scaled.data();
      }
      const int fps = t.maxFramerate > 0 ? (int)t.maxFramerate : 30;
      const int bps = videoBitrate(t, ow, oh, fps);
      if (!enc || enc->w != ow || enc->h != oh || encName != sendC.name) {
        enc.reset(lower(sendC.name) == "h264" ? media::h264Encoder(ow, oh, bps, fps) : media::vp8Encoder(ow, oh, bps, fps));
        encName = sendC.name;
      }
      if (enc) {
        enc->setRate(bps, fps);
        bool key = false;
        if (firstMs < 0) firstMs = ms;
        const auto t0 = std::chrono::steady_clock::now();
        if (enc->encode(src, ow, oh, ms - firstMs, t.wantKey.exchange(false), bytes, key)) {
          const long long us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - t0).count();
          sendFrame(t, bytes, ts0 + (uint32_t)((ms - firstMs) * 90));
          std::lock_guard<std::mutex> l(t.m);
          t.st.framesEncoded++; t.st.encodeUs += us;
          if (key) t.st.keyFramesEncoded++;
          t.st.bytesSent += (long long)bytes.size();
          t.st.packetsSent += ((long long)bytes.size() + 1199) / 1200;   // ponytail: the packetizer's count, approximated by its 1200-byte fragments
          t.st.sentWidth = ow; t.st.sentHeight = oh; t.st.targetBitrate = bps; t.st.rembBitrate = t.remb;
          const int64_t now = nowMs();
          t.st.sentTimes.push_back(now);
          while (!t.st.sentTimes.empty() && now - t.st.sentTimes.front() > 1000) t.st.sentTimes.pop_front();
        }
      }
    }
    // audio out: Opus in packets of 20 ms, or 40 and 60 ms on a thin link, where the 58 bytes of headers per packet (IPv4, UDP, RTP, SRTP)
    // cost more than the voice: at 10 kbit/s, 23 kbit/s of headers at 20 ms and 8 at 60 (docs/reports/webrtc-selfhost-design.md 6.1)
    if (!t.video && sendC.pt >= 0 && pcm.size() >= 960) {
      const int bps = t.maxBitrate > 0 ? (int)t.maxBitrate : 32000;   // setParameters' maxBitrate, live (the low data mode: 6 to 16 kbit/s)
      int ptime = bps <= 16000 ? 60 : bps <= 24000 ? 40 : 20;
      if (sendC.maxptime >= 20 && ptime > sendC.maxptime) ptime = sendC.maxptime / 20 * 20;   // the peer's a=maxptime
      const int frameN = ptime * 48;
      if (!aenc) aenc = media::opusEncoder(1, bps);
      else if (bps != aencBps) media::opusSetBitrate(aenc, bps);
      aencBps = bps;
      if (aenc) {
        int lossPct;
        { std::lock_guard<std::mutex> l(t.m); lossPct = (int)(t.st.lossHeld * 100 + 0.5); }
        if (lossPct < 2) lossPct = 2;   // the FEC follows the loss the peer reports, a little of it always (the first loss is covered)
        if (lossPct != aencLoss) { media::opusSetLoss(aenc, lossPct); aencLoss = lossPct; }
        static const bool noDred = getenv("ZINC_WEBRTC_DRED") && !strcmp(getenv("ZINC_WEBRTC_DRED"), "0");   // off, to measure without it
        const bool dred = !noDred && fmtpValue(sendC.fmtp, "x-zinc-dred") == "1";   // a Zinc peer decodes the deep redundancy; others would only pay for it
        if (dred != aencDred) { aencDred = dred; media::opusSetDred(aenc, dred ? kDredMs : 0); }
      }
      size_t at = 0;
      for (; aenc && at + frameN <= pcm.size(); at += frameN) {
        bytes.resize(1500);
        const int n = media::opusEncode(aenc, pcm.data() + at, bytes.data(), (int)bytes.size(), frameN);
        if (n > 2 || (n > 0 && bps > 16000)) {   // 1 or 2 bytes under DTX: a frame of silence, not sent (as browsers do); the timestamp moves on
          bytes.resize((size_t)n);
          sendFrame(t, bytes, audioTs);
          std::lock_guard<std::mutex> l(t.m);
          t.st.bytesSent += n; t.st.packetsSent++; t.st.samplesSent += frameN; t.st.targetBitrate = bps;
        }
        audioTs += frameN;
      }
      pcm.erase(pcm.begin(), pcm.begin() + (long)(aenc ? at : pcm.size()));
    } else if (sendC.pt < 0) pcm.clear();
    // in: the packets of the peer, put together and decoded
    for (Tx::In& k : in) {
      const uint8_t* p = k.p.data();
      const int pt = p[1] & 0x7F;
      auto c = byPt.find(pt);
      if (c == byPt.end()) continue;
      if (pt != decPt) {   // the first packet, or the peer changed codecs
        const std::string n = lower(c->second.name);
        rs.reset(new media::Reassembler(n == "vp8" ? media::Reassembler::VP8 : n == "h264" ? media::Reassembler::H264 : media::Reassembler::OPUS));
        dec.reset(n == "vp8" ? media::vp8Decoder() : n == "h264" ? media::h264Decoder() : nullptr);
        if (!t.video && !adec) adec = media::opusDecoder();
        decPt = pt;
        std::lock_guard<std::mutex> l(t.m);
        t.recv = c->second;
      }
      size_t hl = 12 + 4 * (p[0] & 15);
      if ((p[0] & 0x10) && k.p.size() >= hl + 4) hl += 4 + 4 * (size_t)((p[hl + 2] << 8) | p[hl + 3]);
      rs->push(p, k.p.size(), k.at);
      std::lock_guard<std::mutex> l(t.m);
      Stats& s = t.st;
      const uint16_t seq = (uint16_t)(p[2] << 8 | p[3]);
      const int64_t ext = s.maxSeq < 0 ? seq : s.maxSeq + (int16_t)(uint16_t)(seq - (uint16_t)s.maxSeq);
      if (s.maxSeq >= 0 && (ext - s.maxSeq > 3000 || ext - s.maxSeq < -3000)) {   // new sequence numbers (a new codec): the count goes on from them
        const int64_t delta = ext - (s.maxSeq + 1);
        s.baseSeq += delta; s.maxSeq += delta; s.haveTransit = false;
      }
      if (s.baseSeq < 0 || ext < s.baseSeq) s.baseSeq = ext;
      if (ext > s.maxSeq) s.maxSeq = ext;
      s.packetsReceived++;
      s.bytesReceived += k.p.size() > hl ? (long long)(k.p.size() - hl) : 0;
      const uint32_t ts = (uint32_t)p[4] << 24 | p[5] << 16 | p[6] << 8 | p[7];
      const double transit = k.at * (c->second.clock / 1000.0) - ts;   // RFC 3550 A.8, in clock units
      if (s.haveTransit) { double d = fabs(transit - s.transit); if (d < c->second.clock * 10) s.jitter += (d - s.jitter) / 16; }
      s.transit = transit; s.haveTransit = true;
    }
    in.clear();
    if (rs) {
      const int64_t now = nowMs();
      int lost = 0;
      bool key = false;
      while (rs->pop(frame, now, lost, key)) {
        if (t.video && dec) {
          int fw = 0, fh = 0;
          if (!dec->decode(frame.data(), frame.size(), out, fw, fh)) { t.wantKey = false; std::lock_guard<std::mutex> l(t.m); t.st.framesDropped++; continue; }
          std::lock_guard<std::mutex> l(t.m);
          t.frame.swap(out); t.fw = fw; t.fh = fh; t.frames++;
          t.st.framesDecoded++; if (key) t.st.keyFramesDecoded++;
          t.st.recvWidth = fw; t.st.recvHeight = fh;
          t.st.decodedTimes.push_back(now);
          while (!t.st.decodedTimes.empty() && now - t.st.decodedTimes.front() > 1000) t.st.decodedTimes.pop_front();
        } else if (!t.video && adec) {
          float buf[5760];
          std::lock_guard<std::mutex> l(t.m);
          if (lost > 0) recoverAudio(t, adec, frame, lost, buf);
          const int n = media::opusDecode(adec, frame.data(), (int)frame.size(), buf, 5760);
          if (n > 0) { t.audio.insert(t.audio.end(), buf, buf + n); t.st.samplesReceived += n; }
          if (t.audio.size() > 48000) t.audio.erase(t.audio.begin(), t.audio.begin() + (long)(t.audio.size() - 48000));   // a second at most
        }
      }
      if (t.video) { std::lock_guard<std::mutex> l(t.m); t.st.framesDropped += rs->dropped; rs->dropped = 0; }
      if (rs->needKey() && now - lastKeyAsk > 300) {
        lastKeyAsk = now;
        rtcRequestKeyframe(t.id);
        std::lock_guard<std::mutex> l(t.m);
        t.st.pliSent++;
      }
    }
  }
  media::opusFree(aenc);
  media::opusFree(adec);
}

std::shared_ptr<Tx> makeTx(int pc, int tr, bool video, const std::string& mid) {
  auto t = std::make_shared<Tx>();
  t->id = tr; t->pc = pc; t->video = video; t->mid = mid;
  t->ssrc = (uint32_t)rng() | 1;
  {
    std::lock_guard<std::mutex> l(txMu);
    t->cname = pcInfo[pc].cname;
    txs[tr] = t;
  }
  rtcSetMessageCallback(tr, onTrackMessage);
  t->th = std::thread(work, t);
  return t;
}
void endTx(const std::shared_ptr<Tx>& t) {
  { std::lock_guard<std::mutex> l(t->m); t->quit = true; }
  t->cv.notify_one();
  if (t->th.joinable()) t->th.join();
  if (t->img >= 0) zrt::raster::dyn_destroy(t->img);
  std::lock_guard<std::mutex> l(txMu);
  txs.erase(t->id);
}

// After a negotiation (stable again): what each transceiver sends and receives, and the media handlers of its track for that.
void negotiated(int pc) {
  const std::vector<Section> local = sections(description(pc, false)), remote = sections(description(pc, true));
  for (auto& t : txsOf(pc)) {
    const Section* l = find(local, t->mid);
    const Section* r = find(remote, t->mid);
    if (!l || !r) continue;
    const bool removed = l->removed || r->removed;
    Codec send, none;
    std::map<int, Codec> byPt;
    if (!removed) {
      for (const Codec& c : r->codecs) {   // we send the first codec of the peer's order that both sides have
        if (send.pt >= 0 || !supported(c)) continue;
        for (const Codec& k : l->codecs) if (k.pt == c.pt && lower(k.name) == lower(c.name)) { send = c; break; }
      }
      for (const Codec& c : l->codecs) if (supported(c)) byPt[c.pt] = c;   // the peer sends in our payload types
    }
    {
      std::lock_guard<std::mutex> g(t->m);
      t->current = removed ? "inactive" : l->direction;
      t->send = !removed && sends(l->direction) ? send : none;
      t->recvByPt = byPt;
      if (t->send.pt < 0) t->pend.clear(), t->hasPend = false;
    }
    if (removed) t->stopped = true;
    const int want = t->send.pt >= 0 ? t->send.pt : -1;
    if (removed || want == t->chainPt) continue;
    if (want < 0) {   // receive only: the RTCP session alone, once; a track that sent keeps its handlers (and its sequence numbers) for later
      if (t->chainPt == -2) { rtcChainRtcpReceivingSession(t->id); t->chainPt = -1; }
      continue;
    }
    t->chainPt = want;
    {
      rtcPacketizerInit init;
      memset(&init, 0, sizeof init);
      init.ssrc = t->ssrc; init.cname = t->cname.c_str(); init.payloadType = (uint8_t)t->send.pt; init.clockRate = (uint32_t)t->send.clock;
      init.sequenceNumber = (uint16_t)rng(); init.timestamp = (uint32_t)rng(); init.maxFragmentSize = 1200;
      init.nalSeparator = RTC_NAL_SEPARATOR_LENGTH;
      const std::string n = lower(t->send.name);
      if (n == "h264") rtcSetH264Packetizer(t->id, &init);
      else if (n == "vp8") rtcSetVP8Packetizer(t->id, &init);
      else rtcSetOpusPacketizer(t->id, &init);
      rtcChainRtcpReceivingSession(t->id);   // processed last on the way in: it takes the RTCP the handlers below read first
      rtcChainRtcpSrReporter(t->id);
      rtcChainRtcpNackResponder(t->id, 512);
      if (t->video) { rtcChainPliHandler(t->id, onPli); rtcChainRembHandler(t->id, onRemb); }
    }
  }
}
std::string kindOf(const std::vector<Section>& ss, const std::string& mid) { const Section* s = find(ss, mid); return s ? s->kind : ""; }

void RTC_API onLog(rtcLogLevel level, const char* message) {
  if (level <= RTC_LOG_ERROR) lastLog = message;
  static const char* show = getenv("ZINC_WEBRTC_LOG");
  if (show && *show) fprintf(stderr, "webrtc: %s\n", message);
}
void RTC_API onCandidate(int pc, const char* cand, const char* mid, void*) { push(std::string("cand") + FS + num(pc) + FS + (mid ? mid : "") + FS + cand); }
void RTC_API onState(int pc, rtcState s, void*) { push(std::string("state") + FS + num(pc) + FS + num(s)); }
void RTC_API onIce(int pc, rtcIceState s, void*) { push(std::string("ice") + FS + num(pc) + FS + num(s)); }
void RTC_API onGather(int pc, rtcGatheringState s, void*) { push(std::string("gather") + FS + num(pc) + FS + num(s)); }
void RTC_API onSignal(int pc, rtcSignalingState s, void*) { push(std::string("signal") + FS + num(pc) + FS + num(s)); }
void RTC_API onOpen(int dc, void*) { push(std::string("open") + FS + num(dc)); }
void RTC_API onClosed(int dc, void*) { push(std::string("close") + FS + num(dc)); }
void RTC_API onError(int dc, const char* e, void*) { push(std::string("error") + FS + num(dc) + FS + (e ? e : "")); }
void RTC_API onLow(int dc, void*) { push(std::string("low") + FS + num(dc)); }
void RTC_API onMessage(int dc, const char* msg, int size, void*) {
  std::lock_guard<std::mutex> l(mu);
  auto o = owner.find(dc);
  Count* c = o == owner.end() ? nullptr : &counts[o->second];
  Ev e;
  if (size < 0) { e.rec = std::string("text") + FS + num(dc) + FS + msg; if (c) c->bytesReceived += (long long)strlen(msg); }
  else { e.rec = std::string("binary") + FS + num(dc); e.bin.assign((const uint8_t*)msg, (const uint8_t*)msg + size); if (c) c->bytesReceived += size; }
  if (c) c->messagesReceived++;
  q.push_back(std::move(e));
}
// A track of the peer's offer (during setRemoteDescription): kept by its mid until setRemoteDescription makes it a transceiver.
void RTC_API onTrack(int pc, int tr, void*) {
  char mid[256] = "";
  rtcGetTrackMid(tr, mid, sizeof mid);
  rtcSetMessageCallback(tr, onTrackMessage);
  std::lock_guard<std::mutex> l(txMu);
  pcInfo[pc].pending[mid] = tr;
}
void watch(int dc, int pc) {
  { std::lock_guard<std::mutex> l(mu); owner[dc] = pc; }
  rtcSetOpenCallback(dc, onOpen);
  rtcSetClosedCallback(dc, onClosed);
  rtcSetErrorCallback(dc, onError);
  rtcSetMessageCallback(dc, onMessage);
  rtcSetBufferedAmountLowCallback(dc, onLow);
}
void RTC_API onChannel(int pc, int dc, void*) {
  watch(dc, pc);
  push(std::string("channel") + FS + num(pc) + FS + num(dc));
}
// A string a C call fills: asks for the size first, and again when it grew in between (a description gains the candidates gathered since).
template <class F> std::string fetch(F f) {
  int n = f(nullptr, 0);
  for (int tries = 0; n > 0 && tries < 4; tries++) {
    std::string s((size_t)n + 4096, '\0');
    const int r = f(&s[0], (int)s.size());
    if (r == RTC_ERR_TOO_SMALL) { n = (int)s.size() * 2; continue; }
    if (r < 0) return "";
    s.resize(strlen(s.c_str()));
    return s;
  }
  return "";
}
// An offer of ours says a=setup:active (the offerer may: RFC 5763 section 5 lets the answer pick passive), so this side is the DTLS client.
// mbedTLS cannot be the server for a browser: Chrome's ClientHello (with its post-quantum key share) comes in several DTLS fragments, and
// mbedTLS refuses a fragmented ClientHello ("The requested feature is not available"). libdatachannel offers actpass and takes the role
// the answer leaves it, so only the text the peer reads changes. A browser's offer (actpass) is answered active by libdatachannel already.
std::string activeSetup(std::string sdp) {
  for (size_t at = 0; (at = sdp.find("a=setup:actpass", at)) != std::string::npos;) { sdp.replace(at, 15, "a=setup:active"); at += 14; }
  return sdp;
}
zrt::Array<double> nums(const std::vector<double>& v) {
  zrt::Array<double> r = zrt::Array<double>::with_cap((int32_t)v.size());
  if (!v.empty()) memcpy(r.a->data, v.data(), v.size() * sizeof(double));
  r.a->len = (int32_t)v.size();
  return r;
}
}  // namespace

struct HostWebRTC : NativeWebRTC {
  int32_t create(zrt::String servers, bool relay) override {
    static bool logging = false;
    if (!logging) {   // once: errors are kept for error(); ZINC_WEBRTC_LOG=1 prints everything at the debug level
      logging = true;
      const char* show = getenv("ZINC_WEBRTC_LOG");
      rtcInitLogger(show && *show ? RTC_LOG_DEBUG : RTC_LOG_ERROR, onLog);
    }
    err.clear();
    char why[512];
    if (zn_host_permission && zn_host_permission("net", "*", why, sizeof why)) { err = std::string("webrtc: ") + why; return -1; }   // any peer, and it listens: "net" or "net:*"
    std::vector<std::string> urls;
    std::string all = cstr(servers), line;
    for (size_t i = 0; i <= all.size(); i++)
      if (i == all.size() || all[i] == '\n') { if (!line.empty()) urls.push_back(line); line.clear(); }
      else line += all[i];
    std::vector<const char*> ptrs;
    for (const std::string& u : urls) ptrs.push_back(u.c_str());
    rtcConfiguration c;
    memset(&c, 0, sizeof c);
    c.iceServers = ptrs.empty() ? nullptr : ptrs.data();
    c.iceServersCount = (int)ptrs.size();
    c.iceTransportPolicy = relay ? RTC_TRANSPORT_POLICY_RELAY : RTC_TRANSPORT_POLICY_ALL;
    c.disableAutoNegotiation = true;   // the program calls createOffer / setLocalDescription, as on the Web
    const int pc = rtcCreatePeerConnection(&c);
    if (pc < 0) return fail("cannot create the peer connection"), -1;
    { std::lock_guard<std::mutex> l(mu); counts[pc] = Count(); }
    {
      std::lock_guard<std::mutex> l(txMu);
      static const char* hex = "0123456789abcdef";
      std::string cname;
      for (int i = 0; i < 16; i++) cname += hex[rng() & 15];
      pcInfo[pc].cname = cname;
    }
    rtcSetLocalCandidateCallback(pc, onCandidate);
    rtcSetStateChangeCallback(pc, onState);
    rtcSetIceStateChangeCallback(pc, onIce);
    rtcSetGatheringStateChangeCallback(pc, onGather);
    rtcSetSignalingStateChangeCallback(pc, onSignal);
    rtcSetDataChannelCallback(pc, onChannel);
    rtcSetTrackCallback(pc, onTrack);
    rtcSetMediaInterceptorCallback(pc, onIntercept);
    return pc;
  }
  zrt::String error() override { return str(err); }
  zrt::String next() override {
    // connections closed two seconds ago and more are deleted: libdatachannel reports their channels' close after the connection's own
    const auto now = std::chrono::steady_clock::now();
    for (size_t i = 0; i < dying.size();)
      if (now - dying[i].second > std::chrono::seconds(2)) { rtcDeletePeerConnection(dying[i].first); { std::lock_guard<std::mutex> l(mu); counts.erase(dying[i].first); } dying.erase(dying.begin() + (long)i); }
      else i++;
    Ev e;
    {
      std::lock_guard<std::mutex> l(mu);
      if (q.empty()) return str("");
      e = std::move(q.front());
      q.pop_front();
    }
    if (e.rec.compare(0, 6, "binary") == 0) lastBin.swap(e.bin);
    if (e.rec.compare(0, 6, "close\x1f") == 0) {   // a closed channel has no more events: free it
      const int dc = atoi(e.rec.c_str() + 6);
      rtcDeleteDataChannel(dc);
      std::lock_guard<std::mutex> l(mu);
      owner.erase(dc);
    }
    return str(e.rec);
  }
  zrt::Array<uint8_t> bytes() override {
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap((int32_t)lastBin.size());
    if (!lastBin.empty()) memcpy(r.a->data, lastBin.data(), lastBin.size());
    r.a->len = (int32_t)lastBin.size();
    return r;
  }
  zrt::String createOffer(int32_t pc) override {
    err.clear();
    syncTracks(pc);
    std::string s = fetch([&](char* b, int n) { return rtcCreateOffer(pc, b, n); });
    if (s.empty()) fail("createOffer failed");
    return str(activeSetup(s));
  }
  zrt::String createAnswer(int32_t pc) override {
    err.clear();
    syncTracks(pc);
    std::string s = fetch([&](char* b, int n) { return rtcCreateAnswer(pc, b, n); });
    if (s.empty()) fail("createAnswer failed (no remote offer?)");
    return str(s);
  }
  bool setLocalDescription(int32_t pc, zrt::String type, zrt::String sdpIn) override {
    err.clear();
    std::string t = cstr(type);
    munged(pc, cstr(sdpIn));
    syncTracks(pc);
    if (rtcSetLocalDescription(pc, t.empty() ? nullptr : t.c_str()) < 0) return fail("setLocalDescription failed");
    bool answered;
    { std::lock_guard<std::mutex> l(txMu); answered = pcInfo[pc].remoteOffer; pcInfo[pc].remoteOffer = false; }
    if (answered) negotiated(pc);
    return true;
  }
  bool setRemoteDescription(int32_t pc, zrt::String sdp, zrt::String type) override {
    err.clear();
    std::string s = cstr(sdp), t = cstr(type);
    if (rtcSetRemoteDescription(pc, s.c_str(), t.empty() ? nullptr : t.c_str()) < 0) return fail("the remote description is refused");
    const bool offer = t == "offer";
    std::map<std::string, int> pending;
    {
      std::lock_guard<std::mutex> l(txMu);
      pcInfo[pc].remoteOffer = offer;
      pending.swap(pcInfo[pc].pending);
    }
    const std::vector<Section> remote = sections(description(pc, true));
    for (auto& kv : pending) {   // the sections the offer adds: transceivers, recvonly until the program gives them a track
      const std::string kind = kindOf(remote, kv.first);
      if (kind != "audio" && kind != "video") continue;
      auto tx = makeTx(pc, kv.second, kind == "video", kv.first);
      tx->direction = "recvonly";
    }
    for (auto& tx : txsOf(pc)) {
      const Section* r = find(remote, tx->mid);
      if (!r) continue;
      const bool s2 = !r->removed && sends(r->direction);
      if (s2 && !tx->remoteSends) tx->fire = true;   // ontrack
      tx->remoteSends = s2;
      tx->remoteStream = r->stream == "-" ? "" : r->stream;
      tx->remoteTrack = r->track;
      if (r->removed) tx->stopped = true;
    }
    if (!offer) negotiated(pc);
    return true;
  }
  bool addIceCandidate(int32_t pc, zrt::String cand, zrt::String mid) override {
    err.clear();
    std::string c = cstr(cand), m = cstr(mid);
    return rtcAddRemoteCandidate(pc, c.c_str(), m.empty() ? nullptr : m.c_str()) >= 0 || fail("the candidate is refused");
  }
  zrt::String localDescription(int32_t pc) override {
    std::string t = fetch([&](char* b, int n) { return rtcGetLocalDescriptionType(pc, b, n); });
    const std::string d = t.empty() ? "" : fetch([&](char* b, int n) { return rtcGetLocalDescription(pc, b, n); });
    return str(t.empty() ? "" : t + FS + (t == "offer" ? activeSetup(d) : d));
  }
  zrt::String remoteDescription(int32_t pc) override {
    std::string t = fetch([&](char* b, int n) { return rtcGetRemoteDescriptionType(pc, b, n); });
    return str(t.empty() ? "" : t + FS + fetch([&](char* b, int n) { return rtcGetRemoteDescription(pc, b, n); }));
  }
  int32_t createDataChannel(int32_t pc, zrt::String label, zrt::String protocol, bool ordered, int32_t maxRetransmits, int32_t maxLife, bool negotiated, int32_t id) override {
    err.clear();
    std::string l = cstr(label), p = cstr(protocol);
    rtcDataChannelInit init;
    memset(&init, 0, sizeof init);
    init.reliability.unordered = !ordered;
    if (maxRetransmits >= 0) { init.reliability.unreliable = true; init.reliability.maxRetransmits = (unsigned)maxRetransmits; }
    else if (maxLife >= 0) { init.reliability.unreliable = true; init.reliability.maxPacketLifeTime = (unsigned)maxLife; }
    init.protocol = p.c_str();
    init.negotiated = negotiated;
    if (id >= 0) { init.manualStream = true; init.stream = (uint16_t)id; }
    const int dc = rtcCreateDataChannelEx(pc, l.c_str(), &init);
    if (dc < 0) return fail("createDataChannel failed"), -1;
    watch(dc, pc);
    return dc;
  }
  zrt::String channelInfo(int32_t dc) override {
    rtcReliability r;
    memset(&r, 0, sizeof r);
    rtcGetDataChannelReliability(dc, &r);
    std::string label = fetch([&](char* b, int n) { return rtcGetDataChannelLabel(dc, b, n); });
    std::string proto = fetch([&](char* b, int n) { return rtcGetDataChannelProtocol(dc, b, n); });
    const bool life = r.unreliable && r.maxPacketLifeTime > 0;   // unreliable by lifetime, else by retransmissions
    return str(label + FS + proto + FS + num(rtcGetDataChannelStream(dc)) + FS + (r.unordered ? "0" : "1") + FS +
               num(r.unreliable && !life ? (long long)r.maxRetransmits : -1) + FS + num(life ? (long long)r.maxPacketLifeTime : -1));
  }
  bool send(int32_t dc, const char* data, int size, long long count) {
    err.clear();
    if (rtcSendMessage(dc, data, size) < 0) return fail("send failed (the channel is not open, or the message is larger than maxMessageSize)");
    std::lock_guard<std::mutex> l(mu);
    auto o = owner.find(dc);
    if (o != owner.end()) { counts[o->second].bytesSent += count; counts[o->second].messagesSent++; }
    return true;
  }
  bool sendText(int32_t dc, zrt::String text) override {
    std::string t = cstr(text);
    return send(dc, t.c_str(), -1, (long long)t.size());
  }
  bool sendBytes(int32_t dc, zrt::Array<uint8_t> data) override {
    const int n = data.a ? data.a->len : 0;
    return send(dc, n ? (const char*)data.a->data : "", n, n);
  }
  int32_t bufferedAmount(int32_t dc) override { const int n = rtcGetBufferedAmount(dc); return n < 0 ? 0 : n; }
  void setBufferedAmountLowThreshold(int32_t dc, int32_t bytes) override { rtcSetBufferedAmountLowThreshold(dc, bytes < 0 ? 0 : bytes); }
  int32_t maxMessageSize(int32_t dc) override { const int n = rtcMaxMessageSize(dc); return n < 0 ? 0 : n; }
  void closeChannel(int32_t dc) override { rtcClose(dc); }
  void close(int32_t pc) override {
    rtcClosePeerConnection(pc);
    for (auto& t : txsOf(pc)) endTx(t);   // the workers stop and join: no thread is left behind
    { std::lock_guard<std::mutex> l(txMu); pcInfo.erase(pc); }
    dying.push_back({pc, std::chrono::steady_clock::now()});
  }
  zrt::String stats(int32_t pc) override {
    char local[256] = "", remote[256] = "";
    rtcGetSelectedCandidatePair(pc, local, sizeof local, remote, sizeof remote);
    Count c;
    { std::lock_guard<std::mutex> l(mu); auto it = counts.find(pc); if (it != counts.end()) c = it->second; }
    return str(std::string(local) + FS + remote + FS + num(c.bytesSent) + FS + num(c.bytesReceived) + FS + num(c.messagesSent) + FS + num(c.messagesReceived));
  }

  // ---- media
  zrt::String capabilities(zrt::String kindIn) override {
    const bool video = cstr(kindIn) == "video";
    std::string out;
    for (const std::string& n : defaults(video)) {
      Codec c = ours(n);
      out += std::string(video ? "video/" : "audio/") + c.name + FS + num(c.clock) + FS + num(c.channels) + FS + c.fmtp + RS;
    }
    return str(out);
  }
  int32_t addTransceiver(int32_t pc, zrt::String kindIn, zrt::String dirIn) override {
    err.clear();
    const std::string kind = cstr(kindIn);
    if (kind != "audio" && kind != "video") { err = "the kind of a transceiver is 'audio' or 'video', not '" + kind + "'"; return -1; }
    // the mid: the first number no section of either description and no transceiver has (the data channels' section takes one too)
    std::vector<Section> ss = sections(description(pc, false)), rs = sections(description(pc, true));
    ss.insert(ss.end(), rs.begin(), rs.end());
    std::vector<std::shared_ptr<Tx>> mine = txsOf(pc);
    std::string mid;
    for (int m = 0; mid.empty(); m++) {
      const std::string c = num(m);
      bool used = find(ss, c) != nullptr;
      for (auto& t : mine) used = used || t->mid == c;
      if (!used) mid = c;
    }
    Tx probe;
    probe.video = kind == "video"; probe.mid = mid; probe.direction = cstr(dirIn);
    { std::lock_guard<std::mutex> l(txMu); probe.cname = pcInfo[pc].cname; }
    const std::string d = describe(probe, nullptr, false);
    const int tr = rtcAddTrack(pc, d.c_str());
    if (tr < 0) return fail("addTransceiver failed"), -1;
    auto t = makeTx(pc, tr, probe.video, mid);
    t->direction = probe.direction;
    return tr;
  }
  zrt::String transceivers(int32_t pc) override {
    std::string out;
    for (auto& t : txsOf(pc)) {
      std::lock_guard<std::mutex> l(t->m);
      const std::string kind = t->video ? "video/" : "audio/";
      out += num(t->id) + FS + t->mid + FS + (t->video ? "video" : "audio") + FS + (t->stopped ? "stopped" : t->direction) + FS + (t->stopped ? "stopped" : t->current) +
             FS + (t->fire ? "1" : "0") + FS + t->remoteStream + FS + t->remoteTrack + FS + (t->send.pt >= 0 ? kind + t->send.name : "") + FS +
             (t->recv.pt >= 0 ? kind + t->recv.name : "") + RS;
      t->fire = false;
    }
    return str(out);
  }
  void setDirection(int32_t tx, zrt::String dir) override { if (auto t = txOf(tx)) t->direction = cstr(dir); }
  bool setCodecPreferences(int32_t tx, zrt::String list) override {
    auto t = txOf(tx);
    if (!t) return false;
    std::vector<std::string> names;
    for (std::string m : split(cstr(list), ',')) {
      if (m.empty()) continue;
      const size_t k = m.find('/');
      const std::string kind = m.substr(0, k), n = k == std::string::npos ? m : m.substr(k + 1);
      Codec c = ours(n);
      if (c.pt < 0 || kind != (t->video ? "video" : "audio") || !supported(c)) { err = "the codec '" + m + "' is not one this transceiver has (RTCRtpReceiver.getCapabilities)"; return false; }
      names.push_back(c.name);
    }
    t->prefs = names;
    return true;
  }
  void setSender(int32_t tx, zrt::String streams, zrt::String track) override {
    if (auto t = txOf(tx)) { t->streams = cstr(streams); t->trackId = cstr(track); }
  }
  void setEncoding(int32_t tx, double maxBitrate, double maxFramerate, double scaleDown, bool active) override {
    auto t = txOf(tx);
    if (!t) return;
    t->maxBitrate = maxBitrate > 0 ? maxBitrate : 0;
    t->maxFramerate = maxFramerate > 0 ? maxFramerate : 0;
    t->scaleDown = scaleDown >= 1 ? scaleDown : 1;
    t->active = active;
  }
  void stopTransceiver(int32_t tx) override {
    auto t = txOf(tx);
    if (!t) return;
    t->stopped = true;
    std::lock_guard<std::mutex> l(t->m);
    t->send = Codec();
    t->direction = "inactive";
  }
  // A frame to send, taken by the worker; a frame not taken yet is replaced by the newer one.
  bool queue(Tx& t, const uint32_t* px, int w, int h, int stride, bool enabled) {
    if (!t.active || t.stopped || t.send.pt < 0 || w <= 0 || h <= 0) return false;
    const int64_t now = nowMs();
    if (t.maxFramerate > 0 && now - t.lastSent < 1000 / t.maxFramerate - 2) return false;
    t.lastSent = now;
    std::lock_guard<std::mutex> l(t.m);
    t.pend.resize((size_t)w * h);
    if (!enabled) memset(t.pend.data(), 0, t.pend.size() * 4);   // a disabled track sends black
    else for (int r = 0; r < h; r++) memcpy(t.pend.data() + (size_t)r * w, px + (size_t)r * stride, (size_t)w * 4);
    t.pw = w & ~1; t.ph = h & ~1;
    if (t.pw != w) for (int r = 0; r < t.ph; r++) memmove(t.pend.data() + (size_t)r * t.pw, t.pend.data() + (size_t)r * w, (size_t)t.pw * 4);
    t.pms = now; t.hasPend = true;
    t.cv.notify_one();
    return true;
  }
  bool sendImage(int32_t tx, int32_t image, bool enabled) override {
    auto t = txOf(tx);
    const uint32_t* px = nullptr;
    int32_t w = 0, h = 0, s = 0;
    if (!t || !zrt::raster::dyn_view(image, &px, &w, &h, &s) || !px) return false;
    queue(*t, px, w, h, s, enabled);
    return true;
  }
  void sendPixels(int32_t tx, zrt::Array<uint8_t> rgba, int32_t w, int32_t h, bool enabled) override {
    auto t = txOf(tx);
    if (!t || !rgba.a || rgba.a->len < w * h * 4) return;
    std::vector<uint32_t> px((size_t)w * h);
    const uint8_t* s = (const uint8_t*)rgba.a->data;
    for (size_t i = 0; i < px.size(); i++) px[i] = (uint32_t)s[i * 4] << 16 | (uint32_t)s[i * 4 + 1] << 8 | s[i * 4 + 2];
    queue(*t, px.data(), w, h, w, enabled);
  }
  void sendAudio(int32_t tx, zrt::Array<double> samples, int32_t rate, int32_t channels, bool enabled) override {
    auto t = txOf(tx);
    const int n = samples.a ? samples.a->len : 0;
    if (!t || t->video || !t->active || t->stopped || t->send.pt < 0 || n == 0 || rate <= 0 || channels <= 0) return;
    // to 48 kHz mono: the channels averaged, then linear interpolation (the microphone opens at 48 kHz by default: a copy)
    const int frames = n / channels;
    std::vector<float> mono((size_t)frames);
    for (int f = 0; f < frames; f++) {
      double s = 0;
      for (int c = 0; c < channels; c++) s += samples.a->data[f * channels + c];
      mono[(size_t)f] = enabled ? (float)(s / channels) : 0.f;
    }
    std::lock_guard<std::mutex> l(t->m);
    if (rate == 48000) t->pcm.insert(t->pcm.end(), mono.begin(), mono.end());
    else for (int64_t i = 0, m = (int64_t)frames * 48000 / rate; i < m; i++) {
      const double x = (double)i * rate / 48000;
      const int a = (int)x, b = a + 1 < frames ? a + 1 : a;
      t->pcm.push_back((float)(mono[(size_t)a] + (mono[(size_t)b] - mono[(size_t)a]) * (x - a)));
    }
    if (t->pcm.size() > 48000) t->pcm.erase(t->pcm.begin(), t->pcm.begin() + (long)(t->pcm.size() - 48000));
    t->cv.notify_one();
  }
  int32_t remoteFrame(int32_t tx) override {
    auto t = txOf(tx);
    if (!t) return -1;
    std::lock_guard<std::mutex> l(t->m);
    if (t->frames == 0) return -1;
    if (t->shownIndex != t->frames - 1 && t->frame.size() >= (size_t)t->fw * t->fh) {
      // the image wraps `shown`, which only this thread writes: the same image id while the size stays, a new one when it changes
      if (t->sw != t->fw || t->sh != t->fh || t->img < 0) {
        if (t->img >= 0) zrt::raster::dyn_destroy(t->img);
        t->sw = t->fw; t->sh = t->fh;
        t->shown.assign(t->frame.begin(), t->frame.begin() + (long)((size_t)t->sw * t->sh));
        t->img = zrt::raster::dyn_wrap(t->sw, t->sh, t->shown.data(), t->sw);
      } else {
        memcpy(t->shown.data(), t->frame.data(), (size_t)t->sw * t->sh * 4);
        if (t->img >= 0) zrt::raster::dyn_update(t->img, t->shown.data(), t->sw);
      }
      t->shownIndex = t->frames - 1;
    }
    return t->shownIndex;
  }
  int32_t remoteImage(int32_t tx) override { auto t = txOf(tx); if (!t) return -1; std::lock_guard<std::mutex> l(t->m); return t->img; }
  zrt::Array<double> remoteSize(int32_t tx) override {
    auto t = txOf(tx);
    if (!t) return nums({0, 0});
    std::lock_guard<std::mutex> l(t->m);
    return nums({(double)t->sw, (double)t->sh});
  }
  zrt::Array<uint8_t> remoteSnapshot(int32_t tx) override {
    auto t = txOf(tx);
    std::vector<uint32_t> px;
    int w = 0, h = 0;
    if (t) { std::lock_guard<std::mutex> l(t->m); px = t->shown; w = t->sw; h = t->sh; }
    const int32_t n = (int32_t)((size_t)w * h <= px.size() ? (size_t)w * h : 0);
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap(n * 4);
    uint8_t* o = (uint8_t*)r.a->data;
    for (int32_t i = 0; i < n; i++) { const uint32_t p = px[(size_t)i]; o[i * 4] = (uint8_t)(p >> 16); o[i * 4 + 1] = (uint8_t)(p >> 8); o[i * 4 + 2] = (uint8_t)p; o[i * 4 + 3] = 255; }
    r.a->len = n * 4;
    return r;
  }
  zrt::Array<double> remoteAudio(int32_t tx) override {
    auto t = txOf(tx);
    std::vector<float> a;
    if (t) { std::lock_guard<std::mutex> l(t->m); a.swap(t->audio); }
    zrt::Array<double> r = zrt::Array<double>::with_cap((int32_t)a.size());
    for (size_t i = 0; i < a.size(); i++) r.a->data[i] = a[i];
    r.a->len = (int32_t)a.size();
    return r;
  }
  void requestKeyframe(int32_t tx) override {
    auto t = txOf(tx);
    if (!t) return;
    rtcRequestKeyframe(t->id);
    std::lock_guard<std::mutex> l(t->m);
    t->st.pliSent++;
  }
  zrt::String txStats(int32_t tx) override {
    auto t = txOf(tx);
    if (!t) return str("");
    std::lock_guard<std::mutex> l(t->m);
    const Stats& s = t->st;
    const long long expected = s.maxSeq >= 0 ? s.maxSeq - s.baseSeq + 1 : 0;
    const double clock = t->recv.clock > 0 ? t->recv.clock : t->video ? 90000 : 48000;
    std::string o;
    auto kv = [&](const char* k, const std::string& v) { o += std::string(k) + "=" + v + FS; };
    kv("ssrc", num(t->ssrc));
    kv("bytesSent", num(s.bytesSent)); kv("packetsSent", num(s.packetsSent)); kv("framesEncoded", num(s.framesEncoded));
    kv("keyFramesEncoded", num(s.keyFramesEncoded)); kv("pliCount", num(s.pliReceived)); kv("totalEncodeTime", dbl(s.encodeUs / 1e6));
    kv("frameWidthSent", num(s.sentWidth)); kv("frameHeightSent", num(s.sentHeight)); kv("framesPerSecondSent", num((long long)s.sentTimes.size()));
    kv("targetBitrate", num(s.targetBitrate)); kv("rembBitrate", num(s.rembBitrate)); kv("wireBytesSent", num(zn_impair_wire_bytes(t->ssrc))); kv("totalSamplesSent", num(s.samplesSent));
    kv("bytesReceived", num(s.bytesReceived)); kv("packetsReceived", num(s.packetsReceived));
    kv("packetsLost", num(expected > s.packetsReceived ? expected - s.packetsReceived : 0)); kv("jitter", dbl(s.jitter / clock));
    kv("framesDecoded", num(s.framesDecoded)); kv("keyFramesDecoded", num(s.keyFramesDecoded)); kv("pliSent", num(s.pliSent));
    kv("frameWidth", num(s.recvWidth)); kv("frameHeight", num(s.recvHeight)); kv("framesPerSecond", num((long long)s.decodedTimes.size()));
    kv("totalSamplesReceived", num(s.samplesReceived)); kv("concealedSamples", num(s.concealed)); kv("fecPacketsReceived", num(s.fecPackets)); kv("fecSamples", num(s.fecSamples)); kv("dredSamples", num(s.dredSamples)); kv("framesDropped", num(s.framesDropped));
    kv("roundTripTime", dbl(s.rtt)); kv("fractionLost", dbl(s.fractionLost)); kv("remotePacketsLost", num(s.remoteLost)); kv("remoteJitter", dbl(s.remoteJitter));
    kv("sendPayloadType", num(t->send.pt)); kv("recvPayloadType", num(t->recv.pt));
    kv("sendClockRate", num(t->send.clock)); kv("recvClockRate", num(t->recv.clock));
    kv("sendFmtp", t->send.fmtp); kv("recvFmtp", t->recv.fmtp);
    return str(o);
  }
};

NativeWebRTC* zinc_create_WebRTC() {
  static HostWebRTC inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
