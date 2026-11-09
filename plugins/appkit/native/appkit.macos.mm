// zinc:appkit on macOS (D210, docs/reports/appkit-native-ui-research.md §6): the zinc:ui tree as AppKit views. zinc:ui keeps the tree, the models and
// the Yoga layout; after each changed frame commit() gets its records (ui.setHost in lib/std/ui.ts) and this file makes the views match, as React
// Native's mounting layer applies Fabric's mutations. Layout-only views (no background, border, opacity or hiding) get no NSView: their children
// hang on the nearest real ancestor with the offsets summed (React Native's view flattening). Text and fields are measured by the same AppKit cells
// that show them, through the layout's native measure hook (zn_host_set_native_measure, src/host/layout.h).
// Clicks, hover and drags are not taken here: the views let them through to SDL's view, so zinc:ui hit-tests its own tree and gives the drawn UI's
// events. Fields and scroll views take their input themselves and queue events; a zrt::Poller hands them to the program with the handle and the
// generation they were made under, and an event whose node was deleted or recycled since is dropped.
// ARC (plugin.json flags). Everything runs on the main thread: the program's commits and AppKit's callbacks inside SDL's event pump.
#define ZRT_HOSTED_CPP
#import <AppKit/AppKit.h>
#include <dlfcn.h>
#include <math.h>
#include <algorithm>
#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <unordered_map>
#include <vector>
#include "zinc_native_appkit.h"
#include "zrt_assets_dir.h"

namespace {

// TAG_NAMES of lib/std/ui.ts
enum Kind { KView, KText, KButton, KImage, KScroll, KCanvas, KFragment, KInput, KTextArea, KUnknown };
const char* const kKinds[] = {"view", "text", "button", "image", "scroll", "canvas", "fragment", "input", "textarea"};
enum Ev { EvEdit, EvChange, EvSubmit, EvFocus, EvBlur, EvScroll };

struct Node {
  bool live = false;
  uint32_t gen = 0;   // bumped by each `c` on this handle: an event remembers it
  int kind = KUnknown, parent = -1;
  double x = 0, y = 0, w = 0, h = 0;
  double cw = 0, ch = 0;   // a scroll view's content size
  std::string text, placeholder;
  double bg = -1, bgAlpha = 255, fg = -1, opacity = 1, radius = 0, border = 0, borderColor = 0, fontSize = 16, bold = 0, hidden = 0, secure = 0;
  std::vector<int> kids;
  bool dirty = true;   // properties changed since they were applied to the view
  NSView* view = nil;  // nil while flattened or not shown yet
  NSView* input = nil; // the view that edits: the field, or the text view of a textarea
  id observer = nil;   // a scroll view's bounds observer
};

struct Queued { int id; uint32_t gen; int kind; std::string text; double a, b; };

std::vector<Node> nodes;
std::vector<int> roots;
std::vector<Queued> queue;
std::unordered_map<const void*, int> idOf;   // a view that reports events -> its handle
int focusWant = -2;                          // the last `o` record (-2: none yet)
NSView* rootView = nil;

std::string str(NSString* s) { const char* u = s.UTF8String; return u ? u : ""; }
NSString* ns(const std::string& s) { return [[NSString alloc] initWithBytes:s.data() length:s.size() encoding:NSUTF8StringEncoding] ?: @""; }
Node* live(int id) { return id >= 0 && id < (int)nodes.size() && nodes[id].live ? &nodes[id] : nullptr; }
NSColor* rgb(double c, double alpha = 255) {
  const int v = (int)c;
  return [NSColor colorWithSRGBRed:((v >> 16) & 255) / 255.0 green:((v >> 8) & 255) / 255.0 blue:(v & 255) / 255.0 alpha:alpha / 255.0];
}
NSFont* fontOf(double size, bool bold) { return [NSFont systemFontOfSize:size > 0 ? size : 13 weight:bold ? NSFontWeightBold : NSFontWeightRegular]; }
/** The text colour a node inherits: its own, else the nearest ancestor's, else the system's label colour (it follows dark mode). */
double fgValue(const Node& n) {
  for (const Node* p = &n; p; p = p->parent >= 0 && p->parent < (int)nodes.size() ? &nodes[p->parent] : nullptr)
    if (p->fg >= 0) return p->fg;
  return -1;
}
NSColor* fgOf(const Node& n) { const double c = fgValue(n); return c >= 0 ? rgb(c) : nil; }
void push(NSView* v, int kind, const std::string& text = "", double a = 0, double b = 0) {
  auto it = idOf.find((__bridge const void*)v);
  if (it == idOf.end() || !live(it->second)) return;
  queue.push_back({it->second, nodes[it->second].gen, kind, text, a, b});
}
void pushEdit(NSView* v, NSString* value, NSRange sel) {
  push(v, EvEdit, str(value), sel.location == NSNotFound ? 0 : (double)sel.location, sel.location == NSNotFound ? 0 : (double)(sel.location + sel.length));
}

}  // namespace

// ---------------------------------------------------------------- the view classes
/** A View, Pressable or Button: a flipped view that draws its background and border; clicks go through it to zinc:ui. */
@interface ZnView : NSView
@property double bgColor, bgAlpha, radius, borderWidth, borderColor;
@end
@implementation ZnView
- (BOOL)isFlipped { return YES; }
- (BOOL)isOpaque { return NO; }
- (NSView*)hitTest:(NSPoint)p { NSView* v = [super hitTest:p]; return v == self ? nil : v; }
- (void)drawRect:(NSRect)dirty {
  if (self.bgColor < 0 && self.borderWidth <= 0) return;
  const double bw = self.borderWidth;
  NSRect r = NSInsetRect(self.bounds, bw / 2, bw / 2);
  NSBezierPath* path = [NSBezierPath bezierPathWithRoundedRect:r xRadius:fmax(0, self.radius - bw / 2) yRadius:fmax(0, self.radius - bw / 2)];
  if (self.bgColor >= 0) { [rgb(self.bgColor, self.bgAlpha) setFill]; [path fill]; }
  if (bw > 0) { [rgb(self.borderColor) setStroke]; path.lineWidth = bw; [path stroke]; }
}
@end

/** The root: the window's background colour (it follows dark mode) under the tree; clicks go through to SDL's view. */
@interface ZnRoot : NSView
@end
@implementation ZnRoot
- (BOOL)isFlipped { return YES; }
- (NSView*)hitTest:(NSPoint)p { NSView* v = [super hitTest:p]; return v == self ? nil : v; }
- (void)drawRect:(NSRect)dirty { [NSColor.windowBackgroundColor setFill]; NSRectFill(dirty); }
@end

@interface ZnLabel : NSTextField
@end
@implementation ZnLabel
- (NSView*)hitTest:(NSPoint)p { return nil; }
@end

@interface ZnImage : NSImageView
@end
@implementation ZnImage
- (NSView*)hitTest:(NSPoint)p { return nil; }
@end

/** A scroll view's document: flipped, so its content starts at the top. */
@interface ZnDoc : NSView
@end
@implementation ZnDoc
- (BOOL)isFlipped { return YES; }
@end

@interface ZnField : NSTextField
@end
@implementation ZnField
- (BOOL)becomeFirstResponder { BOOL ok = [super becomeFirstResponder]; if (ok) push(self, EvFocus); return ok; }
@end
@interface ZnSecureField : NSSecureTextField
@end
@implementation ZnSecureField
- (BOOL)becomeFirstResponder { BOOL ok = [super becomeFirstResponder]; if (ok) push(self, EvFocus); return ok; }
@end
@interface ZnTextView : NSTextView
@end
@implementation ZnTextView
- (BOOL)becomeFirstResponder { BOOL ok = [super becomeFirstResponder]; if (ok) push(self, EvFocus); return ok; }
@end

/** The fields' and text views' delegate: edits, the end of editing (and Enter), as the DOM host reports them (domEdit, domChanged, submitFrom). */
@interface ZnDelegate : NSObject <NSTextFieldDelegate, NSTextViewDelegate>
@end
@implementation ZnDelegate
- (void)controlTextDidChange:(NSNotification*)n {
  NSTextField* f = n.object;
  pushEdit(f, f.stringValue, f.currentEditor ? f.currentEditor.selectedRange : NSMakeRange(f.stringValue.length, 0));
}
- (void)controlTextDidEndEditing:(NSNotification*)n {
  NSTextField* f = n.object;
  push(f, EvChange);
  if ([n.userInfo[@"NSTextMovement"] integerValue] == NSReturnTextMovement) push(f, EvSubmit);
  push(f, EvBlur);
}
- (void)textDidChange:(NSNotification*)n { NSTextView* t = n.object; pushEdit(t, t.string, t.selectedRange); }
- (void)textDidEndEditing:(NSNotification*)n { push(n.object, EvChange); push(n.object, EvBlur); }
@end

namespace {

ZnDelegate* delegate() { static ZnDelegate* d = [[ZnDelegate alloc] init]; return d; }

// ---------------------------------------------------------------- measuring (the layout's native measure hook)
/** Text and field leaves sized by the cells that show them: a wrapping label for a text, a field's cell for an input; a textarea is `rows` lines. */
int measure(void*, int32_t node, int kind, const char* text, size_t len, int32_t size, int32_t whiteSpace, int32_t clamp, float, int32_t rows, float width, int wm,
            float, int, float* outW, float* outH) {
  @autoreleasepool {
    const bool bold = node >= 0 && node < (int)nodes.size() && nodes[node].bold != 0;   // ponytail: known from the last commit; a new bold text is measured regular once
    NSFont* font = fontOf(size, bold);
    const double avail = wm == 0 || whiteSpace == 1 ? CGFLOAT_MAX : width;
    if (kind == 0) {
      static NSTextField* label = [NSTextField wrappingLabelWithString:@""];
      label.font = font;
      label.maximumNumberOfLines = clamp;
      label.stringValue = [[NSString alloc] initWithBytes:text length:len encoding:NSUTF8StringEncoding] ?: @"";
      const NSSize s = [label.cell cellSizeForBounds:NSMakeRect(0, 0, avail, CGFLOAT_MAX)];
      *outW = (float)fmin(ceil(s.width), avail);
      *outH = (float)ceil(s.height);
      return 1;
    }
    static NSTextField* field = [[NSTextField alloc] initWithFrame:NSZeroRect];
    field.font = font;
    field.stringValue = @"Mg";
    const double one = ceil([field.cell cellSizeForBounds:NSMakeRect(0, 0, CGFLOAT_MAX, CGFLOAT_MAX)].height);
    const double line = ceil(font.ascender - font.descender + font.leading);
    *outW = (float)(wm == 0 ? 200 : wm == 2 ? fmin(200, width) : width);
    *outH = (float)(rows <= 1 ? one : rows * line + 8);   // a text view in a scroll view: its lines and the text container's insets
    return 1;
  }
}

// ---------------------------------------------------------------- making the views match the tree
bool layoutOnly(const Node& n) {
  if (n.kind == KFragment) return true;
  return (n.kind == KView || n.kind == KButton) && n.bg < 0 && n.border <= 0 && n.opacity >= 1 && n.hidden == 0;
}
void forget(Node& n) {
  if (n.observer) { [NSNotificationCenter.defaultCenter removeObserver:n.observer]; n.observer = nil; }
  if (n.input) { idOf.erase((__bridge const void*)n.input); if (n.input.window.firstResponder == n.input || ([n.input isKindOfClass:NSTextField.class] && ((NSTextField*)n.input).currentEditor)) [n.input.window makeFirstResponder:nil]; }
  if (n.view) { idOf.erase((__bridge const void*)n.view); [n.view removeFromSuperview]; }
  n.view = nil; n.input = nil; n.dirty = true;
}
NSView* make(int id, Node& n) {
  NSView* v = nil;
  if (n.kind == KText) v = [ZnLabel wrappingLabelWithString:@""];
  else if (n.kind == KImage) { ZnImage* im = [[ZnImage alloc] initWithFrame:NSZeroRect]; im.imageScaling = NSImageScaleProportionallyUpOrDown; v = im; }
  else if (n.kind == KScroll) {
    NSScrollView* s = [[NSScrollView alloc] initWithFrame:NSZeroRect];
    s.drawsBackground = NO;
    s.autohidesScrollers = YES;
    s.documentView = [[ZnDoc alloc] initWithFrame:NSZeroRect];
    s.contentView.postsBoundsChangedNotifications = YES;
    __weak NSScrollView* weak = s;
    n.observer = [NSNotificationCenter.defaultCenter addObserverForName:NSViewBoundsDidChangeNotification object:s.contentView queue:nil usingBlock:^(NSNotification*) {
      NSScrollView* sv = weak;
      if (sv) push(sv, EvScroll, "", sv.contentView.bounds.origin.x, sv.contentView.bounds.origin.y);
    }];
    v = s;
  } else if (n.kind == KInput) {
    NSTextField* f = n.secure ? [[ZnSecureField alloc] initWithFrame:NSZeroRect] : [[ZnField alloc] initWithFrame:NSZeroRect];
    f.delegate = delegate();
    f.usesSingleLineMode = YES;
    f.bezelStyle = NSTextFieldRoundedBezel;   // the system's look of a text field (a square bezel crops a field's text at zinc:ui's heights)
    n.input = f; v = f;
  } else if (n.kind == KTextArea) {
    NSScrollView* s = [[NSScrollView alloc] initWithFrame:NSZeroRect];
    s.hasVerticalScroller = YES; s.autohidesScrollers = YES; s.borderType = NSBezelBorder;
    ZnTextView* t = [[ZnTextView alloc] initWithFrame:NSZeroRect];
    t.delegate = delegate();
    t.richText = NO; t.verticallyResizable = YES; t.horizontallyResizable = NO;
    t.autoresizingMask = NSViewWidthSizable;
    t.textContainer.widthTracksTextView = YES;
    s.documentView = t;
    n.input = t; v = s;
  } else v = [[ZnView alloc] initWithFrame:NSZeroRect];   // view, button, canvas (drawn islands come later), anything new
  idOf[(__bridge const void*)v] = id;
  if (n.input) idOf[(__bridge const void*)n.input] = id;
  n.view = v; n.dirty = true;
  return v;
}
NSImage* imageNamed(const std::string& name) {
  if (name.empty()) return nil;
  std::string path = name;
  if (name[0] != '/') {
    const char* env = getenv("ZINC_ASSETS");
    const std::string dir = env && *env ? env : zrt_program_assets_dir(true);
    path = dir + "/" + name;
  }
  return [[NSImage alloc] initWithContentsOfFile:ns(path)];
}
void apply(Node& n) {
  NSView* v = n.view;
  v.hidden = n.hidden != 0;
  v.alphaValue = n.opacity;
  if ([v isKindOfClass:ZnView.class]) {
    ZnView* z = (ZnView*)v;
    z.bgColor = n.bg; z.bgAlpha = n.bgAlpha; z.radius = n.radius; z.borderWidth = n.border; z.borderColor = n.borderColor;
    z.needsDisplay = YES;
  } else if (n.kind == KText) {
    NSTextField* l = (NSTextField*)v;
    l.font = fontOf(n.fontSize, n.bold != 0);
    l.textColor = fgOf(n) ?: NSColor.labelColor;
    NSString* s = ns(n.text);
    if (![l.stringValue isEqualToString:s]) l.stringValue = s;
  } else if (n.kind == KImage) {
    ((NSImageView*)v).image = imageNamed(n.text);
  } else if (n.kind == KInput) {
    NSTextField* f = (NSTextField*)v;
    f.font = fontOf(n.fontSize, n.bold != 0);
    if (NSColor* c = fgOf(n)) f.textColor = c; else f.textColor = NSColor.controlTextColor;
    f.placeholderString = n.placeholder.empty() ? nil : ns(n.placeholder);
    NSString* s = ns(n.text);
    if (![f.stringValue isEqualToString:s]) f.stringValue = s;
  } else if (n.kind == KTextArea) {
    NSTextView* t = (NSTextView*)n.input;
    t.font = fontOf(n.fontSize, n.bold != 0);
    t.textColor = fgOf(n) ?: NSColor.textColor;
    NSString* s = ns(n.text);
    if (![t.string isEqualToString:s]) t.string = s;
  }
  n.dirty = false;
}
void setFrame(NSView* v, double x, double y, double w, double h) {
  const NSRect r = NSMakeRect(x, y, w, h);
  if (!NSEqualRects(v.frame, r)) v.frame = r;
}
/** Places node id (and its subtree) under the real view whose list is `into`, offset by the flattened ancestors (ox, oy). */
void place(int id, double ox, double oy, NSMutableArray<NSView*>* into) {
  Node* np = live(id);
  if (!np) return;
  Node& n = *np;
  const double x = ox + n.x, y = oy + n.y;
  if (layoutOnly(n)) {
    if (n.view) forget(n);
    for (int k : n.kids) place(k, x, y, into);
    return;
  }
  if (n.kind == KInput && n.view && [n.view isKindOfClass:NSSecureTextField.class] != (n.secure != 0)) forget(n);   // secure is another class
  if (!n.view) make(id, n);
  if (n.dirty) apply(n);
  setFrame(n.view, x, y, n.w, n.h);
  [into addObject:n.view];
  if (n.kind == KText || n.kind == KInput || n.kind == KTextArea || n.kind == KImage) return;   // leaves (a text's spans are in its string)
  NSMutableArray<NSView*>* sub = [NSMutableArray array];
  for (int k : n.kids) place(k, 0, 0, sub);
  NSView* box = n.kind == KScroll ? ((NSScrollView*)n.view).documentView : n.view;
  if (![box.subviews isEqualToArray:sub]) box.subviews = sub;
  if (n.kind == KScroll) {   // the content: the union of the children's boxes; an axis scrolls only when it is larger than the box (ponytail: no content padding)
    NSScrollView* sv = (NSScrollView*)n.view;
    n.cw = n.w; n.ch = n.h;
    for (NSView* s in sub) { n.cw = fmax(n.cw, NSMaxX(s.frame)); n.ch = fmax(n.ch, NSMaxY(s.frame)); }
    const bool across = n.cw > n.w + 0.5, down = n.ch > n.h + 0.5;
    if (sv.hasHorizontalScroller != across) sv.hasHorizontalScroller = across;
    if (sv.hasVerticalScroller != down) sv.hasVerticalScroller = down;
    const NSSize vis = sv.contentSize;   // without the scrollers when they take room (the system's "show scroll bars" setting)
    setFrame(box, 0, 0, across ? n.cw : vis.width, down ? n.ch : vis.height);
  }
}
NSWindow* sdlWindow() {
  for (NSWindow* w in NSApp.windows)
    if ([NSStringFromClass(w.class) hasPrefix:@"SDL"]) return w;   // ponytail: SDL's own window class; the main window only (more windows: ZN-1071)
  return nil;
}
/** The root over SDL's view, the surface's logical pixels mapped onto it as the renderer maps them (letterbox); headless: a view in no window. */
void placeRoot() {
  static auto surface = reinterpret_cast<void (*)(int*, int*)>(dlsym(RTLD_DEFAULT, "hal_surface_size"));
  int W = 0, H = 0;
  if (surface) surface(&W, &H);
  if (W <= 0 || H <= 0) { W = 320; H = 240; }
  if (!rootView) {
    rootView = [[ZnRoot alloc] initWithFrame:NSMakeRect(0, 0, W, H)];
    if (const char* a = getenv("ZINC_APPEARANCE"); a && *a)   // light or dark for one run (tests, screenshots); the system's setting otherwise
      rootView.appearance = [NSAppearance appearanceNamed:strcmp(a, "dark") == 0 ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
  }
  NSWindow* w = sdlWindow();
  if (w && rootView.window != w) [w.contentView addSubview:rootView positioned:NSWindowAbove relativeTo:nil];
  if (!w && !rootView.window) {   // headless (no SDL window): a window that is never shown, so fields can take the first responder (the tests drive them)
    if (!NSApp) { [NSApplication sharedApplication]; [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited]; }   // no Dock icon, never active
    static NSWindow* off = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, W, H) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:YES];
    off.releasedWhenClosed = NO;
    [off.contentView addSubview:rootView];
  }
  NSView* host = rootView.superview;
  if (!host) { setFrame(rootView, 0, 0, W, H); return; }
  const NSSize s = host.bounds.size;
  const double k = fmin(s.width / W, s.height / H);
  setFrame(rootView, (s.width - W * k) / 2, (s.height - H * k) / 2, W * k, H * k);
  if (!NSEqualSizes(rootView.bounds.size, NSMakeSize(W, H))) rootView.bounds = NSMakeRect(0, 0, W, H);
}
void moveFocus() {
  if (focusWant == -2) return;
  NSWindow* w = rootView.window;
  if (!w) return;
  Node* n = live(focusWant);
  NSView* want = n ? n->input : nil;
  NSResponder* now = w.firstResponder;
  const bool has = want && (now == want || ([now isKindOfClass:NSTextView.class] && ((NSTextView*)now).delegate == (id)want));   // a field edits in the window's field editor
  if (want && !has) [w makeFirstResponder:want];
  else if (!want && [now isKindOfClass:NSTextView.class] && idOf.count((__bridge const void*)now) + idOf.count((__bridge const void*)((NSTextView*)now).delegate) > 0) [w makeFirstResponder:nil];
  focusWant = -2;
}

// ---------------------------------------------------------------- the records
double num(const char*& p) { char* e; const double v = strtod(p, &e); p = e; if (*p == ' ') p++; return v; }
std::string unescape(const char* p, const char* end) {
  std::string out;
  for (; p < end; p++) {
    if (*p == '\\' && p + 1 < end) { p++; out += *p == 'n' ? '\n' : *p; }
    else out += *p;
  }
  return out;
}
void record(const char* p, const char* end) {
  const char op = *p;
  p += 2;
  if (op == 'r') { roots.clear(); while (p < end) roots.push_back((int)num(p)); return; }
  const int id = (int)num(p);
  if (op == 'o') { focusWant = id; return; }
  if (id < 0) return;
  if (id >= (int)nodes.size()) nodes.resize(id + 1);
  Node& n = nodes[id];
  switch (op) {
    case 'd': {
      forget(n);
      const uint32_t g = n.gen;
      n = Node{};
      n.gen = g;
      queue.erase(std::remove_if(queue.begin(), queue.end(), [id](const Queued& q) { return q.id == id; }), queue.end());   // a closed slot's events go with it
      return;
    }
    case 'c': {
      if (n.live) forget(n);   // (a `d` came first; never trust it)
      const uint32_t g = n.gen + 1;
      n = Node{};
      n.gen = g; n.live = true;
      const std::string k(p, end);
      for (int i = 0; i < KUnknown; i++) if (k == kKinds[i]) n.kind = i;
      return;
    }
    case 'f': n.x = num(p); n.y = num(p); n.w = num(p); n.h = num(p); return;
    case 't': n.text = unescape(p, end); n.dirty = true; return;
    case 'a': {
      const char* sp = (const char*)memchr(p, ' ', end - p);
      const std::string name(p, sp ? sp : end);
      if (name == "placeholder") n.placeholder = sp ? unescape(sp + 1, end) : "";
      n.dirty = true;
      return;
    }
    case 'p': {
      const char* sp = (const char*)memchr(p, ' ', end - p);
      if (!sp) return;
      const std::string name(p, sp);
      const double v = strtod(sp + 1, nullptr);
      double Node::*const fields[] = {&Node::bg, &Node::bgAlpha, &Node::fg, &Node::opacity, &Node::radius, &Node::border, &Node::borderColor, &Node::fontSize, &Node::bold, &Node::hidden, &Node::secure};
      const char* const names[] = {"bg", "bgAlpha", "fg", "opacity", "radius", "border", "borderColor", "fontSize", "bold", "hidden", "secure"};
      for (int i = 0; i < 11; i++) if (name == names[i]) n.*fields[i] = v;
      n.dirty = true;
      if (name == "fg") for (Node& m : nodes) if (m.live && m.kind == KText) m.dirty = true;   // ponytail: an inherited colour; every text, not only the subtree
      return;
    }
    case 'k':
      for (int k : n.kids) if (k >= 0 && k < (int)nodes.size() && nodes[k].parent == id) nodes[k].parent = -1;
      n.kids.clear();
      while (p < end) { const int k = (int)num(p); n.kids.push_back(k); if (k >= 0 && k < (int)nodes.size()) nodes[k].parent = id; }
      return;
  }
}

// ---------------------------------------------------------------- the dump
std::string hex(double c) { char b[16]; snprintf(b, sizeof b, "#%06x", (int)c & 0xffffff); return b; }
std::string qstr(const std::string& s) {
  std::string out = "\"";
  for (char c : s) out += c == '\n' ? std::string("\\n") : c == '"' ? std::string("\\\"") : std::string(1, c);
  return out + "\"";
}
void dumpView(NSView* v, int depth, std::string& out) {
  auto it = idOf.find((__bridge const void*)v);
  Node* n = it != idOf.end() ? live(it->second) : nullptr;
  if (!n) { for (NSView* s in v.subviews) dumpView(s, depth, out); return; }   // AppKit's own views (a scroll view's clip view and document)
  char b[160];
  const NSRect f = v.frame;
  const char* kind = n->kind == KText ? "label" : n->kind == KImage ? "image" : n->kind == KScroll ? "scroll" : n->kind == KInput ? (n->secure ? "secure" : "field") : n->kind == KTextArea ? "area" : "view";
  snprintf(b, sizeof b, "%*s#%d %s %g,%g %gx%g", depth * 2, "", it->second, kind, f.origin.x, f.origin.y, f.size.width, f.size.height);
  out += b;
  if (n->kind == KText || n->kind == KInput || n->kind == KTextArea || n->kind == KImage) out += " " + qstr(n->text);
  if (!n->placeholder.empty()) out += " placeholder=" + qstr(n->placeholder);
  if (n->kind == KText || n->kind == KInput || n->kind == KTextArea) {
    const double fg = fgValue(*n);
    snprintf(b, sizeof b, " size=%g%s fg=", n->fontSize, n->bold ? " bold" : "");
    out += b + (fg >= 0 ? hex(fg) : n->kind == KText ? "label" : "text");   // the system colours by name: they follow dark mode
  }
  if (n->bg >= 0) out += " bg=" + hex(n->bg) + (n->bgAlpha < 255 ? "/" + std::to_string((int)n->bgAlpha) : "");
  if (n->border > 0) { snprintf(b, sizeof b, " border=%g", n->border); out += b + hex(n->borderColor); }
  if (n->radius > 0) { snprintf(b, sizeof b, " radius=%g", n->radius); out += b; }
  if (n->opacity < 1) { snprintf(b, sizeof b, " opacity=%g", n->opacity); out += b; }
  if (n->hidden) out += " hidden";
  if (n->kind == KImage) out += ((NSImageView*)v).image ? " loaded" : " missing";
  if (n->kind == KScroll) { snprintf(b, sizeof b, " content=%gx%g", n->cw, n->ch); out += b; }   // zinc:ui's sizes, not AppKit's (they depend on the scroller setting)
  out += "\n";
  if (n->kind == KScroll) { for (NSView* s in ((NSScrollView*)v).documentView.subviews) dumpView(s, depth + 1, out); return; }
  if (n->kind == KTextArea) return;
  for (NSView* s in v.subviews) dumpView(s, depth + 1, out);
}

struct MacAppkit : NativeAppkit, zrt::Poller {
  zrt::Fn<void(int32_t, int32_t, zrt::String, double, double)> cb;
  bool started = false;

  bool start() override {
    if (!started) {
      static auto hook = reinterpret_cast<void (*)(decltype(&measure), void*)>(dlsym(RTLD_DEFAULT, "zn_host_set_native_measure"));
      if (hook) hook(&measure, nullptr);   // a program that never lays out with Yoga has no hook: its leaves keep the engine's measure
      started = true;
    }
    return true;
  }
  void commit(zrt::String changes) override {
    @autoreleasepool {
      const char* p = changes.ptr();
      const char* end = p + changes.bytes();
      while (p < end) {
        const char* nl = (const char*)memchr(p, '\n', end - p);
        if (!nl) nl = end;
        if (nl - p >= 2) record(p, nl);
        p = nl + 1;
      }
      placeRoot();
      NSMutableArray<NSView*>* top = [NSMutableArray array];
      for (int r : roots) place(r, 0, 0, top);   // ponytail: the whole tree each commit, views touched only where something differs; incremental if ZN-1074's measures ask
      if (![rootView.subviews isEqualToArray:top]) rootView.subviews = top;
      moveFocus();
    }
  }
  zrt::String dump() override {
    std::string out;
    if (rootView) {
      char b[64];
      snprintf(b, sizeof b, "root %gx%g\n", rootView.bounds.size.width, rootView.bounds.size.height);
      out = b;
      for (NSView* v in rootView.subviews) dumpView(v, 1, out);
    }
    return zrt::String::from(out.data(), (uint32_t)out.size());
  }
  bool snapshot(zrt::String path) override {
    @autoreleasepool {
      if (!rootView) return false;
      NSBitmapImageRep* rep = [rootView bitmapImageRepForCachingDisplayInRect:rootView.bounds];
      if (!rep) return false;
      [rootView cacheDisplayInRect:rootView.bounds toBitmapImageRep:rep];
      NSData* png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
      return [png writeToFile:ns(std::string(path.ptr(), path.bytes())) atomically:YES];
    }
  }
  int32_t hit(double x, double y) override {
    if (!rootView.superview) return -1;
    for (NSView* v = [rootView hitTest:[rootView convertPoint:NSMakePoint(x, y) toView:rootView.superview]]; v; v = v.superview) {
      auto it = idOf.find((__bridge const void*)v);
      if (it != idOf.end()) return it->second;
    }
    return -1;
  }
  bool drive(int32_t id, int32_t action, zrt::String text, double x, double y) override {
    @autoreleasepool {
      Node* n = live(id);
      if (!n || !n->view) return false;
      NSString* s = ns(std::string(text.ptr(), text.bytes()));
      if (action == 2) {
        if (n->kind != KScroll) return false;
        NSScrollView* sv = (NSScrollView*)n->view;
        [sv.contentView scrollToPoint:NSMakePoint(x, y)];
        [sv reflectScrolledClipView:sv.contentView];
        return true;
      }
      if (!n->input || !n->input.window) return false;
      if (n->input.window.firstResponder != n->input && !([n->input isKindOfClass:NSTextField.class] && ((NSTextField*)n->input).currentEditor)) [n->input.window makeFirstResponder:n->input];
      NSTextView* ed = [n->input isKindOfClass:NSTextField.class] ? (NSTextView*)((NSTextField*)n->input).currentEditor : (NSTextView*)n->input;
      if (!ed) return false;
      if (action == 0) [ed insertText:s replacementRange:ed.selectedRange];
      else if (action == 1) [ed insertNewline:nil];
      else return false;
      return true;
    }
  }
  void onEvent(zrt::Fn<void(int32_t, int32_t, zrt::String, double, double)> f) override { cb = f; }

  bool poll() override {
    if (rootView && rootView.superview) placeRoot();   // follows the window's size
    if (queue.empty()) return false;
    std::vector<Queued> evs;
    evs.swap(queue);
    for (const Queued& e : evs) {
      if (!cb) break;
      Node* n = live(e.id);
      if (!n || n->gen != e.gen) continue;   // deleted, or the handle holds another node since
      zrt::Fn<void(int32_t, int32_t, zrt::String, double, double)> f = cb;
      f(e.id, e.kind, zrt::String::from(e.text.data(), (uint32_t)e.text.size()), e.a, e.b);
      zrt::check_uncaught();
    }
    return true;
  }
  void shutdown() override {
    cb = nullptr;
    queue.clear();
    for (Node& n : nodes) forget(n);
    nodes.clear(); roots.clear(); idOf.clear();
    [rootView removeFromSuperview];
    rootView = nil; focusWant = -2;
    static auto hook = reinterpret_cast<void (*)(decltype(&measure), void*)>(dlsym(RTLD_DEFAULT, "zn_host_set_native_measure"));
    if (hook && started) hook(nullptr, nullptr);
    started = false;
  }
};

}  // namespace

NativeAppkit* zinc_create_Appkit() {
  static MacAppkit m;
  m.rc = zrt::IMMORTAL;
  zrt::add_poller(&m);
  return &m;
}
