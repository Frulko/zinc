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
  /** The quantizer of the last frame, 0 (finest) to 127 (coarsest; VP8's scale, as libwebrtc's quality scaler reads it), -1 unknown. */
  virtual int qp() { return -1; }
  int w = 0, h = 0;
  /** The temporal layer of the last frame (VP8 with two layers; 0 otherwise): its TID, sync (it refers to the base layer only), nonref (no
   *  later frame refers to it). */
  int tid = 0;
  bool sync = false, nonref = false;
};
/** A video decoder: VP8 (libvpx) or H.264 (VideoToolbox; it takes Annex B: 00 00 00 01 before each NAL unit). */
struct VideoDecoder {
  virtual ~VideoDecoder() {}
  virtual bool decode(const uint8_t* data, size_t n, std::vector<uint32_t>& px, int& w, int& h) = 0;
  /** Frames at most w x h (the aspect kept; 0: the stream's size), from the next key frame on. Scaled by the decoder where it can
   *  (VideoToolbox), else ignored. */
  virtual void fit(int w, int h) { (void)w; (void)h; }
};

/** layers 2: two temporal layers (the base at half the frame rate and 60% of the rate, the frames between that nothing refers to), for an SFU
 *  to forward the base alone to a slow receiver. */
VideoEncoder* vp8Encoder(int w, int h, int bps, int fps, int layers = 1);
VideoDecoder* vp8Decoder();
/** H.264 constrained baseline in hardware (VideoToolbox on macOS); nullptr where there is none. */
bool h264Available();
VideoEncoder* h264Encoder(int w, int h, int bps, int fps);
VideoDecoder* h264Decoder();

/** Opus at 48 kHz, in packets of 20, 40 or 60 ms (960, 1920 or 2880 samples per channel). */
struct OpusEnc;
struct OpusDec;
OpusEnc* opusEncoder(int channels, int bps);
/** A new target: at 16 kbit/s and under (the low data mode) voice-only, wideband at most, DTX (silence sends a frame every 400 ms);
 *  above, the defaults. In-band FEC stays on, sized by opusSetLoss. */
void opusSetBitrate(OpusEnc* e, int bps);
/** The loss the peer reports, in per cent: the in-band FEC is sized for it (OPUS_SET_PACKET_LOSS_PERC). */
void opusSetLoss(OpusEnc* e, int pct);
/** Deep redundancy (DRED, Opus 1.5+): up to `ms` of the past in every packet, for a peer that decodes it; 0 turns it off. False when this
 *  build has no DRED. */
bool opusSetDred(OpusEnc* e, int ms);
/** One packet of `samples` (960, 1920 or 2880) into out; its size, < 0 on error. */
int opusEncode(OpusEnc* e, const float* pcm, uint8_t* out, int max, int samples = 960);
void opusFree(OpusEnc* e);
OpusDec* opusDecoder();
/** The samples of one packet (48 kHz), < 0 when it is not Opus. */
int opusSamples(const uint8_t* data, int n);
/** True when the packet carries an in-band FEC copy (LBRR) of the one before it. */
bool opusHasFec(const uint8_t* data, int n);
/** One packet of mono samples into pcm, or `max` samples of concealment (deep PLC where built) when data is null; with fec, the `max`
 *  samples before this packet from its in-band FEC (concealment for what it does not hold). The count, < 0 on error. */
int opusDecode(OpusDec* d, const uint8_t* data, int n, float* pcm, int max, bool fec = false);
/** The deep redundancy of a packet: how many samples before it can be rebuilt (0: none, or no DRED in this build). */
int opusDredParse(OpusDec* d, const uint8_t* data, int n, int maxSamples);
/** `samples` samples rebuilt from the last parsed redundancy, starting `offset` samples before the packet. The count, < 0 on error. */
int opusDredDecode(OpusDec* d, int offset, float* pcm, int samples);
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
  /** Video frames thrown away whole: incomplete, or waiting for a key frame (framesDropped). */
  long long dropped = 0;
  /** How long a gap may take to fill (ms): 0 is 100 for video and 60 for audio; the host sets it from the round trip while NACKs repair. */
  int waitMs = 0;
 private:
  struct Pkt { uint32_t ts; bool marker; int64_t at; std::vector<uint8_t> payload; };
  std::map<int64_t, Pkt> q;   // by extended sequence number
  int64_t next = -1, maxSeq = -1;
  bool waitKey = true, askKey = false;
  bool payload(const Pkt& p, std::vector<uint8_t>& out, bool first, bool& key);
};

}  // namespace media
