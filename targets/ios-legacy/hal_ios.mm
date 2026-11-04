// UIKit owns the main thread; the console interpreter renders on a background thread.
#import <UIKit/UIKit.h>
#import <QuartzCore/CAEAGLLayer.h>
#import <OpenGLES/EAGL.h>
#import <OpenGLES/ES2/gl.h>
#import <OpenGLES/ES2/glext.h>
#include <mach/mach_time.h>
#include <pthread.h>
#include <sys/stat.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <fcntl.h>
#include <cmath>
#include <unistd.h>
#include <cstdio>
#include <vector>
#include "hal.h"
#include "../common/text_queue.h"
extern "C" void zn_legacy_write_info(const char* directory);

int zn_console_main(int, char**);

namespace {
struct Host {
  pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
  bool paused = false;
  uint64_t pausedAt = 0, pausedUs = 0;
  float x = 0, y = 0;
  bool down = false, remoteInput = false;
  uint64_t dragStart = 0, dragDuration = 0, lastPresentation = 0;
  float dragX0 = 0, dragY0 = 0, dragX1 = 0, dragY1 = 0;
  bool frameTrace = false;
  int width = 320, height = 480;
  int framesLeft = -1;
  uint64_t frameStart = 0;
  std::vector<uint32_t> pixels;
  char directory[1024]{};
  HalTextQueue text;
  std::deque<std::string> signals;
  std::string signalLine;
  int control = -1, tapFrames = 0, keyboardInset = 0;
  bool screenshot = false, info = false, gpuTrace = false, gpuVerify = false;
  __weak UIView* image;
  EAGLContext* context;
  GLuint framebuffer = 0, colorbuffer = 0, depthbuffer = 0;
  GLint drawableWidth = 0, drawableHeight = 0;
  int scale = 1;
  __weak UILabel* output;
};
Host& host() { static Host h; return h; }
void controlKeyboard(const char* action);
uint64_t rawTimeUs();
void startControl() {
  auto& h = host();
  sockaddr_un address{};
  address.sun_family = AF_UNIX;
  address.sun_len = sizeof address;
  if (snprintf(address.sun_path, sizeof address.sun_path, "%s/control.sock", h.directory) >= static_cast<int>(sizeof address.sun_path)) return;
  h.control = socket(AF_UNIX, SOCK_DGRAM, 0);
  if (h.control < 0) return;
  unlink(address.sun_path);
  if (bind(h.control, reinterpret_cast<sockaddr*>(&address), sizeof address)
      || chmod(address.sun_path, 0600) || fcntl(h.control, F_SETFL, O_NONBLOCK)) {
    close(h.control); h.control = -1;
    return;
  }
}
void pollControl() {   // called with the input mutex held
  auto& h = host();
  char line[1024];
  for (int commands = 0; h.control >= 0 && commands < 32; ++commands) {
    ssize_t n = recv(h.control, line, sizeof line - 1, 0);
    if (n <= 0) break;
    if (n == sizeof line - 1) continue;
    line[n] = 0;
    float x, y, ex, ey; int duration; char action[16], extra;
    if (sscanf(line, "drag %f %f %f %f %d %c", &x, &y, &ex, &ey, &duration, &extra) == 5 &&
        std::isfinite(x) && std::isfinite(y) && std::isfinite(ex) && std::isfinite(ey) && duration >= 50 && duration <= 10000) {
      h.dragX0 = fmaxf(0, fminf(x, h.width)); h.dragY0 = fmaxf(0, fminf(y, h.height));
      h.dragX1 = fmaxf(0, fminf(ex, h.width)); h.dragY1 = fmaxf(0, fminf(ey, h.height));
      h.dragStart = rawTimeUs(); h.dragDuration = (uint64_t)duration * 1000; h.remoteInput = h.down = true; h.tapFrames = 0;
      fprintf(stderr, "zinc gesture: at=%llu duration=%llu\n", (unsigned long long)h.dragStart, (unsigned long long)h.dragDuration);
    } else if (sscanf(line, "%15s %f %f %c", action, &x, &y, &extra) == 3 && std::isfinite(x) && std::isfinite(y)) {
      if (!strcmp(action, "tap") || !strcmp(action, "down") || !strcmp(action, "move")) {
        h.dragStart = 0;
        h.x = fmaxf(0, fminf(x, h.width)); h.y = fmaxf(0, fminf(y, h.height));
        if (strcmp(action, "move")) h.down = true;
        h.remoteInput = true;
        h.tapFrames = !strcmp(action, "tap") ? 2 : 0;
      }
    } else if (!strcmp(line, "up")) { h.dragStart = 0; h.down = false; h.tapFrames = 0; h.remoteInput = false; }
    else if (!strncmp(line, "text ", 5)) h.text.text(std::string(line + 5, n - 5));
    else if (!strcmp(line, "backspace")) h.text.key(HAL_KEY_BACKSPACE);
    else if (!strcmp(line, "enter")) h.text.key(HAL_KEY_ENTER);
    else if (!strcmp(line, "shot")) h.screenshot = true;
    else if (!strcmp(line, "info")) h.info = true;
    else if (!strcmp(line, "gpu-dump")) setenv("ZINC_GL_DUMP", "1", 1);
    else if (!strcmp(line, "layout-trace on") || !strcmp(line, "layout-trace off")) h.signals.push_back(std::string("layouttrace ") + (line + 13));
    else if (!strcmp(line, "gpu-time on")) h.gpuTrace = true;
    else if (!strcmp(line, "gpu-time off")) h.gpuTrace = false;
    else if (!strcmp(line, "frame-time on")) { h.frameTrace = true; h.lastPresentation = 0; }
    else if (!strcmp(line, "frame-time off")) h.frameTrace = false;
    else if (!strcmp(line, "gpu-batch on")) { h.gpuTrace = true; setenv("ZINC_GL_BATCH_TIME", "1", 1); }
    else if (!strcmp(line, "gpu-batch off")) unsetenv("ZINC_GL_BATCH_TIME");
    else if (!strcmp(line, "gpu-occlude 0") || !strcmp(line, "gpu-occlude 1")) setenv("ZINC_GL_OCCLUDE", line + 12, 1);
    else if (!strcmp(line, "gpu-cache 0") || !strcmp(line, "gpu-cache 1")) setenv("ZINC_GL_PAINT_CACHE", line + 10, 1);
    else if (!strcmp(line, "gpu-discard 0") || !strcmp(line, "gpu-discard 1")) setenv("ZINC_GL_DISCARD_DEPTH", line + 12, 1);
    else if (!strcmp(line, "gpu-direct 0") || !strcmp(line, "gpu-direct 1") || !strcmp(line, "gpu-direct 2")) setenv("ZINC_GL_DIRECT", line + 11, 1);
    else if (!strcmp(line, "gpu-verify on")) { h.gpuVerify = true; setenv("ZINC_GL_VERIFY_PX", "1", 1); }
    else if (!strcmp(line, "gpu-verify off")) { h.gpuVerify = false; unsetenv("ZINC_GL_VERIFY_PX"); }
    else if (!strcmp(line, "keyboard-state") || !strcmp(line, "return") || !strcmp(line, "done")) controlKeyboard(line);
  }
}
uint64_t rawTimeUs() {
  static const mach_timebase_info_data_t scale = [] { mach_timebase_info_data_t s; mach_timebase_info(&s); return s; }();
  uint64_t ticks = mach_absolute_time();
  return (ticks / scale.denom * scale.numer + ticks % scale.denom * scale.numer / scale.denom) / 1000;
}
void pause(bool value) {
  auto& h = host();
  pthread_mutex_lock(&h.mutex);
  if (h.paused != value) {
    if (value) h.pausedAt = rawTimeUs(); else h.pausedUs += rawTimeUs() - h.pausedAt;
    h.paused = value;
  }
  if (value) { h.dragStart = 0; h.down = false; h.remoteInput = false; h.tapFrames = 0; }
  pthread_mutex_unlock(&h.mutex);
}
}

@interface ZincLegacyView : UIView <UIKeyInput>
@property(nonatomic) UIKeyboardType keyboardType;
@property(nonatomic) UIReturnKeyType returnKeyType;
@property(nonatomic) UITextAutocapitalizationType autocapitalizationType;
@property(nonatomic) UITextAutocorrectionType autocorrectionType;
@property(nonatomic,getter=isSecureTextEntry) BOOL secureTextEntry;
@property(nonatomic) BOOL dismissOnReturn;
@property(nonatomic,copy) NSString* inputTraits;
- (void)applyTraits:(NSString*)traits;
- (void)finishEditing;
@end
@implementation ZincLegacyView
+ (Class)layerClass { return [CAEAGLLayer class]; }
- (BOOL)canBecomeFirstResponder { return YES; }
- (BOOL)hasText { return YES; }
- (void)applyTraits:(NSString*)traits {
  if ([traits isEqualToString:self.inputTraits]) return;
  self.inputTraits = traits;
  if (!traits.length) return;
  NSMutableDictionary* values = [NSMutableDictionary dictionary];
  for (NSString* part in [traits componentsSeparatedByString:@" "]) {
    NSRange equal = [part rangeOfString:@"="];
    if (equal.location != NSNotFound) values[[part substringToIndex:equal.location]] = [part substringFromIndex:equal.location + 1];
  }
  NSString* type = values[@"type"], *ret = values[@"return"], *cap = values[@"cap"], *submit = values[@"submit"];
  self.keyboardType = [type isEqual:@"number"] ? UIKeyboardTypeNumberPad : [type isEqual:@"decimal"] ? UIKeyboardTypeDecimalPad : [type isEqual:@"phone"] ? UIKeyboardTypePhonePad : [type isEqual:@"email"] ? UIKeyboardTypeEmailAddress : [type isEqual:@"url"] ? UIKeyboardTypeURL : [type isEqual:@"search"] ? UIKeyboardTypeWebSearch : UIKeyboardTypeDefault;
  self.returnKeyType = [ret isEqual:@"done"] ? UIReturnKeyDone : [ret isEqual:@"next"] ? UIReturnKeyNext : [ret isEqual:@"go"] ? UIReturnKeyGo : [ret isEqual:@"search"] ? UIReturnKeySearch : [ret isEqual:@"send"] ? UIReturnKeySend : UIReturnKeyDefault;
  self.autocapitalizationType = [cap isEqual:@"none"] ? UITextAutocapitalizationTypeNone : [cap isEqual:@"words"] ? UITextAutocapitalizationTypeWords : [cap isEqual:@"characters"] ? UITextAutocapitalizationTypeAllCharacters : UITextAutocapitalizationTypeSentences;
  self.autocorrectionType = [values[@"autocorrect"] isEqual:@"0"] ? UITextAutocorrectionTypeNo : UITextAutocorrectionTypeDefault;
  self.secureTextEntry = [values[@"secure"] isEqual:@"1"];
  self.dismissOnReturn = [submit isEqual:@"blurAndSubmit"] || (![values[@"multiline"] isEqual:@"1"] && ![submit isEqual:@"submit"]);
  if (self.isFirstResponder) [self reloadInputViews];
}
- (UIView*)inputAccessoryView {
  UIToolbar* bar = [[UIToolbar alloc] initWithFrame:CGRectMake(0, 0, self.bounds.size.width, 36)];
  bar.items = @[[[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemFlexibleSpace target:nil action:nil], [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemDone target:self action:@selector(finishEditing)]];
  return bar;
}
- (void)finishEditing {
  auto& h = host();
  pthread_mutex_lock(&h.mutex); h.signals.push_back("imeaction done"); pthread_mutex_unlock(&h.mutex);
  [self resignFirstResponder];
}
- (void)insertText:(NSString*)text {
  auto& h = host();
  pthread_mutex_lock(&h.mutex);
  if ([text isEqualToString:@"\n"]) h.text.key(HAL_KEY_ENTER);
  else h.text.text(text.UTF8String ?: "");
  pthread_mutex_unlock(&h.mutex);
  if ([text isEqualToString:@"\n"] && self.dismissOnReturn) [self resignFirstResponder];
}
- (void)deleteBackward {
  auto& h = host();
  pthread_mutex_lock(&h.mutex); h.text.key(HAL_KEY_BACKSPACE); pthread_mutex_unlock(&h.mutex);
}
- (void)touchesBegan:(NSSet*)touches withEvent:(UIEvent*)event {
  (void)event;
  CGPoint p = [[touches anyObject] locationInView:self];
  auto& h = host();
  pthread_mutex_lock(&h.mutex);
  if (h.remoteInput) { pthread_mutex_unlock(&h.mutex); return; }
  h.x = p.x * h.width / self.bounds.size.width;
  h.y = p.y * h.height / self.bounds.size.height;
  h.down = true;
  pthread_mutex_unlock(&h.mutex);
}
- (void)touchesMoved:(NSSet*)touches withEvent:(UIEvent*)event { [self touchesBegan:touches withEvent:event]; }
- (void)touchesEnded:(NSSet*)touches withEvent:(UIEvent*)event {
  (void)touches; (void)event;
  auto& h = host();
  pthread_mutex_lock(&h.mutex); if (!h.remoteInput) h.down = false; pthread_mutex_unlock(&h.mutex);
}
- (void)touchesCancelled:(NSSet*)touches withEvent:(UIEvent*)event { [self touchesEnded:touches withEvent:event]; }
@end

namespace {
void controlKeyboard(const char* action) {
  NSString* command = [NSString stringWithUTF8String:action];
  dispatch_async(dispatch_get_main_queue(), ^{
    ZincLegacyView* view = (ZincLegacyView*)host().image;
    if ([command isEqual:@"done"]) [view finishEditing];
    else if ([command isEqual:@"return"]) [view insertText:@"\n"];
    else {
      NSDictionary* state = @{@"firstResponder": @(view.isFirstResponder), @"keyboardType": @(view.keyboardType), @"returnKeyType": @(view.returnKeyType), @"secure": @(view.secureTextEntry), @"inset": @(host().keyboardInset), @"traits": view.inputTraits ?: @""};
      NSData* data = [NSJSONSerialization dataWithJSONObject:state options:0 error:nil];
      NSString* path = [[NSString stringWithUTF8String:host().directory] stringByAppendingPathComponent:@"keyboard.json"];
      if (![data writeToFile:path atomically:YES]) fprintf(stderr, "zinc: could not save keyboard state\n");
    }
  });
}
}

@interface ZincLegacyApp : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow* window;
@end
@implementation ZincLegacyApp
- (BOOL)application:(UIApplication*)app didFinishLaunchingWithOptions:(NSDictionary*)options {
  (void)app; (void)options;
  self.window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
  UIViewController* controller = [UIViewController new];
  ZincLegacyView* image = [[ZincLegacyView alloc] initWithFrame:self.window.bounds];
  image.backgroundColor = [UIColor blackColor];
  image.contentScaleFactor = [UIScreen mainScreen].scale;
  host().scale = static_cast<int>(image.contentScaleFactor);
  CAEAGLLayer* layer = (CAEAGLLayer*)image.layer;
  layer.opaque = YES;
  layer.drawableProperties = @{kEAGLDrawablePropertyRetainedBacking: @NO, kEAGLDrawablePropertyColorFormat: kEAGLColorFormatRGBA8};
  image.userInteractionEnabled = YES;
  image.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  controller.view = image;
  UILabel* output = [[UILabel alloc] initWithFrame:CGRectInset(image.bounds, 12, 24)];
  output.numberOfLines = 0;
  output.textColor = [UIColor whiteColor];
  output.font = [UIFont systemFontOfSize:15];
  output.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [image addSubview:output];
  host().image = image;
  host().output = output;
  NSString* directory = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Zinc"];
  NSError* error = nil;
  if (![[NSFileManager defaultManager] createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:&error]
      || strlcpy(host().directory, directory.fileSystemRepresentation, sizeof host().directory) >= sizeof host().directory) {
    output.text = @"Zinc could not create its data directory.";
    NSLog(@"zinc: data directory: %@", error);
    self.window.rootViewController = controller;
    [self.window makeKeyAndVisible];
    return YES;
  }
  self.window.rootViewController = controller;
  [self.window makeKeyAndVisible];
  [[NSNotificationCenter defaultCenter] addObserverForName:UIKeyboardWillChangeFrameNotification object:nil queue:nil usingBlock:^(NSNotification* note) {
    CGRect frame = [image convertRect:[note.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue] fromView:nil];
    auto& h = host();
    pthread_mutex_lock(&h.mutex);
    int inset = static_cast<int>(MAX(0, CGRectGetMaxY(image.bounds) - frame.origin.y) * h.height / image.bounds.size.height);
    h.keyboardInset = inset;
    double duration = [note.userInfo[UIKeyboardAnimationDurationUserInfoKey] doubleValue] * 1000;
    int curve = [note.userInfo[UIKeyboardAnimationCurveUserInfoKey] intValue];
    h.signals.push_back("keyboard " + std::to_string(inset) + " " + std::to_string(duration) + " " + std::to_string(curve));
    pthread_mutex_unlock(&h.mutex);
  }];
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @autoreleasepool {
      NSString* path = [[[NSBundle mainBundle] bundlePath] stringByAppendingPathComponent:@"ZincLegacy"];
      char* argv[] = {const_cast<char*>(path.fileSystemRepresentation), nullptr};
      NSString* data = [NSString stringWithUTF8String:host().directory];
      if (!freopen([data stringByAppendingPathComponent:@"stdout.txt"].fileSystemRepresentation, "w", stdout)
          || !freopen([data stringByAppendingPathComponent:@"stderr.txt"].fileSystemRepresentation, "w", stderr)) {
        NSLog(@"zinc: could not open the program logs");
        return;
      }
      setvbuf(stderr, nullptr, _IONBF, 0);
      // Keep the system keyboard and SpringBoard responsive on the single-core A4.
      setpriority(PRIO_DARWIN_THREAD, 0, 10);
      startControl();
      int status = zn_console_main(1, argv);
      NSLog(@"zinc: interpreter ended (%d)", status);
    }
  });
  return YES;
}
- (void)applicationWillResignActive:(UIApplication*)app { (void)app; pause(true); }
- (void)applicationDidBecomeActive:(UIApplication*)app { (void)app; pause(false); }
@end

int main(int argc, char** argv) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass([ZincLegacyApp class])); }
}

extern "C" {
const char* hal_device(const char* query, const char* argument) {
  if (!strcmp(query, "platform")) return "ios";
  if (strcmp(query, "keyboard-traits")) return nullptr;
  NSString* traits = [NSString stringWithUTF8String:argument ?: ""];
  dispatch_async(dispatch_get_main_queue(), ^{ [(ZincLegacyView*)host().image applyTraits:traits]; });
  return "1";
}
void hal_init(const HalConfig* config) {
  auto& h = host();
  pthread_mutex_lock(&h.mutex);
  h.width = config->width; h.height = config->height;
  pthread_mutex_unlock(&h.mutex);
  h.pixels.resize(static_cast<size_t>(h.width) * h.height);
  if (const char* frames = getenv("ZINC_FRAMES")) h.framesLeft = atoi(frames);
}
void hal_shutdown() {}
void hal_frame_begin() { host().frameStart = hal_time_us(); }
void hal_frame_end() {
  uint64_t elapsed = hal_time_us() - host().frameStart;
  if (elapsed < 16667) hal_sleep_us(16667 - elapsed);
}
void hal_poll_input(HalInput* input) {
  auto& h = host();
  for (;;) {
    pthread_mutex_lock(&h.mutex);
    if (!h.paused) break;
    pthread_mutex_unlock(&h.mutex);
    usleep(50000);
  }
  *input = {};
  pollControl();
  if (h.dragStart) {
    const uint64_t elapsed = rawTimeUs() - h.dragStart;
    const float t = fminf(1, (double)elapsed / h.dragDuration);
    h.x = h.dragX0 + (h.dragX1 - h.dragX0) * t; h.y = h.dragY0 + (h.dragY1 - h.dragY0) * t;
    if (elapsed >= h.dragDuration + 100000) { h.dragStart = 0; h.down = false; h.remoteInput = false; }
  }
  if (h.framesLeft >= 0) input->quit = h.framesLeft-- == 0;
  input->px = h.x; input->py = h.y; input->pdown = h.down;
  h.text.drain(*input);
  if (h.down) { input->ntouch = 1; input->touch[0] = {1, h.x, h.y}; }
  if (h.tapFrames && !--h.tapFrames) { h.down = false; h.remoteInput = false; }
  bool info = h.info; h.info = false;
  pthread_mutex_unlock(&h.mutex);
  if (info) zn_legacy_write_info(h.directory);
}
void hal_present(const HalFrame*) { hal_panic("the GLES display driver did not initialize", __FILE__, __LINE__); }

void hal_surface_size(int* width, int* height) { *width = host().width; *height = host().height; }
int32_t hal_pixel_scale() { return host().scale; }
void hal_text_input(int32_t on, float, float, float, float) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (on) [host().image becomeFirstResponder]; else [host().image resignFirstResponder];
  });
}
int zn_hal_signal_count() {
  auto& h = host();
  pthread_mutex_lock(&h.mutex); int count = static_cast<int>(h.signals.size()); pthread_mutex_unlock(&h.mutex);
  return count;
}
const char* zn_hal_signal_next() {
  auto& h = host();
  pthread_mutex_lock(&h.mutex);
  h.signalLine = h.signals.empty() ? "" : std::move(h.signals.front());
  if (!h.signals.empty()) h.signals.pop_front();
  pthread_mutex_unlock(&h.mutex);
  return h.signalLine.c_str();
}
double hal_fixed_dt() { return getenv("ZINC_DETERMINISTIC") ? 1.0 / 60.0 : 0; }
void hal_run(int (*step)()) { while (step()) {} }
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us() {
  auto& h = host();
  pthread_mutex_lock(&h.mutex);
  uint64_t time = (h.paused ? h.pausedAt : rawTimeUs()) - h.pausedUs;
  pthread_mutex_unlock(&h.mutex);
  return time;
}
void hal_sleep_us(uint64_t us) { usleep(static_cast<useconds_t>(us > 1000000 ? 1000000 : us)); }
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_log_err(const char* s, size_t n) { fwrite(s, 1, n, stderr); fflush(stderr); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char* name) { return getenv(name); }
void hal_heap_region(void** base, size_t* size) { *size = 48u << 20; *base = malloc(*size); if (!*base) *size = 0; }
void hal_trap_faults(void (*)(const char*)) {}
void hal_panic(const char* message, const char* file, int line) { fprintf(stderr, "%s (%s:%d)\n", message, file, line); abort(); }
void zn_console_echo(const char* text, size_t size) {
  @autoreleasepool {
    NSString* output = [[NSString alloc] initWithBytes:text length:size encoding:NSUTF8StringEncoding];
    dispatch_sync(dispatch_get_main_queue(), ^{ host().output.text = output; });
  }
}
const char* zn_console_data_dir() { return host().directory; }
}

// The same display-gl driver and GLES2 command replay as the Pi and webOS hosts.
bool zgl_backend_init(const HalConfig*) {
  auto& h = host();
  h.context = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES2];
  if (!h.context || ![EAGLContext setCurrentContext:h.context]) return false;
  glGenFramebuffers(1, &h.framebuffer);
  glBindFramebuffer(GL_FRAMEBUFFER, h.framebuffer);
  glGenRenderbuffers(1, &h.colorbuffer);
  glBindRenderbuffer(GL_RENDERBUFFER, h.colorbuffer);
  if (![h.context renderbufferStorage:GL_RENDERBUFFER fromDrawable:(CAEAGLLayer*)h.image.layer]) return false;
  glGetRenderbufferParameteriv(GL_RENDERBUFFER, GL_RENDERBUFFER_WIDTH, &h.drawableWidth);
  glGetRenderbufferParameteriv(GL_RENDERBUFFER, GL_RENDERBUFFER_HEIGHT, &h.drawableHeight);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, h.colorbuffer);
  glGenRenderbuffers(1, &h.depthbuffer);
  glBindRenderbuffer(GL_RENDERBUFFER, h.depthbuffer);
  glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8_OES, h.drawableWidth, h.drawableHeight);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, h.depthbuffer);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_STENCIL_ATTACHMENT, GL_RENDERBUFFER, h.depthbuffer);
  if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) return false;
  fprintf(stderr, "zinc: EAGL %s / %s, drawable %dx%d\n", glGetString(GL_RENDERER), glGetString(GL_VERSION), h.drawableWidth, h.drawableHeight);
  dispatch_async(dispatch_get_main_queue(), ^{ host().output.hidden = YES; });
  return true;
}
int32_t zgl_backend_scale() { return host().scale; }
void zgl_backend_size(int32_t* width, int32_t* height) { *width = host().drawableWidth; *height = host().drawableHeight; }
void zgl_backend_native(int32_t* width, int32_t* height) { *width = host().width; *height = host().height; }
void zgl_backend_poll(HalInput*, int32_t, int32_t) {}   // hal_poll_input already consumed the UI queue
extern "C" GLuint zgl_backend_framebuffer() { return host().framebuffer; }
extern "C" bool zgl_backend_needs_present() { return host().screenshot; }
extern "C" bool zgl_backend_trace() { return host().gpuTrace; }
extern "C" bool zgl_backend_partial() { return true; }
extern "C" bool zgl_backend_verify() { return host().gpuVerify; }
void zgl_backend_swap() {
  auto& h = host();
  if (h.screenshot) {
    h.screenshot = false;
    @autoreleasepool {
      size_t row = static_cast<size_t>(h.drawableWidth) * 4;
      NSMutableData* pixels = [NSMutableData dataWithLength:row * h.drawableHeight];
      if (pixels) {
        glBindFramebuffer(GL_FRAMEBUFFER, h.framebuffer);
        glReadPixels(0, 0, h.drawableWidth, h.drawableHeight, GL_RGBA, GL_UNSIGNED_BYTE, pixels.mutableBytes);
        auto* bytes = static_cast<unsigned char*>(pixels.mutableBytes);
        for (int y = 0; y < h.drawableHeight / 2; ++y)
          for (size_t x = 0; x < row; ++x) std::swap(bytes[y * row + x], bytes[(h.drawableHeight - y - 1) * row + x]);
        CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)pixels);
        CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
        CGImageRef image = provider && space ? CGImageCreate(h.drawableWidth, h.drawableHeight, 8, 32, row, space,
          kCGImageAlphaPremultipliedLast, provider, nullptr, false, kCGRenderingIntentDefault) : nullptr;
        if (image) {
          NSString* path = [[NSString stringWithUTF8String:h.directory] stringByAppendingPathComponent:@"control.png"];
          if (![UIImagePNGRepresentation([UIImage imageWithCGImage:image]) writeToFile:path atomically:YES]) fprintf(stderr, "zinc: could not save GPU screenshot\n");
          CGImageRelease(image);
        }
        if (space) CGColorSpaceRelease(space);
        if (provider) CGDataProviderRelease(provider);
      }
    }
  }
  glBindRenderbuffer(GL_RENDERBUFFER, host().colorbuffer);
  [host().context presentRenderbuffer:GL_RENDERBUFFER];
  auto& timing = host();
  if (timing.frameTrace) {
    const uint64_t now = rawTimeUs();
    if (timing.lastPresentation) fprintf(stderr, "zinc presentation: at=%llu us=%llu\n", (unsigned long long)now, (unsigned long long)(now - timing.lastPresentation));
    timing.lastPresentation = now;
  }
}
void zgl_backend_shutdown() {
  auto& h = host();
  glDeleteRenderbuffers(1, &h.depthbuffer);
  glDeleteRenderbuffers(1, &h.colorbuffer);
  glDeleteFramebuffers(1, &h.framebuffer);
  [EAGLContext setCurrentContext:nil];
  h.context = nil;
}
