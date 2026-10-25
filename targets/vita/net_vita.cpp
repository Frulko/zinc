// The PS Vita's network (targets/console/console_net.h, ZN-791): the net module, sceNet and SceNetCtl, then the Wi-Fi the system joins by
// itself (Settings > Network): 0 while it is not connected, 1 with the address, -1 when the modules do not start or after 15 s without a
// connection (tried again on the next call: the player may turn the Wi-Fi on). newlib's BSD sockets (over sceNet) work from then on.
// hal_vita.cpp's device("network") starts the same modules; whichever comes first does it, the other sees them started.
#include "console_net.h"
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <psp2/kernel/processmgr.h>
#include <psp2/net/net.h>
#include <psp2/net/netctl.h>
#include <psp2/sysmodule.h>

static int state = 0;   // 0 not started, 1 waiting for the Wi-Fi, 2 up, -1 the modules failed
static uint64_t since = 0;

extern "C" int zn_console_net_up(char* addr, size_t addrSize, char* why, size_t whySize) {
  if (state == 2) return 1;
  if (state < 0) return -1;
  if (state == 0) {
    static char mem[256 * 1024];
    SceNetInitParam param = {mem, (int)sizeof mem, 0};
    const int r = sceSysmoduleLoadModule(SCE_SYSMODULE_NET) < 0 ? -1 : sceNetInit(&param);
    if (r < 0 && r != (int)0x80410110) { snprintf(why, whySize, "the Vita's network module did not start"); state = -1; return -1; }   // 0x80410110: EBUSY, started
    sceNetCtlInit();   // an error here is the HAL's earlier start
    since = sceKernelGetProcessTimeWide();
    state = 1;
  }
  int st = 0;
  if (sceNetCtlInetGetState(&st) == 0 && st == SCE_NETCTL_STATE_CONNECTED) {
    SceNetCtlInfo info;
    memset(&info, 0, sizeof info);
    if (sceNetCtlInetGetInfo(SCE_NETCTL_INFO_GET_IP_ADDRESS, &info) == 0) snprintf(addr, addrSize, "%s", info.ip_address);
    state = 2;
    return 1;
  }
  if (sceKernelGetProcessTimeWide() - since > 15000000ull) {
    snprintf(why, whySize, "the Vita is not on a Wi-Fi network (Settings > Network > Wi-Fi Settings)");
    since = sceKernelGetProcessTimeWide();   // asked again later: the Wi-Fi may come on
    return -1;
  }
  return 0;
}
extern "C" void zn_console_net_down(void) {}   // the system keeps the Wi-Fi; the modules end with the app
