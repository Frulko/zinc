// h264dec-bench: one H.264 file decoded three ways on the device, as fast as the decoder goes, each picture handed back at once and never
// read by the CPU (as a display plane shows it): what a picture costs in CPU and memory with each way.
//   ffmpeg    libavformat + h264_v4l2m2m asked for dmabufs (AV_PIX_FMT_DRM_PRIME): what plugins/video does on a Pi
//   v4l2      libavformat + plugins/display-fbdev/v4l2dec.h: the same chip, without libavcodec's wrapper
//   software  libavformat + libavcodec's h264 on every core: the way when there is no hardware decoder
//   h264dec-bench <file> [ffmpeg|v4l2|software]...
// build (on the Mac, with the pinned zig, S = ~/.zinc/sysroots/aarch64-linux/usr):
//   zig c++ -target aarch64-linux-gnu -O2 -std=c++17 h264dec-bench.cpp -I$S/include -I$S/include/aarch64-linux-gnu \
//     -L$S/lib/aarch64-linux-gnu -lavformat -lavcodec -lavutil -pthread -Wl,--allow-shlib-undefined -o h264dec-bench
#include "../plugins/display-fbdev/v4l2dec.h"
extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavcodec/bsf.h>
}
#include <atomic>
#include <cstdio>
#include <string>
#include <thread>
#include <sys/resource.h>
#include <sys/wait.h>
#include <time.h>

static double now() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }
static double cpu() { rusage r; getrusage(RUSAGE_SELF, &r); return r.ru_utime.tv_sec + r.ru_utime.tv_usec / 1e6 + r.ru_stime.tv_sec + r.ru_stime.tv_usec / 1e6; }
static long rss_kb() { rusage r; getrusage(RUSAGE_SELF, &r); return r.ru_maxrss; }

static AVPixelFormat prime(AVCodecContext*, const AVPixelFormat* f) {
  for (const AVPixelFormat* q = f; *q != AV_PIX_FMT_NONE; q++) if (*q == AV_PIX_FMT_DRM_PRIME) return *q;
  return f[0];
}

/** The file's video packets, each given to `use`; in Annex B for V4L2 (an MP4's are length-prefixed: h264_mp4toannexb), as they are for
 *  libavcodec (its decoders convert them themselves). */
template <class F> static bool packets(const char* file, AVFormatContext*& fmt, int& st, bool annexb, F use) {
  if (avformat_open_input(&fmt, file, nullptr, nullptr) < 0 || avformat_find_stream_info(fmt, nullptr) < 0) return false;
  st = av_find_best_stream(fmt, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
  if (st < 0) return false;
  const AVBitStreamFilter* f = av_bsf_get_by_name(annexb ? "h264_mp4toannexb" : "null");
  AVBSFContext* bsf = nullptr;
  av_bsf_alloc(f, &bsf);
  avcodec_parameters_copy(bsf->par_in, fmt->streams[st]->codecpar);
  bsf->time_base_in = fmt->streams[st]->time_base;
  av_bsf_init(bsf);
  AVPacket* p = av_packet_alloc();
  bool more = true;
  while (more) {
    if (av_read_frame(fmt, p) < 0) { more = false; av_bsf_send_packet(bsf, nullptr); }
    else if (p->stream_index != st) { av_packet_unref(p); continue; }
    else av_bsf_send_packet(bsf, p);
    while (av_bsf_receive_packet(bsf, p) == 0) { use(p); av_packet_unref(p); }
  }
  av_packet_free(&p);
  av_bsf_free(&bsf);
  return true;
}

static int with_libavcodec(const char* file, bool hw) {
  AVFormatContext* fmt = nullptr;
  int st = -1, pictures = 0;
  AVCodecContext* dec = nullptr;
  AVFrame* fr = av_frame_alloc();
  auto drain = [&] { while (avcodec_receive_frame(dec, fr) == 0) { pictures++; av_frame_unref(fr); } };
  bool ok = packets(file, fmt, st, false, [&](AVPacket* p) {
    if (!dec) {
      const AVCodec* c = hw ? avcodec_find_decoder_by_name("h264_v4l2m2m") : avcodec_find_decoder(AV_CODEC_ID_H264);
      dec = avcodec_alloc_context3(c);
      avcodec_parameters_to_context(dec, fmt->streams[st]->codecpar);
      if (hw) dec->get_format = prime; else dec->thread_count = 0;
      if (avcodec_open2(dec, c, nullptr) < 0) { fprintf(stderr, "cannot open %s\n", c->name); exit(1); }
    }
    while (avcodec_send_packet(dec, p) == AVERROR(EAGAIN)) drain();
    drain();
  });
  if (!ok) return -1;
  avcodec_send_packet(dec, nullptr);
  for (double t0 = now(); now() - t0 < 2;) { int r = avcodec_receive_frame(dec, fr); if (r == AVERROR_EOF) break; if (r == 0) { pictures++; av_frame_unref(fr); } }
  avcodec_free_context(&dec);
  avformat_close_input(&fmt);
  return pictures;
}

static int with_v4l2dec(const char* file) {
  V4l2Dec d;
  AVFormatContext* fmt = nullptr;
  int st = -1;
  std::atomic<int> pictures{0}, sent{0};
  std::atomic<bool> fed{false};
  std::thread out;
  bool ok = packets(file, fmt, st, true, [&](AVPacket* p) {
    if (d.fd < 0) {
      const AVCodecParameters* c = fmt->streams[st]->codecpar;
      if (!d.open("/dev/video10", c->width, c->height)) { fprintf(stderr, "no decoder\n"); exit(1); }
      out = std::thread([&] {   // pictures taken as they come, each given back at once
        V4l2Dec::Picture pic;
        for (double idle = now(); now() - idle < (fed ? 0.3 : 2);) {
          int r = d.next(pic, 20);
          if (r < 0) break;
          if (r) { pictures++; d.requeue(pic.index); idle = now(); }
        }
      });
    }
    if (d.feed(p->data, p->size, ++sent)) return;
    fprintf(stderr, "feed failed at %d\n", sent.load());
  });
  fed = true;
  if (out.joinable()) out.join();
  avformat_close_input(&fmt);
  return ok ? pictures.load() : -1;
}

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "usage: h264dec-bench <file> [ffmpeg|v4l2|software]...\n"); return 2; }
  av_log_set_level(AV_LOG_ERROR);
  for (int i = 2; i < (argc > 2 ? argc : 3); i++) {
    const std::string way = argc > 2 ? argv[i] : "ffmpeg";
    pid_t pid = fork();   // a process each, so that the memory and the CPU of one way are not the other's
    if (pid == 0) {
      const double t0 = now(), c0 = cpu();
      const int n = way == "v4l2" ? with_v4l2dec(argv[1]) : with_libavcodec(argv[1], way != "software");
      const double wall = now() - t0, used = cpu() - c0;
      if (n <= 0) { printf("%-8s no picture\n", way.c_str()); _exit(1); }
      printf("%-8s %d pictures in %.2f s: %.1f a second, CPU %.2f ms a picture (%.0f%% of one core at 30 a second), max RSS %ld MB\n",
             way.c_str(), n, wall, n / wall, used * 1e3 / n, used / n * 30 * 100, rss_kb() / 1024);
      fflush(stdout);
      _exit(0);
    }
    int s; waitpid(pid, &s, 0);
  }
}
