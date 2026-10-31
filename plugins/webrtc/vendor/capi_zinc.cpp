// Not vendored: zinc:webrtc's own addition to libdatachannel's C API. It compiles the pinned capi.cpp unmodified (in its place in plugin.json)
// and adds what that API lacks: our VP8 packetizer and its simulcast streams (below), and sending an RTCP packet of our own on a track
// (the receiver's generic NACKs, native/bwe.cpp). rtcSendMessage
// gives a track's media handlers a frame to packetize, so an RTCP packet cannot go that way; a handler chained last keeps the send callback
// its chain is given, which writes to the track's transport. It lives under vendor/ because the plugin build compiles that tree with the
// vendored flags (exceptions, RTTI: capi.cpp needs both).
#include "libdatachannel/src/capi.cpp"

namespace {
struct RtcpOut final : rtc::MediaHandler {
  std::mutex m;
  rtc::message_callback send;
  void incoming(rtc::message_vector&, const rtc::message_callback& s) override {
    std::lock_guard<std::mutex> l(m);
    if (!send) send = s;
  }
};
std::mutex rtcpMu;
std::unordered_map<int, std::shared_ptr<RtcpOut>> rtcpOut;
}  // namespace

/** Chains the RTCP sender last on a track's handlers (again after each rtcSet*Packetizer, which starts a new chain). */
extern "C" int zn_rtc_chain_rtcp_out(int tr) {
  return wrap([&] {
    auto h = std::make_shared<RtcpOut>();
    getTrack(tr)->chainMediaHandler(h);
    std::lock_guard<std::mutex> l(rtcpMu);
    rtcpOut[tr] = h;
    return RTC_ERR_SUCCESS;
  });
}

/** Sends one RTCP packet on the track; RTC_ERR_FAILURE before the track has received anything (no send callback yet). */
extern "C" int zn_rtc_send_rtcp(int tr, const char* data, int size) {
  std::shared_ptr<RtcpOut> h;
  {
    std::lock_guard<std::mutex> l(rtcpMu);
    auto it = rtcpOut.find(tr);
    if (it != rtcpOut.end()) h = it->second;
  }
  if (!h || size < 8) return RTC_ERR_INVALID;
  rtc::message_callback send;
  {
    std::lock_guard<std::mutex> l(h->m);
    send = h->send;
  }
  if (!send) return RTC_ERR_FAILURE;
  return wrap([&] {
    auto msg = rtc::make_message(size_t(size), rtc::Message::Control);
    std::memcpy(msg->data(), data, size_t(size));
    send(msg);
    return size;
  });
}

/** Forgets a track's RTCP sender (the track is going away). */
extern "C" void zn_rtc_forget_rtcp(int tr) {
  std::lock_guard<std::mutex> l(rtcpMu);
  rtcpOut.erase(tr);
}

// ---- VP8 out: our packetizer (RFC 7741's whole payload descriptor), one or two streams (rid simulcast), NACKs answered per SSRC
// libdatachannel's VP8RtpPacketizer writes a one-byte descriptor whose N bit marks every inter frame as unused by the next ones (it is not:
// a VP8 frame refers to the one before it) and no PictureID, which an SFU needs to switch layers and receivers use to spot a lost frame.
// Its NACK responder keeps packets by sequence number alone, so two streams of one track would answer each other's NACKs.
namespace {
struct ZnVp8 final : rtc::RtpPacketizer {
  size_t maxFrag;
  bool layered = false;              // TL0PICIDX and TID written (temporal layers on)
  uint16_t picture;
  uint8_t tl0 = 0;
  int tid = 0;                       // the next frame's layer, set before it is sent
  bool sync = false, nonref = false;
  ZnVp8(std::shared_ptr<rtc::RtpPacketizationConfig> c, size_t mf, bool l, uint16_t pic)
      : RtpPacketizer(std::move(c)), maxFrag(mf), layered(l), picture((uint16_t)(pic & 0x7FFF)) {}
  std::vector<rtc::binary> fragment(rtc::binary frame) override {
    if (frame.size() < 3) return {};
    picture = (uint16_t)((picture + 1) & 0x7FFF);
    if (tid == 0) tl0++;             // TL0PICIDX counts the base layer's frames; a frame above it carries the last one's
    uint8_t d[6];
    size_t n = 0;
    d[n++] = (uint8_t)(0x80 | (nonref ? 0x20 : 0));                        // X, N (S set on the first fragment below), partition 0
    d[n++] = (uint8_t)(0x80 | (layered ? 0x60 : 0));                       // I, and L and T when layered
    d[n++] = (uint8_t)(0x80 | picture >> 8); d[n++] = (uint8_t)picture;    // M: a 15-bit PictureID
    if (layered) { d[n++] = tl0; d[n++] = (uint8_t)((tid & 3) << 6 | (sync ? 0x20 : 0)); }
    if (maxFrag <= n) return {};
    std::vector<rtc::binary> out;
    for (size_t at = 0; at < frame.size();) {
      const size_t k = std::min(maxFrag - n, frame.size() - at);
      rtc::binary p(n + k);
      std::memcpy(p.data(), d, n);
      if (at == 0) p[0] |= std::byte(0x10);
      std::memcpy(p.data() + n, frame.data() + at, k);
      out.push_back(std::move(p));
      at += k;
    }
    return out;
  }
};
struct ZnVideoOut final : rtc::MediaHandler {
  std::shared_ptr<ZnVp8> s[2];
  int cur = 0;                       // the stream of the frame being sent (zn_rtc_send_vp8, on the sender's thread)
  std::mutex m;
  struct Kept { std::unordered_map<uint16_t, rtc::message_ptr> by; std::deque<uint16_t> order; };
  std::unordered_map<uint32_t, Kept> kept;   // the last 512 packets of each SSRC, for NACKs
  void outgoing(rtc::message_vector& ms, const rtc::message_callback& send) override {
    rtc::message_vector media, rest;
    for (auto& x : ms) (x->type == rtc::Message::Control ? rest : media).push_back(x);
    if (!media.empty() && s[cur]) s[cur]->outgoing(media, send);
    {
      std::lock_guard<std::mutex> l(m);
      for (auto& p : media) {
        if (p->size() < sizeof(rtc::RtpHeader)) continue;
        auto h = reinterpret_cast<rtc::RtpHeader*>(p->data());
        Kept& k = kept[h->ssrc()];
        if (k.by.emplace(h->seqNumber(), p).second) k.order.push_back(h->seqNumber());
        while (k.order.size() > 512) { k.by.erase(k.order.front()); k.order.pop_front(); }
      }
    }
    media.insert(media.end(), rest.begin(), rest.end());
    ms.swap(media);
  }
  // The NACKs of the peer answered from what was kept: called by ZnNackAnswer, which sits after the RTCP receiving session in the chain
  // (incoming messages go through the chain from its end, and that session takes the RTCP the handlers before it would read).
  void answer(rtc::message_vector& ms, const rtc::message_callback& send) {
    for (auto& x : ms) {
      if (x->type != rtc::Message::Control) continue;
      const auto* b = reinterpret_cast<const uint8_t*>(x->data());
      for (size_t at = 0; at + 12 <= x->size();) {
        const size_t len = 4 * (size_t)((b[at + 2] << 8 | b[at + 3]) + 1);
        if (at + len > x->size()) break;
        if (b[at + 1] == 205 && (b[at] & 31) == 1) {   // generic NACK: the media SSRC, then (PID, BLP) pairs
          const uint32_t media = (uint32_t)b[at + 8] << 24 | (uint32_t)b[at + 9] << 16 | (uint32_t)b[at + 10] << 8 | b[at + 11];
          std::vector<rtc::message_ptr> again;
          {
            std::lock_guard<std::mutex> l(m);
            auto k = kept.find(media);
            if (k != kept.end())
              for (size_t f = at + 12; f + 4 <= at + len; f += 4) {
                const uint16_t pid = (uint16_t)(b[f] << 8 | b[f + 1]), blp = (uint16_t)(b[f + 2] << 8 | b[f + 3]);
                for (int i = -1; i < 16; i++) {
                  if (i >= 0 && !(blp & (1 << i))) continue;
                  auto p = k->second.by.find((uint16_t)(pid + i + 1));
                  if (p != k->second.by.end()) again.push_back(p->second);
                }
              }
          }
          for (auto& p : again) send(p);
        }
        at += len;
      }
    }
  }
};
struct ZnNackAnswer final : rtc::MediaHandler {
  std::shared_ptr<ZnVideoOut> out;
  void incoming(rtc::message_vector& ms, const rtc::message_callback& send) override { out->answer(ms, send); }
};
std::mutex vp8Mu;
std::unordered_map<int, std::shared_ptr<ZnVideoOut>> vp8Out;
std::shared_ptr<rtc::RtpPacketizationConfig> vp8Config(const rtcPacketizerInit* init, int midExt, const char* mid, int ridExt, const char* rid) {
  auto c = createRtpPacketizationConfig(init);
  if (midExt > 0 && mid && *mid) { c->midId = (uint8_t)midExt; c->mid = std::string(mid); }
  if (ridExt > 0 && rid && *rid) { c->ridId = (uint8_t)ridExt; c->rid = std::string(rid); }
  return c;
}
}  // namespace

/** VP8 out on a track, in place of rtcSetVP8Packetizer and rtcChainRtcpNackResponder: the stream `h` and, when `l` is not null, a second
 *  one (simulcast), both with the rid header extension then (and the mid one when midExt > 0); `layered`: the descriptor carries the
 *  temporal layer (TL0PICIDX, TID, Y). Chains the second stream's sender report. Starts the track's chain, as rtcSet*Packetizer does. */
extern "C" int zn_rtc_set_vp8_out(int tr, const rtcPacketizerInit* h, const rtcPacketizerInit* l, int midExt, const char* mid, int ridExt,
                                  const char* ridH, const char* ridL, int layered) {
  return wrap([&] {
    auto track = getTrack(tr);
    auto out = std::make_shared<ZnVideoOut>();
    const size_t frag = h->maxFragmentSize ? h->maxFragmentSize : RTC_DEFAULT_MAX_FRAGMENT_SIZE;
    auto ch = vp8Config(h, midExt, mid, l ? ridExt : 0, ridH);
    out->s[0] = std::make_shared<ZnVp8>(ch, frag, layered != 0, h->sequenceNumber);
    {
      std::lock_guard<std::mutex> g(mutex);
      rtpConfigMap[tr] = ch;   // rtcSetTrackRtpTimestamp and rtcChainRtcpSrReporter: the first stream
    }
    track->setMediaHandler(out);
    if (l) {
      auto cl = vp8Config(l, midExt, mid, ridExt, ridL);
      out->s[1] = std::make_shared<ZnVp8>(cl, frag, layered != 0, l->sequenceNumber);
      track->chainMediaHandler(std::make_shared<rtc::RtcpSrReporter>(cl));
    }
    std::lock_guard<std::mutex> g(vp8Mu);
    vp8Out[tr] = out;
    return RTC_ERR_SUCCESS;
  });
}

/** One VP8 frame on stream 0 or 1 of a track set by zn_rtc_set_vp8_out, at an RTP timestamp, with its temporal layer (tid; sync: it refers
 *  to the base layer only; nonref: no later frame refers to it). */
extern "C" int zn_rtc_send_vp8(int tr, int stream, const char* data, int size, uint32_t ts, int tid, int sync, int nonref) {
  std::shared_ptr<ZnVideoOut> out;
  {
    std::lock_guard<std::mutex> g(vp8Mu);
    auto it = vp8Out.find(tr);
    if (it != vp8Out.end()) out = it->second;
  }
  if (!out || stream < 0 || stream > 1 || !out->s[stream] || size <= 0) return RTC_ERR_INVALID;
  return wrap([&] {
    ZnVp8& p = *out->s[stream];
    out->cur = stream;
    p.rtpConfig->timestamp = ts;
    p.tid = tid; p.sync = sync != 0; p.nonref = nonref != 0;
    auto b = reinterpret_cast<const rtc::byte*>(data);
    getTrack(tr)->send(rtc::binary(b, b + size));
    return RTC_ERR_SUCCESS;
  });
}

/** Chains the answers to NACKs of a track set by zn_rtc_set_vp8_out (where rtcChainRtcpNackResponder would go). */
extern "C" int zn_rtc_chain_vp8_nack(int tr) {
  std::shared_ptr<ZnVideoOut> out;
  {
    std::lock_guard<std::mutex> g(vp8Mu);
    auto it = vp8Out.find(tr);
    if (it != vp8Out.end()) out = it->second;
  }
  if (!out) return RTC_ERR_INVALID;
  return wrap([&] {
    auto a = std::make_shared<ZnNackAnswer>();
    a->out = out;
    getTrack(tr)->chainMediaHandler(a);
    return RTC_ERR_SUCCESS;
  });
}

extern "C" void zn_rtc_forget_vp8(int tr) {
  std::lock_guard<std::mutex> g(vp8Mu);
  vp8Out.erase(tr);
}
