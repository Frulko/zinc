// zinc:notifymac for macOS (notifymac.spec.ts): Notification Center's records decoded by Foundation's property list parser, the apps'
// names and icons from NSWorkspace, avatars (an image, a contact's photo, a monogram), the permissions Zinc Relay asks for, and opening
// what a notification leads to. Nothing here reads the notification database: index.ts does, through zinc:sqlite, read-only and in place.
// Checked on macOS 15.7 (24G). Each call that a later macOS could change is guarded and falls back (the owner allows private APIs for
// this app, 2026-10-17; none is needed yet: the record's own plist carries what the relay uses).
#define ZRT_HOSTED_CPP
#include "zinc_native_notifymac.h"

#import <AppKit/AppKit.h>
#import <Contacts/Contacts.h>
#import <ServiceManagement/ServiceManagement.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <UserNotifications/UserNotifications.h>
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <netinet/in.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>
#include <string>

namespace {

zrt::String str(NSString* s) {
  const char* u = s ? s.UTF8String : "";
  if (!u) u = "";
  return zrt::String::from(u, static_cast<uint32_t>(strlen(u)));
}
NSString* ns(zrt::String s) { return [[NSString alloc] initWithBytes:s.ptr() length:s.bytes() encoding:NSUTF8StringEncoding] ?: @""; }
zrt::Array<uint8_t> bytes(NSData* d) {
  zrt::Array<uint8_t> out = zrt::Array<uint8_t>::with_cap(d ? static_cast<int32_t>(d.length) : 0);
  const uint8_t* p = static_cast<const uint8_t*>(d.bytes);
  for (NSUInteger i = 0; d && i < d.length; ++i) out.push_raw(p[i]);
  return out;
}
NSString* jsonText(id o) {
  NSData* d = [NSJSONSerialization dataWithJSONObject:o options:0 error:nil];
  return d ? [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] : @"";
}
// a property list's values as JSON's: a dictionary with its keys in "$keys", dates in seconds since 1970, data as {"$data": base64}, or {"$plist": ...} when the data is itself a
// property list (a keyed archive of the record's communication context, for one), so the relay can look inside without knowing its classes
id jsonable(id v, int depth) {
  if (depth > 24) return @"";
  if ([v isKindOfClass:[NSDictionary class]]) {
    NSMutableDictionary* o = [NSMutableDictionary dictionary];
    NSMutableArray* keys = [NSMutableArray array];
    [(NSDictionary*)v enumerateKeysAndObjectsUsingBlock:^(id k, id x, BOOL*) { o[[k description]] = jsonable(x, depth + 1); [keys addObject:[k description]]; }];
    o[@"$keys"] = keys;   // Zinc has no Object.keys: the relay walks a dictionary by this list
    return o;
  }
  if ([v isKindOfClass:[NSArray class]]) {
    NSMutableArray* a = [NSMutableArray array];
    for (id x in (NSArray*)v) [a addObject:jsonable(x, depth + 1)];
    return a;
  }
  if ([v isKindOfClass:[NSString class]]) return v;
  if ([v isKindOfClass:[NSNumber class]]) { double d = [v doubleValue]; return d == d && d - d == 0 ? v : @0; }   // NaN and infinities are not JSON
  if ([v isKindOfClass:[NSDate class]]) return @([(NSDate*)v timeIntervalSince1970]);
  if ([v isKindOfClass:[NSData class]]) {
    NSData* d = v;
    if (d.length > 8 && (!memcmp(d.bytes, "bplist00", 8) || !memcmp(d.bytes, "<?xml", 5))) {
      id inner = [NSPropertyListSerialization propertyListWithData:d options:NSPropertyListImmutable format:nil error:nil];
      if (inner) return @{@"$plist": jsonable(inner, depth + 1)};
    }
    return @{@"$data": [d base64EncodedStringWithOptions:0]};
  }
  return [v description] ?: @"";
}
NSURL* appUrl(NSString* idOrPath) {
  if ([idOrPath hasPrefix:@"/"]) return [NSURL fileURLWithPath:idOrPath];
  return idOrPath.length ? [[NSWorkspace sharedWorkspace] URLForApplicationWithBundleIdentifier:idOrPath] : nil;
}
// draws into a px x px bitmap (pixels, not points: the same size whatever the screen's scale) and returns its PNG
NSData* render(int px, void (^draw)(NSRect)) {
  NSBitmapImageRep* rep = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:nullptr pixelsWide:px pixelsHigh:px bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES
                                                                  isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  if (!rep) return nil;
  rep.size = NSMakeSize(px, px);
  [NSGraphicsContext saveGraphicsState];
  [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:rep]];
  draw(NSMakeRect(0, 0, px, px));
  [NSGraphicsContext restoreGraphicsState];
  return [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
}
// an image cut to a square from its centre, as an avatar is shown
NSData* squarePng(NSImage* img, int px) {
  if (!img || img.size.width <= 0 || img.size.height <= 0) return nil;
  const NSSize s = img.size;
  const CGFloat side = MIN(s.width, s.height);
  const NSRect from = NSMakeRect((s.width - side) / 2, (s.height - side) / 2, side, side);
  return render(px, ^(NSRect r) { [img drawInRect:r fromRect:from operation:NSCompositingOperationCopy fraction:1.0]; });
}
NSColor* rgb(int c) { return [NSColor colorWithSRGBRed:((c >> 16) & 255) / 255.0 green:((c >> 8) & 255) / 255.0 blue:(c & 255) / 255.0 alpha:1]; }
// waits for a completion handler of the system, at most `s` seconds (these answer in milliseconds; a question to the user is not waited for)
void waitFor(dispatch_semaphore_t sem, double s) { dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, static_cast<int64_t>(s * NSEC_PER_SEC))); }
// UNUserNotificationCenter aborts the process outside an app bundle (a plain `zinc run` of a file, a test)
bool inBundle() { return [[NSBundle mainBundle].bundlePath hasSuffix:@".app"] && [NSBundle mainBundle].bundleIdentifier.length > 0; }

// mDNS's question for _zinclink._tcp.local (PTR): what zinc:link's discovery sends anyway, so the probe sends nothing new on the network
const uint8_t kQuestion[] = {0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 9, '_', 'z', 'i', 'n', 'c', 'l', 'i', 'n', 'k', 4, '_', 't', 'c', 'p', 5, 'l', 'o', 'c', 'a', 'l', 0, 0, 12, 0, 1};

struct MacNotify : NativeNotifyMac {
  zrt::String plistJson(zrt::Array<uint8_t> data) override {
    @autoreleasepool {
      const int32_t n = data.a ? data.length() : 0;
      NSMutableData* d = [NSMutableData dataWithLength:static_cast<NSUInteger>(n)];
      uint8_t* p = static_cast<uint8_t*>(d.mutableBytes);
      for (int32_t i = 0; i < n; ++i) p[i] = data.get(i);
      id v = [NSPropertyListSerialization propertyListWithData:d options:NSPropertyListImmutable format:nil error:nil];
      if (!v) return str(@"");
      return str(jsonText(@[jsonable(v, 0)]));   // in an array: a plist whose root is a string is still valid JSON
    }
  }
  zrt::String appInfo(zrt::String idOrPath) override {
    @autoreleasepool {
      NSURL* url = appUrl(ns(idOrPath));
      NSBundle* b = url ? [NSBundle bundleWithURL:url] : nil;
      if (!b) return str(@"");
      NSString* name = [b objectForInfoDictionaryKey:@"CFBundleDisplayName"] ?: [b objectForInfoDictionaryKey:@"CFBundleName"];
      if (![name isKindOfClass:[NSString class]] || !name.length) name = [[url.path lastPathComponent] stringByDeletingPathExtension];
      return str(jsonText(@{@"id": b.bundleIdentifier ?: @"", @"name": name ?: @"", @"path": url.path ?: @""}));
    }
  }
  zrt::Array<uint8_t> appIcon(zrt::String idOrPath, int32_t px) override {
    @autoreleasepool {
      if (px <= 0 || px > 1024) return bytes(nil);
      NSURL* url = appUrl(ns(idOrPath));
      NSImage* icon = url ? [[NSWorkspace sharedWorkspace] iconForFile:url.path] : [[NSWorkspace sharedWorkspace] iconForContentType:UTTypeApplicationBundle];
      if (!icon) return bytes(nil);
      return bytes(render(px, ^(NSRect r) { [icon drawInRect:r fromRect:NSZeroRect operation:NSCompositingOperationCopy fraction:1.0]; }));
    }
  }
  zrt::Array<uint8_t> imagePng(zrt::String source, int32_t px) override {
    @autoreleasepool {
      if (px <= 0 || px > 1024) return bytes(nil);
      NSString* s = ns(source);
      NSImage* img = nil;
      if ([s hasPrefix:@"file://"]) img = [[NSImage alloc] initWithContentsOfURL:[NSURL URLWithString:s]];
      else if ([s hasPrefix:@"/"]) img = [[NSImage alloc] initWithContentsOfFile:s];
      else { NSData* d = [[NSData alloc] initWithBase64EncodedString:s options:0]; if (d) img = [[NSImage alloc] initWithData:d]; }
      return bytes(squarePng(img, px));
    }
  }
  zrt::Array<uint8_t> monogram(zrt::String text, int32_t top, int32_t bottom, int32_t px) override {
    @autoreleasepool {
      if (px <= 0 || px > 1024) return bytes(nil);
      NSString* t = ns(text);
      return bytes(render(px, ^(NSRect r) {
        [[[NSGradient alloc] initWithStartingColor:rgb(top) endingColor:rgb(bottom)] drawInRect:r angle:-90];
        NSDictionary* a = @{NSFontAttributeName: [NSFont systemFontOfSize:px * 0.40 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: NSColor.whiteColor};
        const NSSize s = [t sizeWithAttributes:a];
        [t drawAtPoint:NSMakePoint((px - s.width) / 2, (px - s.height) / 2) withAttributes:a];
      }));
    }
  }
  zrt::String dbPath() override {
    @autoreleasepool {
      if ([[NSProcessInfo processInfo] isOperatingSystemAtLeastVersion:(NSOperatingSystemVersion){15, 0, 0}])
        return str([NSHomeDirectory() stringByAppendingPathComponent:@"Library/Group Containers/group.com.apple.usernoted/db2/db"]);
      char dir[PATH_MAX] = "";
      confstr(_CS_DARWIN_USER_DIR, dir, sizeof dir);   // macOS 10.13 to 14: under the per-user temporary root
      return str([[NSString stringWithUTF8String:dir] stringByAppendingPathComponent:@"com.apple.notificationcenter/db2/db"]);
    }
  }
  int32_t openError(zrt::String path) override {
    // an open, not access(): only an open meets the privacy check (TCC) that Full Disk Access lifts
    const std::string p(path.ptr(), path.bytes());
    const int fd = ::open(p.c_str(), O_RDONLY | O_CLOEXEC);
    if (fd < 0) return errno;
    ::close(fd);
    return 0;
  }
  zrt::String bundlePath() override {
    @autoreleasepool {
      NSString* p = [NSBundle mainBundle].bundlePath;
      return str([p hasSuffix:@".app"] ? p : @"");
    }
  }
  zrt::String contactsStatus() override {
    switch ([CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts]) {
      case CNAuthorizationStatusAuthorized: return str(@"granted");
      case CNAuthorizationStatusDenied: return str(@"denied");
      case CNAuthorizationStatusRestricted: return str(@"restricted");
      case CNAuthorizationStatusNotDetermined: return str(@"undetermined");
      default: return str(@"limited");   // CNAuthorizationStatusLimited (macOS 15): some contacts
    }
  }
  void requestContacts() override {
    static CNContactStore* store = [CNContactStore new];
    [store requestAccessForEntityType:CNEntityTypeContacts completionHandler:^(BOOL, NSError*) {}];
  }
  zrt::Array<uint8_t> contactImage(zrt::String handle, zrt::String name, int32_t px) override {
    @autoreleasepool {
      const CNAuthorizationStatus st = [CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts];
      if (st != CNAuthorizationStatusAuthorized && static_cast<int>(st) != 4 /* CNAuthorizationStatusLimited, macOS 15 */) return bytes(nil);   // never asks here: the assistant does
      CNContactStore* store = [CNContactStore new];
      NSArray* keys = @[CNContactThumbnailImageDataKey, CNContactImageDataKey, CNContactImageDataAvailableKey, [CNContactFormatter descriptorForRequiredKeysForStyle:CNContactFormatterStyleFullName]];
      NSString* h = ns(handle), *n = ns(name);
      NSArray<CNContact*>* found = nil;
      if ([h hasPrefix:@"cn:"]) { CNContact* c = [store unifiedContactWithIdentifier:[h substringFromIndex:3] keysToFetch:keys error:nil]; found = c ? @[c] : nil; }
      else if (h.length && [h containsString:@"@"]) found = [store unifiedContactsMatchingPredicate:[CNContact predicateForContactsMatchingEmailAddress:h] keysToFetch:keys error:nil];
      else if (h.length) found = [store unifiedContactsMatchingPredicate:[CNContact predicateForContactsMatchingPhoneNumber:[CNPhoneNumber phoneNumberWithStringValue:h]] keysToFetch:keys error:nil];
      if (found.count == 0 && n.length) {
        NSArray<CNContact*>* named = [store unifiedContactsMatchingPredicate:[CNContact predicateForContactsMatchingName:n] keysToFetch:keys error:nil];
        NSMutableArray* exact = [NSMutableArray array];
        for (CNContact* c in named) if ([[CNContactFormatter stringFromContact:c style:CNContactFormatterStyleFullName] caseInsensitiveCompare:n] == NSOrderedSame) [exact addObject:c];
        found = exact.count ? exact : named.count == 1 ? named : nil;   // a name that matches several people gives none of their photos
      }
      for (CNContact* c in found) {
        if (!c.imageDataAvailable) continue;
        NSData* d = c.imageData ?: c.thumbnailImageData;
        NSData* png = d ? squarePng([[NSImage alloc] initWithData:d], px) : nil;
        if (png) return bytes(png);
      }
      return bytes(nil);
    }
  }
  zrt::String notifyStatus() override {
    @autoreleasepool {
      if (!inBundle()) return str(@"unavailable");
      __block NSString* r = @"undetermined";
      dispatch_semaphore_t sem = dispatch_semaphore_create(0);
      [[UNUserNotificationCenter currentNotificationCenter] getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* s) {
        r = s.authorizationStatus == UNAuthorizationStatusAuthorized ? @"granted" : s.authorizationStatus == UNAuthorizationStatusProvisional ? @"provisional"
          : s.authorizationStatus == UNAuthorizationStatusDenied ? @"denied" : @"undetermined";
        dispatch_semaphore_signal(sem);
      }];
      waitFor(sem, 2);
      return str(r);
    }
  }
  void requestNotify() override {
    if (!inBundle()) return;
    [[UNUserNotificationCenter currentNotificationCenter] requestAuthorizationWithOptions:UNAuthorizationOptionAlert | UNAuthorizationOptionSound completionHandler:^(BOOL, NSError*) {}];
  }
  zrt::String postNotification(zrt::String title, zrt::String body) override {
    @autoreleasepool {
      NSString* t = ns(title), *b = ns(body);
      if (inBundle() && [ns(notifyStatus()) isEqualToString:@"granted"]) {
        UNMutableNotificationContent* c = [UNMutableNotificationContent new];
        c.title = t;
        c.body = b;
        __block NSString* why = @"no answer from Notification Center";
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        [[UNUserNotificationCenter currentNotificationCenter] addNotificationRequest:[UNNotificationRequest requestWithIdentifier:[NSUUID UUID].UUIDString content:c trigger:nil]
                                                               withCompletionHandler:^(NSError* e) { why = e ? e.localizedDescription : @""; dispatch_semaphore_signal(sem); }];
        waitFor(sem, 3);
        return str(why);
      }
      // without the permission: AppleScript's notification (Script Editor's, which macOS allows by default)
      auto quote = [](NSString* s) { return [NSString stringWithFormat:@"\"%@\"", [[s stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"] stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""]]; };
      NSTask* task = [NSTask new];
      task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/osascript"];
      task.arguments = @[@"-e", [NSString stringWithFormat:@"display notification %@ with title %@", quote(b), quote(t)]];
      NSError* err = nil;
      if (![task launchAndReturnError:&err]) return str(err.localizedDescription ?: @"osascript failed");
      [task waitUntilExit];
      return str(task.terminationStatus == 0 ? @"" : @"osascript failed");
    }
  }
  bool open(zrt::String bundleId, zrt::String url) override {
    @autoreleasepool {
      NSWorkspace* ws = [NSWorkspace sharedWorkspace];
      NSURL* app = appUrl(ns(bundleId));
      NSURL* target = url.bytes() ? [NSURL URLWithString:ns(url)] : nil;
      NSWorkspaceOpenConfiguration* cfg = [NSWorkspaceOpenConfiguration configuration];
      cfg.activates = YES;
      if (target && app) { [ws openURLs:@[target] withApplicationAtURL:app configuration:cfg completionHandler:nil]; return true; }
      if (target) return [ws openURL:target];
      if (!app) return false;
      [ws openApplicationAtURL:app configuration:cfg completionHandler:nil];
      return true;
    }
  }
  zrt::String loginStatus() override {
    if (@available(macOS 13.0, *)) {
      switch ([SMAppService mainAppService].status) {
        case SMAppServiceStatusEnabled: return str(@"enabled");
        case SMAppServiceStatusRequiresApproval: return str(@"requires approval");
        case SMAppServiceStatusNotFound: return str(@"not found");
        default: return str(@"not registered");
      }
    }
    return str(@"unavailable");
  }
  zrt::String setLogin(bool on) override {
    if (@available(macOS 13.0, *)) {
      if (!inBundle()) return str(@"not an app bundle");
      NSError* e = nil;
      const BOOL ok = on ? [[SMAppService mainAppService] registerAndReturnError:&e] : [[SMAppService mainAppService] unregisterAndReturnError:&e];
      return str(ok ? @"" : (e.localizedDescription ?: @"refused"));
    }
    return str(@"unavailable");
  }
  zrt::String localNetwork() override {
    // the first LAN interface with an IPv4 address; a send of mDNS's question on it fails with EHOSTUNREACH when access is refused
    struct ifaddrs* list = nullptr;
    if (getifaddrs(&list) != 0) return str(@"offline");
    in_addr ifa = {};
    bool have = false;
    for (struct ifaddrs* i = list; i && !have; i = i->ifa_next)
      if (i->ifa_addr && i->ifa_addr->sa_family == AF_INET && (i->ifa_flags & IFF_UP) && !(i->ifa_flags & IFF_LOOPBACK) && (i->ifa_flags & IFF_MULTICAST)) {
        ifa = reinterpret_cast<sockaddr_in*>(i->ifa_addr)->sin_addr;
        have = true;
      }
    freeifaddrs(list);
    if (!have) return str(@"offline");
    const int fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (fd < 0) return str(@"offline");
    setsockopt(fd, IPPROTO_IP, IP_MULTICAST_IF, &ifa, sizeof ifa);
    sockaddr_in to = {};
    to.sin_family = AF_INET;
    to.sin_port = htons(5353);
    inet_pton(AF_INET, "224.0.0.251", &to.sin_addr);
    const ssize_t n = sendto(fd, kQuestion, sizeof kQuestion, 0, reinterpret_cast<sockaddr*>(&to), sizeof to);
    const int e = errno;
    ::close(fd);
    if (n >= 0) return str(@"ok");
    return str(e == EHOSTUNREACH || e == ENETUNREACH || e == EPERM ? @"blocked" : @"offline");
  }
};

}  // namespace

NativeNotifyMac* zinc_create_NotifyMac() {
  static MacNotify inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
