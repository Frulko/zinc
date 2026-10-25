// A lane client for the fake-xochitl harness: `client stroke` (Hello, StrokeBegin, three Ink, StrokeEnd, Bye) or
// `client stall` (Hello, StrokeBegin, then silence: the lane's 500 ms deadline must close it). Exit 0 when the lane behaved.
#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cstdio>
#include <cstring>
#include "protocol.h"

static int s;
static uint32_t seq;
static bool put(uint32_t type, int x = 0, int y = 0, int w = 0, int h = 0) {
  zink::Message m; m.type = type; m.seq = ++seq; m.x = x; m.y = y; m.w = w; m.h = h; m.key = 7; m.pid = getpid();
  return send(s, &m, sizeof m, MSG_NOSIGNAL) == sizeof m;
}
int main(int argc, char** argv) {
  bool stall = argc > 1 && !strcmp(argv[1], "stall");
  s = socket(AF_UNIX, SOCK_SEQPACKET, 0);
  sockaddr_un a{}; a.sun_family = AF_UNIX; strcpy(a.sun_path, zink::socket_path);
  zink::Message w;
  if (connect(s, (sockaddr*)&a, sizeof a) || !put(zink::Hello) || recv(s, &w, sizeof w, 0) != sizeof w || w.type != zink::Welcome) {
    puts("client: no welcome"); return 1;
  }
  printf("client: welcome %.64s %dx%d\n", w.hash, w.w, w.h);
  if (!put(zink::StrokeBegin)) return 1;
  if (stall) {
    pollfd p{s, POLLIN, 0};
    bool closed = poll(&p, 1, 2000) > 0 && recv(s, &w, sizeof w, 0) == 0;
    puts(closed ? "client: closed by the deadline" : "client: still open after 2 s");
    return closed ? 0 : 1;
  }
  bool ok = put(zink::Ink, 100, 100, 20, 10) && put(zink::Ink, 118, 104, 20, 10) && put(zink::Ink, 136, 108, 20, 10) &&
            put(zink::StrokeEnd, 100, 100, 56, 18) && put(zink::Bye);
  puts(ok ? "client: stroke sent" : "client: send failed");
  return ok ? 0 : 1;
}
