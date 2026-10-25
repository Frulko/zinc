// The network of a console core (ZN-791): one bring-up per console, in targets/<console>/net_<console>.cpp, shared by everything that opens
// sockets in the core (zinc:lan, plugins/lan/native/lan.abi.cpp; the device player). Once it answers 1 the C library's BSD sockets work
// (socket, bind, sendto, recvfrom, connect, listen, accept, send, recv, close): newlib over sceNetInet on the PSP, over SceNet on the Vita,
// libctru's soc:u on the 3DS. A core without a console (the headless one of the tests) has no such file: its sockets are the host's.
#ifndef ZN_CONSOLE_NET_H
#define ZN_CONSOLE_NET_H
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif
/* Brings the network up a step per call (never blocks): 1 up (addr gets this console's IPv4 address), 0 still joining, -1 no network (why
 * says what to do). A failure that may pass (a Wi-Fi switch off) is tried again on the next call. */
int zn_console_net_up(char* addr, size_t addrSize, char* why, size_t whySize);
/* Stops what zn_console_net_up started (the HAL's hal_shutdown calls it; nothing when the network never came up). */
void zn_console_net_down(void);
#ifdef __cplusplus
}
#endif
#endif
