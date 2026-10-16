// zinc:system on iOS (ZN-628): what a phone has of the op table (ops.json): local notifications (UNUserNotificationCenter), the share sheet
// (UIActivityViewController), opening a URL (UIApplication openURL), the document and photo pickers (UIDocumentPickerViewController,
// PHPickerViewController: no photo library permission, the picker runs out of process). The other ops keep the simulator's answer.
// Deep links reach system.host.cpp as dropped URLs (ZN_SYSTEM_URL_DROPS). A plain C interface for system.host.cpp, which cannot include
// Foundation next to zrt.h. Everything runs on the main thread, the program's; events wait in a queue the host drains in poll().
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <PhotosUI/PhotosUI.h>
#include <string.h>

static NSMutableArray<NSString*>* gEvents;
static int gPending = 0;   // pickers open: the loop stays alive for their answer

static void pushEvent(NSString* type, NSArray* args) {
  NSData* d = [NSJSONSerialization dataWithJSONObject:@{@"type": type, @"args": args} options:0 error:nil];
  if (!d) return;
  @synchronized(gEvents) { [gEvents addObject:[[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding]]; }
}
static NSString* json(id o) {
  NSData* d = [NSJSONSerialization dataWithJSONObject:o options:0 error:nil];
  return d ? [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] : @"{}";
}
static NSString* failed(NSString* why) { return json(@{@"error": @{@"code": @"failed", @"message": why}}); }

static UIViewController* top() {   // the view controller to present from: SDL's, or whatever it presents
  UIWindow* w = nil;
  for (UIScene* s in UIApplication.sharedApplication.connectedScenes)
    if ([s isKindOfClass:UIWindowScene.class]) for (UIWindow* x in ((UIWindowScene*)s).windows) if (x.isKeyWindow || !w) w = x;
  UIViewController* vc = w.rootViewController;
  while (vc.presentedViewController) vc = vc.presentedViewController;
  return vc;
}
static void anchor(UIViewController* sheet, UIViewController* from) {   // an iPad shows sheets as popovers: from the middle of the screen
  UIPopoverPresentationController* p = sheet.popoverPresentationController;
  if (!p) return;
  p.sourceView = from.view;
  p.sourceRect = CGRectMake(CGRectGetMidX(from.view.bounds), CGRectGetMidY(from.view.bounds), 1, 1);
  p.permittedArrowDirections = 0;
}

// ---- notifications: shown while the app is in front too; a tap is notification-click [id]
@interface ZnIosNotes : NSObject <UNUserNotificationCenterDelegate>
@end
@implementation ZnIosNotes
- (void)userNotificationCenter:(UNUserNotificationCenter*)c willPresentNotification:(UNNotification*)n withCompletionHandler:(void (^)(UNNotificationPresentationOptions))h {
  h(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList | UNNotificationPresentationOptionSound);
}
- (void)userNotificationCenter:(UNUserNotificationCenter*)c didReceiveNotificationResponse:(UNNotificationResponse*)r withCompletionHandler:(void (^)(void))h {
  NSString* ident = r.notification.request.identifier ?: @"";
  if ([r.actionIdentifier isEqualToString:UNNotificationDismissActionIdentifier]) pushEvent(@"notification-close", @[ident, @"user"]);
  else pushEvent(@"notification-click", @[ident]);
  h();
}
@end
static ZnIosNotes* gNotes;
static UNAuthorizationStatus gAuth = UNAuthorizationStatusNotDetermined;
static void refreshAuth() {
  [UNUserNotificationCenter.currentNotificationCenter getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* s) { gAuth = s.authorizationStatus; }];
}
static NSString* authState() {
  switch (gAuth) {
    case UNAuthorizationStatusAuthorized: case UNAuthorizationStatusProvisional: case UNAuthorizationStatusEphemeral: return @"granted";
    case UNAuthorizationStatusDenied: return @"denied";
    default: return @"default";
  }
}

// ---- pickers: the chosen files are copied into the app's caches (the picker's own copies are temporary), answered as dialog-result [token, paths]
@interface ZnIosPicker : NSObject <UIDocumentPickerDelegate, PHPickerViewControllerDelegate>
@property(nonatomic, copy) NSString* token;
@end
static NSMutableSet* gPickers;   // keeps each delegate while its picker is open
static NSString* keep(NSURL* from) {
  NSString* dir = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject stringByAppendingPathComponent:@"zinc-picked"];
  [NSFileManager.defaultManager createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
  NSString* to = [dir stringByAppendingPathComponent:[NSString stringWithFormat:@"%@-%@", NSUUID.UUID.UUIDString.lowercaseString, from.lastPathComponent]];
  BOOL scoped = [from startAccessingSecurityScopedResource];
  BOOL ok = [NSFileManager.defaultManager copyItemAtPath:from.path toPath:to error:nil];
  if (scoped) [from stopAccessingSecurityScopedResource];
  return ok ? to : nil;
}
@implementation ZnIosPicker
- (void)answer:(NSArray<NSString*>*)paths {
  pushEvent(@"dialog-result", @[self.token, paths.count ? json(paths) : @"null"]);
  gPending--;
  [gPickers removeObject:self];
}
- (void)documentPicker:(UIDocumentPickerViewController*)c didPickDocumentsAtURLs:(NSArray<NSURL*>*)urls {
  NSMutableArray* paths = [NSMutableArray new];
  for (NSURL* u in urls) if (NSString* p = keep(u)) [paths addObject:p];
  [self answer:paths];
}
- (void)documentPickerWasCancelled:(UIDocumentPickerViewController*)c { [self answer:@[]]; }
- (void)picker:(PHPickerViewController*)p didFinishPicking:(NSArray<PHPickerResult*>*)results {
  [p dismissViewControllerAnimated:YES completion:nil];
  if (!results.count) { [self answer:@[]]; return; }
  NSMutableArray* paths = [NSMutableArray new];
  __block NSUInteger left = results.count;
  for (PHPickerResult* r in results) {
    NSItemProvider* ip = r.itemProvider;
    NSString* type = ip.registeredTypeIdentifiers.firstObject ?: UTTypeImage.identifier;
    [ip loadFileRepresentationForTypeIdentifier:type completionHandler:^(NSURL* url, NSError*) {
      NSString* kept = url ? keep(url) : nil;   // the file exists only during this handler
      dispatch_async(dispatch_get_main_queue(), ^{
        if (kept) [paths addObject:kept];
        if (--left == 0) [self answer:paths];
      });
    }];
  }
}
@end

static NSArray<NSString*>* strings(id v) { return [v isKindOfClass:NSArray.class] ? v : @[]; }
static BOOL imagesOnly(NSArray* filters) {   // every extension of every filter is an image's: the photo picker
  static NSSet* images = [NSSet setWithArray:@[@"png", @"jpg", @"jpeg", @"heic", @"heif", @"gif", @"webp", @"tif", @"tiff", @"bmp"]];
  BOOL any = NO;
  for (NSDictionary* f in filters) for (NSString* e in strings(f[@"extensions"])) { if (![images containsObject:e.lowercaseString]) return NO; any = YES; }
  return any;
}

static NSString* run(const char* op, NSDictionary* a) {
  if (!strcmp(op, "notification.requestPermission")) {
    if (gAuth == UNAuthorizationStatusNotDetermined)   // asks once; the answer arrives later: "default" until then
      [UNUserNotificationCenter.currentNotificationCenter requestAuthorizationWithOptions:UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge
                                                                       completionHandler:^(BOOL, NSError*) { refreshAuth(); }];
    return json(@{@"state": authState()});
  }
  if (!strcmp(op, "notification.notify")) {
    UNMutableNotificationContent* c = [UNMutableNotificationContent new];
    c.title = a[@"title"] ?: @"";
    if ([a[@"subtitle"] length]) c.subtitle = a[@"subtitle"];
    if ([a[@"body"] length]) c.body = a[@"body"];
    if (![a[@"sound"] isEqual:@NO]) c.sound = UNNotificationSound.defaultSound;
    if ([a[@"group"] length]) c.threadIdentifier = a[@"group"];
    NSString* ident = [a[@"id"] length] ? a[@"id"] : NSUUID.UUID.UUIDString;
    [UNUserNotificationCenter.currentNotificationCenter addNotificationRequest:[UNNotificationRequest requestWithIdentifier:ident content:c trigger:nil] withCompletionHandler:^(NSError* e) {
      if (e) NSLog(@"zinc: notification %@ not delivered: %@", ident, e.localizedDescription);
    }];
    if (gAuth == UNAuthorizationStatusDenied) return json(@{@"id": ident, @"delivered": @NO, @"reason": @"notifications are off for this app (Settings)"});
    return json(@{@"id": ident, @"delivered": @YES});
  }
  if (!strcmp(op, "notification.cancel")) {
    NSString* ident = a[@"id"] ?: @"";
    [UNUserNotificationCenter.currentNotificationCenter removePendingNotificationRequestsWithIdentifiers:@[ident]];
    [UNUserNotificationCenter.currentNotificationCenter removeDeliveredNotificationsWithIdentifiers:@[ident]];
    return @"{}";
  }
  if (!strcmp(op, "notification.backend")) return @"{\"backend\":\"native\"}";
  if (!strcmp(op, "notification.openSettings")) {
    [UIApplication.sharedApplication openURL:[NSURL URLWithString:UIApplicationOpenNotificationSettingsURLString] options:@{} completionHandler:nil];
    return @"{\"opened\":true}";
  }
  if (!strcmp(op, "opener.open")) {
    NSString* t = a[@"target"] ?: @"";
    NSURL* u = [t hasPrefix:@"/"] ? [NSURL fileURLWithPath:t] : [NSURL URLWithString:t];
    if (!u) return failed([NSString stringWithFormat:@"%@ is not a URL", t]);
    if (u.isFileURL) {   // a file of the app: the share sheet's "open in" is how iOS hands it to another app
      UIViewController* vc = top();
      UIActivityViewController* s = [[UIActivityViewController alloc] initWithActivityItems:@[u] applicationActivities:nil];
      anchor(s, vc);
      [vc presentViewController:s animated:YES completion:nil];
      return @"{}";
    }
    [UIApplication.sharedApplication openURL:u options:@{} completionHandler:^(BOOL ok) { if (!ok) NSLog(@"zinc: no app opens %@", t); }];
    return @"{}";
  }
  if (!strcmp(op, "share.share")) {
    NSMutableArray* items = [NSMutableArray new];
    if ([a[@"text"] length]) [items addObject:a[@"text"]];
    if ([a[@"url"] length]) if (NSURL* u = [NSURL URLWithString:a[@"url"]]) [items addObject:u];
    if (!items.count) return failed(@"share needs a text or a url");
    UIViewController* vc = top();
    if (!vc) return failed(@"no window to present the share sheet from");
    UIActivityViewController* s = [[UIActivityViewController alloc] initWithActivityItems:items applicationActivities:nil];
    if ([a[@"title"] length]) [s setValue:a[@"title"] forKey:@"subject"];   // the subject of a mail
    anchor(s, vc);
    [vc presentViewController:s animated:YES completion:nil];
    return @"{\"shared\":true}";
  }
  if (!strcmp(op, "dialog.open")) {
    UIViewController* vc = top();
    if (!vc) return failed(@"no window to present the picker from");
    ZnIosPicker* d = [ZnIosPicker new];
    d.token = NSUUID.UUID.UUIDString;
    NSArray* filters = [a[@"filters"] isKindOfClass:NSArray.class] ? a[@"filters"] : @[];
    const BOOL many = [a[@"multiple"] isEqual:@YES];
    UIViewController* picker;
    if (imagesOnly(filters)) {
      PHPickerConfiguration* cfg = [PHPickerConfiguration new];
      cfg.filter = PHPickerFilter.imagesFilter;
      cfg.selectionLimit = many ? 0 : 1;
      PHPickerViewController* p = [[PHPickerViewController alloc] initWithConfiguration:cfg];
      p.delegate = d;
      picker = p;
    } else {
      NSMutableArray<UTType*>* types = [NSMutableArray new];
      for (NSDictionary* f in filters) for (NSString* e in strings(f[@"extensions"])) if (UTType* t = [UTType typeWithFilenameExtension:e]) [types addObject:t];
      if ([a[@"directory"] isEqual:@YES]) types = [NSMutableArray arrayWithObject:UTTypeFolder];
      if (!types.count) [types addObject:UTTypeItem];
      UIDocumentPickerViewController* p = [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:types asCopy:YES];
      p.allowsMultipleSelection = many;
      p.delegate = d;
      picker = p;
    }
    if (!gPickers) gPickers = [NSMutableSet new];
    [gPickers addObject:d];
    gPending++;
    [vc presentViewController:picker animated:YES completion:nil];
    return json(@{@"paths": NSNull.null, @"pending": d.token});
  }
  return nil;
}

extern "C" {
const char* zn_sys_live_backend(void) { return "ios"; }

int zn_sys_live_call(const char* op, const char* args, char* out, int cap) {
  @autoreleasepool {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
      gEvents = [NSMutableArray new];
      gNotes = [ZnIosNotes new];
      UNUserNotificationCenter.currentNotificationCenter.delegate = gNotes;
      refreshAuth();
    });
    NSDictionary* a = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:args length:strlen(args)] options:0 error:nil];
    if (![a isKindOfClass:NSDictionary.class]) a = @{};
    NSString* r = run(op, a);
    if (!r) return 0;
    snprintf(out, (size_t)cap, "%s", r.UTF8String);
    return 1;
  }
}

int zn_sys_live_pump(void) { return gPending > 0; }

int zn_sys_live_poll(char* out, int cap) {
  @autoreleasepool {
    if (!gEvents) return 0;
    NSString* e = nil;
    @synchronized(gEvents) { if (gEvents.count) { e = gEvents[0]; [gEvents removeObjectAtIndex:0]; } }
    if (!e) return 0;
    snprintf(out, (size_t)cap, "%s", e.UTF8String);
    return 1;
  }
}
}
