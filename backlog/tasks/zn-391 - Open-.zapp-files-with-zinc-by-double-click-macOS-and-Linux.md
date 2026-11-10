---
id: ZN-391
title: Open .zapp files with zinc by double-click (macOS and Linux)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-08 23:55'
updated_date: '2026-11-10 13:10'
labels:
  - distribution
  - size-S
dependencies: []
ordinal: 51700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-318: zinc run app.zapp works; the desktop does not know the type yet. macOS: a UTI (dev.zinc.zapp, conforms to public.data) and CFBundleDocumentTypes in zinc's own app bundle, the open-file event passed to zinc run. Linux: a shared-mime-info XML (application/x-zinc-app, glob *.zapp) and a .desktop entry with Exec=zinc run %f, installed by zinc's package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 on macOS, LaunchServices maps .zapp to zinc and an open event runs the archive (test with the open-file event); on Linux the mime XML and .desktop file validate (desktop-file-validate, xmllint) and map *.zapp
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the macOS AppKit launcher in src/app/atelier_launcher_macos.m, built by tools/package with the engine deployment floor. The bundle exports dev.zinc.zapp (public.data, .zapp, application/x-zinc-app) and a Viewer/Owner claim. Initial openFiles replaces the Atelier fallback; later events launch sibling zinc with a literal argument array. Actual NSTask objects, one Starting/Running/Stopping transition function and main-thread child cleanup cover normal exit, launch failure, repeated opens and application termination. Direct/headless launches retain synchronous exec exit codes, inherited streams/environment, ZINC_PROJECT and no-overwrite hello.ts behavior.

Linux packages now ship shared-mime-info XML and a desktop handler. install.sh installs both under XDG_DATA_HOME independently of --atelier, uses a canonical absolute engine path with both desktop escaping layers (including literal percent), and invokes available cache tools without changing defaults. AppImage's desktop entry and AppRun now forward archive argv.

Research/choice: use the system AppKit document delegate, avoiding any engine, SDL delegate or HAL hook. Apple documents initial file-event delivery before didFinishLaunching, and multiple-file reply handling: https://developer.apple.com/documentation/appkit/nsapplicationdelegate/application%28_%3Aopenfile%3A%29?language=objc and https://developer.apple.com/documentation/appkit/nsapplicationdelegate/application%28_%3Aopenfiles%3A%29?language=objc . NSWorkspace initial events/nonactivation: https://developer.apple.com/documentation/appkit/nsworkspace/openconfiguration?language=objc . Registration adds candidates rather than replacing defaults: https://developer.apple.com/documentation/coreservices/1446350-lsregisterurl?language=objc . SDL owns its application delegate: https://wiki.libsdl.org/SDL3/README-macos . Linux format/escaping references: https://specifications.freedesktop.org/shared-mime-info/latest-single/ and https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html .

Proof: exact zapp_desktop T0 PASS with xmllint and temporary builds of official desktop-file-utils 0.28 and shared-mime-info 2.4 validators against already-installed GLib/libxml; no global installs. It validates both shipped and installed desktop files, creates a temporary MIME database mapping *.zapp, checks an installed path containing spaces, quotes, backslashes, dollar signs, backticks and percent, preserves literal AppImage/native file argv and exit code 17, preserves existing hello.ts, and drives illegal transitions, launch failure and child-exit cleanup. Official source archives: https://gitlab.freedesktop.org/xdg/desktop-file-utils/-/archive/0.28/desktop-file-utils-0.28.tar.gz (SHA256 379ecbc1354d0c052188bdf5dbbc4a020088ad3f9cab54487a5852d1743a4f3b) and https://gitlab.freedesktop.org/xdg/shared-mime-info/-/archive/2.4/shared-mime-info-2.4.tar.gz (SHA256 531291d0387eb94e16e775d7e73788d06d2b2fdd8cd2ac6b6b15287593b6a2de).

Bounded real feature proof: actual compiler source 3e0925d48/SHA256 e5206875f798939a9c36115ef6d8df44be782b8e1e32aaef2dafe5439eae3461 packed two minimal programs. A disposable ad-hoc-signed bundle used a sibling symlink to that read-only compiler plus ZINC_ROOT for this tree. NSWorkspaceOpenConfiguration.appleEvent delivered the cold odoc; two PID-targeted later odoc events each ran the warm archive. Marker files verified all three runs; the fallback project was absent; launcher and children ended. UTI lookup returned dev.zinc.zapp, Viewer inventory listed dev.zinc.archive-proof-391 and the application URL mapped the archive. Explicit unregister ran before removing the bundle; default handler was <none> before and after. No default association setter was called; no process remains. Important proof detail: LaunchServices excludes apps inside NSTemporaryDirectory from handler inventory even though events work there; a transient nonhidden directory in this worktree proved registration. Probe sources/results are in .logs/zapp391 for coordinator archival.

Not run: full package/prebuild, package T1/T2, suites, benchmarks, release signing/notarization, actual Linux desktop session. The OptiPlex LAN and Tailscale SSH routes each timed out after five seconds. GLib gio launch reports unsupported platform on macOS, so no Linux launch claim. No new dependency, task or decision number. usage: n/a.

Proposed tests:
- Packaged install_nocompiler/package app smoke: prove real packaged ordinary Atelier plus archive opens; ~30s-1min excluding prebuild/download, estimated <500MB.
- OptiPlex desktop file open with temporary XDG data and retained defaults: prove actual Linux file-manager routing; ~10s, estimated <100MB, once reachable.
- macOS document open while a live archive is terminated and malformed/multiple archives are opened: broader event/quit coverage; ~10s, estimated <100MB.

Final compatibility review: desktop installation is conditional on both metadata files, because the current installer may fetch a release made before ZN-391 ships. The exact T0 also installs a metadata-free old archive with --atelier and verifies the Atelier menu entry still appears. Final exact T0 with official validators PASS.
<!-- SECTION:NOTES:END -->
