// zig's mingw-w64 declares WaitOnAddress/WakeByAddressAll/WakeByAddressSingle (synchapi.h) but its import library
// set has no libsynchronization.a (the entries of kernel32.def.in are commented out); libuv's win back end calls the
// three. Definitions here through GetProcAddress, so no import library is needed (docs/targets/windows.md).
#include <windows.h>

WINBOOL WINAPI WaitOnAddress(volatile VOID* Address, PVOID CompareAddress, SIZE_T AddressSize, DWORD dwMilliseconds) {
  typedef WINBOOL (WINAPI* WaitOnAddressFn)(volatile VOID*, PVOID, SIZE_T, DWORD);
  WaitOnAddressFn f = (WaitOnAddressFn)GetProcAddress(GetModuleHandleA("kernel32.dll"), "WaitOnAddress");
  if (f) return f(Address, CompareAddress, AddressSize, dwMilliseconds);
  Sleep(1);   // Windows 7: no wait-on-address; a plain sleep is the same tick the wakes would take
  return 0;
}
VOID WINAPI WakeByAddressAll(PVOID Address) {
  typedef VOID (WINAPI* WakeByAddressFn)(volatile VOID*);
  WakeByAddressFn f = (WakeByAddressFn)GetProcAddress(GetModuleHandleA("kernel32.dll"), "WakeByAddressAll");
  if (f) f(Address);
}
VOID WINAPI WakeByAddressSingle(PVOID Address) {
  typedef VOID (WINAPI* WakeByAddressFn)(volatile VOID*);
  WakeByAddressFn f = (WakeByAddressFn)GetProcAddress(GetModuleHandleA("kernel32.dll"), "WakeByAddressSingle");
  if (f) f(Address);
}
