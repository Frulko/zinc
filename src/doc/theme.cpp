// zinc doc: the default theme (ZN-856), compiled into zinc so a site builds offline: _zdoc/style.css and _zdoc/doc.js of every site.
// Every colour, font and size is a CSS variable on :root; a project's theme.css (zinc.json doc.theme, else docs/theme.css) is loaded after
// this file and overrides any of them. Light and dark follow the system until the reader picks one (remembered in localStorage).
#include "doc/internal.h"

namespace zn::doc {

const char* const kStyleCss = R"CSS(/* zinc doc default theme. Override any variable in your theme.css. */
:root {
  --bg: #fbfbf8; --bg-soft: #f4f5ef; --surface: #ffffff; --ink: #14170f; --ink-2: #3d4436; --muted: #6a7363; --line: #e3e6db; --line-strong: #cfd4c4;
  --accent: #b6e340; --accent-ink: #4a6a00; --accent-soft: #f0f8d8; --on-accent: #10140a;
  --code-bg: #f6f7f2; --code-ink: #23281c;
  --tok-k: #8b3fd1; --tok-t: #0f7b8a; --tok-f: #2e5bd8; --tok-s: #3f7d1a; --tok-n: #c2570a; --tok-c: #8a9283; --tok-p: #b03a6c; --tok-v: #b8650b;
  --note: #2f6fdb; --tip: #3d8b13; --warning: #b7791f; --danger: #d03a3a; --important: #8b3fd1;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --radius: 12px; --radius-sm: 8px; --header: 60px; --sidebar: 286px; --toc: 232px; --content: 780px;
  --shadow: 0 1px 2px rgb(20 24 10 / .05), 0 8px 24px -12px rgb(20 24 10 / .18);
  --shadow-lg: 0 24px 60px -24px rgb(20 24 10 / .35);
  color-scheme: light;
}
:root[data-theme="dark"] {
  --bg: #0b0d0b; --bg-soft: #0f120f; --surface: #121512; --ink: #eef2e8; --ink-2: #c9d1c1; --muted: #8f9a8a; --line: #222821; --line-strong: #2f372d;
  --accent: #c8f25a; --accent-ink: #c8f25a; --accent-soft: #1a220f; --on-accent: #10140a;
  --code-bg: #0f120f; --code-ink: #dfe6d6;
  --tok-k: #c79bff; --tok-t: #6fd3c8; --tok-f: #8fb4ff; --tok-s: #b5e07a; --tok-n: #ffb070; --tok-c: #6b7566; --tok-p: #ff9cc4; --tok-v: #ffc777;
  --note: #6ea0ff; --tip: #8fd45a; --warning: #f0b44c; --danger: #ff6b6b; --important: #c79bff;
  --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 8px 24px -12px rgb(0 0 0 / .6);
  --shadow-lg: 0 24px 60px -20px rgb(0 0 0 / .8);
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0b0d0b; --bg-soft: #0f120f; --surface: #121512; --ink: #eef2e8; --ink-2: #c9d1c1; --muted: #8f9a8a; --line: #222821; --line-strong: #2f372d;
    --accent: #c8f25a; --accent-ink: #c8f25a; --accent-soft: #1a220f; --on-accent: #10140a;
    --code-bg: #0f120f; --code-ink: #dfe6d6;
    --tok-k: #c79bff; --tok-t: #6fd3c8; --tok-f: #8fb4ff; --tok-s: #b5e07a; --tok-n: #ffb070; --tok-c: #6b7566; --tok-p: #ff9cc4; --tok-v: #ffc777;
    --note: #6ea0ff; --tip: #8fd45a; --warning: #f0b44c; --danger: #ff6b6b; --important: #c79bff;
    --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 8px 24px -12px rgb(0 0 0 / .6);
    --shadow-lg: 0 24px 60px -20px rgb(0 0 0 / .8);
    color-scheme: dark;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-padding-top: calc(var(--header) + 20px); -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.7 var(--sans); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
a { color: var(--accent-ink); text-decoration: none; text-underline-offset: 3px; }
a:hover { text-decoration: underline; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
img { max-width: 100%; height: auto; }
button { font: inherit; color: inherit; }
kbd { font: 600 .75em var(--mono); border: 1px solid var(--line-strong); border-bottom-width: 2px; border-radius: 5px; padding: .05em .4em; background: var(--surface); color: var(--muted); }

/* header */
.top { position: sticky; top: 0; z-index: 30; height: var(--header); display: flex; align-items: center; gap: 14px; padding: 0 20px;
  background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: saturate(1.4) blur(14px); -webkit-backdrop-filter: saturate(1.4) blur(14px); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.05rem; letter-spacing: -.02em; color: var(--ink); white-space: nowrap; }
.brand:hover { text-decoration: none; }
.brand .mark { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 45%, #2e8b57)); box-shadow: inset 0 0 0 1px rgb(0 0 0 / .08); display: grid; place-items: center; color: var(--on-accent); font: 800 14px var(--sans); }
.brand .sub { color: var(--muted); font-weight: 500; }
.top .spacer { flex: 1; }
.search-btn { display: flex; align-items: center; gap: 10px; min-width: 240px; height: 38px; padding: 0 8px 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--muted); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.search-btn:hover { border-color: var(--line-strong); box-shadow: var(--shadow); }
.search-btn svg { width: 16px; height: 16px; flex: none; }
.search-btn span { flex: 1; text-align: left; font-size: .92rem; }
.icon-btn { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink-2); cursor: pointer; }
.icon-btn:hover { border-color: var(--line-strong); }
.icon-btn svg { width: 18px; height: 18px; }
.theme-toggle .sun { display: none; }
:root[data-theme="dark"] .theme-toggle .sun { display: block; } :root[data-theme="dark"] .theme-toggle .moon { display: none; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .theme-toggle .sun { display: block; } :root:not([data-theme="light"]) .theme-toggle .moon { display: none; } }
.menu-btn { display: none; }

/* layout */
.layout { display: grid; grid-template-columns: var(--sidebar) minmax(0, 1fr) var(--toc); max-width: 1440px; margin: 0 auto; }
.layout.no-toc { grid-template-columns: var(--sidebar) minmax(0, 1fr); }
.sidebar { position: sticky; top: var(--header); height: calc(100vh - var(--header)); overflow-y: auto; padding: 22px 14px 40px 20px; border-right: 1px solid var(--line); scrollbar-width: thin; }
.sidebar .group { margin-bottom: 22px; }
.sidebar .group-title { font: 650 .72rem var(--sans); text-transform: uppercase; letter-spacing: .09em; color: var(--muted); margin: 0 0 6px 10px; }
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar li a, .sidebar summary { display: block; padding: 5px 10px; border-radius: 7px; color: var(--ink-2); font-size: .91rem; line-height: 1.45; }
.sidebar li a:hover, .sidebar summary:hover { background: var(--bg-soft); color: var(--ink); text-decoration: none; }
.sidebar li a.current { background: var(--accent-soft); color: var(--accent-ink); font-weight: 600; box-shadow: inset 2px 0 0 var(--accent); }
.sidebar summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; }
.sidebar summary::-webkit-details-marker { display: none; }
.sidebar summary::after { content: ""; margin-left: auto; width: 6px; height: 6px; border-right: 1.5px solid var(--muted); border-bottom: 1.5px solid var(--muted); transform: rotate(-45deg); transition: transform .15s; }
.sidebar details[open] > summary::after { transform: rotate(45deg); }
.sidebar details ul { margin: 2px 0 6px 12px; padding-left: 8px; border-left: 1px solid var(--line); }
.sidebar .kind { font: 600 .66rem var(--mono); color: var(--muted); margin-left: 6px; }
main { min-width: 0; padding: 40px 48px 80px; }
.prose { max-width: var(--content); margin: 0 auto; }
.toc { position: sticky; top: var(--header); height: calc(100vh - var(--header)); overflow-y: auto; padding: 40px 20px 40px 8px; font-size: .85rem; }
.toc .toc-title { font: 650 .72rem var(--sans); text-transform: uppercase; letter-spacing: .09em; color: var(--muted); margin-bottom: 10px; }
.toc ul { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--line); }
.toc li a { display: block; padding: 4px 12px; margin-left: -1px; color: var(--muted); border-left: 2px solid transparent; line-height: 1.4; }
.toc li.l3 a { padding-left: 24px; }
.toc li a:hover { color: var(--ink); text-decoration: none; }
.toc li a.active { color: var(--accent-ink); border-left-color: var(--accent); }

/* prose */
.breadcrumb { font-size: .85rem; color: var(--muted); margin-bottom: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
.breadcrumb a { color: var(--muted); } .breadcrumb span::before { content: "/"; margin-right: 6px; opacity: .5; }
.prose h1 { font-size: clamp(2rem, 4vw, 2.6rem); line-height: 1.12; letter-spacing: -.035em; margin: 0 0 12px; font-weight: 750; }
.prose .lead { font-size: 1.15rem; color: var(--muted); margin: 0 0 28px; }
.prose h2 { font-size: 1.55rem; letter-spacing: -.025em; line-height: 1.25; margin: 2.4em 0 .6em; padding-top: .2em; font-weight: 700; }
.prose h3 { font-size: 1.2rem; letter-spacing: -.015em; margin: 1.8em 0 .5em; font-weight: 650; }
.prose h4 { font-size: 1rem; margin: 1.5em 0 .4em; }
.prose h2 .anchor, .prose h3 .anchor, .prose h4 .anchor { margin-left: .4em; color: var(--muted); opacity: 0; font-weight: 400; transition: opacity .15s; }
.prose h2:hover .anchor, .prose h3:hover .anchor, .prose h4:hover .anchor { opacity: 1; text-decoration: none; }
.prose p, .prose ul, .prose ol { margin: 0 0 1.1em; }
.prose li { margin: .25em 0; } .prose li > p { margin: 0 0 .5em; }
.prose li.task { list-style: none; margin-left: -1.4em; } .prose li.task input { margin-right: .5em; accent-color: var(--accent); }
.prose blockquote { margin: 1.4em 0; padding: .2em 1.2em; border-left: 3px solid var(--line-strong); color: var(--ink-2); }
.prose hr { border: 0; border-top: 1px solid var(--line); margin: 2.4em 0; }
.prose :not(pre) > code { font: .86em var(--mono); background: var(--code-bg); border: 1px solid var(--line); border-radius: 6px; padding: .12em .38em; color: var(--code-ink); }
.prose a code { color: var(--accent-ink); }
.prose a.external::after { content: "↗"; font-size: .75em; margin-left: 2px; opacity: .6; }
.prose img { border-radius: var(--radius-sm); }
.prose .dead-link { border-bottom: 1px dotted var(--muted); }
.table-wrap { overflow-x: auto; margin: 1.4em 0; border: 1px solid var(--line); border-radius: var(--radius); }
.prose table { border-collapse: collapse; width: 100%; font-size: .92rem; }
.prose th { text-align: left; font-weight: 650; background: var(--bg-soft); }
.prose th, .prose td { padding: 9px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
.prose tr:last-child td { border-bottom: 0; }
.footnotes { margin-top: 3em; font-size: .9rem; color: var(--muted); border-top: 1px solid var(--line); padding-top: 1em; }

/* code */
.code-block { position: relative; margin: 1.3em 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--code-bg); overflow: hidden; }
.code-block pre { margin: 0; padding: 16px 18px; overflow-x: auto; font: 13.5px/1.65 var(--mono); color: var(--code-ink); tab-size: 2; }
.code-block code { font: inherit; }
.code-title { font: 600 .78rem var(--mono); color: var(--muted); padding: 9px 16px; border-bottom: 1px solid var(--line); background: var(--bg-soft); }
.code-block[data-lang]::before { content: attr(data-lang); position: absolute; top: 9px; right: 74px; font: 600 .68rem var(--mono); color: var(--muted); text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
.code-block .copy { position: absolute; top: 7px; right: 8px; height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); font: 600 .72rem var(--sans); cursor: pointer; opacity: 0; transition: opacity .15s, color .15s; }
.code-block:hover .copy, .code-block .copy:focus-visible, .code-block .copy.done { opacity: 1; }
.code-block .copy.done { color: var(--tip); border-color: var(--tip); }
.code-block.command { background: #0d100d; border-color: #1f251e; }
.code-block.command pre { color: #e6eedd; }
.code-block.command .copy { opacity: 1; background: #171c16; border-color: #2a3228; color: #a8b3a2; }
.code-block.command[data-lang]::before { display: none; }
.code-block.command .pr { color: var(--accent); }
.code-block.command .f { color: #e6eedd; font-weight: 600; } .code-block.command .v { color: #ffc777; } .code-block.command .s { color: #b5e07a; } .code-block.command .c { color: #6b7566; }
.pr { user-select: none; -webkit-user-select: none; color: var(--muted); }
.k { color: var(--tok-k); } .t, a.t { color: var(--tok-t); } .f { color: var(--tok-f); } .s { color: var(--tok-s); } .n { color: var(--tok-n); }
.c { color: var(--tok-c); font-style: italic; } .p { color: var(--tok-p); } .v { color: var(--tok-v); }
a.t:hover { text-decoration: underline; }

/* components */
.callout { margin: 1.5em 0; padding: 14px 18px 4px; border: 1px solid color-mix(in srgb, var(--c) 28%, var(--line)); border-left: 4px solid var(--c); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--c) 7%, var(--surface)); --c: var(--note); }
.callout-tip { --c: var(--tip); } .callout-warning, .callout-caution { --c: var(--warning); } .callout-danger { --c: var(--danger); } .callout-important { --c: var(--important); }
.callout-title { font-weight: 700; color: var(--c); margin: 0 0 .4em !important; display: flex; align-items: center; gap: 8px; font-size: .95rem; }
.callout-title::before { content: "i"; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--c); color: var(--surface); font: 800 11px var(--sans); }
.callout-tip .callout-title::before { content: "✓"; } .callout-warning .callout-title::before, .callout-caution .callout-title::before { content: "!"; } .callout-danger .callout-title::before { content: "×"; }
.steps { counter-reset: step; margin: 1.6em 0; }
.step, .steps > ol > li { position: relative; padding: 0 0 1.2em 3.1em; margin: 0; }
.steps > ol { list-style: none; padding: 0; counter-reset: step; }
.step::before, .steps > ol > li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 0; width: 2em; height: 2em; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-ink); font: 700 .85rem var(--sans); border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); }
.step::after, .steps > ol > li::after { content: ""; position: absolute; left: 1em; top: 2.3em; bottom: .3em; width: 1px; background: var(--line); }
.step:last-child::after, .steps > ol > li:last-child::after { display: none; }
.step-title { font-weight: 650; margin: .15em 0 .4em !important; font-size: 1.02rem; }
.tabs { margin: 1.4em 0; }
.tab-bar { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 14px; overflow-x: auto; }
.tab-bar button { border: 0; background: none; padding: 8px 14px; color: var(--muted); font-weight: 600; font-size: .9rem; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.tab-bar button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
.tabs.ready > .tab:not(.on) { display: none; }
.tabs:not(.ready) > .tab::before { content: attr(data-label); display: block; font-weight: 650; color: var(--muted); font-size: .85rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin: 1.5em 0; }
.card { position: relative; padding: 18px 18px 6px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); transition: border-color .15s, transform .15s, box-shadow .15s; }
.card:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); box-shadow: var(--shadow); transform: translateY(-1px); }
.card .card-title { font-weight: 650; margin: 0 0 .35em !important; color: var(--ink); }
.card-title a { color: inherit; } .card-title a::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
.card-title a:hover { text-decoration: none; }
.card p { color: var(--muted); font-size: .92rem; }
.card-icon { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--accent-soft); color: var(--accent-ink); margin-bottom: 10px; font-size: 1rem; }
.screenshot { margin: 1.8em 0; }
.screenshot .frame { border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); box-shadow: var(--shadow-lg); background: var(--surface); }
.screenshot.plain .frame { box-shadow: var(--shadow); }
.frame-bar { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border-bottom: 1px solid var(--line); background: var(--bg-soft); }
.frame-bar i { width: 11px; height: 11px; border-radius: 50%; background: var(--line-strong); } .frame-bar i:nth-child(1) { background: #ff5f57; } .frame-bar i:nth-child(2) { background: #febc2e; } .frame-bar i:nth-child(3) { background: #28c840; }
.frame-bar span { margin-left: 8px; font-size: .78rem; color: var(--muted); }
.screenshot img { display: block; width: 100%; border-radius: 0; }
.screenshot figcaption { text-align: center; color: var(--muted); font-size: .88rem; margin-top: 10px; }
.example { margin: 1.6em 0; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--surface); }
.example-title { font: 650 .8rem var(--sans); color: var(--muted); padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--bg-soft); text-transform: uppercase; letter-spacing: .06em; }
.example-body { padding: 4px 16px; }
.example-body .code-block { margin: 12px 0; }
.example-shot { margin: 0; border-top: 1px solid var(--line); } .example-shot img { display: block; width: 100%; border-radius: 0; }
.details { margin: 1.2em 0; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 4px 16px; background: var(--surface); }
.details summary { cursor: pointer; font-weight: 600; padding: 6px 0; }
.badge { display: inline-block; font: 650 .68rem var(--mono); padding: 2px 7px; border-radius: 999px; background: var(--bg-soft); border: 1px solid var(--line); color: var(--muted); vertical-align: middle; }
.badge.accent { background: var(--accent-soft); color: var(--accent-ink); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }

/* API */
.api-source { font: .82rem var(--mono); color: var(--muted); margin: -4px 0 22px; }
.api-summary { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 14px; margin: 1em 0 2em; padding: 16px 18px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg-soft); }
.api-summary a { font: .85rem var(--mono); display: flex; align-items: center; gap: 8px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kind { display: inline-grid; place-items: center; min-width: 22px; height: 18px; padding: 0 4px; border-radius: 5px; font: 700 .62rem var(--mono); text-transform: uppercase; color: var(--surface); background: var(--muted); flex: none; }
.kind-function, .kind-method { background: var(--tok-f); } .kind-class { background: var(--tok-t); } .kind-interface, .kind-type { background: var(--tok-k); } .kind-const, .kind-property, .kind-getter { background: var(--tok-n); } .kind-enum, .kind-namespace { background: var(--tok-p); } .kind-constructor { background: var(--tip); }
.api-item { margin: 2.2em 0; padding-top: .4em; border-top: 1px solid var(--line); }
.api-item > h3 { display: flex; align-items: center; gap: 10px; margin: .8em 0 .6em; font: 650 1.12rem var(--mono); letter-spacing: 0; }
.api-item .code-block, .api-member .code-block { margin: .6em 0 .9em; }
.api-members { margin: 1em 0 0 0; border-left: 2px solid var(--line); padding-left: 18px; }
.api-member { margin: 0 0 1.1em; }
.api-member h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 .2em; font: 600 .92rem var(--mono); }
.api-member .code-block pre { padding: 10px 14px; font-size: 12.8px; }
.api-member .doc { font-size: .94rem; color: var(--ink-2); }
.api-member .doc p { margin-bottom: .6em; }
.plugin-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 22px; }

/* home */
.hero { padding: 28px 0 10px; }
.hero h1 { font-size: clamp(2.4rem, 5vw, 3.4rem) !important; letter-spacing: -.045em !important; }
.hero .lead { font-size: 1.25rem; max-width: 40ch; }
.hero-glow { position: absolute; inset: var(--header) 0 auto; height: 360px; pointer-events: none; z-index: -1; background: radial-gradient(600px 260px at 70% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%); }
.actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 22px 0 8px; }
.btn { display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 18px; border-radius: 10px; font-weight: 650; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); }
.btn:hover { text-decoration: none; box-shadow: var(--shadow); }
.btn.primary { background: var(--accent); color: var(--on-accent); border-color: transparent; }

/* pager */
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 4em; }
.pager a { display: block; padding: 14px 18px; border: 1px solid var(--line); border-radius: var(--radius); color: var(--ink); }
.pager a:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); text-decoration: none; }
.pager small { display: block; color: var(--muted); font-size: .78rem; }
.pager .next { text-align: right; grid-column: 2; }
.foot { margin-top: 3em; padding-top: 1.4em; border-top: 1px solid var(--line); color: var(--muted); font-size: .82rem; }

/* search */
.search { position: fixed; inset: 0; z-index: 50; display: none; background: rgb(8 10 8 / .45); backdrop-filter: blur(3px); padding: 9vh 16px 16px; }
.search.open { display: block; }
.search-panel { max-width: 640px; margin: 0 auto; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow-lg); overflow: hidden; }
.search-input { display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--line); }
.search-input svg { width: 18px; height: 18px; color: var(--muted); flex: none; }
.search input { flex: 1; height: 56px; border: 0; outline: 0; background: none; color: var(--ink); font: 1.05rem var(--sans); }
.search-results { max-height: 60vh; overflow-y: auto; padding: 8px; margin: 0; list-style: none; }
.search-results a { display: block; padding: 10px 12px; border-radius: 10px; color: var(--ink); }
.search-results a:hover, .search-results a.sel { background: var(--accent-soft); text-decoration: none; }
.search-results .r-title { font-weight: 600; display: flex; gap: 8px; align-items: center; }
.search-results .r-sec { color: var(--muted); font-size: .78rem; }
.search-results .r-text { color: var(--muted); font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-results mark { background: none; color: var(--accent-ink); font-weight: 700; }
.search-empty { padding: 26px; text-align: center; color: var(--muted); }

/* narrow screens */
@media (max-width: 1180px) { .layout { grid-template-columns: var(--sidebar) minmax(0, 1fr); } .toc { display: none; } }
@media (max-width: 860px) {
  .layout, .layout.no-toc { grid-template-columns: minmax(0, 1fr); }
  .menu-btn { display: grid; }
  .sidebar { position: fixed; z-index: 40; top: var(--header); left: 0; width: min(320px, 86vw); background: var(--bg); transform: translateX(-100%); transition: transform .2s; box-shadow: var(--shadow-lg); }
  body.nav-open .sidebar { transform: none; }
  main { padding: 28px 16px 60px; }
  .search-btn { min-width: 0; } .search-btn span, .search-btn kbd { display: none; }
  .brand .sub { display: none; }
}
@media print { .top, .sidebar, .toc, .pager, .copy { display: none !important; } .layout { display: block; } }
)CSS";

const char* const kDocJs = R"JS(// zinc doc: theme toggle, copy buttons, tabs, search, the table of contents and, when served, reload on change.
(function () {
  var root = document.documentElement, base = root.getAttribute('data-root') || '';
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) toggle.addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next); store('zdoc-theme', next);
  });
  var menu = document.querySelector('.menu-btn');
  if (menu) menu.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  var cur = document.querySelector('.sidebar a.current');
  var side = document.querySelector('.sidebar');
  if (cur && side) side.scrollTop = Math.max(0, cur.offsetTop - side.clientHeight / 2);   // the sidebar only, never the page

  function copyText(text, done) {
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); done(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  document.querySelectorAll('.code-block .copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var code = b.parentNode.querySelector('code').cloneNode(true);
      code.querySelectorAll('.pr').forEach(function (p) { p.remove(); });
      var text = code.textContent;
      if (b.parentNode.classList.contains('command')) text = text.split('\n').filter(function (l) { return l.trim(); }).join('\n');
      copyText(text, function () { b.textContent = 'Copied'; b.classList.add('done'); setTimeout(function () { b.textContent = 'Copy'; b.classList.remove('done'); }, 1400); });
    });
  });

  // tabs: one bar per group; the label picked is remembered and picked in every group that has it
  var groups = [].slice.call(document.querySelectorAll('.tabs'));
  function pick(label, save) {
    groups.forEach(function (g) {
      var tabs = [].slice.call(g.children).filter(function (c) { return c.classList.contains('tab'); });
      if (!tabs.some(function (t) { return t.getAttribute('data-label') === label; })) return;
      tabs.forEach(function (t, i) { var on = t.getAttribute('data-label') === label; t.classList.toggle('on', on); g._bar.children[i].setAttribute('aria-selected', on); });
    });
    if (save) store('zdoc-tab', label);
  }
  groups.forEach(function (g) {
    var tabs = [].slice.call(g.children).filter(function (c) { return c.classList.contains('tab'); });
    if (!tabs.length) return;
    var bar = document.createElement('div'); bar.className = 'tab-bar'; bar.setAttribute('role', 'tablist'); g._bar = bar;
    tabs.forEach(function (t, i) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = t.getAttribute('data-label');
      b.setAttribute('aria-selected', i === 0); t.classList.toggle('on', i === 0);
      b.addEventListener('click', function () { pick(t.getAttribute('data-label'), true); });
      bar.appendChild(b);
    });
    g.insertBefore(bar, g.firstChild); g.classList.add('ready');
  });
  var saved = store('zdoc-tab'); if (saved) pick(saved, false);

  // the table of contents follows the reading
  var links = [].slice.call(document.querySelectorAll('.toc a'));
  if (links.length && 'IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
      var first = links.find(function (a) { return seen[a.getAttribute('href').slice(1)]; });
      if (first) links.forEach(function (a) { a.classList.toggle('active', a === first); });
    }, { rootMargin: '-60px 0px -55% 0px' });
    links.forEach(function (a) { var h = document.getElementById(a.getAttribute('href').slice(1)); if (h) io.observe(h); });
  }

  // search over _zdoc/search-index.js (a script, so it works from file:// too)
  var box = document.querySelector('.search'), input = box && box.querySelector('input'), list = box && box.querySelector('.search-results'), sel = 0, shown = [];
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mark(s, terms) { var h = esc(s); terms.forEach(function (t) { if (t) h = h.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }); return h; }
  function snippet(x, terms) {
    var l = x.toLowerCase(), i = -1;
    terms.some(function (t) { i = l.indexOf(t); return i >= 0; });
    if (i < 0) return x.slice(0, 120);
    var a = Math.max(0, i - 40); return (a ? '…' : '') + x.slice(a, a + 140);
  }
  function search(q) {
    var idx = window.ZDOC_INDEX || [], terms = q.toLowerCase().split(/\s+/).filter(Boolean), out = [];
    if (!terms.length) return [];
    idx.forEach(function (e) {
      var t = e.t.toLowerCase(), s = (e.s || '').toLowerCase(), x = (e.x || '').toLowerCase(), score = 0;
      for (var i = 0; i < terms.length; i++) {
        var w = terms[i], best = 0;
        if (t === w) best = 100; else if (t.indexOf(w) === 0) best = 60; else if (t.indexOf(w) >= 0) best = 40;
        else if (s.indexOf(w) >= 0) best = 12; else if (x.indexOf(w) >= 0) best = 6;
        if (!best) return;
        score += best;
      }
      if (e.k === 'page') score += 4; if (e.k === 'api') score += 2;
      out.push({ e: e, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score || a.e.t.length - b.e.t.length; });
    return out.slice(0, 40);
  }
  function render() {
    var q = input.value.trim(), terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    shown = search(q); sel = 0;
    if (!q) { list.innerHTML = '<li class="search-empty">Type to search pages, guides and the API.</li>'; return; }
    if (!shown.length) { list.innerHTML = '<li class="search-empty">No results for “' + esc(q) + '”</li>'; return; }
    list.innerHTML = shown.map(function (r, i) {
      var e = r.e, kind = e.kind ? '<span class="kind kind-' + e.kind + '">' + e.kind.slice(0, 2) + '</span>' : '';
      return '<li><a href="' + base + e.u + '"' + (i === 0 ? ' class="sel"' : '') + '><div class="r-title">' + kind + '<span>' + mark(e.t, terms) + '</span></div>' +
        (e.s ? '<div class="r-sec">' + esc(e.s) + '</div>' : '') + (e.x ? '<div class="r-text">' + mark(snippet(e.x, terms), terms) + '</div>' : '') + '</a></li>';
    }).join('');
  }
  function openSearch() { if (!box) return; box.classList.add('open'); input.value = ''; render(); setTimeout(function () { input.focus(); }, 0); }
  function closeSearch() { if (box) box.classList.remove('open'); }
  document.querySelectorAll('.search-btn').forEach(function (b) { b.addEventListener('click', openSearch); });
  if (box) {
    box.addEventListener('click', function (e) { if (e.target === box) closeSearch(); });
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      var as = list.querySelectorAll('a');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!as.length) return; as[sel].classList.remove('sel'); sel = (sel + (e.key === 'ArrowDown' ? 1 : as.length - 1)) % as.length; as[sel].classList.add('sel'); as[sel].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && as[sel]) { location.href = as[sel].href; closeSearch(); }
    });
  }
  document.addEventListener('keydown', function (e) {
    var typing = /input|textarea|select/i.test((e.target && e.target.tagName) || '');
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openSearch(); }
    else if (e.key === 'Escape') { closeSearch(); document.body.classList.remove('nav-open'); }
  });

  // zinc doc --serve: reload when the site is built again (a static host answers 404 and the check stops)
  if (/^https?:$/.test(location.protocol)) {
    var version = null, timer = setInterval(function () {
      fetch(base + '__zdoc/version', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) { clearInterval(timer); return; }
        return r.text().then(function (v) { if (version === null) version = v; else if (v !== version) location.reload(); });
      }, function () {});
    }, 1000);
  }
})();
)JS";

}  // namespace zn::doc
