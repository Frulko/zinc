// zinc:camera on Linux and the Raspberry Pi: V4L2 (/dev/video*, mmap streaming), then the shared part (camera.host.cpp). A worker thread
// per camera waits on the device, converts each buffer to the runtime image's pixels (YUYV directly, MJPEG through stb_image) and keeps the
// newest frame under a mutex. YUYV is asked first: it costs no decode, which matters on a Pi 1; MJPEG when the camera only offers that, or
// offers YUYV too slowly at the asked size (VIDIOC_ENUM_FMT, VIDIOC_ENUM_FRAMEINTERVALS). Cameras behind libcamera only (the Pi's CSI camera
// modules on Bookworm) have no V4L2 capture node and are not listed: `libcamerify zinc run ...` (libcamera's V4L2 compatibility layer) shows them.
#define CAM_BACKEND 1
#include "backend.h"
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <linux/videodev2.h>
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#include "stb/stb_image.h"

namespace {
const int MAXS = 8, NBUF = 4;
struct V4l {
  int fd = -1, w = 0, h = 0;
  uint32_t fmt = 0, seq = 0;
  void* map[NBUF] = {};
  size_t len[NBUF] = {};
  int nbuf = 0;
  uint32_t* px = nullptr;   // the newest frame
  pthread_t thread;
  pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
  volatile bool stop = false, running = false;
};
V4l devs[MAXS];

int xioctl(int fd, unsigned long req, void* arg) { int r; do r = ioctl(fd, req, arg); while (r < 0 && errno == EINTR); return r; }
bool capture_node(int fd, v4l2_capability& cap) {
  if (xioctl(fd, VIDIOC_QUERYCAP, &cap) < 0) return false;
  const uint32_t c = cap.capabilities & V4L2_CAP_DEVICE_CAPS ? cap.device_caps : cap.capabilities;
  return (c & V4L2_CAP_VIDEO_CAPTURE) && (c & V4L2_CAP_STREAMING);
}
// The pixel formats the camera lists (VIDIOC_ENUM_FMT); a driver that lists none is tried anyway
bool offers(int fd, uint32_t fmt) {
  v4l2_fmtdesc fd2 = {};
  fd2.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  for (fd2.index = 0; xioctl(fd, VIDIOC_ENUM_FMT, &fd2) == 0; fd2.index++) if (fd2.pixelformat == fmt) return true;
  return fd2.index == 0;
}
// The camera delivers `fps` at w x h in this format (VIDIOC_ENUM_FRAMEINTERVALS); unknown counts as yes
bool fast_enough(int fd, uint32_t fmt, int w, int h, int fps) {
  v4l2_frmivalenum fi = {};
  fi.pixel_format = fmt; fi.width = (uint32_t)w; fi.height = (uint32_t)h;
  for (fi.index = 0; xioctl(fd, VIDIOC_ENUM_FRAMEINTERVALS, &fi) == 0; fi.index++) {
    if (fi.type != V4L2_FRMIVAL_TYPE_DISCRETE) return true;   // a range: the rate is asked with S_PARM
    if (fi.discrete.numerator && (double)fi.discrete.denominator / fi.discrete.numerator >= fps - 0.5) return true;
  }
  return fi.index == 0;
}
inline uint8_t clamp8(int v) { return (uint8_t)(v < 0 ? 0 : v > 255 ? 255 : v); }
inline uint32_t rgb(int y, int u, int v) {   // BT.601, integers
  const int c = (y - 16) * 298;
  return (uint32_t)clamp8((c + 409 * v + 128) >> 8) << 16 | (uint32_t)clamp8((c - 100 * u - 208 * v + 128) >> 8) << 8 | clamp8((c + 516 * u + 128) >> 8);
}
void convert(V4l& d, const uint8_t* p, size_t n, uint32_t* out) {
  if (d.fmt == V4L2_PIX_FMT_YUYV) {
    if (n < (size_t)d.w * d.h * 2) return;
    for (int i = 0; i < d.w * d.h; i += 2, p += 4) {
      const int u = p[1] - 128, v = p[3] - 128;
      out[i] = rgb(p[0], u, v); out[i + 1] = rgb(p[2], u, v);
    }
    return;
  }
  int w, h, k;   // MJPEG
  uint8_t* rgb8 = stbi_load_from_memory(p, (int)n, &w, &h, &k, 3);
  if (!rgb8) return;
  const int cw = w < d.w ? w : d.w, ch = h < d.h ? h : d.h;
  for (int y = 0; y < ch; y++)
    for (int x = 0; x < cw; x++) { const uint8_t* s = rgb8 + ((size_t)y * w + x) * 3; out[y * d.w + x] = (uint32_t)s[0] << 16 | (uint32_t)s[1] << 8 | s[2]; }
  stbi_image_free(rgb8);
}
void* worker(void* arg) {
  V4l& d = *(V4l*)arg;
  uint32_t* tmp = (uint32_t*)calloc((size_t)d.w * d.h, 4);
  while (!d.stop) {
    pollfd pf = {d.fd, POLLIN, 0};
    if (poll(&pf, 1, 100) <= 0) continue;
    v4l2_buffer b = {};
    b.type = V4L2_BUF_TYPE_VIDEO_CAPTURE; b.memory = V4L2_MEMORY_MMAP;
    if (xioctl(d.fd, VIDIOC_DQBUF, &b) < 0) { if (errno == EAGAIN) continue; usleep(10000); continue; }   // unplugged: the frames stop
    if (!(b.flags & V4L2_BUF_FLAG_ERROR) && b.index < (unsigned)d.nbuf) {
      convert(d, (const uint8_t*)d.map[b.index], b.bytesused, tmp);
      pthread_mutex_lock(&d.mu);
      memcpy(d.px, tmp, (size_t)d.w * d.h * 4);
      d.seq++;
      pthread_mutex_unlock(&d.mu);
    }
    xioctl(d.fd, VIDIOC_QBUF, &b);
  }
  free(tmp);
  return nullptr;
}
void release(V4l& d) {
  for (int i = 0; i < d.nbuf; i++) if (d.map[i] && d.map[i] != MAP_FAILED) munmap(d.map[i], d.len[i]);
  if (d.fd >= 0) close(d.fd);
  free(d.px);
  d = V4l();
}
}  // namespace

// Device access is the file mode of /dev/video* (group video): denied when there are capture nodes and this user may open none of them
// (`sudo usermod -aG video $USER`, then a new login). Nothing to ask: `ask` changes nothing.
int cam_backend_permission(bool) {
  bool seen = false;
  for (int i = 0; i < 64; i++) {
    char path[32];
    snprintf(path, sizeof path, "/dev/video%d", i);
    if (access(path, F_OK) != 0) continue;
    seen = true;
    if (access(path, R_OK | W_OK) == 0) return 1;
  }
  return seen ? 2 : 1;
}

int cam_backend_list(CamDevice* out, int max) {
  int n = 0;
  for (int i = 0; i < 64 && n < max; i++) {
    char path[32];
    snprintf(path, sizeof path, "/dev/video%d", i);
    int fd = open(path, O_RDWR | O_NONBLOCK);
    if (fd < 0) continue;
    v4l2_capability cap = {};
    if (capture_node(fd, cap)) {
      snprintf(out[n].id, sizeof out[n].id, "%s", path);
      snprintf(out[n].name, sizeof out[n].name, "%s", (const char*)cap.card);
      out[n].position = !strncmp((const char*)cap.bus_info, "usb-", 4) ? "external" : "unknown";
      n++;
    }
    close(fd);
  }
  return n;
}

int cam_backend_open(const char* id, int w, int h, int fps, int* ow, int* oh, double* ofps, char* err, int n) {
  int slot = 0;
  while (slot < MAXS && devs[slot].fd >= 0) slot++;
  if (slot == MAXS) { snprintf(err, n, "too many cameras open"); return -1; }
  V4l& d = devs[slot];
  d.fd = open(id, O_RDWR | O_NONBLOCK);
  if (d.fd < 0) { snprintf(err, n, "%s: %s%s", id, strerror(errno), errno == EACCES ? " (your user is not in the video group: sudo usermod -aG video $USER, then log out and in again)" : ""); d.fd = -1; return -1; }
  v4l2_capability cap = {};
  if (!capture_node(d.fd, cap)) { snprintf(err, n, "%s is not a video capture device", id); release(d); return -1; }
  // YUYV when the camera offers it at this size and rate (no decode), else MJPEG: USB 2 webcams send 720p YUYV at 10 fps at most, and
  // MJPEG at 30 (a stb_image decode per frame, 5 to 15 ms at 720p on a desktop, several times that on a Pi)
  v4l2_format f = {};
  const uint32_t wants[2] = {V4L2_PIX_FMT_YUYV, V4L2_PIX_FMT_MJPEG};
  for (int k = 0; k < 2; k++) {
    const uint32_t want = wants[k];
    if (!offers(d.fd, want)) continue;
    f = {};
    f.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    f.fmt.pix.width = w; f.fmt.pix.height = h; f.fmt.pix.pixelformat = want; f.fmt.pix.field = V4L2_FIELD_NONE;
    if (xioctl(d.fd, VIDIOC_S_FMT, &f) == 0 && f.fmt.pix.pixelformat == want &&
        (k == 1 || !offers(d.fd, V4L2_PIX_FMT_MJPEG) || fast_enough(d.fd, want, (int)f.fmt.pix.width, (int)f.fmt.pix.height, fps))) break;
    f.fmt.pix.pixelformat = 0;
  }
  if (f.fmt.pix.pixelformat == 0) { snprintf(err, n, "%s offers neither YUYV nor MJPEG", id); release(d); return -1; }
  d.fmt = f.fmt.pix.pixelformat; d.w = (int)f.fmt.pix.width; d.h = (int)f.fmt.pix.height;
  v4l2_streamparm sp = {};
  sp.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  sp.parm.capture.timeperframe.numerator = 1; sp.parm.capture.timeperframe.denominator = fps;
  xioctl(d.fd, VIDIOC_S_PARM, &sp);   // a hint: some drivers keep their rate
  const v4l2_fract tf = sp.parm.capture.timeperframe;
  *ofps = tf.numerator && tf.denominator ? (double)tf.denominator / tf.numerator : fps;
  v4l2_requestbuffers rb = {};
  rb.count = NBUF; rb.type = V4L2_BUF_TYPE_VIDEO_CAPTURE; rb.memory = V4L2_MEMORY_MMAP;
  if (xioctl(d.fd, VIDIOC_REQBUFS, &rb) < 0 || rb.count < 2) { snprintf(err, n, "%s: no streaming buffers (%s)", id, strerror(errno)); release(d); return -1; }
  d.nbuf = rb.count > (unsigned)NBUF ? NBUF : (int)rb.count;
  for (int i = 0; i < d.nbuf; i++) {
    v4l2_buffer b = {};
    b.type = V4L2_BUF_TYPE_VIDEO_CAPTURE; b.memory = V4L2_MEMORY_MMAP; b.index = i;
    if (xioctl(d.fd, VIDIOC_QUERYBUF, &b) < 0) { snprintf(err, n, "%s: %s", id, strerror(errno)); release(d); return -1; }
    d.len[i] = b.length;
    d.map[i] = mmap(nullptr, b.length, PROT_READ | PROT_WRITE, MAP_SHARED, d.fd, b.m.offset);
    if (d.map[i] == MAP_FAILED || xioctl(d.fd, VIDIOC_QBUF, &b) < 0) { snprintf(err, n, "%s: %s", id, strerror(errno)); release(d); return -1; }
  }
  v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  if (xioctl(d.fd, VIDIOC_STREAMON, &type) < 0) { snprintf(err, n, "%s: %s (in use by another program?)", id, strerror(errno)); release(d); return -1; }
  d.px = (uint32_t*)calloc((size_t)d.w * d.h, 4);
  d.stop = false;
  d.running = pthread_create(&d.thread, nullptr, worker, &d) == 0;
  *ow = d.w; *oh = d.h;
  return slot;
}

int cam_backend_state(int, char*, int) { return 1; }   // open() returns once the camera streams

bool cam_backend_take(int b, uint32_t* px, int w, int h, uint32_t* seq) {
  if (b < 0 || b >= MAXS || devs[b].fd < 0) return false;
  V4l& d = devs[b];
  pthread_mutex_lock(&d.mu);
  const bool fresh = d.seq != *seq && d.w == w && d.h == h;
  if (fresh) { memcpy(px, d.px, (size_t)w * h * 4); *seq = d.seq; }
  pthread_mutex_unlock(&d.mu);
  return fresh;
}

void cam_backend_close(int b) {
  if (b < 0 || b >= MAXS || devs[b].fd < 0) return;
  V4l& d = devs[b];
  d.stop = true;
  if (d.running) pthread_join(d.thread, nullptr);
  v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  xioctl(d.fd, VIDIOC_STREAMOFF, &type);
  release(d);
}

#include "camera.host.cpp"
