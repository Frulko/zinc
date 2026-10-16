// zinc:webrtc for macos and linux: libdatachannel's C API (vendor/libdatachannel/include/rtc/rtc.h). Its callbacks come from its own threads
// (the ICE agent of libjuice, the SCTP thread of usrsctp, its thread pool): each one only appends a record to one queue under a mutex, and
// the program's thread takes them with next(). No callback calls into the engine.
// TLS (DTLS 1.2 with a self-signed ECDSA certificate) is the engine's mbedTLS: the plugin compiles against its headers and its library
// resolves the symbols in the zinc that loads it (or in the program, compiled), so there is one TLS stack in the process.
#define ZRT_HOSTED_CPP
#include "zinc_native_webrtc.h"
#include "rtc/rtc.h"
#include <chrono>
#include <deque>
#include <map>
#include <mutex>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <vector>

namespace {
const char FS = '\x1f';
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
    rtcSetLocalCandidateCallback(pc, onCandidate);
    rtcSetStateChangeCallback(pc, onState);
    rtcSetIceStateChangeCallback(pc, onIce);
    rtcSetGatheringStateChangeCallback(pc, onGather);
    rtcSetSignalingStateChangeCallback(pc, onSignal);
    rtcSetDataChannelCallback(pc, onChannel);
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
    std::string s = fetch([&](char* b, int n) { return rtcCreateOffer(pc, b, n); });
    if (s.empty()) fail("createOffer failed");
    return str(s);
  }
  zrt::String createAnswer(int32_t pc) override {
    err.clear();
    std::string s = fetch([&](char* b, int n) { return rtcCreateAnswer(pc, b, n); });
    if (s.empty()) fail("createAnswer failed (no remote offer?)");
    return str(s);
  }
  bool setLocalDescription(int32_t pc, zrt::String type) override {
    err.clear();
    std::string t = cstr(type);
    return rtcSetLocalDescription(pc, t.empty() ? nullptr : t.c_str()) >= 0 || fail("setLocalDescription failed");
  }
  bool setRemoteDescription(int32_t pc, zrt::String sdp, zrt::String type) override {
    err.clear();
    std::string s = cstr(sdp), t = cstr(type);
    return rtcSetRemoteDescription(pc, s.c_str(), t.empty() ? nullptr : t.c_str()) >= 0 || fail("the remote description is refused");
  }
  bool addIceCandidate(int32_t pc, zrt::String cand, zrt::String mid) override {
    err.clear();
    std::string c = cstr(cand), m = cstr(mid);
    return rtcAddRemoteCandidate(pc, c.c_str(), m.empty() ? nullptr : m.c_str()) >= 0 || fail("the candidate is refused");
  }
  zrt::String localDescription(int32_t pc) override {
    std::string t = fetch([&](char* b, int n) { return rtcGetLocalDescriptionType(pc, b, n); });
    return str(t.empty() ? "" : t + FS + fetch([&](char* b, int n) { return rtcGetLocalDescription(pc, b, n); }));
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
    dying.push_back({pc, std::chrono::steady_clock::now()});
  }
  zrt::String stats(int32_t pc) override {
    char local[256] = "", remote[256] = "";
    rtcGetSelectedCandidatePair(pc, local, sizeof local, remote, sizeof remote);
    Count c;
    { std::lock_guard<std::mutex> l(mu); auto it = counts.find(pc); if (it != counts.end()) c = it->second; }
    return str(std::string(local) + FS + remote + FS + num(c.bytesSent) + FS + num(c.bytesReceived) + FS + num(c.messagesSent) + FS + num(c.messagesReceived));
  }
};

NativeWebRTC* zinc_create_WebRTC() {
  static HostWebRTC inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
