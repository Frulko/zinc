// zinc:system on macOS (ZN-235): notifications through UNUserNotificationCenter when the process has a bundle id (a dev bundle counts, section 5.1 of the report) and through
// `osascript` otherwise. A plain C interface for system.host.cpp, which cannot include Foundation next to zrt.h. Events come from the delegate on a system thread: they wait in a queue
// that the host drains in poll().
#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <UserNotifications/UserNotifications.h>
#import <objc/runtime.h>
#include <string.h>

static NSString* const kNone = nil;
static NSMutableArray<NSString*>* gEvents;
static NSMutableSet<UNNotificationCategory*>* gCategories;

static void pushEvent(NSString* type, NSArray* args) {
  NSData* d = [NSJSONSerialization dataWithJSONObject:@{@"type": type, @"args": args} options:0 error:nil];
  if (!d) return;
  @synchronized(gEvents) { [gEvents addObject:[[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding]]; }
}

@interface ZnNotifDelegate : NSObject <UNUserNotificationCenterDelegate>
@end
@implementation ZnNotifDelegate
- (void)userNotificationCenter:(UNUserNotificationCenter*)c willPresentNotification:(UNNotification*)n withCompletionHandler:(void (^)(UNNotificationPresentationOptions))h {
  h(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);   // shown even while the app is in front
}
- (void)userNotificationCenter:(UNUserNotificationCenter*)c didReceiveNotificationResponse:(UNNotificationResponse*)r withCompletionHandler:(void (^)(void))h {
  NSString* ident = r.notification.request.identifier;
  if ([r.actionIdentifier isEqualToString:UNNotificationDefaultActionIdentifier]) pushEvent(@"notification-click", @[ident]);
  else if ([r.actionIdentifier isEqualToString:UNNotificationDismissActionIdentifier]) pushEvent(@"notification-close", @[ident, @"user"]);
  else if ([r isKindOfClass:[UNTextInputNotificationResponse class]]) pushEvent(@"notification-reply", @[ident, ((UNTextInputNotificationResponse*)r).userText]);
  else pushEvent(@"notification-action", @[ident, r.actionIdentifier]);
  h();
}
@end

static bool bundled() { return [[NSBundle mainBundle] bundleIdentifier] != nil; }
static UNUserNotificationCenter* center() {
  static UNUserNotificationCenter* c;
  static ZnNotifDelegate* delegate;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    gEvents = [NSMutableArray new];
    gCategories = [NSMutableSet new];
    c = [UNUserNotificationCenter currentNotificationCenter];
    delegate = [ZnNotifDelegate new];
    c.delegate = delegate;
  });
  return c;
}
static void ensureQueue() { static dispatch_once_t once; dispatch_once(&once, ^{ gEvents = [NSMutableArray new]; gCategories = [NSMutableSet new]; }); }

static NSString* authState() {   // 'granted' | 'denied' | 'default'
  __block NSString* state = @"default";
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  [center() getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* s) {
    state = s.authorizationStatus == UNAuthorizationStatusDenied ? @"denied" : (s.authorizationStatus == UNAuthorizationStatusNotDetermined ? @"default" : @"granted");
    dispatch_semaphore_signal(sem);
  }];
  dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC));
  return state;
}

static NSString* json(id obj) {
  NSData* d = [NSJSONSerialization dataWithJSONObject:obj options:0 error:nil];
  return d ? [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] : @"{}";
}

static NSString* osascript(NSDictionary* a) {
  NSString* title = a[@"title"] ?: @"", *body = a[@"body"] ?: @"", *sub = a[@"subtitle"] ?: @"";
  NSMutableString* script = [NSMutableString stringWithString:@"on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)"];
  if ([sub length]) [script appendString:@" subtitle (item 3 of argv)"];
  [script appendString:@"\nend run"];
  NSTask* t = [NSTask new];
  t.executableURL = [NSURL fileURLWithPath:@"/usr/bin/osascript"];
  t.arguments = @[@"-e", script, title, body, sub];   // arguments, never concatenated into the script: no injection through a title
  t.standardOutput = [NSPipe pipe]; t.standardError = [NSPipe pipe];
  NSError* err = nil;
  if (![t launchAndReturnError:&err]) return json(@{@"id": a[@"id"] ?: @"", @"delivered": @NO, @"reason": err.localizedDescription ?: @"osascript failed"});
  [t waitUntilExit];
  return json(t.terminationStatus == 0 ? @{@"id": a[@"id"] ?: @"", @"delivered": @YES} : @{@"id": a[@"id"] ?: @"", @"delivered": @NO, @"reason": @"osascript failed"});
}


// ---------------------------------------------------------------- menus (ZN-236)
static NSMutableDictionary<NSString*, NSMenuItem*>* gMenuItems;
static NSString* gPicked;       // popup: the id that was chosen
static BOOL gInPopup = NO;
static NSMenu* gDockMenu;       // the dock menu (ZN-237)

@interface ZnMenuTarget : NSObject
- (void)znClicked:(NSMenuItem*)item;
@end
@implementation ZnMenuTarget
- (void)znClicked:(NSMenuItem*)item {
  NSString* ident = item.representedObject;
  if (!ident) return;
  if (gInPopup) gPicked = ident;
  pushEvent(@"menu-click", @[ident, gInPopup ? @"context" : (item.tag == 1 ? @"dock" : @"app")]);
}
@end
static ZnMenuTarget* menuTarget() { static ZnMenuTarget* t; static dispatch_once_t once; dispatch_once(&once, ^{ t = [ZnMenuTarget new]; gMenuItems = [NSMutableDictionary new]; }); return t; }

static NSString* keyEquivalentOf(NSString* key) {   // the canonical key names of accelerator.ts
  if (key.length == 1) return key.lowercaseString;
  static NSDictionary* named = @{@"Space": @" ", @"Tab": @"\t", @"Enter": @"\r", @"Escape": @"\x1b", @"Backspace": @"\x08", @"Plus": @"+", @"Minus": @"-", @"Equal": @"=", @"Comma": @",", @"Period": @".", @"Slash": @"/", @"Backslash": @"\\",
    @"Semicolon": @";", @"Quote": @"'", @"Backquote": @"`", @"BracketLeft": @"[", @"BracketRight": @"]"};
  if (named[key]) return named[key];
  unichar fn = 0;
  if ([key isEqualToString:@"Up"]) fn = NSUpArrowFunctionKey; else if ([key isEqualToString:@"Down"]) fn = NSDownArrowFunctionKey; else if ([key isEqualToString:@"Left"]) fn = NSLeftArrowFunctionKey;
  else if ([key isEqualToString:@"Right"]) fn = NSRightArrowFunctionKey; else if ([key isEqualToString:@"Home"]) fn = NSHomeFunctionKey; else if ([key isEqualToString:@"End"]) fn = NSEndFunctionKey;
  else if ([key isEqualToString:@"PageUp"]) fn = NSPageUpFunctionKey; else if ([key isEqualToString:@"PageDown"]) fn = NSPageDownFunctionKey; else if ([key isEqualToString:@"Delete"]) fn = NSDeleteFunctionKey;
  else if ([key isEqualToString:@"Insert"]) fn = NSInsertFunctionKey;
  else if ([key hasPrefix:@"F"] && key.length >= 2) fn = (unichar)(NSF1FunctionKey + [[key substringFromIndex:1] intValue] - 1);
  return fn ? [NSString stringWithCharacters:&fn length:1] : @"";
}
static SEL selectorOfRole(NSString* r) {
  if ([r isEqualToString:@"about"]) return @selector(orderFrontStandardAboutPanel:);
  if ([r isEqualToString:@"hide"]) return @selector(hide:);
  if ([r isEqualToString:@"hideOthers"]) return @selector(hideOtherApplications:);
  if ([r isEqualToString:@"unhide"]) return @selector(unhideAllApplications:);
  if ([r isEqualToString:@"close"]) return @selector(performClose:);
  if ([r isEqualToString:@"minimize"]) return @selector(performMiniaturize:);
  if ([r isEqualToString:@"zoom"]) return @selector(performZoom:);
  if ([r isEqualToString:@"front"]) return @selector(arrangeInFront:);
  if ([r isEqualToString:@"togglefullscreen"]) return @selector(toggleFullScreen:);
  return nullptr;
}
static NSMenu* buildMenu(NSArray* items, NSString* title, NSInteger tag = 0) {
  NSMenu* m = [[NSMenu alloc] initWithTitle:title ?: @""];
  m.autoenablesItems = NO;
  for (NSDictionary* d in items) {
    if ([d[@"type"] isEqualToString:@"separator"]) { [m addItem:[NSMenuItem separatorItem]]; continue; }
    NSMenuItem* it = [[NSMenuItem alloc] initWithTitle:d[@"label"] ?: @"" action:nil keyEquivalent:@""];
    NSString* ident = d[@"id"];
    it.tag = tag;
    if (d[@"submenu"]) it.submenu = buildMenu(d[@"submenu"], d[@"label"], tag);
    else if ([d[@"native"] boolValue] && selectorOfRole(d[@"role"])) { it.action = selectorOfRole(d[@"role"]); it.target = nil; }   // the responder chain answers
    else if ([d[@"role"] isEqualToString:@"services"]) { NSMenu* sm = [[NSMenu alloc] initWithTitle:@"Services"]; it.submenu = sm; [NSApp setServicesMenu:sm]; }
    else { it.action = @selector(znClicked:); it.target = menuTarget(); }
    if ([d[@"role"] isEqualToString:@"services"] && !it.submenu) { NSMenu* sm = [[NSMenu alloc] initWithTitle:@"Services"]; it.submenu = sm; [NSApp setServicesMenu:sm]; }
    if ([d[@"native"] boolValue] && [d[@"role"] isEqualToString:@"services"]) { it.action = nil; }
    if (ident.length) { it.representedObject = ident; gMenuItems[ident] = it; }
    if (d[@"key"]) { it.keyEquivalent = keyEquivalentOf(d[@"key"]); it.keyEquivalentModifierMask = (NSEventModifierFlags)[d[@"mods"] unsignedLongValue]; }
    if (d[@"enabled"] && ![d[@"enabled"] boolValue]) it.enabled = NO;
    if ([d[@"visible"] isEqualToNumber:@NO]) it.hidden = YES;
    if ([d[@"checked"] boolValue]) it.state = NSControlStateValueOn;
    [m addItem:it];
  }
  return m;
}
static void dumpMenu(NSMenu* m, int depth, NSMutableString* out) {
  for (NSMenuItem* it in m.itemArray) {
    if (it.isSeparatorItem) { [out appendFormat:@"%*s----\n", depth * 2, ""]; continue; }
    NSMutableString* line = [NSMutableString stringWithFormat:@"%*s%@", depth * 2, "", it.title];
    if (it.keyEquivalent.length) {
      NSEventModifierFlags f = it.keyEquivalentModifierMask;
      NSMutableString* k = [NSMutableString new];
      if (f & NSEventModifierFlagControl) [k appendString:@"Ctrl+"];
      if (f & NSEventModifierFlagOption) [k appendString:@"Alt+"];
      if (f & NSEventModifierFlagShift) [k appendString:@"Shift+"];
      if (f & NSEventModifierFlagCommand) [k appendString:@"Cmd+"];
      [k appendString:it.keyEquivalent.length == 1 && [it.keyEquivalent characterAtIndex:0] > 0x20 && [it.keyEquivalent characterAtIndex:0] < 0x7f ? it.keyEquivalent.uppercaseString : [NSString stringWithFormat:@"U+%04X", [it.keyEquivalent characterAtIndex:0]]];
      [line appendFormat:@"  [%@]", k];
    }
    if (!it.enabled) [line appendString:@"  (disabled)"];
    if (it.state == NSControlStateValueOn) [line appendString:@"  (checked)"];
    if (it.hidden) [line appendString:@"  (hidden)"];
    if (it.representedObject) [line appendFormat:@"  {%@}", it.representedObject];
    else if (it.action && it.target == nil) [line appendFormat:@"  <%@>", NSStringFromSelector(it.action)];
    [out appendFormat:@"%@\n", line];
    if (it.submenu && it.submenu != NSApp.servicesMenu) dumpMenu(it.submenu, depth + 1, out);
  }
}
static NSMenuItem* findByPath(NSMenu* m, NSArray<NSString*>* path, int i) {
  for (NSMenuItem* it in m.itemArray) {
    if (![it.title isEqualToString:path[i]]) continue;
    if (i + 1 == (int)path.count) return it;
    if (it.submenu) return findByPath(it.submenu, path, i + 1);
  }
  return nil;
}

static int menuCall(const char* op, NSDictionary* a, char* out, int cap) {
  menuTarget();
  [NSApplication sharedApplication];
  NSString* result = nil;
  if (!strcmp(op, "menu.setApp")) {
    [gMenuItems removeAllObjects];
    NSMenu* bar = buildMenu(a[@"template"], @"");   // the first entry is the application menu, macOS names it after the process
    NSApp.mainMenu = bar;
    result = @"{}";
  } else if (!strcmp(op, "menu.update")) {
    NSMenuItem* it = gMenuItems[a[@"id"] ?: @""];
    NSDictionary* p = a[@"props"];
    if (it && p[@"label"]) it.title = p[@"label"];
    if (it && p[@"enabled"]) it.enabled = [p[@"enabled"] boolValue];
    if (it && p[@"checked"]) it.state = [p[@"checked"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
    result = @"{}";
  } else if (!strcmp(op, "menu.popup")) {
    NSMenu* m = buildMenu(a[@"template"], @"");
    gPicked = nil; gInPopup = YES;
    NSPoint p = NSMakePoint([a[@"x"] doubleValue], [NSScreen mainScreen].frame.size.height - [a[@"y"] doubleValue]);
    [m popUpMenuPositioningItem:nil atLocation:p inView:nil];   // blocks while the menu is tracked
    gInPopup = NO;
    result = json(@{@"id": gPicked ?: [NSNull null]});
  } else if (!strcmp(op, "menu.dump")) {
    NSMutableString* text = [NSMutableString new];
    if (NSApp.mainMenu) dumpMenu(NSApp.mainMenu, 0, text);
    result = json(@{@"text": text});
  } else if (!strcmp(op, "menu.perform")) {
    NSArray* path = [(NSString*)a[@"path"] componentsSeparatedByString:@"/"];
    NSMenu* root = [a[@"dock"] boolValue] ? gDockMenu : NSApp.mainMenu;   // dock: true performs an item of the dock menu
    NSMenuItem* it = root ? findByPath(root, path, 0) : nil;
    BOOL did = NO;
    if (it && it.menu && it.enabled) { [it.menu performActionForItemAtIndex:[it.menu indexOfItem:it]]; did = YES; }
    result = json(@{@"ok": @(did)});
  }
  if (!result) return 0;
  snprintf(out, (size_t)cap, "%s", result.UTF8String);
  return 1;
}

// ---------------------------------------------------------------- dock (ZN-237)
static NSMenu* dockMenuIMP(id, SEL, NSApplication*) { return gDockMenu; }
@interface ZnDockView : NSView { @public double progress; }
@end
@implementation ZnDockView
- (void)drawRect:(NSRect)r {
  [NSApp.applicationIconImage drawInRect:self.bounds];
  if (progress < 0) return;
  NSRect bar = NSMakeRect(self.bounds.size.width * 0.1, self.bounds.size.height * 0.08, self.bounds.size.width * 0.8, self.bounds.size.height * 0.08);
  [[NSColor colorWithWhite:0 alpha:0.5] set]; [[NSBezierPath bezierPathWithRoundedRect:bar xRadius:4 yRadius:4] fill];
  NSRect fill = bar; fill.size.width *= (CGFloat)progress;
  [[NSColor systemBlueColor] set]; [[NSBezierPath bezierPathWithRoundedRect:fill xRadius:4 yRadius:4] fill];
}
@end
@interface ZnAppDelegate : NSObject <NSApplicationDelegate>
@end
@implementation ZnAppDelegate
@end
static ZnAppDelegate* gOwnDelegate;

static int dockCall(const char* op, NSDictionary* a, char* out, int cap) {
  [NSApplication sharedApplication];
  NSString* result = nil;
  if (!strcmp(op, "dock.setBadge")) { NSApp.dockTile.badgeLabel = [a[@"text"] length] ? a[@"text"] : nil; result = @"{}"; }
  else if (!strcmp(op, "dock.getBadge")) result = json(@{@"text": NSApp.dockTile.badgeLabel ?: @""});
  else if (!strcmp(op, "dock.bounce")) { [NSApp requestUserAttention:[a[@"kind"] isEqualToString:@"critical"] ? NSCriticalRequest : NSInformationalRequest]; result = @"{}"; }
  else if (!strcmp(op, "dock.setProgress")) {
    double v = [a[@"value"] doubleValue];
    if (v < 0) NSApp.dockTile.contentView = nil;
    else { ZnDockView* view = [[ZnDockView alloc] initWithFrame:NSMakeRect(0, 0, 128, 128)]; view->progress = v > 1 ? 1 : v; NSApp.dockTile.contentView = view; }
    [NSApp.dockTile display];
    result = @"{}";
  } else if (!strcmp(op, "dock.setMenu")) {
    gDockMenu = buildMenu(a[@"template"], @"", 1);
    id del = NSApp.delegate;
    if (!del) { gOwnDelegate = [ZnAppDelegate new]; NSApp.delegate = gOwnDelegate; del = gOwnDelegate; }
    if (![del respondsToSelector:@selector(applicationDockMenu:)]) class_addMethod([del class], @selector(applicationDockMenu:), (IMP)dockMenuIMP, "@@:@");   // SDL owns the delegate: the method is added to its class
    result = @"{}";
  }
  if (!result) return 0;
  snprintf(out, (size_t)cap, "%s", result.UTF8String);
  return 1;
}

extern "C" {

/** Answers a notification op; 1 when handled (out holds the JSON result), 0 for an op this backend does not do. */
int zn_sys_macos_call(const char* op, const char* args, char* out, int cap) {
  @autoreleasepool {
    ensureQueue();
    NSDictionary* a = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:args length:strlen(args)] options:0 error:nil] ?: @{};
    if (!strncmp(op, "menu.", 5)) {
      @try { return menuCall(op, a, out, cap); }
      @catch (NSException* e) { snprintf(out, (size_t)cap, "{\"error\":{\"code\":\"failed\",\"message\":\"%s\"}}", [e.reason stringByReplacingOccurrencesOfString:@"\"" withString:@"'"].UTF8String); return 1; }   // AppKit raises on a malformed menu: an error, not a crash
    }
    if (!strncmp(op, "dock.", 5)) {
      @try { return dockCall(op, a, out, cap); }
      @catch (NSException* e) { snprintf(out, (size_t)cap, "{\"error\":{\"code\":\"failed\",\"message\":\"%s\"}}", [e.reason stringByReplacingOccurrencesOfString:@"\"" withString:@"'"].UTF8String); return 1; }
    }
    if (strncmp(op, "notification.", 13) != 0) return 0;
    NSString* result = nil;
    BOOL native = bundled();
    if (!strcmp(op, "notification.backend")) result = json(@{@"backend": native ? @"native" : @"osascript"});
    else if (!strcmp(op, "notification.requestPermission")) {
      if (!native) result = json(@{@"state": @"granted"});   // osascript needs nothing from us; the system decides what Script Editor may show
      else {
        __block BOOL granted = NO;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        [center() requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge) completionHandler:^(BOOL g, NSError*) { granted = g; dispatch_semaphore_signal(sem); }];
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC));   // the OS prompt waits for a click
        result = json(@{@"state": granted ? @"granted" : authState()});
      }
    } else if (!strcmp(op, "notification.notify")) {
      NSString* ident = a[@"id"] ?: @"";
      if (!native) result = osascript(a);
      else {
        NSString* state = authState();
        if (![state isEqualToString:@"granted"]) result = json(@{@"id": ident, @"delivered": @NO, @"reason": [state isEqualToString:@"denied"] ? @"permission denied" : @"permission not requested"});
        else {
          UNMutableNotificationContent* c = [UNMutableNotificationContent new];
          c.title = a[@"title"] ?: @""; c.subtitle = a[@"subtitle"] ?: @""; c.body = a[@"body"] ?: @"";
          if ([a[@"group"] length]) c.threadIdentifier = a[@"group"];
          c.sound = UNNotificationSound.defaultSound;
          NSArray* actions = a[@"actions"];
          NSString* reply = a[@"reply"];
          if ([actions count] || [reply length]) {   // a category per notification id: its buttons and the reply field
            NSMutableArray<UNNotificationAction*>* list = [NSMutableArray new];
            for (NSDictionary* x in actions) [list addObject:[UNNotificationAction actionWithIdentifier:x[@"id"] title:x[@"title"] options:UNNotificationActionOptionForeground]];
            if ([reply length]) [list addObject:[UNTextInputNotificationAction actionWithIdentifier:@"zn-reply" title:@"Reply" options:0 textInputButtonTitle:@"Send" textInputPlaceholder:reply]];
            NSString* cat = [@"zn-" stringByAppendingString:ident];
            UNNotificationCategory* category = [UNNotificationCategory categoryWithIdentifier:cat actions:list intentIdentifiers:@[] options:UNNotificationCategoryOptionCustomDismissAction];
            @synchronized(gCategories) { [gCategories addObject:category]; [center() setNotificationCategories:gCategories]; }
            c.categoryIdentifier = cat;
          }
          __block NSString* failure = nil;
          dispatch_semaphore_t sem = dispatch_semaphore_create(0);
          [center() addNotificationRequest:[UNNotificationRequest requestWithIdentifier:ident content:c trigger:nil] withCompletionHandler:^(NSError* e) { failure = e.localizedDescription; dispatch_semaphore_signal(sem); }];
          dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
          result = json(failure ? @{@"id": ident, @"delivered": @NO, @"reason": failure} : @{@"id": ident, @"delivered": @YES});
        }
      }
    } else if (!strcmp(op, "notification.cancel")) {
      if (native && a[@"id"]) { [center() removePendingNotificationRequestsWithIdentifiers:@[a[@"id"]]]; [center() removeDeliveredNotificationsWithIdentifiers:@[a[@"id"]]]; }
      result = @"{}";
    } else if (!strcmp(op, "notification.delivered")) {
      __block NSMutableArray* items = [NSMutableArray new];
      if (native) {
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        [center() getDeliveredNotificationsWithCompletionHandler:^(NSArray<UNNotification*>* list) {
          for (UNNotification* n in list) [items addObject:@{@"id": n.request.identifier, @"title": n.request.content.title, @"body": n.request.content.body}];
          dispatch_semaphore_signal(sem);
        }];
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC));
      }
      result = json(@{@"items": items});
    }
    if (!result) return 0;
    snprintf(out, (size_t)cap, "%s", result.UTF8String);
    return 1;
  }
}

/** The next event the system delivered (a notification click...), 1 when `out` holds one. */
int zn_sys_macos_poll(char* out, int cap) {
  @autoreleasepool {
    if (!gEvents) return 0;
    NSString* e = nil;
    @synchronized(gEvents) { if ([gEvents count]) { e = gEvents[0]; [gEvents removeObjectAtIndex:0]; } }
    if (!e) return 0;
    snprintf(out, (size_t)cap, "%s", e.UTF8String);
    return 1;
  }
}

}
