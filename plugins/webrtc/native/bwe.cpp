// zinc:webrtc rate control for video (bwe.h). RemoteEstimator is a port of libwebrtc's single-stream remote bitrate estimator: the files of
// modules/remote_bitrate_estimator (inter_arrival.cc, aimd_rate_control.cc, remote_bitrate_estimator_single_stream.cc) and
// modules/congestion_controller/goog_cc (trendline_estimator.cc, link_capacity_estimator.cc), Copyright (c) 2012-2013
// The WebRTC project authors, BSD-3-Clause (vendor/PIN names the revision and the licence). The constants are theirs; what differs is said
// where it is (rapid recovery, below).
#include "bwe.h"
#include <math.h>
#include <algorithm>

namespace bwe {

// ---- NACK (RFC 4585): libwebrtc's NackRequester in short: ask at once, again every round trip, at most `retries` times, while the packet
// can still make its frame. Every frame is asked for: libdatachannel's VP8 packetizer sets the N bit (non-reference) on every delta frame,
// so the bit says nothing about what may be skipped.
bool NackList::push(int64_t ext, int64_t nowMs) {
  if (highest < 0) { highest = ext; return true; }
  if (ext <= highest) {   // late: reordered, or a retransmission
    auto it = miss.find(ext);
    if (it != miss.end()) { if (it->second.sent > 0) recovered++; miss.erase(it); }
    return true;
  }
  const int64_t gap = ext - highest - 1;
  if (gap > 500) { givenUp += (long long)miss.size(); miss.clear(); highest = ext; return false; }   // too much to repair: a key frame instead
  for (int64_t s = highest + 1; s < ext; s++) miss[s] = Miss{nowMs, -1, 0};
  while (miss.size() > 1000) { givenUp++; miss.erase(miss.begin()); }
  highest = ext;
  return true;
}

std::vector<int64_t> NackList::due(int64_t nowMs, int rttMs, int64_t maxAgeMs) {
  std::vector<int64_t> out;
  const int64_t every = rttMs < 20 ? 20 : rttMs;
  for (auto it = miss.begin(); it != miss.end();) {
    Miss& m = it->second;
    if (nowMs - m.first > maxAgeMs || m.sent >= retries) { givenUp++; it = miss.erase(it); continue; }
    if (m.last < 0 || nowMs - m.last >= every) { out.push_back(it->first); m.sent++; m.last = nowMs; asked++; }
    ++it;
  }
  return out;
}

std::vector<uint8_t> nackPacket(uint32_t sender, uint32_t media, const std::vector<int64_t>& seqs) {
  std::vector<uint8_t> p(12);
  auto be32 = [&](size_t at, uint32_t v) { p[at] = (uint8_t)(v >> 24); p[at + 1] = (uint8_t)(v >> 16); p[at + 2] = (uint8_t)(v >> 8); p[at + 3] = (uint8_t)v; };
  p[0] = 0x81; p[1] = 205;   // V=2, FMT=1 (generic NACK), PT=205 (RTPFB)
  be32(4, sender); be32(8, media);
  for (size_t i = 0; i < seqs.size();) {   // one FCI: a packet id and a bitmask of the 16 after it
    const int64_t pid = seqs[i++];
    uint16_t blp = 0;
    while (i < seqs.size() && seqs[i] - pid <= 16) blp |= (uint16_t)(1u << (seqs[i++] - pid - 1));
    p.push_back((uint8_t)(pid >> 8)); p.push_back((uint8_t)pid); p.push_back((uint8_t)(blp >> 8)); p.push_back((uint8_t)blp);
  }
  const size_t words = p.size() / 4 - 1;
  p[2] = (uint8_t)(words >> 8); p[3] = (uint8_t)words;
  return p;
}

// ---- InterArrival (inter_arrival.cc): packets of timestamps within 5 ms form a group; bursts (arriving faster than sent) join the group.
static const uint32_t kGroupTicks = 90 * 5;
static const double kTsToMs = 1.0 / 90.0;

bool RemoteEstimator::newGroup(int64_t at, uint32_t ts) const {
  if (cur.empty()) return false;
  const int64_t atDelta = at - cur.complete;
  const int64_t tsDeltaMs = (int64_t)(kTsToMs * (uint32_t)(ts - cur.ts) + 0.5);
  if (tsDeltaMs == 0) return false;
  if (atDelta - tsDeltaMs < 0 && atDelta <= 5 && at - cur.firstArrival < 100) return false;   // a burst
  return (uint32_t)(ts - cur.first) > kGroupTicks;
}

bool RemoteEstimator::deltas(uint32_t ts, int64_t at, size_t bytes, uint32_t& tsDelta, int64_t& tDelta, int& sizeDelta) {
  bool got = false;
  if (cur.empty()) { cur.ts = cur.first = ts; cur.firstArrival = at; }
  else if ((uint32_t)(ts - cur.first) >= 0x80000000u) return false;   // an older frame (a retransmission): not timed
  else if (newGroup(at, ts)) {
    if (prev.complete >= 0) {
      tsDelta = cur.ts - prev.ts;
      tDelta = cur.complete - prev.complete;
      if (tDelta < 0) {
        if (++reordered >= 3) { reordered = 0; cur = Group(); prev = Group(); }
        return false;
      }
      reordered = 0;
      sizeDelta = (int)(cur.size - prev.size);
      got = true;
    }
    prev = cur;
    cur.first = cur.ts = ts; cur.firstArrival = at; cur.size = 0;
  } else if ((uint32_t)(ts - cur.ts) < 0x80000000u) cur.ts = ts;
  cur.size += (int64_t)bytes;
  cur.complete = at;
  return got;
}

// ---- TrendlineEstimator (goog_cc/trendline_estimator.cc, its defaults: window 20, smoothing 0.9, gain 4, no sort, no cap).
void RemoteEstimator::trendline(double recvDelta, double sendDelta, int64_t arrivalMs) {
  if (++numDeltas > 1000) numDeltas = 1000;
  if (firstArrival < 0) firstArrival = arrivalMs;
  accumulated += recvDelta - sendDelta;
  smoothed = 0.9 * smoothed + 0.1 * accumulated;
  hist.push_back({(double)(arrivalMs - firstArrival), smoothed});
  if (hist.size() > 20) hist.pop_front();
  double trend = prevTrend;
  if (hist.size() == 20) {   // the least-squares slope of the smoothed delay over arrival time
    double sx = 0, sy = 0;
    for (auto& p : hist) { sx += p.first; sy += p.second; }
    const double xa = sx / hist.size(), ya = sy / hist.size();
    double num = 0, den = 0;
    for (auto& p : hist) { num += (p.first - xa) * (p.second - ya); den += (p.first - xa) * (p.first - xa); }
    if (den != 0) trend = num / den;
  }
  if (numDeltas < 2) { hypothesis = Normal; return; }
  const double T = std::min(numDeltas, 60) * trend * 4.0;
  if (T > threshold) {
    timeOverUsing = timeOverUsing == -1 ? sendDelta / 2 : timeOverUsing + sendDelta;
    overuseCounter++;
    if (timeOverUsing > 10 && overuseCounter > 1 && trend >= prevTrend) { timeOverUsing = 0; overuseCounter = 0; hypothesis = Overusing; }
  } else if (T < -threshold) { timeOverUsing = -1; overuseCounter = 0; hypothesis = Underusing; }
  else { timeOverUsing = -1; overuseCounter = 0; hypothesis = Normal; }
  prevTrend = trend;
  if (lastThresholdMs == -1) lastThresholdMs = arrivalMs;
  if (fabs(T) > threshold + 15.0) { lastThresholdMs = arrivalMs; return; }
  const double k = fabs(T) < threshold ? 0.039 : 0.0087;
  threshold += k * (fabs(T) - threshold) * (double)std::min<int64_t>(arrivalMs - lastThresholdMs, 100);
  threshold = std::min(600.0, std::max(6.0, threshold));
  lastThresholdMs = arrivalMs;
}

double RemoteEstimator::incoming(int64_t nowMs) {
  while (!window.empty() && nowMs - window.front().first >= 1000) { windowBytes -= (int64_t)window.front().second; window.pop_front(); }
  if (window.empty()) { firstSampleMs = -1; return -1; }
  const int64_t span = std::min<int64_t>(1000, nowMs - firstSampleMs + 1);
  if (span <= 1 || (window.size() <= 1 && span < 1000)) return -1;
  return windowBytes * 8000.0 / (double)span;
}

// ---- AimdRateControl (aimd_rate_control.cc) with LinkCapacityEstimator.
// Zinc: rapid recovery. libwebrtc climbs back by 8% a second (and additively near the last capacity); Chrome gets back faster by probing,
// which a receiver-side estimate cannot do. So while the estimate is under the highest it held in the last minute before a decrease (a
// rate this link carried), it climbs by 25% a second and the capacity estimate is dropped 3 s after the last overuse: back from 300 kbit/s
// to 1 Mbit/s in about 7 s instead of about 20. A link that really shrank overuses again within a second or two, as libwebrtc's would.
bool RemoteEstimator::timeToReduceFurther(int64_t now, double tp) const {
  const int interval = std::min(200, std::max(10, rtt));
  if (now - lastChangeMs >= interval) return true;
  return initialized && tp < 0.5 * current;
}

void RemoteEstimator::update(Usage u, double tp, int64_t now) {
  if (!initialized) {
    if (firstThroughputMs < 0) { if (tp >= 0) firstThroughputMs = now; }
    else if (now - firstThroughputMs > 5000 && tp >= 0) { current = tp; initialized = true; }
  }
  const double est = tp >= 0 ? tp : throughput;
  if (tp >= 0) throughput = tp;
  if (!initialized && u != Overusing) return;
  if (u == Normal) { if (state == Hold) { lastChangeMs = now; state = Increase; } }
  else if (u == Overusing) state = Decrease;
  else state = Hold;
  const bool recovering = peakMs >= 0 && now - peakMs < 60000 && current < peak * 0.95;
  if (recovering && capKbps >= 0 && lastOveruseMs >= 0 && now - lastOveruseMs > 3000) capKbps = -1;
  const double dev = capKbps >= 0 ? sqrt(capDev * capKbps) : 0;
  double next = current;
  if (state == Increase) {
    if (capKbps >= 0 && est > (capKbps + 3 * dev) * 1000) capKbps = -1;
    const double limit = 1.5 * est + 10000;
    if (current < limit) {
      const double secs = lastChangeMs >= 0 ? (now - lastChangeMs) / 1000.0 : 1.0;
      double inc;
      if (capKbps >= 0) {   // near the capacity: about one packet per response time
        const double frameBits = current / 30;
        const double packets = ceil(frameBits / 8 / 1200);
        const double response = 2 * (rtt + 100) / 1000.0;
        inc = std::max(4000.0, frameBits / packets / response) * secs;
      } else {
        const double alpha = pow(recovering ? 1.25 : 1.08, std::min(secs, 1.0));
        inc = std::max(current * (alpha - 1), 1000.0);
      }
      next = std::min(current + inc, limit);
    }
    lastChangeMs = now;
  } else if (state == Decrease) {
    double d = est * 0.85;
    if (d > 5000) d -= 5000;
    if (d > current && capKbps >= 0) d = 0.85 * capKbps * 1000;
    if (d < current) {
      if (initialized && (current > peak || now - peakMs >= 60000)) { peak = current; peakMs = now; }
      next = d;
    }
    if (capKbps >= 0 && est < std::max(0.0, capKbps - 3 * dev) * 1000) capKbps = -1;
    initialized = true;
    const double s = est / 1000;   // LinkCapacityEstimator::OnOveruseDetected
    if (capKbps < 0) capKbps = s;
    else capKbps = 0.95 * capKbps + 0.05 * s;
    const double err = capKbps - s;
    capDev = std::min(2.5, std::max(0.4, 0.95 * capDev + 0.05 * err * err / std::max(capKbps, 1.0)));
    state = Hold;
    lastChangeMs = now; lastOveruseMs = now;
  }
  current = std::max(next, 5000.0);
}

bool RemoteEstimator::packet(uint32_t ts, int64_t arrivalMs, size_t bytes) {
  lastPacketMs = arrivalMs;
  incoming(arrivalMs);
  if (firstSampleMs < 0) firstSampleMs = arrivalMs;
  window.push_back({arrivalMs, bytes});
  windowBytes += (int64_t)bytes;
  const Usage prior = hypothesis;
  uint32_t tsDelta = 0;
  int64_t tDelta = 0;
  int sizeDelta = 0;
  if (deltas(ts, arrivalMs, bytes, tsDelta, tDelta, sizeDelta)) {
    (void)sizeDelta;
    trendline((double)tDelta, tsDelta * kTsToMs, arrivalMs);
  }
  if (hypothesis != Overusing) return false;
  const double tp = incoming(arrivalMs);
  if (tp < 0 || (prior == Overusing && !timeToReduceFurther(arrivalMs, tp))) return false;
  update(Overusing, tp, arrivalMs);   // the first overuse goes out at once, as a further one when the rate is far above what arrives
  lastProcessMs = arrivalMs;
  return initialized;
}

bool RemoteEstimator::process(int64_t nowMs, uint32_t& bps) {
  // the feedback interval: 5% of the estimate in 80-byte reports, 200 ms to 1 s
  const int64_t every = std::min<int64_t>(1000, std::max<int64_t>(200, (int64_t)(80 * 8 * 1000 / std::max(current * 0.05, 1.0))));
  if (lastProcessMs >= 0 && nowMs - lastProcessMs < (initialized ? every : 500)) return false;
  lastProcessMs = nowMs;
  if (lastPacketMs < 0 || nowMs - lastPacketMs > 2000) return false;   // the stream stopped: no estimate
  update(hypothesis, incoming(nowMs), nowMs);
  if (!initialized) return false;
  bps = (uint32_t)current;
  return true;
}

// ---- the sender
const SendRate::Rung SendRate::ladder[6] = {{720, 30}, {360, 30}, {360, 15}, {180, 15}, {90, 7}, {0, 0}};

namespace {
void outOf(int r, int w, int h, int srcFps, int& ow, int& oh, int& fps) {
  const SendRate::Rung& g = SendRate::ladder[r];
  oh = std::min(h, g.height) & ~1;
  ow = (int)((int64_t)w * oh / (h > 0 ? h : 1)) & ~1;
  if (ow < 16) ow = 16;
  if (oh < 16) oh = 16;
  fps = std::min(srcFps, g.fps);
}
bool same(int a, int b, int w, int h, int srcFps) {
  int aw, ah, af, bw, bh, bf;
  outOf(a, w, h, srcFps, aw, ah, af);
  outOf(b, w, h, srcFps, bw, bh, bf);
  return aw == bw && ah == bh && af == bf;
}
}  // namespace

// What a rung needs: 1 Mbit/s at 1280x720 and 30 fps to stay, 1.5 Mbit/s to come up to it, scaled by pixels per second to the power 0.75
// (smaller pictures need more bits per pixel): 360p30 354/530 kbit/s, 360p15 210/315, 180p15 74/111, 90p7 15/22 (libwebrtc's default VP8
// resolution limits are of that order).
void SendRate::limits(int r, int w, int h, int srcFps, int fullBps, double& start, double& floor) {
  int ow, oh, fps;
  outOf(r, w, h, srcFps, ow, oh, fps);
  floor = 1e6 * pow((double)ow * oh * fps / (1280.0 * 720 * 30), 0.75);
  start = std::min(floor * 1.5, fullBps * 0.95);   // a source whose full rate is under the table's: its own full rate opens the rung
  floor = std::min(floor, start / 1.5);
}

void SendRate::report(double fractionLost, int64_t nowMs, int sendingBps) {
  // libwebrtc's loss-based rate (SendSideBandwidthEstimation): up 8% a second under 2% loss, held to 10%, down by half the loss above
  // (at most every 300 ms); 25% a second while it is under the rate it had before a decrease (rapid recovery, as RemoteEstimator).
  const double secs = lastReport >= 0 ? std::min(1.0, (nowMs - lastReport) / 1000.0) : 1.0;
  lastReport = nowMs;
  if (fractionLost < 0.02) {
    if (lossBased > 0) {
      lossBased = lossBased * pow(lossBased < peak ? 1.25 : 1.08, secs) + 1000;
      if (lossBased >= peak) lossBased = -1;   // back where it was: no loss limit
    }
  } else if (fractionLost > 0.1 && (lastDecrease < 0 || nowMs - lastDecrease >= 300)) {
    const double base = lossBased > 0 ? lossBased : sendingBps;
    if (base > peak || lossBased < 0) peak = base;
    lossBased = std::max(30000.0, base * (1 - 0.5 * fractionLost));
    lastDecrease = lossFellAt = nowMs;
  }
}

void SendRate::remb(int bps, int64_t nowMs) {
  // only an overuse lowers a REMB. The first one is not a fall: the estimate starts at what arrives (after a first overuse, which a still
  // picture's jitter can be), and a link that is really thin lowers it again within a round trip or two.
  if (rembBps > 0 && bps < rembBps * 0.95) rembFellAt = nowMs;
  rembBps = bps;
}

int SendRate::available(int fullBps) const {
  double r = fullBps;
  if (rembBps > 0) r = std::min(r, (double)rembBps);
  if (lossBased > 0) r = std::min(r, lossBased);
  return (int)r;
}

// A REMB says how much the receiver takes, not only what the link holds: under an encoder that does not use its budget (a still picture) the
// REMB is 1.5 times what arrives, so a low REMB alone is no reason to send a smaller picture. The ladder steps down when the rate falls
// under the rung's floor, what sets the rate fell in the last 3 s (a REMB under the one before, which only an overuse does, or a
// loss-based decrease) and the picture suffers: the encoder's quantizer is high (libwebrtc's quality scaler reads the same:
// a still picture at a low rate keeps its size). It steps up after 1.5 s over the next rung's start, or over the next rung's floor once
// nothing fell for 5 s (a congestion sends it down again).
bool SendRate::choose(int w, int h, int srcFps, int fullBps, int bps, int qp, int64_t nowMs, int& ow, int& oh, int& fps) {
  const int off = 5;
  const bool byLoss = lossBased > 0 && (rembBps <= 0 || lossBased < rembBps);
  const int64_t fell = bps >= fullBps ? -1 : byLoss ? lossFellAt : rembFellAt;
  const bool congested = fell >= 0 && nowMs - fell < 3000, calm = fell < 0 || nowMs - fell >= 5000;
  double start, floor;
  if (rung == off) {   // nothing is sent, so nothing tells the rate: try the lowest rung again after 5 s
    limits(off - 1, w, h, srcFps, fullBps, start, floor);
    if (offSince < 0) offSince = nowMs;
    if (bps >= start || nowMs - offSince > 5000) { rung = off - 1; offSince = -1; upSince = -1; }
  }
  while (rung > 0 && rung < off && same(rung - 1, rung, w, h, srcFps)) rung--;   // a small source: the top of rungs alike
  for (;;) {   // down at once, past the rungs alike
    if (rung == off) break;
    limits(rung, w, h, srcFps, fullBps, start, floor);
    if (bps >= floor || !congested || (qp >= 0 && qp <= 60)) break;
    int r = rung + 1;
    while (r < off && same(r, rung, w, h, srcFps)) r++;
    rung = r; upSince = -1;
    if (rung == off) offSince = nowMs;
  }
  if (rung > 0 && rung < off) {   // up
    limits(rung - 1, w, h, srcFps, fullBps, start, floor);
    if (bps >= start || (calm && bps >= floor)) {
      if (upSince < 0) upSince = nowMs;
      else if (nowMs - upSince >= 1500) { rung--; upSince = nowMs; }
    } else upSince = -1;
  }
  if (rung == off) return false;
  outOf(rung, w, h, srcFps, ow, oh, fps);
  return true;
}

}  // namespace bwe
