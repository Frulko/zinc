// zinc:system on macOS (ZN-235): notifications through UNUserNotificationCenter when the process has a bundle id (a dev bundle counts, section 5.1 of the report) and through
// `osascript` otherwise. A plain C interface for system.host.cpp, which cannot include Foundation next to zrt.h. Events come from the delegate on a system thread: they wait in a queue
// that the host drains in poll().
#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>
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

extern "C" {

/** Answers a notification op; 1 when handled (out holds the JSON result), 0 for an op this backend does not do. */
int zn_sys_macos_call(const char* op, const char* args, char* out, int cap) {
  @autoreleasepool {
    ensureQueue();
    if (strncmp(op, "notification.", 13) != 0) return 0;
    NSDictionary* a = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:args length:strlen(args)] options:0 error:nil] ?: @{};
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
