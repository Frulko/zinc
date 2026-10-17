// The iOS side of the system signals and commands (docs/ui.md "System signals", docs/targets/ios.md): Dynamic Type, Reduce Motion and the
// keyboard's frame go to the engine as signals (src/host/hal_dispatch.cpp); the program's zinc:sys device() commands are done here: haptics
// (UIFeedbackGenerator), the status bar, and the text input connection: ZincTextInput, a UITextInput client that mirrors the focused zinc:ui field
// (text, selection, marked text) so the keyboard's suggestions, autocorrect, dictation and the Japanese and Chinese IMEs see the field. The theme
// and the safe area come from SDL (targets/macos/hal_sdl.cpp). Compiled into zn_app on iOS only; the shell calls zn_mobile_glue_init.
// Run on the iOS 26 simulator (ZN-625, ZN-626: docs/reports/zinc-next-ios.md); a phone and a real IME are the cross-platform pass.
#include <TargetConditionals.h>
#if TARGET_OS_IPHONE
#import <UIKit/UIKit.h>
#include <string>

extern "C" void zn_hal_signal(const char* line);
extern "C" const char* (*zn_mobile_command)(const char* q, const char* a);
extern "C" const char* zn_hal_text_traits(void);
extern "C" void zn_ios_a11y_apply(const char* lines);   // ios_a11y.mm: zinc:ui's accessibility tree (ZN-630)
extern "C" void zn_ios_a11y_init(void);

static void signal(NSString* s) { zn_hal_signal(s.UTF8String); }

// ---- Dynamic Type: the body size of each category over the default (17 pt), as UIKit's own text styles grow
static float fontScale() {
  NSString* c = UIApplication.sharedApplication.preferredContentSizeCategory;
  NSDictionary<NSString*, NSNumber*>* k = @{
    UIContentSizeCategoryExtraSmall: @0.82, UIContentSizeCategorySmall: @0.88, UIContentSizeCategoryMedium: @0.94, UIContentSizeCategoryLarge: @1.0,
    UIContentSizeCategoryExtraLarge: @1.12, UIContentSizeCategoryExtraExtraLarge: @1.24, UIContentSizeCategoryExtraExtraExtraLarge: @1.35,
    UIContentSizeCategoryAccessibilityMedium: @1.65, UIContentSizeCategoryAccessibilityLarge: @1.94, UIContentSizeCategoryAccessibilityExtraLarge: @2.35,
    UIContentSizeCategoryAccessibilityExtraExtraLarge: @2.76, UIContentSizeCategoryAccessibilityExtraExtraExtraLarge: @3.12};
  NSNumber* v = k[c];
  return v ? v.floatValue : 1.0f;
}

// ---- the text input connection
@interface ZincPosition : UITextPosition
@property(nonatomic) NSInteger at;
+ (instancetype)at:(NSInteger)i;
@end
@implementation ZincPosition
+ (instancetype)at:(NSInteger)i { ZincPosition* p = [ZincPosition new]; p.at = i; return p; }
@end
@interface ZincRange : UITextRange
@property(nonatomic) NSRange r;
+ (instancetype)with:(NSRange)r;
@end
@implementation ZincRange
+ (instancetype)with:(NSRange)r { ZincRange* x = [ZincRange new]; x.r = r; return x; }
- (UITextPosition*)start { return [ZincPosition at:self.r.location]; }
- (UITextPosition*)end { return [ZincPosition at:NSMaxRange(self.r)]; }
- (BOOL)isEmpty { return self.r.length == 0; }
@end

@interface ZincTextInput : UIView <UITextInput>
@property(nonatomic, strong) NSMutableString* text;
@property(nonatomic) NSRange sel, marked;   // marked.location NSNotFound: none
@property(nonatomic) BOOL applying;
@property(nonatomic) UIKeyboardType keyboardType;
@property(nonatomic) UIReturnKeyType returnKeyType;
@property(nonatomic) UITextAutocapitalizationType autocapitalizationType;
@property(nonatomic) UITextAutocorrectionType autocorrectionType;
@property(nonatomic, getter=isSecureTextEntry) BOOL secureTextEntry;
@property(nonatomic, copy) UITextContentType textContentType;
@property(nonatomic, weak) id<UITextInputDelegate> inputDelegate;
@property(nonatomic, readonly) id<UITextInputTokenizer> tokenizer;
@property(nonatomic, copy) NSDictionary<NSAttributedStringKey, id>* markedTextStyle;
@end

@implementation ZincTextInput {
  UITextInputStringTokenizer* _tok;
}
- (instancetype)initWithFrame:(CGRect)f {
  self = [super initWithFrame:f];
  _text = [NSMutableString new];
  _marked = NSMakeRange(NSNotFound, 0);
  _tok = [[UITextInputStringTokenizer alloc] initWithTextInput:self];
  self.hidden = NO; self.alpha = 0.01; self.userInteractionEnabled = NO;
  return self;
}
- (id<UITextInputTokenizer>)tokenizer { return _tok; }
- (BOOL)canBecomeFirstResponder { return YES; }
- (NSRange)clamp:(NSRange)r { NSUInteger n = self.text.length, a = MIN(r.location, n); return NSMakeRange(a, MIN(r.length, n - a)); }
static NSRange rangeOf(UITextRange* r) { return r ? ((ZincRange*)r).r : NSMakeRange(0, 0); }
static NSInteger posOf(UITextPosition* p) { return p ? ((ZincPosition*)p).at : 0; }

/** The engine's field (device('textinput', ...)): applied without telling the engine back, the IME told of the change. */
- (void)syncText:(NSString*)value caret:(NSInteger)c anchor:(NSInteger)a compA:(NSInteger)ca compB:(NSInteger)cb {
  self.applying = YES;
  [self.inputDelegate textWillChange:self];
  [self.text setString:value];
  NSInteger lo = MIN(c, a), hi = MAX(c, a);
  self.sel = [self clamp:NSMakeRange(lo, hi - lo)];
  self.marked = ca >= 0 && cb >= ca ? [self clamp:NSMakeRange(ca, cb - ca)] : NSMakeRange(NSNotFound, 0);
  [self.inputDelegate textDidChange:self];
  self.applying = NO;
}
- (void)applyTraits:(const std::string&)t {
  auto has = [&](const char* kv) { return (" " + t + " ").find(std::string(" ") + kv + " ") != std::string::npos; };
  auto get = [&](const char* key) -> std::string { size_t i = (" " + t).find(std::string(" ") + key + "="); if (i == std::string::npos) return ""; size_t s = i + strlen(key) + 1, e = t.find(' ', s); return t.substr(s, e == std::string::npos ? std::string::npos : e - s); };
  const std::string type = get("type"), cap = get("cap"), ret = get("return"), fill = get("autofill");
  self.keyboardType = type == "number" ? UIKeyboardTypeNumberPad : type == "decimal" ? UIKeyboardTypeDecimalPad : type == "phone" ? UIKeyboardTypePhonePad :
                      type == "email" ? UIKeyboardTypeEmailAddress : type == "url" ? UIKeyboardTypeURL : type == "search" ? UIKeyboardTypeWebSearch : UIKeyboardTypeDefault;
  self.returnKeyType = ret == "go" ? UIReturnKeyGo : ret == "next" ? UIReturnKeyNext : ret == "search" ? UIReturnKeySearch : ret == "send" ? UIReturnKeySend : ret == "done" ? UIReturnKeyDone : UIReturnKeyDefault;
  self.autocapitalizationType = cap == "none" ? UITextAutocapitalizationTypeNone : cap == "words" ? UITextAutocapitalizationTypeWords : cap == "characters" ? UITextAutocapitalizationTypeAllCharacters : UITextAutocapitalizationTypeSentences;
  self.autocorrectionType = has("autocorrect=0") ? UITextAutocorrectionTypeNo : UITextAutocorrectionTypeDefault;
  self.secureTextEntry = has("secure=1");
  self.textContentType = fill == "email" || fill == "emailAddress" ? UITextContentTypeEmailAddress : fill == "password" ? UITextContentTypePassword :
                         fill == "username" ? UITextContentTypeUsername : fill == "oneTimeCode" ? UITextContentTypeOneTimeCode : fill == "name" ? UITextContentTypeName : nil;
}

// UIKeyInput
- (BOOL)hasText { return self.text.length > 0; }
- (void)insertText:(NSString*)s {
  if ([s isEqualToString:@"\n"] && self.returnKeyType != UIReturnKeyDefault) { signal(@"imeaction done"); return; }
  [self replaceRange:[ZincRange with:self.marked.location != NSNotFound ? self.marked : self.sel] withText:s];
  signal([@"commit " stringByAppendingString:s]);
}
- (void)deleteBackward {
  NSRange r = self.sel.length > 0 ? self.sel : self.sel.location > 0 ? [self.text rangeOfComposedCharacterSequenceAtIndex:self.sel.location - 1] : NSMakeRange(0, 0);
  if (r.length == 0) return;
  NSInteger before = (NSInteger)(self.sel.location - r.location), after = (NSInteger)(NSMaxRange(r) - NSMaxRange(self.sel));
  [self.text deleteCharactersInRange:r];
  self.sel = NSMakeRange(r.location, 0);
  signal([NSString stringWithFormat:@"imedelete %ld %ld", (long)MAX(before, (NSInteger)0), (long)MAX(after, (NSInteger)0)]);
}
// UITextInput: text and ranges
- (NSString*)textInRange:(UITextRange*)r { return [self.text substringWithRange:[self clamp:rangeOf(r)]]; }
- (void)replaceRange:(UITextRange*)r withText:(NSString*)s {
  NSRange x = [self clamp:rangeOf(r)];
  [self.text replaceCharactersInRange:x withString:s];
  self.sel = NSMakeRange(x.location + s.length, 0);
  self.marked = NSMakeRange(NSNotFound, 0);
}
- (UITextRange*)selectedTextRange { return [ZincRange with:self.sel]; }
- (void)setSelectedTextRange:(UITextRange*)r {
  self.sel = [self clamp:rangeOf(r)];
  if (!self.applying) signal([NSString stringWithFormat:@"imeselect %lu %lu", (unsigned long)self.sel.location, (unsigned long)NSMaxRange(self.sel)]);
}
- (UITextRange*)markedTextRange { return self.marked.location == NSNotFound ? nil : [ZincRange with:self.marked]; }
- (void)setMarkedText:(NSString*)s selectedRange:(NSRange)inner {
  NSRange r = self.marked.location != NSNotFound ? self.marked : self.sel;
  [self.text replaceCharactersInRange:[self clamp:r] withString:s ?: @""];
  self.marked = s.length > 0 ? NSMakeRange(r.location, s.length) : NSMakeRange(NSNotFound, 0);
  self.sel = NSMakeRange(r.location + MIN(inner.location, s.length), 0);
  signal([@"compose " stringByAppendingString:s ?: @""]);
}
- (void)unmarkText {
  if (self.marked.location == NSNotFound) return;
  NSString* run = [self.text substringWithRange:[self clamp:self.marked]];
  self.marked = NSMakeRange(NSNotFound, 0);
  signal([@"commit " stringByAppendingString:run]);
}
- (UITextPosition*)beginningOfDocument { return [ZincPosition at:0]; }
- (UITextPosition*)endOfDocument { return [ZincPosition at:self.text.length]; }
- (UITextRange*)textRangeFromPosition:(UITextPosition*)a toPosition:(UITextPosition*)b {
  NSInteger x = posOf(a), y = posOf(b);
  return [ZincRange with:NSMakeRange(MIN(x, y), labs(y - x))];
}
- (UITextPosition*)positionFromPosition:(UITextPosition*)p offset:(NSInteger)k {
  NSInteger i = posOf(p) + k;
  return i < 0 || i > (NSInteger)self.text.length ? nil : [ZincPosition at:i];
}
- (UITextPosition*)positionFromPosition:(UITextPosition*)p inDirection:(UITextLayoutDirection)d offset:(NSInteger)k {
  return [self positionFromPosition:p offset:d == UITextLayoutDirectionLeft || d == UITextLayoutDirectionUp ? -k : k];
}
- (NSComparisonResult)comparePosition:(UITextPosition*)a toPosition:(UITextPosition*)b {
  NSInteger x = posOf(a), y = posOf(b);
  return x < y ? NSOrderedAscending : x > y ? NSOrderedDescending : NSOrderedSame;
}
- (NSInteger)offsetFromPosition:(UITextPosition*)a toPosition:(UITextPosition*)b { return posOf(b) - posOf(a); }
- (UITextPosition*)positionWithinRange:(UITextRange*)r farthestInDirection:(UITextLayoutDirection)d {
  NSRange x = rangeOf(r);
  return [ZincPosition at:d == UITextLayoutDirectionLeft || d == UITextLayoutDirectionUp ? x.location : NSMaxRange(x)];
}
- (UITextRange*)characterRangeByExtendingPosition:(UITextPosition*)p inDirection:(UITextLayoutDirection)d {
  NSInteger i = posOf(p);
  return d == UITextLayoutDirectionLeft || d == UITextLayoutDirectionUp ? [ZincRange with:NSMakeRange(0, i)] : [ZincRange with:NSMakeRange(i, self.text.length - i)];
}
- (NSWritingDirection)baseWritingDirectionForPosition:(UITextPosition*)p inDirection:(UITextStorageDirection)d { return NSWritingDirectionNatural; }
- (void)setBaseWritingDirection:(NSWritingDirection)w forRange:(UITextRange*)r {}
// geometry: the field's box (the IME's candidate bar and the dictation UI place themselves by it). ponytail: per-character rects when the engine sends them
- (CGRect)firstRectForRange:(UITextRange*)r { return self.frame; }
- (CGRect)caretRectForPosition:(UITextPosition*)p { return CGRectMake(0, 0, 2, self.frame.size.height); }
- (NSArray<UITextSelectionRect*>*)selectionRectsForRange:(UITextRange*)r { return @[]; }
- (UITextPosition*)closestPositionToPoint:(CGPoint)pt { return [ZincPosition at:self.sel.location]; }
- (UITextPosition*)closestPositionToPoint:(CGPoint)pt withinRange:(UITextRange*)r { return [ZincPosition at:rangeOf(r).location]; }
- (UITextRange*)characterRangeAtPoint:(CGPoint)pt { return [ZincRange with:self.sel]; }
@end

static ZincTextInput* input;

static void haptic(const std::string& a) {
  if (a.rfind("impact", 0) == 0) {
    UIImpactFeedbackStyle s = a == "impact light" ? UIImpactFeedbackStyleLight : a == "impact heavy" ? UIImpactFeedbackStyleHeavy :
                              a == "impact soft" ? UIImpactFeedbackStyleSoft : a == "impact rigid" ? UIImpactFeedbackStyleRigid : UIImpactFeedbackStyleMedium;
    [[[UIImpactFeedbackGenerator alloc] initWithStyle:s] impactOccurred];
  } else if (a == "selection") [[UISelectionFeedbackGenerator new] selectionChanged];
  else if (a.rfind("notification", 0) == 0)
    [[UINotificationFeedbackGenerator new] notificationOccurred:a == "notification error" ? UINotificationFeedbackTypeError : a == "notification warning" ? UINotificationFeedbackTypeWarning : UINotificationFeedbackTypeSuccess];
  else if (a.rfind("vibrate", 0) == 0 && a != "vibrate 0") [[[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleHeavy] impactOccurred];   // no vibrator API on iOS
}

static UIWindow* keyWindow() {
  for (UIScene* s in UIApplication.sharedApplication.connectedScenes)
    if ([s isKindOfClass:UIWindowScene.class]) for (UIWindow* w in ((UIWindowScene*)s).windows) if (w.isKeyWindow) return w;
  return nil;
}

/** On the main thread. */
static void run(const std::string& q, const std::string& a) {
  if (q == "haptic") haptic(a);
  else if (q == "statusbar") {   // ponytail: UIApplication's style needs UIViewControllerBasedStatusBarAppearance = NO in Info.plist; SDL's view controller otherwise
    const bool hidden = a.find(" 1 ") != std::string::npos;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    UIApplication.sharedApplication.statusBarStyle = a.rfind("dark-content", 0) == 0 ? UIStatusBarStyleDarkContent : a.rfind("light-content", 0) == 0 ? UIStatusBarStyleLightContent : UIStatusBarStyleDefault;
    UIApplication.sharedApplication.statusBarHidden = hidden;
#pragma clang diagnostic pop
  } else if (q == "keyboard-traits") {
    if (a.empty()) { [input resignFirstResponder]; return; }   // the field lost the focus: SDL's StopTextInput resigns only its own text field
    if (!input) { input = [[ZincTextInput alloc] initWithFrame:CGRectMake(0, 0, 1, 1)]; [keyWindow() addSubview:input]; }
    [input applyTraits:a];
    if (!input.isFirstResponder) [input becomeFirstResponder];   // in SDL's hidden UITextField's place
    else [input reloadInputViews];
  } else if (q == "textinput" && input) {
    const size_t nl = a.find('\n');
    long c = 0, an = 0, ca = -1, cb = -1;
    if (nl == std::string::npos || sscanf(a.c_str(), "%ld %ld %ld %ld", &c, &an, &ca, &cb) != 4) return;
    [input syncText:[NSString stringWithUTF8String:a.c_str() + nl + 1] ?: @"" caret:c anchor:an compA:ca compB:cb];
  } else if (q == "a11y") zn_ios_a11y_apply(a.c_str());
  else if (q == "orientation") {   // screen.orientation.lock, a script's rotate: the scene turns (iOS 16), within the orientations of Info.plist
    UIWindow* w = keyWindow();
    const UIInterfaceOrientationMask m = a.rfind("portrait", 0) == 0 ? UIInterfaceOrientationMaskPortrait : a.rfind("landscape", 0) == 0 ? UIInterfaceOrientationMaskLandscape : UIInterfaceOrientationMaskAll;
    if (@available(iOS 16.0, *)) {
      [w.rootViewController setNeedsUpdateOfSupportedInterfaceOrientations];
      [w.windowScene requestGeometryUpdateWithPreferences:[[UIWindowSceneGeometryPreferencesIOS alloc] initWithInterfaceOrientations:m] errorHandler:^(NSError* e) { NSLog(@"zinc: orientation: %@", e.localizedDescription); }];
    }
  }
  // exitapp: an iOS app does not leave by itself (Apple's guidelines); nothing to do
}

static const char* command(const char* q, const char* a) {
  const std::string qs = q, as = a;
  dispatch_async(dispatch_get_main_queue(), ^{ run(qs, as); });
  return qs == "performance" ? "0" : "1";   // steady clocks: iOS has no request for them (Android's sustained mode, ZN-750)
}

// ---- the plugins' lifecycle subscribers (plugin.json targets.ios.lifecycle, ZN-628): classes that answer any of zincPause, zincResume,
// zincLowMemory and zincOpenURL: (a deep link), as src/app/ios/ZincLifecycle.h declares them; a Swift class marks them @objc
static NSMutableArray* gLifecycle;
static void each(SEL s, id arg = nil) {
  for (id o in gLifecycle) if ([o respondsToSelector:s]) ((void (*)(id, SEL, id))[o methodForSelector:s])(o, s, arg);
}
extern "C" void zn_mobile_lifecycle(const char* classes) {   // "A,B", from the shell (ZN_APP_LIFECYCLE, baked by zinc export)
  gLifecycle = [NSMutableArray new];
  for (NSString* n in [@(classes) componentsSeparatedByString:@","]) {
    Class c = n.length ? NSClassFromString(n) : nil;
    if (c) [gLifecycle addObject:[c new]];
    else if (n.length) NSLog(@"zinc: the lifecycle class %@ (plugin.json targets.ios.lifecycle) is not in the app", n);
  }
  NSNotificationCenter* nc = NSNotificationCenter.defaultCenter;
  [nc addObserverForName:UIApplicationWillResignActiveNotification object:nil queue:nil usingBlock:^(NSNotification*) { each(@selector(zincPause)); }];
  [nc addObserverForName:UIApplicationDidBecomeActiveNotification object:nil queue:nil usingBlock:^(NSNotification*) { each(@selector(zincResume)); }];
  [nc addObserverForName:UIApplicationDidReceiveMemoryWarningNotification object:nil queue:nil usingBlock:^(NSNotification*) { each(@selector(zincLowMemory)); }];
  // the app may be active already (SDL starts the program after launching): the subscribers hear it, as Android's onResume follows onCreate
  if (UIApplication.sharedApplication.applicationState == UIApplicationStateActive) each(@selector(zincResume));
}
extern "C" void zn_mobile_open_url(const char* url) {   // SDL's openURL, which reaches the shell as a dropped file named by the URL
  NSURL* u = [NSURL URLWithString:@(url)];
  if (u) each(@selector(zincOpenURL:), u);
}

extern "C" void zn_mobile_glue_init(void) {
  zn_mobile_command = command;
  dispatch_async(dispatch_get_main_queue(), ^{
    NSNotificationCenter* nc = NSNotificationCenter.defaultCenter;
    signal([NSString stringWithFormat:@"fontscale %g", fontScale()]);
    signal(UIAccessibilityIsReduceMotionEnabled() ? @"reducemotion 1" : @"reducemotion 0");
    zn_ios_a11y_init();
    [nc addObserverForName:UIContentSizeCategoryDidChangeNotification object:nil queue:nil usingBlock:^(NSNotification*) { signal([NSString stringWithFormat:@"fontscale %g", fontScale()]); }];
    [nc addObserverForName:UIAccessibilityReduceMotionStatusDidChangeNotification object:nil queue:nil usingBlock:^(NSNotification*) {
      signal(UIAccessibilityIsReduceMotionEnabled() ? @"reducemotion 1" : @"reducemotion 0");
    }];
    [nc addObserverForName:UIKeyboardWillChangeFrameNotification object:nil queue:nil usingBlock:^(NSNotification* n) {   // in points: the surface's units on iOS
      CGRect end = [n.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue];
      CGFloat screen = UIScreen.mainScreen.bounds.size.height;
      signal([NSString stringWithFormat:@"keyboard %d", (int)MAX((CGFloat)0, screen - end.origin.y)]);
    }];
    [nc addObserverForName:UIKeyboardWillHideNotification object:nil queue:nil usingBlock:^(NSNotification*) { signal(@"keyboard 0"); }];
  });
}
#endif
