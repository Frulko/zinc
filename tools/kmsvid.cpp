// kmsvid: the spike of ZN-731. Decodes a clip with <codec>_v4l2m2m to DRM PRIME frames and shows each on an overlay plane of the
// display (atomic modesetting), under an ARGB plane that has a transparent hole. The primary plane (the console, /dev/fb0) is
// never touched: when this program ends or dies its two planes go away and the console is what it was.
//
//   kmsvid <file> [--seconds N] [--rate R] [--dst x,y,w,h] [--no-ui] [--planes] [--sw]
//     --rate R    pictures a second to show (the clip's own by default): its timestamps are scaled
//     --planes    print every plane of the display's CRTC (type, zpos, formats) and leave
//     --sw        the frames in memory (nv12/yuv420p), mapped and never shown: the decoder's own cost
//
// build (on the Mac, with the pinned zig, S = ~/.zinc/sysroots/aarch64-linux/usr):
//   zig c++ -target aarch64-linux-gnu -O2 -std=c++17 kmsvid.cpp -I$S/include -I$S/include/libdrm -I$S/include/aarch64-linux-gnu \
//     -L$S/lib/aarch64-linux-gnu -lavformat -lavcodec -lavutil -ldrm -Wl,--allow-shlib-undefined -o kmsvid
#include <xf86drm.h>
#include <xf86drmMode.h>
#include <drm_fourcc.h>
extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/hwcontext_drm.h>
#include <libavutil/pixdesc.h>
}
#include <map>
#include <string>
#include <vector>
#include <algorithm>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/resource.h>

static volatile sig_atomic_t stop;
static void on_signal(int) { stop = 1; }
static double now() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }
static double cpu() { rusage r; getrusage(RUSAGE_SELF, &r); return r.ru_utime.tv_sec + r.ru_utime.tv_usec / 1e6 + r.ru_stime.tv_sec + r.ru_stime.tv_usec / 1e6; }

struct Obj { uint32_t id = 0; std::map<std::string, uint32_t> prop; std::map<std::string, uint64_t> val; };
static Obj object(int fd, uint32_t id, uint32_t type) {
  Obj o; o.id = id;
  drmModeObjectProperties* ps = drmModeObjectGetProperties(fd, id, type);
  for (uint32_t i = 0; ps && i < ps->count_props; i++) {
    if (drmModePropertyRes* p = drmModeGetProperty(fd, ps->props[i])) { o.prop[p->name] = p->prop_id; o.val[p->name] = ps->prop_values[i]; drmModeFreeProperty(p); }
  }
  drmModeFreeObjectProperties(ps);
  return o;
}
static void set(drmModeAtomicReq* r, const Obj& o, const char* name, uint64_t v) {
  auto it = o.prop.find(name);
  if (it == o.prop.end()) { fprintf(stderr, "kmsvid: object %u has no property %s\n", o.id, name); return; }
  drmModeAtomicAddProperty(r, o.id, it->second, v);
}
static void place(drmModeAtomicReq* r, const Obj& pl, uint32_t crtc, uint32_t fb, int sw, int sh, int x, int y, int w, int h) {
  set(r, pl, "FB_ID", fb); set(r, pl, "CRTC_ID", fb ? crtc : 0);
  set(r, pl, "SRC_X", 0); set(r, pl, "SRC_Y", 0); set(r, pl, "SRC_W", (uint64_t)sw << 16); set(r, pl, "SRC_H", (uint64_t)sh << 16);
  set(r, pl, "CRTC_X", x); set(r, pl, "CRTC_Y", y); set(r, pl, "CRTC_W", w); set(r, pl, "CRTC_H", h);
}
static bool has(const drmModePlane* p, uint32_t fourcc) { for (uint32_t i = 0; i < p->count_formats; i++) if (p->formats[i] == fourcc) return true; return false; }

static AVPixelFormat want_fmt = AV_PIX_FMT_DRM_PRIME;
static AVPixelFormat pick(AVCodecContext*, const AVPixelFormat* f) {
  fprintf(stderr, "kmsvid: decoder offers:");
  for (const AVPixelFormat* q = f; *q != AV_PIX_FMT_NONE; q++) fprintf(stderr, " %s", av_get_pix_fmt_name(*q));
  fprintf(stderr, "\n");
  for (const AVPixelFormat* q = f; *q != AV_PIX_FMT_NONE; q++) if (*q == want_fmt) return *q;
  for (const AVPixelFormat* q = f; *q != AV_PIX_FMT_NONE; q++) if (*q != AV_PIX_FMT_DRM_PRIME) return *q;
  return f[0];
}

struct Shown { AVFrame* f; uint32_t fb; uint32_t handle[4]; int nh; };
static void drop(int fd, Shown& s) {
  if (s.fb) drmModeRmFB(fd, s.fb);
  for (int i = 0; i < s.nh; i++) { drm_gem_close c = {s.handle[i], 0}; drmIoctl(fd, DRM_IOCTL_GEM_CLOSE, &c); }
  av_frame_free(&s.f);
  s = Shown{};
}

int main(int argc, char** argv) {
  const char* file = nullptr;
  double seconds = 20, rate = 0;
  int dx = 150, dy = 100, dw = 500, dh = 281;
  bool ui = true, list = false, sw = false;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i];
    if (a == "--seconds") seconds = atof(argv[++i]);
    else if (a == "--rate") rate = atof(argv[++i]);
    else if (a == "--dst") sscanf(argv[++i], "%d,%d,%d,%d", &dx, &dy, &dw, &dh);
    else if (a == "--no-ui") ui = false;
    else if (a == "--planes") list = true;
    else if (a == "--sw") sw = true;
    else file = argv[i];
  }
  signal(SIGINT, on_signal); signal(SIGTERM, on_signal);

  // ---- the display
  int fd = -1; uint32_t crtc_id = 0; int crtc_index = -1; drmModeModeInfo mode = {};
  for (int c = 0; c < 4 && fd < 0 && !sw; c++) {
    char path[32]; snprintf(path, sizeof path, "/dev/dri/card%d", c);
    int f = open(path, O_RDWR | O_CLOEXEC);
    if (f < 0) continue;
    drmModeRes* r = drmModeGetResources(f);
    for (int k = 0; r && k < r->count_connectors && fd < 0; k++) {
      drmModeConnector* cn = drmModeGetConnector(f, r->connectors[k]);
      if (cn && cn->connection == DRM_MODE_CONNECTED && cn->encoder_id) {
        if (drmModeEncoder* e = drmModeGetEncoder(f, cn->encoder_id)) {
          crtc_id = e->crtc_id; drmModeFreeEncoder(e);
          for (int j = 0; j < r->count_crtcs; j++) if (r->crtcs[j] == crtc_id) crtc_index = j;
          if (drmModeCrtc* cr = drmModeGetCrtc(f, crtc_id)) { mode = cr->mode; drmModeFreeCrtc(cr); }
          if (crtc_index >= 0) { fd = f; fprintf(stderr, "kmsvid: %s connector %u crtc %u (index %d) %dx%d@%d\n", path, cn->connector_id, crtc_id, crtc_index, mode.hdisplay, mode.vdisplay, mode.vrefresh); }
        }
      }
      if (cn) drmModeFreeConnector(cn);
    }
    if (r) drmModeFreeResources(r);
    if (fd < 0) close(f);
  }
  Obj video, top; std::vector<uint32_t> overlays;
  if (!sw) {
    if (fd < 0) { fprintf(stderr, "kmsvid: no connected display with a CRTC\n"); return 1; }
    if (drmSetClientCap(fd, DRM_CLIENT_CAP_UNIVERSAL_PLANES, 1) || drmSetClientCap(fd, DRM_CLIENT_CAP_ATOMIC, 1)) { fprintf(stderr, "kmsvid: no atomic modesetting\n"); return 1; }
    drmModePlaneRes* pr = drmModeGetPlaneResources(fd);
    for (uint32_t i = 0; pr && i < pr->count_planes; i++) {
      drmModePlane* p = drmModeGetPlane(fd, pr->planes[i]);
      if (!p) continue;
      if (p->possible_crtcs & (1u << crtc_index)) {
        Obj o = object(fd, p->plane_id, DRM_MODE_OBJECT_PLANE);
        const uint64_t type = o.val["type"];
        if (list || type == DRM_PLANE_TYPE_PRIMARY) {
          fprintf(stderr, "kmsvid: plane %u %s zpos %llu fb %u crtc %u formats:", p->plane_id, type == DRM_PLANE_TYPE_PRIMARY ? "primary" : type == DRM_PLANE_TYPE_CURSOR ? "cursor" : "overlay",
                  (unsigned long long)o.val["zpos"], p->fb_id, p->crtc_id);
          for (uint32_t k = 0; k < p->count_formats; k++) fprintf(stderr, " %.4s", (const char*)&p->formats[k]);
          fprintf(stderr, "\n");
          if (list && type == DRM_PLANE_TYPE_OVERLAY && overlays.empty()) { fprintf(stderr, "kmsvid:   properties:"); for (auto& kv : o.prop) fprintf(stderr, " %s=%llu", kv.first.c_str(), (unsigned long long)o.val[kv.first]); fprintf(stderr, "\n"); }
        }
        if (type == DRM_PLANE_TYPE_OVERLAY && !p->fb_id && has(p, DRM_FORMAT_YUV420) && has(p, DRM_FORMAT_NV12) && has(p, DRM_FORMAT_ARGB8888)) overlays.push_back(p->plane_id);
      }
      drmModeFreePlane(p);
    }
    drmModeFreePlaneResources(pr);
    fprintf(stderr, "kmsvid: %zu free overlay planes with YU12, NV12 and AR24\n", overlays.size());
    if (list) return 0;
    if (overlays.size() < 2) { fprintf(stderr, "kmsvid: two overlay planes are needed\n"); return 1; }
    video = object(fd, overlays[0], DRM_MODE_OBJECT_PLANE); top = object(fd, overlays[1], DRM_MODE_OBJECT_PLANE);
  }
  if (!file) { fprintf(stderr, "kmsvid: which file?\n"); return 1; }

  // ---- the plane above: an opaque picture with a hole, a bar across the hole and a translucent box in it (premultiplied)
  uint32_t ui_fb = 0, ui_handle = 0; uint32_t* ui_px = nullptr; size_t ui_len = 0;
  const int W = mode.hdisplay, H = mode.vdisplay;
  if (!sw && ui) {
    drm_mode_create_dumb cd = {}; cd.width = W; cd.height = H; cd.bpp = 32;
    if (drmIoctl(fd, DRM_IOCTL_MODE_CREATE_DUMB, &cd)) { perror("kmsvid: create dumb"); return 1; }
    ui_handle = cd.handle; ui_len = cd.size;
    uint32_t hs[4] = {cd.handle}, ps[4] = {cd.pitch}, os[4] = {0};
    if (drmModeAddFB2(fd, W, H, DRM_FORMAT_ARGB8888, hs, ps, os, &ui_fb, 0)) { perror("kmsvid: addfb2 argb"); return 1; }
    drm_mode_map_dumb md = {}; md.handle = cd.handle;
    drmIoctl(fd, DRM_IOCTL_MODE_MAP_DUMB, &md);
    ui_px = (uint32_t*)mmap(nullptr, cd.size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, md.offset);
    if (ui_px == MAP_FAILED) { perror("kmsvid: mmap"); return 1; }
    const double t0 = now();
    for (int y = 0; y < H; y++) {
      uint32_t* row = (uint32_t*)((uint8_t*)ui_px + (size_t)y * cd.pitch);
      for (int x = 0; x < W; x++) {
        uint32_t c = 0xFF000000u | ((uint32_t)(x * 255 / W) << 16) | ((uint32_t)(y * 255 / H) << 8) | 0x60;
        if (x >= dx && x < dx + dw && y >= dy && y < dy + dh) {
          c = 0;                                                                      // the hole
          if (y >= dy + dh - 50 && y < dy + dh - 30) c = 0xFFFFFFFFu;                  // a white bar: something drawn over the film
          else if (x >= dx + 20 && x < dx + 120 && y >= dy + 20 && y < dy + 80) c = 0x80800000u;   // half a red, premultiplied
        }
        row[x] = c;
      }
    }
    fprintf(stderr, "kmsvid: the plane above filled in %.2f ms (%dx%d, pitch %u)\n", (now() - t0) * 1e3, W, H, cd.pitch);
  }

  // ---- the decoder
  AVFormatContext* fmt = nullptr;
  if (avformat_open_input(&fmt, file, nullptr, nullptr) < 0 || avformat_find_stream_info(fmt, nullptr) < 0) { fprintf(stderr, "kmsvid: cannot open %s\n", file); return 1; }
  const AVCodec* codec = nullptr;
  const int st = av_find_best_stream(fmt, AVMEDIA_TYPE_VIDEO, -1, -1, &codec, 0);
  if (st < 0) return 1;
  char name[64]; snprintf(name, sizeof name, "%s_v4l2m2m", codec->name);
  const AVCodec* m2m = avcodec_find_decoder_by_name(name);
  if (!m2m) { fprintf(stderr, "kmsvid: no %s in this FFmpeg\n", name); return 1; }
  AVCodecContext* dec = avcodec_alloc_context3(m2m);
  avcodec_parameters_to_context(dec, fmt->streams[st]->codecpar);
  if (sw) want_fmt = AV_PIX_FMT_YUV420P;
  dec->get_format = pick;
  if (avcodec_open2(dec, m2m, nullptr) < 0) { fprintf(stderr, "kmsvid: cannot open %s\n", name); return 1; }
  const double tb = av_q2d(fmt->streams[st]->time_base), clip_rate = av_q2d(fmt->streams[st]->avg_frame_rate);
  const double scale = rate > 0 ? clip_rate / rate : 1;
  fprintf(stderr, "kmsvid: %s, %dx%d, %.3f pictures a second in the file, shown at %.3f\n", name, dec->width, dec->height, clip_rate, clip_rate / scale);

  AVPacket* pkt = av_packet_alloc();
  AVFrame* fr = av_frame_alloc();
  Shown cur = {}, old = {}, next = {};
  bool pending = false, first = true, draining = false, described = false;
  int frames = 0, late = 0, fails = 0;
  double base = 0, t_start = 0, cpu_start = 0, last_flip = 0, t_addfb = 0, t_commit = 0;
  int64_t pts0 = AV_NOPTS_VALUE;
  std::map<int, int> gaps;   // refresh periods between two pictures -> how often
  std::vector<double> lateness;
  struct Ev { bool* pending; double t; } evd = {&pending, 0};
  drmEventContext evc = {}; evc.version = 2;
  evc.page_flip_handler = [](int, unsigned, unsigned s, unsigned us, void* d) { Ev* e = (Ev*)d; *e->pending = false; e->t = s + us / 1e6; };
  auto wait_flip = [&]() {
    pollfd p = {fd, POLLIN, 0};
    while (pending && poll(&p, 1, 200) > 0) drmHandleEvent(fd, &evc);
    if (pending) { fprintf(stderr, "kmsvid: a flip did not complete in 200 ms\n"); pending = false; }
    if (next.f) { drop(fd, old); old = cur; cur = next; next = Shown{}; }   // the frame replaced two flips ago goes back to the decoder
  };

  while (!stop) {
    int r = avcodec_receive_frame(dec, fr);
    if (r == AVERROR(EAGAIN) && !draining) {
      if (av_read_frame(fmt, pkt) < 0) {   // loop: seek to the start, the timeline goes on
        if (frames == 0) break;
        avcodec_send_packet(dec, nullptr); draining = true; continue;
      }
      if (pkt->stream_index == st) avcodec_send_packet(dec, pkt);
      av_packet_unref(pkt);
      continue;
    }
    if (r == AVERROR_EOF || (r < 0 && draining)) {
      avcodec_flush_buffers(dec); av_seek_frame(fmt, st, 0, AVSEEK_FLAG_BACKWARD); draining = false;
      base = last_flip > 0 ? -1 : 0; pts0 = AV_NOPTS_VALUE;   // the next picture restarts the clock one picture after the last
      continue;
    }
    if (r < 0) { if (++fails > 50) break; continue; }
    if (pts0 == AV_NOPTS_VALUE) {
      pts0 = fr->best_effort_timestamp;
      const double t = now();
      if (first) { t_start = t; cpu_start = cpu(); base = t + 0.05; }
      else base = t + 1 / (clip_rate / scale);
    }
    const double due = base + (fr->best_effort_timestamp - pts0) * tb * scale;
    if (sw) {   // the decoder alone: the frame is in the driver's buffer, nothing reads it
      if (!described) { described = true; fprintf(stderr, "kmsvid: frame format %s %dx%d linesize %d\n", av_get_pix_fmt_name((AVPixelFormat)fr->format), fr->width, fr->height, fr->linesize[0]); }
      double w = due - now(); if (w > 0) usleep((useconds_t)(w * 1e6));
      frames++; av_frame_unref(fr); first = false;
      if (now() - t_start >= seconds) break;
      continue;
    }
    if (fr->format != AV_PIX_FMT_DRM_PRIME) { fprintf(stderr, "kmsvid: the decoder gave %s, not drm_prime\n", av_get_pix_fmt_name((AVPixelFormat)fr->format)); break; }
    const AVDRMFrameDescriptor* d = (const AVDRMFrameDescriptor*)fr->data[0];
    if (!described) {
      described = true;
      fprintf(stderr, "kmsvid: frame %dx%d, %d object(s), %d layer(s), format %.4s, modifier 0x%llx, range %s, space %s\n", fr->width, fr->height, d->nb_objects, d->nb_layers,
              (const char*)&d->layers[0].format, (unsigned long long)d->objects[0].format_modifier, av_color_range_name(fr->color_range), av_color_space_name(fr->colorspace));
      for (int i = 0; i < d->layers[0].nb_planes; i++) fprintf(stderr, "kmsvid:   plane %d: object %d offset %td pitch %td\n", i, d->layers[0].planes[i].object_index, d->layers[0].planes[i].offset, d->layers[0].planes[i].pitch);
      for (int i = 0; i < d->nb_objects; i++) fprintf(stderr, "kmsvid:   object %d: fd %d size %zu\n", i, d->objects[i].fd, d->objects[i].size);
    }
    // the dmabuf as a KMS framebuffer: no pixel is read or written here
    const double a0 = now();
    Shown s = {}; s.f = av_frame_clone(fr); av_frame_unref(fr);
    uint32_t objh[4] = {}, hs[4] = {}, ps[4] = {}, os[4] = {}; uint64_t ms[4] = {};
    bool ok = true;
    for (int i = 0; i < d->nb_objects; i++) { if (drmPrimeFDToHandle(fd, d->objects[i].fd, &objh[i])) ok = false; else s.handle[s.nh++] = objh[i]; }
    const AVDRMLayerDescriptor& L = d->layers[0];
    for (int i = 0; i < L.nb_planes; i++) { hs[i] = objh[L.planes[i].object_index]; ps[i] = (uint32_t)L.planes[i].pitch; os[i] = (uint32_t)L.planes[i].offset; ms[i] = d->objects[L.planes[i].object_index].format_modifier; }
    const bool mod = d->objects[0].format_modifier != DRM_FORMAT_MOD_INVALID && d->objects[0].format_modifier != DRM_FORMAT_MOD_LINEAR;
    if (ok && drmModeAddFB2WithModifiers(fd, s.f->width, s.f->height, L.format, hs, ps, os, mod ? ms : nullptr, &s.fb, mod ? DRM_MODE_FB_MODIFIERS : 0)) { perror("kmsvid: addfb2 of the frame"); ok = false; }
    t_addfb += now() - a0;
    if (!ok) { drop(fd, s); if (++fails > 20) break; continue; }

    if (pending || next.f) wait_flip();
    double w = due - 0.004 - now();   // commit a little before the picture is due: it is shown at the next refresh
    if (w > 0) usleep((useconds_t)(w * 1e6));
    const double c0 = now();
    drmModeAtomicReq* req = drmModeAtomicAlloc();
    place(req, video, crtc_id, s.fb, s.f->width, s.f->height, dx, dy, dw, dh);
    if (first) {
      set(req, video, "zpos", 1);
      set(req, video, "COLOR_RANGE", s.f->color_range == AVCOL_RANGE_JPEG || fmt->streams[st]->codecpar->color_range == AVCOL_RANGE_JPEG ? 1 : 0);   // 1: full range
      set(req, video, "COLOR_ENCODING", s.f->colorspace == AVCOL_SPC_BT709 ? 1 : 0);
      if (ui) { place(req, top, crtc_id, ui_fb, W, H, 0, 0, W, H); set(req, top, "zpos", 2); }
    }
    int e = drmModeAtomicCommit(fd, req, DRM_MODE_PAGE_FLIP_EVENT | DRM_MODE_ATOMIC_NONBLOCK, &evd);
    drmModeAtomicFree(req);
    t_commit += now() - c0;
    if (e) { fprintf(stderr, "kmsvid: atomic commit failed: %s\n", strerror(-e)); drop(fd, s); if (++fails > 20) break; continue; }
    pending = true; next = s; first = false;
    // wait for this flip now, to read when the picture reached the screen (the engine would go on and wait at its next frame)
    wait_flip();
    const double shown = evd.t;
    if (last_flip > 0) gaps[(int)((shown - last_flip) * mode.vrefresh + 0.5)]++;
    last_flip = shown;
    lateness.push_back((shown - due) * 1e3);
    if (shown - due > 1.5 / mode.vrefresh + 0.004) late++;
    frames++;
    if (now() - t_start >= seconds) break;
  }
  const double wall = now() - t_start, used = cpu() - cpu_start;
  fprintf(stderr, "kmsvid: %d pictures in %.2f s: %.2f a second, CPU %.2f ms a picture (%.1f%% of a core)", frames, wall, frames / wall, frames ? used * 1e3 / frames : 0, wall > 0 ? used * 100 / wall : 0);
  if (!sw && frames) {
    std::sort(lateness.begin(), lateness.end());
    fprintf(stderr, ", %d late, shown after due p50 %.1f p99 %.1f max %.1f ms\nkmsvid: addfb %.3f ms, commit %.3f ms a picture; refresh periods between pictures:", late, lateness[lateness.size() / 2], lateness[(size_t)(lateness.size() * 0.99)],
            lateness.back(), t_addfb * 1e3 / frames, t_commit * 1e3 / frames);
    for (auto& g : gaps) fprintf(stderr, " %dx%d", g.first, g.second);
  }
  fprintf(stderr, "\n");

  // ---- leave: the two planes off, then the buffers
  if (!sw) {
    wait_flip();
    drmModeAtomicReq* req = drmModeAtomicAlloc();
    place(req, video, crtc_id, 0, 0, 0, 0, 0, 0, 0);
    if (ui) place(req, top, crtc_id, 0, 0, 0, 0, 0, 0, 0);
    if (int e = drmModeAtomicCommit(fd, req, 0, nullptr)) fprintf(stderr, "kmsvid: disabling the planes failed: %s\n", strerror(-e));
    drmModeAtomicFree(req);
    drop(fd, next); drop(fd, cur); drop(fd, old);
    if (ui_px) munmap(ui_px, ui_len);
    if (ui_fb) drmModeRmFB(fd, ui_fb);
    if (ui_handle) { drm_mode_destroy_dumb dd = {ui_handle}; drmIoctl(fd, DRM_IOCTL_MODE_DESTROY_DUMB, &dd); }
  }
  av_frame_free(&fr); av_packet_free(&pkt);
  avcodec_free_context(&dec); avformat_close_input(&fmt);
  if (fd >= 0) close(fd);
  return 0;
}
