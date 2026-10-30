// display-sidecar: a Sidecar screen (app/sidecar: the iPad, iPhone, Android, Mac and Pi apps) as the app's display. The app's own frames go
// to it, with no screen capture and no virtual display: the engine knows what changed, so each frame sends its damaged rectangle and
// nothing else, at the screen's own pixels (the app draws at `scale` pixels a point: Retina on an iPad). The wire is the screen's
// (plugins/display-rmpp/stream.h): RECTs of 24-bit rows, PNG's Sub filter, zstd level 1, cut in bands that every core compresses at
// once; the screen ACKs each RECT, and at most `inflight` frames are on the way (damage accumulates meanwhile, so a slow link gets fewer,
// larger frames, never a queue). Its touches, Pencil and two-finger scrolls come back as the app's pointer, pen and wheel.
// The screen: ZINC_SIDECAR (else the `host` option): "adb[:serial]" (Android on the USB cable, through the adb server), "usb" (an iPad or
// iPhone on the cable, through usbmuxd), or an address. ZINC_SIDECAR_SCALE overrides `scale`; ZINC_SIDECAR_LOG=1 prints a line a second.
#include "hal.h"
#include "zstd.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <netdb.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <vector>

#ifndef ZP_DISPLAY_SIDECAR_HOST
#define ZP_DISPLAY_SIDECAR_HOST "adb"
#endif
#ifndef ZP_DISPLAY_SIDECAR_SCALE
#define ZP_DISPLAY_SIDECAR_SCALE 2
#endif
#ifndef ZP_DISPLAY_SIDECAR_FPS
#define ZP_DISPLAY_SIDECAR_FPS 60
#endif
#ifndef ZP_DISPLAY_SIDECAR_INFLIGHT
#define ZP_DISPLAY_SIDECAR_INFLIGHT 2
#endif
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

static const int PORT = 7710, BAND = 64;
static int fd = -1, RW, RH, K = 1;           // the connection, the screen's pixels, pixels a point
static uint32_t* fb;                          // the frame as the app drew it (render_damage keeps it)
// the sender thread: encodes and sends `job` from `snap` (the damaged rows, copied) while the app draws its next frames
static uint32_t* snap;
struct Box { int x, y, w, h; };
static std::vector<Box> job;
static bool busy, broken, gone;   // gone: the screen left (the socket stays open until the end: the sender thread may use it)
static std::mutex mu; static std::condition_variable cv;
static int dx0, dy0, dx1, dy1;                // damage not sent yet
static std::vector<int> frameEnds;            // the RECT count at the end of each frame on the way
static int rectsSent, rectsAcked;
static uint64_t lastPresent;
static long framesLeft = -1;
static bool logit;
static uint64_t stT0, stBytes, stFrames, stEncodeUs, stLoops, stDamaged;
// the screen's input, in points
static float px, py, wheel; static int pdown;

static bool readAll(int c, void* p, size_t n) {
  for (size_t got = 0; got < n;) { ssize_t r = recv(c, (char*)p + got, n - got, 0); if (r <= 0) return false; got += (size_t)r; }
  return true;
}
static bool writeAll(const void* p, size_t n) {
  for (size_t put = 0; put < n;) { ssize_t w = send(fd, (const char*)p + put, n - put, MSG_NOSIGNAL); if (w <= 0) return false; put += (size_t)w; }
  return true;
}
static int tcp(const char* host, int port) {
  addrinfo hints{}, *res = nullptr; hints.ai_socktype = SOCK_STREAM; hints.ai_family = AF_INET;
  if (getaddrinfo(host, std::to_string(port).c_str(), &hints, &res) != 0 || !res) return -1;
  int c = socket(AF_INET, SOCK_STREAM, 0);
  if (connect(c, res->ai_addr, res->ai_addrlen) != 0) { close(c); c = -1; }
  freeaddrinfo(res);
  return c;
}
/** adb: "host:transport[-usb]" then "tcp:7710" to the Mac's adb server, each answered OKAY; the socket is then the device's port. */
static int adb(const char* serial) {
  int c = tcp("127.0.0.1", 5037);
  if (c < 0) { fprintf(stderr, "display-sidecar: no adb server (adb start-server)\n"); return -1; }
  for (std::string rq : {*serial ? std::string("host:transport:") + serial : std::string("host:transport-usb"), "tcp:" + std::to_string(PORT)}) {
    char len[5]; snprintf(len, sizeof len, "%04x", (unsigned)rq.size());
    char ok[4];
    if (send(c, len, 4, 0) != 4 || send(c, rq.data(), rq.size(), 0) != (ssize_t)rq.size() || !readAll(c, ok, 4) || memcmp(ok, "OKAY", 4)) { close(c); return -1; }
  }
  return c;
}
/** usbmuxd (an iPad or iPhone on the cable): plist messages behind [len][1][8][tag]; ListDevices, then Connect to the first on USB. */
static bool muxAsk(int c, const std::string& body, std::string& answer) {
  std::string m = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">"
                  "<plist version=\"1.0\"><dict>" + body + "<key>ClientVersionString</key><string>zinc</string><key>ProgName</key><string>zinc</string></dict></plist>";
  uint32_t h[4] = {(uint32_t)(16 + m.size()), 1, 8, 1};   // little-endian on every host this runs on
  if (send(c, h, 16, 0) != 16 || send(c, m.data(), m.size(), 0) != (ssize_t)m.size() || !readAll(c, h, 16) || h[0] < 16 || h[0] > (1u << 20)) return false;
  answer.resize(h[0] - 16);
  return readAll(c, answer.data(), answer.size());
}
static int usbmux() {
  auto open = [] {
    int c = socket(AF_UNIX, SOCK_STREAM, 0);
    sockaddr_un a{}; a.sun_family = AF_UNIX; snprintf(a.sun_path, sizeof a.sun_path, "/var/run/usbmuxd");
    if (connect(c, (sockaddr*)&a, sizeof a) != 0) { close(c); return -1; }
    return c;
  };
  int c = open(); std::string list;
  if (c < 0 || !muxAsk(c, "<key>MessageType</key><string>ListDevices</string>", list)) { if (c >= 0) close(c); return -1; }
  close(c);
  // each device's Properties: its DeviceID and ConnectionType (USB, or Network for one paired on Wi-Fi)
  int id = -1;
  for (size_t at = 0; (at = list.find("<key>DeviceID</key>", at)) != std::string::npos; at++) {
    size_t i = list.find("<integer>", at), end = list.find("</dict>", at), start = list.rfind("<dict>", at);
    if (i == std::string::npos) break;
    std::string props = list.substr(start == std::string::npos ? 0 : start, end == std::string::npos ? std::string::npos : end - start);
    if (props.find("<string>USB</string>") != std::string::npos) { id = atoi(list.c_str() + i + 9); break; }
  }
  if (id < 0) return -1;
  c = open(); std::string ok;
  const int portBE = (PORT & 255) << 8 | PORT >> 8;   // the port in network order, read as a host integer
  if (c < 0 || !muxAsk(c, "<key>MessageType</key><string>Connect</string><key>DeviceID</key><integer>" + std::to_string(id) +
                          "</integer><key>PortNumber</key><integer>" + std::to_string(portBE) + "</integer>", ok) ||
      ok.find("<key>Number</key>") == std::string::npos || ok.find("<integer>0</integer>") == std::string::npos) { if (c >= 0) close(c); return -1; }
  return c;
}
/** The screen named by ZINC_SIDECAR or the option, connected and its hello read ("RMPP <w> <h> <kind> +caps"): false when none answers. */
static bool connectScreen() {
  if (fd >= 0) return true;
  const char* h = getenv("ZINC_SIDECAR") ? getenv("ZINC_SIDECAR") : ZP_DISPLAY_SIDECAR_HOST;
  fd = !strncmp(h, "adb", 3) ? adb(h[3] == ':' ? h + 4 : "") : !strncmp(h, "usb", 3) ? usbmux() : tcp(h, PORT);
  if (fd < 0) { fprintf(stderr, "display-sidecar: no Sidecar screen at %s (is its app open?)\n", h); return false; }
  char line[512]; size_t n = 0;
  while (n + 1 < sizeof line && recv(fd, line + n, 1, 0) == 1 && line[n] != '\n') n++;
  line[n] = 0;
  if (sscanf(line, "RMPP %d %d", &RW, &RH) != 2 || RW <= 0 || RH <= 0 || !strstr(line, "+rgb") || !strstr(line, "+zstd")) {
    fprintf(stderr, "display-sidecar: not a colour Sidecar screen: %s\n", line); close(fd); fd = -1; return false;
  }
  int one = 1;
  setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
#ifdef SO_NOSIGPIPE
  setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
  const char* s = getenv("ZINC_SIDECAR_SCALE");
  K = s ? atoi(s) : ZP_DISPLAY_SIDECAR_SCALE;
  if (K < 1 || RW % K || RH % K) K = 1;
  fprintf(stderr, "display-sidecar: %s, %dx%d pixels, the app at %dx%d points\n", h, RW, RH, RW / K, RH / K);
  return true;
}

// --- a frame's damage as RECTs: bands of 64 rows, each Sub-filtered B G R and zstd-compressed on its own thread
struct Band { int x, y, w, h; std::vector<uint8_t> plain, packed; size_t n; };
static std::vector<Band> bands;
static void encode(Band& b) {
  const int x = b.x, w = b.w;
  static thread_local ZSTD_CCtx* cx = ZSTD_createCCtx();
  const size_t stride = (size_t)w * 3, raw = stride * b.h;
  b.plain.resize(raw);
  for (int r = 0; r < b.h; r++) {
    const uint8_t* s = (const uint8_t*)(snap + (size_t)(b.y + r) * RW + x);   // B G R A bytes
    uint8_t* d = b.plain.data() + r * stride;
    uint8_t pb = 0, pg = 0, pr = 0;
    for (int i = 0; i < w; i++, s += 4, d += 3) { d[0] = s[0] - pb; d[1] = s[1] - pg; d[2] = s[2] - pr; pb = s[0]; pg = s[1]; pr = s[2]; }
  }
  b.packed.resize(ZSTD_compressBound(raw));
  b.n = ZSTD_compressCCtx(cx, b.packed.data(), b.packed.size(), b.plain.data(), raw, 1);
  if (ZSTD_isError(b.n) || b.n >= raw) b.n = 0;   // sent plain
}
static void put16(uint8_t* p, int v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); }
static void sendJob() {
  const uint64_t t0 = hal_time_us();
  bands.clear();
  for (const Box& j : job) { Band b; b.x = j.x; b.y = j.y; b.w = j.w; b.h = j.h; bands.push_back(std::move(b)); }
  // ponytail: a thread a band group each frame (~20 us each); a pool if it shows in a profile
  const int nt = (int)std::min<size_t>(bands.size(), std::max(1u, std::thread::hardware_concurrency()));
  std::vector<std::thread> ts;
  for (int t = 1; t < nt; t++) ts.emplace_back([t, nt] { for (size_t i = t; i < bands.size(); i += nt) encode(bands[i]); });
  for (size_t i = 0; i < bands.size(); i += nt) encode(bands[i]);
  for (auto& t : ts) t.join();
  const uint64_t enc = hal_time_us() - t0;
  size_t bytes = 0;
  for (size_t i = 0; i < bands.size(); i++) {
    Band& b = bands[i];
    const size_t len = b.n ? b.n : b.plain.size();
    uint8_t h[16] = {1, 24};
    put16(h + 2, b.x); put16(h + 4, b.y); put16(h + 6, b.w); put16(h + 8, b.h);
    h[10] = (uint8_t)((b.n ? 2 : 0) | 0x80); h[11] = i + 1 < bands.size();
    for (int k = 0; k < 4; k++) h[12 + k] = (uint8_t)(len >> (8 * k));
    if (!writeAll(h, 16) || !writeAll(b.n ? b.packed.data() : b.plain.data(), len)) { std::lock_guard<std::mutex> l(mu); broken = true; return; }
    bytes += 16 + len;
  }
  std::lock_guard<std::mutex> l(mu);
  rectsSent += (int)bands.size();
  frameEnds.push_back(rectsSent);
  stFrames++; stBytes += bytes; stEncodeUs += enc;
}
static void sender() {
  for (;;) {
    { std::unique_lock<std::mutex> l(mu); cv.wait(l, [] { return busy; }); }
    sendJob();
    std::lock_guard<std::mutex> l(mu); busy = false;
  }
}
/** The damage to the sender thread when it is free and the screen has room. The engine gives one box around everything that changed
 *  (a ball at the top and a paddle at the bottom: most of the screen); each band of 64 rows of it is compared with what was sent and
 *  only its changed columns go, copied, so the app draws on meanwhile. */
static void handOver() {
  std::lock_guard<std::mutex> l(mu);
  if (busy || dx1 <= dx0 || (int)frameEnds.size() >= ZP_DISPLAY_SIDECAR_INFLIGHT) return;
  job.clear();
  for (int y0 = dy0; y0 < dy1;) {
    const int y1 = std::min(dy1, (y0 / BAND + 1) * BAND);
    int c0 = dx1, c1 = dx0;
    for (int y = y0; y < y1; y++) {
      const uint32_t *a = fb + (size_t)y * RW, *b = snap + (size_t)y * RW;
      if (!memcmp(a + dx0, b + dx0, (size_t)(dx1 - dx0) * 4)) continue;
      int l0 = dx0, l1 = dx1;
      while (l0 < c0 && a[l0] == b[l0]) l0++;
      while (l1 > c1 && a[l1 - 1] == b[l1 - 1]) l1--;
      c0 = std::min(c0, l0); c1 = std::max(c1, l1);
    }
    if (c1 > c0) {
      c0 &= ~15; c1 = std::min(dx1 > c1 ? (c1 + 15) & ~15 : c1, RW);
      for (int y = y0; y < y1; y++) memcpy(snap + (size_t)y * RW + c0, fb + (size_t)y * RW + c0, (size_t)(c1 - c0) * 4);
      job.push_back({c0, y0, c1 - c0, y1 - y0});
    }
    y0 = y1;
  }
  dx0 = dy0 = dx1 = dy1 = 0;
  if (job.empty()) return;
  busy = true; cv.notify_one();
}

// --- the web views (plugins/webview): with no window of the app they live off screen; their pictures are laid into the frame here and the
// touches that land on them go to them (hal_overlays, registered by the plugin that has them).
static unsigned webGen[16]; static int webBox[16][4];   // the picture last laid, and where (pixels)
static void damage(int x0, int y0, int x1, int y1) {
  if (dx1 <= dx0) { dx0 = x0; dy0 = y0; dx1 = x1; dy1 = y1; }
  else { dx0 = std::min(dx0, x0); dy0 = std::min(dy0, y0); dx1 = std::max(dx1, x1); dy1 = std::max(dy1, y1); }
}
/** Lays each web view's newest picture over its clip of the frame when the picture is new or the app drew over it (fb then has the
 *  app's pixels there); a view that went away leaves its box to the app's next frame. */
static void layWebViews(bool drew, int fx0, int fy0, int fx1, int fy1) {
  if (!hal_overlays) return;
  for (int i = 0; i < 16; i++) {
    const uint32_t* px; int pw, ph; double b[4], c[4]; unsigned gen;
    int* box = webBox[i];
    if (!hal_overlays->picture(i, K, &px, &pw, &ph, b, c, &gen)) {
      if (box[2] > box[0]) { webGen[i] = 0; box[0] = box[2] = 0; }
      continue;
    }
    const int x0 = std::max(0, (int)(c[0] * K)), y0 = std::max(0, (int)(c[1] * K));
    const int x1 = std::min(RW, (int)((c[0] + c[2]) * K)), y1 = std::min(RH, (int)((c[1] + c[3]) * K));
    const bool moved = x0 != box[0] || y0 != box[1] || x1 != box[2] || y1 != box[3];
    const bool under = drew && fx0 < x1 && fx1 > x0 && fy0 < y1 && fy1 > y0;
    if (x1 <= x0 || y1 <= y0 || (gen == webGen[i] && !moved && !under)) continue;
    const int ox = (int)(b[0] * K), oy = (int)(b[1] * K);   // the picture's top-left: its view's box, the clip may cut it
    for (int y = y0; y < y1; y++) {
      const int sy = y - oy;
      if (sy < 0 || sy >= ph) continue;
      const int sx0 = std::max(x0 - ox, 0), sx1 = std::min(x1 - ox, pw);
      if (sx1 > sx0) memcpy(fb + (size_t)y * RW + ox + sx0, px + (size_t)sy * pw + sx0, (size_t)(sx1 - sx0) * 4);
    }
    webGen[i] = gen; box[0] = x0; box[1] = y0; box[2] = x1; box[3] = y1;
    damage(x0, y0, x1, y1);
  }
}

// --- the screen's answers, 16 bytes [kind][type][u16 id][i32 a][i32 b][i32 c]: ACKs, touches, pen, scrolls
static void readAnswers() {
  uint8_t m[16];
  while (fd >= 0 && !gone) {
    ssize_t n = recv(fd, m, 16, MSG_DONTWAIT | MSG_PEEK);
    if (n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK)) { fprintf(stderr, "display-sidecar: the screen left\n"); gone = true; return; }
    if (n < 16) return;
    readAll(fd, m, 16);
    int32_t a, b, c; memcpy(&a, m + 4, 4); memcpy(&b, m + 8, 4); memcpy(&c, m + 12, 4);
    const int type = m[1], id = m[2] | m[3] << 8;
    if (m[0] == 1) { std::lock_guard<std::mutex> l(mu); rectsAcked++; while (!frameEnds.empty() && frameEnds.front() <= rectsAcked) frameEnds.erase(frameEnds.begin()); }
    else if (m[0] == 2) {   // INPUT: 0x10 press, 0x11 release, 0x12 move, 0x13 hover, 0x14 / 0x15 right button; 0x20.. the pen, its pressure 0..4096 and tilt
      px = (float)a / K; py = (float)b / K;
      const int k = type & 15;
      static bool toWeb;   // the press went to a web view: its moves and release follow it
      if (hal_overlays && type < 0x20) {
        // the web views' kinds: 0 press, 1 release, 2 drag (while they hold the press), 7 a mouse moving, 5 / 6 the right button
        const int wk = k <= 2 ? k : k == 3 ? 7 : k == 4 ? 5 : k == 5 ? 6 : -1;
        if (wk >= 0 && (wk != 2 || toWeb) && (wk != 1 || toWeb)) {
          const bool took = hal_overlays->pointer(px, py, wk, 0, 0);
          if (k <= 1) toWeb = took && k == 0;
          if (took) continue;
        }
      }
      if (k == 0) pdown = 1; else if (k == 1) pdown = 0;
      if (type >= 0x20) {
        HalPen p{px, py, c / 4096.0f, (float)(int8_t)(id & 255), (float)(int8_t)(id >> 8), k == 1 ? 0u : k == 3 ? (uint32_t)HAL_PEN_HOVER : (uint32_t)HAL_PEN_DOWN};
        hal_pen_push(&p);
      }
    } else if (m[0] == 6) {   // SCROLL: two fingers, in pixels; a wheel step is about 40 points
      if (!hal_overlays || !hal_overlays->pointer(px, py, 3, (double)a / K, (double)b / K)) wheel += (float)b / K / 40;
    } else if (m[0] == 13 && hal_overlays) {   // PINCH: the web views zoom; the app has no pinch yet
      hal_overlays->pointer((double)a / K, (double)b / K, 4, c / 65536.0, 0);
    }
  }
}

static void s_size(int32_t* w, int32_t* h) { if (connectScreen()) { *w = RW / K; *h = RH / K; } }
static int32_t s_scale() { return K; }
static int s_init(const HalConfig*) {
  if (!connectScreen()) return 0;
  fb = (uint32_t*)calloc((size_t)RW * RH, 4); snap = (uint32_t*)malloc((size_t)RW * RH * 4);
  for (size_t i = 0; i < (size_t)RW * RH; i++) snap[i] = 0xff000001u;   // differs from every pixel the app draws (its alpha byte is 0): the first frame goes whole
  std::thread(sender).detach();
  if (const char* f = getenv("ZINC_FRAMES")) framesLeft = atol(f);
  logit = getenv("ZINC_SIDECAR_LOG") && getenv("ZINC_SIDECAR_LOG")[0] == '1';
  return 1;
}
static void s_present(const HalFrame* f) {
  readAnswers();
  stLoops++; stDamaged += f->x1 > f->x0;
  if (fd >= 0 && !gone && f->w == RW && f->h == RH && f->x1 > f->x0 && f->y1 > f->y0) {
    (f->render_damage ? f->render_damage : f->render)(fb + (size_t)f->y0 * RW, f->y0, f->y1);
    damage(f->x0, f->y0, f->x1, f->y1);
  }
  const bool drew = f->x1 > f->x0 && f->y1 > f->y0;
  if (fd >= 0 && !gone && f->w == RW && f->h == RH) layWebViews(drew, f->x0, f->y0, f->x1, f->y1);
  { std::lock_guard<std::mutex> l(mu); if (broken) gone = true; }
  if (fd >= 0 && !gone) handOver();
  uint64_t t = hal_time_us();
  if (logit && t - stT0 >= 1000000) {
    std::lock_guard<std::mutex> l(mu);
    if (stT0) fprintf(stderr, "display-sidecar: %llu frames/s sent of %llu drawn (%llu changed), %.1f Mbit/s, encode %.1f ms a frame, %zu on the way\n", (unsigned long long)stFrames,
                      (unsigned long long)stLoops, (unsigned long long)stDamaged,
                      stBytes * 8 / 1e6, stFrames ? stEncodeUs / 1000.0 / stFrames : 0.0, frameEnds.size());
    stT0 = t; stBytes = stFrames = stEncodeUs = stLoops = stDamaged = 0;
  }
  // no vsync here: the loop is held to the rate by deadlines (macOS stretches a windowless process's sleeps; the next frame makes up)
  const uint64_t period = 1000000 / (ZP_DISPLAY_SIDECAR_FPS > 0 ? ZP_DISPLAY_SIDECAR_FPS : 60);
  lastPresent = lastPresent && t < lastPresent + 2 * period ? lastPresent + period : t;
  if (lastPresent > t) hal_sleep_us(lastPresent - t);
}
static void s_poll(HalInput* in) {
  readAnswers();
  in->px = px; in->py = py; in->pdown = pdown;
  in->ntouch = pdown ? 1 : 0;
  if (pdown) { in->touch[0].id = 0; in->touch[0].x = px; in->touch[0].y = py; }
  in->wheel += wheel; wheel = 0;
  if (fd < 0 || gone || (framesLeft >= 0 && framesLeft-- == 0)) in->quit = 1;
}
static void s_shutdown() { if (fd >= 0) shutdown(fd, SHUT_RDWR); }   // the sender thread may be writing: the socket is shut, not closed

static HalDisplay sidecar_display = {s_init, s_present, s_poll, s_shutdown, 0, 0, s_scale, nullptr, s_size, nullptr, s_size};
static int registered = hal_display_register(&sidecar_display, "sidecar");

