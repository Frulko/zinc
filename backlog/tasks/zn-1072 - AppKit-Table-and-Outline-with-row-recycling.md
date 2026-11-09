---
id: ZN-1072
title: AppKit Table and Outline with row recycling
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-08 21:43'
updated_date: '2026-11-09 02:44'
labels:
  - ui
  - appkit
  - size-M
milestone: m-31
dependencies:
  - ZN-1070
ordinal: 8030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
NSTableView and NSOutlineView components with columns, sorting, selection, type-select and cell recycling, answered from a cache of the visible rows pushed with each commit. Report: docs/reports/appkit-native-ui-research.md, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Table shows 10,000 rows with columns, sorting and selection, scrolling without building every row
- [x] #2 Outline expands and collapses a tree; type-select jumps to a row
- [x] #3 Both have a drawn fallback on targets without the native host
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-11-09). `Table` and `Outline` in `plugins/appkit` (`index.ts`, `native/appkit.macos.mm`), `docs/plugins/appkit.md`, T0 `tests/t0/ui_appkit_table.sh` with `tests/golden/ui-appkit-table`. `lib/std/ui.ts` untouched.

Design (decision to record, under D210, D225, D230): a Table is a zinc:ui node of native kind `table` (attributes `columns`, `count`, `rowHeight`, `multiple`, `sort`, `selection`) whose body is zinc:ui's own virtual list (`ui.virtualize`): only the rows in view +3 exist as nodes, each marked with the native attribute `row`. The host's cache is exactly those row nodes, read at each commit; the NSTableView data source answers from it and never calls the program (a row not pushed yet shows empty until the next frame). AppKit's scroll comes back as the body's `domScroll`, so the virtual list builds what AppKit shows. Selection, sort (`sortDescriptorsDidChange`), type-select (`nextTypeSelectMatchFromRow`: the program searches its own rows, so a row never built is found) and double-click come back as their own event kinds (8 to 14), so a recycled handle never routes a field's event to a list. An Outline gets its whole tree as one attribute (sidebars are small), keeps one item object per id across commits (NSOutlineView holds items by pointer, unretained), expands, collapses and type-selects natively and reports each change. Drawn fallback: the same nodes (a header, the virtual list, click/shift/cmd selection, arrows, Left/Right, Enter, letters). The fallback reuses zinc:ui's virtual list; the nuxt `Table` is not virtual (a `For` of every row), so it was not reused.

Short run (T0 `ui_appkit_table`: interpreter vs golden, QuickJS and AOT equal, drawn lines): 10,000 rows, 17 rows built at first, 20 after AppKit scrolled to row 5000 (cells read back from AppKit's own cells), typing `z` selects row 9990 never built and AppKit scrolls to it, a sort by the header comes back as `onSort` and the rows reload sorted, selecting 3,4 comes back, the outline expands, `t` selects Trash, collapse. Drawn: 16 then 19 rows built, `z` and `t` type-select. `ui_appkit` and `ui_appkit_chrome` still pass. Looked at a native snapshot and a drawn shot.

Research (sonnet sub-agent):
- RN macOS FlatList is the JS VirtualizedList over a scroll view, no NSTableView: https://app.unpkg.com/react-native-macos@0.81.9/files/Libraries/Lists/FlatList.js
- SwiftUI Table sits on NSTableView; variable heights re-evaluate row bodies; perf regressions reported, advice to use NSTableView directly: https://mjtsai.com/blog/2024/04/15/nstableview-with-swiftui , https://developer.apple.com/forums/thread/784845 ; row identity: https://wwdcnotes.com/documentation/wwdc23-10160-demystify-swiftui-performance/
- The height cache is dropped on reloadData and noteNumberOfRowsChanged; fixed rows are the fast path for 10k to 1M rows: https://developer.apple.com/documentation/appkit/nstableviewdelegate/tableview(_:heightofrow:).md , https://lists.apple.com/archives/cocoa-dev/2010/Jun/msg00585.html
- NSTableView asks only for visible rows; numberOfRows is cheap from a stored count: https://lists.apple.com/archives/Cocoa-dev/2005/Aug/msg00466.html ; https://developer.apple.com/documentation/appkit/nstableview/reloaddata(forrowindexes:columnindexes:).md
- NSOutlineView items: the same pointer across reloads keeps expansion; the view does not retain items: https://developer.apple.com/documentation/appkit/nsoutlineview.md , https://lists.apple.com/archives/Cocoa-dev/2008/Jun/msg00791.html , https://www.corbinstreehouse.com/blog/?p=13 ; macOS 15 crash after reloadItem with changed children: https://developer.apple.com/forums/thread/770408 (a tree change here does reloadData)
- No prefetch API on NSTableView; follow the clip view's bounds: https://developer.apple.com/library/archive/samplecode/AnimatedTableView/Listings/ATDynamicTableView_m.html

Lines for backlog/later.md: cells other than text (an image, a checkbox, a zinc:ui subtree per cell); rows of different heights (noteHeightOfRowsWithIndexesChanged from the measured virtual rows); an outline loaded as it opens for big trees (the whole tree is one attribute now); the native header (about 28 px) is taller than the drawn one (24), covered by the virtual list's overscan, `ui.domViewport` would make it exact; the `lists` map of index.ts keeps one entry per Table ever made (replaced when its handle is recycled).

Proposed tests: (1) appkit-tour flinging the 10,000-row table on the 120 Hz display, frames dropped and the window's memory (`tools/window-memory`), by hand, about 1 min, under 300 MB; (2) the table read through AXUIElement (role table, 10,000 rows) against a golden, about 10 s, under 200 MB; (3) a 100,000-row Table in `ui_appkit_table` to check the commit stays flat, about 20 s, under 300 MB.
<!-- SECTION:NOTES:END -->
