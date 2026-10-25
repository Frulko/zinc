// zinc:location on macOS and iOS (location.ios.mm includes this file): one CLLocationManager, made and driven on the main thread (Core
// Location calls its delegate on the run loop of the thread that made it: the main one, which SDL keeps turning). The delegate hands each fix
// to location.host.cpp under its mutex and the program's thread polls it (fix()), so no callback ever runs Zinc code off its thread.
// Manual retain/release: plugins are not built with ARC; the manager and its delegate live as long as the process.
// Privacy: "when in use" only. iOS ignores the question of an app without NSLocationWhenInUseUsageDescription: the backend then answers
// denied with the reason. A background run (ZINC_BACKGROUND) never asks.
#define LOC_BACKEND 1
#import <CoreLocation/CoreLocation.h>
#import <Foundation/Foundation.h>
#include <TargetConditionals.h>
#include <atomic>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include "location.h"

namespace {
std::atomic<int> gAuth{-1};       // the last status seen (0..3), -1 before the manager exists
std::atomic<bool> gServices{true};   // +locationServicesEnabled, read off the main thread (Apple: it can block)
CLLocationManager* gMgr = nil;

int statusOf(CLAuthorizationStatus s) {
  switch (s) {
    case kCLAuthorizationStatusNotDetermined: return 0;
    case kCLAuthorizationStatusRestricted: return 3;
    case kCLAuthorizationStatusDenied: return 2;
    default: return 1;   // always, when in use
  }
}
int currentStatus(CLLocationManager* m) {
  if (@available(iOS 14.0, macOS 11.0, *)) return statusOf(m.authorizationStatus);
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  return statusOf([CLLocationManager authorizationStatus]);
#pragma clang diagnostic pop
}
void refreshServices() {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ gServices = [CLLocationManager locationServicesEnabled]; });
}
void onMain(void (^b)(void)) {
  if ([NSThread isMainThread]) b();
  else dispatch_async(dispatch_get_main_queue(), b);
}
bool hasUsageText() {
#if TARGET_OS_IPHONE
  return [[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSLocationWhenInUseUsageDescription"] != nil;
#else
  return true;   // an unbundled zinc run: the terminal app answers for the process
#endif
}
}  // namespace

@interface ZnLocDelegate : NSObject <CLLocationManagerDelegate>
@end
@implementation ZnLocDelegate
- (void)locationManager:(CLLocationManager*)m didUpdateLocations:(NSArray<CLLocation*>*)locations {
  CLLocation* l = locations.lastObject;
  if (!l || l.horizontalAccuracy < 0) return;
  const bool vertical = l.verticalAccuracy >= 0;
  const double f[8] = {l.coordinate.latitude, l.coordinate.longitude, l.horizontalAccuracy, vertical ? l.altitude : NAN, vertical ? l.verticalAccuracy : NAN,
                       l.speed >= 0 ? l.speed : NAN, l.course >= 0 ? l.course : NAN, l.timestamp.timeIntervalSince1970 * 1000.0};
  loc_push(f);
}
- (void)locationManager:(CLLocationManager*)m didFailWithError:(NSError*)e {
  if (e.code == kCLErrorLocationUnknown) return;   // for now only: Core Location keeps trying
  loc_fail(e.code == kCLErrorDenied ? "denied" : "unavailable", e.localizedDescription.UTF8String);
}
- (void)locationManagerDidChangeAuthorization:(CLLocationManager*)m {   // iOS 14, macOS 11
  gAuth = currentStatus(m);
  refreshServices();
}
- (void)locationManager:(CLLocationManager*)m didChangeAuthorizationStatus:(CLAuthorizationStatus)s {   // before them
  gAuth = statusOf(s);
  refreshServices();
}
@end

namespace {
CLLocationManager* manager() {   // main thread only
  if (!gMgr) {
    gMgr = [[CLLocationManager alloc] init];
    gMgr.delegate = [[ZnLocDelegate alloc] init];   // the manager holds its delegate weakly: this one is never released
    gAuth = currentStatus(gMgr);
    refreshServices();
  }
  return gMgr;
}
}  // namespace

int loc_backend_permission(bool ask) {
  onMain(^{
    CLLocationManager* m = manager();
    gAuth = currentStatus(m);
    const char* bg = getenv("ZINC_BACKGROUND");
    if (ask && gAuth == 0 && hasUsageText() && (!bg || !*bg || !strcmp(bg, "0"))) [m requestWhenInUseAuthorization];
  });
  if (!gServices) return 4;
  const int s = gAuth;
  if (s == 0 && !hasUsageText()) {
    loc_fail("denied", "the app's Info.plist has no NSLocationWhenInUseUsageDescription: add \"location\" to zinc.json \"permissions\"");
    return 2;
  }
  return s < 0 ? 0 : s;
}
void loc_backend_start(double accuracy, double distance) {
  onMain(^{
    CLLocationManager* m = manager();
    // -1 is kCLLocationAccuracyBest and kCLDistanceFilterNone: the macOS 26 SDK links those constants to _LocationEssentials, which
    // macOS 15 does not have, so the literal values keep the library loadable there
    m.desiredAccuracy = accuracy > 0 ? accuracy : -1;
    m.distanceFilter = distance > 0 ? distance : -1;
    [m startUpdatingLocation];
  });
}
void loc_backend_stop() {
  onMain(^{ if (gMgr) [gMgr stopUpdatingLocation]; });
}

#include "location.host.cpp"
