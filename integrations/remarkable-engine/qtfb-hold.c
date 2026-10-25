// qtfb-hold: keeps an AppLoad window open while a tile hands it from one app to the next (the hub's Open, zinc-tile).
//   QTFB_KEY=<key> qtfb-hold      (AppLoad sets QTFB_KEY for the tile's launch.sh)
// AppLoad closes the window when the last client of its framebuffer leaves (asivery/rm-appload src/qtfb/fbmanagement.cpp); every
// client of one key shares one buffer. This one joins first, never draws, reads and drops what AppLoad sends, and exits with its
// launch.sh (AppLoad's close sends SIGTERM to launch.sh alone) or when AppLoad closes the socket. The format must be the driver's
// (display-rmpp/models.h qtfb_fmt): RGB888 of the model.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/prctl.h>
#include <signal.h>

struct Init { uint8_t type; union { struct { int key; uint8_t fmt; } init; struct { int type, x, y, w, h; } pad; }; };

int main(void) {
  prctl(PR_SET_PDEATHSIG, SIGTERM);
  if (getppid() == 1) return 0;                          // launch.sh already gone
  const char* k = getenv("QTFB_KEY");
  if (!k) { fprintf(stderr, "qtfb-hold: QTFB_KEY unset (run from an AppLoad tile)\n"); return 2; }
  char machine[64] = "";
  FILE* f = fopen("/sys/devices/soc0/machine", "r");
  if (f) { if (!fgets(machine, sizeof machine, f)) machine[0] = 0; fclose(f); }
  struct Init m = {0};
  m.type = 0;                                            // MESSAGE_INITIALIZE
  m.init.key = atoi(k);
  m.init.fmt = strstr(machine, "Chiappa") ? 4 : 1;       // FBFMT_RMPPM_RGB888 (Move), FBFMT_RMPP_RGB888 (Paper Pro)
  int s = socket(AF_UNIX, SOCK_SEQPACKET, 0);
  struct sockaddr_un a = {0};
  a.sun_family = AF_UNIX;
  strcpy(a.sun_path, "/tmp/qtfb.sock");
  if (s < 0 || connect(s, (struct sockaddr*)&a, sizeof a) != 0 || send(s, &m, sizeof m, 0) != (ssize_t)sizeof m) {
    fprintf(stderr, "qtfb-hold: cannot attach to qtfb (is AppLoad running?)\n");
    return 1;
  }
  char buf[256];
  while (recv(s, buf, sizeof buf, 0) > 0) {}
  return 0;
}
