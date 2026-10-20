// What a plugin hears of an iOS app's life (plugin.json targets.ios.lifecycle names the class, ZN-628, docs/plugins.md "Phones"): src/app/ios_glue.mm
// makes one instance of each class at start and calls the methods it answers, on the main thread. A Swift class marks them @objc; it need not
// declare the protocol.
#import <Foundation/Foundation.h>

@protocol ZincLifecycle <NSObject>
@optional
- (void)zincPause;              // UIApplicationWillResignActiveNotification
- (void)zincResume;             // UIApplicationDidBecomeActiveNotification
- (void)zincLowMemory;          // UIApplicationDidReceiveMemoryWarningNotification
- (void)zincOpenURL:(NSURL*)url;   // a deep link (a URL scheme of the app, Info.plist CFBundleURLTypes)
@end
