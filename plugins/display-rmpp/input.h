// Marker pressure, tilt and eraser from evdev on a reader thread; touch and keys from AppLoad on the UI thread.
// Pen ranges come from EVIOCGABS. ZINC_RMPP_PEN_ROTATE overrides orientation (0/90/180/270).
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

namespace rin {

struct Axis { float min = 0, max = 1, res = 0; };
static int pen_fd = -1, wake[2] = {-1, -1};
static Axis ax_x, ax_y, ax_p, ax_tx, ax_ty;
static int pen_rot = ZP_DISPLAY_RMPP_PEN_ROTATE;
static float W = 1, H = 1;
static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static HalPen q[2048];
static int qn = 0;
static HalPen last_pen;             // pen pointer emulation
static HalTouch touches[HAL_MAX_TOUCH];
static int ntouch = 0;
static volatile sig_atomic_t quit_flag = 0;
static bool pen_down = false;       // the Marker touches the glass: a stroke for the ink lane (L1) and the engine (L2)
// Shown as a widget or hidden (AppLoad): evdev's Marker is in screen pixels and lands anywhere on xochitl, not on the app. Then the
// app takes the pen only as AppLoad forwards it inside the widget card (already in framebuffer pixels), as a pointer: no ink samples.
static bool pen_from_appload = false;
enum { PEN_TOUCH_ID = -2 };         // AppLoad's pen, kept among the touches so it presses and releases like a finger
// The power key is never opened here: under a lease (L2) the supervisor owns it for its escape, and in AppLoad xochitl does.

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
  pollfd fd = {pen_fd, POLLIN, 0};
  input_event ev[64];
  while (!quit_flag) {
    if (poll(&fd, 1, 500) <= 0) continue;
    if (!(fd.revents & POLLIN)) continue;
    ssize_t n = read(fd.fd, ev, sizeof ev);
    for (ssize_t i = 0; i < n / (ssize_t)sizeof(input_event); i++) {
      const input_event& e = ev[i];
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
    }
  }
  return nullptr;
}

static void on_signal(int) { quit_flag = 1; }

/** Opens the Marker and starts the reader thread. Touch remains available without evdev. */
static bool start(int32_t w, int32_t h) {
  W = (float)w; H = (float)h;
  if (const char* r = getenv("ZINC_RMPP_PEN_ROTATE")) pen_rot = atoi(r);
  char path[32];
  for (int i = 0; i < 32; i++) {
    snprintf(path, sizeof path, "/dev/input/event%d", i);
    int fd = open(path, O_RDONLY | O_CLOEXEC);
    if (fd < 0) continue;
    if (pen_fd < 0 && has(fd, EV_KEY, BTN_TOOL_PEN)) {
      pen_fd = fd;
      ax_x = axis(fd, ABS_X); ax_y = axis(fd, ABS_Y); ax_p = axis(fd, ABS_PRESSURE); ax_tx = axis(fd, ABS_TILT_X); ax_ty = axis(fd, ABS_TILT_Y);
    } else close(fd);
  }
  if (pipe(wake) != 0) return false;
  fcntl(wake[0], F_SETFL, O_NONBLOCK); fcntl(wake[1], F_SETFL, O_NONBLOCK);
  signal(SIGTERM, on_signal); signal(SIGINT, on_signal);
  if (pen_fd < 0) fprintf(stderr, "display-rmpp: no evdev Marker found\n");
  pthread_t t;
  pthread_create(&t, nullptr, reader, nullptr);
  pthread_detach(t);
  return true;
}

/** AppLoad forwards touch coordinates in framebuffer pixels (including its rotation/scaling); its pen (INPUT_PEN_PRESS/RELEASE/UPDATE,
 *  0x20..0x22) counts as one more finger while pen_from_appload, and is dropped otherwise (evdev has it, with pressure and tilt). */
static bool touch_event(int type, int id, int x, int y) {
  if (type >= 0x20 && type <= 0x22) { if (!pen_from_appload) return true; type -= 0x10; id = PEN_TOUCH_ID; }
  if (type < 0x10 || type > 0x12) return false;
  int i = 0;
  while (i < ntouch && touches[i].id != id) i++;
  if (type == 0x11) {
    if (i < ntouch) { for (int j = i + 1; j < ntouch; j++) touches[j - 1] = touches[j]; ntouch--; }
  } else if (x >= 0 && y >= 0 && x < W && y < H) {
    if (i == ntouch) { if (ntouch == HAL_MAX_TOUCH) return true; ntouch++; }
    touches[i] = {id, (float)x, (float)y};
  }
  return true;
}

// Keys from AppLoad (UI thread): a hardware keyboard (the Type Folio, INPUT_BTN_*) or AppLoad's own on-screen keyboard (INPUT_VKB_*) send
// QKeyEvent::key(), a Qt::Key code, with no text and no modifiers: the modifiers are tracked here, the text derived from the code.
static HalKey kq[64];
static int kqn = 0;
static char kt[HAL_TEXT_BYTES];
static int ktn = 0;
static uint32_t mods = 0;
static void key_push(int32_t key, int32_t kind, const char* text = nullptr, int n = 0) {
  if (kqn == 64 || ktn + n > HAL_TEXT_BYTES) return;   // ponytail: a full queue drops keys (64 per frame is far above typing speed)
  kq[kqn++] = HalKey{key, mods, kind, (uint16_t)ktn, (uint16_t)n};
  if (n) { memcpy(kt + ktn, text, n); ktn += n; }
}
/** INPUT_BTN_PRESS/RELEASE (0x30/0x31) and INPUT_VKB_PRESS/RELEASE (0x40/0x41) with the Qt key code; false for other messages. */
static bool key_event(int type, int qt) {
  if (type != 0x30 && type != 0x31 && type != 0x40 && type != 0x41) return false;
  const bool down = type == 0x30 || type == 0x40;
  static const uint32_t modbits[] = {HAL_MOD_SHIFT, HAL_MOD_CTRL, HAL_MOD_META, HAL_MOD_ALT};   // Qt::Key_Shift, Control, Meta, Alt
  if (qt >= 0x01000020 && qt <= 0x01000023) { mods = down ? mods | modbits[qt - 0x01000020] : mods & ~modbits[qt - 0x01000020]; return true; }
  int32_t key = 0;
  uint32_t ch = 0;   // the typed character (Latin-1), 0: none
  static const int32_t named[] = {HAL_KEY_ESCAPE, HAL_KEY_TAB, 0, HAL_KEY_BACKSPACE, HAL_KEY_ENTER, HAL_KEY_ENTER, 0, HAL_KEY_DELETE};   // Qt 0x01000000..07
  static const int32_t moves[] = {HAL_KEY_HOME, HAL_KEY_END, HAL_KEY_ARROW_LEFT, HAL_KEY_ARROW_UP, HAL_KEY_ARROW_RIGHT, HAL_KEY_ARROW_DOWN,
                                  HAL_KEY_PAGEUP, HAL_KEY_PAGEDOWN};   // Qt 0x01000010..17
  const bool shift = mods & HAL_MOD_SHIFT;
  if (qt >= 0x01000000 && qt <= 0x01000007) key = named[qt - 0x01000000];
  else if (qt >= 0x01000010 && qt <= 0x01000017) key = moves[qt - 0x01000010];
  else if (qt >= 0x01000030 && qt <= 0x0100003b) key = HAL_KEY_F1 + (qt - 0x01000030);   // F1..F12
  else if (qt >= 'A' && qt <= 'Z') { key = qt + 32; ch = shift ? qt : qt + 32; }        // Qt letters are the upper-case code
  else if (qt >= 32 && qt <= 126) key = ch = qt;
  else if (qt >= 0xC0 && qt <= 0xDE && qt != 0xD7) { key = qt + 32; ch = shift ? qt : qt + 32; }   // Latin-1 letters (Key_Eacute 0xC9)
  else if (qt >= 0xA0 && qt <= 0xFF) key = ch = qt;
  if (!key) return true;
  key_push(key, down ? HAL_KEY_DOWN : HAL_KEY_UP);
  if (down && ch && !(mods & (HAL_MOD_CTRL | HAL_MOD_META))) {
    char u[2]; int n = 1;
    if (ch < 0x80) u[0] = (char)ch; else { u[0] = (char)(0xC0 | ch >> 6); u[1] = (char)(0x80 | (ch & 0x3F)); n = 2; }
    key_push(0, HAL_KEY_TEXT, u, n);
  }
  return true;
}

/** HalDisplay.poll: pen samples to the runtime queue; the first finger (or else the pen) drives the UI pointer. */
static void poll_input(HalInput* in) {
  pthread_mutex_lock(&mu);
  if (!pen_from_appload) for (int i = 0; i < qn; i++) hal_pen_push(&q[i]);   // else the strokes are xochitl's
  qn = 0;
  const bool pen_near = !pen_from_appload && last_pen.flags != 0;
  pen_down = pen_near && (last_pen.flags & HAL_PEN_DOWN) != 0;
  in->ntouch = ntouch;
  for (int i = 0; i < in->ntouch; i++) in->touch[i] = touches[i];
  // The pointer stays where the finger or the Marker last was: the base HAL polled before this one writes its own (0, 0), and a
  // release reported there would land outside the button that was pressed (no click, ZN-834).
  static float px = 0, py = 0;
  if (ntouch > 0) { px = touches[0].x; py = touches[0].y; in->pdown = 1; }
  else if (pen_near) { px = last_pen.x; py = last_pen.y; in->pdown = (last_pen.flags & HAL_PEN_DOWN) != 0; }
  else in->pdown = 0;
  in->px = px; in->py = py;
  pthread_mutex_unlock(&mu);
  // keys after the base HAL's own (its queue was reset by its poll); what does not fit waits for the next frame
  int k = 0;
  for (; k < kqn && in->nkeys < HAL_MAX_KEYS && in->ntext + kq[k].len <= HAL_TEXT_BYTES; k++) {
    HalKey e = kq[k];
    if (e.len) { memcpy(in->text + in->ntext, kt + e.off, e.len); e.off = (uint16_t)in->ntext; in->ntext += e.len; }
    in->keys[in->nkeys++] = e;
  }
  if (k) {
    const int skip = k < kqn ? kq[k].off : ktn;
    memmove(kq, kq + k, (kqn - k) * sizeof(HalKey)); kqn -= k;
    memmove(kt, kt + skip, ktn - skip); ktn -= skip;
    for (int i = 0; i < kqn; i++) kq[i].off = (uint16_t)(kq[i].off - skip);
  }
  static uint32_t ours = 0;
  in->mods = (in->mods & ~ours) | mods; ours = mods;
  if (!getenv("ZINC_FRAMES")) in->quit = quit_flag;
  else in->quit |= quit_flag;  // the headless base HAL would stop after 60 frames
}

// Touch from evdev, for L2 where xochitl is stopped and no qtfb forwards it (MT type B, one report per UI frame so a quick
// press and release cannot collapse into nothing).
static int touch_fd = -1, slot = 0;
static struct Contact { int id = -1, x = 0, y = 0; } contacts[16];
static Axis tx, ty;
static bool open_touch() {
  for (int i = 0; i < 32 && touch_fd < 0; ++i) {
    char p[32]; snprintf(p, sizeof p, "/dev/input/event%d", i);
    int fd = open(p, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (fd < 0) continue;
    if (has(fd, EV_ABS, ABS_MT_POSITION_X) && !has(fd, EV_KEY, BTN_TOOL_PEN)) {
      touch_fd = fd; tx = axis(fd, ABS_MT_POSITION_X); ty = axis(fd, ABS_MT_POSITION_Y);
    } else close(fd);
  }
  return touch_fd >= 0;
}
static void poll_touch() {
  input_event e{};
  while (touch_fd >= 0 && read(touch_fd, &e, sizeof e) == sizeof e) {
    if (e.type == EV_ABS) {
      if (e.code == ABS_MT_SLOT) slot = e.value >= 0 && e.value < 16 ? e.value : -1;
      else if (slot >= 0) {
        if (e.code == ABS_MT_TRACKING_ID) contacts[slot].id = e.value;
        else if (e.code == ABS_MT_POSITION_X) contacts[slot].x = e.value;
        else if (e.code == ABS_MT_POSITION_Y) contacts[slot].y = e.value;
      }
    } else if (e.type == EV_SYN && e.code == SYN_REPORT) {
      ntouch = 0;
      for (const auto& c : contacts) if (c.id >= 0 && ntouch < HAL_MAX_TOUCH) {
        float x, y; place(norm(c.x, tx), norm(c.y, ty), pen_rot, &x, &y);
        touches[ntouch++] = {c.id, x, y};
      }
      break;
    }
  }
}

/** Sleeps until input arrives or `ms` elapse (idle frames cost no CPU). */
static void wait_input(int ms, int sock) {
  pollfd p[2] = {{wake[0], POLLIN, 0}, {sock, POLLIN, 0}};
  if (poll(p, 2, ms) > 0 && (p[0].revents & POLLIN)) { char buf[256]; while (read(wake[0], buf, sizeof buf) > 0) {} }
}

}  // namespace rin
