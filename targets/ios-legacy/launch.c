// SpringBoardServices control on the owner's jailbroken iOS 7 device.
#include <CoreFoundation/CoreFoundation.h>
#include <mach/mach.h>
#include <dlfcn.h>
#include <stdio.h>

int main(int argc, char** argv) {
  void* library = dlopen("/System/Library/PrivateFrameworks/SpringBoardServices.framework/SpringBoardServices", RTLD_NOW);
  if (!library || argc > 2) return 2;
  mach_port_t (*port)(void) = dlsym(library, "SBSSpringBoardServerPort");
  void (*getLock)(mach_port_t, Boolean*, Boolean*) = dlsym(library, "SBGetScreenLockStatus");
  CFStringRef (*front)(void) = dlsym(library, "SBSCopyFrontmostApplicationDisplayIdentifier");
  Boolean locked = 0, passcode = 0;
  if (port && getLock) getLock(port(), &locked, &passcode);
  CFStringRef app = front ? front() : NULL;
  char name[256] = {0};
  if (app) { CFStringGetCString(app, name, sizeof name, kCFStringEncodingUTF8); CFRelease(app); }
  printf("front=%s locked=%d passcode=%d\n", name, locked, passcode);
  if (argc == 1) return 0;
  int (*launch)(CFStringRef, CFDictionaryRef, Boolean) = dlsym(library, "SBSLaunchApplicationWithIdentifierAndLaunchOptions");
  if (!launch) return 3;
  CFStringRef id = CFStringCreateWithCString(NULL, argv[1], kCFStringEncodingUTF8);
  const void* keys[] = {CFSTR("unlockDevice")};
  const void* values[] = {kCFBooleanTrue};
  CFDictionaryRef options = CFDictionaryCreate(NULL, keys, values, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  int result = launch(id, options, false);
  CFRelease(options); CFRelease(id);
  printf("launch=%d\n", result);
  return result;
}
