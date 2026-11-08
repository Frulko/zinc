# AppKit in Zinc, the way React Native does it (research, 2026-11-08)

Asked by the owner on 2026-11-08: a Zinc program describes its UI in JSX/TSX (capitalised components, `className`), and real AppKit views
(NSWindow, NSView, NSButton, NSTextField, NSTableView, NSOutlineView, NSScrollView, NSStackView, menus, toolbars, sidebars, popovers,
sheets) are created and driven on macOS, instead of Zinc drawing the UI itself. Research and analysis only: nothing was built, run or
committed. Read in the tree at `95ed5e4ec`.

## 1. The answer in one page

**Make AppKit a second way to show the zinc:ui tree, not a second UI library.** Zinc already has exactly this shape on the web:
`--render dom` keeps zinc:ui's tree (built by the Solid, React and React Native models, unchanged) and hands each changed frame to a
host that patches real HTML elements, with the browser's events coming back through a dozen `ui.dom*` functions
(`lib/std/ui.ts` from line 7739, `targets/web/dom.js`, 1,069 lines). An AppKit host is the same idea on macOS: after each frame that
changed something, zinc:ui hands the changes to a host that creates and updates NSViews; the controls' events come back through the
same functions. What differs from the web is who lays out: AppKit has no flexbox, so Yoga (already in the engine, `src/host/layout_yoga.cpp`)
keeps laying out in Zinc and the host only sets frames, which is what React Native does on iOS and macOS. Text and controls are
measured by AppKit itself through Yoga's measure functions, as React Native's Fabric does.

On top of the primitives (`View`, `Text`, `Image`, `ScrollView`, `TextInput`, `Pressable`), a typed module `zinc:appkit` gives the
controls that have no primitive: `Window`, `Toolbar`, `SplitView` with a `Sidebar`, `Table` and `Outline` (NSTableView and NSOutlineView
with their own row recycling), `PushButton`, `PopUpButton`, `SegmentedControl`, `Switch`, `Slider`, `DatePicker`, `SearchField`,
`Popover`, `Sheet`. A project chooses the renderer in `zinc.json` (`"ui": { "render": "native" }`); where no native host exists (Linux,
the Pi, a board, the web canvas) the same program runs with the drawn UI and the macOS platform look of D130, so nothing is lost.

No general Objective-C runtime bridge now (NativeScript's model): it scores lowest (section 7), it is not declarative, and it would make
Zinc programs Apple-only. Custom native components come through plugins with a typed spec (the D127 path), as Fabric native
components and Lynx custom elements do.

Score (RULES §4, out of 70): native host of the zinc:ui tree 58, a separate AppKit reconciler 52, SwiftUI hosting 47, a general objc
bridge 36. The first milestone is a small "Finder-like" app: a window with a toolbar, a sidebar, a table of 10,000 rows, a form, the
menu bar, dark mode and VoiceOver, proved on the three engines (section 9).

## 2. Why this reopens earlier decisions, and what it does not change

Two earlier reports scored "native widgets for the host components" low: D59 (`zinc:ui` on native widgets, 33) and
`docs/reports/native-fidelity-and-plugins.md` §4.1 (37), whose section 6 says "no native widgets for host components". Both scored it
as *the* renderer of Zinc: it would break the Pi, the ESP32, webOS and the pixel goldens. This report keeps that verdict for the default
renderer. What the owner asks for now is different: an *additional* renderer, chosen per project, for apps that want to be Mac apps
(Finder, Notes, Xcode's inspectors), the way React Native for macOS sits next to React Native's other platforms. The drawn UI stays the
default everywhere, and the demos, goldens and boards do not move.

It also completes what D136 (NativeView), D130 (platform looks) and D163 (primitives that draw nothing unasked) started: D136 puts one
native view over the drawn surface; this puts the drawn surface, when wanted, inside a native window (section 6.1).

## 3. What Zinc already has that this builds on

| Piece | Where | Why it matters here |
|---|---|---|
| One tree for every model: Solid, React, React Native all build zinc:ui nodes (`createNode`, `insert`, `setText`, `setClass`...) | `lib/std/ui.ts` (VIEW, TEXT, BUTTON, IMAGE, SCROLL, CANVAS, INPUT, TEXTAREA), `lib/std/solid.ts`, `lib/std/react.ts`, `lib/std/react-native.tsx` | a native host mirrors this tree: no model changes, Fast Refresh (D124) keeps working |
| A retained external renderer already exists: the semantic DOM | `lib/std/ui-dom.ts` / `ui-dom.browser.ts` (a module chosen per target), `frame()` calls `domCommit()` instead of `paint()` (`ui.ts` line 6576), events back through `domEdit`, `domSelect`, `domChanged`, `domFocus`, `domScroll`, `domViewport`, `domKey`, `domDismiss`, `domOutside`, `domLayers`, `domVirtual`, `domRows`, `submitFrom` | the contract a native host needs is written and tested; virtual lists already tell an outside renderer which rows exist and how much room the others take |
| Changes sent as a diff only when something changed | the screen reader bridge (`syncA11y`, `ui.ts` line 2225: `n ID PARENT FLAGS X Y W H ROLE LABEL VALUE HINT`, `d ID`, `o ...`), NativeView's `place` (D136) | the same "tell the host only what changed" walk, with more fields, is the mount step |
| Layout in the host, leaves measured natively | `src/host/layout_yoga.cpp` (Yoga 3.2.1, `Leaf` measure functions, never a call back into the program), `src/host/layout_host.cpp` (classic) | an AppKit measure (text with the system font, a control's `fittingSize`) is one more `Leaf` kind |
| The program runs on the main thread on macOS | `docs/reports/threads-ui-compute-animation.md` §1.1: SDL needs the main thread; live resize draws from inside the event pump | AppKit calls are made directly, no thread hop (React Native needs one: section 4.1) |
| Native menus, dock, tray, dialogs, notifications | `plugins/system/native/system.macos.mm` (NSMenu with a target object, roles as AppKit selectors) | the menu bar and context menus are done; under the native renderer the Edit roles (copy, paste, undo) become real responder-chain selectors, which `system-integration.md` §4 could not do with drawn fields |
| NativeView: an NSView laid over the surface at a node's box | D136, `plugins/webview/src/webview.mm` (reaches SDL's NSWindow through `SDL_PROP_WINDOW_COCOA_WINDOW_POINTER`) | proves Objective-C++ plugins, SDL's window and our own NSViews live together |
| The native ABI and its cost | `include/zn/native.h`, `docs/reports/zinc-next-native-abi.md`: 60 ns per call on the interpreter and AOT; about 150 ns per call from QuickJS (`zinc-next-perf.md`, ZN-567, Intel Mac) | one call per frame carrying a buffer of changes makes the engine's call cost negligible |
| Plugins with ObjC/Swift glue generated from a spec | D127: `zinc native-gen --ios`, plugin.json `ios` entries | the path for custom native components |

What is missing on the Mac today and comes free with native views: a VoiceOver bridge (the screen reader bridges of ZN-630 exist for iOS
and Android only; macOS is "revisit" in `zinc-next-a11y-bridges.md`), marked text for input methods (the drawn fields receive committed
text only: `native-fidelity-and-plugins.md` §2), the system font, and the native look of each new macOS release.

## 4. How others do it, and what it costs them

### 4.1 React Native and React Native for macOS (Microsoft)

- **The pipeline** (Fabric, the new architecture): render (React builds elements; the renderer builds an immutable C++ shadow tree, one
  node per host component only), commit (Yoga lays out the shadow tree in C++; text and TextInput are measured by a host-platform
  function), mount (the new tree is diffed into a list of atomic mutations, `create`, `update`, `remove`, `delete`, applied on the UI
  thread). Render usually runs on the JavaScript thread, commit on a background thread, mount on the UI thread; when the commit
  happens on the UI thread, mounting is synchronous.
  [render pipeline](https://reactnative.dev/architecture/render-pipeline)
- **View flattening**: views that only lay out (a margin, a padding wrapper) never become host views; the docs cite trees of 600 to
  1,000 shadow nodes reduced to about 200 host views.
  [render pipeline](https://reactnative.dev/architecture/render-pipeline), [view flattening](https://reactnative.dev/architecture/view-flattening)
- **Native components** are written per platform and their glue is generated from a typed spec (Codegen).
  [Fabric native components](https://reactnative.dev/docs/fabric-native-components-introduction),
  [Codegen](https://reactnative.dev/docs/the-new-architecture/what-is-codegen)
- **React Native for macOS** is a fork of React Native kept by Microsoft (MIT, macOS 11+), with AppKit implementations of the host
  components; Fabric on macOS started as experimental in 0.71 and is still being completed: in March 2026 a pull request fixed CSS
  transforms under Fabric because NSView has no transform property and AppKit resets `layer.transform` during its own layout and display.
  [repository](https://github.com/microsoft/react-native-macos),
  [0.71 announcement](https://devblogs.microsoft.com/react-native/2023-04-27-announcing-macos-71),
  [PR 2866](https://github.com/microsoft/react-native-macos/pull/2866)
- **Cost**: a fork that follows upstream releases, CocoaPods and an Xcode build of React Native itself
  (`docs/reports/perf-comparison-2026-10.md` skipped it for that reason), a JavaScript thread separate from the UI thread, and AppKit
  quirks per component (transforms, hit testing, focus). What it gets: real controls, VoiceOver, input methods, the macOS look.
- **Lesson for Zinc**: the shape (shadow tree in C++, Yoga, native measure, a mutation list, flattening) is right; the thread hop and the
  fork are costs Zinc does not have to pay, because its program already runs on the main thread and its tree is its own.

### 4.2 NativeScript (direct access to the Objective-C runtime)

- A metadata generator reads the SDK headers and writes compact metadata (`.nsmd`) plus TypeScript declarations for every Objective-C
  class of the iOS or macOS SDK; the runtime maps JavaScript calls onto native calls with it. Only Objective-C entities are exposed
  (no C++, and on static frameworks no C functions or constants). The current runtime is engine-agnostic, on Node-API and libffi.
  [runtime-node-api](https://github.com/NativeScript/runtime-node-api),
  [metadata (v6 docs)](https://v6.docs.nativescript.org/core-concepts/metadata),
  [ios-jsc](https://github.com/NativeScript/ios-jsc)
- **Cost**: every SDK update means regenerating metadata; libffi for calls, runtime class creation for delegates and subclassing,
  block signatures that the runtime cannot introspect; programs written against `NSTableView` run only on Apple platforms. The UI
  layer (NativeScript's own components) is built on top of this, so the bridge alone is not a UI framework.
- **Lesson**: a general bridge is a power tool for escape hatches, not the way people should write their UI.

### 4.3 Valdi (Snap) and Lynx (ByteDance)

- **Valdi**: TSX components compiled to native views on iOS, Android and macOS; a C++ flexbox layout on the main thread; a global pool
  that reuses native views across screens; only visible views are inflated; components re-render without their parents; bindings to
  Kotlin, Objective-C and Swift generated from TypeScript interfaces; `<custom-view>` for platform views; MIT, beta, used in Snapchat for
  about eight years. [repository](https://github.com/Snapchat/Valdi)
- **Lynx**: a main thread that renders and a background thread that runs user code, native views per element on iOS and Android,
  custom elements as `LynxUI` subclasses with prop setters registered by name; no macOS target confirmed by its docs.
  [custom native element](https://lynxjs.org/guide/custom-native-component.html),
  [InfoQ](https://www.infoq.com/news/2025/03/tiktok-lynx-cross-platform-apps)
- **Lesson**: the newest frameworks keep the React Native shape (declarative TS, own layout, native views) and invest in two things:
  view recycling and typed generated glue. Valdi shows macOS can be a target of the same component model.

### 4.4 Flutter's platform views on macOS (the opposite direction)

- Flutter draws its own UI and embeds AppKit views with `AppKitView` by hybrid composition (the NSView appended to the hierarchy). The
  docs say macOS support "isn't fully functional" (no gestures yet), call it expensive, and warn that the raster thread synchronises
  with the platform thread. [macOS platform views](https://docs.flutter.dev/platform-integration/macos/platform-views)
- **Lesson**: islands of native views inside a drawn UI stay second-class; Zinc's NativeView (D136) has the same limits by design
  (rectangle clip, hidden under overlays). For an app that is mostly native, the native tree must be the base.

### 4.5 Desktop shells: Tauri and Electron

- Both draw the UI in a web view and use native only for the chrome: Tauri's menus are `muda`, which wraps NSMenu through the
  `objc2-app-kit` bindings, must be created on the main thread, and accepts only submenus in the macOS menu bar; Electron's `Menu`
  maps roles to AppKit selectors; its Touch Bar API stays "experimental".
  [muda](https://docs.rs/muda), [Electron Menu](https://electronjs.org/docs/api/menu)
- **Lesson**: this is where Zinc already is (`zinc:system` menus, dock, tray). It is the floor, not the request.

### 4.6 Native toolkits and declarative Apple bridges

- **wxWidgets** wraps the real Cocoa controls (wxOSX); **Qt** draws its widgets and imitates the macOS look with a style (Qt Quick
  Controls' macOS style draws with native frameworks but is "under development"); **GTK** draws its own on macOS. The wx experience:
  native controls give the platform's behaviour but "inconsistencies in how the controls behave and what they can(not) do between
  platforms". [wx compared](https://wiki.wxwidgets.org/WxWidgets_Compared_To_Other_Toolkits),
  [Qt macOS style](https://doc.qt.io/qtforpython-6/overviews/qtquickcontrols-macos.html)
- **libui-ng**: a small C library over Cocoa, Win32 and GTK 3, "mid-alpha", with a narrow control set (no table of views, no toolbar,
  no sidebar of the modern kind). Too small for the request and not where the work is. [libui-ng](https://github.com/libui-ng/libui-ng)
- **SwiftUI hosted from outside**: `NSHostingView` puts a SwiftUI hierarchy inside AppKit; a foreign language reaches it through an
  `@objc` factory that returns the NSView (the Go package `tmc/apple` does this).
  [NSHostingView](https://developer.apple.com/documentation/swiftui/nshostingview),
  [tmc/apple swiftui](https://pkg.go.dev/github.com/tmc/apple/x/swiftui). Driving SwiftUI means a second reconciler (SwiftUI's own)
  behind Zinc's, a Swift compiler (so Xcode) in the toolchain, and type-erased views; it brings the newest look but no control Zinc
  cannot reach through AppKit.
- **Mac Catalyst** runs a UIKit app on the Mac: one host for iOS and Mac, but Mac idioms (menus, toolbars, sidebars, tables, windows)
  come through UIKit's translation and an Xcode Catalyst target. For a "real Mac app" goal, AppKit on the Mac and UIKit on iOS sharing
  one protocol is the better split (section 11).

### 4.7 Calling Objective-C from C and C++

- `objc_msgSend` has no prototype of its own: it must be cast to the exact function type of the method called; calling it through a
  variadic prototype passes arguments in the wrong place on Apple arm64 (variadic arguments go on the stack).
  [Mike Ash](https://mikeash.com/pyblog/objc_msgsends-new-prototype.html). Zinc's `zinc:ffi` trick (one `R f(int64 x6, double x8)`
  prototype, `docs/plugins/ffi.md`) happens to pass an NSRect (four doubles) right on arm64, but not struct returns on x86-64, not
  blocks, and not callbacks; a general bridge would need libffi or generated trampolines.
- **Generated bindings**: objc2's `header-translator` generates Rust bindings for the Apple frameworks from the Xcode SDK headers
  (Xcode 16.2 today), with a configuration of skipped items per SDK; `icrate` was split into per-framework crates.
  [objc2](https://docs.rs/objc2/), [header-translator](https://github.com/madsmtm/objc2/tree/master/crates/header-translator).
  PyObjC dropped Apple's BridgeSupport files in PyObjC 9 (they "had been broken for even longer"), keeps its own metadata, needs
  block signatures from metadata, and cannot subclass classes the SDK marks as non-subclassable.
  [PyObjC blocks](https://pyobjc.readthedocs.io/en/latest/core/blocks.html),
  [PyObjC changelog](https://github.com/ronaldoussoren/pyobjc/blob/master/docs/changelog.rst)
- **Callbacks into the program**: target-action (one target object whose action method reads the sender's tag, as
  `ZnMenuTarget` in `system.macos.mm` does), delegates and data sources (an Objective-C class written in the host, forwarding to the
  program), blocks (Objective-C++ lambdas convert to blocks), KVO (rarely needed for controls; notifications such as
  `NSControlTextDidChangeNotification` cover text). Hand-written Objective-C++ handles all of them with no runtime machinery.
- **Threads**: create, destroy, resize and move NSViews only on the main thread; Xcode's Main Thread Checker flags violations.
  [Cocoa-dev quoting the Threading Programming Guide](https://lists.apple.com/archives/Cocoa-dev/2010/Jan/msg01847.html),
  [Main Thread Checker](https://developer.apple.com/documentation/xcode/diagnosing-memory-thread-and-crash-issues-early)

## 5. What real AppKit views give, and what they cost

| Topic | With AppKit views | Zinc's drawn UI today |
|---|---|---|
| VoiceOver | standard controls conform to their accessibility protocols (NSButton is an `NSAccessibilityButton`, NSSlider an `NSAccessibilitySlider`); a custom view sets its role and label ([Apple: custom controls](https://developer.apple.com/library/archive/documentation/Accessibility/Conceptual/AccessibilityMacOSX/ImplementingAccessibilityforCustomControls.html), [AccessibilityUIExamples](https://developer.apple.com/library/archive/samplecode/AccessibilityUIExamples/Listings/ReadMe_md.html)) | no macOS bridge yet (iOS and Android only) |
| Text input | NSTextField and NSTextView: input methods with marked text, dictation, autocorrect, spelling, Services, the emoji picker, AutoFill | committed text only; the edit roles are emulated |
| Dark mode, accent, contrast | automatic: semantic colours (`labelColor`, `windowBackgroundColor`, `controlAccentColor`) follow the appearance live | wired by the app or the kits (D130 tokens) |
| New macOS designs | standard bars, sheets, popovers and controls adopt Liquid Glass when rebuilt with the Xcode 26 SDK, if layout metrics are not hard-coded ([Apple: adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass), [WWDC25 323](https://developer.apple.com/videos/play/wwdc2025/323/)); `build/zinc` is stamped `sdk 26.2` (`otool -l`) | the look is tokens that someone must update after each redesign (Flutter's lesson, `native-fidelity-and-plugins.md` §3) |
| Many views | each NSView is an object, and a layer once layer-backed (layer-backing spreads to the subtree); dense content (thousands of shapes) is slow as views ([wantsLayer](https://developer.apple.com/documentation/appkit/nsview/wantslayer), [canDrawSubviewsIntoLayer](https://developer.apple.com/documentation/appkit/nsview/candrawsubviewsintolayer), [Sonoma forum thread](https://developer.apple.com/forums/thread/738042)) | one surface, damage rectangles, tiles: cheap for dense content |
| Big lists | view-based NSTableView recycles a bounded set of cell views through `makeViewWithIdentifier:owner:`; one identifier per kind of cell matters ([makeView](https://developer.apple.com/documentation/appkit/nstableview/makeview(withidentifier:owner:)), [TableViewPlayground](https://developer.apple.com/library/archive/samplecode/TableViewPlayground/Listings/TableViewPlayground_ATBasicTableViewWindowController_m.html)); selection, column resize and reorder, sort descriptors, type-select, keyboard navigation and VoiceOver's table semantics come with it | zinc:ui's virtual list, drawn |
| Pixel goldens | change with every macOS release | stable, deterministic |
| Portability | Apple only | everywhere |

So the native renderer is right for the app's frame and its controls (windows, toolbars, sidebars, tables, forms) and wrong for dense
custom drawing (charts, editors, canvases, games), which stays drawn inside it (section 6.1).

## 6. Analysis for Zinc

### 6.1 Where it fits

Three places were considered:

1. **A renderer of the existing tree** (React Native's host components, Zinc's own `--render dom`): the same `<View>`, `<Text>`,
   `<TextInput>`, `<ScrollView>`, `<Pressable>` lowered to AppKit views.
2. **A separate `zinc:appkit` module that exposes AppKit classes** (NativeScript): `new NSButton()`, `button.setTitle('OK')`.
3. **Both, layered.**

The recommendation is the first, extended by typed components, with plugins for the rest:

- **Layer 1, the native host of zinc:ui** (`"ui": { "render": "native" }` in `zinc.json`, `--render native`, `ZINC_RENDER=native`).
  zinc:ui selects a host module per target as it already does for the DOM (`src/frontend/modules.cpp`, `stdModuleFile`), and
  `frame()` calls its `commit()` instead of painting. The primitives map to AppKit like this:

  | zinc:ui primitive | AppKit view | Notes |
  |---|---|---|
  | `View` (and `Pressable`, `TouchableOpacity`) | a flipped, layer-backed `ZnView` (NSView subclass) | background, border, radius, opacity, shadow on its CALayer; clicks, hover and drags through `mouseDown:`/tracking areas; layout-only Views are flattened (not created), as React Native does |
  | `Text` | NSTextField as a label (selectable or not), runs as an NSAttributedString | measured by AppKit for Yoga; the system font unless a class sets one |
  | `Image` | NSImageView | the asset decoded by Zinc or by NSImage |
  | `ScrollView` | NSScrollView with a flipped document view | native scrolling, elastic edges and momentum; the offset goes back through `domScroll`, so virtual lists keep working (`domVirtual`, `domRows`) |
  | `TextInput`, `TextArea` (`Input`) | NSTextField (secure or not), NSTextView in a scroll view | `domEdit`, `domSelect`, `domChanged`, `domFocus` already carry what they report |
  | `Button` (zinc:ui's box) | a `ZnView` that takes clicks and the focus ring | zinc:ui's Button may hold any children, which NSButton cannot; the real NSButton is `PushButton` below |
  | `Canvas`, and any subtree marked drawn | a `ZnDrawnView` backed by a CAMetalLayer that zinc:ui paints into | the reverse of NativeView: a drawn island inside the native tree (charts, editors, games) |
  | `NativeView` | inserted as a plain subview | no overlay trick needed: the overlays are native too |
  | zinc:ui layers (dialog, popover, menu, toast) | NSPanel / NSPopover / NSMenu / a child window | `domLayers` and `domDismiss` already describe them |

- **Layer 2, `zinc:appkit` components**: typed function components (they return zinc:ui nodes, as the kit's do) for what has no
  primitive: `Window` (title, toolbar style, full-size content), `Toolbar` and `ToolbarItem`, `SplitView` with `Sidebar` (NSSplitViewController's
  sidebar behaviour), `Table` with `Column` and `Outline` (NSTableView, NSOutlineView with source-list style), `PushButton`,
  `PopUpButton`, `SegmentedControl`, `Switch`, `Checkbox`, `Slider`, `Stepper`, `DatePicker`, `ColorWell`, `SearchField`,
  `ProgressIndicator`, `Popover`, `Sheet`, `Alert`. Each is a zinc:ui node with a native kind and typed props, so the models, `className`
  for its outer box, Fast Refresh and the inspector all work on it. Where no native host runs, each component renders a drawn
  equivalent from the kits with the platform look (the kit's Switch, Slider, Tabs, Table of nuxt, Popover), so a program written with
  `zinc:appkit` still runs on Linux, a Pi or the web.
- **Layer 3, custom native components in plugins**: a plugin declares a component (props, events) in its spec; `zinc native-gen`
  writes the Objective-C++ glue and the plugin implements an NSView subclass (Fabric native components, Lynx custom elements, Valdi's
  `<custom-view>`). This replaces a general runtime bridge. A `zinc:objc` bridge (NativeScript's model) can be reconsidered later as an
  expert escape hatch, generated from SDK headers; nothing in layers 1 to 3 depends on it.

**How it coexists with the drawn UI.** A program is native or drawn at its root; each can hold islands of the other: NativeView in a
drawn app (D136), drawn views in a native app (`Canvas`, or `<View drawn>` around a subtree). The kits keep working in both: under the
native renderer, kit components built from primitives become native views of those primitives, and the ones with a `zinc:appkit`
equivalent (Switch, Slider, Tabs as SegmentedControl, ContextMenu, MenuBar) use it.

**Other platforms.** Nothing changes for them: `render: "native"` is honoured where a host exists (macOS first; UIKit later, section 11)
and falls back to the drawn renderer elsewhere, with a one-line note from `zinc check`. The web already has its own native renderer:
`--render dom` is to the browser what this is to AppKit, and both read the same contract. Windows (Win32 or WinUI 3) and Linux (GTK 4)
hosts are possible on the same contract but are large projects each and not proposed.

### 6.2 The boundary

**Who lays out: Yoga in Zinc, frames pushed to the views.** Auto Layout and NSStackView would split the layout between two engines with
different rules, make `className` layout (flex, gap, padding, percentages) mean something else on the Mac, and lose the layout facts
the inspector and the tests read. React Native, Valdi and Lynx all keep their own flexbox. What AppKit decides:

- **sizes of leaves**: a native `Leaf` kind in `layout_yoga.cpp` asks AppKit (`NSTextField`'s cell size for a width, a control's
  `fittingSize`, `NSAttributedString` bounds); measured in the host, never by calling the program (as today for text, ZN-284);
- **containers that lay out their children themselves**: NSSplitView sizes its panes, NSToolbar its items, NSTableView its rows. Each
  pane, toolbar item and row content is a Yoga root sized by its native container; when AppKit resizes a pane (the user drags the
  divider) the host reports the new size and zinc:ui lays that root out again. This "nested roots" rule is the main new design work.

**Events back.** AppKit calls the host on the main thread, inside SDL's event pump. Most events are queued and dispatched to zinc:ui at
the next turn of the loop (as `system.macos.mm`'s `pushEvent` does for menus): clicks (`ui.click`), text (`domEdit`), focus (`domFocus`),
scroll (`domScroll`), keys (`domKey`), dismiss (`domDismiss`). Questions that AppKit asks synchronously (a table's row count and the
view for a row, `validateMenuItem:`, `shouldSelectRow:`) are answered from data the host already holds (the row count and the visible
rows' values pushed with the commit); a miss may call the program synchronously through `cb_call`, which is allowed on the engine
thread and already happens during live resize (frames drawn from inside the pump).

**Batching.** zinc:ui walks the changed nodes after layout (it has the dirty state for paint; the a11y walk shows the "compare with what
was sent" pattern) and writes one record buffer per frame in the native-record wire format (`native-record-wire-options-2026-10-28.md`:
little-endian, a length per record): `create id kind`, `insert parent id before`, `remove id`, `frame id x y w h`, `props id ...`
(only the props that changed), `text id ...`. One native call per frame applies it, between `layout()` and the end of the frame,
inside `[NSAnimationContext]`/`CATransaction` groups so AppKit redraws once.

**Cost per call.** One call per frame makes the engine's crossing cost irrelevant: 60 ns on the interpreter and AOT, about 150 ns from
QuickJS. The cost that matters is AppKit's own (creating views, setting frames and strings, its display pass) and zinc:ui's walk.
Zinc pays no thread hop (React Native's mount waits for the next UI-thread tick when the commit ran in the background). The flip side:
long work in the program blocks the UI, as it does today. Script-driven animation (moving a frame every frame) goes through the commit
like everything else; declared transitions (`transition-*` classes, LayoutAnimation) can be handed to Core Animation instead. Neither
number exists yet: the milestone measures them (section 9).

### 6.3 The binding layer

| Option | Effort | Maintenance | Fit with the rules |
|---|---|---|---|
| **Hand-written Objective-C++ in a plugin** (`plugins/appkit`, one class per component, a commit decoder, a target, a table data source) | the DOM host is 1,069 lines; expect 2,000 to 4,000 lines of Objective-C++ for the milestone's set | AppKit's controls have been stable for a decade and new looks come free; the work per macOS release is behaviour changes found by the tests | no new library (AppKit is the proven library); the plugin owns its `.mm` as `webview` and `system` do; no target name in the core |
| Generated bindings from SDK headers (objc2's header-translator, Swift interfaces) | a generator, its skip lists per SDK, a binding of thousands of methods mostly unused | regenerate at each Xcode | needs clang or Rust tooling in the build; size |
| A general objc runtime bridge in the engine (objc_msgSend casts, libffi, runtime classes for delegates, block trampolines) | large, and every crash it allows is the program's | low per SDK, high per feature | libffi would be vendored (MIT); unsafe by nature like `zinc:ffi`; Apple only |

Hand-written Objective-C++ wins for the host. The only engine changes are generic: a host-module hook in zinc:ui (the DOM one,
generalised), a native measure hook in `src/host/layout.h`, and the record buffer. Custom native components use D127's generated glue.

### 6.4 Developer experience

- **Hot reload**: Fast Refresh (D124) acts on zinc:ui's tree, so it works unchanged; nodes that are reused keep their native views, so
  the text typed in a field, a table's selection and a scroll position survive an edit.
- **`zinc check`**: `zinc:appkit` components are typed functions with props interfaces like the kit's; `className` and `style` keep their
  types. Under `render: "native"`, `zinc check` names the style keys the native host does not render (blur, a rounded clip on a scroll
  view, a gradient text...), as the web export checks its targets.
- **Inspector**: `zinc dev`'s inspector reads zinc:ui's tree, which still exists, so boxes, styles and layout facts are the same; the
  highlight becomes a transparent overlay view. Xcode's Accessibility Inspector and view debugger work on the result.
- **Tests**: (1) a text dump of the native tree (class, frame, title or string value, enabled, state, accessibility role and label),
  written by the host as `ZINC_SYSTEM_SELFTEST` dumps `NSApp.mainMenu` today, compared with a golden; it does not change with macOS
  looks. (2) the accessibility tree read back from the OS through AXUIElement, into `tools/a11y-tree`'s format. (3) screenshots by
  `cacheDisplayInRect:toBitmapImageRep:` for people, not as goldens (they change with each macOS release). AppKit needs a window
  server: on the hosted CI runner the frames come out wrong (`ci-runner-failures-2026-10-18.md`, webview_hybrid), so these tests run on
  the development Mac and skip on CI.

## 7. Options scored (RULES §4: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1; max 70)

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **A. Native host of the zinc:ui tree (`render: "native"`), Yoga in Zinc, hand-written Objective-C++ host, `zinc:appkit` typed components, custom components in plugins** | 5 | 4 | 4 | 4 | 5 | 3 | 2 | **58** |
| B. A separate AppKit reconciler with its own node store (React Native's shape, bypassing zinc:ui) | 4 | 5 | 4 | 2 | 5 | 1 | 2 | 52 |
| C. SwiftUI hosting: the tree lowered to SwiftUI views in an NSHostingView | 4 | 3 | 3 | 3 | 5 | 2 | 2 | 47 |
| D. A general Objective-C bridge (`zinc:objc`) with generated typings; UI written against AppKit classes | 3 | 3 | 2 | 2 | 4 | 1 | 1 | 36 |

Why: A keeps one tree, one set of models and one contract shared with the DOM renderer, and its fallback keeps programs portable
(portability 3: macOS first, UIKit on the same contract, drawn elsewhere). B is a little faster (no zinc:ui walk) but doubles the
event and focus semantics and makes the models target two host ABIs. C needs a Swift compiler and Xcode in the toolchain, puts
SwiftUI's reconciler behind Zinc's, and SwiftUI's List is not the table macOS apps need. D is not declarative, not portable, unsafe, and
the audience (education, makers) should not have to learn AppKit to get a Mac app.

The status quo (drawn UI with the macOS look of D130, NativeView islands, native menus) still scores well on the generic criteria
(it is why D59 and the native fidelity report rejected native widgets as *the* renderer), but it does not answer the request and stays
the baseline for every other target, so it is not a candidate here.

## 8. Recommendation

Option A, built in this order: the host hook and the primitives, then the window chrome (toolbar, split view, sidebar), then Table and
Outline, then the controls and overlays, then custom components in plugins. What a program looks like:

```tsx
// zinc.json: { "ui": { "render": "native", "layout": "rn" } }
import { render, createSignal } from 'zinc:ui/solid';
import { View, Text, TextInput } from 'zinc:ui';
import { Window, Toolbar, ToolbarItem, SearchField, SplitView, Sidebar, Outline, Table, Column, PushButton, Switch } from 'zinc:appkit';

function App() {
  const [query, setQuery] = createSignal('');
  return (
    <Window title="Library" toolbarStyle="unified">
      <Toolbar>
        <ToolbarItem id="add" label="Add" symbol="plus" onPress={addItem} />
        <ToolbarItem id="search"><SearchField value={query()} onChangeText={setQuery} /></ToolbarItem>
      </Toolbar>
      <SplitView>
        <Sidebar><Outline items={folders} onSelect={openFolder} /></Sidebar>
        <View className="flex-1 flex-col">
          <Table rows={files().length} row={(i) => files()[i]} onSelect={pick} className="flex-1">
            <Column id="name" title="Name" value={(f) => f.name} sortable />
            <Column id="size" title="Size" value={(f) => f.size} align="right" />
          </Table>
          <View className="flex-row gap-3 p-4">
            <TextInput className="flex-1" placeholder="Title" value={title()} onChangeText={setTitle} />
            <Switch value={shared()} onValueChange={setShared} />
            <PushButton title="Save" onPress={save} keyEquivalent="Enter" />
          </View>
        </View>
      </SplitView>
    </Window>
  );
}
render(App);
```

Without a native host (Linux, a Pi, the web canvas), the same program runs drawn: `Toolbar` becomes a row, `Table` the kits' virtual
table, `Switch` the kit's switch with the platform look.

## 9. The first milestone: `examples/appkit-tour`

A small app that exercises every hard part once, the way React Native's rn-tester does:

- a **window** with a unified **toolbar** (add, a segmented control, a search field), full-size content under the title bar;
- a **sidebar** (NSSplitViewController sidebar, an NSOutlineView in source-list style: folders with disclosure);
- a **table of 10,000 rows** with three columns, sorting by click on a header, multiple selection, type-select, double-click to open;
- a **form**: three text fields (one secure), a pop-up button, a switch, a date picker, Save as the default button;
- a **popover** from a toolbar button and a **sheet** to confirm a delete;
- the **menu bar** through `zinc:system` with native Edit roles that act on the focused field (cut, copy, paste, undo, select all);
- **dark mode**: switching the system appearance while it runs changes every view at once;
- **VoiceOver**: every control reachable and named; the table read as a table.

What proves it (each a check that can fail):

- the tree dump golden after a scripted session (select a folder, sort, select rows 3 to 5, type in the fields, open and close the
  sheet), run on the interpreter; AOT and QuickJS run the same program for a few frames and compare one hash of the dump;
- the accessibility tree read through AXUIElement against a golden (roles, labels, the table's row count);
- input methods: a Japanese or Chinese input source typing into a field, marked text shown, the committed text in the program
  (by hand, recorded in the report);
- numbers written to `docs/reports/zinc-next-perf.md`: the cost of a commit when one character is typed (zinc:ui walk and AppKit),
  the time to show the window with the 10,000-row table, the memory of the window (`tools/window-memory`), frames dropped while
  flinging the table (on the Mac's 120 Hz display), the same app drawn for comparison.

## 10. Risks

1. **SDL and AppKit in one window.** SDL owns the NSApplication, the window delegate and the content view that receives keys. The host
   must replace the content view (or own the window's content view controller) while SDL keeps pumping events and its window settings
   (`zinc.json` size, `ZINC_BACKGROUND`'s no-activation). Key events, the first responder and the Tab loop must reach our views, not
   SDL's. NativeView and the webview prove subviews work; replacing the content view is not proved.
2. **Two layouts meeting.** Yoga outside, AppKit inside split views, toolbars and table rows: the nested-roots rule must be designed
   carefully (a pane resize lays its root out again in the same frame, or the content lags a frame behind the divider).
3. **Style coverage.** AppKit controls cannot take every class (NSButton's bezel is the system's); transforms on NSView need care
   (React Native for macOS needed a fix in 2026). Native mode means the native look; nuxt or shadcn themes do not carry over to the
   controls, only to `ZnView` boxes and text.
4. **Per-frame animation through the commit** costs more than drawing. Declared transitions should go to Core Animation; animated
   custom drawing should stay in drawn islands.
5. **Synchronous data-source questions** must not re-enter the program in a bad state; the cache of visible rows avoids most calls.
6. **macOS releases.** Standard controls update themselves; behaviour changes (focus, window updates, as the Sonoma thread shows) are
   found only by running on the new release. Apps built by `zinc build` must carry a recent SDK stamp to get the new look: `build/zinc`
   carries 26.2; what the AOT link stamps (clang or the pinned zig) is not checked.
7. **CI.** The hosted macOS runner has no real display; the native tests run on the development Mac.
8. **Scope.** AppKit is huge. The component list of section 6.1 is the scope; anything else is a plugin.

## 11. iOS and the other platforms later

- **iOS (UIKit)**: the same contract, a second host: UIView, UILabel, UIImageView, UIScrollView, UITextField and UITextView, UIButton,
  UISwitch, UISlider, UISegmentedControl, UIDatePicker; `Table` and `Outline` on UICollectionView with a list layout and diffable data
  sources; `Window`, `Toolbar` and `SplitView` become UINavigationController, UIToolbar and UISplitViewController; `Sheet` and `Popover`
  UISheetPresentationController and popover presentation; context menus UIContextMenuInteraction. The program already runs on the main
  thread under SDL on iOS (D59), so the boundary is the same. The `zinc:appkit` names that are Mac-only get a phone meaning or a drawn
  fallback; a shared `zinc:native` component set (the names both hosts implement) is the likely end state, with `zinc:appkit` for
  what only the Mac has. Effort: about the same as the AppKit host, plus the `zinc export --target ios` path of D127.
- **Mac Catalyst** (one UIKit host for both): rejected for the Mac, because Mac idioms come through translation; reconsider only if
  maintaining two hosts proves too costly.
- **Windows and Linux**: possible hosts on the same contract (Win32 controls or WinUI 3; GTK 4), each a large project, not proposed.
  The drawn renderer serves them.

## 12. Not verified

- Nothing was built or run for this report. All costs of AppKit views (creation, frame updates, the display pass, table scrolling) are
  to be measured by the milestone; none is estimated here.
- Replacing SDL's content view and routing keys to our first responder while SDL pumps events.
- What SDK version an AOT app built by `zinc build` declares (only `build/zinc` was checked: `sdk 26.2`).
- React Native for macOS's current Fabric status by release (the repository page does not say; the 2026 pull requests show work in
  progress) and whether Lynx has a desktop target.
- NSTableView limits at very large row counts: the sources are forum reports, not Apple numbers.
- The `muda`, Electron and Valdi pages were read for their summaries; the source of `muda`'s macOS backend was not read.

## Proposed tasks

1. **zinc:ui native host hook.** Generalise the DOM host's contract into a host module chosen per target and per `ui.render`
   (`native`), a per-frame change buffer in the record wire format, and a native measure hook for Yoga and classic leaves.
2. **plugins/appkit: the primitives.** View (flattened when layout-only), Text, Image, ScrollView, TextInput and TextArea, Pressable as
   AppKit views, events back through the host functions, system colours and dark mode, and the tree dump for tests.
3. **Window chrome.** Own the window's content under SDL (keys, first responder, Tab loop), `Window`, `Toolbar`, `SplitView` with
   `Sidebar`, and the nested Yoga roots that follow native pane and item sizes.
4. **Table and Outline.** NSTableView and NSOutlineView components with columns, sorting, selection, type-select and cell recycling,
   answered from a cache of the visible rows pushed with each commit.
5. **Controls and overlays.** PushButton, PopUpButton, SegmentedControl, Switch, Checkbox, Slider, DatePicker, SearchField, Progress,
   Popover, Sheet, Alert; the kits and zinc:react-native map their components to them under the native renderer.
6. **examples/appkit-tour and its proofs.** The milestone app of section 9: tree and accessibility goldens, three engines, input
   methods by hand, the measurements in the performance log, the drawn run for comparison.
7. **Custom native components in plugins.** A component declared in a plugin's spec (props, events), Objective-C++ glue generated by
   `zinc native-gen`, the plugin's NSView subclass mounted by the host like a built-in kind.
8. **UIKit host (in the cross-platform pass).** The same contract on iOS, the shared component names, `zinc export --target ios`.

## Decision to record

**Question:** how does Zinc give macOS apps real AppKit views, as React Native does? **Choice:** a second renderer of the zinc:ui tree,
chosen per project (`"ui": { "render": "native" }`): zinc:ui keeps its tree, its models and its layout (Yoga, with text and controls
measured by AppKit), and after each changed frame a host plugin applies one buffer of changes to AppKit views on the main thread, with
the events coming back through the functions the web's semantic DOM already uses; `zinc:appkit` adds typed components for the controls
that have no primitive (window, toolbar, split view and sidebar, table and outline, buttons, pickers, popover, sheet), each with a drawn
fallback where no native host runs; custom native views come through plugins with generated glue. No general Objective-C runtime bridge
and no SwiftUI hosting. Scored (RULES §4, max 70): native host of the zinc:ui tree 58, a separate AppKit reconciler 52, SwiftUI hosting
47, a general objc bridge 36. The drawn UI stays the default on every target and D59's rejection of native widgets as Zinc's only
renderer stands. Revisit if the milestone's measurements show the zinc:ui walk dominating the commit (then option B's direct node
store), if two hosts (AppKit and UIKit) cost more than one Catalyst host, or if a stable generated binding of the Apple frameworks
makes an expert `zinc:objc` bridge cheap.

## Sources

- React Native: [render pipeline](https://reactnative.dev/architecture/render-pipeline),
  [view flattening](https://reactnative.dev/architecture/view-flattening),
  [Fabric native components](https://reactnative.dev/docs/fabric-native-components-introduction),
  [Codegen](https://reactnative.dev/docs/the-new-architecture/what-is-codegen),
  [React Native 0.82, new architecture only](https://reactnative.dev/blog/2025/10/08/react-native-0.82)
- React Native for macOS: [repository](https://github.com/microsoft/react-native-macos),
  [0.71 announcement (Fabric experimental)](https://devblogs.microsoft.com/react-native/2023-04-27-announcing-macos-71),
  [PR 2866, transforms under Fabric](https://github.com/microsoft/react-native-macos/pull/2866),
  [PR 2876](https://github.com/microsoft/react-native-macos/pull/2876)
- NativeScript: [runtime-node-api](https://github.com/NativeScript/runtime-node-api),
  [metadata (v6 docs)](https://v6.docs.nativescript.org/core-concepts/metadata),
  [ios-jsc](https://github.com/NativeScript/ios-jsc),
  [iOS runtime overview (v7 docs)](https://v7.docs.nativescript.org/core-concepts/ios-runtime/overview)
- Valdi: [repository](https://github.com/Snapchat/Valdi), [It's FOSS news](https://itsfoss.com/news/snapchat-open-sources-valdi/)
- Lynx: [custom native element](https://lynxjs.org/guide/custom-native-component.html),
  [InfoQ](https://www.infoq.com/news/2025/03/tiktok-lynx-cross-platform-apps),
  [The New Stack](https://thenewstack.io/cross-platform-ui-framework-lynx-competes-with-react-native)
- Flutter: [macOS platform views](https://docs.flutter.dev/platform-integration/macos/platform-views),
  [AppKitView](https://api.flutter.dev/flutter/widgets/AppKitView-class.html)
- Tauri and Electron: [muda](https://docs.rs/muda), [Electron Menu](https://electronjs.org/docs/api/menu)
- Toolkits: [wxWidgets compared to other toolkits](https://wiki.wxwidgets.org/WxWidgets_Compared_To_Other_Toolkits),
  [Qt Quick Controls macOS style](https://doc.qt.io/qtforpython-6/overviews/qtquickcontrols-macos.html),
  [libui-ng](https://github.com/libui-ng/libui-ng)
- SwiftUI from outside: [NSHostingView](https://developer.apple.com/documentation/swiftui/nshostingview),
  [AppKit integration](https://developer.apple.com/documentation/swiftui/appkit-integration),
  [tmc/apple swiftui (Go)](https://pkg.go.dev/github.com/tmc/apple/x/swiftui)
- Objective-C runtime and bindings: [objc_msgSend's new prototype (Mike Ash)](https://mikeash.com/pyblog/objc_msgsends-new-prototype.html),
  [objc_msgSend_fpret](https://developer.apple.com/documentation/objectivec/objc_msgsend_fpret),
  [Apple forums: variadic calls on Apple silicon](https://developer.apple.com/forums/thread/742064),
  [objc2](https://docs.rs/objc2/), [header-translator](https://github.com/madsmtm/objc2/tree/master/crates/header-translator),
  [PyObjC blocks](https://pyobjc.readthedocs.io/en/latest/core/blocks.html),
  [PyObjC changelog](https://github.com/ronaldoussoren/pyobjc/blob/master/docs/changelog.rst),
  [BridgeSupport(5)](https://keith.github.io/xcode-man-pages/BridgeSupport.5.html)
- Threads: [Cocoa-dev quoting the Threading Programming Guide](https://lists.apple.com/archives/Cocoa-dev/2010/Jan/msg01847.html),
  [Main Thread Checker](https://developer.apple.com/documentation/xcode/diagnosing-memory-thread-and-crash-issues-early)
- Accessibility: [Implementing accessibility for custom controls](https://developer.apple.com/library/archive/documentation/Accessibility/Conceptual/AccessibilityMacOSX/ImplementingAccessibilityforCustomControls.html),
  [AccessibilityUIExamples](https://developer.apple.com/library/archive/samplecode/AccessibilityUIExamples/Listings/ReadMe_md.html)
- Views, layers, tables: [wantsLayer](https://developer.apple.com/documentation/appkit/nsview/wantslayer),
  [canDrawSubviewsIntoLayer](https://developer.apple.com/documentation/appkit/nsview/candrawsubviewsintolayer),
  [updateLayer](https://developer.apple.com/documentation/appkit/nsview/updatelayer()),
  [Apple forums: window updates on Sonoma](https://developer.apple.com/forums/thread/738042),
  [makeView(withIdentifier:owner:)](https://developer.apple.com/documentation/appkit/nstableview/makeview(withidentifier:owner:)),
  [TableViewPlayground](https://developer.apple.com/library/archive/samplecode/TableViewPlayground/Listings/TableViewPlayground_ATBasicTableViewWindowController_m.html),
  [cocoa-dev: very slow NSTableView](https://lists.apple.com/archives/cocoa-dev/2017/Jul/msg00004.html)
- New macOS looks: [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass),
  [WWDC25 session 323](https://developer.apple.com/videos/play/wwdc2025/323/)
- In the tree: `lib/std/ui.ts` (DOM host section, `syncA11y`, `syncNatives`), `lib/std/ui-dom.ts`, `targets/web/dom.js`,
  `docs/targets/web.md` ("Two ways to draw", "The semantic DOM"), `src/host/layout_yoga.cpp`, `plugins/system/native/system.macos.mm`,
  `plugins/webview/src/webview.mm`, `docs/reports/zinc-next-native-view.md`, `docs/reports/native-fidelity-and-plugins.md`,
  `docs/reports/zinc-next-a11y-bridges.md`, `docs/reports/zinc-next-native-abi.md`, `docs/reports/threads-ui-compute-animation.md`,
  `docs/reports/native-record-wire-options-2026-10-28.md`, `docs/reports/zinc-next-decisions.md` (D59, D127, D130, D136, D163, D124)
