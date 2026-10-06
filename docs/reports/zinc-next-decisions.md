# Zinc Next: decisions after M1 to M6 (ZN-031)

Recorded 2026-10-06 from the results of the proof of concept. They close the "Decisions still open" of `zinc-next-design.md` (section 10).

## 1. Name of the desktop app: **Zinc Atelier**

`ZincStudio` already names the macOS box editor, so the app needs another name. Criteria: short, says "a place where you make things" (editor,
devices, profiler in one app), not a generic word that is already a famous developer tool. "Forge" (Electron Forge, Minecraft Forge) and "Foundry"
(Palantir, Foundry VTT) were set aside for that reason. The command line keeps the name `zinc`; the app is **Zinc Atelier**.
Checked: no npm package and no GitHub repository of the closed spellings of the candidates. Not checked: trademarks and domains (task ZN-056).
Fallbacks if it is taken: Zinc Forge, Zinc Foundry.

## 2. Shell of the app: a Zinc app (zinc:ui), not a web shell

The app is written in Zinc on `zinc:ui` and runs on the engine like any other app (the end goal in the product vision: one self-contained
program for Windows, macOS and Linux; no Tauri, no Electron). The proof of concept shows the base is there: the whole `zinc:ui` stack
(Solid signals, kit components, layout, text) runs in the interpreter and in AOT and draws pixel-identical frames (ZN-044, ZN-045).
What is missing is planned as tasks ZN-047 to ZN-055: a live window and input, fonts and images baked by the engine, the host modules
apps need, the shell itself, the QuickJS path, a stable IR, packaging, Windows and Linux hosts, and hardware validation.

## 3. QuickJS: the full engine, as a second engine

QuickJS is kept as a full engine next to the interpreter and the AOT output, not only for `zinc:script`: it runs plain JavaScript (npm code,
`eval`, dynamic plugins) that the typed subset does not cover, behind the same host ABI. The typed engine stays the default and the fast path
(the interpreter is 3 to 6 times faster than QuickJS on the numeric kernels, ZN-026). Constrained targets are evaluated separately (ZN-043, mquickjs).
Task ZN-051.

## 4. `--emit=ir`: not stable now, and it must become stable

The IR text changed with almost every task of M3 to M6 (inlining, devirtualisation, closures, host calls), and its goldens are regenerated each
time. It stays unstable until the passes settle. The aim is a stable, versioned format: a spec, a version number in the dump, a parser that
reads it back, and a compatibility test over old dumps. Task ZN-052. Until then nothing outside the repository may depend on the text.

## Also settled

- `clang` is not replaced by an in-process backend for now: the pinned `zig c++` is downloaded, checked and used in about 20 s (ZN-029) and
  cross builds for aarch64, armhf and x86_64 work. Revisit if the toolchain size or the first-build time proves a problem for users.
- The default path for devices is bytecode upload to a preflashed core (ZN-030); AOT is the path for speed.
