// zinc:desktop-windows on macOS. Three threads, so nothing a slow app does can reach the keyboard or the UI:
// - the tap thread decides at once whether a key belongs to the picker (a tap that answers late is disabled by the system and lags every key of the machine);
// - the focus thread holds the AX observers and every AX read about focus (an app that is starting answers after a second or more);
// - a serial worker sweeps the windows, and a queue of its own raises them: a raise never waits behind a sweep, which can last a second.
// They hand events to the program's thread through a locked queue that poll() drains.
// Manual retain/release: plugins are not built with ARC.
#define ZRT_HOSTED_CPP
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <QuartzCore/QuartzCore.h>
#include <dlfcn.h>
#include <cstdio>
#include <atomic>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <unistd.h>
#include <vector>
#include "zinc_native_desktopwindows.h"

extern "C" AXError _AXUIElementGetWindow(AXUIElementRef element, CGWindowID* id);
typedef int CGSConnectionID;
extern "C" CGSConnectionID CGSMainConnectionID(void);
extern "C" CFArrayRef CGSCopySpacesForWindows(CGSConnectionID cid, int mask, CFArrayRef windows);
extern "C" CFArrayRef CGSCopyManagedDisplaySpaces(CGSConnectionID cid);

namespace {
enum { EVENT_ARM = 1, EVENT_NEXT = 2, EVENT_PREVIOUS = 3, EVENT_COMMIT = 4, EVENT_CANCEL = 5, EVENT_FOCUS = 6, EVENT_WINDOWS = 7, EVENT_RECORDED = 8, EVENT_RAISE_FAILED = 9 };
enum { MOD_COMMAND = 1, MOD_OPTION = 2, MOD_CONTROL = 4 };
const int KEY_RETURN = 36, KEY_ESCAPE = 53, KEY_LEFT = 123, KEY_RIGHT = 124, KEY_DOWN = 125, KEY_UP = 126, KEY_KEYPAD_ENTER = 76;
const int RECORDED_MODIFIER_UNIT = 256;
const float AX_TIMEOUT_SECONDS = 0.25f;
/** A new app answers AX only after its launch finished, a second or more after macOS says it is active. */
const double FOCUS_RETRY_SECONDS = 0.15;
const int FOCUS_RETRIES = 40;
const CGFloat MIN_WINDOW_WIDTH = 100, MIN_WINDOW_HEIGHT = 80;
/** With no Screen Recording permission every CG title is empty, so size is all that tells an off-Space window from a helper's shell. */
const CGFloat MIN_UNTITLED_WIDTH = 400, MIN_UNTITLED_HEIGHT = 300;
const int ALL_SPACES_MASK = 7;
const double RAISE_CHECK_SECONDS = 0.4;

struct Event { int kind; double value; };
// Never destroyed: a worker may still be running when the program exits.
std::mutex& eventsLock = *new std::mutex;
std::vector<Event>& events = *new std::vector<Event>;
void post(int kind, double value) {
  std::lock_guard<std::mutex> hold(eventsLock);
  events.push_back({kind, value});
}
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
std::string json(id object) {
  NSData* data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
  return data ? std::string((const char*)data.bytes, data.length) : "[]";
}
std::string cstr(NSString* s) { return s.UTF8String ? s.UTF8String : ""; }

// ---------------------------------------------------------------- the hotkey: an event tap on its own thread
std::atomic<int> hotkeyCode{48};
std::atomic<int> hotkeyModifiers{MOD_COMMAND};
std::atomic<bool> armed{false};
std::atomic<bool> recording{false};
CFMachPortRef tapPort = nullptr;

std::atomic<int64_t> targetId{-1};
std::atomic<int64_t> targetPid{0};
void raiseSoon(CGWindowID id, pid_t pid);
/** The release: the person is going to the window now, whatever the program's thread is doing. */
void commitHold() {
  armed = false;
  const int64_t id = targetId.load();
  const bool raised = id >= 0;
  if (raised) raiseSoon((CGWindowID)id, (pid_t)targetPid.load());
  post(EVENT_COMMIT, raised ? 1 : 0);
}

int modifiersOf(CGEventFlags flags) {
  int mask = 0;
  if (flags & kCGEventFlagMaskCommand) mask |= MOD_COMMAND;
  if (flags & kCGEventFlagMaskAlternate) mask |= MOD_OPTION;
  if (flags & kCGEventFlagMaskControl) mask |= MOD_CONTROL;
  return mask;
}
bool chordStillHeld(CGEventFlags flags) {
  const int wanted = hotkeyModifiers.load();
  return (modifiersOf(flags) & wanted) == wanted;
}
CGEventRef tapCallback(CGEventTapProxy, CGEventType type, CGEventRef event, void*) {
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    if (tapPort) CGEventTapEnable(tapPort, true);
    // A release during the gap was never seen: without this the picker would stay up and swallow every key.
    if (armed.load() && !chordStillHeld(CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState))) commitHold();
    return event;
  }
  const CGEventFlags flags = CGEventGetFlags(event);
  if (type == kCGEventFlagsChanged) {
    if (armed.load() && !chordStillHeld(flags)) commitHold();
    return event;
  }
  if (type != kCGEventKeyDown) return event;
  const int key = (int)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
  const bool shift = (flags & kCGEventFlagMaskShift) != 0;
  if (recording.load()) {
    if (key == KEY_ESCAPE) {
      recording = false;
      post(EVENT_RECORDED, -1);
      return nullptr;
    }
    const int modifiers = modifiersOf(flags);
    if (modifiers == 0) return nullptr;   // a chord needs a modifier to hold, or nothing would ever end the picker
    recording = false;
    post(EVENT_RECORDED, key + modifiers * RECORDED_MODIFIER_UNIT);
    return nullptr;
  }
  const bool isHotkey = key == hotkeyCode.load() && modifiersOf(flags) == hotkeyModifiers.load();
  if (!armed.load()) {
    if (!isHotkey) return event;
    armed = true;
    if (shift) targetId = -1;   // the prepared target is for going back, not for Shift, which starts from the other end
    post(EVENT_ARM, shift ? 1 : 0);
    return nullptr;
  }
  if (!chordStillHeld(flags)) {   // the release went unseen: never hold the keyboard for a picker the person has left
    commitHold();
    return event;
  }
  if (isHotkey) post(shift ? EVENT_PREVIOUS : EVENT_NEXT, 0);
  else if (key == KEY_DOWN || key == KEY_RIGHT) post(EVENT_NEXT, 0);
  else if (key == KEY_UP || key == KEY_LEFT) post(EVENT_PREVIOUS, 0);
  else if (key == KEY_ESCAPE) { armed = false; post(EVENT_CANCEL, 0); }
  else if (key == KEY_RETURN || key == KEY_KEYPAD_ENTER) commitHold();
  return nullptr;
}
bool installTap() {
  const CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventFlagsChanged);
  tapPort = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask, tapCallback, nullptr);
  if (!tapPort) return false;
  [NSThread detachNewThreadWithBlock:^{
    CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(nullptr, tapPort, 0);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
    CGEventTapEnable(tapPort, true);
    CFRunLoopRun();
  }];
  return true;
}

// ---------------------------------------------------------------- focus: which window the person is in
CFRunLoopRef focusLoop = nullptr;
std::map<pid_t, AXObserverRef>& observers = *new std::map<pid_t, AXObserverRef>;
std::atomic<pid_t> frontPid{0};

void runOnFocusThread(dispatch_block_t work) {
  CFRunLoopPerformBlock(focusLoop, kCFRunLoopDefaultMode, work);
  CFRunLoopWakeUp(focusLoop);
}
AXUIElementRef appElement(pid_t pid) {
  AXUIElementRef app = AXUIElementCreateApplication(pid);
  AXUIElementSetMessagingTimeout(app, AX_TIMEOUT_SECONDS);
  return app;
}
void focusChanged(AXObserverRef, AXUIElementRef element, CFStringRef, void*) {
  pid_t pid = 0;
  AXUIElementGetPid(element, &pid);
  // Only the app in front: a background app that opens or closes a window also moves its own focus, and that is not the person going there.
  if (pid != frontPid.load()) return;
  CGWindowID id = 0;
  if (_AXUIElementGetWindow(element, &id) == kAXErrorSuccess && id != 0) post(EVENT_FOCUS, id);
}
bool readFocusedWindow(pid_t pid) {
  AXUIElementRef app = appElement(pid);
  CFTypeRef window = nullptr;
  bool reported = false;
  if (AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute, &window) == kAXErrorSuccess && window) {
    CGWindowID id = 0;
    if (_AXUIElementGetWindow((AXUIElementRef)window, &id) == kAXErrorSuccess && id != 0) {
      post(EVENT_FOCUS, id);
      reported = true;
    }
    CFRelease(window);
  }
  CFRelease(app);
  return reported;
}
bool observe(pid_t pid) {
  if (observers.count(pid)) return true;
  AXObserverRef observer = nullptr;
  if (AXObserverCreate(pid, focusChanged, &observer) != kAXErrorSuccess || !observer) return false;
  AXUIElementRef app = appElement(pid);
  const AXError added = AXObserverAddNotification(observer, app, kAXFocusedWindowChangedNotification, nullptr);
  CFRelease(app);
  if (added != kAXErrorSuccess && added != kAXErrorNotificationAlreadyRegistered) {   // an app still starting: the caller tries again
    CFRelease(observer);
    return false;
  }
  CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(observer), kCFRunLoopDefaultMode);
  observers[pid] = observer;
  return true;
}
/**
 * The cold start. macOS says an app is active before the app can answer AX, and before it says the app launched: the first read fails, and by the time an
 * observer could be attached the window has its focus already, so no notification will ever come. So: keep trying to observe, read after each try, and
 * stop once a window was read. The observer goes first so that a window arriving between two tries is reported by the notification.
 */
void settleFocus(pid_t pid, int triesLeft) {
  if (pid != frontPid.load()) return;   // the person moved on: this app's focus no longer matters, and activating it again starts over
  const bool observed = observe(pid);
  const bool read = readFocusedWindow(pid);
  if ((observed && read) || triesLeft <= 0) return;
  CFRunLoopRef loop = CFRunLoopGetCurrent();
  CFRunLoopTimerRef timer = CFRunLoopTimerCreateWithHandler(nullptr, CFAbsoluteTimeGetCurrent() + FOCUS_RETRY_SECONDS, 0, 0, 0, ^(CFRunLoopTimerRef) {
    settleFocus(pid, triesLeft - 1);
  });
  CFRunLoopAddTimer(loop, timer, kCFRunLoopDefaultMode);
  CFRelease(timer);
}
void forgetApp(pid_t pid) {
  auto found = observers.find(pid);
  if (found == observers.end()) return;
  CFRunLoopRemoveSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(found->second), kCFRunLoopDefaultMode);
  CFRelease(found->second);
  observers.erase(found);
}
void appBecameFront(pid_t pid) {
  if (pid == getpid()) return;
  frontPid = pid;
  runOnFocusThread(^{ settleFocus(pid, FOCUS_RETRIES); });
}
void startFocusTracking() {
  dispatch_semaphore_t ready = dispatch_semaphore_create(0);
  [NSThread detachNewThreadWithBlock:^{
    focusLoop = CFRunLoopGetCurrent();
    dispatch_semaphore_signal(ready);
    // A run loop with no source returns at once.
    CFRunLoopTimerRef keepAlive = CFRunLoopTimerCreateWithHandler(nullptr, CFAbsoluteTimeGetCurrent() + 3600, 3600, 0, 0, ^(CFRunLoopTimerRef) {});
    CFRunLoopAddTimer(focusLoop, keepAlive, kCFRunLoopDefaultMode);
    CFRunLoopRun();
  }];
  dispatch_semaphore_wait(ready, DISPATCH_TIME_FOREVER);
  NSWorkspace* workspace = NSWorkspace.sharedWorkspace;
  NSNotificationCenter* center = workspace.notificationCenter;
  [center addObserverForName:NSWorkspaceDidActivateApplicationNotification object:nil queue:nil usingBlock:^(NSNotification* note) {
    NSRunningApplication* app = note.userInfo[NSWorkspaceApplicationKey];
    if (app.activationPolicy == NSApplicationActivationPolicyRegular) appBecameFront(app.processIdentifier);
  }];
  [center addObserverForName:NSWorkspaceDidTerminateApplicationNotification object:nil queue:nil usingBlock:^(NSNotification* note) {
    const pid_t pid = ((NSRunningApplication*)note.userInfo[NSWorkspaceApplicationKey]).processIdentifier;
    runOnFocusThread(^{ forgetApp(pid); });
  }];
  NSMutableArray<NSNumber*>* running = [NSMutableArray array];
  for (NSRunningApplication* app in workspace.runningApplications)
    if (app.activationPolicy == NSApplicationActivationPolicyRegular && app.processIdentifier != getpid()) [running addObject:@(app.processIdentifier)];
  [running retain];
  runOnFocusThread(^{
    for (NSNumber* pid in running) observe(pid.intValue);
    [running release];
  });
  NSRunningApplication* front = workspace.frontmostApplication;
  if (front) appBecameFront(front.processIdentifier);
}

// ---------------------------------------------------------------- the sweep: which windows are real
dispatch_queue_t workQueue() {
  static dispatch_queue_t queue = dispatch_queue_create("dev.zinc.riffle.work", DISPATCH_QUEUE_SERIAL);
  return queue;
}
struct KnownWindow { AXUIElementRef element; std::string title; };
/** An app lists the windows of the current Space only: the element seen there stays valid on the other Spaces, and says a window is real. */
std::map<CGWindowID, KnownWindow>& known = *new std::map<CGWindowID, KnownWindow>;
std::mutex& knownLock = *new std::mutex;
std::mutex& sweepLock = *new std::mutex;
std::string& lastSweep = *new std::string("[]");
std::atomic<bool> sweepRunning{false};

NSArray* serverWindows() {
  CFArrayRef raw = CGWindowListCopyWindowInfo(kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
  return raw ? [(NSArray*)raw autorelease] : @[];
}
NSArray* onScreenWindows() {
  CFArrayRef raw = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
  return raw ? [(NSArray*)raw autorelease] : @[];
}
std::string axString(AXUIElementRef element, CFStringRef attribute) {
  CFTypeRef value = nullptr;
  std::string out;
  if (AXUIElementCopyAttributeValue(element, attribute, &value) == kAXErrorSuccess && value) {
    if (CFGetTypeID(value) == CFStringGetTypeID()) out = cstr((NSString*)value);
    CFRelease(value);
  }
  return out;
}
bool axBool(AXUIElementRef element, CFStringRef attribute) {
  CFTypeRef value = nullptr;
  bool out = false;
  if (AXUIElementCopyAttributeValue(element, attribute, &value) == kAXErrorSuccess && value) {
    if (CFGetTypeID(value) == CFBooleanGetTypeID()) out = CFBooleanGetValue((CFBooleanRef)value);
    CFRelease(value);
  }
  return out;
}
struct AppWindows { std::set<CGWindowID> ids; std::set<CGWindowID> minimized; };
/** The AX windows of one app; records them in `known`. */
AppWindows readAppWindows(pid_t pid) {
  AppWindows out;
  AXUIElementRef app = appElement(pid);
  CFTypeRef list = nullptr;
  const AXError listError = AXUIElementCopyAttributeValue(app, kAXWindowsAttribute, &list);
  if (listError == kAXErrorSuccess && list) {
    for (id item in (NSArray*)list) {
      AXUIElementRef element = (AXUIElementRef)item;
      AXUIElementSetMessagingTimeout(element, AX_TIMEOUT_SECONDS);
      CGWindowID windowId = 0;
      if (_AXUIElementGetWindow(element, &windowId) != kAXErrorSuccess || windowId == 0) continue;
      const std::string subrole = axString(element, kAXSubroleAttribute);
      if (subrole != "AXStandardWindow" && subrole != "AXDialog" && !subrole.empty()) continue;   // palettes and popovers are not somewhere to switch to
      out.ids.insert(windowId);
      if (axBool(element, kAXMinimizedAttribute)) out.minimized.insert(windowId);
      const std::string title = axString(element, kAXTitleAttribute);
      std::lock_guard<std::mutex> hold(knownLock);
      auto found = known.find(windowId);
      if (found == known.end()) { CFRetain(element); known[windowId] = {element, title}; }
      else found->second.title = title;
    }
    CFRelease(list);
  }
  CFRelease(app);
  return out;
}
std::set<long> liveSpaces() {
  std::set<long> ids;
  CFArrayRef displays = CGSCopyManagedDisplaySpaces(CGSMainConnectionID());
  if (!displays) return ids;
  for (NSDictionary* display in (NSArray*)displays)
    for (NSDictionary* space in display[@"Spaces"]) ids.insert([space[@"id64"] longValue]);
  CFRelease(displays);
  return ids;
}
bool claimsLiveSpace(CGWindowID id, const std::set<long>& live) {
  NSArray* one = @[@(id)];
  CFArrayRef spaces = CGSCopySpacesForWindows(CGSMainConnectionID(), ALL_SPACES_MASK, (CFArrayRef)one);
  if (!spaces) return false;
  bool claims = false;
  for (NSNumber* space in (NSArray*)spaces) if (live.count(space.longValue)) claims = true;
  CFRelease(spaces);
  return claims;
}
bool isKnown(CGWindowID id) {
  std::lock_guard<std::mutex> hold(knownLock);
  return known.count(id) != 0;
}
std::string knownTitle(CGWindowID id) {
  std::lock_guard<std::mutex> hold(knownLock);
  auto found = known.find(id);
  return found == known.end() ? "" : found->second.title;
}
void sweepWindows() {
  @autoreleasepool {
    const bool titlesAreReadable = CGPreflightScreenCaptureAccess();
    // Only the on-screen list is in stacking order, front to back: the list of all windows is in no useful order, and the ranks of new windows come from this one.
    NSArray* visibleWindows = onScreenWindows();
    std::set<CGWindowID> onScreen;
    for (NSDictionary* info in visibleWindows) onScreen.insert([info[(id)kCGWindowNumber] unsignedIntValue]);
    NSMutableArray* server = [NSMutableArray arrayWithArray:visibleWindows];
    for (NSDictionary* info in serverWindows())
      if (!onScreen.count([info[(id)kCGWindowNumber] unsignedIntValue])) [server addObject:info];
    const std::set<long> live = liveSpaces();
    std::map<pid_t, AppWindows> apps;
    std::map<pid_t, NSRunningApplication*> running;
    std::set<CGWindowID> alive;
    NSMutableArray* out = [NSMutableArray array];
    for (NSDictionary* info in server) {
      const CGWindowID windowId = [info[(id)kCGWindowNumber] unsignedIntValue];
      alive.insert(windowId);
      if ([info[(id)kCGWindowLayer] intValue] != 0) continue;
      const pid_t pid = [info[(id)kCGWindowOwnerPID] intValue];
      if (pid == getpid()) continue;
      if (!running.count(pid)) running[pid] = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
      NSRunningApplication* app = running[pid];
      if (!app || app.activationPolicy != NSApplicationActivationPolicyRegular) continue;
      CGRect bounds;
      CGRectMakeWithDictionaryRepresentation((CFDictionaryRef)info[(id)kCGWindowBounds], &bounds);
      if (bounds.size.width < MIN_WINDOW_WIDTH || bounds.size.height < MIN_WINDOW_HEIGHT) continue;
      if ([info[(id)kCGWindowAlpha] doubleValue] <= 0 && !app.hidden) continue;
      if (!apps.count(pid)) apps[pid] = readAppWindows(pid);
      const AppWindows& listed = apps[pid];
      const bool isListed = listed.ids.count(windowId) != 0;
      const bool visible = onScreen.count(windowId) != 0;
      const std::string cgTitle = cstr(info[(id)kCGWindowName]);
      if (!isListed) {
        // On screen but not in a list the app does give: an overlay of that app (a find highlight, a border). An app that gives no list at all (one still starting, Chromium before its accessibility wakes) is judged like an off-Space window.
        if (visible && !listed.ids.empty()) continue;
        if (!isKnown(windowId)) {
          if (!claimsLiveSpace(windowId, live) && !app.hidden) continue;   // ordered out, or on a Space that was deleted: a shell, not a window
          if (titlesAreReadable ? cgTitle.empty() : (bounds.size.width < MIN_UNTITLED_WIDTH || bounds.size.height < MIN_UNTITLED_HEIGHT)) continue;
        }
      }
      const std::string axTitle = knownTitle(windowId);
      NSString* title = [NSString stringWithUTF8String:(axTitle.empty() ? cgTitle : axTitle).c_str()] ?: @"";
      [out addObject:@{
        @"id": @(windowId), @"pid": @(pid), @"app": app.localizedName ?: @"", @"bundle": app.bundleIdentifier ?: @"", @"title": title,
        @"offSpace": @(!visible && !app.hidden && !listed.minimized.count(windowId)), @"minimized": @(listed.minimized.count(windowId) != 0), @"hidden": @(app.hidden != NO),
      }];
    }
    std::lock_guard<std::mutex> holdKnown(knownLock);
    for (auto it = known.begin(); it != known.end();) {
      if (alive.count(it->first)) { ++it; continue; }
      CFRelease(it->second.element);
      it = known.erase(it);
    }
    std::string encoded = json(out);
    std::lock_guard<std::mutex> hold(sweepLock);
    lastSweep = encoded;
  }
}

// ---------------------------------------------------------------- raising a window
typedef OSStatus (*SetFrontProcessFn)(ProcessSerialNumber*, CGWindowID, uint32_t);
typedef OSStatus (*PostEventRecordFn)(ProcessSerialNumber*, uint8_t*);
typedef OSStatus (*ProcessForPidFn)(pid_t, ProcessSerialNumber*);
const uint32_t CPS_USER_GENERATED = 0x200;
const int EVENT_RECORD_BYTES = 0xf8;
/** What pressing on a title bar sends: it makes this window of the app the key one, where activating would pick the app's last one. */
void makeKeyWindow(ProcessSerialNumber* process, CGWindowID id, PostEventRecordFn postRecord) {
  uint8_t record[EVENT_RECORD_BYTES] = {};
  record[0x04] = 0xf8;
  record[0x3a] = 0x10;
  memcpy(&record[0x3c], &id, sizeof id);
  memset(&record[0x20], 0xff, 0x10);
  record[0x08] = 0x01;
  postRecord(process, record);
  record[0x08] = 0x02;
  postRecord(process, record);
}
/** What a click on the Dock icon does: an app that hides its window when closed (Discord, most Electron apps) shows it again for this and for nothing else. */
void reopenApp(pid_t pid) {
  @autoreleasepool {
    NSRunningApplication* app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if (!app) return;
    if (!app.bundleURL) { [app activateWithOptions:NSApplicationActivateAllWindows]; return; }
    NSWorkspaceOpenConfiguration* configuration = [NSWorkspaceOpenConfiguration configuration];
    configuration.activates = YES;
    [NSWorkspace.sharedWorkspace openApplicationAtURL:app.bundleURL configuration:configuration completionHandler:nil];
  }
}
void raiseWindow(CGWindowID id, pid_t pid) {
  @autoreleasepool {
    NSRunningApplication* app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if (!app) return;
    if (app.hidden) [app unhide];
    AXUIElementRef element = nullptr;
    {
      std::lock_guard<std::mutex> hold(knownLock);
      auto found = known.find(id);
      if (found != known.end()) { element = found->second.element; CFRetain(element); }
    }
    // The sweep may not have this window yet (it runs every 2 s, and an app can miss its answer): only AX or the activation below raises it, the window server's focus does not.
    if (!element) {
      readAppWindows(pid);
      std::lock_guard<std::mutex> hold(knownLock);
      auto found = known.find(id);
      if (found != known.end()) { element = found->second.element; CFRetain(element); }
    }
    // These symbols are private, so a macOS without them gets the plain activation rather than a load failure.
    static SetFrontProcessFn setFront = (SetFrontProcessFn)dlsym(RTLD_DEFAULT, "_SLPSSetFrontProcessWithOptions");
    static PostEventRecordFn postRecord = (PostEventRecordFn)dlsym(RTLD_DEFAULT, "SLPSPostEventRecordTo");
    static ProcessForPidFn processForPid = (ProcessForPidFn)dlsym(RTLD_DEFAULT, "GetProcessForPID");
    ProcessSerialNumber process = {};
    if (setFront && postRecord && processForPid && processForPid(pid, &process) == noErr) {
      setFront(&process, id, CPS_USER_GENERATED);
      makeKeyWindow(&process, id, postRecord);
    } else {
      [app activateWithOptions:0];
    }
    const bool minimized = element && axBool(element, kAXMinimizedAttribute);
    const bool claims = claimsLiveSpace(id, liveSpaces());
    if (!minimized && !claims) reopenApp(pid);   // ordered out: no raise can bring it back
    // The window server first, as it answers at once; AX waits for the app, which may be slow.
    if (element) {
      if (minimized) AXUIElementSetAttributeValue(element, kAXMinimizedAttribute, kCFBooleanFalse);
      AXUIElementSetAttributeValue(element, kAXMainAttribute, kCFBooleanTrue);
      AXUIElementPerformAction(element, kAXRaiseAction);
      CFRelease(element);
    } else {
      [app activateWithOptions:NSApplicationActivateAllWindows];
    }
  }
}

std::atomic<uint64_t> latestRaise{0};
/** Going to a window can silently do nothing. Only the app that was in front still being there counts as that: another app in front means the person moved on. */
void checkRaise(CGWindowID id, pid_t pid, pid_t frontBefore, uint64_t raise, bool reopened) {
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(RAISE_CHECK_SECONDS * NSEC_PER_SEC)), dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0), ^{
    if (raise != latestRaise.load() || frontPid.load() != frontBefore) return;
    if (reopened) { post(EVENT_RAISE_FAILED, id); return; }
    reopenApp(pid);
    checkRaise(id, pid, frontBefore, raise, true);
  });
}
void raiseSoon(CGWindowID id, pid_t pid) {
  const uint64_t raise = ++latestRaise;
  const pid_t frontBefore = frontPid.load();
  if (frontBefore != pid) checkRaise(id, pid, frontBefore, raise, false);
  static dispatch_queue_t queue = dispatch_queue_create("dev.zinc.riffle.raise", dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INTERACTIVE, 0));
  dispatch_async(queue, ^{ raiseWindow(id, pid); });
}

NSWindow* programWindow() {
  for (NSWindow* window in NSApp.windows) if (![window isKindOfClass:NSPanel.class]) return window;
  return NSApp.windows.firstObject;
}
NSScreen* screenUnderPointer() {
  const NSPoint pointer = NSEvent.mouseLocation;
  for (NSScreen* screen in NSScreen.screens) if (NSPointInRect(pointer, screen.frame)) return screen;
  return NSScreen.mainScreen;
}
NSRect centeredOn(NSScreen* screen, int width, int height) {
  const NSRect area = screen.frame;
  return NSMakeRect(round(NSMidX(area) - width / 2.0), round(NSMidY(area) - height / 2.0), width, height);
}
}  // namespace

struct MacDesktopWindows : NativeDesktopWindows, zrt::Poller {
  bool polling = false;
  bool started = false;
  zrt::Fn<void(double, double)> handler;

  bool fake() override {
    const char* forced = getenv("RIFFLE_FAKE_WINDOWS");
    if (forced) return forced[0] == '1';
    const char* deterministic = getenv("ZINC_DETERMINISTIC");
    return deterministic && deterministic[0] == '1';
  }
  bool trusted(bool prompt) override {
    NSDictionary* options = @{(id)kAXTrustedCheckOptionPrompt: @(prompt)};
    return AXIsProcessTrustedWithOptions((CFDictionaryRef)options);
  }
  void listen(zrt::Fn<void(double, double)> received) override {
    handler = received;
    if (!polling) { polling = true; zrt::add_poller(this); }
  }
  bool poll() override {
    std::vector<Event> pending;
    { std::lock_guard<std::mutex> hold(eventsLock); pending.swap(events); }
    for (const Event& event : pending) handler((double)event.kind, event.value);
    return false;
  }
  bool start(bool withHotkey) override {
    if (started) return true;
    if (!AXIsProcessTrusted()) return false;
    if (withHotkey && !installTap()) return false;
    startFocusTracking();
    started = true;
    return true;
  }
  void setHotkey(int32_t keyCode, int32_t modifiers) override { hotkeyCode = keyCode; hotkeyModifiers = modifiers; }
  void recordHotkey(bool on) override { recording = on; }
  void disarm() override { armed = false; }
  void refresh() override {
    if (sweepRunning.exchange(true)) return;
    dispatch_async(workQueue(), ^{
      sweepWindows();
      sweepRunning = false;
      post(EVENT_WINDOWS, 0);
    });
  }
  zrt::String windows() override {
    std::lock_guard<std::mutex> hold(sweepLock);
    return str(lastSweep);
  }
  zrt::String existing() override {
    @autoreleasepool {
      NSMutableArray* out = [NSMutableArray array];
      for (NSDictionary* info in serverWindows()) [out addObject:@[info[(id)kCGWindowNumber], info[(id)kCGWindowOwnerPID]]];
      return str(json(out));
    }
  }
  int32_t frontmostPid() override { return NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier; }
  zrt::Array<uint8_t> appIcon(int32_t pid) override {
    @autoreleasepool {
      const int ICON_PIXELS = 96;
      NSImage* icon = [NSRunningApplication runningApplicationWithProcessIdentifier:pid].icon;
      zrt::Array<uint8_t> empty = zrt::Array<uint8_t>::with_cap(0);
      if (!icon) return empty;
      NSBitmapImageRep* bitmap = [[[NSBitmapImageRep alloc] initWithBitmapDataPlanes:nullptr pixelsWide:ICON_PIXELS pixelsHigh:ICON_PIXELS bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSCalibratedRGBColorSpace bytesPerRow:0 bitsPerPixel:0] autorelease];
      [NSGraphicsContext saveGraphicsState];
      NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
      [icon drawInRect:NSMakeRect(0, 0, ICON_PIXELS, ICON_PIXELS)];
      [NSGraphicsContext restoreGraphicsState];
      NSData* png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
      zrt::Array<uint8_t> out = zrt::Array<uint8_t>::with_cap((int32_t)png.length);
      memcpy(out.a->data, png.bytes, png.length);
      out.a->len = (int32_t)png.length;
      return out;
    }
  }
  void setTarget(int32_t id, int32_t pid) override { targetPid = pid; targetId = id; }
  void focus(int32_t id, int32_t pid) override { raiseSoon((CGWindowID)id, (pid_t)pid); }
  void showOverlay(int32_t width, int32_t height) override {
    NSWindow* window = programWindow();
    if (!window) return;
    window.level = NSPopUpMenuWindowLevel;
    window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorIgnoresCycle | NSWindowCollectionBehaviorStationary;
    [window setFrame:centeredOn(screenUnderPointer(), width, height) display:YES];
    // In place but unseen: it draws the current list while ordered in, so what appears is never the last frame of the previous hold.
    window.alphaValue = 0;
    window.ignoresMouseEvents = YES;
    [window orderFrontRegardless];   // not makeKey and no activation: the app in front stays in front, the keys come through the tap
  }
  void revealOverlay() override {
    NSWindow* window = programWindow();
    if (!window) return;
    window.ignoresMouseEvents = NO;
    window.alphaValue = 1;
    [CATransaction flush];
  }
  void resizeOverlay(int32_t width, int32_t height) override {
    NSWindow* window = programWindow();
    if (!window) return;
    NSScreen* screen = window.screen ?: screenUnderPointer();
    [window setFrame:centeredOn(screen, width, height) display:YES];
    [CATransaction flush];
  }
  void setDarkAppearance(bool dark) override {
    NSWindow* window = programWindow();
    if (window) window.appearance = [NSAppearance appearanceNamed:dark ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
  }
  void hideOverlay() override {
    NSWindow* window = programWindow();
    if (!window) return;
    [window orderOut:nil];
    window.alphaValue = 1;
    window.ignoresMouseEvents = NO;
    window.level = NSNormalWindowLevel;
    window.collectionBehavior = NSWindowCollectionBehaviorDefault;
  }
  void endOverlay() override {
    NSWindow* window = programWindow();
    if (!window) return;
    window.level = NSNormalWindowLevel;
    window.collectionBehavior = NSWindowCollectionBehaviorDefault;
  }
};

NativeDesktopWindows* zinc_create_DesktopWindows() {
  // The list shows without Riffle being active: without this, SDL's window spends the first click on activating the app and the row or button never hears it.
  setenv("SDL_MOUSE_FOCUS_CLICKTHROUGH", "1", 1);
  static MacDesktopWindows self;
  self.rc = zrt::IMMORTAL;
  return &self;
}
