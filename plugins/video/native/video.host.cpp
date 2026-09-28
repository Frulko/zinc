// zinc:video for macos, linux and rpi1 (video.rpi1.cpp includes this file). See docs/plugins/video.md.
//
// One worker thread per player demuxes and decodes with FFmpeg (VideoToolbox on macOS, <codec>_v4l2m2m on Linux
// when the kernel exposes a V4L2 mem2mem decoder, software otherwise), converts each frame to 0x00RRGGBB with
// swscale directly at the player's size (letterboxed), and hands finished buffers over through a small ring of
// slots. The main thread (a zrt::Poller, once per loop iteration) paces them by PTS and publishes the chosen slot
// with raster::dyn_update, so the player is an ordinary runtime image id (gfx.drawImage, GPU compositors through
// raster::dyn_view).
//
// Gapless playlists: the timeline is continuous across files (each file starts where the previous one ended), and
// the next file (demuxer + decoder) is opened as soon as the current one shows its first frame, so switching costs
// one decode and never a black frame. A single file loops the same way (a second instance of it is pre-opened).
#include "zinc_native_video.h"
#include "zrt_raster.h"
extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/hwcontext.h>
#include <libswscale/swscale.h>
}
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef ZP_VIDEO_BUFFERS
#define ZP_VIDEO_BUFFERS 4
#endif
#ifndef ZP_VIDEO_HWDECODE
#define ZP_VIDEO_HWDECODE 1
#endif
static const int NBUF = ZP_VIDEO_BUFFERS < 3 ? 3 : ZP_VIDEO_BUFFERS > 16 ? 16 : ZP_VIDEO_BUFFERS;
static const int MAX_PLAYERS = 16;
static bool vlog;  // ZINC_VIDEO_LOG=1: one stderr line per shown frame (loop-point checks)

using namespace zrt;

// ---------------------------------------------------------------- one opened file
struct Source {
  AVFormatContext* fmt; AVCodecContext* dec; AVBufferRef* hw; SwsContext* sws;
  AVPixelFormat hwfmt;
  int stream, item, frames;
  double tb, fdur, dur, end;   // time base, nominal frame duration, container duration, end of the last frame (s)
  int64_t start, last;         // first and last pts
  bool draining, wrapped;
  int sw_w, sw_h, sw_fmt, ox, oy, ow, oh;  // swscale input and letterbox rectangle
  char name[48];
};

static AVPixelFormat pick_format(AVCodecContext* c, const AVPixelFormat* f) {
  Source* s = (Source*)c->opaque;
  for (const AVPixelFormat* q = f; *q != AV_PIX_FMT_NONE; q++) if (*q == s->hwfmt) return *q;
  return avcodec_default_get_format(c, f);
}
static bool try_decoder(Source* s, const AVCodec* c, const AVCodecParameters* par, bool hwdev) {
  AVCodecContext* d = avcodec_alloc_context3(c);
  if (!d || avcodec_parameters_to_context(d, par) < 0) { avcodec_free_context(&d); return false; }
  d->opaque = s;
  d->thread_count = 0;  // software: automatic slice/frame threads
  if (hwdev) { d->hw_device_ctx = av_buffer_ref(s->hw); d->get_format = pick_format; d->thread_count = 1; }
  if (avcodec_open2(d, c, nullptr) < 0) { avcodec_free_context(&d); return false; }
  s->dec = d;
  return true;
}
static bool open_decoder(Source* s, const AVCodec* sw, const AVCodecParameters* par) {
#if ZP_VIDEO_HWDECODE
#ifdef __APPLE__
  for (int i = 0;; i++) {
    const AVCodecHWConfig* cfg = avcodec_get_hw_config(sw, i);
    if (!cfg) break;
    if ((cfg->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX) && cfg->device_type == AV_HWDEVICE_TYPE_VIDEOTOOLBOX) s->hwfmt = cfg->pix_fmt;
  }
  if (s->hwfmt != AV_PIX_FMT_NONE && av_hwdevice_ctx_create(&s->hw, AV_HWDEVICE_TYPE_VIDEOTOOLBOX, nullptr, nullptr, 0) == 0 && try_decoder(s, sw, par, true)) {
    snprintf(s->name, sizeof s->name, "%s (videotoolbox)", sw->name);
    return true;
  }
  s->hwfmt = AV_PIX_FMT_NONE;
  av_buffer_unref(&s->hw);
#else
  // Raspberry Pi (bcm2835-codec), other SoCs with a stateful V4L2 decoder; fails fast without /dev/video*
  char n[48];
  snprintf(n, sizeof n, "%s_v4l2m2m", sw->name);
  if (const AVCodec* m2m = avcodec_find_decoder_by_name(n)) if (try_decoder(s, m2m, par, false)) { snprintf(s->name, sizeof s->name, "%s", n); return true; }
#endif
#endif
  if (!try_decoder(s, sw, par, false)) return false;
  snprintf(s->name, sizeof s->name, "%s (software)", sw->name);
  return true;
}
static void close_source(Source*& s) {
  if (!s) return;
  avcodec_free_context(&s->dec);
  avformat_close_input(&s->fmt);
  av_buffer_unref(&s->hw);
  sws_freeContext(s->sws);
  free(s);
  s = nullptr;
}
static AVFormatContext* open_input(const char* path, int* stream, const AVCodec** codec) {
  AVFormatContext* fmt = nullptr;
  if (avformat_open_input(&fmt, path, nullptr, nullptr) < 0) return nullptr;
  if (avformat_find_stream_info(fmt, nullptr) < 0 || (*stream = av_find_best_stream(fmt, AVMEDIA_TYPE_VIDEO, -1, -1, codec, 0)) < 0 || !*codec) {
    avformat_close_input(&fmt);
    return nullptr;
  }
  return fmt;
}
static Source* open_source(const char* path, int item) {
  int st; const AVCodec* codec = nullptr;
  AVFormatContext* fmt = open_input(path, &st, &codec);
  if (!fmt) return nullptr;
  for (unsigned i = 0; i < fmt->nb_streams; i++) if ((int)i != st) fmt->streams[i]->discard = AVDISCARD_ALL;  // ponytail: video only, audio is a follow-up
  Source* s = (Source*)calloc(1, sizeof(Source));
  AVStream* vs = fmt->streams[st];
  s->fmt = fmt; s->stream = st; s->item = item; s->hwfmt = AV_PIX_FMT_NONE; s->sw_fmt = -1;
  s->start = s->last = AV_NOPTS_VALUE;
  s->tb = av_q2d(vs->time_base);
  s->fdur = vs->avg_frame_rate.num > 0 && vs->avg_frame_rate.den > 0 ? av_q2d(av_inv_q(vs->avg_frame_rate)) : 1.0 / 30;
  s->dur = fmt->duration > 0 ? fmt->duration / (double)AV_TIME_BASE : 0;
  if (!open_decoder(s, codec, vs->codecpar)) { close_source(s); return nullptr; }
  return s;
}

// ---------------------------------------------------------------- players
enum { FREE, WRITING, READY, SHOWN };
struct Slot { uint32_t* px; int state, item, loop; uint32_t gen; double t, pos, dur, fdur; char dec[48]; };

struct Player {
  bool used;
  int32_t w, h, img;
  volatile uint32_t bg;
  uint32_t* blank;
  Slot slot[16];
  char** files; int nfiles, cap;
  int order, repeat;
  // shared with the worker (mu)
  pthread_t th; bool th_on;
  pthread_mutex_t mu; pthread_cond_t cv;
  bool quit, running;
  uint32_t gen;
  int target, from;     // entry to start at on a restart (-1: next in order after `from`)
  // worker only
  int* bag; int nbag, round; unsigned seed;
  // main thread only
  bool started, paused;
  double clock, last_t, fdur, pos, dur;
  uint64_t last_us;
  int shown, item, loops, frames, dropped, resume;
  int hist[32], nhist;
  char dec[48];
};
static Player players[MAX_PLAYERS];
static Player* at(int32_t p) { return p >= 0 && p < MAX_PLAYERS && players[p].used ? &players[p] : nullptr; }

static char* entry_path(Player* p, int e) {  // copy under the lock: the playlist may grow while playing
  pthread_mutex_lock(&p->mu);
  char* s = e >= 0 && e < p->nfiles ? strdup(p->files[e]) : nullptr;
  pthread_mutex_unlock(&p->mu);
  return s;
}
static int entries(Player* p) { pthread_mutex_lock(&p->mu); int n = p->nfiles; pthread_mutex_unlock(&p->mu); return n; }

/** Next playlist entry after `cur` in the player's order; `wrapped` when a full pass is complete. */
static int pick_next(Player* p, int cur, bool* wrapped) {
  int n = entries(p);
  *wrapped = false;
  if (n <= 1) { *wrapped = cur >= 0; return 0; }
  if (p->order == 0) { *wrapped = cur + 1 >= n; return (cur + 1) % n; }
  if (p->order == 1) {
    if (cur >= 0 && ++p->round >= n) { p->round = 0; *wrapped = true; }
    int r;
    do r = (int)(rand_r(&p->seed) % (unsigned)n); while (r == cur);
    return r;
  }
  // random without repeats: a shuffled bag, refilled after every pass (never starting with the file just played)
  if (!p->bag || p->nbag == 0) {
    *wrapped = p->bag != nullptr;
    free(p->bag);
    p->bag = (int*)malloc(sizeof(int) * n);
    for (int i = 0; i < n; i++) p->bag[i] = i;
    for (int i = n - 1; i > 0; i--) { int j = (int)(rand_r(&p->seed) % (unsigned)(i + 1)); int t = p->bag[i]; p->bag[i] = p->bag[j]; p->bag[j] = t; }
    if (p->bag[n - 1] == cur) { int t = p->bag[0]; p->bag[0] = p->bag[n - 1]; p->bag[n - 1] = t; }
    p->nbag = n;
  }
  return p->bag[--p->nbag];
}
/** Opens entry `e`, or the following ones when it fails; null when nothing in the playlist can be played. */
static Source* open_entry(Player* p, int e, bool* wrapped) {
  int n = entries(p);
  for (int tries = 0; tries < n; tries++) {
    char* path = entry_path(p, e);
    Source* s = path ? open_source(path, e) : nullptr;
    if (s) { free(path); s->wrapped = *wrapped; return s; }
    fprintf(stderr, "video: cannot play %s\n", path ? path : "?");
    free(path);
    bool w; e = pick_next(p, e, &w);
    *wrapped = *wrapped || w;
  }
  return nullptr;
}

static void fill(uint32_t* px, int32_t stride, int x, int y, int w, int h, uint32_t c) {
  for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) px[(size_t)(y + j) * stride + x + i] = c;
}
/** Frame -> 0x00RRGGBB at the player's size, aspect kept, bars in the background colour. */
static bool convert(Player* p, Source* s, AVFrame* f, uint32_t* px) {
  if (f->width != s->sw_w || f->height != s->sw_h || f->format != s->sw_fmt) {
    double sar = f->sample_aspect_ratio.num > 0 && f->sample_aspect_ratio.den > 0 ? av_q2d(f->sample_aspect_ratio) : 1;
    double dw = f->width * sar, k = p->w / dw < p->h / (double)f->height ? p->w / dw : p->h / (double)f->height;
    s->ow = (int)(dw * k + 0.5); s->oh = (int)(f->height * k + 0.5);
    if (s->ow > p->w) s->ow = p->w;
    if (s->oh > p->h) s->oh = p->h;
    if (s->ow < 1) s->ow = 1;
    if (s->oh < 1) s->oh = 1;
    s->ox = (p->w - s->ow) / 2; s->oy = (p->h - s->oh) / 2;
    s->sws = sws_getCachedContext(s->sws, f->width, f->height, (AVPixelFormat)f->format, s->ow, s->oh, AV_PIX_FMT_BGR0, SWS_BILINEAR, nullptr, nullptr, nullptr);
    if (!s->sws) return false;
    const int* coef = sws_getCoefficients(f->colorspace == AVCOL_SPC_BT709 ? SWS_CS_ITU709 : SWS_CS_DEFAULT);
    sws_setColorspaceDetails(s->sws, coef, f->color_range == AVCOL_RANGE_JPEG, coef, 1, 0, 1 << 16, 1 << 16);
    s->sw_w = f->width; s->sw_h = f->height; s->sw_fmt = f->format;
  }
  uint32_t bg = p->bg;
  fill(px, p->w, 0, 0, p->w, s->oy, bg);
  fill(px, p->w, 0, s->oy + s->oh, p->w, p->h - s->oy - s->oh, bg);
  fill(px, p->w, 0, s->oy, s->ox, s->oh, bg);
  fill(px, p->w, s->ox + s->ow, s->oy, p->w - s->ox - s->ow, s->oh, bg);
  uint8_t* dst[4] = {(uint8_t*)(px + (size_t)s->oy * p->w + s->ox), nullptr, nullptr, nullptr};
  int ds[4] = {p->w * 4, 0, 0, 0};
  sws_scale(s->sws, f->data, f->linesize, 0, f->height, dst, ds);
  // swscale writes 0xFF in the pad byte; runtime images are 0x00RRGGBB
  for (int y = 0; y < s->oh; y++) { uint32_t* r = px + (size_t)(s->oy + y) * p->w + s->ox; for (int x = 0; x < s->ow; x++) r[x] &= 0xFFFFFF; }
  return true;
}

static int free_slot(Player* p) { for (int k = 0; k < NBUF; k++) if (p->slot[k].state == FREE) return k; return -1; }

/** Worker: waits for a free slot, converts the frame into it and marks it ready with its timeline position. */
static bool publish(Player* p, Source* s, AVFrame* fr, AVFrame* sw, uint32_t gen, double base, int loop) {
  AVFrame* f = fr;
  if (s->hwfmt != AV_PIX_FMT_NONE && fr->format == s->hwfmt) {
    av_frame_unref(sw);
    if (av_hwframe_transfer_data(sw, fr, 0) < 0) return false;
    av_frame_copy_props(sw, fr);
    f = sw;
  }
  int64_t pts = fr->best_effort_timestamp;
  if (pts == AV_NOPTS_VALUE) pts = s->last == AV_NOPTS_VALUE ? 0 : s->last + (int64_t)(s->fdur / s->tb + 0.5);
  if (s->start == AV_NOPTS_VALUE) s->start = pts;
  s->last = pts;
  double pos = (pts - s->start) * s->tb;
  if (pos < 0) pos = 0;
  double fd = fr->duration > 0 ? fr->duration * s->tb : s->fdur;
  if (pos + fd > s->end) s->end = pos + fd;
  pthread_mutex_lock(&p->mu);
  int k;
  while ((k = free_slot(p)) < 0 && !p->quit && p->gen == gen) pthread_cond_wait(&p->cv, &p->mu);
  if (k < 0) { pthread_mutex_unlock(&p->mu); return false; }
  p->slot[k].state = WRITING;
  pthread_mutex_unlock(&p->mu);
  bool ok = convert(p, s, f, p->slot[k].px);
  pthread_mutex_lock(&p->mu);
  Slot& sl = p->slot[k];
  if (!ok || p->gen != gen) sl.state = FREE;
  else {
    sl.state = READY; sl.gen = gen; sl.t = base + pos; sl.pos = pos; sl.dur = s->dur; sl.fdur = fd; sl.item = s->item; sl.loop = loop;
    memcpy(sl.dec, s->name, sizeof sl.dec);
  }
  pthread_mutex_unlock(&p->mu);
  s->frames++;
  return ok;
}

static void* worker(void* arg) {
  Player* p = (Player*)arg;
  AVPacket* pkt = av_packet_alloc();
  AVFrame* fr = av_frame_alloc();
  AVFrame* sw = av_frame_alloc();
  Source *cur = nullptr, *nxt = nullptr;
  uint32_t gen = 0;
  double base = 0;
  int loop = 0;
  bool stop_after = false;
  for (;;) {
    pthread_mutex_lock(&p->mu);
    while (!p->quit && !p->running) pthread_cond_wait(&p->cv, &p->mu);
    if (p->quit) { pthread_mutex_unlock(&p->mu); break; }
    bool restart = p->gen != gen || !cur;
    int target = p->target, from = p->from;
    gen = p->gen;
    pthread_mutex_unlock(&p->mu);
    if (restart) {  // play / skip / jump: new timeline
      close_source(cur); close_source(nxt);
      base = 0; stop_after = false;
      bool w = false;
      int e = target >= 0 ? target : pick_next(p, from, &w);
      if (w) loop++;
      cur = open_entry(p, e, &w);
      if (!cur) {
        fprintf(stderr, "video: nothing playable in the playlist\n");
        pthread_mutex_lock(&p->mu);
        if (p->gen == gen) p->running = false;
        pthread_mutex_unlock(&p->mu);
        continue;
      }
    }
    int r = avcodec_receive_frame(cur->dec, fr);
    if (r == 0) {
      bool ok = publish(p, cur, fr, sw, gen, base, loop);
      av_frame_unref(fr);
      if (ok && cur->frames == 1 && !nxt && !stop_after) {  // pre-roll the next file while this one plays
        bool w;
        int e = pick_next(p, cur->item, &w);
        if (p->repeat == 2 || (p->repeat == 0 && w)) stop_after = true;
        else nxt = open_entry(p, e, &w);
      }
      continue;
    }
    if (r == AVERROR(EAGAIN) && !cur->draining) {
      if (av_read_frame(cur->fmt, pkt) < 0) { avcodec_send_packet(cur->dec, nullptr); cur->draining = true; continue; }
      if (pkt->stream_index == cur->stream) avcodec_send_packet(cur->dec, pkt);  // a corrupt packet is skipped
      av_packet_unref(pkt);
      continue;
    }
    // end of file (or a decoder error): the next file continues the timeline where this one ended
    if (vlog) fprintf(stderr, "video: end of entry %d at %.4f s (%d frames)\n", cur->item, base + cur->end, cur->frames);
    base += cur->end > 0 ? cur->end : 0;
    int item = cur->item;
    close_source(cur);
    if (stop_after) {
      pthread_mutex_lock(&p->mu);
      if (p->gen == gen) p->running = false;
      pthread_mutex_unlock(&p->mu);
      continue;
    }
    if (!nxt) { bool w; int e = pick_next(p, item, &w); nxt = open_entry(p, e, &w); if (nxt) nxt->wrapped = w; }
    cur = nxt; nxt = nullptr;
    if (!cur) { pthread_mutex_lock(&p->mu); if (p->gen == gen) p->running = false; pthread_mutex_unlock(&p->mu); continue; }
    if (cur->wrapped) loop++;
    // `cur` is null only after a failure; the loop top then opens a new timeline
  }
  close_source(cur); close_source(nxt);
  av_packet_free(&pkt); av_frame_free(&fr); av_frame_free(&sw);
  return nullptr;
}

// ---------------------------------------------------------------- main thread
static void show_blank(Player* p) {
  if (p->shown >= 0) p->slot[p->shown].state = FREE;
  p->shown = -1;
  raster::dyn_update(p->img, p->blank, p->w);
}
/** Restart the timeline at `target` (-1: next entry in order). Caller holds the lock. */
static void restart(Player* p, int target) {
  p->gen++; p->target = target; p->from = p->item; p->running = true; p->started = false; p->paused = false;
  for (int k = 0; k < NBUF; k++) if (p->slot[k].state == READY) p->slot[k].state = FREE;
  pthread_cond_broadcast(&p->cv);
}
/** Once per loop iteration: show the newest frame that is due, drop older ones, free the previous one. */
static bool update(Player* p, uint64_t now) {
  if (p->img < 0) return false;
  pthread_mutex_lock(&p->mu);
  double dt = p->last_us ? (now - p->last_us) / 1e6 : 0;
  p->last_us = now;
  if (p->started && !p->paused) p->clock += dt;
  int first = -1, best = -1;
  bool freed = false;
  for (int k = 0; k < NBUF; k++) {
    Slot& s = p->slot[k];
    if (s.state != READY) continue;
    if (s.gen != p->gen) { s.state = FREE; freed = true; continue; }
    if (first < 0 || s.t < p->slot[first].t) first = k;
  }
  if (!p->started && first >= 0) { p->clock = p->slot[first].t; p->started = true; }
  for (int k = 0; k < NBUF; k++) {
    Slot& s = p->slot[k];
    // due within half a 60 Hz refresh: shown at the nearest vsync instead of one late when phases align
    if (s.state == READY && s.t <= p->clock + 0.008 && (best < 0 || s.t > p->slot[best].t)) best = k;
  }
  if (best >= 0) {
    Slot& b = p->slot[best];
    for (int k = 0; k < NBUF; k++) if (k != best && p->slot[k].state == READY && p->slot[k].t < b.t) { p->slot[k].state = FREE; p->dropped++; }
    if (p->shown >= 0) p->slot[p->shown].state = FREE;
    b.state = SHOWN; p->shown = best; freed = true;
    if (b.item != p->item) { if (p->nhist == 32) { memmove(p->hist, p->hist + 1, sizeof(int) * 31); p->nhist--; } p->hist[p->nhist++] = b.item; }
    p->item = b.item; p->pos = b.pos; p->dur = b.dur; p->fdur = b.fdur; p->last_t = b.t; p->loops = b.loop; p->frames++;
    memcpy(p->dec, b.dec, sizeof p->dec);
    raster::dyn_update(p->img, b.px, p->w);
    if (vlog) fprintf(stderr, "video: p%d entry %d pos %.4f t %.4f clock %.4f dropped %d\n", (int)(p - players), b.item, b.pos, b.t, p->clock, p->dropped);
  } else if (p->started && first < 0) {
    if (!p->running && p->shown >= 0 && p->clock >= p->last_t + p->fdur) { show_blank(p); p->resume = -1; }
    else if (p->clock > p->last_t + 0.1) p->clock = p->last_t + 0.1;  // decoder behind: wait for it rather than skip ahead
  }
  if (freed) pthread_cond_broadcast(&p->cv);
  bool active = p->running || first >= 0;
  pthread_mutex_unlock(&p->mu);
  return active;
}

struct VideoPoller : Poller {
  bool poll() override {
    uint64_t now = hal_time_us();
    bool any = false;
    for (Player& p : players) if (p.used && update(&p, now)) any = true;
    return any;
  }
  void shutdown() override;
};
static VideoPoller poller;

static void alloc(Player* p, int32_t w, int32_t h) {
  p->w = w; p->h = h;
  size_t n = (size_t)w * h;
  p->blank = (uint32_t*)malloc(n * 4);
  for (size_t i = 0; i < n; i++) p->blank[i] = p->bg;
  for (int k = 0; k < NBUF; k++) p->slot[k].px = (uint32_t*)malloc(n * 4);
  p->img = raster::dyn_wrap(w, h, p->blank, w);
}

struct VideoImpl : NativeVideo {
  int32_t create(int32_t w, int32_t h) override {
    for (int i = 0; i < MAX_PLAYERS; i++) {
      Player* p = &players[i];
      if (p->used) continue;
      *p = Player{};
      p->used = true; p->img = -1; p->shown = -1; p->item = -1; p->resume = -1; p->order = 0; p->repeat = 1;
      p->seed = (unsigned)hal_time_us() + i;
      pthread_mutex_init(&p->mu, nullptr);
      pthread_cond_init(&p->cv, nullptr);
      if (w > 0 && h > 0) alloc(p, w, h);
      return i;
    }
    return -1;
  }
  bool add(int32_t id, String path) override {
    Player* p = at(id);
    if (!p) return false;
    char* s = (char*)malloc(path.bytes() + 1);
    memcpy(s, path.ptr(), path.bytes()); s[path.bytes()] = 0;
    int st; const AVCodec* codec = nullptr;
    AVFormatContext* fmt = open_input(s, &st, &codec);  // probe: playable, and the size when the player has none yet
    if (!fmt) { fprintf(stderr, "video: cannot open %s\n", s); free(s); return false; }
    if (p->img < 0) {
      AVCodecParameters* par = fmt->streams[st]->codecpar;
      AVRational sar = par->sample_aspect_ratio;
      int32_t w = sar.num > 0 && sar.den > 0 ? (int32_t)(par->width * av_q2d(sar) + 0.5) : par->width;
      alloc(p, w > 0 ? w : 320, par->height > 0 ? par->height : 240);
    }
    avformat_close_input(&fmt);
    pthread_mutex_lock(&p->mu);
    if (p->nfiles == p->cap) { p->cap = p->cap ? p->cap * 2 : 8; p->files = (char**)realloc(p->files, sizeof(char*) * p->cap); }
    p->files[p->nfiles++] = s;
    pthread_mutex_unlock(&p->mu);
    return true;
  }
  void setOrder(int32_t id, int32_t order) override { if (Player* p = at(id)) { pthread_mutex_lock(&p->mu); p->order = order < 0 || order > 2 ? 0 : order; pthread_mutex_unlock(&p->mu); } }
  void setRepeat(int32_t id, int32_t mode) override { if (Player* p = at(id)) { pthread_mutex_lock(&p->mu); p->repeat = mode < 0 || mode > 2 ? 1 : mode; pthread_mutex_unlock(&p->mu); } }
  void setBackground(int32_t id, uint32_t color) override {
    Player* p = at(id);
    if (!p) return;
    p->bg = color & 0xFFFFFF;
    if (p->img < 0) return;
    for (size_t i = 0, n = (size_t)p->w * p->h; i < n; i++) p->blank[i] = p->bg;
    if (p->shown < 0) raster::dyn_update(p->img, p->blank, p->w);
  }
  void play(int32_t id) override {
    Player* p = at(id);
    if (!p || !p->nfiles || p->img < 0) return;
    pthread_mutex_lock(&p->mu);
    if (p->running) p->paused = false;
    else restart(p, p->resume);
    pthread_mutex_unlock(&p->mu);
    if (!p->th_on) p->th_on = pthread_create(&p->th, nullptr, worker, p) == 0;
  }
  void stop(int32_t id) override {
    Player* p = at(id);
    if (!p) return;
    pthread_mutex_lock(&p->mu);
    restart(p, -1);
    p->running = false;
    p->resume = p->item >= 0 ? p->item : -1;
    if (p->img >= 0) show_blank(p);
    pthread_mutex_unlock(&p->mu);
  }
  void pause(int32_t id, bool on) override { if (Player* p = at(id)) { pthread_mutex_lock(&p->mu); p->paused = on && p->running; pthread_mutex_unlock(&p->mu); } }
  void skip(int32_t id, int32_t delta) override {
    Player* p = at(id);
    if (!p || !p->nfiles || p->img < 0) return;
    pthread_mutex_lock(&p->mu);
    int n = p->nfiles, target = -1;
    if (delta < 0) {
      if (p->nhist >= 2) { target = p->hist[p->nhist - 2]; p->nhist -= 2; }  // the entry shown before this one
      else target = ((p->item < 0 ? 0 : p->item) - 1 + n) % n;
    }
    restart(p, target);
    pthread_mutex_unlock(&p->mu);
    if (!p->th_on) p->th_on = pthread_create(&p->th, nullptr, worker, p) == 0;
  }
  void jump(int32_t id, int32_t index) override {
    Player* p = at(id);
    if (!p || index < 0 || index >= p->nfiles || p->img < 0) return;
    pthread_mutex_lock(&p->mu);
    restart(p, index);
    pthread_mutex_unlock(&p->mu);
    if (!p->th_on) p->th_on = pthread_create(&p->th, nullptr, worker, p) == 0;
  }
  int32_t image(int32_t id) override { Player* p = at(id); return p ? p->img : -1; }
  int32_t width(int32_t id) override { Player* p = at(id); return p && p->img >= 0 ? p->w : 0; }
  int32_t height(int32_t id) override { Player* p = at(id); return p && p->img >= 0 ? p->h : 0; }
  int32_t index(int32_t id) override { Player* p = at(id); return p ? p->item : -1; }
  int32_t count(int32_t id) override { Player* p = at(id); return p ? p->nfiles : 0; }
  double position(int32_t id) override { Player* p = at(id); return p && p->shown >= 0 ? p->pos : 0; }
  double duration(int32_t id) override { Player* p = at(id); return p && p->item >= 0 ? p->dur : 0; }
  int32_t loops(int32_t id) override { Player* p = at(id); return p ? p->loops : 0; }
  bool playing(int32_t id) override { Player* p = at(id); return p && p->running; }
  bool paused(int32_t id) override { Player* p = at(id); return p && p->paused; }
  String decoder(int32_t id) override { Player* p = at(id); return p ? String::from(p->dec, (uint32_t)strlen(p->dec)) : String(); }
  int32_t frames(int32_t id) override { Player* p = at(id); return p ? p->frames : 0; }
  int32_t dropped(int32_t id) override { Player* p = at(id); return p ? p->dropped : 0; }
  void close(int32_t id) override {
    Player* p = at(id);
    if (!p) return;
    if (p->th_on) {
      pthread_mutex_lock(&p->mu); p->quit = true; pthread_cond_broadcast(&p->cv); pthread_mutex_unlock(&p->mu);
      pthread_join(p->th, nullptr);
    }
    if (p->img >= 0) raster::dyn_destroy(p->img);
    for (int k = 0; k < NBUF; k++) free(p->slot[k].px);
    free(p->blank); free(p->bag);
    for (int i = 0; i < p->nfiles; i++) free(p->files[i]);
    free(p->files);
    pthread_mutex_destroy(&p->mu); pthread_cond_destroy(&p->cv);
    p->used = false;
  }
};
static VideoImpl impl;
void VideoPoller::shutdown() { for (int i = 0; i < MAX_PLAYERS; i++) if (players[i].used) impl.close(i); }

NativeVideo* zinc_create_Video() {
  vlog = getenv("ZINC_VIDEO_LOG") != nullptr;
  av_log_set_level(vlog ? AV_LOG_WARNING : AV_LOG_FATAL);
  add_poller(&poller);
  impl.rc = IMMORTAL;
  return &impl;
}
