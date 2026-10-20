// An accessibility client for the screen reader bridge on iOS (ZN-630, docs/reports/zinc-next-a11y-bridges.md): XCUITest reads the app's
// elements through the accessibility runtime, as VoiceOver does, then taps the element found by its label. In an exported project (zinc export
// --target ios), add this file as a UI test bundle (the CMake lines are in the report), then
//   xcodebuild test -project build/<app>.xcodeproj -scheme a11yprobe -destination 'platform=iOS Simulator,name=iPhone 17'
// with PROBE_APP (bundle id), PROBE_PRESS, PROBE_EXPECT and PROBE_ENV ("K=V K=V", the app's environment) set as TEST_RUNNER_PROBE_*.
// The element trees before and after go to the log as `a11y probe before:` and `after:` (XCUIElement's debugDescription).
#import <XCTest/XCTest.h>

@interface A11yProbe : XCTestCase
@end

@implementation A11yProbe
- (void)testPressByLabel {
  NSDictionary<NSString*, NSString*>* env = NSProcessInfo.processInfo.environment;
  XCUIApplication* app = [[XCUIApplication alloc] initWithBundleIdentifier:env[@"PROBE_APP"]];
  NSMutableDictionary* appEnv = [NSMutableDictionary new];
  for (NSString* kv in [env[@"PROBE_ENV"] ?: @"" componentsSeparatedByString:@" "]) {
    NSRange eq = [kv rangeOfString:@"="];
    if (eq.location != NSNotFound) appEnv[[kv substringToIndex:eq.location]] = [kv substringFromIndex:eq.location + 1];
  }
  app.launchEnvironment = appEnv;
  [app launch];
  XCUIElement* target = app.buttons[env[@"PROBE_PRESS"]].firstMatch;
  XCTAssertTrue([target waitForExistenceWithTimeout:30], @"no button labelled %@", env[@"PROBE_PRESS"]);
  NSLog(@"a11y probe before:\n%@", app.debugDescription);
  [target tap];
  XCUIElement* shown = [[app descendantsMatchingType:XCUIElementTypeAny] matchingIdentifier:env[@"PROBE_EXPECT"]].firstMatch;
  BOOL ok = [shown waitForExistenceWithTimeout:15];
  NSLog(@"a11y probe after:\n%@", app.debugDescription);
  XCTAssertTrue(ok, @"%@ not shown after tapping %@", env[@"PROBE_EXPECT"], env[@"PROBE_PRESS"]);
}
@end
