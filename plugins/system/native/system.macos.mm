// zinc:system on macOS (ZN-235): notifications through UNUserNotificationCenter when the process has a bundle id (a dev bundle counts, section 5.1 of the report) and through
// `osascript` otherwise. A plain C interface for system.host.cpp, which cannot include Foundation next to zrt.h. Events come from the delegate on a system thread: they wait in a queue
// that the host drains in poll().
#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <UserNotifications/UserNotifications.h>
#import <objc/runtime.h>
#include <unistd.h>
#import <Carbon/Carbon.h>
#import <IOKit/pwr_mgt/IOPMLib.h>
#import <IOKit/ps/IOPowerSources.h>
#import <IOKit/ps/IOPSKeys.h>
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
/** NSApplication up and running enough for menus, the dock and status items to appear: a policy (Accessory for a tray-only bundle, Regular otherwise) and finishLaunching, once. */
static void ensureApp() {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    [NSApplication sharedApplication];
    BOOL uiElement = [[[NSBundle mainBundle] objectForInfoDictionaryKey:@"LSUIElement"] boolValue];
    if (NSApp.activationPolicy == NSApplicationActivationPolicyProhibited || uiElement) [NSApp setActivationPolicy:uiElement ? NSApplicationActivationPolicyAccessory : NSApplicationActivationPolicyRegular];
    [NSApp finishLaunching];
  });
}
static int gPumps = 0;
static NSMutableArray<NSString*>* gStartUrls;   // URLs received since the process started: what deeplink.current() reports
static NSMutableDictionary<NSString*, NSString*>* gDeclared;   // id -> the accelerator the program declared (AppKit rewrites the keys of some items itself)
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
  pushEvent(@"menu-click", @[ident, gInPopup ? @"context" : (item.tag == 1 ? @"dock" : (item.tag == 2 ? @"tray" : @"app"))]);
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
    it.representedObject = ident ?: @"";
    if (ident.length) { gMenuItems[ident] = it; if (!gDeclared) gDeclared = [NSMutableDictionary new]; if (d[@"accelerator"]) gDeclared[ident] = d[@"accelerator"]; else [gDeclared removeObjectForKey:ident]; }
    if (d[@"key"]) { it.keyEquivalent = keyEquivalentOf(d[@"key"]); it.keyEquivalentModifierMask = (NSEventModifierFlags)[d[@"mods"] unsignedLongValue]; }
    if (d[@"enabled"] && ![d[@"enabled"] boolValue]) it.enabled = NO;
    if ([d[@"visible"] isEqualToNumber:@NO]) it.hidden = YES;
    if ([d[@"checked"] boolValue]) it.state = NSControlStateValueOn;
    [m addItem:it];
  }
  return m;
}
static void dumpMenu(NSMenu* m, int depth, NSMutableString* out) {
  NSArray<NSMenuItem*>* all = m.itemArray;
  // macOS appends its own entries to a menu titled Edit (Start Dictation, Emoji & Symbols, AutoFill): the dump is what the app declared, so it stops at the first leaf nobody gave an id
  NSMutableArray<NSMenuItem*>* ours = [NSMutableArray new];
  NSMutableSet<NSString*>* seen = [NSMutableSet new];
  for (NSMenuItem* x in all) {
    if (x.isSeparatorItem) { if (ours.count && !ours.lastObject.isSeparatorItem) [ours addObject:x]; continue; }
    if (!x.representedObject) continue;   // added by the system (Start Dictation, AutoFill...)
    NSString* ident = x.representedObject;
    if (ident.length) { if ([seen containsObject:ident]) continue; [seen addObject:ident]; }   // the system may add a copy of an item it treats specially (Enter Full Screen)
    [ours addObject:ident.length && gMenuItems[ident] ? gMenuItems[ident] : x];
  }
  while (ours.count && ours.lastObject.isSeparatorItem) [ours removeLastObject];
  NSUInteger count = ours.count;
  for (NSUInteger idx = 0; idx < count; idx++) {
    NSMenuItem* it = ours[idx];
    if (it.isSeparatorItem) { [out appendFormat:@"%*s----\n", depth * 2, ""]; continue; }
    NSMutableString* line = [NSMutableString stringWithFormat:@"%*s%@", depth * 2, "", it.title];
    NSString* declared = [it.representedObject length] ? gDeclared[it.representedObject] : nil;
    if (declared) [line appendFormat:@"  [%@]", declared];
    else if (it.keyEquivalent.length && ![it.representedObject length]) {   // an item without an id: read the key from the menu
      NSEventModifierFlags f = it.keyEquivalentModifierMask;
      NSMutableString* k = [NSMutableString new];
      if (f & NSEventModifierFlagControl) [k appendString:@"Ctrl+"];
      if (f & NSEventModifierFlagOption) [k appendString:@"Alt+"];
      if (f & NSEventModifierFlagShift) [k appendString:@"Shift+"];
      if (f & NSEventModifierFlagCommand) [k appendString:@"Cmd+"];
      [k appendString:it.keyEquivalent.uppercaseString];
      [line appendFormat:@"  [%@]", k];
    }
    if (!it.enabled) [line appendString:@"  (disabled)"];
    if (it.state == NSControlStateValueOn) [line appendString:@"  (checked)"];
    if ([it.representedObject length]) [line appendFormat:@"  {%@}", it.representedObject];
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
  ensureApp();
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
  ensureApp();
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

// ---------------------------------------------------------------- tray (ZN-238): NSStatusItem
static NSMutableDictionary<NSString*, NSStatusItem*>* gTrays;
static NSMutableDictionary<NSString*, NSNumber*>* gTrayMenuOnLeft;
static NSMutableDictionary<NSString*, NSNumber*>* gTrayTemplate;

static NSImage* trayImage(NSString* path, BOOL template_) {
  NSImage* img = path.length ? [[NSImage alloc] initWithContentsOfFile:path] : nil;
  if (!img) {   // no icon (or unreadable): a plain dot, so the item is visible and the template path is still exercised
    img = [NSImage imageWithSize:NSMakeSize(18, 18) flipped:NO drawingHandler:^BOOL(NSRect r) { [[NSColor blackColor] set]; [[NSBezierPath bezierPathWithOvalInRect:NSInsetRect(r, 4, 4)] fill]; return YES; }];
  }
  if (img.size.height > 22) { NSSize s = img.size; img.size = NSMakeSize(s.width * 18.0 / s.height, 18); }   // the menu bar is 22 pt high
  [img setTemplate:(template_ || [path hasSuffix:@"Template.png"])];
  return img;
}

@interface ZnTrayTarget : NSObject
- (void)znTrayClicked:(NSStatusBarButton*)button;
@end
@implementation ZnTrayTarget
- (void)znTrayClicked:(NSStatusBarButton*)button {
  NSString* ident = nil;
  for (NSString* k in gTrays) if (gTrays[k].button == button) ident = k;
  if (!ident) return;
  NSEvent* e = NSApp.currentEvent;
  BOOL right = e && (e.type == NSEventTypeRightMouseUp || e.type == NSEventTypeRightMouseDown);
  BOOL dbl = e && e.clickCount >= 2;
  NSStatusItem* item = gTrays[ident];
  if (right && item.menu == nil && ![gTrayMenuOnLeft[ident] boolValue]) { /* a right click opens the menu below */ }
  pushEvent(@"tray-click", @[right ? @"right" : @"left", dbl ? @"1" : @"0", ident]);
}
@end
static ZnTrayTarget* trayTarget() { static ZnTrayTarget* t; static dispatch_once_t once; dispatch_once(&once, ^{ t = [ZnTrayTarget new]; gTrays = [NSMutableDictionary new]; gTrayMenuOnLeft = [NSMutableDictionary new]; gTrayTemplate = [NSMutableDictionary new]; }); return t; }

static void applyTray(NSString* ident, NSDictionary* a) {
  NSStatusItem* item = gTrays[ident];
  if (!item) { item = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength]; gTrays[ident] = item; item.button.target = trayTarget(); item.button.action = @selector(znTrayClicked:); [item.button sendActionOn:NSEventMaskLeftMouseUp | NSEventMaskRightMouseUp]; }
  if (a[@"template"]) gTrayTemplate[ident] = a[@"template"];
  if (a[@"icon"] || !item.button.image) item.button.image = trayImage(a[@"icon"] ?: @"", gTrayTemplate[ident] ? [gTrayTemplate[ident] boolValue] : YES);
  if (a[@"title"]) item.button.title = a[@"title"];
  if (a[@"tooltip"]) item.button.toolTip = a[@"tooltip"];
  if (a[@"menuOnLeftClick"]) gTrayMenuOnLeft[ident] = a[@"menuOnLeftClick"];
  if (a[@"menu"]) {
    NSMenu* m = buildMenu(a[@"menu"], @"", 2);   // tag 2: items report source 'tray'
    item.menu = [gTrayMenuOnLeft[ident] boolValue] || !gTrayMenuOnLeft[ident] ? m : nil;   // a menu set on the item opens on the left click; otherwise it would swallow the click event
    objc_setAssociatedObject(item, "znMenu", m, OBJC_ASSOCIATION_RETAIN);
  }
}

static int trayCall(const char* op, NSDictionary* a, char* out, int cap) {
  ensureApp();
  trayTarget();
  NSString* result = nil;
  NSString* ident = a[@"id"] ?: @"";
  if (!strcmp(op, "tray.available")) result = @"{\"available\":true}";
  else if (!strcmp(op, "tray.create")) { applyTray(ident, a); result = @"{}"; }
  else if (!strcmp(op, "tray.update")) { NSDictionary* p = a[@"props"]; if (gTrays[ident] && p) applyTray(ident, p); result = @"{}"; }
  else if (!strcmp(op, "tray.remove")) { NSStatusItem* it = gTrays[ident]; if (it) { [[NSStatusBar systemStatusBar] removeStatusItem:it]; [gTrays removeObjectForKey:ident]; } result = @"{}"; }
  else if (!strcmp(op, "tray.click")) {
    NSStatusItem* it = gTrays[ident];
    if (it) {
      if ([a[@"button"] isEqualToString:@"right"]) { pushEvent(@"tray-click", @[@"right", @"0", ident]); }
      else [it.button performClick:nil];
    }
    result = json(@{@"ok": @(it != nil)});
  } else if (!strcmp(op, "tray.dump")) {
    NSMutableArray* list = [NSMutableArray new];
    for (NSString* k in [gTrays.allKeys sortedArrayUsingSelector:@selector(compare:)]) {
      NSStatusItem* it = gTrays[k];
      NSMenu* m = it.menu ?: objc_getAssociatedObject(it, "znMenu");
      NSMutableString* text = [NSMutableString new];
      if (m) dumpMenu(m, 0, text);
      NSSize sz = it.button.image.size;
      [list addObject:@{@"id": k, @"template": @([it.button.image isTemplate]), @"width": @(sz.width), @"height": @(sz.height), @"title": it.button.title ?: @"", @"tooltip": it.button.toolTip ?: @"", @"menu": text, @"x": @(it.button.window.frame.origin.x), @"y": @(it.button.window.frame.origin.y), @"w": @(it.button.window.frame.size.width), @"h": @(it.button.window.frame.size.height), @"visible": @(it.isVisible), @"pumps": @(gPumps)}];
    }
    result = json(@{@"trays": list});
  }
  if (!result) return 0;
  snprintf(out, (size_t)cap, "%s", result.UTF8String);
  return 1;
}

// ---------------------------------------------------------------- dialogs (ZN-239): NSOpenPanel, NSSavePanel, NSAlert, modal (the frames of the app wait while a dialog is open)
extern "C" void zn_host_fs_grant(const char*) __attribute__((weak));   // src/host/sys_host.cpp: a picked path joins the fs scope

static void armAbort(NSDictionary* a) {   // test hook: end the modal session by itself, so a selftest can open a dialog without a person
  double ms = [a[@"abortMs"] doubleValue];
  if (ms > 0) [NSApp performSelector:@selector(abortModal) withObject:nil afterDelay:ms / 1000.0 inModes:@[NSModalPanelRunLoopMode]];
}
static void applyFilters(NSSavePanel* panel, NSArray* filters) {
  NSMutableArray* exts = [NSMutableArray new];
  for (NSDictionary* f in filters) for (NSString* e in f[@"extensions"]) [exts addObject:e];
  if (exts.count) panel.allowedFileTypes = exts;
}
static int dialogCall(const char* op, NSDictionary* a, char* out, int cap) {
  ensureApp();
  NSString* result = nil;
  [NSApp activateIgnoringOtherApps:YES];
  if (!strcmp(op, "dialog.open")) {
    NSOpenPanel* p = [NSOpenPanel openPanel];
    p.canChooseFiles = ![a[@"directory"] boolValue]; p.canChooseDirectories = [a[@"directory"] boolValue]; p.allowsMultipleSelection = [a[@"multiple"] boolValue];
    if ([a[@"title"] length]) p.title = a[@"title"];
    if ([a[@"defaultPath"] length]) p.directoryURL = [NSURL fileURLWithPath:a[@"defaultPath"]];
    applyFilters(p, a[@"filters"]);
    armAbort(a);
    NSModalResponse r = [p runModal];
    NSMutableArray* paths = [NSMutableArray new];
    if (r == NSModalResponseOK) for (NSURL* u in p.URLs) { [paths addObject:u.path]; if (zn_host_fs_grant) zn_host_fs_grant(u.path.UTF8String); }
    result = json(@{@"paths": paths.count ? (id)paths : (id)[NSNull null]});
  } else if (!strcmp(op, "dialog.save")) {
    NSSavePanel* p = [NSSavePanel savePanel];
    if ([a[@"title"] length]) p.title = a[@"title"];
    if ([a[@"defaultPath"] length]) { p.directoryURL = [NSURL fileURLWithPath:[a[@"defaultPath"] stringByDeletingLastPathComponent]]; p.nameFieldStringValue = [a[@"defaultPath"] lastPathComponent]; }
    applyFilters(p, a[@"filters"]);
    armAbort(a);
    NSModalResponse r = [p runModal];
    if (r == NSModalResponseOK && p.URL) { if (zn_host_fs_grant) zn_host_fs_grant(p.URL.path.UTF8String); result = json(@{@"path": p.URL.path}); }
    else result = @"{\"path\":null}";
  } else if (!strcmp(op, "dialog.message")) {
    NSAlert* al = [NSAlert new];
    NSString* kind = a[@"kind"];
    al.alertStyle = [kind isEqualToString:@"error"] ? NSAlertStyleCritical : ([kind isEqualToString:@"warning"] ? NSAlertStyleWarning : NSAlertStyleInformational);
    al.messageText = [a[@"title"] length] ? a[@"title"] : a[@"message"];
    al.informativeText = [a[@"title"] length] ? (a[@"message"] ?: @"") : (a[@"detail"] ?: @"");
    for (NSString* b in a[@"buttons"] ?: @[@"OK"]) [al addButtonWithTitle:b];
    armAbort(a);
    NSModalResponse r = [al runModal];
    result = json(@{@"button": @(r >= NSAlertFirstButtonReturn ? (int)(r - NSAlertFirstButtonReturn) : -1)});
  }
  if (!result) return 0;
  snprintf(out, (size_t)cap, "%s", result.UTF8String);
  return 1;
}

// ---------------------------------------------------------------- window (ZN-240): the NSWindow SDL created
static NSWindow* appWindow() {
  for (NSWindow* w in NSApp.windows) if (w.level == NSNormalWindowLevel || w.level == NSFloatingWindowLevel) if (w.canBecomeMainWindow || w.styleMask & NSWindowStyleMaskTitled) return w;
  return nil;
}
static NSPoint gTrafficLights = NSMakePoint(-1, -1);
@interface ZnWindowWatcher : NSObject
@end
@implementation ZnWindowWatcher
- (void)changed:(NSNotification*)n {
  NSWindow* w = n.object;
  if (gTrafficLights.x >= 0) {
    NSView* bar = [w standardWindowButton:NSWindowCloseButton].superview;
    NSArray<NSNumber*>* kinds = @[@(NSWindowCloseButton), @(NSWindowMiniaturizeButton), @(NSWindowZoomButton)];
    CGFloat x = gTrafficLights.x;
    for (NSNumber* k in kinds) {
      NSButton* b = [w standardWindowButton:(NSWindowButton)k.integerValue];
      NSRect f = b.frame; f.origin.x = x; f.origin.y = bar.frame.size.height - gTrafficLights.y - f.size.height; b.frame = f; x += f.size.width + 6;
    }
  }
  NSString* what = [n.name isEqualToString:NSWindowDidMoveNotification] ? @"moved" : ([n.name isEqualToString:NSWindowDidResizeNotification] ? @"resized" : @"fullscreen");
  NSRect fr = w.frame;
  if ([what isEqualToString:@"fullscreen"]) pushEvent(@"window", @[what, [w styleMask] & NSWindowStyleMaskFullScreen ? @"on" : @"off"]);
  else pushEvent(@"window", @[what, [NSString stringWithFormat:@"%d", (int)(what.length == 5 ? fr.origin.x : fr.size.width)], [NSString stringWithFormat:@"%d", (int)(what.length == 5 ? fr.origin.y : fr.size.height)]]);
}
@end
static void watchWindow(NSWindow* w) {
  static ZnWindowWatcher* wt; static NSWindow* watched;
  if (watched == w) return;
  watched = w;
  if (!wt) wt = [ZnWindowWatcher new];
  for (NSNotificationName n in @[NSWindowDidMoveNotification, NSWindowDidResizeNotification, NSWindowDidEnterFullScreenNotification, NSWindowDidExitFullScreenNotification])
    [[NSNotificationCenter defaultCenter] addObserver:wt selector:@selector(changed:) name:n object:w];
}
static int windowCall(const char* op, NSDictionary* a, char* out, int cap) {
  ensureApp();
  NSString* result = nil;
  NSWindow* w = appWindow();
  if (!strcmp(op, "window.dataDir")) {
    NSString* dir = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES).firstObject stringByAppendingPathComponent:[[NSBundle mainBundle] bundleIdentifier] ?: @"zinc"];
    result = json(@{@"path": dir});
  } else if (!strcmp(op, "window.state")) {
    NSMutableArray* displays = [NSMutableArray new];
    for (NSScreen* sc in NSScreen.screens) { NSRect f = sc.frame; [displays addObject:@{@"x": @(f.origin.x), @"y": @(f.origin.y), @"w": @(f.size.width), @"h": @(f.size.height)}]; }
    NSRect f = w ? w.frame : NSZeroRect;
    result = json(@{@"x": @(f.origin.x), @"y": @(f.origin.y), @"w": @(f.size.width), @"h": @(f.size.height), @"maximized": @(w && w.isZoomed), @"fullscreen": @(w && (w.styleMask & NSWindowStyleMaskFullScreen) != 0), @"displays": displays});
  } else if (!w) result = @"{\"error\":{\"code\":\"failed\",\"message\":\"the program has no window\"}}";
  else {
    watchWindow(w);
    if (!strcmp(op, "window.setTitle")) w.title = a[@"title"] ?: @"";
    else if (!strcmp(op, "window.setSize")) { NSRect f = w.frame; f.size = NSMakeSize([a[@"w"] doubleValue], [a[@"h"] doubleValue]); [w setFrame:f display:YES]; }
    else if (!strcmp(op, "window.setPosition")) [w setFrameOrigin:NSMakePoint([a[@"x"] doubleValue], [a[@"y"] doubleValue])];
    else if (!strcmp(op, "window.center")) [w center];
    else if (!strcmp(op, "window.setAlwaysOnTop")) w.level = [a[@"on"] boolValue] ? NSFloatingWindowLevel : NSNormalWindowLevel;
    else if (!strcmp(op, "window.setOpacity")) w.alphaValue = [a[@"value"] doubleValue];
    else if (!strcmp(op, "window.setMinSize")) w.minSize = NSMakeSize([a[@"w"] doubleValue], [a[@"h"] doubleValue]);
    else if (!strcmp(op, "window.setFullscreen")) { BOOL now = (w.styleMask & NSWindowStyleMaskFullScreen) != 0; if (now != [a[@"on"] boolValue]) [w toggleFullScreen:nil]; }
    else if (!strcmp(op, "window.maximize")) { if (!w.isZoomed) [w zoom:nil]; }
    else if (!strcmp(op, "window.minimize")) [w miniaturize:nil];
    else if (!strcmp(op, "window.hide")) [w orderOut:nil];
    else if (!strcmp(op, "window.show")) { [w makeKeyAndOrderFront:nil]; [NSApp activateIgnoringOtherApps:YES]; }
    else if (!strcmp(op, "window.focus")) { [w makeKeyAndOrderFront:nil]; [NSApp activateIgnoringOtherApps:YES]; }
    else if (!strcmp(op, "window.setTitleBar")) {
      NSString* st = a[@"style"];
      BOOL none = [st isEqualToString:@"none"], overlay = [st isEqualToString:@"overlay"], hidden = [st isEqualToString:@"hidden"];
      w.titlebarAppearsTransparent = overlay || hidden;
      w.titleVisibility = (hidden || overlay) ? NSWindowTitleHidden : NSWindowTitleVisible;
      NSWindowStyleMask m = w.styleMask;
      if (overlay) m |= NSWindowStyleMaskFullSizeContentView; else m &= ~NSWindowStyleMaskFullSizeContentView;
      if (none) m = (m & ~NSWindowStyleMaskTitled) | NSWindowStyleMaskBorderless; else m |= NSWindowStyleMaskTitled;
      w.styleMask = m;
    }
    else if (!strcmp(op, "window.setTrafficLights")) { gTrafficLights = NSMakePoint([a[@"x"] doubleValue], [a[@"y"] doubleValue]); [[NSNotificationCenter defaultCenter] postNotificationName:NSWindowDidResizeNotification object:w]; }
    else if (!strcmp(op, "window.dump")) {
      NSButton* close = [w standardWindowButton:NSWindowCloseButton];
      NSButton* zoom = [w standardWindowButton:NSWindowZoomButton];
      result = json(@{@"text": [NSString stringWithFormat:@"title %@\nopacity %.2f\ntitlebarTransparent %d\ntitleVisible %d\nfullSizeContent %d\ntitled %d\nalwaysOnTop %d\nclose %.0f,%.0f\nzoom %.0f,%.0f\nfullscreen %d\n", w.title, w.alphaValue, w.titlebarAppearsTransparent, w.titleVisibility == NSWindowTitleVisible, (w.styleMask & NSWindowStyleMaskFullSizeContentView) != 0, (w.styleMask & NSWindowStyleMaskTitled) != 0, w.level == NSFloatingWindowLevel, close.frame.origin.x, [close superview].frame.size.height - close.frame.origin.y - close.frame.size.height, zoom.frame.origin.x, [zoom superview].frame.size.height - zoom.frame.origin.y - zoom.frame.size.height, (w.styleMask & NSWindowStyleMaskFullScreen) != 0]});
    }
    if (!result) result = @"{}";
  }
  if (!result) return 0;
  snprintf(out, (size_t)cap, "%s", result.UTF8String);
  return 1;
}

// ---------------------------------------------------------------- global shortcuts (ZN-241): Carbon RegisterEventHotKey, no Accessibility permission
static NSMutableDictionary<NSNumber*, NSString*>* gHotkeyNames;   // hotkey id -> canonical accelerator
static NSMutableDictionary<NSString*, NSValue*>* gHotkeyRefs;
static EventHandlerRef gHotkeyHandler;
static OSStatus hotkeyPressed(EventHandlerCallRef, EventRef ev, void*) {
  EventHotKeyID hid;
  GetEventParameter(ev, kEventParamDirectObject, typeEventHotKeyID, nullptr, sizeof hid, nullptr, &hid);
  NSString* acc = gHotkeyNames[@(hid.id)];
  if (acc) pushEvent(@"shortcut", @[acc]);
  return noErr;
}
static int keyCodeOf(NSString* key) {   // the ANSI virtual key codes (HIToolbox Events.h)
  static NSDictionary* map = @{@"A": @0, @"S": @1, @"D": @2, @"F": @3, @"H": @4, @"G": @5, @"Z": @6, @"X": @7, @"C": @8, @"V": @9, @"B": @11, @"Q": @12, @"W": @13, @"E": @14, @"R": @15, @"Y": @16, @"T": @17,
    @"1": @18, @"2": @19, @"3": @20, @"4": @21, @"6": @22, @"5": @23, @"Equal": @24, @"9": @25, @"7": @26, @"Minus": @27, @"8": @28, @"0": @29, @"BracketRight": @30, @"O": @31, @"U": @32, @"BracketLeft": @33, @"I": @34, @"P": @35,
    @"Enter": @36, @"L": @37, @"J": @38, @"Quote": @39, @"K": @40, @"Semicolon": @41, @"Backslash": @42, @"Comma": @43, @"Slash": @44, @"N": @45, @"M": @46, @"Period": @47, @"Tab": @48, @"Space": @49, @"Backquote": @50,
    @"Backspace": @51, @"Escape": @53, @"Delete": @117, @"Home": @115, @"End": @119, @"PageUp": @116, @"PageDown": @121, @"Left": @123, @"Right": @124, @"Down": @125, @"Up": @126,
    @"F1": @122, @"F2": @120, @"F3": @99, @"F4": @118, @"F5": @96, @"F6": @97, @"F7": @98, @"F8": @100, @"F9": @101, @"F10": @109, @"F11": @103, @"F12": @111, @"F13": @105, @"F14": @107, @"F15": @113, @"F16": @106, @"F17": @64, @"F18": @79, @"F19": @80, @"F20": @90};
  NSNumber* n = map[key];
  return n ? n.intValue : -1;
}
static int shortcutCall(const char* op, NSDictionary* a, char* out, int cap) {
  NSString* result = nil;
  if (!gHotkeyNames) { gHotkeyNames = [NSMutableDictionary new]; gHotkeyRefs = [NSMutableDictionary new]; }
  NSString* acc = a[@"accelerator"] ?: @"";
  if (!strcmp(op, "shortcut.register")) {
    int code = keyCodeOf(a[@"key"] ?: @"");
    if (code < 0) result = @"{\"status\":\"unsupported\"}";
    else if (gHotkeyRefs[acc]) result = @"{\"status\":\"conflict\"}";
    else {
      if (!gHotkeyHandler) { EventTypeSpec spec = {kEventClassKeyboard, kEventHotKeyPressed}; InstallApplicationEventHandler(&hotkeyPressed, 1, &spec, nullptr, &gHotkeyHandler); }
      UInt32 mods = ([a[@"meta"] boolValue] ? cmdKey : 0) | ([a[@"shift"] boolValue] ? shiftKey : 0) | ([a[@"alt"] boolValue] ? optionKey : 0) | ([a[@"ctrl"] boolValue] ? controlKey : 0);
      static UInt32 nextId = 1;
      EventHotKeyID hid = {'znsc', nextId++};
      EventHotKeyRef ref = nullptr;
      OSStatus st = RegisterEventHotKey((UInt32)code, mods, hid, GetApplicationEventTarget(), 0, &ref);
      if (st == noErr) { gHotkeyNames[@(hid.id)] = acc; gHotkeyRefs[acc] = [NSValue valueWithPointer:ref]; result = @"{\"status\":\"ok\"}"; }
      else result = st == eventHotKeyExistsErr ? @"{\"status\":\"conflict\"}" : @"{\"status\":\"denied\"}";
    }
  } else if (!strcmp(op, "shortcut.unregister")) {
    NSValue* v = gHotkeyRefs[acc];
    if (v) { UnregisterEventHotKey((EventHotKeyRef)v.pointerValue); [gHotkeyRefs removeObjectForKey:acc]; for (NSNumber* k in [gHotkeyNames allKeysForObject:acc]) [gHotkeyNames removeObjectForKey:k]; }
    result = @"{}";
  } else if (!strcmp(op, "shortcut.fire")) {   // selftest: the same path a hotkey press takes after the OS delivered it (posting a real key press needs Accessibility permission)
    BOOL known = gHotkeyRefs[acc] != nil;
    if (known) pushEvent(@"shortcut", @[acc]);
    result = json(@{@"ok": @(known)});
  }
  if (!result) return 0;
  snprintf(out, (size_t)cap, "%s", result.UTF8String);
  return 1;
}

// ---------------------------------------------------------------- deep links, file open, opener (ZN-243)

@interface ZnUrlHandler : NSObject
- (void)handleURL:(NSAppleEventDescriptor*)e withReply:(NSAppleEventDescriptor*)r;
@end
@implementation ZnUrlHandler
- (void)handleURL:(NSAppleEventDescriptor*)e withReply:(NSAppleEventDescriptor*)r {
  NSString* url = [[e paramDescriptorForKeyword:keyDirectObject] stringValue];
  if (!url) return;
  [gStartUrls addObject:url];
  pushEvent(@"open-url", @[url]);
}
@end
static void installUrlHandler() {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    gStartUrls = [NSMutableArray new];
    static ZnUrlHandler* h; h = [ZnUrlHandler new];
    [[NSAppleEventManager sharedAppleEventManager] setEventHandler:h andSelector:@selector(handleURL:withReply:) forEventClass:kInternetEventClass andEventID:kAEGetURL];   // before the first event is served: a cold start delivers it right after launch
  });
}
static void openFilesIMP(id, SEL, NSApplication*, NSArray<NSString*>* files) { pushEvent(@"open-file", files); }
static int linkCall(const char* op, NSDictionary* a, char* out, int cap) {
  ensureApp();
  installUrlHandler();
  NSString* result = nil;
  if (!strcmp(op, "deep-link.getCurrent")) {
    static BOOL waited;
    if (!waited) {   // a cold start (launched by launchd, not from a terminal) delivers the URL right after launch: serve AppKit's queue for a moment so current() already has it
      waited = YES;
      NSDate* until = [NSDate dateWithTimeIntervalSinceNow:getppid() == 1 ? 2.0 : 0.0];
      while (gStartUrls.count == 0 && [until timeIntervalSinceNow] > 0) { NSEvent* e = [NSApp nextEventMatchingMask:NSEventMaskAny untilDate:[NSDate dateWithTimeIntervalSinceNow:0.05] inMode:NSDefaultRunLoopMode dequeue:YES]; if (e) [NSApp sendEvent:e]; }
    }
    result = json(@{@"urls": gStartUrls});
  }
  else if (!strcmp(op, "opener.open")) {
    NSString* t = a[@"target"] ?: @"";
    NSURL* u = [t containsString:@"://"] || [t hasPrefix:@"mailto:"] ? [NSURL URLWithString:t] : [NSURL fileURLWithPath:t];
    BOOL ok = u && [[NSWorkspace sharedWorkspace] openURL:u];
    result = ok ? @"{}" : @"{\"error\":{\"code\":\"failed\",\"message\":\"the system could not open it\"}}";
  } else if (!strcmp(op, "opener.reveal")) {
    NSString* p = a[@"path"] ?: @"";
    if ([[NSFileManager defaultManager] fileExistsAtPath:p]) [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[[NSURL fileURLWithPath:p]]];
    result = @"{}";
  }
  if (!result) return 0;
  snprintf(out, (size_t)cap, "%s", result.UTF8String);
  return 1;
}

// ---------------------------------------------------------------- power, idle, appearance, clipboard (ZN-244)
static void postPower(NSString* e) { pushEvent(@"power", @[e]); }
static void installPowerObservers() {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSNotificationCenter* ws = [NSWorkspace sharedWorkspace].notificationCenter;
    [ws addObserverForName:NSWorkspaceWillSleepNotification object:nil queue:nil usingBlock:^(NSNotification*) { postPower(@"suspend"); }];
    [ws addObserverForName:NSWorkspaceDidWakeNotification object:nil queue:nil usingBlock:^(NSNotification*) { postPower(@"resume"); }];
    NSDistributedNotificationCenter* dc = [NSDistributedNotificationCenter defaultCenter];
    [dc addObserverForName:@"com.apple.screenIsLocked" object:nil queue:nil usingBlock:^(NSNotification*) { postPower(@"lock"); }];
    [dc addObserverForName:@"com.apple.screenIsUnlocked" object:nil queue:nil usingBlock:^(NSNotification*) { postPower(@"unlock"); }];
    [dc addObserverForName:@"AppleInterfaceThemeChangedNotification" object:nil queue:nil usingBlock:^(NSNotification*) {
      NSString* mode = [[NSUserDefaults standardUserDefaults] stringForKey:@"AppleInterfaceStyle"] ? @"dark" : @"light";
      pushEvent(@"appearance", @[mode]);
    }];
  });
}
static BOOL isDarkNow() { return [[[NSUserDefaults standardUserDefaults] stringForKey:@"AppleInterfaceStyle"] isEqualToString:@"Dark"]; }
static NSMutableDictionary<NSNumber*, NSNumber*>* gAssertions;
static int powerCall(const char* op, NSDictionary* a, char* out, int cap) {
  NSString* result = nil;
  installPowerObservers();
  if (!strcmp(op, "power.battery")) {
    CFTypeRef info = IOPSCopyPowerSourcesInfo();
    NSArray* list = info ? CFBridgingRelease(IOPSCopyPowerSourcesList(info)) : nil;
    NSDictionary* found = nil;
    for (id src in list) { NSDictionary* d = CFBridgingRelease(CFRetain(IOPSGetPowerSourceDescription(info, (__bridge CFTypeRef)src))); if ([d[@kIOPSTypeKey] isEqual:@kIOPSInternalBatteryType]) found = d; }
    if (info) CFRelease(info);
    if (!found) result = json(@{@"present": @NO, @"percent": @100, @"charging": @YES});
    else {
      double cur = [found[@kIOPSCurrentCapacityKey] doubleValue], max = [found[@kIOPSMaxCapacityKey] doubleValue];
      result = json(@{@"present": @YES, @"percent": @(max > 0 ? (int)(cur * 100 / max + 0.5) : 0), @"charging": @([found[@kIOPSIsChargingKey] boolValue] || [found[@kIOPSPowerSourceStateKey] isEqual:@kIOPSACPowerValue])});
    }
  } else if (!strcmp(op, "power.idleSeconds")) result = json(@{@"seconds": @((int)CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateCombinedSessionState, kCGAnyInputEventType))});
  else if (!strcmp(op, "power.appearance")) result = json(@{@"dark": @(isDarkNow())});
  else if (!strcmp(op, "power.preventSleep")) {
    IOPMAssertionID id = 0;
    CFStringRef type = [a[@"kind"] isEqualToString:@"display"] ? kIOPMAssertionTypePreventUserIdleDisplaySleep : kIOPMAssertionTypePreventUserIdleSystemSleep;
    IOReturn r = IOPMAssertionCreateWithName(type, kIOPMAssertionLevelOn, (__bridge CFStringRef)([a[@"reason"] length] ? a[@"reason"] : @"zinc"), &id);
    if (r != kIOReturnSuccess) result = @"{\"error\":{\"code\":\"failed\",\"message\":\"IOPMAssertionCreateWithName failed\"}}";
    else { if (!gAssertions) gAssertions = [NSMutableDictionary new]; gAssertions[@(id)] = @(id); result = json(@{@"token": @(id)}); }
  } else if (!strcmp(op, "power.release")) {
    NSNumber* t = a[@"token"];
    if (t && gAssertions[t]) { IOPMAssertionRelease((IOPMAssertionID)t.unsignedIntValue); [gAssertions removeObjectForKey:t]; }
    result = @"{}";
  } else if (!strcmp(op, "power.simulate")) {   // selftest: the notification the system would post, through the same observers
    NSString* e = a[@"event"] ?: @"";
    NSNotificationCenter* ws = [NSWorkspace sharedWorkspace].notificationCenter;
    if ([e isEqualToString:@"suspend"]) [ws postNotificationName:NSWorkspaceWillSleepNotification object:nil];
    else if ([e isEqualToString:@"resume"]) [ws postNotificationName:NSWorkspaceDidWakeNotification object:nil];
    else if ([e isEqualToString:@"lock"] || [e isEqualToString:@"unlock"]) postPower(e);   // the distributed lock notifications are not delivered back to the posting process
    result = @"{\"ok\":true}";
  }
  if (!result) return 0;
  snprintf(out, (size_t)cap, "%s", result.UTF8String);
  return 1;
}
static int clipboardCall(const char* op, NSDictionary* a, char* out, int cap) {
  NSPasteboard* pb = [NSPasteboard generalPasteboard];
  NSString* result = nil;
  if (!strcmp(op, "clipboard.writeRich")) {
    [pb clearContents];
    [pb setString:a[@"text"] ?: @"" forType:NSPasteboardTypeString];
    if ([a[@"html"] length]) [pb setString:a[@"html"] forType:NSPasteboardTypeHTML];
    result = @"{}";
  } else if (!strcmp(op, "clipboard.readRich")) result = json(@{@"text": [pb stringForType:NSPasteboardTypeString] ?: @"", @"html": [pb stringForType:NSPasteboardTypeHTML] ?: @""});
  else if (!strcmp(op, "clipboard.writeImage")) {
    NSData* png = [[NSData alloc] initWithBase64EncodedString:a[@"png"] ?: @"" options:0];
    [pb clearContents];
    if (png) [pb setData:png forType:NSPasteboardTypePNG];
    result = @"{}";
  } else if (!strcmp(op, "clipboard.readImage")) {
    NSData* png = [pb dataForType:NSPasteboardTypePNG];
    if (!png) { NSData* tiff = [pb dataForType:NSPasteboardTypeTIFF]; if (tiff) png = [[[NSBitmapImageRep alloc] initWithData:tiff] representationUsingType:NSBitmapImageFileTypePNG properties:@{}]; }
    result = json(@{@"png": png ? [png base64EncodedStringWithOptions:0] : @""});
  } else if (!strcmp(op, "clipboard.writeFiles")) {
    NSMutableArray* urls = [NSMutableArray new];
    for (NSString* p in a[@"paths"]) [urls addObject:[NSURL fileURLWithPath:p]];
    [pb clearContents];
    [pb writeObjects:urls];
    result = @"{}";
  } else if (!strcmp(op, "clipboard.readFiles")) {
    NSMutableArray* paths = [NSMutableArray new];
    for (NSURL* u in [pb readObjectsForClasses:@[[NSURL class]] options:@{NSPasteboardURLReadingFileURLsOnlyKey: @YES}] ?: @[]) [paths addObject:u.path];
    result = json(@{@"paths": paths});
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
    if (!strncmp(op, "power.", 6)) { @try { return powerCall(op, a, out, cap); } @catch (NSException* e) { return 0; } }
    if (!strncmp(op, "clipboard.", 10)) { @try { return clipboardCall(op, a, out, cap); } @catch (NSException* e) { return 0; } }
    if (!strncmp(op, "shortcut.", 9)) return shortcutCall(op, a, out, cap);
    if (!strcmp(op, "deep-link.getCurrent") || !strcmp(op, "opener.open") || !strcmp(op, "opener.reveal")) { @try { return linkCall(op, a, out, cap); } @catch (NSException* e) { return 0; } }
    if (!strncmp(op, "window.", 7) && strcmp(op, "window.confirmClose")) {
      @try { return windowCall(op, a, out, cap); }
      @catch (NSException* e) { snprintf(out, (size_t)cap, "{\"error\":{\"code\":\"failed\",\"message\":\"%s\"}}", [e.reason stringByReplacingOccurrencesOfString:@"\"" withString:@"'"].UTF8String); return 1; }
    }
    if (!strncmp(op, "dialog.", 7)) {
      @try { return dialogCall(op, a, out, cap); }
      @catch (NSException* e) { snprintf(out, (size_t)cap, "{\"error\":{\"code\":\"failed\",\"message\":\"%s\"}}", [e.reason stringByReplacingOccurrencesOfString:@"\"" withString:@"'"].UTF8String); return 1; }
    }
    if (!strncmp(op, "tray.", 5)) {
      @try { return trayCall(op, a, out, cap); }
      @catch (NSException* e) { snprintf(out, (size_t)cap, "{\"error\":{\"code\":\"failed\",\"message\":\"%s\"}}", [e.reason stringByReplacingOccurrencesOfString:@"\"" withString:@"'"].UTF8String); return 1; }
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

/** A program without a window of its own (a tray-only app, a console program with a menu) has nobody serving AppKit's event queue: status items, menus and the dock would stay frozen.
 *  Called each loop turn; does nothing when a window exists (SDL pumps then). */
int zn_sys_macos_pump(void) {
  @autoreleasepool {
    gPumps++;
    if ((!gTrays || gTrays.count == 0) && !gDockMenu && !gStartUrls && !(NSApp && NSApp.mainMenu)) return 0;
    for (NSWindow* w in NSApp.windows) if (w.level == NSNormalWindowLevel) return 0;   // an app window exists: its own loop (SDL) serves AppKit; status item windows do not count
    for (int i = 0; i < 50; i++) {
      NSEvent* e = [NSApp nextEventMatchingMask:NSEventMaskAny untilDate:(i == 0 ? [NSDate dateWithTimeIntervalSinceNow:0.004] : nil) inMode:NSDefaultRunLoopMode dequeue:YES];   // the first call waits a moment: the run loop sources that place the status item need to run
      if (!e) break;
      [NSApp sendEvent:e];
    }
    return 1;   // the loop must keep turning: AppKit needs its events served between timers
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
