// zinc:appkit on macOS (D210, docs/reports/appkit-native-ui-research.md §6): the zinc:ui tree as AppKit views. zinc:ui keeps the tree, the models and
// the Yoga layout; after each changed frame commit() gets its records (ui.setHost in lib/std/ui.ts) and this file makes the views match, as React
// Native's mounting layer applies Fabric's mutations. Layout-only views (no background, border, opacity or hiding) get no NSView: their children
// hang on the nearest real ancestor with the offsets summed (React Native's view flattening). Text and fields are measured by the same AppKit cells
// that show them, through the layout's native measure hook (zn_host_set_native_measure, src/host/layout.h).
// Clicks, hover and drags are not taken here: the views let them through to SDL's view, so zinc:ui hit-tests its own tree and gives the drawn UI's
// events. Fields and scroll views take their input themselves and queue events; a zrt::Poller hands them to the program with the handle and the
// generation they were made under, and an event whose node was deleted or recycled since is dropped.
// The window chrome (ZN-1071) comes as nodes with a native kind (ui.setNativeKind, zinc:appkit's Window, Toolbar, SplitView, Sidebar): the window's
// title and style, an NSToolbar whose items are the item nodes (custom ones show the item's subtree at its Yoga size), an NSSplitView whose panes
// are real views at zinc:ui's boxes. A divider dragged by the user reports the first pane's width, which zinc:ui lays out again (index.ts). The
// keyboard focus stays zinc:ui's: Tab in a field is left to zinc:ui's focus walk, and each `o` record moves the first responder to the field, or to
// the focusable view with a focus ring when the keyboard put it there.
// The controls (ZN-1073: push button, switch, check box, pop-up, segmented control, slider, date picker, search field, progress bar) are leaves whose
// value is an attribute; the person's press or new value is queued (EvCPress, EvCValue) and, a poll later, the control shows its attribute again, so
// a value the program refused does not stay. The overlays (alert, sheet, popover) are presented as a sheet of the window or an NSPopover, never with
// runModal (it would hold SDL's pump, and so the frames); their end comes back as EvClose. Headless (the window never shown) they are built but not
// presented, so a test puts nothing on screen.
// A plugin's own native views (ZN-1075, include/zn/native_view.h) come as nodes whose kind no built-in has: the engine gives the class the plugin
// registered for it, and its view is a leaf like a control (its children are the drawn fallback), its props the node's attributes, its events EvView.
// ARC (plugin.json flags). Everything runs on the main thread: the program's commits and AppKit's callbacks inside SDL's event pump.
#define ZRT_HOSTED_CPP
#import <AppKit/AppKit.h>
#include <math.h>
#include <algorithm>
#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <unordered_map>
#include <vector>
#include "zinc_native_appkit.h"
#include "zn/native_view.h"
#include "zrt_assets_dir.h"

extern "C" const ZnViewClass* zn_host_view_class(const char* kind) __attribute__((weak));   // the engine's registry of plugins' views (Yoga's file)
// The engine's, referenced weakly rather than found with dlsym: an AOT program links with -no_exported_symbols, so dlsym finds nothing there.
// The layout's native measure hook (src/host/layout.h): absent from a program that never lays out with Yoga.
extern "C" void zn_host_set_native_measure(int (*measure)(void*, int32_t, int, const char*, size_t, int32_t, int32_t, int32_t, float, int32_t, float, int,
                                                          float, int, float*, float*),
                                           void* user) __attribute__((weak));
extern "C" void hal_surface_size(int* w, int* h) __attribute__((weak));   // the surface's logical size (runtime/include/hal.h)

namespace {

// TAG_NAMES of lib/std/ui.ts, then the native kinds of zinc:appkit's components (index.ts)
enum Kind { KView, KText, KButton, KImage, KScroll, KCanvas, KFragment, KInput, KTextArea, KWindow, KToolbar, KToolbarItem, KSplit, KSidebar, KTable, KOutline,
           KPushButton, KSwitch, KCheckbox, KPopup, KSegmented, KSlider, KDatePicker, KProgress, KSearch, KAlert, KSheet, KPopover, KUnknown,
           KCustom };   // a plugin's view (no name in kKinds: its class names it)
const char* const kKinds[] = {"view", "text", "button", "image", "scroll", "canvas", "fragment", "input", "textarea", "window", "toolbar", "toolbaritem", "split", "sidebar", "table", "outline",
                              "pushbutton", "switch", "checkbox", "popup", "segmented", "slider", "datepicker", "progress", "search", "alert", "sheet", "popover"};
// index.ts's event kinds; a Table's and an Outline's have their own (from EvSelect), so a recycled handle never routes a field's event to a list
enum Ev { EvEdit, EvChange, EvSubmit, EvFocus, EvBlur, EvScroll, EvPress, EvResize, EvSelect, EvSort, EvType, EvOpen, EvExpand, EvRows, EvListFocus,
          EvCPress, EvCValue, EvClose,   // the controls' and overlays' own kinds
          EvView };                      // a plugin's view: text is the event's name, then its arguments, joined by 0x1f

struct Node {
  bool live = false;
  uint32_t gen = 0;   // bumped by each `c` on this handle: an event remembers it
  int kind = KUnknown, parent = -1;
  double x = 0, y = 0, w = 0, h = 0;
  double cw = 0, ch = 0;   // a scroll view's content size
  std::string text, placeholder;
  std::string axLabel; bool hasAx = false;   // the accessible name zinc:ui gives it (setLabel, aria-label, a kit's accessibilityLabel); hasAx once one was sent
  double bg = -1, bgAlpha = 255, fg = -1, opacity = 1, radius = 0, border = 0, borderColor = 0, fontSize = 16, bold = 0, hidden = 0, secure = 0, focusable = 0;
  std::vector<std::pair<std::string, std::string>> attrs;   // a native component's attributes (`a` records)
  std::vector<int> kids;
  bool dirty = true;   // properties changed since they were applied to the view
  NSView* view = nil;  // nil while flattened or not shown yet
  NSView* input = nil; // the view that edits: the field, or the text view of a textarea
  id observer = nil;   // a scroll view's bounds observer
  id chrome = nil;     // a toolbar's delegate (it holds the NSToolbar), a toolbar item's NSToolbarItem
  const ZnViewClass* cls = nullptr;   // a plugin's view: its class, and the +1 reference its create returned (dropped by forget)
  void* custom = nullptr;
  const std::string& attr(const char* name) const {
    static const std::string none;
    for (const auto& a : attrs) if (a.first == name) return a.second;
    return none;
  }
};

struct Queued { int id; uint32_t gen; int kind; std::string text; double a, b; };

std::vector<Node> nodes;
std::vector<int> roots;
std::vector<Queued> queue;
std::unordered_map<const void*, int> idOf;   // a view that reports events -> its handle
int focusWant = -2;                          // the last `o` record (-2: none yet)
bool focusKeyboard = false;                  // and whether the keyboard moved the focus there (a focus ring shows)
NSView* rootView = nil;
NSWindow* offWindow = nil;                   // headless: the window that is never shown
int committing = 0;                          // inside commit(): AppKit's own resize callbacks are ours, not the user's (CommitScope)
struct CommitScope { CommitScope() { committing++; } ~CommitScope() { committing--; } };

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
void push(id v, int kind, const std::string& text = "", double a = 0, double b = 0) {
  auto it = idOf.find((__bridge const void*)v);
  if (it == idOf.end() || !live(it->second)) return;
  queue.push_back({it->second, nodes[it->second].gen, kind, text, a, b});
}
/** A plugin's view sent an event (ZnViewEmit, on the main thread): queued under the node and generation it was made for, so a late one is dropped. */
void emitView(uint64_t token, const char* event, const char* args) {
  const int id = (int)(uint32_t)token;
  const uint32_t gen = (uint32_t)(token >> 32);
  if (!live(id) || nodes[id].gen != gen || !event) return;
  queue.push_back({id, gen, EvView, args ? std::string(event) + '\x1f' + args : std::string(event), 0, 0});
}
void pushEdit(NSView* v, NSString* value, NSRange sel) {
  push(v, EvEdit, str(value), sel.location == NSNotFound ? 0 : (double)sel.location, sel.location == NSNotFound ? 0 : (double)(sel.location + sel.length));
}
bool isField(int k) { return k == KInput || k == KSearch; }   // a search field is a field to zinc:ui: its edits come back as any field's
bool isControl(int k) { return k >= KPushButton && k <= KProgress; }
bool isOverlay(int k) { return k == KAlert || k == KSheet || k == KPopover; }
std::string fmtNum(double v) { char b[32]; snprintf(b, sizeof b, "%g", v); return b; }
/** A date picker's value: 'YYYY-MM-DD', in UTC so it never moves with the time zone. */
NSDateFormatter* dayFormat() {
  static NSDateFormatter* f = [] { NSDateFormatter* d = [[NSDateFormatter alloc] init]; d.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"]; d.timeZone = [NSTimeZone timeZoneForSecondsFromGMT:0]; d.dateFormat = @"yyyy-MM-dd"; return d; }();
  return f;
}
/** An NSSwitch's on/off state, or a checkbox's on/off/mixed state. */
NSInteger stateOf(NSControl* c) {
  if (@available(macOS 10.15, *)) { if ([c isKindOfClass:NSSwitch.class]) return ((NSSwitch*)c).state; }
  return [c isKindOfClass:NSButton.class] ? ((NSButton*)c).state : NSControlStateValueOff;
}
void setState(NSControl* c, NSControlStateValue v) {
  if (@available(macOS 10.15, *)) { if ([c isKindOfClass:NSSwitch.class]) { if (((NSSwitch*)c).state != v) ((NSSwitch*)c).state = v; return; } }
  if ([c isKindOfClass:NSButton.class]) {
    NSButton* b = (NSButton*)c;
    // Mixed advances to on; after the app accepts it, restore the ordinary two-state click cycle.
    const bool mixed = v == NSControlStateValueMixed;
    if (b.allowsMixedState != mixed) b.allowsMixedState = mixed;
    if (b.state != v) b.state = v;
  }
}
/** What a control holds now, as its `value` attribute says it: '1', '0' or 'mixed', an item, segment, number or date. */
std::string controlValue(const Node& n, NSControl* c) {
  if (n.kind == KCheckbox && stateOf(c) == NSControlStateValueMixed) return "mixed";
  if (n.kind == KSwitch || n.kind == KCheckbox) return stateOf(c) == NSControlStateValueOn ? "1" : "0";
  if (n.kind == KPopup) return str(((NSPopUpButton*)c).titleOfSelectedItem ?: @"");
  if (n.kind == KSegmented) return std::to_string((long)((NSSegmentedControl*)c).selectedSegment);
  if (n.kind == KSlider) return fmtNum(c.doubleValue);
  if (n.kind == KDatePicker) return str([dayFormat() stringFromDate:((NSDatePicker*)c).dateValue]);
  return "";
}

}  // namespace

// ---------------------------------------------------------------- the view classes
/** A View, Pressable or Button: a flipped view that draws its background and border; clicks go through it to zinc:ui. */
@interface ZnView : NSView
@property double bgColor, bgAlpha, radius, borderWidth, borderColor;
@property BOOL focusable;
@end
@implementation ZnView
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstResponder { return self.focusable; }   // zinc:ui moves the focus (`o` records); the view takes it to show the ring
- (void)keyDown:(NSEvent*)e {}   // SDL has the key already (it reads every key event in its pump): no beep from the responder chain
- (void)keyUp:(NSEvent*)e {}
- (void)drawFocusRingMask { [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:self.radius yRadius:self.radius] fill]; }
- (NSRect)focusRingMaskBounds { return self.bounds; }
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

/** A Sidebar: the system's sidebar material (it follows dark mode and the window's active state); clicks go through to zinc:ui. */
@interface ZnSidebar : NSVisualEffectView
@end
@implementation ZnSidebar
- (BOOL)isFlipped { return YES; }
- (NSView*)hitTest:(NSPoint)p { NSView* v = [super hitTest:p]; return v == self ? nil : v; }
@end

/** A SplitView: panes side by side at zinc:ui's boxes, a thin divider between them. The divider takes the mouse (presses elsewhere go through to
 *  zinc:ui) and is dragged without AppKit's tracking loop, which would hold SDL's event pump, and so zinc:ui's frames, for the whole drag. */
@interface ZnSplit : NSSplitView <NSSplitViewDelegate>
@property double minPane, maxPane;
@property NSInteger dragging;   // the divider the mouse holds, -1: none
@end
@implementation ZnSplit
- (instancetype)initWithFrame:(NSRect)r {
  if ((self = [super initWithFrame:r])) { self.vertical = YES; self.dividerStyle = NSSplitViewDividerStyleThin; self.delegate = self; _dragging = -1; _minPane = 0; _maxPane = 1e9; }
  return self;
}
- (NSInteger)dividerAt:(NSPoint)p {   // p in the view; a few points either side of the line
  NSArray<NSView*>* s = self.subviews;
  for (NSUInteger i = 0; i + 1 < s.count; i++)
    if (p.x >= NSMaxX(s[i].frame) - 3 && p.x <= NSMinX(s[i + 1].frame) + 3) return (NSInteger)i;
  return -1;
}
- (NSView*)hitTest:(NSPoint)p {
  NSView* v = [super hitTest:p];
  return v == self && [self dividerAt:[self convertPoint:p fromView:self.superview]] < 0 ? nil : v;
}
- (void)resetCursorRects {
  NSArray<NSView*>* s = self.subviews;
  for (NSUInteger i = 0; i + 1 < s.count; i++)
    [self addCursorRect:NSMakeRect(NSMaxX(s[i].frame) - 3, 0, NSMinX(s[i + 1].frame) - NSMaxX(s[i].frame) + 6, self.bounds.size.height) cursor:NSCursor.resizeLeftRightCursor];
}
- (void)dragTo:(double)x divider:(NSInteger)i {
  if (i == 0) x = fmin(fmax(x, self.minPane), self.maxPane);
  [self setPosition:x ofDividerAtIndex:i];
}
- (void)mouseDown:(NSEvent*)e { self.dragging = [self dividerAt:[self convertPoint:e.locationInWindow fromView:nil]]; }
- (void)mouseDragged:(NSEvent*)e { if (self.dragging >= 0) [self dragTo:[self convertPoint:e.locationInWindow fromView:nil].x divider:self.dragging]; }
- (void)mouseUp:(NSEvent*)e { self.dragging = -1; }
- (BOOL)splitView:(NSSplitView*)sv shouldAdjustSizeOfSubview:(NSView*)v { return v != sv.subviews.firstObject; }   // the sidebar holds its width
- (CGFloat)splitView:(NSSplitView*)sv constrainMinCoordinate:(CGFloat)c ofSubviewAt:(NSInteger)i { return i == 0 ? fmax(c, self.minPane) : c; }
- (CGFloat)splitView:(NSSplitView*)sv constrainMaxCoordinate:(CGFloat)c ofSubviewAt:(NSInteger)i { return i == 0 ? fmin(c, self.maxPane) : c; }
- (void)splitViewDidResizeSubviews:(NSNotification*)n {
  if (committing || self.subviews.count < 2) return;   // the frames a commit sets are zinc:ui's already
  NSView* first = self.subviews.firstObject;
  push(first, EvResize, "", first.frame.size.width, first.frame.size.height);
}
@end

/** A toolbar's delegate: the items in the order of the Toolbar's children; a press of one is queued as EvPress of its node. */
@interface ZnToolbar : NSObject <NSToolbarDelegate>
@property(strong) NSToolbar* toolbar;
@property(strong) NSArray<NSToolbarItemIdentifier>* ids;
@property(strong) NSMutableDictionary<NSToolbarItemIdentifier, NSToolbarItem*>* items;
@end
@implementation ZnToolbar
- (NSArray<NSToolbarItemIdentifier>*)toolbarDefaultItemIdentifiers:(NSToolbar*)t { return self.ids; }
- (NSArray<NSToolbarItemIdentifier>*)toolbarAllowedItemIdentifiers:(NSToolbar*)t { return self.ids; }
- (NSToolbarItem*)toolbar:(NSToolbar*)t itemForItemIdentifier:(NSToolbarItemIdentifier)i willBeInsertedIntoToolbar:(BOOL)flag { return self.items[i]; }
- (void)press:(NSToolbarItem*)item { push(item, EvPress); }
@end

namespace {
/** A cell of a Table or an Outline: one AppKit recycles (a cell scrolled out comes back through makeViewWithIdentifier), a label made only when it has
 *  none to hand back. */
NSTableCellView* cellView(NSTableView* tv, NSUserInterfaceItemIdentifier ident, id owner) {
  NSTableCellView* c = [tv makeViewWithIdentifier:ident owner:owner];
  if (c) return c;
  c = [[NSTableCellView alloc] initWithFrame:NSZeroRect];
  c.identifier = ident;
  NSTextField* t = [NSTextField labelWithString:@""];
  t.lineBreakMode = NSLineBreakByTruncatingTail;
  t.translatesAutoresizingMaskIntoConstraints = NO;
  [c addSubview:t];
  c.textField = t;
  [t.leadingAnchor constraintEqualToAnchor:c.leadingAnchor constant:2].active = YES;
  [t.trailingAnchor constraintEqualToAnchor:c.trailingAnchor constant:-2].active = YES;
  [t.centerYAnchor constraintEqualToAnchor:c.centerYAnchor].active = YES;
  return c;
}
}  // namespace

/** An Outline's item: one object per id, kept by its controller across commits, since NSOutlineView knows its items by pointer (expansion, selection)
 *  and does not retain them. */
@interface ZnItem : NSObject
@property(copy) NSString* ident;
@property(copy) NSString* label;
@property(strong) NSMutableArray<ZnItem*>* kids;
@end
@implementation ZnItem
@end

/** A Table's and an Outline's views: taking the first responder (a click, the keyboard) is zinc:ui's focus on the list. */
@interface ZnTableView : NSTableView
@end
@implementation ZnTableView
- (BOOL)becomeFirstResponder { BOOL ok = [super becomeFirstResponder]; if (ok) push(self, EvListFocus); return ok; }
@end
@interface ZnOutlineView : NSOutlineView
@end
@implementation ZnOutlineView
- (BOOL)becomeFirstResponder { BOOL ok = [super becomeFirstResponder]; if (ok) push(self, EvListFocus); return ok; }
@end

/** A Table's data source and delegate. It answers only from what the commits pushed: the row count and the cells of the rows zinc:ui's virtual list
 *  has built (those in view and a few more); a row not pushed yet shows empty until the next commit brings it. It never calls the program. */
@interface ZnTableCtl : NSObject <NSTableViewDataSource, NSTableViewDelegate> {
 @public
  std::unordered_map<int, std::vector<std::string>> cache;   // row -> its cells' texts
  std::string columns, sort, selection;                       // the attributes applied
  std::vector<NSTextAlignment> aligns;
}
@property(strong) NSTableView* table;
@property NSInteger count;
@end
@implementation ZnTableCtl
- (const std::string*)cellAt:(NSInteger)row column:(NSInteger)col {
  auto it = cache.find((int)row);
  return it != cache.end() && col >= 0 && col < (NSInteger)it->second.size() ? &it->second[col] : nullptr;
}
- (NSInteger)numberOfRowsInTableView:(NSTableView*)tv { return self.count; }
- (NSView*)tableView:(NSTableView*)tv viewForTableColumn:(NSTableColumn*)col row:(NSInteger)row {
  NSTableCellView* c = cellView(tv, col.identifier, self);
  const NSUInteger k = [tv.tableColumns indexOfObjectIdenticalTo:col];
  const std::string* s = [self cellAt:row column:(NSInteger)k];
  c.textField.stringValue = s ? ns(*s) : @"";
  c.textField.alignment = k < aligns.size() ? aligns[k] : NSTextAlignmentNatural;
  return c;
}
- (void)tableView:(NSTableView*)tv sortDescriptorsDidChange:(NSArray<NSSortDescriptor*>*)old {
  NSSortDescriptor* d = tv.sortDescriptors.firstObject;
  if (committing || !d) return;   // the program's own sort comes back in a commit: no echo
  push(tv, EvSort, str(d.key), d.ascending ? 1 : 0);
}
- (void)tableViewSelectionDidChange:(NSNotification*)n {
  if (committing) return;
  NSTableView* tv = n.object;
  __block std::string s;
  [tv.selectedRowIndexes enumerateIndexesUsingBlock:^(NSUInteger i, BOOL*) { s += (s.empty() ? "" : ",") + std::to_string(i); }];
  push(tv, EvSelect, s);
}
- (NSString*)tableView:(NSTableView*)tv typeSelectStringForTableColumn:(NSTableColumn*)col row:(NSInteger)row {
  const std::string* s = [self cellAt:row column:0];
  return s ? ns(*s) : @"";
}
/** Type-select reaches rows never pushed: the program's rows answer (index.ts finds the row and selects it, the next commit shows it); AppKit moves
 *  nothing itself. It asks again from row 0 when the first search fails: one event per string. */
- (NSInteger)tableView:(NSTableView*)tv nextTypeSelectMatchFromRow:(NSInteger)start toRow:(NSInteger)stop forString:(NSString*)s {
  if (start <= stop) push(tv, EvType, str(s), (double)start);
  return -1;
}
- (void)open:(NSTableView*)tv { if (tv.clickedRow >= 0) push(tv, EvOpen, "", (double)tv.clickedRow); }
@end

/** An Outline's data source and delegate, from the whole tree a commit pushed (attribute `tree`): AppKit expands, collapses and type-selects by
 *  itself, and reports each change. */
@interface ZnOutlineCtl : NSObject <NSOutlineViewDataSource, NSOutlineViewDelegate> {
 @public
  std::string tree, expanded, selection;   // the attributes applied
}
@property(strong) NSOutlineView* outline;
@property(strong) NSMutableDictionary<NSString*, ZnItem*>* items;   // every item by id: alive as long as the outline may show it
@property(strong) NSMutableArray<ZnItem*>* roots;
@end
@implementation ZnOutlineCtl
- (NSInteger)outlineView:(NSOutlineView*)ov numberOfChildrenOfItem:(ZnItem*)item { return (NSInteger)(item ? item.kids.count : self.roots.count); }
- (id)outlineView:(NSOutlineView*)ov child:(NSInteger)i ofItem:(ZnItem*)item { return item ? item.kids[(NSUInteger)i] : self.roots[(NSUInteger)i]; }
- (BOOL)outlineView:(NSOutlineView*)ov isItemExpandable:(ZnItem*)item { return item.kids.count > 0; }
- (NSView*)outlineView:(NSOutlineView*)ov viewForTableColumn:(NSTableColumn*)col item:(ZnItem*)item {
  NSTableCellView* c = cellView(ov, @"c0", self);
  c.textField.stringValue = item.label ?: @"";
  return c;
}
- (NSString*)outlineView:(NSOutlineView*)ov typeSelectStringForTableColumn:(NSTableColumn*)col item:(ZnItem*)item { return item.label; }
- (void)outlineViewSelectionDidChange:(NSNotification*)n {
  if (committing) return;
  NSOutlineView* ov = n.object;
  ZnItem* it = ov.selectedRow >= 0 ? [ov itemAtRow:ov.selectedRow] : nil;
  push(ov, EvSelect, it ? str(it.ident) : "");
}
- (void)outlineViewItemDidExpand:(NSNotification*)n { if (!committing) push(n.object, EvExpand, str(((ZnItem*)n.userInfo[@"NSObject"]).ident), 1); }
- (void)outlineViewItemDidCollapse:(NSNotification*)n { if (!committing) push(n.object, EvExpand, str(((ZnItem*)n.userInfo[@"NSObject"]).ident), 0); }
- (void)open:(NSOutlineView*)ov { if (ov.clickedRow >= 0) push(ov, EvOpen, "", (double)ov.clickedRow); }
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

@interface ZnSearchField : NSSearchField
@end
@implementation ZnSearchField
- (BOOL)becomeFirstResponder { BOOL ok = [super becomeFirstResponder]; if (ok) push(self, EvFocus); return ok; }
@end

/** The controls' target: a push button's press, the new value of the others (a slider's snapped to its step), as the person set them. */
@interface ZnControls : NSObject
@end
@implementation ZnControls
- (void)act:(NSControl*)c {
  auto it = idOf.find((__bridge const void*)c);
  Node* n = it != idOf.end() ? live(it->second) : nullptr;
  if (!n) return;
  if (n->kind == KPushButton) { push(c, EvCPress); return; }
  if (n->kind == KSlider) {
    const double step = atof(n->attr("step").c_str()), lo = ((NSSlider*)c).minValue;
    if (step > 0) c.doubleValue = lo + round((c.doubleValue - lo) / step) * step;
  }
  const std::string v = controlValue(*n, c);
  push(c, EvCValue, v, atof(v.c_str()));
}
- (void)searched:(NSSearchField*)f { pushEdit(f, f.stringValue, NSMakeRange(f.stringValue.length, 0)); }   // the clear button empties it without an edit
@end

/** An alert, a sheet or a popover: what AppKit shows for one overlay node, whether it is shown for real (a visible window) and whether it ended. */
@class ZnOverlay;
@interface ZnSheetWindow : NSWindow
@property(weak) ZnOverlay* overlay;
@end
@interface ZnOverlay : NSObject <NSPopoverDelegate>
@property(strong) NSAlert* alert;
@property(strong) ZnSheetWindow* sheet;
@property(strong) NSPopover* popover;
@property(strong) NSView* content;   // a sheet's or a popover's: the overlay node's children go in it
@property BOOL shown, closed;
@end
@implementation ZnOverlay
/** The person ended it (a button of the alert, Escape, a click outside the popover): EvClose, once; the program then takes the node away. */
- (void)finish:(double)button { if (self.closed) return; self.closed = YES; push(self, EvClose, "", button); }
- (void)popoverDidClose:(NSNotification*)n { [self finish:-1]; }
/** Takes away what AppKit still shows (the node went): no event, the program knows already. */
- (void)end {
  self.closed = YES;
  if (!self.shown) return;
  self.shown = NO;
  NSWindow* w = self.alert ? self.alert.window : self.sheet;
  if (w.sheetParent) [w.sheetParent endSheet:w];
  if (self.popover.shown) [self.popover close];
}
@end
@implementation ZnSheetWindow
- (void)cancelOperation:(id)sender { [self.overlay finish:-1]; }   // Escape
@end

/** The fields' and text views' delegate: edits, the end of editing (and Enter), as the DOM host reports them (domEdit, domChanged, submitFrom). */
@interface ZnDelegate : NSObject <NSTextFieldDelegate, NSSearchFieldDelegate, NSTextViewDelegate>
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
// Tab and Shift-Tab are zinc:ui's (its focus walk, tabIndex, focus scopes): the field leaves them, and the key reaches zinc:ui through SDL
- (BOOL)control:(NSControl*)c textView:(NSTextView*)t doCommandBySelector:(SEL)sel { return sel == @selector(insertTab:) || sel == @selector(insertBacktab:); }
- (BOOL)textView:(NSTextView*)t doCommandBySelector:(SEL)sel { return sel == @selector(insertTab:) || sel == @selector(insertBacktab:); }
@end

namespace {

ZnDelegate* delegate() { static ZnDelegate* d = [[ZnDelegate alloc] init]; return d; }
ZnControls* controls() { static ZnControls* c = [[ZnControls alloc] init]; return c; }

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
  return (n.kind == KView || n.kind == KButton || n.kind == KWindow) && n.bg < 0 && n.border <= 0 && n.opacity >= 1 && n.hidden == 0 && n.focusable == 0;   // a focusable view takes the first responder
}
void forget(Node& n) {
  if (n.kind == KToolbar && n.chrome) {
    ZnToolbar* d = n.chrome;
    for (NSWindow* w in NSApp.windows) if (w.toolbar == d.toolbar) w.toolbar = nil;
    for (NSToolbarItem* it in d.items.allValues) idOf.erase((__bridge const void*)it);
  }
  if (n.kind == KToolbarItem && n.chrome) idOf.erase((__bridge const void*)n.chrome);
  if ((n.kind == KTable || n.kind == KOutline) && n.input) { NSTableView* tv = (NSTableView*)n.input; tv.dataSource = nil; tv.delegate = nil; tv.target = nil; }
  if (isOverlay(n.kind) && n.chrome) { ZnOverlay* o = n.chrome; [o end]; idOf.erase((__bridge const void*)o); }
  n.chrome = nil;
  if (n.observer) { [NSNotificationCenter.defaultCenter removeObserver:n.observer]; n.observer = nil; }
  if (n.input) { idOf.erase((__bridge const void*)n.input); if (n.input.window.firstResponder == n.input || ([n.input isKindOfClass:NSTextField.class] && ((NSTextField*)n.input).currentEditor)) [n.input.window makeFirstResponder:nil]; }
  if (n.view) { idOf.erase((__bridge const void*)n.view); [n.view removeFromSuperview]; }
  n.view = nil; n.input = nil; n.dirty = true;
  if (n.custom) { n.cls->drop(n.custom); n.custom = nullptr; }
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
  } else if (n.kind == KSearch) {
    ZnSearchField* f = [[ZnSearchField alloc] initWithFrame:NSZeroRect];
    f.delegate = delegate();
    f.target = controls(); f.action = @selector(searched:);
    n.input = f; v = f;
  } else if (isControl(n.kind)) {
    if (n.kind == KProgress) {
      NSProgressIndicator* p = [[NSProgressIndicator alloc] initWithFrame:NSZeroRect];
      p.style = NSProgressIndicatorStyleBar; p.minValue = 0; p.maxValue = 100; p.indeterminate = NO;
      v = p;
    } else {
      NSControl* c = nil;
      if (n.kind == KPushButton) { NSButton* b = [[NSButton alloc] initWithFrame:NSZeroRect]; b.bezelStyle = NSBezelStyleRounded; c = b; }
      else if (n.kind == KCheckbox) { NSButton* b = [[NSButton alloc] initWithFrame:NSZeroRect]; [b setButtonType:NSButtonTypeSwitch]; c = b; }
      else if (n.kind == KSwitch) {
        if (@available(macOS 10.15, *)) c = [[NSSwitch alloc] initWithFrame:NSZeroRect];
        else { NSButton* b = [[NSButton alloc] initWithFrame:NSZeroRect]; [b setButtonType:NSButtonTypeSwitch]; b.title = @""; c = b; }   // Mojave: a check box
      } else if (n.kind == KPopup) c = [[NSPopUpButton alloc] initWithFrame:NSZeroRect pullsDown:NO];
      else if (n.kind == KSegmented) {
        NSSegmentedControl* sg = [[NSSegmentedControl alloc] initWithFrame:NSZeroRect];
        sg.trackingMode = NSSegmentSwitchTrackingSelectOne; sg.segmentDistribution = NSSegmentDistributionFillEqually;
        c = sg;
      } else if (n.kind == KSlider) { NSSlider* sl = [[NSSlider alloc] initWithFrame:NSZeroRect]; sl.continuous = YES; sl.minValue = 0; sl.maxValue = 100; c = sl; }
      else {
        NSDatePicker* d = [[NSDatePicker alloc] initWithFrame:NSZeroRect];
        d.datePickerStyle = NSDatePickerStyleTextFieldAndStepper; d.datePickerElements = NSDatePickerElementFlagYearMonthDay;
        d.timeZone = dayFormat().timeZone; d.calendar = [NSCalendar calendarWithIdentifier:NSCalendarIdentifierGregorian];
        c = d;
      }
      c.target = controls(); c.action = @selector(act:);
      v = c;
    }
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
  } else if (n.kind == KTable || n.kind == KOutline) {   // the scroll view, its table as the node's input (the first responder zinc:ui's focus moves)
    NSScrollView* s = [[NSScrollView alloc] initWithFrame:NSZeroRect];
    s.hasVerticalScroller = YES; s.autohidesScrollers = YES;
    NSTableView* tv = nil;
    if (n.kind == KTable) {
      ZnTableCtl* c = [[ZnTableCtl alloc] init];
      tv = [[ZnTableView alloc] initWithFrame:NSZeroRect];
      tv.dataSource = c; tv.delegate = c;
      tv.usesAlternatingRowBackgroundColors = YES;
      tv.columnAutoresizingStyle = NSTableViewLastColumnOnlyAutoresizingStyle;
      if (@available(macOS 11.0, *)) tv.style = NSTableViewStyleFullWidth;
      c.table = tv; n.chrome = c;
    } else {
      ZnOutlineCtl* c = [[ZnOutlineCtl alloc] init];
      NSOutlineView* ov = [[ZnOutlineView alloc] initWithFrame:NSZeroRect];
      NSTableColumn* col = [[NSTableColumn alloc] initWithIdentifier:@"c0"];
      col.resizingMask = NSTableColumnAutoresizingMask;
      [ov addTableColumn:col];
      ov.outlineTableColumn = col; ov.headerView = nil;
      ov.columnAutoresizingStyle = NSTableViewUniformColumnAutoresizingStyle;
      ov.indentationPerLevel = 14; ov.autoresizesOutlineColumn = NO;
      if (@available(macOS 11.0, *)) ov.style = NSTableViewStyleSourceList;
      else {   // Mojave and Catalina: the source-list look came from the highlight style
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        ov.selectionHighlightStyle = NSTableViewSelectionHighlightStyleSourceList;
#pragma clang diagnostic pop
      }
      ov.dataSource = c; ov.delegate = c;
      s.drawsBackground = NO;
      c.outline = ov; c.items = [NSMutableDictionary dictionary]; c.roots = [NSMutableArray array]; n.chrome = c;
      tv = ov;
    }
    tv.target = n.chrome; tv.doubleAction = @selector(open:);
    tv.intercellSpacing = NSMakeSize(3, 0);   // rows exactly rowHeight apart, where zinc:ui's virtual list places them
    s.documentView = tv;
    s.contentView.postsBoundsChangedNotifications = YES;
    __weak NSTableView* weak = tv;
    n.observer = [NSNotificationCenter.defaultCenter addObserverForName:NSViewBoundsDidChangeNotification object:s.contentView queue:nil usingBlock:^(NSNotification*) {
      NSTableView* t = weak;   // the rows in view, in the table's own coordinates (row 0 at 0): the virtual list builds them
      if (t) push(t, EvRows, "", 0, NSMinY(t.visibleRect));
    }];
    n.input = tv; v = s;
  } else if (n.kind == KSplit) v = [[ZnSplit alloc] initWithFrame:NSZeroRect];
  else if (n.kind == KSidebar) {
    ZnSidebar* e = [[ZnSidebar alloc] initWithFrame:NSZeroRect];
    e.material = NSVisualEffectMaterialSidebar; e.blendingMode = NSVisualEffectBlendingModeBehindWindow; e.state = NSVisualEffectStateFollowsWindowActiveState;
    v = e;
  } else if (n.kind == KCustom) {
    n.custom = n.cls->create((uint64_t)(uint32_t)id | (uint64_t)n.gen << 32, emitView);
    v = n.custom ? (__bridge NSView*)n.custom : [[ZnView alloc] initWithFrame:NSZeroRect];   // no view: an empty box
  } else v = [[ZnView alloc] initWithFrame:NSZeroRect];   // view, button, window, toolbar item, canvas (drawn islands come later), anything new
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
/** A control from its attributes: its title, items, range and value, enabled unless `enabled` is 0; touched only where it differs. */
void applyControl(Node& n) {
  const std::string& val = n.attr("value");
  if (n.kind == KProgress) {
    NSProgressIndicator* p = (NSProgressIndicator*)n.view;
    const double x = atof(val.c_str());
    if (p.indeterminate != (x < 0)) p.indeterminate = x < 0;
    if (x >= 0 && p.doubleValue != x) p.doubleValue = x;
    return;
  }
  NSControl* c = (NSControl*)n.view;
  const bool on = n.attr("enabled") != "0";
  if (c.enabled != on) c.enabled = on;
  auto lines = [](const std::string& s) { return s.empty() ? @[] : [ns(s) componentsSeparatedByString:@"\n"]; };
  if (n.kind == KPushButton || n.kind == KCheckbox) {
    NSButton* b = (NSButton*)c;
    NSString* t = ns(n.attr("title"));
    if (![b.title isEqualToString:t]) b.title = t;
  }
  if (n.kind == KPushButton) {
    NSButton* b = (NSButton*)c;
    const std::string& k = n.attr("keyEquivalent");
    NSString* key = k == "Enter" ? @"\r" : k == "Escape" ? @"\x1b" : ns(k);   // a letter goes with Command
    if (![b.keyEquivalent isEqualToString:key]) { b.keyEquivalent = key; b.keyEquivalentModifierMask = k.size() == 1 ? NSEventModifierFlagCommand : 0; }
  } else if (n.kind == KSwitch || n.kind == KCheckbox) setState(c, n.kind == KCheckbox && val == "mixed" ? NSControlStateValueMixed : val == "1" ? NSControlStateValueOn : NSControlStateValueOff);
  else if (n.kind == KPopup) {
    NSPopUpButton* pb = (NSPopUpButton*)c;
    NSArray<NSString*>* items = lines(n.attr("items"));
    if (![pb.itemTitles isEqualToArray:items]) { [pb removeAllItems]; [pb addItemsWithTitles:items]; }
    NSString* t = ns(val);
    if (![(pb.titleOfSelectedItem ?: @"") isEqualToString:t]) { if ([pb itemWithTitle:t]) [pb selectItemWithTitle:t]; else [pb selectItem:nil]; }
  } else if (n.kind == KSegmented) {
    NSSegmentedControl* sg = (NSSegmentedControl*)c;
    NSArray<NSString*>* items = lines(n.attr("items"));
    bool same = sg.segmentCount == (NSInteger)items.count;
    for (NSUInteger i = 0; same && i < items.count; i++) same = [[sg labelForSegment:(NSInteger)i] isEqualToString:items[i]];
    if (!same) { sg.segmentCount = (NSInteger)items.count; for (NSUInteger i = 0; i < items.count; i++) [sg setLabel:items[i] forSegment:(NSInteger)i]; }
    const NSInteger sel = val.empty() ? -1 : atol(val.c_str());
    if (sg.selectedSegment != sel) sg.selectedSegment = sel;
  } else if (n.kind == KSlider) {
    NSSlider* sl = (NSSlider*)c;
    const double lo = atof(n.attr("min").c_str()), hi = n.attr("max").empty() ? 100 : atof(n.attr("max").c_str()), x = atof(val.c_str());
    if (sl.minValue != lo) sl.minValue = lo;
    if (sl.maxValue != hi) sl.maxValue = hi;
    if (sl.doubleValue != x) sl.doubleValue = x;
  } else if (n.kind == KDatePicker) {
    NSDatePicker* d = (NSDatePicker*)c;
    NSDate* day = val.empty() ? nil : [dayFormat() dateFromString:ns(val)];
    if (day && ![d.dateValue isEqualToDate:day]) d.dateValue = day;
  }
}
void apply(Node& n) {
  NSView* v = n.view;
  v.hidden = n.hidden != 0;
  v.alphaValue = n.opacity;
  if ([v isKindOfClass:ZnView.class]) {
    ZnView* z = (ZnView*)v;
    z.bgColor = n.bg; z.bgAlpha = n.bgAlpha; z.radius = n.radius; z.borderWidth = n.border; z.borderColor = n.borderColor; z.focusable = n.focusable != 0;
    z.needsDisplay = YES;
  } else if (n.kind == KText) {
    NSTextField* l = (NSTextField*)v;
    l.font = fontOf(n.fontSize, n.bold != 0);
    l.textColor = fgOf(n) ?: NSColor.labelColor;
    NSString* s = ns(n.text);
    if (![l.stringValue isEqualToString:s]) l.stringValue = s;
  } else if (n.kind == KImage) {
    ((NSImageView*)v).image = imageNamed(n.text);
  } else if (isField(n.kind)) {
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
  } else if (isControl(n.kind)) applyControl(n);
  else if (n.kind == KCustom && n.custom) {   // every prop again (setters take the same value twice), then the commit's end
    for (const auto& a : n.attrs) n.cls->set(n.custom, a.first.c_str(), a.second.c_str());
    if (n.cls->done) n.cls->done(n.custom);
  }
  if (n.hasAx) {   // VoiceOver's name for it: on the view that takes the input (a field, a text view, a table), else the view; AppKit's own otherwise
    NSView* t = n.input ?: v;
    NSString* ax = n.axLabel.empty() ? nil : ns(n.axLabel);
    if (!(ax ? [ax isEqualToString:t.accessibilityLabel ?: @""] : t.accessibilityLabel == nil)) t.accessibilityLabel = ax;
  }
  n.dirty = false;
}
void setFrame(NSView* v, double x, double y, double w, double h) {
  const NSRect r = NSMakeRect(x, y, w, h);
  if (!NSEqualRects(v.frame, r)) v.frame = r;
}
// ---------------------------------------------------------------- Table and Outline (ZN-1072)
std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  size_t a = 0;
  for (size_t b; (b = s.find(sep, a)) != std::string::npos; a = b + 1) out.push_back(s.substr(a, b - a));
  out.push_back(s.substr(a));
  return out;
}
/** The text of the first text node under id: a cell's string in a row of the virtual list. */
const std::string* firstText(int id) {
  Node* n = live(id);
  if (!n) return nullptr;
  if (n->kind == KText) return &n->text;
  for (int k : n->kids) if (const std::string* s = firstText(k)) return s;
  return nullptr;
}
/** A Table from its attributes (columns, count, row height, sort, selection) and the cache of rows: the `row` nodes zinc:ui's virtual list built under
 *  its body this commit. Rows whose cells changed, came or went are reloaded; AppKit asks for the cells of the rows it shows. */
void applyTable(Node& n, bool changed) {
  ZnTableCtl* c = n.chrome;
  NSTableView* tv = c.table;
  bool all = false;
  if (changed) {
    const std::string& cols = n.attr("columns");
    if (cols != c->columns) {
      c->columns = cols;
      while (tv.tableColumns.count) [tv removeTableColumn:tv.tableColumns.lastObject];
      c->aligns.clear();
      if (!cols.empty()) for (const std::string& line : split(cols, '\n')) {   // id, title, width (0: shares what is left), sortable, align
        const std::vector<std::string> f = split(line, '\t');
        if (f.size() < 5) continue;
        NSTableColumn* col = [[NSTableColumn alloc] initWithIdentifier:ns(f[0])];
        col.title = ns(f[1]);
        const double w = atof(f[2].c_str());
        col.width = w > 0 ? w : 100;
        col.resizingMask = w > 0 ? NSTableColumnUserResizingMask : NSTableColumnAutoresizingMask | NSTableColumnUserResizingMask;
        if (f[3] == "1") col.sortDescriptorPrototype = [NSSortDescriptor sortDescriptorWithKey:ns(f[0]) ascending:YES];
        const NSTextAlignment al = f[4] == "right" ? NSTextAlignmentRight : f[4] == "center" ? NSTextAlignmentCenter : NSTextAlignmentNatural;
        col.headerCell.alignment = al;
        c->aligns.push_back(al);
        [tv addTableColumn:col];
      }
      all = true;
    }
    const double rh = atof(n.attr("rowHeight").c_str());
    if (rh > 0 && tv.rowHeight != rh) tv.rowHeight = rh;
    tv.allowsMultipleSelection = n.attr("multiple") == "1";
    const NSInteger count = atol(n.attr("count").c_str());
    if (count != c.count) { c.count = count; [tv noteNumberOfRowsChanged]; }
    const std::string& so = n.attr("sort");
    if (so != c->sort) {   // the indicator in the header
      c->sort = so;
      const size_t sp = so.rfind(' ');
      tv.sortDescriptors = sp == std::string::npos ? @[] : @[[NSSortDescriptor sortDescriptorWithKey:ns(so.substr(0, sp)) ascending:so.substr(sp + 1) == "1"]];
    }
  }
  std::unordered_map<int, std::vector<std::string>> fresh;
  for (int b : n.kids) if (Node* bn = live(b)) for (int r : bn->kids) if (Node* rn = live(r)) {
    const std::string& at = rn->attr("row");
    if (at.empty()) continue;
    std::vector<std::string> cells;
    for (int k : rn->kids) { const std::string* s = firstText(k); cells.push_back(s ? *s : std::string()); }
    fresh[atoi(at.c_str())] = std::move(cells);
  }
  NSMutableIndexSet* rows = [NSMutableIndexSet indexSet];
  for (const auto& [row, cells] : fresh) { auto it = c->cache.find(row); if (it == c->cache.end() || it->second != cells) [rows addIndex:(NSUInteger)row]; }
  for (const auto& [row, cells] : c->cache) if (!fresh.count(row)) [rows addIndex:(NSUInteger)row];
  c->cache.swap(fresh);
  if (all) { [tv reloadData]; [tv sizeLastColumnToFit]; }
  else {
    [rows removeIndexesInRange:NSMakeRange((NSUInteger)c.count, NSUIntegerMax - (NSUInteger)c.count)];
    if (rows.count) [tv reloadDataForRowIndexes:rows columnIndexes:[NSIndexSet indexSetWithIndexesInRange:NSMakeRange(0, (NSUInteger)tv.numberOfColumns)]];
  }
  const std::string& se = n.attr("selection");
  if (changed && se != c->selection) {   // the program's selection (type-select, its own); the user's comes back equal and changes nothing
    c->selection = se;
    NSMutableIndexSet* want = [NSMutableIndexSet indexSet];
    if (!se.empty()) for (const std::string& r : split(se, ',')) [want addIndex:(NSUInteger)atol(r.c_str())];
    if (![tv.selectedRowIndexes isEqualToIndexSet:want]) {
      [tv selectRowIndexes:want byExtendingSelection:NO];
      if (want.count) [tv scrollRowToVisible:(NSInteger)want.firstIndex];
    }
  }
}
/** Expands the items whose ids are in `open` and collapses the others, parents first. */
void expandTo(NSOutlineView* ov, NSArray<ZnItem*>* items, const std::vector<std::string>& open) {
  for (ZnItem* it in items) {
    const bool want = std::find(open.begin(), open.end(), str(it.ident)) != open.end();
    if (want && ![ov isItemExpanded:it]) [ov expandItem:it];
    else if (!want && [ov isItemExpanded:it]) [ov collapseItem:it];
    if (want) expandTo(ov, it.kids, open);
  }
}
/** An Outline from its attributes: the tree (one item object per id, the same across commits), the expanded ids, the selected id. */
void applyOutline(Node& n, bool changed) {
  if (!changed) return;
  ZnOutlineCtl* c = n.chrome;
  NSOutlineView* ov = c.outline;
  const double rh = atof(n.attr("rowHeight").c_str());
  if (rh > 0 && ov.rowHeight != rh) ov.rowHeight = rh;
  const std::string& tr = n.attr("tree");
  if (tr != c->tree) {
    c->tree = tr;
    NSMutableDictionary<NSString*, ZnItem*>* old = c.items;   // kept until reloadData has let go of the items that went
    NSMutableDictionary<NSString*, ZnItem*>* items = [NSMutableDictionary dictionary];
    NSMutableArray<ZnItem*>* roots = [NSMutableArray array];
    std::vector<ZnItem*> path;   // the item at each level above the current line
    if (!tr.empty()) for (const std::string& line : split(tr, '\n')) {   // level, id, label, in tree order
      const std::vector<std::string> f = split(line, '\t');
      if (f.size() < 3) continue;
      const size_t level = std::min((size_t)std::max(0, atoi(f[0].c_str())), path.size());
      NSString* key = ns(f[1]);
      ZnItem* it = old[key] ?: [[ZnItem alloc] init];
      it.ident = key; it.label = ns(f[2]); it.kids = [NSMutableArray array];
      path.resize(level);
      [(path.empty() ? roots : path.back().kids) addObject:it];
      path.push_back(it);
      items[key] = it;
    }
    c.items = items; c.roots = roots;
    [ov reloadData];
    old = nil;
    c->expanded = "\x01";   // expand and select again after the reload
    c->selection = "\x01";
  }
  const std::string& ex = n.attr("expanded");
  if (ex != c->expanded) { c->expanded = ex; expandTo(ov, c.roots, ex.empty() ? std::vector<std::string>() : split(ex, '\n')); }
  const std::string& se = n.attr("selection");
  if (se != c->selection) {
    c->selection = se;
    ZnItem* it = se.empty() ? nil : c.items[ns(se)];
    const NSInteger row = it ? [ov rowForItem:it] : -1;
    if (row != ov.selectedRow) {
      if (row >= 0) { [ov selectRowIndexes:[NSIndexSet indexSetWithIndex:(NSUInteger)row] byExtendingSelection:NO]; [ov scrollRowToVisible:row]; }
      else [ov deselectAll:nil];
    }
  }
}
void place(int id, double ox, double oy, NSMutableArray<NSView*>* into, bool pane = false);
NSWindow* hostWindow();
/** Node id's box in the root view: its offsets summed up to its root (a popover's anchor, flattened or not). */
NSRect boxOf(int id) {
  Node* n = live(id);
  if (!n) return NSZeroRect;
  double x = 0, y = 0;
  for (Node* p = n; p; p = live(p->parent)) { x += p->x; y += p->y; }
  return NSMakeRect(x, y, n->w, n->h);
}
/** Shows an overlay on the window: an alert or a sheet as a sheet of it (beginSheet: the call returns and SDL's pump goes on, never runModal), a
 *  popover at its anchor's box. Headless (the window that is never shown) nothing is presented: the overlay stays built for the dump and the tests. */
void present(ZnOverlay* o, const Node& n) {
  NSWindow* w = hostWindow();
  if (!w || !w.visible || !rootView.window) return;
  o.shown = YES;
  __weak ZnOverlay* weak = o;
  if (o.alert) [o.alert beginSheetModalForWindow:w completionHandler:^(NSModalResponse r) { [weak finish:r >= NSAlertFirstButtonReturn ? (double)(r - NSAlertFirstButtonReturn) : -1]; }];
  else if (o.sheet) [w beginSheet:o.sheet completionHandler:^(NSModalResponse) { [weak finish:-1]; }];
  else {
    const std::string& e = n.attr("edge");
    const NSRectEdge edge = e == "top" ? NSRectEdgeMinY : e == "left" ? NSRectEdgeMinX : e == "right" ? NSRectEdgeMaxX : NSRectEdgeMaxY;   // the root view is flipped
    [o.popover showRelativeToRect:boxOf(atoi(n.attr("anchor").c_str())) ofView:rootView preferredEdge:edge];
  }
}
/** An alert, a sheet or a popover node: built once (an NSAlert from its attributes; a sheet window or an NSPopover whose content holds the node's
 *  children at zinc:ui's boxes), its content placed at each commit, presented when it can be. The node takes no room in the window's content. */
void applyOverlay(int id, Node& n) {
  ZnOverlay* o = n.chrome;
  if (!o) {
    o = [[ZnOverlay alloc] init];
    if (n.kind == KAlert) o.alert = [[NSAlert alloc] init];
    else {
      o.content = [[ZnDoc alloc] initWithFrame:NSMakeRect(0, 0, n.w, n.h)];
      if (n.kind == KSheet) {
        o.sheet = [[ZnSheetWindow alloc] initWithContentRect:NSMakeRect(0, 0, n.w, n.h) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:YES];
        o.sheet.releasedWhenClosed = NO;
        o.sheet.overlay = o;
        o.sheet.contentView = o.content;
      } else {
        o.popover = [[NSPopover alloc] init];
        o.popover.behavior = NSPopoverBehaviorTransient;
        o.popover.delegate = o;
        NSViewController* vc = [[NSViewController alloc] init];
        vc.view = o.content;
        o.popover.contentViewController = vc;
      }
    }
    n.chrome = o;
    idOf[(__bridge const void*)o] = id;
  }
  if (n.kind == KAlert) {
    if (n.dirty) {
      NSAlert* al = o.alert;
      al.messageText = ns(n.attr("message"));
      al.informativeText = ns(n.attr("detail"));
      const std::string& st = n.attr("style");
      al.alertStyle = st == "critical" ? NSAlertStyleCritical : st == "warning" ? NSAlertStyleWarning : NSAlertStyleInformational;
      if (al.buttons.count == 0) for (NSString* b in [ns(n.attr("buttons")) componentsSeparatedByString:@"\n"]) [al addButtonWithTitle:b];
      [al layout];
    }
  } else {
    NSMutableArray<NSView*>* sub = [NSMutableArray array];
    for (int k : n.kids) place(k, 0, 0, sub);
    if (![o.content.subviews isEqualToArray:sub]) o.content.subviews = sub;
    const NSSize size = NSMakeSize(n.w, n.h);
    if (o.sheet && !NSEqualSizes(o.sheet.contentView.frame.size, size)) [o.sheet setContentSize:size];
    if (o.popover) { if (!NSEqualSizes(o.popover.contentSize, size)) o.popover.contentSize = size; setFrame(o.content, 0, 0, n.w, n.h); }
  }
  n.dirty = false;
  if (!o.shown && !o.closed) present(o, n);
}
/** The window's title and style from a Window node (ponytail: the main window only; more windows come with zinc:system's). */
void applyWindow(const Node& n) {
  NSWindow* w = hostWindow();
  if (!w) return;
  NSString* title = ns(n.attr("title"));
  if (title.length && ![w.title isEqualToString:title]) w.title = title;
  if (@available(macOS 11.0, *)) {
    const std::string& st = n.attr("toolbarStyle");
    const NSWindowToolbarStyle s = st == "expanded" ? NSWindowToolbarStyleExpanded : st == "preference" ? NSWindowToolbarStylePreference
                                 : st == "unifiedCompact" ? NSWindowToolbarStyleUnifiedCompact : st == "automatic" ? NSWindowToolbarStyleAutomatic : NSWindowToolbarStyleUnified;
    if (w.toolbarStyle != s) w.toolbarStyle = s;
  }
  const bool full = n.attr("fullSizeContent") == "1";
  if (((w.styleMask & NSWindowStyleMaskFullSizeContentView) != 0) != full) {
    w.styleMask = full ? w.styleMask | NSWindowStyleMaskFullSizeContentView : w.styleMask & ~NSWindowStyleMaskFullSizeContentView;
    w.titlebarAppearsTransparent = full;
  }
}
/** The item nodes of a Toolbar (through fragments), in order. */
void itemsOf(int id, std::vector<int>& out) {
  Node* n = live(id);
  if (!n) return;
  for (int k : n->kids) {
    Node* c = live(k);
    if (c && c->kind == KToolbarItem) out.push_back(k);
    else if (c && c->kind == KFragment) itemsOf(k, out);
  }
}
/** The window's NSToolbar from a Toolbar node: rebuilt when its items change (ids carry the handle's generation), updated in place otherwise. An item
 *  with children shows them: its node's view at the size zinc:ui's layout gave the item. */
void applyToolbar(int id, Node& n) {
  std::vector<int> items;
  itemsOf(id, items);
  NSMutableArray<NSToolbarItemIdentifier>* ids = [NSMutableArray array];
  for (int k : items) [ids addObject:[NSString stringWithFormat:@"zn.%d.%u", k, nodes[k].gen]];
  ZnToolbar* d = n.chrome;
  if (!d || ![d.ids isEqualToArray:ids]) {
    if (d) for (NSToolbarItem* it in d.items.allValues) idOf.erase((__bridge const void*)it);
    static int made = 0;
    d = [[ZnToolbar alloc] init];
    d.ids = ids;
    d.items = [NSMutableDictionary dictionary];
    for (NSUInteger i = 0; i < items.size(); i++) {
      NSToolbarItem* it = [[NSToolbarItem alloc] initWithItemIdentifier:ids[i]];
      it.target = d; it.action = @selector(press:);
      d.items[ids[i]] = it;
      nodes[items[i]].chrome = it;
      idOf[(__bridge const void*)it] = items[i];
    }
    d.toolbar = [[NSToolbar alloc] initWithIdentifier:[NSString stringWithFormat:@"zn.toolbar.%d", ++made]];
    d.toolbar.delegate = d;
    d.toolbar.allowsUserCustomization = NO;
    d.toolbar.displayMode = NSToolbarDisplayModeIconOnly;
    n.chrome = d;
  }
  for (int k : items) {
    Node& c = nodes[k];
    NSToolbarItem* it = c.chrome;
    NSString* label = ns(c.attr("label"));
    if (![it.label isEqualToString:label]) { it.label = label; it.toolTip = label.length ? label : nil; }
    if (c.kids.empty()) {   // a button item: its label and symbol (looked up again only when an attribute changed or the item is new)
      const std::string& sym = c.attr("symbol");
      if (c.dirty || (!it.image && !sym.empty())) it.image = sym.empty() ? nil : [NSImage imageWithSystemSymbolName:ns(sym) accessibilityDescription:label];
      c.dirty = false;
      continue;
    }
    NSMutableArray<NSView*>* one = [NSMutableArray array];
    place(k, 0, 0, one, true);
    NSView* v = c.view;
    if (!v) continue;
    v.translatesAutoresizingMaskIntoConstraints = NO;
    bool sized = false;
    for (NSLayoutConstraint* con in v.constraints)
      if (con.firstItem == v && con.secondItem == nil && (con.firstAttribute == NSLayoutAttributeWidth || con.firstAttribute == NSLayoutAttributeHeight)) {
        sized = true;
        con.constant = con.firstAttribute == NSLayoutAttributeWidth ? c.w : c.h;
      }
    if (!sized) { [v.widthAnchor constraintEqualToConstant:c.w].active = YES; [v.heightAnchor constraintEqualToConstant:c.h].active = YES; }
    if (it.view != v) it.view = v;
  }
  NSWindow* w = hostWindow();
  if (w && w.toolbar != d.toolbar) w.toolbar = d.toolbar;
}
/** Places node id (and its subtree) under the real view whose list is `into`, offset by the flattened ancestors (ox, oy). A pane of a split view
 *  (`pane`) is always a real view: the split view sizes its panes. */
void place(int id, double ox, double oy, NSMutableArray<NSView*>* into, bool pane) {
  Node* np = live(id);
  if (!np) return;
  Node& n = *np;
  const double x = ox + n.x, y = oy + n.y;
  if (n.kind == KWindow && n.dirty) applyWindow(n);
  if (n.kind == KToolbar) { applyToolbar(id, n); n.dirty = false; return; }   // in the window's title bar, not in the content
  if (n.kind == KToolbarItem && !pane) return;   // a toolbar item outside a Toolbar shows nothing
  if (isOverlay(n.kind)) { applyOverlay(id, n); return; }   // a sheet of the window or a popover, not in the content
  if (layoutOnly(n) && !(pane && n.kind != KFragment)) {
    if (n.view) forget(n);
    if (n.kind == KWindow) n.dirty = false;
    for (int k : n.kids) place(k, x, y, into, pane && n.kind == KFragment);
    return;
  }
  if (n.kind == KInput && n.view && [n.view isKindOfClass:NSSecureTextField.class] != (n.secure != 0)) forget(n);   // secure is another class
  if (!n.view) make(id, n);
  const bool changed = n.dirty;
  if (n.dirty) apply(n);
  if (n.kind != KToolbarItem) setFrame(n.view, x, y, n.w, n.h);   // a toolbar places its items (their size: constraints, applyToolbar)
  [into addObject:n.view];
  if (n.kind == KTable) { applyTable(n, changed); return; }        // its children are the drawn fallback and the rows' cache, not views
  if (n.kind == KOutline) { applyOutline(n, changed); return; }
  if (n.kind == KText || isField(n.kind) || n.kind == KTextArea || n.kind == KImage || isControl(n.kind) || n.kind == KCustom) return;   // leaves (a text's spans are in its string, a control's children are its drawn fallback)
  NSMutableArray<NSView*>* sub = [NSMutableArray array];
  for (int k : n.kids) place(k, 0, 0, sub, n.kind == KSplit);
  NSView* box = n.kind == KScroll ? ((NSScrollView*)n.view).documentView : n.view;
  if (![box.subviews isEqualToArray:sub]) box.subviews = sub;
  if (n.kind == KSplit && sub.count > 0) {   // the first pane's limits (a Sidebar's minWidth and maxWidth) bound the divider
    ZnSplit* sp = (ZnSplit*)n.view;
    auto it = idOf.find((__bridge const void*)sub[0]);
    const Node* first = it != idOf.end() ? live(it->second) : nullptr;
    const std::string& lo = first ? first->attr("minWidth") : std::string();
    const std::string& hi = first ? first->attr("maxWidth") : std::string();
    sp.minPane = lo.empty() ? 0 : atof(lo.c_str());
    sp.maxPane = hi.empty() ? 1e9 : atof(hi.c_str());
  }
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
    if ([NSStringFromClass(w.class) hasPrefix:@"SDL"]) return w;   // ponytail: SDL's own window class; the main window only
  return nil;
}
/** The window the tree shows in: SDL's, or headless the one that is never shown. */
NSWindow* hostWindow() { NSWindow* w = sdlWindow(); return w ?: offWindow; }
/** The root over SDL's view, the surface's logical pixels mapped onto it as the renderer maps them (letterbox); headless: a view in no window. */
void placeRoot() {
  int W = 0, H = 0;
  if (hal_surface_size) hal_surface_size(&W, &H);
  if (W <= 0 || H <= 0) { W = 320; H = 240; }
  if (!rootView) {
    rootView = [[ZnRoot alloc] initWithFrame:NSMakeRect(0, 0, W, H)];
    if (const char* a = getenv("ZINC_APPEARANCE"); a && *a)   // light or dark for one run (tests, screenshots); the system's setting otherwise
      rootView.appearance = [NSAppearance appearanceNamed:strcmp(a, "dark") == 0 ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
  }
  NSWindow* w = sdlWindow();
  if (w && rootView.window != w) [w.contentView addSubview:rootView positioned:NSWindowAbove relativeTo:nil];
  if (!w && !rootView.window) {   // headless (no SDL window): a titled window that is never shown, so fields take the first responder and the
    // title and the toolbar have a window (the tests drive and dump them)
    if (!NSApp) { [NSApplication sharedApplication]; [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited]; }   // no Dock icon, never active
    if (!offWindow) {
      offWindow = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, W, H) styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:YES];
      offWindow.releasedWhenClosed = NO;
    }
    [offWindow.contentView addSubview:rootView];
  }
  if (rootView.appearance && rootView.window && rootView.window.appearance != rootView.appearance) rootView.window.appearance = rootView.appearance;   // the chrome too
  NSView* host = rootView.superview;
  if (!host) { setFrame(rootView, 0, 0, W, H); return; }
  const NSSize s = host.bounds.size;
  const double k = fmin(s.width / W, s.height / H);
  setFrame(rootView, (s.width - W * k) / 2, (s.height - H * k) / 2, W * k, H * k);
  if (!NSEqualSizes(rootView.bounds.size, NSMakeSize(W, H))) rootView.bounds = NSMakeRect(0, 0, W, H);
}
/** Whether r is node n's first responder: its field, the window's field editor editing it, or its focusable view. */
bool responds(NSResponder* r, const Node& n) {
  if (!r) return false;
  if (n.input) return r == n.input || ([r isKindOfClass:NSTextView.class] && ((NSTextView*)r).delegate == (id)n.input);
  return n.view && r == n.view;
}
/** Moves the first responder where the last `o` record put zinc:ui's focus: a field, or a focusable view when the keyboard moved the focus (its
 *  ring shows; a press focuses without a ring, as on the web). Anything else gives the keys back to SDL's view, so no view of ours keeps them. */
void moveFocus() {
  if (focusWant == -2) return;
  NSWindow* w = rootView.window;
  if (!w) return;
  Node* n = live(focusWant);
  NSResponder* want = !n ? nil : n->input ? n->input : focusKeyboard && n->view && [n->view isKindOfClass:ZnView.class] && n->focusable ? n->view : nil;
  NSWindow* fw = want ? ((NSView*)want).window : nil;   // a field in a sheet or a popover is in that window
  if (want && fw && !(n && responds(fw.firstResponder, *n))) [fw makeFirstResponder:want];
  else if (!want) {
    NSResponder* now = w.firstResponder;
    const void* who = (__bridge const void*)now;
    const bool ours = idOf.count(who) || ([now isKindOfClass:NSTextView.class] && idOf.count((__bridge const void*)((NSTextView*)now).delegate));
    if (ours && ![w makeFirstResponder:rootView.superview]) [w makeFirstResponder:nil];
  }
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
  if (op == 'o') { focusWant = id; focusKeyboard = p < end && num(p) != 0; return; }
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
      if (n.kind == KUnknown && zn_host_view_class) if ((n.cls = zn_host_view_class(k.c_str()))) n.kind = KCustom;   // a plugin's view; none: a plain view of the fallback
      return;
    }
    case 'f': n.x = num(p); n.y = num(p); n.w = num(p); n.h = num(p); return;
    case 't': n.text = unescape(p, end); n.dirty = true; return;
    case 'a': {
      const char* sp = (const char*)memchr(p, ' ', end - p);
      const std::string name(p, sp ? sp : end);
      const std::string v = sp ? unescape(sp + 1, end) : "";
      if (name == "placeholder") n.placeholder = v;
      else if (name == "axlabel") { n.axLabel = v; n.hasAx = true; }
      else {
        bool found = false;
        for (auto& a : n.attrs) if (a.first == name) { a.second = v; found = true; }
        if (!found) n.attrs.emplace_back(name, v);
      }
      n.dirty = true;
      return;
    }
    case 'p': {
      const char* sp = (const char*)memchr(p, ' ', end - p);
      if (!sp) return;
      const std::string name(p, sp);
      const double v = strtod(sp + 1, nullptr);
      double Node::*const fields[] = {&Node::bg, &Node::bgAlpha, &Node::fg, &Node::opacity, &Node::radius, &Node::border, &Node::borderColor, &Node::fontSize, &Node::bold, &Node::hidden, &Node::secure, &Node::focusable};
      const char* const names[] = {"bg", "bgAlpha", "fg", "opacity", "radius", "border", "borderColor", "fontSize", "bold", "hidden", "secure", "focusable"};
      for (int i = 0; i < 12; i++) if (name == names[i]) n.*fields[i] = v;
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
/** A Table's or an Outline's line goes on: its rows, cache and selection, then its columns and the rows in view, read back from the cells AppKit made
 *  (the cells hold what the data source answered from the cache). */
void dumpList(const Node& n, int depth, std::string& out) {
  NSTableView* tv = (NSTableView*)n.input;
  char b[96];
  __block std::string sel;
  [tv.selectedRowIndexes enumerateIndexesUsingBlock:^(NSUInteger i, BOOL*) { sel += (sel.empty() ? "" : ",") + std::to_string(i); }];
  snprintf(b, sizeof b, " rows=%ld", (long)tv.numberOfRows);
  out += b;
  if (n.kind == KTable) {
    ZnTableCtl* c = n.chrome;
    snprintf(b, sizeof b, " cached=%zu", c->cache.size());
    out += b;
    if (NSSortDescriptor* d = tv.sortDescriptors.firstObject) out += " sort=" + str(d.key) + (d.ascending ? " asc" : " desc");
  }
  if (!sel.empty()) out += " sel=" + sel;
  out += "\n";
  const std::string pad(depth * 2 + 2, ' ');
  if (n.kind == KTable)
    for (NSTableColumn* col in tv.tableColumns) out += pad + "column " + str(col.identifier) + " " + qstr(str(col.title)) + (col.sortDescriptorPrototype ? " sortable" : "") + "\n";
  const NSRange vis = [tv rowsInRect:tv.visibleRect];
  for (NSUInteger r = vis.location; r < NSMaxRange(vis); r++) {
    if (n.kind == KTable && r > vis.location + 1 && r + 1 < NSMaxRange(vis)) continue;   // the first two rows in view and the last
    snprintf(b, sizeof b, "row %lu", (unsigned long)r);
    out += pad + b;
    if (n.kind == KOutline) {
      NSOutlineView* ov = (NSOutlineView*)tv;
      ZnItem* it = [ov itemAtRow:(NSInteger)r];
      snprintf(b, sizeof b, " level=%ld", (long)[ov levelForRow:(NSInteger)r]);
      out += b + std::string(it.kids.count ? ([ov isItemExpanded:it] ? " open" : " closed") : "");
    }
    for (NSInteger k = 0; k < tv.numberOfColumns; k++) {
      NSTableCellView* cell = [tv viewAtColumn:k row:(NSInteger)r makeIfNecessary:YES];
      out += " " + qstr(cell ? str(cell.textField.stringValue) : "?");
    }
    out += "\n";
  }
}
/** A control's state read back from AppKit: its title, on or off, the item, the segment, the value, the date. */
std::string controlDump(const Node& n, NSView* v) {
  if (n.kind == KProgress) { NSProgressIndicator* p = (NSProgressIndicator*)v; return p.indeterminate ? " indeterminate" : " value=" + fmtNum(p.doubleValue); }
  NSControl* c = (NSControl*)v;
  std::string s;
  if (n.kind == KPushButton || n.kind == KCheckbox) s += " " + qstr(str(((NSButton*)c).title));
  if (n.kind == KPushButton && ((NSButton*)c).keyEquivalent.length) {
    NSString* k = ((NSButton*)c).keyEquivalent;
    s += " key=" + ([k isEqualToString:@"\r"] ? std::string("return") : [k isEqualToString:@"\x1b"] ? std::string("escape") : "cmd-" + str(k));
  }
  if (n.kind == KSwitch || n.kind == KCheckbox) s += stateOf(c) == NSControlStateValueMixed ? " mixed" : stateOf(c) == NSControlStateValueOn ? " on" : " off";
  if (n.kind == KPopup) s += " " + qstr(controlValue(n, c)) + " items=" + std::to_string((long)((NSPopUpButton*)c).numberOfItems);
  if (n.kind == KSegmented) {
    NSSegmentedControl* sg = (NSSegmentedControl*)c;
    s += " sel=" + controlValue(n, c) + " items=";
    for (NSInteger i = 0; i < sg.segmentCount; i++) s += (i ? "|" : "") + str([sg labelForSegment:i]);
  }
  if (n.kind == KSlider) s += " value=" + fmtNum(c.doubleValue) + " range=" + fmtNum(((NSSlider*)c).minValue) + ".." + fmtNum(((NSSlider*)c).maxValue);
  if (n.kind == KDatePicker) s += " " + qstr(controlValue(n, c));
  if (!c.enabled) s += " disabled";
  return s;
}
void dumpView(NSView* v, int depth, std::string& out);
/** The overlays after the root: an alert's texts and buttons, a sheet's or a popover's size and content, and whether AppKit shows it. */
void dumpOverlays(std::string& out) {
  for (size_t i = 0; i < nodes.size(); i++) {
    const Node& n = nodes[i];
    if (!n.live || !isOverlay(n.kind) || !n.chrome) continue;
    ZnOverlay* o = n.chrome;
    char b[160];
    snprintf(b, sizeof b, "#%zu %s", i, kKinds[n.kind]);
    out += b;
    if (o.alert) {
      out += " " + qstr(str(o.alert.messageText)) + " " + qstr(str(o.alert.informativeText)) + " buttons";
      for (NSButton* btn in o.alert.buttons) out += " " + qstr(str(btn.title));
    } else {
      snprintf(b, sizeof b, " %gx%g", n.w, n.h);
      out += b;
      if (o.popover) { const NSRect r = boxOf(atoi(n.attr("anchor").c_str())); snprintf(b, sizeof b, " at %g,%g %gx%g %s", r.origin.x, r.origin.y, r.size.width, r.size.height, n.attr("edge").c_str()); out += b; }
    }
    out += o.shown ? " shown" : " offscreen";
    out += "\n";
    if (o.content) for (NSView* s in o.content.subviews) dumpView(s, 1, out);
  }
}
void dumpView(NSView* v, int depth, std::string& out) {
  auto it = idOf.find((__bridge const void*)v);
  Node* n = it != idOf.end() ? live(it->second) : nullptr;
  if (!n) { for (NSView* s in v.subviews) dumpView(s, depth, out); return; }   // AppKit's own views (a scroll view's clip view and document)
  char b[160];
  const NSRect f = v.frame;
  const char* kind = n->kind == KCustom ? n->cls->kind : n->kind >= KPushButton && n->kind < KUnknown ? kKinds[n->kind] : n->kind == KText ? "label" : n->kind == KImage ? "image" : n->kind == KScroll ? "scroll" : n->kind == KInput ? (n->secure ? "secure" : "field") : n->kind == KTextArea ? "area"
                   : n->kind == KSplit ? "split" : n->kind == KSidebar ? "sidebar" : n->kind == KToolbarItem ? "item" : n->kind == KTable ? "table" : n->kind == KOutline ? "outline" : "view";
  snprintf(b, sizeof b, "%*s#%d %s %g,%g %gx%g", depth * 2, "", it->second, kind, f.origin.x, f.origin.y, f.size.width, f.size.height);
  out += b;
  if (n->kind == KText || isField(n->kind) || n->kind == KTextArea || n->kind == KImage) out += " " + qstr(n->text);
  if (!n->placeholder.empty()) out += " placeholder=" + qstr(n->placeholder);
  if (!n->axLabel.empty()) out += " ax=" + qstr(n->axLabel);
  if (n->kind == KText || isField(n->kind) || n->kind == KTextArea) {
    const double fg = fgValue(*n);
    snprintf(b, sizeof b, " size=%g%s fg=", n->fontSize, n->bold ? " bold" : "");
    out += b + (fg >= 0 ? hex(fg) : n->kind == KText ? "label" : "text");   // the system colours by name: they follow dark mode
  }
  if (isControl(n->kind)) { out += controlDump(*n, v) + "\n"; return; }   // the classes are its drawn fallback's: AppKit draws it
  if (n->kind == KCustom) {   // what the plugin's view shows, when it is a control; its props as the host gave them
    if ([v isKindOfClass:NSControl.class]) out += " shows=" + qstr(str(((NSControl*)v).stringValue)) + (((NSControl*)v).enabled ? "" : " disabled");
    for (const auto& a : n->attrs) out += " " + a.first + "=" + qstr(a.second);
    out += "\n";
    return;
  }
  if (n->bg >= 0) out += " bg=" + hex(n->bg) + (n->bgAlpha < 255 ? "/" + std::to_string((int)n->bgAlpha) : "");
  if (n->border > 0) { snprintf(b, sizeof b, " border=%g", n->border); out += b + hex(n->borderColor); }
  if (n->radius > 0) { snprintf(b, sizeof b, " radius=%g", n->radius); out += b; }
  if (n->opacity < 1) { snprintf(b, sizeof b, " opacity=%g", n->opacity); out += b; }
  if (n->hidden) out += " hidden";
  if (n->kind == KImage) out += ((NSImageView*)v).image ? " loaded" : " missing";
  if (n->focusable && !n->input) out += " focusable";   // (fields always are)
  if (responds(v.window.firstResponder, *n)) out += " first";   // the first responder: where the keys go
  if (n->kind == KScroll) { snprintf(b, sizeof b, " content=%gx%g", n->cw, n->ch); out += b; }   // zinc:ui's sizes, not AppKit's (they depend on the scroller setting)
  if (n->kind == KTable || n->kind == KOutline) { dumpList(*n, depth, out); return; }
  out += "\n";
  if (n->kind == KScroll) { for (NSView* s in ((NSScrollView*)v).documentView.subviews) dumpView(s, depth + 1, out); return; }
  if (n->kind == KTextArea) return;
  for (NSView* s in v.subviews) dumpView(s, depth + 1, out);
}

/** drive() on a Table or an Outline, through AppKit as a person's input goes: 2 scrolls to (x, y) of the table, 6 sorts by column `s` (x 1:
 *  ascending) as a click on its header does, 7 selects rows "3,4" (an Outline: the item id), 8 types the keys of `s` into it (type-select), 9 expands
 *  (x 1) or collapses item `s` of an Outline. */
bool driveList(Node& n, int action, NSString* s, double x, double y) {
  NSTableView* tv = (NSTableView*)n.input;
  if (action == 2) { [tv scrollPoint:NSMakePoint(x, y)]; return true; }
  if (action == 6 && n.kind == KTable) { tv.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:s ascending:x != 0]]; return true; }
  if (action == 7) {
    NSMutableIndexSet* rows = [NSMutableIndexSet indexSet];
    if (n.kind == KOutline) {
      ZnOutlineCtl* c = n.chrome;
      ZnItem* it = c.items[s];
      const NSInteger r = it ? [(NSOutlineView*)tv rowForItem:it] : -1;
      if (r < 0) return false;
      [rows addIndex:(NSUInteger)r];
    } else for (NSString* r in [s componentsSeparatedByString:@","]) if (r.length) [rows addIndex:(NSUInteger)r.integerValue];
    [tv selectRowIndexes:rows byExtendingSelection:NO];
    return true;
  }
  if (action == 8) {
    NSWindow* w = tv.window;
    if (!w) return false;
    [w makeFirstResponder:tv];
    for (NSUInteger i = 0; i < s.length; i++) {
      NSString* ch = [s substringWithRange:NSMakeRange(i, 1)];
      NSEvent* e = [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime
                                windowNumber:w.windowNumber context:nil characters:ch charactersIgnoringModifiers:ch isARepeat:NO keyCode:0];
      [tv keyDown:e];
    }
    return true;
  }
  if (action == 9 && n.kind == KOutline) {
    ZnOutlineCtl* c = n.chrome;
    ZnItem* it = c.items[s];
    if (!it) return false;
    if (x != 0) [(NSOutlineView*)tv expandItem:it]; else [(NSOutlineView*)tv collapseItem:it];
    return true;
  }
  return false;
}

struct MacAppkit : NativeAppkit, zrt::Poller {
  zrt::Fn<void(int32_t, int32_t, zrt::String, double, double)> cb;
  bool started = false;

  bool start() override {
    if (!started) {
      if (zn_host_set_native_measure) zn_host_set_native_measure(&measure, nullptr);   // a program that never lays out with Yoga has no hook: its leaves keep the engine's measure
      started = true;
    }
    return true;
  }
  void commit(zrt::String changes) override {
    @autoreleasepool {
      CommitScope scope;
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
      if (NSWindow* w = rootView.window; w && w == hostWindow()) {   // the chrome: title, style, toolbar items
        for (const Node& n : nodes) if (n.live && n.kind == KWindow) {
          const char* const styles[] = {"automatic", "expanded", "preference", "unified", "unifiedCompact"};
          int st = 0;
          if (@available(macOS 11.0, *)) st = (int)w.toolbarStyle;
          out += "window " + qstr(str(w.title)) + " toolbar=" + (st >= 0 && st < 5 ? styles[st] : "?") + ((w.styleMask & NSWindowStyleMaskFullSizeContentView) ? " fullsize" : "") + "\n";
        }
        if (NSToolbar* t = w.toolbar) {
          out += "toolbar\n";
          for (NSToolbarItem* it in t.items) {
            auto f = idOf.find((__bridge const void*)it);
            snprintf(b, sizeof b, "  #%d item ", f != idOf.end() ? f->second : -1);
            out += b + qstr(str(it.label));
            if (it.image) out += " symbol";
            if (it.view && f != idOf.end()) {
              snprintf(b, sizeof b, " view %gx%g\n", nodes[f->second].w, nodes[f->second].h);
              out += b;
              for (NSView* s in it.view.subviews) dumpView(s, 2, out);
            } else out += "\n";
          }
        }
      }
      snprintf(b, sizeof b, "root %gx%g\n", rootView.bounds.size.width, rootView.bounds.size.height);
      out += b;
      for (NSView* v in rootView.subviews) dumpView(v, 1, out);
      dumpOverlays(out);
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
      if (n && action == 5) {   // a click on a toolbar item
        if (n->kind != KToolbarItem || !n->chrome) return false;
        NSToolbarItem* it = n->chrome;
        return [NSApp sendAction:it.action to:it.target from:it];
      }
      if (n && action == 12) {   // an overlay ended by the person: button x of an alert (-1: dismissed), a sheet or a popover dismissed
        if (!isOverlay(n->kind) || !n->chrome) return false;
        ZnOverlay* o = n->chrome;
        if (o.shown && o.alert && x >= 0 && x < (double)o.alert.buttons.count) [o.alert.buttons[(NSUInteger)x] performClick:nil];
        else if (o.shown && o.popover) [o.popover performClose:nil];
        else if (o.shown && o.sheet) [o.sheet cancelOperation:nil];
        else [o finish:o.alert ? x : -1];
        return true;
      }
      if (!n || !n->view) return false;
      NSString* s = ns(std::string(text.ptr(), text.bytes()));
      if (isControl(n->kind) && n->kind != KProgress && (action == 10 || action == 11)) {   // a click on a button, a switch or a check box; a value set as by the person
        NSControl* c = (NSControl*)n->view;
        if (action == 10) {
          if (n->kind != KPushButton && n->kind != KSwitch && n->kind != KCheckbox) return false;   // a pop-up's click opens its menu (a tracking loop)
          [c performClick:nil];
          return true;
        }
        if (n->kind == KPopup) { if (![(NSPopUpButton*)c itemWithTitle:s]) return false; [(NSPopUpButton*)c selectItemWithTitle:s]; }
        else if (n->kind == KSegmented) ((NSSegmentedControl*)c).selectedSegment = s.integerValue;
        else if (n->kind == KSlider) c.doubleValue = x;
        else if (n->kind == KDatePicker) { NSDate* d = [dayFormat() dateFromString:s]; if (!d) return false; ((NSDatePicker*)c).dateValue = d; }
        else return false;
        return [c sendAction:c.action to:c.target];
      }
      if (n->kind == KCustom && action == 11) {   // a plugin's control set as by the person: its text, else the number x; its action follows
        if (![n->view isKindOfClass:NSControl.class]) return false;
        NSControl* c = (NSControl*)n->view;
        if (s.length) c.stringValue = s; else c.doubleValue = x;
        return [c sendAction:c.action to:c.target];
      }
      if (n->kind == KTable || n->kind == KOutline) return driveList(*n, action, s, x, y);
      if (action == 4) {   // a divider dragged to x, as the mouse would (the views' own drag path)
        if (n->kind != KSplit) return false;
        [(ZnSplit*)n->view dragTo:x divider:0];
        return true;
      }
      if (action == 2) {
        if (n->kind != KScroll) return false;
        NSScrollView* sv = (NSScrollView*)n->view;
        [sv.contentView scrollToPoint:NSMakePoint(x, y)];
        [sv reflectScrolledClipView:sv.contentView];
        return true;
      }
      if ((!isField(n->kind) && n->kind != KTextArea) || !n->input || !n->input.window) return false;
      if (n->input.window.firstResponder != n->input && !([n->input isKindOfClass:NSTextField.class] && ((NSTextField*)n->input).currentEditor)) [n->input.window makeFirstResponder:n->input];
      NSTextView* ed = [n->input isKindOfClass:NSTextField.class] ? (NSTextView*)((NSTextField*)n->input).currentEditor : (NSTextView*)n->input;
      if (!ed) return false;
      if (action == 0) [ed insertText:s replacementRange:ed.selectedRange];
      else if (action == 1) [ed insertNewline:nil];
      else if (action == 3) [ed doCommandBySelector:NSSelectorFromString(s)];   // a key's command as the key binding sends it ('insertTab:')
      else return false;
      return true;
    }
  }
  void onEvent(zrt::Fn<void(int32_t, int32_t, zrt::String, double, double)> f) override { cb = f; }

  std::vector<int> resync;   // controls whose new value the program got in the last poll: they show their attribute again now (a refused value goes)
  bool poll() override {
    if (rootView && rootView.superview) placeRoot();   // follows the window's size
    for (int id : resync) if (Node* n = live(id)) {
      if (n->view && isControl(n->kind)) applyControl(*n);
      else if (n->view && n->kind == KCustom) apply(*n);   // its props again: a value the program refused goes
    }
    resync.clear();
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
      if (e.kind == EvCValue || e.kind == EvView) resync.push_back(e.id);
    }
    return true;
  }
  void shutdown() override {
    cb = nullptr;
    queue.clear(); resync.clear();
    for (Node& n : nodes) forget(n);
    nodes.clear(); roots.clear(); idOf.clear();
    [rootView removeFromSuperview];
    rootView = nil; focusWant = -2;
    if (zn_host_set_native_measure && started) zn_host_set_native_measure(nullptr, nullptr);
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
