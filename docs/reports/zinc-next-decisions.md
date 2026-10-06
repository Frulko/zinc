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

## 5. Name check for Zinc Atelier (ZN-056, 2026-10-06)

What was searched, and what came back (a web search and DNS and registry look-ups; no trademark office was queried, see the limits):

| Where | Result |
|---|---|
| Web search "Zinc Atelier" (software, app, trademark) | no product, company or mark of that name |
| Marks containing ZINC (USPTO listings found by the search) | several registrations of the single word ZINC for software and apps (TemTree Co., Senseeker Engineering, Silver-Katz Entertainment, Summum S.A.) and a mark of Zinc Labs Inc (OpenObserve); older products named Zinc: the Zinc Application Framework (a C++ GUI toolkit), Zinc Inc. (messaging) |
| Domains | `zincatelier.com` is registered (Cloudflare name servers, no site); `zincatelier.io` is not registered; `zincatelier.dev` and `.app` have no DNS records (probably free, to be confirmed at a registrar); `zincforge.com` is registered (Porkbun); `zincforge.dev` and `zincfoundry.com` have no records |
| Registries | `zinc-atelier` and `zincatelier` are free on npm, PyPI and crates.io |
| GitHub | no repository named zinc atelier |

**Decision.** Keep **Zinc Atelier** as the name of the app. No product carries it and the registries are free. The risk is the word ZINC, not Atelier: other owners hold ZINC marks in software classes, so
the name is used descriptively as "Zinc Atelier, the app of the Zinc language" and not registered as a mark by us until a lawyer has cleared it. Domain: register `zincatelier.dev` (or `.app`) first; `.com` is taken. Fallback if a
conflict appears: **Zinc Foundry** (`zincfoundry.com` looks free), not Zinc Forge (`zincforge.com` is taken). The legacy ZincStudio box editor keeps its name; the two do not coexist in one package
(Atelier is the app of the new engine, ZincStudio belongs to the old compiler).

Limits: a trademark office search (USPTO, EUIPO, WIPO) and a registrar's availability check are not scriptable from here; the table is evidence for the decision, not legal advice.

## 6. MicroQuickJS (ZN-043, 2026-10-06)

Measured (`zinc-next-mquickjs.md`): about as fast as QuickJS, 4 to 7 times slower than the Zinc interpreter; 103 KB of Thumb-2 code against 125 KB for the Zinc core; 8 KB of heap for fib against a 24 KB register file, and 4 bytes per number in an array
against 8. It runs ES5 strict mode only, so the ES2022 path of ZN-051 does not carry over. **Decision: not adopted, not vendored.** Revisit for a product that needs user JavaScript on a device with under 100 KB of free RAM; then as a fallback engine behind `zinc:script`.

