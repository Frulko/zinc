// Statically linked on the host; no Python or vendor-engine initialization on the tablet.
#include "protocol.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <assert.h>
int main(int argc, char** argv) {
  bool draw = argc == 2 && !strcmp(argv[1], "--draw");
  int s = socket(AF_UNIX, SOCK_SEQPACKET, 0); assert(s >= 0);
  timeval timeout{4, 0}; setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof timeout);
  sockaddr_un a{}; a.sun_family = AF_UNIX; strcpy(a.sun_path, zink::socket_path);
  if (connect(s, (sockaddr*)&a, sizeof a)) { perror("bridge connect"); return 1; }
  zink::Message m; m.type = draw ? zink::Hello : zink::Probe; m.seq = 1;
  auto send = [&] { assert(::send(s, &m, sizeof m, MSG_NOSIGNAL) == sizeof m); };
  auto ack = [&] { zink::Message r; assert(recv(s, &r, sizeof r, 0) == sizeof r && r.magic == zink::magic && r.type == zink::Ack && r.seq == m.seq); };
  send(); ack();
  if (draw) {
    struct { zink::Message m; uint32_t p[16 * 16]; } upload;
    upload.m.type = zink::Pixels; upload.m.seq = 2; upload.m.x = upload.m.y = 20; upload.m.w = upload.m.h = 16;
    for (auto& p : upload.p) p = 0xff000000;
    assert(::send(s, &upload, sizeof upload, MSG_NOSIGNAL) == sizeof upload);
    m = upload.m; m.seq = 3; m.type = zink::Present; send(); ack();
    usleep(250000);
    m.seq = 4; m.type = zink::Bye; send();
  }
  zink::Message end;
  assert(recv(s, &end, sizeof end, 0) == 0);
  close(s);
  puts(draw ? "Small rectangle submitted; bridge closed and restores snapshot." : "No-write lease expired and disconnected normally.");
}
