// Our H.264 SPS against libwebrtc's receive-side rewriter (ZN-924). libwebrtc's SpsVuiRewriter::ParseAndRewriteSps (common_video/h264/
// sps_vui_rewriter.cc, run by the viewer's depacketiser before the frame transformer where DAVE decrypts) rewrites an SPS when it has no
// VUI, or a VUI with no bitstream_restriction (VideoToolbox's has the colour description 6/1/6 and none), or one with max_num_reorder_frames != 0 or max_dec_frame_buffering > max_num_ref_frames; a
// rewrite moves every later byte and breaks DAVE's unencrypted ranges. This ports that decision (CopyAndRewriteVui, "would it change")
// and checks the SPS bytes VideoToolbox really emits (captured on the development Mac, Constrained Baseline): the original WOULD be
// rewritten, ours is not, and nothing else in the access unit moves. tests/t0/discord_voice_sps.sh builds it.
#include <cstdio>
#include <cstring>
#include <vector>

#include "h264_sps.h"

namespace {
using Bytes = std::vector<uint8_t>;
int fails = 0;
void check(bool ok, const char* what, const char* name = "") { if (!ok) { fprintf(stderr, "FAIL %s %s\n", what, name); fails++; } }

// libwebrtc's reader, written again from its source: sps_parser.cc ParseSpsUpToVui, then CopyAndRewriteVui's decisions
struct Bits {
  Bytes b; size_t p = 0; bool bad = false;
  explicit Bits(const uint8_t* d, size_t n) { int z = 0; for (size_t i = 0; i < n; i++) { if (z >= 2 && d[i] == 3) { z = 0; continue; } z = d[i] == 0 ? z + 1 : 0; b.push_back(d[i]); } }
  uint32_t bit() { if (p >= b.size() * 8) { bad = true; return 0; } uint32_t r = (b[p / 8] >> (7 - p % 8)) & 1; p++; return r; }
  uint64_t bits(int n) { uint64_t r = 0; for (int i = 0; i < n; i++) r = r << 1 | bit(); return r; }
  uint32_t ue() { int z = 0; while (!bit() && !bad) z++; return (uint32_t)((1ull << z) - 1 + bits(z)); }
};
struct Parsed { bool ok = false, vui = false; uint32_t refs = 0, wMbs = 0, hMbs = 0, crop = 0; size_t rest = 0; };
Parsed parse(Bits& r) {   // nal[0] already skipped by the caller
  Parsed s;
  const unsigned profile = (unsigned)r.bits(8); r.bits(16); r.ue();
  if (profile == 100 || profile == 110 || profile == 122 || profile == 244 || profile == 44 || profile == 83 || profile == 86 || profile == 118 || profile == 128) return s;
  r.ue();
  const uint32_t poc = r.ue();
  if (poc == 0) r.ue();
  else if (poc == 1) { r.bit(); r.ue(); r.ue(); const uint32_t c = r.ue(); for (uint32_t i = 0; i < c; i++) r.ue(); }
  s.refs = r.ue(); r.bit();
  s.wMbs = r.ue(); s.hMbs = r.ue();
  if (!r.bit()) r.bit();
  r.bit();
  if (r.bit()) { uint32_t a = r.ue(), b = r.ue(), c = r.ue(), d = r.ue(); s.crop = a + b * 7 + c * 49 + d * 343; }
  s.vui = r.bit();
  s.ok = !r.bad;
  return s;
}
// true: ParseAndRewriteSps returns kVuiRewritten (or fails: also no good for us). The full VUI walk of CopyAndRewriteVui.
bool wouldRewriteFull(const Bytes& nal) {
  Bits r(nal.data() + 1, nal.size() - 1);
  const Parsed s = parse(r);
  if (!s.ok || !s.vui) return true;
  if (r.bit()) { if ((uint32_t)r.bits(8) == 255) r.bits(32); }   // aspect_ratio
  if (r.bit()) r.bit();                                           // overscan
  if (r.bit()) { r.bits(3); r.bit(); if (r.bit()) r.bits(24); }   // video signal type: libwebrtc passes color_space nullptr on receive: no override
  if (r.bit()) { r.ue(); r.ue(); }                                // chroma loc
  if (r.bit()) { r.bits(32); r.bits(32); r.bit(); }               // timing
  const uint32_t nal_hrd = r.bit();
  auto hrd = [&] { const uint32_t c = r.ue(); r.bits(8); for (uint32_t i = 0; i <= c; i++) { r.ue(); r.ue(); r.bit(); } r.bits(20); };
  if (nal_hrd) hrd();
  const uint32_t vcl_hrd = r.bit();
  if (vcl_hrd) hrd();
  if (nal_hrd || vcl_hrd) r.bit();
  r.bit();                                                        // pic_struct_present_flag
  if (!r.bit()) return true;                                      // bitstream_restriction_flag 0: one is added
  r.bit(); r.ue(); r.ue(); r.ue(); r.ue();
  const uint32_t reorder = r.ue(), dfb = r.ue();
  if (r.bad) return true;
  return reorder != 0 || dfb > s.refs;
}

Bytes annexB(std::initializer_list<Bytes> nals) { Bytes o; for (const Bytes& n : nals) { o.insert(o.end(), {0, 0, 0, 1}); o.insert(o.end(), n.begin(), n.end()); } return o; }
}  // namespace

int main() {
  struct Case { const char* name; Bytes sps; int level; } cases[] = {   // captured from VideoToolbox (videotoolbox.cpp, Constrained Baseline, AutoLevel)
    {"1280x720", {0x27, 0x42, 0xc0, 0x1f, 0xab, 0x40, 0x28, 0x02, 0xdd, 0x35, 0x06, 0x01, 0x06, 0x02}, 0x1f},
    {"640x360", {0x27, 0x42, 0xc0, 0x1e, 0xab, 0x40, 0x50, 0x17, 0xfc, 0xb3, 0x50, 0x60, 0x10, 0x60, 0x20}, 0x1e},
    {"160x90", {0x27, 0x42, 0xc0, 0x14, 0xab, 0x41, 0x86, 0xf0, 0x8c, 0x93, 0x50, 0x60, 0x10, 0x60, 0x20}, 0x14},
  };
  const Bytes pps{0x28, 0xde, 0x09, 0x88}, idr{0x25, 0x88, 0x84, 0x00, 0x00, 0x03, 0x00, 0x01, 0xaa}, sei{0x06, 0x05, 0x02, 0x00, 0x01, 0x80};
  for (const Case& c : cases) {
    check(wouldRewriteFull(c.sps), "the VideoToolbox SPS would be rewritten by libwebrtc (else this test cannot fail)", c.name);
    discord::sps::Info in;
    const Bytes out = discord::sps::rewrite(c.sps.data(), c.sps.size(), &in);
    check(in.ok && in.rewritten && in.profile == 66 && in.level == c.level, "info", c.name);
    check(out[0] == c.sps[0] && out.size() > c.sps.size(), "header byte kept, SPS grew by the VUI", c.name);
    check(!wouldRewriteFull(out), "our SPS passes libwebrtc's rewriter unchanged", c.name);
    {   // same picture: refs, size, crop identical, the VUI present
      Bits a(c.sps.data() + 1, c.sps.size() - 1), b(out.data() + 1, out.size() - 1);
      const Parsed pa = parse(a), pb = parse(b);
      check(pa.ok && pb.ok && pa.vui && pb.vui && pa.refs == pb.refs && pa.wMbs == pb.wMbs && pa.hMbs == pb.hMbs && pa.crop == pb.crop, "same refs, size and crop", c.name);
    }
    for (size_t i = 3; i < out.size(); i++) check(!(out[i] <= 3 && out[i - 1] == 0 && out[i - 2] == 0), "no start code or unescaped zeros inside", c.name);
    const Bytes again = discord::sps::rewrite(out.data(), out.size(), &in);
    check(again == out && in.vui && !in.rewritten, "rewriting twice changes nothing", c.name);
    // the access unit: SPS rewritten, every other NAL unit and every start code byte for byte
    const Bytes au = annexB({c.sps, pps, sei, idr});
    const Bytes got = discord::sps::rewriteAnnexB(au, &in);
    check(got == annexB({out, pps, sei, idr}), "access unit: only the SPS changed", c.name);
    const Bytes p = annexB({sei, idr});
    check(discord::sps::rewriteAnnexB(p) == p, "a P frame is untouched", c.name);
  }
  {   // an SPS with no VUI at all (another encoder): the whole VUI is added
    discord::sps::detail::Writer w;
    w.bits(0x42, 8); w.bits(0xc0, 8); w.bits(0x1f, 8); w.ue(0); w.ue(1); w.ue(2); w.ue(0); w.ue(1); w.bit(0); w.ue(79); w.ue(44); w.bit(1); w.bit(1); w.bit(0); w.bit(0); w.bit(1);
    Bytes nal{0x67}; nal.insert(nal.end(), w.b.begin(), w.b.end());
    discord::sps::Info in;
    const Bytes out = discord::sps::rewrite(nal.data(), nal.size(), &in);
    check(wouldRewriteFull(nal) && in.rewritten && !wouldRewriteFull(out), "no VUI: added, accepted by the port", "synthetic");
  }
  puts(fails ? "FAILED" : "ok");
  return fails ? 1 : 0;
}
