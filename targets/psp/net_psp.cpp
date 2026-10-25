// The PSP's network (targets/console/console_net.h, ZN-791): the net modules, then the access point of the first network setting (Settings >
// Network Settings), joined in the background: 0 while it joins, 1 with the address once it has one, -1 when it cannot (switch off, no setting,
// no address in 20 s). newlib's BSD sockets (libcglue over sceNetInet) work from then on.
#include "console_net.h"
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <pspkernel.h>
#include <pspnet.h>
#include <pspnet_apctl.h>
#include <pspnet_inet.h>
#include <psputility.h>
#include <pspwlan.h>

static int state = 0;   // 0 not started, 1 joining, 2 up, -1 failed
static uint64_t since = 0;

extern "C" int zn_console_net_up(char* addr, size_t addrSize, char* why, size_t whySize) {
  if (state == 2) return 1;
  if (state < 0) return -1;
  if (state == 0) {
    if (!sceWlanGetSwitchState()) { snprintf(why, whySize, "the Wi-Fi switch of the PSP is off"); return -1; }   // not kept: it may come on
    sceUtilityLoadNetModule(PSP_NET_MODULE_COMMON);
    sceUtilityLoadNetModule(PSP_NET_MODULE_INET);
    if (sceNetInit(128 * 1024, 42, 4 * 1024, 42, 4 * 1024) < 0 || sceNetInetInit() < 0 || sceNetApctlInit(0x8000, 48) < 0) {
      snprintf(why, whySize, "the PSP's network modules did not start");
      state = -1;
      return -1;
    }
    if (sceNetApctlConnect(1) < 0) { snprintf(why, whySize, "no network setting 1 on this PSP (Settings > Network Settings)"); state = -1; return -1; }
    since = sceKernelGetSystemTimeWide();
    state = 1;
    return 0;
  }
  int st = 0;
  if (sceNetApctlGetState(&st) == 0 && st == PSP_NET_APCTL_STATE_GOT_IP) {
    SceNetApctlInfo info;
    memset(&info, 0, sizeof info);
    if (sceNetApctlGetInfo(PSP_NET_APCTL_INFO_IP, &info) == 0) snprintf(addr, addrSize, "%s", info.ip);
    state = 2;
    return 1;
  }
  if (sceKernelGetSystemTimeWide() - since > 20000000ull) {
    snprintf(why, whySize, "the PSP did not join the access point of network setting 1");
    state = -1;
    return -1;
  }
  return 0;
}
extern "C" void zn_console_net_down(void) {
  if (state == 0) return;
  sceNetApctlDisconnect();
  sceNetApctlTerm();
  sceNetInetTerm();
  sceNetTerm();
  state = 0;
}
