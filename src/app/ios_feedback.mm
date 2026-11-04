// Zinc Go's native feedback sheet. Notes stay in the app sandbox; there is no network operation.
#import <UIKit/UIKit.h>
#import "ios_feedback_store.h"
#include <sys/utsname.h>
#include <atomic>

static std::atomic<bool> feedbackActive{false};
extern "C" bool zn_ios_feedback_active() { return feedbackActive.load(); }

@interface ZincFeedback : UIViewController <UITextViewDelegate>
@property(nonatomic, strong) NSDictionary* context;
@property(nonatomic, strong) NSURL* root;
@property(nonatomic, strong) UITextView* note;
@end

@implementation ZincFeedback
- (void)viewDidLoad {
  [super viewDidLoad];
  self.title = @"Ajouter une note";
  self.view.backgroundColor = UIColor.systemBackgroundColor;
  self.navigationItem.leftBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"Annuler" style:UIBarButtonItemStylePlain target:self action:@selector(cancel)];
  self.navigationItem.rightBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"Enregistrer" style:UIBarButtonItemStyleDone target:self action:@selector(save)];
  self.navigationItem.rightBarButtonItem.enabled = NO;
  UILabel* info = [UILabel new];
  info.text = [NSString stringWithFormat:@"%@\nEnregistré localement sur cet iPhone.\nDécrivez le problème ou votre suggestion.", self.context[@"app"]];
  info.numberOfLines = 0;
  info.font = [UIFont preferredFontForTextStyle:UIFontTextStyleSubheadline];
  info.textColor = UIColor.secondaryLabelColor;
  info.translatesAutoresizingMaskIntoConstraints = NO;
  [self.view addSubview:info];
  self.note = [UITextView new];
  self.note.delegate = self;
  self.note.font = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
  self.note.adjustsFontForContentSizeCategory = YES;
  self.note.backgroundColor = UIColor.secondarySystemBackgroundColor;
  self.note.layer.cornerRadius = 12;
  self.note.textContainerInset = UIEdgeInsetsMake(12, 12, 12, 12);
  self.note.accessibilityLabel = @"Votre retour";
  self.note.translatesAutoresizingMaskIntoConstraints = NO;
  [self.view addSubview:self.note];
  UILayoutGuide* safe = self.view.safeAreaLayoutGuide;
  [NSLayoutConstraint activateConstraints:@[
    [info.topAnchor constraintEqualToAnchor:safe.topAnchor constant:16],
    [info.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor constant:20],
    [info.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor constant:-20],
    [self.note.topAnchor constraintEqualToAnchor:info.bottomAnchor constant:16],
    [self.note.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor constant:16],
    [self.note.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor constant:-16],
    [self.note.bottomAnchor constraintEqualToAnchor:self.view.keyboardLayoutGuide.topAnchor constant:-12]
  ]];
}
- (void)viewDidAppear:(BOOL)animated { [super viewDidAppear:animated]; [self.note becomeFirstResponder]; }
- (void)textViewDidChange:(UITextView*)view {
  const BOOL hasNote = [view.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].length > 0;
  self.navigationItem.rightBarButtonItem.enabled = hasNote;

}
- (void)cancel { feedbackActive = false; [self dismissViewControllerAnimated:YES completion:nil]; }
- (void)save {
  NSError* error = nil;
  NSURL* file = zn_feedback_save(self.root, self.context, self.note.text, &error);
  if (!file) {
    UIAlertController* alert = [UIAlertController alertControllerWithTitle:@"Enregistrement impossible" message:error.localizedDescription preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"Réessayer" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
    return;
  }
  feedbackActive = false;
  UIViewController* presenter = self.navigationController.presentingViewController;
  [self dismissViewControllerAnimated:YES completion:^{
    UIAlertController* alert = [UIAlertController alertControllerWithTitle:@"Note enregistrée" message:@"Votre retour est conservé sur cet iPhone, avec le contexte de l’application." preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"OK" style:UIAlertActionStyleDefault handler:nil]];
    [presenter presentViewController:alert animated:YES completion:nil];
  }];
}
@end

extern "C" void zn_ios_feedback(const char* app, const char* source, const char* device, const char* engine, const char* root) {
  if (feedbackActive.exchange(true)) return;
  NSString* name = [NSString stringWithUTF8String:app];
  NSURL* directory = [NSURL fileURLWithPath:[NSString stringWithUTF8String:root] isDirectory:YES];
  NSDictionary* base = @{@"app": name, @"source": @(source), @"deviceID": @(device), @"engine": @(engine)};
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow* window = nil;
    for (UIScene* scene in UIApplication.sharedApplication.connectedScenes)
      if ([scene isKindOfClass:UIWindowScene.class]) for (UIWindow* candidate in ((UIWindowScene*)scene).windows)
        if (candidate.isKeyWindow && !candidate.hidden) window = candidate;
    if (!window) for (UIScene* scene in UIApplication.sharedApplication.connectedScenes)
      if ([scene isKindOfClass:UIWindowScene.class]) for (UIWindow* candidate in ((UIWindowScene*)scene).windows)
        if (!candidate.hidden && candidate.windowLevel == UIWindowLevelNormal) window = candidate;
    UIViewController* presenter = window.rootViewController;
    if (!presenter) { feedbackActive = false; return; }
    while (presenter.presentedViewController) presenter = presenter.presentedViewController;
    struct utsname hardware{};
    uname(&hardware);
    UIScreen* screen = window.screen;
    UIEdgeInsets insets = window.safeAreaInsets;
    NSMutableDictionary* context = [base mutableCopy];
    context[@"device"] = @{@"model": @(hardware.machine), @"system": UIDevice.currentDevice.systemName,
      @"systemVersion": UIDevice.currentDevice.systemVersion, @"locale": NSLocale.currentLocale.localeIdentifier,
      @"screenPixels": @{@"width": @(screen.nativeBounds.size.width), @"height": @(screen.nativeBounds.size.height)},
      @"windowPoints": @{@"width": @(window.bounds.size.width), @"height": @(window.bounds.size.height)}, @"scale": @(screen.scale),
      @"safeArea": @{@"top": @(insets.top), @"right": @(insets.right), @"bottom": @(insets.bottom), @"left": @(insets.left)}};
    ZincFeedback* editor = [ZincFeedback new];
    editor.context = context;
    editor.root = directory;
    UINavigationController* navigation = [[UINavigationController alloc] initWithRootViewController:editor];
    navigation.modalPresentationStyle = UIModalPresentationPageSheet;
    navigation.modalInPresentation = YES;
    // SDL's alert action returns before its dismissal animation finishes.
    if (presenter.isBeingDismissed && presenter.transitionCoordinator) {
      UIViewController* parent = presenter.presentingViewController ?: window.rootViewController;
      [presenter.transitionCoordinator animateAlongsideTransition:nil completion:^(id<UIViewControllerTransitionCoordinatorContext>) {
        [parent presentViewController:navigation animated:YES completion:nil];
      }];
    } else if ([presenter isKindOfClass:UIAlertController.class]) {
      UIViewController* parent = presenter.presentingViewController ?: window.rootViewController;
      [presenter dismissViewControllerAnimated:YES completion:^{ [parent presentViewController:navigation animated:YES completion:nil]; }];
    } else [presenter presentViewController:navigation animated:YES completion:nil];
  });
}
