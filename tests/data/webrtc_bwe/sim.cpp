// zinc:webrtc's video rate control (plugins/webrtc/native/bwe.cpp) on a simulated link, in simulated time (tests/t0/webrtc_bwe_sim.sh): a
// sender of 30 frames a second, a bottleneck with a 300 ms queue and 20 ms each way, the receiver's estimate (REMB every report) and receiver
// reports of the queue's losses once a second. The link is 2 Mbit/s, 300 kbit/s from 10 s to 20 s, then 2 Mbit/s again. Prints one line:
//   capMs      how long after the drop the sender aimed under 300 kbit/s;
//   recoverMs  how long after it lifts the sender was back at 90% of its full rate;
//   rungs      the ladder's rungs seen (height x fps), in order;
// and checks the NACK list and packet on a few cases.
#include "../../../plugins/webrtc/native/bwe.h"
#include <stdio.h>
#include <deque>
#include <string>

static int fails = 0;
#define CHECK(c, ...) do { if (!(c)) { fprintf(stderr, "webrtc_bwe: " __VA_ARGS__); fprintf(stderr, "\n"); fails++; } } while (0)

static void nacks() {
  bwe::NackList n;
  n.push(10, 0); n.push(11, 0); n.push(14, 5);   // 12 and 13 missing
  std::vector<int64_t> d = n.due(5, 100, 1000);
  CHECK(d.size() == 2 && d[0] == 12 && d[1] == 13, "NACK: asked %zu packets, want 12 and 13", d.size());
  CHECK(n.due(50, 100, 1000).empty(), "NACK: asked again before a round trip");
  CHECK(n.due(105, 100, 1000).size() == 2, "NACK: not asked again after a round trip");
  n.push(12, 110);
  CHECK(n.recovered == 1 && n.due(300, 100, 1000).size() == 1, "NACK: a retransmission did not leave the list");
  CHECK(n.due(1500, 100, 1000).empty() && n.givenUp == 1, "NACK: an old packet was not given up");
  CHECK(!n.push(14 + 600, 1600), "NACK: a gap of 600 packets is asked for");
  const std::vector<uint8_t> p = bwe::nackPacket(1, 2, {100, 101, 116, 117});
  // FCI 1: pid 100, bits for 101 and 116 (1 << 0 | 1 << 15); FCI 2: pid 117
  CHECK(p.size() == 20 && p[0] == 0x81 && p[1] == 205 && p[3] == 4 && p[12] == 0 && p[13] == 100 && p[14] == 0x80 && p[15] == 0x01 && p[17] == 117,
        "NACK: wrong packet (%zu bytes)", p.size());
}

struct Pkt { int64_t at; uint32_t ts; int bytes; };

int main() {
  nacks();
  const int full = 1200000, srcW = 1280, srcH = 720;
  bwe::RemoteEstimator rx;
  bwe::SendRate tx;
  rx.setRtt(40);
  std::deque<Pkt> wire;                       // delivered at `at`
  std::deque<std::pair<int64_t, int>> rembs;   // REMB on the way back
  double queueFree = 0;
  long long sentInterval = 0, lostInterval = 0;
  int64_t capAt = -1, recoverAt = -1, nextFrame = 0, lastEnc = -1000;
  std::string rungs;
  int lastRung = -1, target = full;
  unsigned seed = 1;
  for (int64_t now = 0; now < 32000; now++) {
    const double rate = now >= 10000 && now < 20000 ? 300000 : 2000000;
    while (!wire.empty() && wire.front().at <= now) {
      const Pkt k = wire.front();
      wire.pop_front();
      if (rx.packet(k.ts, now, (size_t)k.bytes)) rembs.push_back({now + 20, (int)rx.estimate()});
    }
    uint32_t bps;
    if (rx.process(now, bps)) rembs.push_back({now + 20, (int)bps});
    while (!rembs.empty() && rembs.front().first <= now) { tx.remb(rembs.front().second, now); rembs.pop_front(); }
    if (now % 1000 == 999) {   // a receiver report
      tx.report(sentInterval > 0 ? (double)lostInterval / sentInterval : 0, now, target);
      sentInterval = lostInterval = 0;
    }
    if (now >= nextFrame) {
      nextFrame += 33;
      const int avail = tx.available(full);
      int ow, oh, fps;
      if (!tx.choose(srcW, srcH, 30, full, avail, -1, now, ow, oh, fps)) continue;
      if (tx.rung != lastRung) { lastRung = tx.rung; rungs += (rungs.empty() ? "" : ",") + std::to_string(oh) + "p" + std::to_string(fps); }
      if (now - lastEnc < 1000 / fps - 5) continue;
      lastEnc = now;
      target = avail;
      seed = seed * 1103515245u + 12345u;   // frames vary in size, as an encoder's do (+-30%)
      int bytes = (int)(target / 8 / fps * (0.7 + 0.6 * ((seed >> 16) & 1023) / 1023.0));
      for (int left = bytes; left > 0; left -= 1200) {   // the frame's packets into the bottleneck's queue
        const int b = left < 1200 ? left : 1200;
        sentInterval++;
        const double start = queueFree > now ? queueFree : now, done = start + (b + 40) * 8000.0 / rate;
        if (done - now > 300) { lostInterval++; continue; }
        queueFree = done;
        wire.push_back({(int64_t)done + 20, (uint32_t)(now * 90), b});
      }
    }
    if (now >= 10000 && capAt < 0 && target <= 300000) capAt = now - 10000;
    if (now >= 20000 && recoverAt < 0 && target >= full * 0.9) recoverAt = now - 20000;
  }
  printf("{\"capMs\":%lld,\"recoverMs\":%lld,\"rungs\":\"%s\"}\n", (long long)capAt, (long long)recoverAt, rungs.c_str());
  CHECK(capAt >= 0 && capAt <= 2000, "the sender took %lld ms to go under the 300 kbit/s cap", (long long)capAt);
  CHECK(recoverAt >= 0 && recoverAt <= 10000, "the sender took %lld ms to get back to full rate", (long long)recoverAt);
  CHECK(rungs.find("720p30,360p30,360p15") == 0 && rungs.rfind(",720p30") == rungs.size() - 7, "the ladder went %s", rungs.c_str());
  return fails ? 1 : 0;
}
