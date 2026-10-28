// v4l2dec-probe: the H.264 hardware decoder of plugins/display-fbdev/v4l2dec.h on its own, on the device: how long from an access unit
// in to its picture out, and how many pictures the decoder holds back. The units come from `sidecar-screen --h264-dump <file>` (the file
// and <file>.sizes, a unit's bytes a line). Two runs:
//   one at a time: each unit goes in and its picture is waited for (the decoder's own delay; a decoder that holds pictures shows here)
//   paced: a unit every 1/60 s, the pictures taken by their own thread as they come (how the receiver runs it)
//   build on the Pi: g++ -O2 -std=c++17 -pthread tools/v4l2dec-probe.cpp -o v4l2dec-probe; run: ./v4l2dec-probe syn100.h264
#include "../plugins/display-fbdev/v4l2dec.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <fstream>
#include <thread>

static uint64_t now_us() { return (uint64_t)std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
static void report(const char* what, std::vector<double> v, size_t sent) {
  if (v.empty()) { printf("%s: no picture of %zu\n", what, sent); return; }
  std::sort(v.begin(), v.end());
  printf("%s: %zu of %zu pictures, in to out %.1f ms median, %.1f p95, %.1f max, first %.1f\n", what, v.size(), sent, v[v.size() / 2],
         v[std::min(v.size() - 1, v.size() * 95 / 100)], v.back(), v.front());
}

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "usage: v4l2dec-probe <dump.h264> [device]\n"); return 2; }
  std::ifstream f(argv[1], std::ios::binary), s(std::string(argv[1]) + ".sizes");
  std::vector<std::vector<uint8_t>> units;
  // PROBE_AUD=1: an access unit delimiter after each unit, so the decoder's parser sees where the unit ends without waiting for the next
  // PROBE_TAIL=<hex>: other bytes after each unit, to find what makes the decoder finish a picture at once
  const bool aud = getenv("PROBE_AUD") && *getenv("PROBE_AUD") == '1';
  std::vector<uint8_t> tail;
  if (const char* t = getenv("PROBE_TAIL")) for (size_t k = 0; t[k] && t[k + 1]; k += 2) tail.push_back((uint8_t)strtol(std::string(t + k, 2).c_str(), nullptr, 16));
  for (size_t n; s >> n;) {
    std::vector<uint8_t> u(n); f.read((char*)u.data(), (std::streamsize)n); if (!f) break;
    if (aud) u.insert(u.end(), {0, 0, 0, 1, 9, 0xF0});
    u.insert(u.end(), tail.begin(), tail.end());
    units.push_back(std::move(u));
  }
  printf("%zu access units\n", units.size());
  const char* dev = argc > 2 ? argv[2] : "/dev/video10";

  {   // one at a time
    V4l2Dec d;
    if (!d.open(dev)) { perror("open"); return 1; }
    std::vector<double> lat;
    int held = 0;
    for (size_t i = 0; i < units.size(); i++) {
      const uint64_t t0 = now_us();
      if (!d.feed(units[i].data(), units[i].size(), i + 1)) { printf("feed %zu failed\n", i); break; }
      V4l2Dec::Picture p;
      int r = 0;
      while ((r = d.next(p, 200)) == 0 && now_us() - t0 < 200000) {}
      if (r < 0) { printf("decoder failed at %zu\n", i); break; }
      if (r == 0) { held++; continue; }
      if (i == 0) printf("pictures %ux%u NV12, pitch %u, %zu capture buffers\n", d.w, d.h, d.pitch, d.dmabuf.size());
      lat.push_back((now_us() - t0) / 1e3);   // a picture came for this unit; its tag says which (bcm2835-codec may hand the one before's)
      held = (int)(i + 1 - p.tag);
      if (i < 4 && getenv("PROBE_TRACE")) printf("  unit %zu: a picture tagged %llu after %.1f ms\n", i + 1, (unsigned long long)p.tag, (now_us() - t0) / 1e3);
      d.requeue(p.index);
    }
    report("one at a time", lat, units.size());
    printf("one at a time: the last picture out carried the tag of %d unit(s) before\n", held);
  }
  {   // paced at 60, pictures taken by their own thread (Vanilla's way)
    V4l2Dec d;
    if (!d.open(dev)) { perror("open"); return 1; }
    std::vector<uint64_t> sent(units.size() + 1);
    std::vector<double> lat;
    std::atomic<bool> done{false};
    std::thread out([&] {
      V4l2Dec::Picture p;
      while (!done) if (d.next(p, 5) == 1) { if (p.tag && p.tag <= units.size()) lat.push_back((now_us() - sent[p.tag]) / 1e3); d.requeue(p.index); }
    });
    const uint64_t start = now_us();
    for (size_t i = 0; i < units.size(); i++) {
      while (now_us() < start + i * 16667) std::this_thread::sleep_for(std::chrono::microseconds(200));
      sent[i + 1] = now_us();
      if (!d.feed(units[i].data(), units[i].size(), i + 1)) { printf("feed %zu failed\n", i); break; }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    done = true; out.join();
    report("paced at 60", lat, units.size());
  }
  return 0;
}
