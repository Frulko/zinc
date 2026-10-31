#pragma once
// zinc:webrtc's audio jitter buffer (jitter.cpp): the Opus packets of one stream in, 48 kHz mono samples out at the pace of the clock.
// It holds the packets for a target delay taken from the measured jitter (2 x its 95th percentile over 5 s, 40 to 300 ms, and at least
// the longest run of lost packets of the window, up to 120 ms, so the packet after it can rebuild it), and grows or
// shrinks toward the target by time-scaling the speech with Sonic (vendor/sonic) instead of inserting silence or dropping audio. A packet
// missing at its turn is rebuilt from the next one's in-band FEC or its deep redundancy (DRED), else concealed by Opus (deep PLC);
// a gap of timestamps with no gap of sequence numbers is the sender's DTX silence, played as Opus's comfort noise.
#include <stdint.h>
#include <deque>
#include <map>
#include <vector>
#include "media.h"

struct sonicStreamStruct;

namespace media {

struct JitterStats {
  long long samples = 0;                       // decoded from packets that came in time
  long long concealed = 0;                     // concealed (deep PLC): lost, or the buffer ran dry
  long long fecPackets = 0, fecSamples = 0, dredSamples = 0;   // rebuilt from the next packet
  long long late = 0;                          // packets that came after their turn
  long long emitted = 0;                       // samples given out (jitterBufferEmittedCount)
  double delay = 0, target = 0;                // seconds x samples: jitterBufferDelay, jitterBufferTargetDelay
  long long inserted = 0, removed = 0;         // samples time-scaling added (deceleration) or took away (acceleration)
  double mouthToEar = 0;                       // seconds, summed over mouthToEarCount packets (captureOf known: one process)
  long long mouthToEarCount = 0;
};

class AudioJitterBuffer {
 public:
  /** captureOf: when the sample of (ssrc, RTP timestamp) was captured, in nowMs() milliseconds, or -1 (the loopback knows it). */
  explicit AudioJitterBuffer(int64_t (*captureOf)(uint32_t, uint32_t) = nullptr);
  ~AudioJitterBuffer();
  /** One RTP packet of Opus (header included), received at atMs. */
  void push(const uint8_t* rtp, size_t n, int64_t atMs);
  /** The samples due by nowMs, appended to out. */
  void pull(int64_t nowMs, std::vector<float>& out);
  JitterStats st;
  int targetMs = 40;

 private:
  struct Pkt { uint16_t seq; uint32_t ts32; int64_t at; std::vector<uint8_t> data; };
  OpusDec* dec;
  sonicStreamStruct* sonic;
  int64_t (*captureOf)(uint32_t, uint32_t);
  std::map<int64_t, Pkt> pkts;                 // by extended RTP timestamp
  std::deque<std::pair<int64_t, double>> arrivals;   // (at, at - ts in ms) of the last 5 s, for the target
  std::deque<std::pair<int64_t, int>> bursts;        // (at, ms) of the runs of lost packets of the last 5 s
  uint16_t highSeq = 0;
  bool haveHigh = false;
  std::vector<float> q;                        // decoded and time-scaled, not yet given out
  size_t qAt = 0;
  int64_t lastTs = -1, playTs = 0, clock0 = 0, firstAt = -1, dredFor = -1;
  uint32_t lastTs32 = 0, ssrc = 0;
  uint16_t lastSeq = 0;
  bool haveSeq = false, started = false;
  long long pendingDry = 0;                    // concealed since the last packet: given back when that turns out to be DTX
  double delayAvg = -1;                        // ms a packet waits before it plays, smoothed
  int mode = 0;                                // -1 stretching, 0 as is, 1 accelerating
  int dredAvail = 0;
  void produce(int64_t nowMs);
  void reset();
  int queued() const;
};

}  // namespace media
