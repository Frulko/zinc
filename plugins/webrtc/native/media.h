#pragma once
// zinc:webrtc media: the codecs behind the tracks, the colour conversion, and the receive side's reassembly of RTP packets into frames.
// Pixels are 0x00RRGGBB words (BGRX in memory), the format of zinc:camera's frames and zinc:gfx runtime images. Every call here runs on a
// transceiver's worker thread (webrtc.host.cpp), never on the program's.
#include <stdint.h>
#include <map>
#include <string>
#include <vector>

namespace media {

/** A video encoder: VP8 (libvpx, media.cpp) or H.264 (VideoToolbox, videotoolbox.cpp). encode() takes one frame and gives its bytes as the
 *  packetizer of its codec takes them (VP8: the frame; H.264: 4-byte length-prefixed NAL units, SPS and PPS before each key frame). */
struct VideoEncoder {
  virtual ~VideoEncoder() {}
  virtual bool encode(const uint32_t* px, int w, int h, int64_t ms, bool forceKey, std::vector<uint8_t>& out, bool& key) = 0;
  /** Target bits per second and frames per second. */
  virtual void setRate(int bps, int fps) = 0;
  int w = 0, h = 0;
};
/** A video decoder: VP8 (libvpx) or H.264 (VideoToolbox; it takes Annex B: 00 00 00 01 before each NAL unit). */
struct VideoDecoder {
  virtual ~VideoDecoder() {}
  virtual bool decode(const uint8_t* data, size_t n, std::vector<uint32_t>& px, int& w, int& h) = 0;
};

VideoEncoder* vp8Encoder(int w, int h, int bps, int fps);
VideoDecoder* vp8Decoder();
/** H.264 constrained baseline in hardware (VideoToolbox on macOS); nullptr where there is none. */
bool h264Available();
VideoEncoder* h264Encoder(int w, int h, int bps, int fps);
VideoDecoder* h264Decoder();

/** Opus at 48 kHz in 20 ms frames (960 samples per channel). */
struct OpusEnc;
struct OpusDec;
OpusEnc* opusEncoder(int channels, int bps);
int opusEncode(OpusEnc* e, const float* pcm, uint8_t* out, int max);
void opusFree(OpusEnc* e);
OpusDec* opusDecoder();
/** One frame of mono samples into pcm (960 for 20 ms), or concealment when data is null; the count, < 0 on error. */
int opusDecode(OpusDec* d, const uint8_t* data, int n, float* pcm, int max);
void opusFree(OpusDec* d);

/** BGRX -> I420 (BT.601, limited range) and back; odd sizes round the chroma planes up. */
void toI420(const uint32_t* px, int w, int h, int stride, uint8_t* y, int ys, uint8_t* u, int us, uint8_t* v, int vs);
void fromI420(const uint8_t* y, int ys, const uint8_t* u, int us, const uint8_t* v, int vs, int w, int h, uint32_t* px);
/** Nearest-neighbour scale of BGRX pixels. */
void scale(const uint32_t* src, int sw, int sh, uint32_t* dst, int dw, int dh);

/** The receive side of one RTP stream: packets in, whole frames out in sequence order. Video frames are the packets of one timestamp up to
 *  the marker bit; audio frames are single packets. A gap that has not filled after `waitMs` is a loss: video skips to the next key frame
 *  (needKey() says to ask for one), audio reports the lost frames so the decoder can conceal them. */
struct Reassembler {
  enum Codec { VP8, H264, OPUS };
  explicit Reassembler(Codec c) : codec(c) {}
  /** One RTP packet (header included). */
  void push(const uint8_t* p, size_t n, int64_t nowMs);
  /** The next whole frame (VP8: the frame; H.264: Annex B; Opus: the packet), or false. `lost` counts the audio frames lost before it. */
  bool pop(std::vector<uint8_t>& frame, int64_t nowMs, int& lost, bool& key);
  /** True once after a loss of video: a key frame should be asked for (PLI). */
  bool needKey() { bool k = askKey; askKey = false; return k; }
  Codec codec;
 private:
  struct Pkt { uint32_t ts; bool marker; int64_t at; std::vector<uint8_t> payload; };
  std::map<int64_t, Pkt> q;   // by extended sequence number
  int64_t next = -1, maxSeq = -1;
  bool waitKey = true, askKey = false;
  bool payload(const Pkt& p, std::vector<uint8_t>& out, bool first, bool& key);
};

}  // namespace media
