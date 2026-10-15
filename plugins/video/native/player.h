// zinc:video, the part every decoder shares: players, playlists (orders, gapless, loops), the ring of converted pictures, their pacing
// by timestamp on the main thread, the runtime image. A backend decodes: FFmpeg (video.host.cpp: macOS, Linux, Raspberry Pi) or
// GStreamer (video.webos.cpp: the hardware decoder of webOS 3). See docs/plugins/video.md.
//
// The backend defines, before including this file:
//   (its own Source derives from SourceBase: the player sees only the base)
//   Held             a decoder's picture a slot keeps for a display with hardware layers (FFmpeg's dmabufs); held_any is false without them
//   Conv             what converting to the player's size needs, kept from picture to picture (a scaler, tables)
//   and the functions declared below (src_*, held_*, conv_free, backend_init).
// Each picture: the worker thread asks src_step for the next one; the backend converts it into a free slot (slot_take / slot_commit) at
// the player's size, aspect kept, bars in the background colour (fit, fill). A player created at the size it is drawn at decodes a larger
// video straight to that size (1080p on a 1024x768 screen).
#include <atomic>
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

/** What every backend's Source holds first. */
struct SourceBase {
  int item, frames;
  double dur, end;    // the file's duration, the end of its last frame (s)
  bool wrapped;       // opening it completed a pass over the playlist
  int range;          // the stream's colour range, when it names one
  char name[48];      // the decoder, e.g. "h264 (videotoolbox)"
};

struct Player;
static SourceBase* src_open(const char* path, int item);        // null: cannot play it
static void src_close(SourceBase* s);
static bool src_probe(const char* path, int* w, int* h);     // playable; *w x *h its display size when asked (w non-null)
static int src_step(Player* p, SourceBase* s, uint32_t gen, double base, int loop);  // decodes and publishes the next picture: 1, or 0 at the end
static Held* held_new();
static void held_free(Held*& h);
static void held_unref(Held* h);
static bool held_any(const Held* h);                         // holds a decoder's picture
static bool held_picture(const Held* h, int range, HalPicture* out);
static bool held_convert(Player* p, Held* h, int range, uint32_t* px);   // converted at a draw (main thread)
static void conv_free(Conv* c);
static void backend_init();

static std::atomic<uint64_t> live_sources{0};

// ---------------------------------------------------------------- players
enum { FREE, WRITING, READY, SHOWN };
// hw: the decoder's own picture when it is a dmabuf (empty otherwise), kept while the display may show it; has_px: px holds the picture
// too; box: where the picture lies in the player's image; range: the stream's colour range
struct Slot { uint32_t* px; int state, item, loop; uint32_t gen; double t, pos, dur, fdur; char dec[48]; Held* hw; bool has_px; int box[4], range; };

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
  // pictures for a display with hardware layers (ZN-731)
  raster::Picture pic;       // the picture on screen
  Held *old[2], *tmp;        // the two pictures shown before it, which the display may still scan; a copy in memory for the conversion at a draw
  Conv conv;                 // the conversion at a draw (main thread; a Source's is its decode thread's)
  volatile bool want_px;     // the last frame drew the picture from its pixels: the decode thread converts the next ones
  int direct, at_draw;       // pictures shown and never read by the CPU; pictures converted at a draw
};
static Player players[MAX_PLAYERS];
#if __has_include("zn/resource_stats.h")
static ZnResourceStats video_stats(void*) {
  ZnResourceStats s{};
  for (auto& p : players) if (p.used) {
    ++s.objects;
    if (p.blank) s.cpuBytes += (uint64_t)(NBUF + 1) * p.w * p.h * 4;
    pthread_mutex_lock(&p.mu);
    s.active += p.running;
    pthread_mutex_unlock(&p.mu);
  }
  return s;
}
static ZnResourceStats source_stats(void*) { return {live_sources.load(std::memory_order_relaxed), 0, 0, 0, 0}; }
static ZnResourceStatsRegistration video_stats_registration("video.buffers", video_stats);
static ZnResourceStatsRegistration source_stats_registration("video.sources", source_stats);
#endif

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
static SourceBase* open_entry(Player* p, int e, bool* wrapped) {
  int n = entries(p);
  for (int tries = 0; tries < n; tries++) {
    char* path = entry_path(p, e);
    SourceBase* s = path ? src_open(path, e) : nullptr;
    if (s) { free(path); s->wrapped = *wrapped; live_sources.fetch_add(1, std::memory_order_relaxed); return s; }
    fprintf(stderr, "video: cannot play %s\n", path ? path : "?");
    free(path);
    bool w; e = pick_next(p, e, &w);
    *wrapped = *wrapped || w;
  }
  return nullptr;
}
static void close_entry(SourceBase*& s) { if (s) { live_sources.fetch_sub(1, std::memory_order_relaxed); src_close(s); s = nullptr; } }

static void fill(uint32_t* px, int32_t stride, int x, int y, int w, int h, uint32_t c) {
  for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) px[(size_t)(y + j) * stride + x + i] = c;
}
/** Where a picture of display width `dw` (its width times its sample aspect ratio) and height `fh` lies in the player's image: aspect
 *  kept, centred (box: x, y, w, h). */
static void fit(const Player* p, double dw, int fh, int* box) {
  double k = p->w / dw < p->h / (double)fh ? p->w / dw : p->h / (double)fh;
  int ow = (int)(dw * k + 0.5), oh = (int)(fh * k + 0.5);
  if (ow > p->w) ow = p->w;
  if (oh > p->h) oh = p->h;
  if (ow < 1) ow = 1;
  if (oh < 1) oh = 1;
  box[0] = (p->w - ow) / 2; box[1] = (p->h - oh) / 2; box[2] = ow; box[3] = oh;
}
/** The bars around `box` in the background colour. */
static void bars(const Player* p, uint32_t* px, const int* box) {
  uint32_t bg = p->bg;
  fill(px, p->w, 0, 0, p->w, box[1], bg);
  fill(px, p->w, 0, box[1] + box[3], p->w, p->h - box[1] - box[3], bg);
  fill(px, p->w, 0, box[1], box[0], box[3], bg);
  fill(px, p->w, box[0] + box[2], box[1], p->w - box[0] - box[2], box[3], bg);
}

static int free_slot(Player* p) { for (int k = 0; k < NBUF; k++) if (p->slot[k].state == FREE) return k; return -1; }
/** Worker: waits for a free slot and reserves it; -1 when the player stops or restarts meanwhile. */
static int slot_take(Player* p, uint32_t gen) {
  pthread_mutex_lock(&p->mu);
  int k;
  while ((k = free_slot(p)) < 0 && !p->quit && p->gen == gen) pthread_cond_wait(&p->cv, &p->mu);
  if (k >= 0) p->slot[k].state = WRITING;
  pthread_mutex_unlock(&p->mu);
  return k;
}
/** Worker: slot `k` holds the picture at `pos` s of the file (lasting `fd`), on the timeline from `base`; or it is given back (!ok). */
static void slot_commit(Player* p, SourceBase* s, int k, bool ok, uint32_t gen, double base, double pos, double fd, int loop) {
  Slot& sl = p->slot[k];
  pthread_mutex_lock(&p->mu);
  if (!ok || p->gen != gen) sl.state = FREE;
  else {
    sl.state = READY; sl.gen = gen; sl.t = base + pos; sl.pos = pos; sl.dur = s->dur; sl.fdur = fd; sl.item = s->item; sl.loop = loop;
    memcpy(sl.dec, s->name, sizeof sl.dec);
  }
  pthread_mutex_unlock(&p->mu);
  s->frames++;
}

/** A frame draws the picture on screen from its pixels and they are not there (raster::Picture.fill, main thread): converted now. */
static void fill_picture(void* user) {
  Player* p = (Player*)user;
  p->pic.filled = true;   // whatever comes of it: asked once per picture
  if (p->shown < 0) return;
  Slot& sl = p->slot[p->shown];
  if (!held_convert(p, sl.hw, sl.range, sl.px)) return;
  sl.has_px = true; p->at_draw++;
  raster::dyn_update(p->img, sl.px, p->w);
}

static void* worker(void* arg) {
  Player* p = (Player*)arg;
  SourceBase *cur = nullptr, *nxt = nullptr;
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
      close_entry(cur); close_entry(nxt);
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
    if (src_step(p, cur, gen, base, loop)) {
      if (cur->frames == 1 && !nxt && !stop_after) {  // pre-roll the next file while this one plays
        bool w;
        int e = pick_next(p, cur->item, &w);
        if (p->repeat == 2 || (p->repeat == 0 && w)) stop_after = true;
        else nxt = open_entry(p, e, &w);
      }
      continue;
    }
    // end of file (or a decoder error): the next file continues the timeline where this one ended
    if (vlog) fprintf(stderr, "video: end of entry %d at %.4f s (%d frames)\n", cur->item, base + cur->end, cur->frames);
    base += cur->end > 0 ? cur->end : 0;
    int item = cur->item;
    close_entry(cur);
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
  close_entry(cur); close_entry(nxt);
  return nullptr;
}

// ---------------------------------------------------------------- main thread
/** The picture on screen leaves. A decoder's picture stays ours for two more pictures: the display may scan it until its next refreshes. */
static void retire(Player* p, Slot& sl) {
  sl.state = FREE;
  if (!held_any(sl.hw)) return;
  if (!sl.has_px) p->direct++;
  Held* last = p->old[1];
  p->old[1] = p->old[0]; p->old[0] = sl.hw; sl.hw = last;
  held_unref(sl.hw);
}
/** A slot's picture becomes the player's image: pixels, or the decoder's picture for the display with the pixels to come if a frame asks. */
static void show(Player* p, Slot& b) {
  static uint32_t serial;
  p->want_px = p->pic.software;   // what the frames did with the picture before this one: the decode thread goes on the same way
  p->pic.software = false;
  if (held_any(b.hw) && held_picture(b.hw, b.range, &p->pic.hal)) {
    p->pic.hal.serial = ++serial;
    p->pic.bx = b.box[0]; p->pic.by = b.box[1]; p->pic.bw = b.box[2]; p->pic.bh = b.box[3];
    p->pic.fill = fill_picture; p->pic.user = p; p->pic.filled = b.has_px;
    raster::dyn_set_picture(p->img, &p->pic);
    raster::dyn_update(p->img, b.has_px ? b.px : p->blank, p->w);   // around the picture, the image is the background colour
  } else {
    raster::dyn_set_picture(p->img, nullptr);
    raster::dyn_update(p->img, b.px, p->w);
  }
}
static void show_blank(Player* p) {
  if (p->shown >= 0) retire(p, p->slot[p->shown]);
  p->shown = -1;
  raster::dyn_set_picture(p->img, nullptr);
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
  int first = -1, best = -1, ready = 0;
  bool freed = false;
  for (int k = 0; k < NBUF; k++) {
    Slot& s = p->slot[k];
    if (s.state != READY) continue;
    if (s.gen != p->gen) { s.state = FREE; freed = true; continue; }
    if (first < 0 || s.t < p->slot[first].t) first = k;
    ready++;
  }
  // The clock starts with two pictures in hand (or all there will be): a decoder that hands its frames in bursts (V4L2) gave the second
  // one 70 ms after the first, and it was dropped as late (ZN-731, once the first was no longer held back by its conversion).
  if (!p->started && first >= 0 && (ready >= 2 || !p->running)) { p->clock = p->slot[first].t; p->started = true; }
  for (int k = 0; k < NBUF; k++) {
    Slot& s = p->slot[k];
    // due within half a 60 Hz refresh: shown at the nearest vsync instead of one late when phases align
    if (p->started && s.state == READY && s.t <= p->clock + 0.008 && (best < 0 || s.t > p->slot[best].t)) best = k;
  }
  if (best >= 0) {
    Slot& b = p->slot[best];
    for (int k = 0; k < NBUF; k++) if (k != best && p->slot[k].state == READY && p->slot[k].t < b.t) { p->slot[k].state = FREE; p->dropped++; }
    if (p->shown >= 0) retire(p, p->slot[p->shown]);
    b.state = SHOWN; p->shown = best; freed = true;
    if (b.item != p->item) { if (p->nhist == 32) { memmove(p->hist, p->hist + 1, sizeof(int) * 31); p->nhist--; } p->hist[p->nhist++] = b.item; }
    p->item = b.item; p->pos = b.pos; p->dur = b.dur; p->fdur = b.fdur; p->last_t = b.t; p->loops = b.loop; p->frames++;
    memcpy(p->dec, b.dec, sizeof p->dec);
    show(p, b);
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

// The size comes from the program or from the file (its sample aspect ratio): at most 8192 per side, and the player
// keeps no image (draws nothing) when memory runs out.
static void alloc(Player* p, int32_t w, int32_t h) {
  if (w < 1 || h < 1 || w > 8192 || h > 8192) return;
  size_t n = (size_t)w * h;
  uint32_t* blank = (uint32_t*)malloc(n * 4);
  uint32_t* px[NBUF] = {};
  bool ok = blank != nullptr;
  for (int k = 0; k < NBUF; k++) if (!(px[k] = (uint32_t*)malloc(n * 4))) ok = false;
  if (!ok) { free(blank); for (uint32_t* b : px) free(b); return; }
  p->w = w; p->h = h; p->blank = blank;
  for (size_t i = 0; i < n; i++) p->blank[i] = p->bg;
  for (int k = 0; k < NBUF; k++) { p->slot[k].px = px[k]; p->slot[k].hw = held_new(); }
  p->old[0] = held_new(); p->old[1] = held_new(); p->tmp = held_new();
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
    int32_t w = 0, h = 0;
    if (!src_probe(s, p->img < 0 ? &w : nullptr, &h)) { fprintf(stderr, "video: cannot open %s\n", s); free(s); return false; }
    if (p->img < 0) alloc(p, w >= 1 && w <= 8192 ? w : 320, h >= 1 && h <= 8192 ? h : 240);   // file data: no out-of-range size
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
    if (vlog && p->direct + p->at_draw) fprintf(stderr, "video: p%d showed %d pictures, %d of them dmabufs the CPU never read, %d converted at a draw\n", (int)id, p->frames, p->direct + (p->shown >= 0 && !p->slot[p->shown].has_px), p->at_draw);
    if (p->img >= 0) raster::dyn_destroy(p->img);
    for (int k = 0; k < NBUF; k++) { free(p->slot[k].px); held_free(p->slot[k].hw); }
    held_free(p->old[0]); held_free(p->old[1]); held_free(p->tmp);
    conv_free(&p->conv);
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
  backend_init();
  add_poller(&poller);
  impl.rc = IMMORTAL;
  return &impl;
}
