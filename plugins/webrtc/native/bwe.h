#pragma once
// zinc:webrtc rate control for video (bwe.cpp): what the receiver asks for (NACK, REMB) and what the sender sends (bit rate, size, frame rate).
//   NackList          the receiver's missing packets, asked again (RFC 4585 generic NACK) every round trip until they come or are too old;
//   RemoteEstimator   the receiver's estimate of the link (the REMB it sends): libwebrtc's single-stream remote bitrate estimator, ported;
//   SendRate          the sender's rate: min(the peer's REMB, a loss-based rate from its receiver reports), and the ladder of sizes and
//                     frame rates that rate allows (720p30, 360p30, 360p15, 180p15, 90p7, off), with hysteresis.
// Plain classes with the time passed in, no threads and no clocks of their own, so tests/t0/webrtc_bwe_sim.sh drives them with a simulated link.
#include <stddef.h>
#include <stdint.h>
#include <deque>
#include <map>
#include <vector>

namespace bwe {

/** The receiver's missing sequence numbers (extended). push() each received packet; due() the ones to ask for now. */
struct NackList {
  /** A packet arrived; false when the gap before it is too wide to ask for (the caller asks for a key frame). */
  bool push(int64_t ext, int64_t nowMs);
  /** The packets to NACK now (a first time, or again `rttMs` after the last ask), at most `retries` asks each; packets older than `maxAgeMs`
   *  are given up (the reassembler then skips them and asks for a key frame). */
  std::vector<int64_t> due(int64_t nowMs, int rttMs, int64_t maxAgeMs);
  int64_t highest = -1;
  long long asked = 0, recovered = 0, givenUp = 0;   // NACKed sequence numbers (each ask), packets that came after a NACK, abandoned
  int retries = 10;
 private:
  struct Miss { int64_t first, last; int sent; };
  std::map<int64_t, Miss> miss;
};

/** One RTCP generic NACK (RFC 4585 6.2.1) for `seqs` (16-bit wrapped), from `sender` about `media`. */
std::vector<uint8_t> nackPacket(uint32_t sender, uint32_t media, const std::vector<int64_t>& seqs);

/** libwebrtc's remote bitrate estimator (BSD-3; vendor/PIN) on one stream: the delay between groups of packets (InterArrival), its trend
 *  against an adaptive threshold (TrendlineEstimator, which goog_cc uses in place of the older Kalman filter), and AIMD on the received rate
 *  (AimdRateControl, LinkCapacityEstimator). Times in ms, RTP timestamps at 90 kHz. */
struct RemoteEstimator {
  enum Usage { Normal, Underusing, Overusing };
  /** A packet: its RTP timestamp, when it arrived, its payload bytes. True when the estimate should go out now (a first overuse). */
  bool packet(uint32_t ts, int64_t arrivalMs, size_t bytes);
  /** At least every 500 ms: true with a new estimate in `bps` when there is a valid one (after the first overuse or 5 s of packets). */
  bool process(int64_t nowMs, uint32_t& bps);
  void setRtt(int ms) { rtt = ms; }
  Usage usage() const { return hypothesis; }
  uint32_t estimate() const { return initialized ? (uint32_t)current : 0; }
  /** The received rate over the last second (bit/s), -1 before there is one. */
  double incoming(int64_t nowMs);

 private:
  // InterArrival: groups of packets 5 ms of timestamps apart (bursts merged)
  struct Group { int64_t size = 0; uint32_t first = 0, ts = 0; int64_t firstArrival = -1, complete = -1; bool empty() const { return complete < 0; } };
  Group cur, prev;
  int reordered = 0;
  bool deltas(uint32_t ts, int64_t at, size_t bytes, uint32_t& tsDelta, int64_t& tDelta, int& sizeDelta);
  bool newGroup(int64_t at, uint32_t ts) const;
  // TrendlineEstimator: the slope of the smoothed accumulated delay over the last 20 groups, against an adaptive threshold
  int numDeltas = 0;
  int64_t firstArrival = -1, lastThresholdMs = -1;
  double accumulated = 0, smoothed = 0, prevTrend = 0, threshold = 12.5, timeOverUsing = -1;
  int overuseCounter = 0;
  std::deque<std::pair<double, double>> hist;   // (arrival ms since the first, smoothed delay)
  Usage hypothesis = Normal;
  void trendline(double recvDelta, double sendDelta, int64_t arrivalMs);
  // the received rate (RateStatistics, 1 s window)
  std::deque<std::pair<int64_t, size_t>> window;
  int64_t windowBytes = 0, firstSampleMs = -1;
  // AimdRateControl and LinkCapacityEstimator
  enum State { Hold, Increase, Decrease } state = Hold;
  double current = 30e6, throughput = 30e6;
  bool initialized = false;
  int64_t firstThroughputMs = -1, lastChangeMs = -1, lastPacketMs = -1, lastProcessMs = -1, lastOveruseMs = -1;
  double capKbps = -1, capDev = 0.4;   // link capacity estimate (-1: none) and its normalised variance
  double peak = 0;                     // the highest estimate held before the last decrease: a rate the link carried (rapid recovery)
  int64_t peakMs = -1;
  int rtt = 200;
  bool timeToReduceFurther(int64_t now, double tp) const;
  void update(Usage u, double tp, int64_t now);
};

/** The sender's video rate: what the peer allows (REMB) and what the losses it reports allow, and the size and frame rate for it. */
struct SendRate {
  struct Rung { int height, fps; };
  /** The ladder, from the top: the height and frame rate of each step (720p30, 360p30, 360p15, 180p15, 90p7) and off. */
  static const Rung ladder[6];
  /** A receiver report: the fraction of packets lost since the last one (0 to 1), and the rate sent when it came (bit/s). */
  void report(double fractionLost, int64_t nowMs, int sendingBps);
  /** The peer's REMB (bit/s). */
  void remb(int bps, int64_t nowMs);
  /** The rate to send now: min(REMB, loss-based), capped by `fullBps` (the source's rate at full size). */
  int available(int fullBps) const;
  /** The rung for the rate `bps` and a source of `w` x `h` at `srcFps` whose full rate is `fullBps`: down at once when the rate falls under
   *  the current rung's floor after a congestion while the picture suffers (the encoder's average quantizer `qp`, 0 to 127, over 60; -1:
   *  unknown, the rate alone decides), up when it has stayed over the next rung's start for 1.5 s (bwe.cpp). Its size (even, never above
   *  the source) and frame rate in ow, oh, fps; false: off. */
  bool choose(int w, int h, int srcFps, int fullBps, int bps, int qp, int64_t nowMs, int& ow, int& oh, int& fps);
  int rung = 0;
  double lossBased = -1;   // bit/s, -1 until the first report
  int rembBps = 0;
  int64_t lastDecrease = -1, lastReport = -1, upSince = -1, offSince = -1, rembFellAt = -1, lossFellAt = -1;
  double peak = 0;   // the rate before the last loss-based decrease (rapid recovery)
 private:
  /** The rung's start and floor rates (bit/s) for the source's aspect: libwebrtc's default VP8 limits, scaled by the rung's pixels. */
  static void limits(int r, int w, int h, int srcFps, int fullBps, double& start, double& floor);
};

}  // namespace bwe
