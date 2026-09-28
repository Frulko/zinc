// display-rmpp input: the Marker (pen) and the touchscreen through evdev. A thread reads them so no sample is lost
// while a frame renders (the kernel's evdev buffer only holds a few pen packets); poll() hands the samples to the
// runtime's pen queue. Devices are found by capability (BTN_TOOL_PEN, ABS_MT_POSITION_X), ranges come from
// EVIOCGABS; only the orientation is a setting (ZINC_RMPP_PEN_ROTATE / ZINC_RMPP_TOUCH_ROTATE: 0, 90, 180, 270).
#pragma once
#include "hal.h"
#include <dirent.h>
#include <fcntl.h>
#include <linux/input.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

#ifndef ZP_DISPLAY_RMPP_PEN_ROTATE
#define ZP_DISPLAY_RMPP_PEN_ROTATE 0
#endif
#ifndef ZP_DISPLAY_RMPP_TOUCH_ROTATE
#define ZP_DISPLAY_RMPP_TOUCH_ROTATE 0
#endif

namespace rin {

struct Axis { float min = 0, max = 1, res = 0; };
static int pen_fd = -1, touch_fd = -1, wake[2] = {-1, -1};
static Axis ax_x, ax_y, ax_p, ax_tx, ax_ty, mt_x, mt_y;
static int pen_rot = ZP_DISPLAY_RMPP_PEN_ROTATE, touch_rot = ZP_DISPLAY_RMPP_TOUCH_ROTATE;
static float W = 1, H = 1;
static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static HalPen q[2048];
static int qn = 0;
static HalPen last_pen;             // pointer emulation and palm rejection
static HalTouch touches[HAL_MAX_TOUCH];
static int ntouch = 0;
static volatile sig_atomic_t quit_flag = 0;

static bool has(int fd, int type, int code) {
  unsigned long bits[KEY_MAX / (8 * sizeof(long)) + 1] = {};
  if (ioctl(fd, EVIOCGBIT(type, sizeof bits), bits) < 0) return false;
  return (bits[code / (8 * sizeof(long))] >> (code % (8 * sizeof(long)))) & 1;
}
static Axis axis(int fd, int code) {
  input_absinfo a = {};
  ioctl(fd, EVIOCGABS(code), &a);
  return Axis{(float)a.minimum, (float)(a.maximum > a.minimum ? a.maximum : a.minimum + 1), (float)a.resolution};
}
static float norm(float v, const Axis& a) { float t = (v - a.min) / (a.max - a.min); return t < 0 ? 0 : t > 1 ? 1 : t; }
/** Device-normalized (u, v) to screen pixels for a panel rotation. */
static void place(float u, float v, int rot, float* x, float* y) {
  float a = u, b = v;
  if (rot == 90) { a = 1 - v; b = u; } else if (rot == 180) { a = 1 - u; b = 1 - v; } else if (rot == 270) { a = v; b = 1 - u; }
  *x = a * (W - 1); *y = b * (H - 1);
}
/** evdev tilt to degrees: resolution is units/radian when the driver sets it, else the range maps to +-90. */
static float degrees(float v, const Axis& a) { return a.res > 0 ? v / a.res * 57.29578f : v / (a.max > -a.min ? a.max : -a.min) * 90; }

static void push(const HalPen& s) {
  pthread_mutex_lock(&mu);
  q[qn < 2048 ? qn++ : 2047] = s;  // ponytail: a full queue keeps the newest sample (pen up survives)
  last_pen = s;
  pthread_mutex_unlock(&mu);
  char c = 1; (void)!write(wake[1], &c, 1);
}

static void* reader(void*) {
  float px = 0, py = 0, pp = 0, tx = 0, ty = 0; bool touching = false, pen = false, rubber = false;
  struct Slot { int id; float x, y; } slots[HAL_MAX_TOUCH];
  for (auto& s : slots) s.id = -1;
  int slot = 0;
  pollfd fds[2] = {{pen_fd, POLLIN, 0}, {touch_fd, POLLIN, 0}};
  input_event ev[64];
  while (!quit_flag) {
    if (poll(fds, 2, 500) <= 0) continue;
    for (int k = 0; k < 2; k++) {
      if (!(fds[k].revents & POLLIN)) continue;
      ssize_t n = read(fds[k].fd, ev, sizeof ev);
      for (ssize_t i = 0; i < n / (ssize_t)sizeof(input_event); i++) {
        const input_event& e = ev[i];
        if (k == 0) {  // Marker
          if (e.type == EV_ABS) {
            if (e.code == ABS_X) px = norm(e.value, ax_x); else if (e.code == ABS_Y) py = norm(e.value, ax_y);
            else if (e.code == ABS_PRESSURE) pp = norm(e.value, ax_p);
            else if (e.code == ABS_TILT_X) tx = degrees(e.value, ax_tx); else if (e.code == ABS_TILT_Y) ty = degrees(e.value, ax_ty);
          } else if (e.type == EV_KEY) {
            if (e.code == BTN_TOUCH) touching = e.value; else if (e.code == BTN_TOOL_PEN) pen = e.value; else if (e.code == BTN_TOOL_RUBBER) rubber = e.value;
          } else if (e.type == EV_SYN && e.code == SYN_REPORT) {
            HalPen s = {};
            place(px, py, pen_rot, &s.x, &s.y);
            s.pressure = touching ? pp : 0; s.tilt_x = tx; s.tilt_y = ty;
            s.flags = (touching ? HAL_PEN_DOWN : (pen || rubber) ? HAL_PEN_HOVER : 0) | (rubber ? HAL_PEN_ERASER : 0);
            push(s);
          }
        } else {       // touchscreen, multitouch protocol B
          if (e.type == EV_ABS) {
            if (e.code == ABS_MT_SLOT) slot = e.value < HAL_MAX_TOUCH ? e.value : HAL_MAX_TOUCH - 1;
            else if (e.code == ABS_MT_TRACKING_ID) slots[slot].id = e.value;
            else if (e.code == ABS_MT_POSITION_X) slots[slot].x = norm(e.value, mt_x);
            else if (e.code == ABS_MT_POSITION_Y) slots[slot].y = norm(e.value, mt_y);
          } else if (e.type == EV_SYN && e.code == SYN_REPORT) {
            pthread_mutex_lock(&mu);
            ntouch = 0;
            for (auto& s : slots) if (s.id >= 0) { HalTouch& t = touches[ntouch++]; t.id = s.id; place(s.x, s.y, touch_rot, &t.x, &t.y); }
            pthread_mutex_unlock(&mu);
            char c = 1; (void)!write(wake[1], &c, 1);
          }
        }
      }
    }
  }
  return nullptr;
}

static void on_signal(int) { quit_flag = 1; }

/** Opens the Marker and the touchscreen and starts the reader thread. Returns false when no pen is found. */
static bool start(int32_t w, int32_t h) {
  W = (float)w; H = (float)h;
  if (const char* r = getenv("ZINC_RMPP_PEN_ROTATE")) pen_rot = atoi(r);
  if (const char* r = getenv("ZINC_RMPP_TOUCH_ROTATE")) touch_rot = atoi(r);
  char path[32];
  for (int i = 0; i < 32; i++) {
    snprintf(path, sizeof path, "/dev/input/event%d", i);
    int fd = open(path, O_RDONLY | O_CLOEXEC);
    if (fd < 0) continue;
    if (pen_fd < 0 && has(fd, EV_KEY, BTN_TOOL_PEN)) {
      pen_fd = fd;
      ax_x = axis(fd, ABS_X); ax_y = axis(fd, ABS_Y); ax_p = axis(fd, ABS_PRESSURE); ax_tx = axis(fd, ABS_TILT_X); ax_ty = axis(fd, ABS_TILT_Y);
    } else if (touch_fd < 0 && has(fd, EV_ABS, ABS_MT_POSITION_X)) {
      touch_fd = fd; mt_x = axis(fd, ABS_MT_POSITION_X); mt_y = axis(fd, ABS_MT_POSITION_Y);
    } else close(fd);
  }
  if (pen_fd < 0 && touch_fd < 0) return false;
  if (pipe(wake) != 0) return false;
  fcntl(wake[0], F_SETFL, O_NONBLOCK); fcntl(wake[1], F_SETFL, O_NONBLOCK);
  signal(SIGTERM, on_signal); signal(SIGINT, on_signal);
  pthread_t t;
  pthread_create(&t, nullptr, reader, nullptr);
  pthread_detach(t);
  return true;
}

/** HalDisplay.poll: pen samples to the runtime queue; the pen (or else the first finger) drives the pointer. */
static void poll_input(HalInput* in) {
  pthread_mutex_lock(&mu);
  for (int i = 0; i < qn; i++) hal_pen_push(&q[i]);
  qn = 0;
  const bool pen_near = last_pen.flags != 0;
  in->ntouch = pen_near ? 0 : ntouch;  // palm rejection: fingers are ignored while the Marker is in range
  for (int i = 0; i < in->ntouch; i++) in->touch[i] = touches[i];
  if (pen_near) { in->px = last_pen.x; in->py = last_pen.y; in->pdown = (last_pen.flags & HAL_PEN_DOWN) != 0; }
  else if (ntouch > 0) { in->px = touches[0].x; in->py = touches[0].y; in->pdown = 1; }
  else in->pdown = 0;
  pthread_mutex_unlock(&mu);
  if (!getenv("ZINC_FRAMES")) in->quit = quit_flag;  // the headless base HAL would stop after 60 frames
}

/** Sleeps until input arrives or `ms` elapse (idle frames cost no CPU). */
static void wait_input(int ms) {
  pollfd p = {wake[0], POLLIN, 0};
  if (poll(&p, 1, ms) > 0) { char buf[256]; while (read(wake[0], buf, sizeof buf) > 0) {} }
}

}  // namespace rin
