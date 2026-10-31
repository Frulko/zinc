// The SPS of our H.264 video, made safe for a web viewer (ZN-924). libwebrtc's receive path (RtpDepacketizerH264 / H264SpsPpsTracker) runs
// SpsVuiRewriter::ParseAndRewriteSps on every SPS BEFORE the frame transformer where Discord's DAVE decryption runs: an SPS with no VUI, or
// a VUI without bitstream_restriction (VideoToolbox's has the colour description 6/1/6 and no restriction: captured bytes in the test), is rewritten (a VUI with max_num_reorder_frames 0 and max_dec_frame_buffering
// = max_num_ref_frames is added). That changes the SPS length, every byte offset after it moves, and the unencrypted ranges in the DAVE
// trailer no longer fit: the viewer drops every frame. We write that VUI ourselves, bit for bit as libwebrtc's AddBitstreamRestriction does,
// so its rewriter finds nothing to change. Header only: voice.host.cpp and tests/golden/host/discord_voice_sps.cpp use it.
#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

namespace discord::sps {

struct Info { bool ok = false, vui = false, rewritten = false; int profile = 0, level = 0, refs = 0; };

namespace detail {
struct Reader {
  const std::vector<uint8_t>& b; size_t pos = 0; bool bad = false;
  explicit Reader(const std::vector<uint8_t>& v) : b(v) {}
  uint32_t bit() { if (pos >= b.size() * 8) { bad = true; return 0; } const uint32_t r = (b[pos >> 3] >> (7 - (pos & 7))) & 1; pos++; return r; }
  uint32_t bits(int n) { uint32_t r = 0; while (n-- > 0) r = r << 1 | bit(); return r; }
  uint32_t ue() { int z = 0; while (!bit() && !bad && z < 32) z++; return z >= 32 ? (bad = true, 0u) : (1u << z) - 1 + bits(z); }
};
struct Writer {
  std::vector<uint8_t> b; size_t pos = 0;
  void bit(uint32_t v) { if ((pos & 7) == 0) b.push_back(0); if (v) b.back() |= (uint8_t)(0x80 >> (pos & 7)); pos++; }
  void bits(uint32_t v, int n) { while (n-- > 0) bit((v >> n) & 1); }
  void ue(uint32_t v) { const uint32_t x = v + 1; int n = 0; while ((x >> n) > 1) n++; bits(0, n); bits(x, n + 1); }
};
inline std::vector<uint8_t> unescape(const uint8_t* p, size_t n) {   // emulation prevention bytes out (00 00 03 -> 00 00)
  std::vector<uint8_t> o; int z = 0;
  for (size_t i = 0; i < n; i++) { if (z >= 2 && p[i] == 3) { z = 0; continue; } z = p[i] == 0 ? z + 1 : 0; o.push_back(p[i]); }
  return o;
}
inline std::vector<uint8_t> escape(const std::vector<uint8_t>& r) {   // and back in
  std::vector<uint8_t> o; int z = 0;
  for (uint8_t c : r) { if (z >= 2 && c <= 3) { o.push_back(3); z = 0; } o.push_back(c); z = c == 0 ? z + 1 : 0; }
  return o;
}
}  // namespace detail

/** One SPS NAL unit (header byte included, no start code): the same SPS with a VUI that carries bitstream_restriction when it has no VUI or no restriction.
 *  Anything else (a VUI that already restricts, a High profile, a parse failure) comes back unchanged: libwebrtc decides about it. */
inline std::vector<uint8_t> rewrite(const uint8_t* nal, size_t n, Info* info = nullptr) {
  using namespace detail;
  Info in;
  std::vector<uint8_t> same(nal, nal + n);
  if (n < 5) { if (info) *info = in; return same; }
  const std::vector<uint8_t> rbsp = unescape(nal + 1, n - 1);
  Reader r(rbsp);
  in.profile = (int)r.bits(8); r.bits(8); in.level = (int)r.bits(8);
  r.ue();   // seq_parameter_set_id
  const int p = in.profile;
  if (p == 100 || p == 110 || p == 122 || p == 244 || p == 44 || p == 83 || p == 86 || p == 118 || p == 128 || p == 138 || p == 139 || p == 134) { if (info) *info = in; return same; }   // ponytail: no chroma/scaling lists, VideoToolbox emits Baseline; High comes back unchanged
  r.ue();   // log2_max_frame_num_minus4
  const uint32_t poc = r.ue();
  if (poc == 0) r.ue();
  else if (poc == 1) { r.bit(); r.ue(); r.ue(); const uint32_t c = r.ue(); for (uint32_t i = 0; i < c && !r.bad; i++) r.ue(); }
  in.refs = (int)r.ue();
  r.bit(); r.ue(); r.ue();
  if (!r.bit()) r.bit();   // frame_mbs_only_flag, mb_adaptive_frame_field_flag
  r.bit();                 // direct_8x8_inference_flag
  if (r.bit()) { r.ue(); r.ue(); r.ue(); r.ue(); }   // frame cropping
  const size_t vuiAt = r.pos;
  in.vui = r.bit();
  if (r.bad || poc > 2) { if (info) *info = in; return same; }
  in.ok = true;
  // the bits so far, then the VUI (copied when there is one: VideoToolbox's has the colour description, no bitstream_restriction) with the
  // restriction libwebrtc would add, then the stop bit
  Writer w;
  for (size_t i = 0; i < vuiAt; i++) w.bit((rbsp[i >> 3] >> (7 - (i & 7))) & 1);
  w.bit(1);          // vui_parameters_present_flag
  auto cp = [&](int n) { const uint32_t v = r.bits(n); w.bits(v, n); return v; };   // copy n bits
  auto cpue = [&] { const uint32_t v = r.ue(); w.ue(v); return v; };
  auto hrd = [&] { const uint32_t c = cpue(); cp(8); for (uint32_t i = 0; i <= c && !r.bad; i++) { cpue(); cpue(); cp(1); } cp(20); };
  auto restriction = [&] { w.bit(1); w.ue(2); w.ue(1); w.ue(16); w.ue(16); w.ue(0); w.ue((uint32_t)in.refs); };   // libwebrtc's AddBitstreamRestriction: mv over pic boundaries, max bytes/bits denoms, mv lengths, reorder 0, dec buffering = refs
  bool changed = true;
  if (!in.vui) {
    w.bits(0, 2);    // aspect_ratio_info_present_flag, overscan_info_present_flag
    w.bit(0);        // video_signal_type_present_flag
    w.bits(0, 5);    // chroma_loc, timing_info, nal_hrd, vcl_hrd, pic_struct
    w.bit(1);        // bitstream_restriction_flag
    restriction();
  } else {
    if (cp(1) && cp(8) == 255) cp(32);        // aspect ratio
    if (cp(1)) cp(1);                         // overscan
    if (cp(1)) { cp(4); if (cp(1)) cp(24); }  // video signal type (and the colour description)
    if (cp(1)) { cpue(); cpue(); }            // chroma location
    if (cp(1)) { cp(32); cp(32); cp(1); }     // timing
    const uint32_t nal = cp(1); if (nal) hrd();
    const uint32_t vcl = cp(1); if (vcl) hrd();
    if (nal || vcl) cp(1);                    // low_delay_hrd_flag
    cp(1);                                    // pic_struct_present_flag
    const uint32_t bsr = r.bit();
    w.bit(1);                                 // bitstream_restriction_flag
    if (!bsr) restriction();
    else {
      cp(1); cpue(); cpue(); cpue(); cpue();
      const uint32_t reorder = r.ue(), dfb = r.ue();
      w.ue(0); w.ue((uint32_t)in.refs);
      changed = reorder != 0 || dfb > (uint32_t)in.refs;
    }
    if (r.bad || !changed) { in.ok = !r.bad; if (info) *info = in; return same; }   // nothing for libwebrtc to change (or a VUI we cannot walk: its call)
  }
  w.bit(1);          // rbsp_stop_one_bit (byte alignment zeros follow)
  in.rewritten = true; in.vui = true;
  if (info) *info = in;
  std::vector<uint8_t> out{nal[0]};
  const std::vector<uint8_t> e = escape(w.b);
  out.insert(out.end(), e.begin(), e.end());
  return out;
}

/** An Annex B access unit with every SPS NAL unit rewritten (PPS and the rest untouched). `info` describes the last SPS seen. */
inline std::vector<uint8_t> rewriteAnnexB(const std::vector<uint8_t>& au, Info* info = nullptr) {
  std::vector<size_t> starts;   // offsets of the first byte after each start code
  for (size_t i = 0; i + 3 <= au.size(); i++) if (au[i] == 0 && au[i + 1] == 0 && au[i + 2] == 1) { starts.push_back(i + 3); i += 2; }
  if (starts.empty()) return au;
  std::vector<uint8_t> out(au.begin(), au.begin() + (long)starts[0]);   // up to and with the first start code
  for (size_t k = 0; k < starts.size(); k++) {
    const size_t a = starts[k], b = k + 1 < starts.size() ? starts[k + 1] - 3 : au.size();   // the unit and what follows it up to the next start code
    size_t e = b;
    while (e > a + 1 && au[e - 1] == 0) e--;   // the zero of a 4-byte start code, trailing zeros
    if ((au[a] & 31) == 7) { const std::vector<uint8_t> s = rewrite(&au[a], e - a, info); out.insert(out.end(), s.begin(), s.end()); }
    else out.insert(out.end(), au.begin() + (long)a, au.begin() + (long)e);
    out.insert(out.end(), au.begin() + (long)e, au.begin() + (long)(k + 1 < starts.size() ? starts[k + 1] : au.size()));
  }
  return out;
}

}  // namespace discord::sps
