---
id: ZN-1074
title: 'examples/appkit-tour: the Finder-like milestone app'
status: Review
assignee:
  - '@parallel'
created_date: '2026-11-08 21:44'
updated_date: '2026-11-09 04:06'
labels:
  - ui
  - appkit
  - demo
  - size-M
milestone: m-31
dependencies:
  - ZN-1071
  - ZN-1072
  - ZN-1073
ordinal: 8050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The milestone app of section 9 of docs/reports/appkit-native-ui-research.md: a window with a toolbar, a sidebar, a table of 10,000 rows, a form, the menu bar, dark mode and VoiceOver, on the three engines; the drawn run for comparison. Follows examples/GUIDELINES.md; tests are proposed for the owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/appkit-tour runs under render native on interpreter, AOT and QuickJS
- [x] #2 The same program runs with the drawn UI where no native host exists
- [ ] #3 VoiceOver reads the sidebar, the table and the form
- [x] #4 The task notes end with Proposed tests and the measurements to log
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Done (2026-11-09)

examples/appkit-tour: a Finder-like browser (zinc:ui JSX, D210 native host). Window + unified toolbar (New Folder, Move to Trash, NSSearchField), SplitView with a Sidebar (Outline of places), a Table of 10,000 made-up files (sort by header, multiple selection, type-select; selection kept as file ids and given back through the new Table `selection` prop), an inspector form (field, Switch, PopUpButton, Slider, DatePicker, Save as the default button), an alert before the Trash, a sheet for a new folder's name, the menu bar through zinc:system/menu (File menu of its own + standard roles), dark mode through AppKit. UI model: zinc:ui (desktop demo, GUIDELINES).

Engine gaps filled on the way (own commits):
- fix(appkit): zn_host_set_native_measure and hal_surface_size were found with dlsym; a `zinc build` AOT app links -no_exported_symbols, so AppKit's text measure was lost there (a bold 13 px text measured 207x18 by the engine instead of 196x16 by AppKit; the root fell back to 320x240). Now weak references, as zn_host_view_class. (`zinc run` AOT kept it: only the standalone binary lost it.)
- feat(appkit): the accessible name of a zinc:ui node (setLabel, aria-label, kit accessibilityLabel) goes to the host as an `a ID axlabel` record (lib/std/ui.ts, 2 lines) and becomes the view's accessibilityLabel; zinc:appkit's Table, Outline, Switch, Slider, SegmentedControl, PopUpButton, DatePicker, SearchField take `accessibilityLabel`; drawn table/tree get roles (table, tree, row) and named rows and headers. Table takes `selection` (controlled rows).
- fix(system): Edit roles posted role:<name> events even while an AppKit field edited, so Cut/Copy/Paste/Undo/Redo/Select All never reached it. Now sent to the editing field editor's responder chain first (tryToPerform), the program when nothing takes it.

Research (sonnet sub-agent): Apple SourceView sample (NSOutlineView source list) https://github.com/ooper-shlab/SourceView-Swift ; NSTableView asks only for visible rows, sorting is the app's job (sortDescriptorsDidChange) https://lists.apple.com/archives/cocoa-dev/2005/Nov/msg00488.html ; custom-view accessibility (isAccessibilityElement, role, label, NSAccessibilityElement children) https://developer.apple.com/library/archive/samplecode/AccessibilityUIExamples/Listings/AccessibilityUIExamples_Buttons_CustomButtonView_swift.html and https://developer.apple.com/library/content/documentation/Accessibility/Conceptual/AccessibilityMacOSX/ImplementingAccessibilityforCustomControls.html ; reading the AX tree from a script (System Events is slow on big trees, AXUIElement from Swift is the practical proxy; Chromium's ax_dump_tree) https://www.chromium.org/developers/accessibility/testing/automated-testing/ax-inspect ; RN macOS rn-tester https://github.com/microsoft/react-native-macos (packages/rn-tester). Taken: a Swift AXUIElement dump as the VoiceOver check; app sorts its own array.

Checked (short runs, headless unless said):
- `zinc check examples/appkit-tour` ok.
- A scripted session (scratch driver around the same components, not committed): pick Music in the outline, sort by size then name, select rows 3-5 (same ids, rows 458,975,1103 after the sort), type a name and Save, search, New Folder from the menu (ZINC_SYSTEM_SCRIPT menu-click) -> sheet -> Create, Move to Trash from the toolbar -> alert -> files in the Trash. Same output on the interpreter, QuickJS, `zinc run` AOT and a `zinc build` binary.
- ZINC_RENDER=drawn: same program drawn; ui.inspect() lists button "New Folder", tree "Places" with rows, table "Files" with rows, textbox "Name", switch "Locked", slider "Rating"...
- Windowed (ZINC_BACKGROUND=1) + AXUIElement dump (Swift, scratch): AXOutline desc="Places" rows=10 with AXRow/AXCell/AXDisclosureTriangle; AXTable desc="Files" rows=10000 with 4 AXSortButton headers and AXTableRow cells; AXTextField desc="Name", AXButton(AXSwitch) desc="Locked", AXPopUpButton desc="Tag", AXSlider desc="Rating", AXDateTimeArea desc="Date modified", AXButton "Save"; toolbar AXButton "New Folder"/"Move to Trash", AXTextField desc="Search files"; menus Apple, AppKit Tour, File, Edit, View, Window.
- Windowed: Edit > Select All through menu.perform reached the native field (typing then replaced the whole text); Undo with nothing to undo natively fell back to the program's role:undo.
- appkit.snapshot with ZINC_APPEARANCE=dark: every view dark. Idle: 300 headless frames, paint p50/p99 0 native and drawn.
- T0 ui_appkit, ui_appkit_table, ui_appkit_controls, ui_appkit_chrome pass.

Decisions (for the coordinator): the accessible name crosses the host contract as an `axlabel` attribute record, like `placeholder` (D225 records unchanged otherwise); the host applies it on the view that takes input (field, text view, table) and only once one was sent. Edit roles stay role events for the drawn UI; the macOS backend tries the native text editor first. Table selection is controlled by an optional `selection` accessor (no onSelect echo). Move to Trash has no Cmd-Backspace: a menu key equivalent comes before the field editor and would steal it while typing.

Measured (M1 Pro, 1100x700, headless): first frame native interp work 119 ms (layout 58, commit 61), AOT 148 ms (layout 78, commit 70); drawn 5.7-5.9 ms. Built app, 60 headless frames: native 0.43 s, max RSS 50 MB, footprint 25 MB; drawn 0.03 s, 18 MB, 10 MB (headless drawn rasterizes nothing: not comparable).

Review: criterion #3 needs a person to listen to VoiceOver (VO+arrows over the sidebar, the table, the form); the AX tree it reads is verified above.

Lines for backlog/later.md:
- ZN-1074: native first frame 120-150 ms against 6 ms drawn, half of it layout: profile AppKit's measure on first use (font and cell warm-up) and cache cells per font size.
- ZN-1074: zinc:appkit's drawn fallbacks (Table, Outline, Checkbox, PopUpButton, DatePicker, SearchField, overlays) hard-code light colours; use the kit's scheme vars so drawn dark mode follows.
- ZN-1074: kit fields write the theme's text colour, which the native host shows as written (dark text on a dark NSTextField in dark mode): under a native host, theme colours should follow the host's appearance or not be sent for fields.
- ZN-1074: a labelled layout-only View is flattened by the host, so its accessibilityLabel is lost (groups); keep a view when it has a label.
- ZN-1074: check by hand that Cmd-Z undoes typing in a native field (field editor allowsUndo) now that Undo reaches it.
- ZN-1074: appkit.drive(table, 7, rows) with a row past NSTableView's count selects nothing silently; clamp or report.

**Proposed tests**
- tests/t1/appkit_tour.sh: the scripted session above on the interpreter against one golden (dump + event lines), QuickJS and AOT a few frames + one hash; proves the whole app on three engines. ~40 s, ~150 MB.
- tests/t0 axdump check: windowed (ZINC_BACKGROUND=1) appkit-tour + a Swift AXUIElement dump against a golden (roles, labels, table row count 10000); proves what VoiceOver reads. ~15 s, ~100 MB; needs the Accessibility permission, macOS only, a window.
- ZINC_RENDER=drawn ui.inspect() golden of appkit-tour: the drawn a11y tree. ~5 s, ~60 MB.
- Measurements to log in zinc-next-perf.md: commit cost of one typed character (zinc:ui walk + AppKit), time to show the window with the 10,000-row table, tools/window-memory of the window native vs drawn, frames dropped flinging the table at 120 Hz.
<!-- SECTION:NOTES:END -->
