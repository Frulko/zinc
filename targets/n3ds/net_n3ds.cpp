// The 3DS's network (targets/console/console_net.h, ZN-791): libctru's soc:u started once with its 1 MiB page-aligned buffer, and the Wi-Fi
// the system joins (ac:u): 0 while it is not connected, 1 with the address, -1 when soc:u does not start or there is no Wi-Fi after 15 s (asked
// again later). libctru's BSD sockets work from then on; socExit at the end (hal_shutdown), or the next app finds soc:u taken.
#include "console_net.h"
#include <malloc.h>
#include <stdio.h>
#include <string.h>
#include <3ds.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>

static int state = 0;   // 0 not started, 1 waiting for the Wi-Fi, 2 up, -1 failed
static u32* buffer = nullptr;
static u64 since = 0;
static const u32 kSocSize = 0x100000;

extern "C" int zn_console_net_up(char* addr, size_t addrSize, char* why, size_t whySize) {
  if (state == 2) return 1;
  if (state < 0) return -1;
  if (state == 0) {
    buffer = (u32*)memalign(0x1000, kSocSize);
    if (!buffer || R_FAILED(socInit(buffer, kSocSize))) { snprintf(why, whySize, "the 3DS's socket service (soc:u) did not start"); state = -1; return -1; }
    acInit();
    since = osGetTime();
    state = 1;
  }
  u32 wifi = 0;
  if (R_SUCCEEDED(ACU_GetWifiStatus(&wifi)) && wifi) {
    const long id = gethostid();   // the console's address, in network order
    if (id != 0) {
      in_addr a;
      a.s_addr = (in_addr_t)id;
      snprintf(addr, addrSize, "%s", inet_ntoa(a));
      state = 2;
      return 1;
    }
  }
  if (osGetTime() - since > 15000) {
    snprintf(why, whySize, "the 3DS is not on a Wi-Fi network (System Settings > Internet Settings)");
    since = osGetTime();
    return -1;
  }
  return 0;
}
extern "C" void zn_console_net_down(void) {
  if (state == 0 || !buffer) return;
  socExit();
  acExit();
  state = 0;
}
