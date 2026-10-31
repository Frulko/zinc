// Not vendored: zinc:webrtc's own addition to libdatachannel's C API. It compiles the pinned capi.cpp unmodified (in its place in plugin.json)
// and adds what that API lacks: sending an RTCP packet of our own on a track (the receiver's generic NACKs, native/bwe.cpp). rtcSendMessage
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
