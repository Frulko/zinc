# Zinc Next: resume

Overwritten at the end of every session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## State (2026-10-12)

- Owner batch completed: ZN-655 (real macOS WebView), ZN-720 (run/build progress and plugin fallback diagnostics), ZN-721 (standalone museum .app). Commits: `1a6ecb9a`, `9733d0e4`, `57d54780`. Local main only; no push.
- `build/zinc` rebuilt. All engines now announce startup stages on stderr by default; native C++ builds show an elapsed-time spinner, completed jobs and object-cache reuse. `-q` / `ZINC_STEPS=0` suppress progress; JSON remains structured. Failed native plugins warn with their fallback and cause, including cached runs. QuickJS honors `dev.perfHud`.
- WebView actually loads local pages and exchanges messages/RPC in AOT and interpreter. Fixed hosted-C++ compilation, prototype-only asset symbols, lazy window startup, the shadowing weak window-handle stub, and duplicate SDL linkage. QuickJS native callbacks remain unsupported with an explicit error; deterministic simulation opens no page.
- Museum artifacts: `../examples/museum-table/build/museum-table.app`, `.app.zip` (66.82 MB), `museum-table-sizes.json`. macOS arm64, local ad-hoc signature; 15 bundled dylibs. Extracted ZIP launched from `/` for 3 headless frames with no Homebrew library references/loads; strict/deep signature valid. Not notarized or published.
- Size cause: 93.65 MB executable includes 75.60 MB of decoded RGBA images and 11.69 MB of baked glyph tables/bitmaps. The old resource baker duplicates images held in the newer asset packs. Detail: museum README and `docs/reports/zinc-next-perf.md`; a later line records the renderer/pack convergence, no optimization performed.
- Targeted PASS: webview, build_progress, steps, plugin_fallback, verbose_log, run_js_engine, modules, run_cache, run_compiled, perf_hud, package_app, package. Headless p5 HUD, Phaser startup, museum native run and an actual terminal spinner smoke passed. No whole corpus or cross-platform checks.
- Follow-up research: `../docs/reports/zinc-next-resource-lifecycle.md` compares primary engine/framework sources and proposes view scopes over the existing native resource ABI, shared references, bounded idle cache, async cancellation and complete CPU/GPU retirement. Proposal only; no memory fix implemented or new benchmark run.
- Usage: n/a for this Codex session; tools/usage reads an unrelated Claude transcript.

## Next

`tools/next-task` selects ZN-158 (typed arrays, ArrayBuffer, DataView). No task started by this session beyond the owner's batch.

## Watch out

- Existing worktrees from other sessions remain; respect task claims and the shared build limit. No other session's changes were committed.
- Earlier machine-specific failures, not re-investigated here: tls (ZN-610), macos_window fullscreen readback (ZN-394), macos_vibrancy; system_instance can fail under load (ZN-613). Screen locking can block non-Apple executables in the kernel; leave the development session unlocked for builds/tests.
- Distribution is rebuilt with `build/zinc build --bundle <entry> -o <app>` then `tools/package --app <app>` before Developer ID signing/notarization. The museum's app identity is now declared in zinc.json; source runs with permissions may use the existing macOS dev-bundle path.
