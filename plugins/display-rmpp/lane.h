// L1: the client of the ink lane inside xochitl (integrations/remarkable-ink, protocol 2). The app keeps its qtfb connection in
// UI mode; while the Marker is down it names each new rectangle (already written into the qtfb shared memory) to the lane,
// which swaps it with the vendor engine's Pen/Mono mode. Pen-up hands the stroke's box back to qtfb's own repaint: the colour
// settle. Any error closes the lane for the rest of the session (one way: L1 -> L0).
#pragma once
#include "eink.h"
#include "models.h"
#include "../../integrations/remarkable-ink/protocol.h"
#include <errno.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

namespace lane {
int sock = -1;
uint32_t sequence = 0;
bool stroke = false;
eink::Rect box = {};  // the current stroke's damage

bool put(uint32_t type, eink::Rect r = {}) {
  zink::Message m; m.type = type; m.seq = ++sequence;
  m.x = r.x0; m.y = r.y0; m.w = r.x1 - r.x0; m.h = r.y1 - r.y0;
  return send(sock, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) == (ssize_t)sizeof m;
}
void close_lane() { if (sock >= 0) close(sock); sock = -1; stroke = false; box = {}; }

/** Hello, then a Welcome whose vendor hash is a verified row for this model. One line on stderr when the lane is not used. */
bool open(const rmm::Model& row, int key) {
  sock = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
  sockaddr_un a = {};
  a.sun_family = AF_UNIX;
  strcpy(a.sun_path, zink::socket_path);
  if (sock < 0 || connect(sock, (sockaddr*)&a, sizeof a) != 0) {
    fprintf(stderr, "display-rmpp: no ink lane at %s (zinc-ink not loaded in xochitl); fast ink off, qtfb\n", zink::socket_path);
    close_lane(); return false;
  }
  timeval limit = {1, 0};
  setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &limit, sizeof limit);
  zink::Message hello; hello.type = zink::Hello; hello.seq = ++sequence; hello.key = key; hello.pid = (int32_t)getpid();
  zink::Message w;
  if (send(sock, &hello, sizeof hello, MSG_NOSIGNAL) != (ssize_t)sizeof hello || recv(sock, &w, sizeof w, 0) != (ssize_t)sizeof w ||
      w.magic != zink::magic || w.version != zink::version || w.type != zink::Welcome) {
    fprintf(stderr, "display-rmpp: the ink lane refused this app (protocol %u, window not fullscreen 1:1, or lane off for this boot); fast ink off, qtfb\n", zink::version);
    close_lane(); return false;
  }
  if (!rmm::vendor(w.hash, row.codename) || w.w != row.w || w.h != row.h) {
    fprintf(stderr, "display-rmpp: vendor library %.64s is not verified for the %s; fast ink off, qtfb\n", w.hash, row.name);
    close_lane(); return false;
  }
  fprintf(stderr, "display-rmpp: ink lane on (%s, vendor %.12s)\n", row.name, w.hash);
  return true;
}

/** False once the lane has closed its end (EOF or anything unexpected). */
bool alive() {
  if (sock < 0) return false;
  pollfd p = {sock, POLLIN, 0};
  if (poll(&p, 1, 0) == 0) return true;
  char b[sizeof(zink::Message)];
  ssize_t n = recv(sock, b, sizeof b, MSG_DONTWAIT);
  return n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR);  // the lane never speaks after Welcome
}

/** One frame's damage while the Marker is down (or just lifted). False: the lane is gone, fall back to qtfb. */
bool frame(eink::Rect r, bool pen_down) {
  if (!alive()) return false;
  if (pen_down && !stroke) { if (!put(zink::StrokeBegin)) return false; stroke = true; box = {}; }
  if (!stroke) return true;
  if (!eink::empty(r)) { if (!put(zink::Ink, r)) return false; eink::unite(box, r); }
  if (!pen_down) {
    stroke = false;
    if (!put(zink::StrokeEnd, eink::empty(box) ? eink::Rect{0, 0, 1, 1} : box)) return false;
    box = {};
  }
  return true;
}
void bye() { if (sock >= 0) put(zink::Bye); close_lane(); }
}  // namespace lane
