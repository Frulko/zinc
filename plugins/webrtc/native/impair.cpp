// The network impairment harness of zinc:webrtc: a bad network without root (no dummynet, no netem), for the resilience tests of
// docs/reports/webrtc-selfhost-design.md §6.1. ZINC_WEBRTC_IMPAIR applies, to every SRTP and SRTCP packet a connection sends (STUN and DTLS
// go through untouched), in this order:
//   loss=10        per cent of packets lost, at random;
//   burst=3        the mean length of a run of losses (Gilbert-Elliott: two states, the bad one loses all), 1 by default (independent);
//   rate=20k       a bottleneck of that many bits per second (k, M), its queue dropping what would wait over queue= ms (300 by default);
//   step=10:300k   the rate changes to 300k ten seconds after the connection's first packet;
//   delay=50       one-way delay in ms (a loopback call at delay=50 has a 100 ms round trip);
//   jitter=30      plus a uniform random 0 to 30 ms per packet (packets may arrive out of order, as with netem);
//   seed=1         the random sequence: each connection draws from seed and its order of creation, RTP, RTCP and the jitter from separate
//                  sequences, so the same packets meet the same fate on every run.
// Each connection (libjuice agent) is one direction of the link: in a loopback call both directions are impaired alike.
// ZINC_WEBRTC_IMPAIR_LOG=1 prints, when a connection ends, what it sent, lost and queued, and a digest of its first 256 RTP decisions.
// The hooks reach libdatachannel through impair.h (force-included into the vendored C++); this file calls the real libjuice.
#define ZN_IMPAIR_IMPL
#include "../impair.h"
#include "juice.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <chrono>
#include <condition_variable>
#include <map>
#include <mutex>
#include <queue>
#include <random>
#include <string>
#include <thread>
#include <vector>

namespace {
struct Profile { double loss = 0, burst = 1, rate = 0, stepAt = -1, stepRate = 0, delay = 0, jitter = 0, queue = 300; unsigned seed = 1; bool on = false, log = false; };
double rateOf(const char* s) {
  char* e = nullptr;
  double v = strtod(s, &e);
  if (e && (*e == 'k' || *e == 'K')) v *= 1e3;
  else if (e && (*e == 'm' || *e == 'M')) v *= 1e6;
  return v;
}
const Profile& profile() {
  static const Profile p = [] {
    Profile r;
    const char* env = getenv("ZINC_WEBRTC_IMPAIR");
    const char* lg = getenv("ZINC_WEBRTC_IMPAIR_LOG");
    r.log = lg && *lg && strcmp(lg, "0") != 0;
    if (!env || !*env) return r;
    std::string s = env;
    for (size_t at = 0; at < s.size();) {
      size_t end = s.find(',', at);
      if (end == std::string::npos) end = s.size();
      const std::string kv = s.substr(at, end - at);
      at = end + 1;
      const size_t eq = kv.find('=');
      if (eq == std::string::npos) continue;
      const std::string k = kv.substr(0, eq);
      const char* v = kv.c_str() + eq + 1;
      if (k == "loss") r.loss = atof(v) / 100;
      else if (k == "burst") r.burst = atof(v) < 1 ? 1 : atof(v);
      else if (k == "rate") r.rate = rateOf(v);
      else if (k == "step") { const char* c = strchr(v, ':'); if (c) { r.stepAt = atof(v) * 1000; r.stepRate = rateOf(c + 1); } }
      else if (k == "delay") r.delay = atof(v);
      else if (k == "jitter") r.jitter = atof(v);
      else if (k == "queue") r.queue = atof(v);
      else if (k == "seed") r.seed = (unsigned)atoi(v);
      else fprintf(stderr, "zinc:webrtc: ZINC_WEBRTC_IMPAIR: unknown key '%s' (loss, burst, rate, step, delay, jitter, queue, seed)\n", k.c_str());
    }
    r.on = true;
    return r;
  }();
  return p;
}
double nowMs() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }

// One direction of the link: its random sequences, its loss state and its bottleneck queue.
struct Link {
  int index = 0;
  std::mt19937 rtpRng, rtcpRng, jitRng;
  bool rtpBad = false, rtcpBad = false;
  double start = -1, free = 0;   // ms: the first packet, when the bottleneck is next idle
  long long sent = 0, lost = 0, queueDrops = 0, bytes = 0;
  int decisions = 0;
  uint32_t digest = 2166136261u;   // FNV-1a of the first 256 RTP decisions
};
struct Pending { double due; long long order; juice_agent_t* agent; int ds; std::vector<char> data; };
struct Later { bool operator()(const Pending* a, const Pending* b) const { return a->due != b->due ? a->due > b->due : a->order > b->order; } };
struct State {
  std::mutex m;
  std::condition_variable cv;
  std::map<juice_agent_t*, Link> links;
  std::map<uint32_t, long long> wire;   // RTP bytes on the wire by SSRC
  std::priority_queue<Pending*, std::vector<Pending*>, Later> due;
  juice_agent_t* sending = nullptr;   // the agent the delivery thread is sending for, outside the lock
  long long order = 0;
  int created = 0;
  bool thread = false;
};
State& st() { static State* s = new State; return *s; }   // never destroyed: the delivery thread may outlive static destruction

// Gilbert-Elliott: the bad state loses every packet; P(good -> bad) and P(bad -> good) give a mean loss `loss` in runs of mean `burst`.
bool drop(std::mt19937& rng, bool& bad, const Profile& p) {
  if (p.loss <= 0) return false;
  std::uniform_real_distribution<double> u(0, 1);
  const double r = 1 / p.burst, q = p.loss >= 1 ? 1 : p.loss * r / (1 - p.loss);
  bad = bad ? u(rng) >= r : u(rng) < q;
  return bad;
}

void deliver() {
  State& s = st();
  std::unique_lock<std::mutex> l(s.m);
  for (;;) {
    if (s.due.empty()) { s.cv.wait(l); continue; }
    const double wait = s.due.top()->due - nowMs();
    if (wait > 0) { s.cv.wait_for(l, std::chrono::microseconds((long long)(wait * 1000))); continue; }
    Pending* p = s.due.top();
    s.due.pop();
    s.sending = p->agent;
    l.unlock();
    juice_send_diffserv(p->agent, p->data.data(), p->data.size(), p->ds);   // the real one, outside the lock (libjuice takes its own)
    delete p;
    l.lock();
    s.sending = nullptr;
    s.cv.notify_all();
  }
}
}  // namespace

extern "C" juice_agent_t* zn_impair_create(const juice_config_t* config) {
  juice_agent_t* a = juice_create(config);
  if (!a) return a;
  const Profile& p = profile();
  State& s = st();
  std::lock_guard<std::mutex> l(s.m);
  Link& k = s.links[a];
  k = Link();
  k.index = s.created++;
  k.rtpRng.seed(p.seed * 7919u + (unsigned)k.index * 2u);
  k.rtcpRng.seed(p.seed * 7919u + (unsigned)k.index * 2u + 1u);
  k.jitRng.seed(p.seed * 7919u + (unsigned)k.index * 2u + 104729u);
  return a;
}

extern "C" int zn_impair_send(juice_agent_t* agent, const char* data, size_t size, int ds) {
  const uint8_t* b = (const uint8_t*)data;
  const bool rtpOrRtcp = size >= 12 && b[0] >= 128 && b[0] <= 191;   // RFC 7983: 128-191 is RTP and RTCP; STUN and DTLS pass untouched
  if (!rtpOrRtcp) return juice_send_diffserv(agent, data, size, ds);
  const bool rtcp = b[1] >= 192 && b[1] <= 223;
  const Profile& p = profile();
  State& s = st();
  std::unique_lock<std::mutex> l(s.m);
  if (!rtcp) s.wire[(uint32_t)b[8] << 24 | (uint32_t)b[9] << 16 | (uint32_t)b[10] << 8 | b[11]] += (long long)size + 28;
  if (!p.on) { l.unlock(); return juice_send_diffserv(agent, data, size, ds); }
  Link& k = s.links[agent];
  const double now = nowMs();
  if (k.start < 0) k.start = now;
  k.sent++; k.bytes += (long long)size + 28;
  const bool lost = rtcp ? drop(k.rtcpRng, k.rtcpBad, p) : drop(k.rtpRng, k.rtpBad, p);
  if (!rtcp && k.decisions < 256) { k.digest = (k.digest ^ (lost ? 1u : 0u)) * 16777619u; k.decisions++; }
  if (lost) { k.lost++; return (int)size; }   // gone on the way: the sender cannot tell
  double at = now;
  const double rate = p.stepAt >= 0 && now - k.start >= p.stepAt ? p.stepRate : p.rate;
  if (rate > 0) {   // the bottleneck: one packet at a time, (IPv4 + UDP + the datagram) * 8 / rate each
    const double start = k.free > now ? k.free : now, done = start + ((double)size + 28) * 8000 / rate;
    if (done - now > p.queue) { k.queueDrops++; return (int)size; }   // the queue is full: dropped at its tail
    k.free = done;
    at = done;
  }
  at += p.delay;
  if (p.jitter > 0) at += std::uniform_real_distribution<double>(0, p.jitter)(k.jitRng);
  if (at <= now) { l.unlock(); return juice_send_diffserv(agent, data, size, ds); }
  s.due.push(new Pending{at, s.order++, agent, ds, std::vector<char>(data, data + size)});
  if (!s.thread) { s.thread = true; std::thread(deliver).detach(); }
  s.cv.notify_all();
  return (int)size;
}

extern "C" void zn_impair_destroy(juice_agent_t* agent) {
  State& s = st();
  {
    std::unique_lock<std::mutex> l(s.m);
    std::vector<Pending*> keep;   // what is still on the way for this agent goes with it
    while (!s.due.empty()) { Pending* p = s.due.top(); s.due.pop(); if (p->agent == agent) delete p; else keep.push_back(p); }
    for (Pending* p : keep) s.due.push(p);
    s.cv.wait(l, [&] { return s.sending != agent; });
    auto it = s.links.find(agent);
    if (it != s.links.end()) {
      const Link& k = it->second;
      if (profile().log && k.sent > 0)
        fprintf(stderr, "impair: link %d sent %lld packets (%lld bytes on the wire), lost %lld, queue drops %lld, digest %08x\n", k.index, k.sent, k.bytes,
                k.lost, k.queueDrops, k.digest);
      s.links.erase(it);
    }
  }
  juice_destroy(agent);
}

extern "C" long long zn_impair_wire_bytes(uint32_t ssrc) {
  State& s = st();
  std::lock_guard<std::mutex> l(s.m);
  auto it = s.wire.find(ssrc);
  return it == s.wire.end() ? 0 : it->second;
}
