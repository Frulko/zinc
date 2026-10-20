// zinc:ui's accessibility tree for VoiceOver, Switch Control, Voice Control and XCUITest (ZN-630, docs/reports/zinc-next-a11y-bridges.md): the
// nodes the program sends (zinc:sys device('a11y', lines), lib/std/ui.ts syncA11y) become UIAccessibilityElements of a container laid over SDL's
// view (Flutter's SemanticsObject does the same). A node that takes clicks holds its descendants, as a UIButton holds its label: they are not
// elements of their own, and their text is its label when it has none. accessibilityActivate, the reader's cursor and a three-finger scroll come
// back to the program as the signals `a11yactivate ID`, `a11yfocus ID` and `a11yscroll ID 1|-1`. The program sends nothing until VoiceOver or
// Switch Control runs, or a client reads the container (Voice Control and XCUITest have no status to ask). Main thread only (ios_glue.mm posts
// the updates there). Compiled into zn_app on iOS.
#include <TargetConditionals.h>
#if TARGET_OS_IPHONE
#import <UIKit/UIKit.h>
#include <cstdlib>
#include <map>
#include <string>
#include <vector>

extern "C" void zn_hal_signal(const char* line);
extern "C" void hal_surface_size(int* w, int* h);

namespace {
enum { DISABLED = 1, CLICK = 2, CHECKABLE = 4, CHECKED = 8, EDIT = 16, SELECTED = 32, OFFSCREEN = 64, FOCUSED = 128, SCROLL = 256 };
struct Node { int parent = -1, flags = 0; double x = 0, y = 0, w = 0, h = 0; std::string role, label, value, hint; };
std::map<int, Node> nodes;
std::vector<int> order;
bool listening;
}  // namespace

static void listen(bool on) {
  if (on == listening) return;
  listening = on;
  zn_hal_signal(on ? "a11y 1" : "a11y 0");
}

@interface ZincA11yElement : UIAccessibilityElement
@property(nonatomic) int nodeId;
@end

@interface ZincA11yView : UIView
@property(nonatomic, strong) NSMutableDictionary<NSNumber*, ZincA11yElement*>* elements;
@property(nonatomic, strong) NSArray* list;
@end

static ZincA11yView* container;

@implementation ZincA11yElement
- (BOOL)accessibilityActivate {
  zn_hal_signal([NSString stringWithFormat:@"a11yactivate %d", self.nodeId].UTF8String);
  return YES;
}
- (void)accessibilityElementDidBecomeFocused { zn_hal_signal([NSString stringWithFormat:@"a11yfocus %d", self.nodeId].UTF8String); }
- (BOOL)accessibilityScroll:(UIAccessibilityScrollDirection)d {
  for (int id = self.nodeId; id >= 0;) {   // the scroll area that holds this element
    auto it = nodes.find(id);
    if (it == nodes.end()) break;
    if (it->second.flags & SCROLL) {
      const bool on = d == UIAccessibilityScrollDirectionDown || d == UIAccessibilityScrollDirectionRight || d == UIAccessibilityScrollDirectionNext;
      zn_hal_signal([NSString stringWithFormat:@"a11yscroll %d %d", id, on ? 1 : -1].UTF8String);
      return YES;
    }
    id = it->second.parent;
  }
  return NO;
}
@end

@implementation ZincA11yView
- (UIView*)hitTest:(CGPoint)p withEvent:(UIEvent*)e { return nil; }   // touches go to SDL's view under it
- (BOOL)isAccessibilityElement { return NO; }
- (NSArray*)accessibilityElements {
  if (!listening) listen(true);   // a client reads the tree (XCUITest, Voice Control): from now on the program sends it
  return self.list;
}
- (NSInteger)accessibilityElementCount { return (NSInteger)self.accessibilityElements.count; }
- (id)accessibilityElementAtIndex:(NSInteger)i { NSArray* l = self.accessibilityElements; return i >= 0 && i < (NSInteger)l.count ? l[i] : nil; }
- (NSInteger)indexOfAccessibilityElement:(id)e { NSUInteger i = [self.accessibilityElements indexOfObject:e]; return i == NSNotFound ? NSNotFound : (NSInteger)i; }
@end

static UIView* sdlView() {
  for (UIScene* s in UIApplication.sharedApplication.connectedScenes)
    if ([s isKindOfClass:UIWindowScene.class])
      for (UIWindow* w in ((UIWindowScene*)s).windows) if (w.isKeyWindow) return w.rootViewController.view ?: w;
  return nil;
}

/** The container over SDL's view (made once; SDL's view keeps it on top of the surface, under the native views added later). */
static bool ensureContainer() {
  UIView* host = sdlView();
  if (!host) return false;
  if (container && container.superview == host) return true;
  container = [[ZincA11yView alloc] initWithFrame:host.bounds];
  container.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  container.backgroundColor = UIColor.clearColor;
  container.elements = [NSMutableDictionary new];
  container.list = @[];
  [host addSubview:container];
  return true;
}

static NSString* ns(const std::string& s) { return [NSString stringWithUTF8String:s.c_str()] ?: @""; }

/** A node's own label, or for a node that takes clicks the text of the nodes it holds (a button's title). */
static std::string labelOf(int id) {
  const Node& n = nodes[id];
  if (!n.label.empty() || !(n.flags & CLICK)) return n.label;
  std::string out;
  for (int c : order) {
    int p = nodes.count(c) ? nodes[c].parent : -1;
    while (p >= 0 && p != id) p = nodes.count(p) ? nodes[p].parent : -1;
    if (p == id && !nodes[c].label.empty()) out += (out.empty() ? "" : ", ") + nodes[c].label;
  }
  return out;
}

static UIAccessibilityTraits traitsOf(const Node& n) {
  UIAccessibilityTraits t = UIAccessibilityTraitNone;
  if ((n.flags & CLICK) || n.role == "button" || n.role == "tab" || n.role == "menuitem") t |= UIAccessibilityTraitButton;
  if (n.role == "link") t |= UIAccessibilityTraitLink;
  if (n.role == "heading") t |= UIAccessibilityTraitHeader;
  if (n.role == "img" || n.role == "image") t |= UIAccessibilityTraitImage;
  if (n.role == "text" || n.role == "status") t |= UIAccessibilityTraitStaticText;
  if (n.role == "searchbox") t |= UIAccessibilityTraitSearchField;
  if (n.role == "slider" || n.role == "progressbar") t |= UIAccessibilityTraitUpdatesFrequently;
  if (n.role == "tablist") t |= UIAccessibilityTraitTabBar;
  if (n.flags & DISABLED) t |= UIAccessibilityTraitNotEnabled;
  if (n.flags & (SELECTED | CHECKED)) t |= UIAccessibilityTraitSelected;
  if (n.flags & CHECKABLE) { if (@available(iOS 17.0, *)) t |= UIAccessibilityTraitToggleButton; }
  return t;
}

/** The surface's logical pixels -> the container's points (the renderer's letterbox and zoom, as plugins/webview places its views). */
static CGRect frameOf(const Node& n) {
  int W = 1, H = 1;
  hal_surface_size(&W, &H);
  CGSize s = container.bounds.size;
  const double k = W > 0 && H > 0 ? fmin(s.width / W, s.height / H) : 1, ox = (s.width - W * k) / 2, oy = (s.height - H * k) / 2;
  return CGRectMake(ox + n.x * k, oy + n.y * k, n.w * k, n.h * k);
}

/** The program's changes (lib/std/ui.ts syncA11y): `n ID PARENT FLAGS X Y W H\tROLE\tLABEL\tVALUE\tHINT`, `d ID`, `o ID ID...`. */
extern "C" void zn_ios_a11y_apply(const char* text) {
  if (!listening || !ensureContainer()) return;
  bool structure = false;
  const std::string all = text;
  for (size_t at = 0; at < all.size();) {
    size_t end = all.find('\n', at);
    if (end == std::string::npos) end = all.size();
    const std::string ln = all.substr(at, end - at);
    at = end + 1;
    if (ln.rfind("n ", 0) == 0) {
      std::vector<std::string> f;
      for (size_t a = 0;;) { size_t t = ln.find('\t', a); f.push_back(ln.substr(a, t == std::string::npos ? std::string::npos : t - a)); if (t == std::string::npos) break; a = t + 1; }
      int id = 0, parent = 0, flags = 0; double x = 0, y = 0, w = 0, h = 0;
      if (f.size() < 5 || sscanf(f[0].c_str(), "n %d %d %d %lf %lf %lf %lf", &id, &parent, &flags, &x, &y, &w, &h) != 7) continue;
      Node& n = nodes[id];
      if (n.parent != parent || ((n.flags ^ flags) & CLICK)) structure = true;
      n.parent = parent; n.flags = flags; n.x = x; n.y = y; n.w = w; n.h = h; n.role = f[1]; n.label = f[2]; n.value = f[3]; n.hint = f[4];
    } else if (ln.rfind("d ", 0) == 0) {
      const int id = atoi(ln.c_str() + 2);
      nodes.erase(id);
      [container.elements removeObjectForKey:@(id)];
      structure = true;
    } else if (ln.rfind("o", 0) == 0) {
      order.clear();
      for (const char* p = ln.c_str() + 1; *p;) { char* e = nullptr; long v = strtol(p, &e, 10); if (e == p) break; order.push_back((int)v); p = e; }
      structure = true;
    }
  }
  // the elements: every node not held by a node that takes clicks, in reading order
  NSMutableArray* list = [NSMutableArray new];
  for (int id : order) {
    auto it = nodes.find(id);
    if (it == nodes.end()) continue;
    bool held = false;
    for (int p = it->second.parent; p >= 0 && !held;) { auto q = nodes.find(p); if (q == nodes.end()) break; held = (q->second.flags & CLICK) != 0; p = q->second.parent; }
    if (held) continue;
    const Node& n = it->second;
    ZincA11yElement* e = container.elements[@(id)];
    if (!e) { e = [[ZincA11yElement alloc] initWithAccessibilityContainer:container]; e.nodeId = id; container.elements[@(id)] = e; }
    e.accessibilityLabel = ns(labelOf(id));
    e.accessibilityValue = (n.flags & EDIT) || !n.value.empty() ? ns(n.value) : (n.flags & CHECKABLE) ? ((n.flags & CHECKED) ? @"1" : @"0") : nil;
    e.accessibilityHint = n.hint.empty() ? nil : ns(n.hint);
    e.accessibilityTraits = traitsOf(n);
    e.accessibilityFrameInContainerSpace = frameOf(n);
    e.isAccessibilityElement = n.role != "scrollarea" && n.role != "tablist" && n.role != "form" && n.role != "list";   // containers: their children speak
    [list addObject:e];
  }
  container.list = list;
  if (structure) UIAccessibilityPostNotification(UIAccessibilityLayoutChangedNotification, nil);
}

/** The container exists before any tree, so a client that asks first (XCUITest, Voice Control) finds it and turns the program on; SDL's window
 *  comes with the program's first frame, so it is looked for again every 250 ms a few times. */
static void placeContainer(int tries) {
  if (ensureContainer() || tries <= 0) return;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 250 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ placeContainer(tries - 1); });
}

/** At the start (ios_glue.mm zn_mobile_glue_init, main thread): VoiceOver's and Switch Control's state, now and when it changes. */
extern "C" void zn_ios_a11y_init(void) {
  auto check = ^(NSNotification*) { listen(UIAccessibilityIsVoiceOverRunning() || UIAccessibilityIsSwitchControlRunning()); };
  NSNotificationCenter* nc = NSNotificationCenter.defaultCenter;
  [nc addObserverForName:UIAccessibilityVoiceOverStatusDidChangeNotification object:nil queue:nil usingBlock:check];
  [nc addObserverForName:UIAccessibilitySwitchControlStatusDidChangeNotification object:nil queue:nil usingBlock:check];
  check(nil);
  placeContainer(20);
}
#endif
