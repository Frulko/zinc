// zinc:webrtc's adaptive audio jitter buffer (jitter.h): Opus packets in, samples out by the clock, its delay following the measured jitter
// and changed by time-scaling the speech (Sonic, vendor/sonic: Apache-2.0) rather than by silence or cuts. NetEQ (libwebrtc) is the model:
// its packet buffer, its target from the inter-arrival delays, its accelerate and preemptive expand; Sonic does the time scaling.
#include "jitter.h"
#include "sonic.h"
#include <algorithm>

namespace media {
namespace {
inline uint16_t be16(const uint8_t* p) { return (uint16_t)(p[0] << 8 | p[1]); }
inline uint32_t be32(const uint8_t* p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
const int kWindowMs = 5000;                  // the jitter of the last 5 s sets the target
const int kMinTarget = 40, kMaxTarget = 300;
const int kMaxBurst = 200;   // the longest run of losses the delay covers: as far back as a Zinc peer's DRED reaches (kDredMs)
const float kFaster = 1.15f, kSlower = 0.9f;   // 15% of the time taken away, or 10% added, while the delay moves toward the target
}  // namespace

AudioJitterBuffer::AudioJitterBuffer(int64_t (*capture)(uint32_t, uint32_t)) : dec(opusDecoder()), sonic(sonicCreateStream(48000, 1)), captureOf(capture) {}
AudioJitterBuffer::~AudioJitterBuffer() {
  opusFree(dec);
  if (sonic) sonicDestroyStream(sonic);
}

void AudioJitterBuffer::reset() {
  pkts.clear(); arrivals.clear(); q.clear(); qAt = 0;
  bursts.clear(); haveHigh = false;
  lastTs = -1; started = false; haveSeq = false; firstAt = -1; dredFor = -1; delayAvg = -1; mode = 0; pendingDry = 0;
  if (sonic) { sonicDestroyStream(sonic); sonic = sonicCreateStream(48000, 1); }
}

int AudioJitterBuffer::queued() const { return (int)(q.size() - qAt) + (sonic ? sonicSamplesAvailable(sonic) : 0); }

void AudioJitterBuffer::push(const uint8_t* p, size_t n, int64_t at) {
  if (n < 12 || (p[0] >> 6) != 2) return;
  size_t hl = 12 + 4 * (p[0] & 15);
  if ((p[0] & 0x10) && n >= hl + 4) hl += 4 + 4 * (size_t)be16(p + hl + 2);
  if (p[0] & 0x20) n -= p[n - 1] < n ? p[n - 1] : 0;   // padding
  if (hl >= n) return;
  const uint32_t ts = be32(p + 4);
  int64_t e = lastTs < 0 ? ts : lastTs + (int32_t)(ts - lastTs32);
  if (started && (e - playTs > 48000 * 10 || playTs - e > 48000 * 10)) {   // the sender started over
    reset(); e = ts;
  }
  if (lastTs < 0 || e > lastTs) { lastTs = e; lastTs32 = ts; }
  if (firstAt < 0) { firstAt = at; playTs = e; }
  ssrc = be32(p + 8);
  if (started && e < playTs) { st.late++; return; }   // its turn went by: it was concealed
  Pkt& k = pkts[e];
  k.seq = be16(p + 2); k.ts32 = ts; k.at = at;
  k.data.assign(p + hl, p + n);
  // the target: 2 x the 95th percentile of each packet's delay over the fastest one of the window (RFC 3550's transit, relative)
  arrivals.push_back({at, at - e / 48.0});
  while (!arrivals.empty() && at - arrivals.front().first > kWindowMs) arrivals.pop_front();
  double lo = arrivals.front().second;
  for (auto& a : arrivals) lo = std::min(lo, a.second);
  std::vector<double> rel;
  rel.reserve(arrivals.size());
  for (auto& a : arrivals) rel.push_back(a.second - lo);
  const size_t k95 = rel.size() * 95 / 100;
  std::nth_element(rel.begin(), rel.begin() + (long)std::min(k95, rel.size() - 1), rel.end());
  int t = (int)(2 * rel[std::min(k95, rel.size() - 1)]);
  // and a run of lost packets: the next one rebuilds them (FEC, DRED) only if it is here before their turn, so the delay covers the
  // longest run of the window, up to kMaxBurst
  if (haveHigh) {
    const int16_t d = (int16_t)(k.seq - highSeq);
    if (d > 1) {
      int dur = opusSamples(k.data.data(), (int)k.data.size());
      if (dur <= 0 || dur > 5760) dur = 960;
      bursts.push_back({at, (d - 1) * dur / 48});
    }
    if (d > 0) highSeq = k.seq;
  } else { highSeq = k.seq; haveHigh = true; }
  while (!bursts.empty() && at - bursts.front().first > kWindowMs) bursts.pop_front();
  for (auto& b : bursts) t = std::max(t, std::min(b.second, kMaxBurst) + 20);
  targetMs = t < kMinTarget ? kMinTarget : t > kMaxTarget ? kMaxTarget : t;
}

// One more piece of audio at playTs into q, through Sonic: the packet whose turn it is, or what stands for a missing one.
void AudioJitterBuffer::produce(int64_t now) {
  float buf[5760];
  int n = 0;
  bool decoded = false;
  auto it = pkts.begin();
  if (it != pkts.end() && it->first <= playTs) {   // its turn: decode it
    Pkt& k = it->second;
    n = opusDecode(dec, k.data.data(), (int)k.data.size(), buf, 5760);
    if (n > 0) {
      st.samples += n;
      const double waited = (double)(now - k.at) + queued() / 48.0;   // ms from its arrival to its first sample out
      st.delay += waited / 1000 * n;
      delayAvg = delayAvg < 0 ? waited : delayAvg + (waited - delayAvg) / 8;
      if (captureOf) {
        const int64_t c = captureOf(ssrc, k.ts32);
        if (c >= 0) { st.mouthToEar += (now + queued() / 48.0 - c) / 1000; st.mouthToEarCount++; }
      }
      decoded = true;
    }
    if (haveSeq && k.seq == (uint16_t)(lastSeq + 1)) st.concealed -= pendingDry;   // the dry spell was the sender's DTX, not a loss
    pendingDry = 0;
    lastSeq = k.seq; haveSeq = true;
    pkts.erase(it);
    if (n <= 0) n = 0;
  } else if (it != pkts.end()) {   // a gap before the next packet
    Pkt& k = it->second;
    const int missing = (int)(it->first - playTs);
    if (haveSeq && k.seq == (uint16_t)(lastSeq + 1)) {   // no packet missing: DTX silence, Opus's comfort noise
      n = opusDecode(dec, nullptr, 0, buf, missing < 960 ? missing : 960);
    } else {   // lost: the FEC of the next packet for the one just before it, its DRED further back, else concealment
      int dur = opusSamples(k.data.data(), (int)k.data.size());
      if (dur <= 0 || dur > 5760) dur = 960;
      const bool fec = opusHasFec(k.data.data(), (int)k.data.size());
      if (dredFor != it->first) { dredFor = it->first; dredAvail = opusDredParse(dec, k.data.data(), (int)k.data.size(), 48000); }
      if (missing <= dur && fec) {
        n = opusDecode(dec, k.data.data(), (int)k.data.size(), buf, missing, true);
        if (n > 0) { st.fecSamples += n; st.fecPackets++; }
      } else {
        const int room = fec ? missing - dur : missing, c = room < 960 ? room : 960;
        if (dredAvail >= missing) { n = opusDredDecode(dec, missing, buf, c); if (n > 0) st.dredSamples += n; }
        else { n = opusDecode(dec, nullptr, 0, buf, c); if (n > 0) st.concealed += n; }
      }
    }
    if (n < 0) n = 0;
  } else {   // nothing to play: the buffer ran dry (late packets, or DTX: given back if the next packet follows on)
    n = opusDecode(dec, nullptr, 0, buf, 960);
    if (n > 0) { st.concealed += n; pendingDry += n; } else n = 0;
  }
  if (n == 0) { n = 960; std::fill(buf, buf + n, 0.f); }   // never stall the clock
  playTs += n;
  if (decoded) {   // toward the target, with some hysteresis: speed up above it, slow down below it
    const double d = delayAvg;
    if (d > targetMs + 20) mode = 1;
    else if (d < targetMs - 15) mode = -1;
    else if ((mode == 1 && d <= targetMs + 5) || (mode == -1 && d >= targetMs)) mode = 0;
  }
  const float speed = mode > 0 ? kFaster : mode < 0 ? kSlower : 1.f;
  if (!sonic) { q.insert(q.end(), buf, buf + n); return; }
  sonicSetSpeed(sonic, speed);
  sonicWriteFloatToStream(sonic, buf, n);
  const int avail = sonicSamplesAvailable(sonic);
  if (avail > 0) {
    const size_t at = q.size();
    q.resize(at + (size_t)avail);
    const int got = sonicReadFloatFromStream(sonic, q.data() + at, avail);
    q.resize(at + (size_t)(got > 0 ? got : 0));
    if (speed > 1 && got < n) st.removed += n - got;
    else if (speed < 1 && got > n) st.inserted += got - n;
  }
}

void AudioJitterBuffer::pull(int64_t now, std::vector<float>& out) {
  if (!started) {
    if (firstAt < 0 || now - firstAt < targetMs) return;   // the first packet waits the target, then the clock starts
    started = true; clock0 = now; st.emitted = 0;
  }
  const long long due = (now - clock0) * 48;
  int guard = 0;
  while (st.emitted < due && guard++ < 400) {
    if (qAt >= q.size()) { q.clear(); qAt = 0; produce(now); continue; }
    const size_t take = std::min((size_t)(due - st.emitted), q.size() - qAt);
    out.insert(out.end(), q.begin() + (long)qAt, q.begin() + (long)(qAt + take));
    qAt += take;
    st.emitted += (long long)take;
    st.target += targetMs / 1000.0 * (double)take;
  }
  if (st.emitted < due) clock0 = now - st.emitted / 48;   // a long stall (the thread did not run): start the clock again, do not catch up
}

}  // namespace media
