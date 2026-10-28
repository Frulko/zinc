// An H.264 hardware decoder through V4L2's stateful memory-to-memory interface (Linux; a Raspberry Pi's bcm2835-codec at /dev/video10):
// access units in, pictures out as dmabufs that a display plane shows without a copy (fbdev.cpp fb_layers). Built for the lowest delay,
// after Vanilla's Wii U GamePad work on the same decoder (docs/reports/sidecar-pi-display-latency.md): every unit goes in as it comes,
// and the pictures are taken out as soon as they are there, by a thread of their own, never in step with what goes in.
#pragma once
#include <linux/videodev2.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <vector>

struct V4l2Dec {
  struct Picture { int index; int fd; uint32_t w, h, pitch, uv; uint64_t tag; };   // NV12 in one buffer: Y at 0, CbCr at `uv`
  int fd = -1;
  uint32_t w = 0, h = 0, pitch = 0, uv = 0;   // the pictures' visible size and layout, known once the first key picture is in
  std::vector<int> dmabuf;                    // the capture buffers, by index
  bool capturing = false;

  bool open(const char* dev = "/dev/video10") {
    fd = ::open(dev, O_RDWR | O_NONBLOCK | O_CLOEXEC);
    if (fd < 0) return false;
    v4l2_format f = {};
    f.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
    f.fmt.pix_mp.pixelformat = V4L2_PIX_FMT_H264;
    f.fmt.pix_mp.width = 1920; f.fmt.pix_mp.height = 1080;   // a hint; the stream's SPS decides
    f.fmt.pix_mp.num_planes = 1;
    f.fmt.pix_mp.plane_fmt[0].sizeimage = 2 << 20;
    if (io(VIDIOC_S_FMT, &f)) return fail();
    v4l2_requestbuffers r = {};
    r.count = 4; r.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE; r.memory = V4L2_MEMORY_MMAP;
    if (io(VIDIOC_REQBUFS, &r) || !r.count) return fail();
    for (uint32_t i = 0; i < r.count; i++) {
      v4l2_plane pl = {}; v4l2_buffer b = {};
      b.type = r.type; b.memory = r.memory; b.index = i; b.m.planes = &pl; b.length = 1;
      if (io(VIDIOC_QUERYBUF, &b)) return fail();
      void* m = mmap(nullptr, pl.length, PROT_READ | PROT_WRITE, MAP_SHARED, fd, pl.m.mem_offset);
      if (m == MAP_FAILED) return fail();
      in.push_back({m, pl.length}); idle.push_back((int)i);
    }
    v4l2_event_subscription sub = {};
    sub.type = V4L2_EVENT_SOURCE_CHANGE;
    io(VIDIOC_SUBSCRIBE_EVENT, &sub);
    int t = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
    if (io(VIDIOC_STREAMON, &t)) return fail();
    // bcm2835-codec wants its capture side going from the start (at the hinted size, as FFmpeg does) and says SOURCE_CHANGE only when
    // the stream's size differs
    return capture() || fail();
  }
  void close() {
    for (int d : dmabuf) ::close(d);
    dmabuf.clear();
    for (auto& b : in) munmap(b.map, b.len);
    in.clear(); idle.clear();
    if (fd >= 0) ::close(fd);
    fd = -1; capturing = false;
  }
  ~V4l2Dec() { close(); }

  /** One access unit (Annex B) in; `tag` comes back with its picture. Waits at most 100 ms for a free input buffer. */
  bool feed(const uint8_t* au, size_t n, uint64_t tag) {
    reclaim();
    for (int k = 0; idle.empty() && k < 100; k++) { pollfd p = {fd, POLLOUT, 0}; poll(&p, 1, 1); reclaim(); }
    if (idle.empty() || n > in[idle.back()].len) return false;
    const int i = idle.back(); idle.pop_back();
    memcpy(in[i].map, au, n);
    v4l2_plane pl = {}; v4l2_buffer b = {};
    b.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE; b.memory = V4L2_MEMORY_MMAP; b.index = i; b.m.planes = &pl; b.length = 1;
    pl.bytesused = (uint32_t)n;
    b.timestamp.tv_sec = (time_t)(tag / 1000000); b.timestamp.tv_usec = (suseconds_t)(tag % 1000000);
    return io(VIDIOC_QBUF, &b) == 0;
  }

  /** The next decoded picture, waiting at most `ms`: 1 one (give it back with requeue once it is off the screen), 0 none yet, -1 the
   *  decoder failed. Sets up the capture side when the stream's size is first known or changes. */
  int next(Picture& out, int ms) {
    pollfd p = {fd, POLLIN | POLLPRI, 0};
    if (poll(&p, 1, ms) <= 0) return 0;
    if (p.revents & POLLPRI) {
      v4l2_event e = {};
      while (io(VIDIOC_DQEVENT, &e) == 0) if (e.type == V4L2_EVENT_SOURCE_CHANGE && !capture()) return -1;
    }
    if (!capturing || !(p.revents & POLLIN)) return 0;
    v4l2_plane pl[2] = {}; v4l2_buffer b = {};
    b.type = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE; b.memory = V4L2_MEMORY_MMAP; b.m.planes = pl; b.length = 2;
    if (io(VIDIOC_DQBUF, &b)) return errno == EAGAIN ? 0 : -1;
    if (b.flags & V4L2_BUF_FLAG_LAST || !pl[0].bytesused) { requeue((int)b.index); return 0; }
    out = {(int)b.index, dmabuf[b.index], w, h, pitch, uv, (uint64_t)b.timestamp.tv_sec * 1000000 + (uint64_t)b.timestamp.tv_usec};
    return 1;
  }
  void requeue(int index) {
    v4l2_plane pl[2] = {}; v4l2_buffer b = {};
    b.type = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE; b.memory = V4L2_MEMORY_MMAP; b.index = (uint32_t)index; b.m.planes = pl; b.length = 2;
    io(VIDIOC_QBUF, &b);
  }

 private:
  struct In { void* map; size_t len; };
  std::vector<In> in;
  std::vector<int> idle;   // input buffers the decoder gave back
  int io(unsigned long req, void* arg) { int r; do r = ioctl(fd, req, arg); while (r < 0 && errno == EINTR); return r; }
  bool fail() { close(); return false; }
  void reclaim() {
    for (;;) {
      v4l2_plane pl = {}; v4l2_buffer b = {};
      b.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE; b.memory = V4L2_MEMORY_MMAP; b.m.planes = &pl; b.length = 1;
      if (io(VIDIOC_DQBUF, &b)) return;
      idle.push_back((int)b.index);
    }
  }
  /** The capture side for the stream's size: NV12 buffers (the decoder's least plus four for the screen), each exported as a dmabuf. */
  bool capture() {
    int t = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE;
    if (capturing) {
      io(VIDIOC_STREAMOFF, &t);
      for (int d : dmabuf) ::close(d);
      dmabuf.clear();
      v4l2_requestbuffers z = {}; z.type = t; z.memory = V4L2_MEMORY_MMAP; io(VIDIOC_REQBUFS, &z);
      capturing = false;
    }
    v4l2_format f = {};
    f.type = t;
    if (io(VIDIOC_G_FMT, &f)) return false;
    f.fmt.pix_mp.pixelformat = V4L2_PIX_FMT_NV12;
    f.fmt.pix_mp.num_planes = 1;
    if (io(VIDIOC_S_FMT, &f) || f.fmt.pix_mp.pixelformat != V4L2_PIX_FMT_NV12) return false;
    pitch = f.fmt.pix_mp.plane_fmt[0].bytesperline;
    uv = pitch * f.fmt.pix_mp.height;
    w = f.fmt.pix_mp.width; h = f.fmt.pix_mp.height;
    v4l2_selection s = {};
    s.type = V4L2_BUF_TYPE_VIDEO_CAPTURE; s.target = V4L2_SEL_TGT_COMPOSE;
    if (io(VIDIOC_G_SELECTION, &s) == 0 && s.r.width && s.r.height) { w = s.r.width; h = s.r.height; }   // 1080 visible of 1088 decoded
    v4l2_control c = {V4L2_CID_MIN_BUFFERS_FOR_CAPTURE, 0};
    io(VIDIOC_G_CTRL, &c);
    v4l2_requestbuffers r = {};
    r.count = (uint32_t)(c.value > 0 ? c.value : 1) + 4; r.type = t; r.memory = V4L2_MEMORY_MMAP;
    if (io(VIDIOC_REQBUFS, &r) || !r.count) return false;
    for (uint32_t i = 0; i < r.count; i++) {
      v4l2_exportbuffer x = {};
      x.type = t; x.index = i; x.plane = 0; x.flags = O_RDONLY | O_CLOEXEC;
      if (io(VIDIOC_EXPBUF, &x)) return false;
      dmabuf.push_back(x.fd);
      requeue((int)i);
    }
    capturing = io(VIDIOC_STREAMON, &t) == 0;
    return capturing;
  }
};
