# Figma to Zinc app, live: research (2026-10-18)

Web research only. Each claim carries its source. "UNVERIFIED" marks what I could not confirm from a primary source. Numbers are as read on the pages on 2026-10-18 and Figma may change them.

## 1. Figma's programmatic surface

### Plugin API (the only truly live channel)
- `figma.on` events: `selectionchange`, `currentpagechange`, `documentchange`, `stylechange`, `drop`, `run`, `close`, `textreview`, timers. Callbacks are async and rapid events can coalesce. https://developers.figma.com/docs/plugins/api/properties/figma-on/
- `documentchange`: fires for nodes or styles added/removed/changed; Figma batches and delivers periodically (no latency figure published: UNVERIFIED, measure). Change types `CREATE`, `DELETE` (only the top-level parent reported for nested), `PROPERTY_CHANGE`, `STYLE_CREATE/DELETE/PROPERTY_CHANGE`. Changes made by the plugin itself do not re-fire. It does NOT fire for instance sublayer updates caused by a main-component change, nor for node updates caused by a style change. With `"documentAccess": "dynamic-page"` you must call `figma.loadAllPagesAsync()` first (adds delay). Same source.
- Finer option: `PageNode.on('nodechange')` ("node added, removed, or updated"); the event's fields were not on the page fetched, so UNVERIFIED. https://developers.figma.com/docs/plugins/api/PageNode/
- Read surface: `getNodeByIdAsync`, `getStyleByIdAsync`, `getLocal{Paint,Text,Effect,Grid}StylesAsync`, `figma.variables`, `figma.root`, library import by key. `fileKey` only for private plugins with `enablePrivatePluginApi`. https://developers.figma.com/docs/plugins/api/figma/
- `node.exportAsync`: PNG/JPG/PDF (Uint8Array), `SVG_STRING`, and `JSON_REST_V1` (same shape as the REST node JSON). https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/
- Variables are in the Plugin API without a stated plan restriction (only extended collections are Enterprise): `getLocalVariablesAsync`, collections, modes, `boundVariables`. https://developers.figma.com/docs/plugins/working-with-variables/ (contrast with REST below).
- Auto layout props: `layoutMode` NONE/HORIZONTAL/VERTICAL, `layoutWrap`, `itemSpacing`, `counterAxisSpacing`, `counterAxisAlignContent` (wrap only); `layoutSizingHorizontal/Vertical` FIXED/HUG/FILL (HUG only on auto-layout frames and text; FILL only on auto-layout children). https://developers.figma.com/docs/plugins/api/properties/nodes-layoutmode , https://developers.figma.com/docs/plugins/api/properties/nodes-layoutwrap , https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/
- Components: `componentPropertyDefinitions` types BOOLEAN, TEXT, INSTANCE_SWAP, VARIANT (with options), SLOT. https://developers.figma.com/docs/plugins/api/node-properties/
- Prototype reactions: actions BACK, CLOSE, URL, UPDATE_MEDIA_RUNTIME, SET_VARIABLE, SET_VARIABLE_MODE, CONDITIONAL, NODE with navigation NAVIGATE / OVERLAY / SWAP / SCROLL_TO / CHANGE_TO. Trigger and transition (smart animate, easing) enums were not on the fetched page: UNVERIFIED. https://developers.figma.com/docs/plugins/api/Action/
- Local socket from a plugin: network goes through `networkAccess.allowedDomains`; local servers go in `devAllowedDomains` (e.g. `http://localhost:3000`); `reasoning` required for `*` or local entries; iframe origin is `null` so servers must send `Access-Control-Allow-Origin: *`. https://developers.figma.com/docs/plugins/making-network-requests/ . A working community plugin (Cursor talk-to-figma) lists `ws://localhost:3055` in `devAllowedDomains`, with the WebSocket owned by the UI iframe and relayed to the main thread. https://www.mintlify.com/grab/cursor-talk-to-figma-mcp/guides/figma-plugin . Another PoC pushes code from a Node file watcher to a plugin: https://github.com/mattdesl/figma-plugin-websockets . Whether `devAllowedDomains` works for a plugin published to the Community (not just in development) is UNVERIFIED; the `reasoning` rule suggests review.
- A plugin runs only while open in the designer's Figma session; the designer must keep it running.
- Persisting ids: `setPluginData`/`setSharedPluginData` (page 404; exists, REST `plugin_data` param reads it: https://developers.figma.com/docs/rest-api/file-endpoints/ ). Size limits UNVERIFIED.
- Dev Mode codegen plugins: manifest `"editorType":["dev"],"capabilities":["codegen"]`; `figma.codegen.on("generate")` runs on every selection change, returns Inspect-panel sections, 15 s timeout (a third-party claims 3 s: UNVERIFIED), no `showUI` inside. https://developers.figma.com/docs/plugins/codegen-plugins , https://developers.figma.com/docs/plugins/api/figma-codegen . Useful as an export surface, not as a live link.

### REST API
- `GET /v1/files/:key` (params `version`, `ids`, `depth`, `geometry=paths`, `plugin_data`, `branch_data`; returns `lastModified`, `version`, `document`, `components`, `componentSets`, `styles`), `GET /v1/files/:key/nodes?ids=`, `GET /v1/images/:key` (png/jpg/svg/pdf, scale 0.01-4, 32 MP cap, URLs expire after 30 days), `GET /v1/files/:key/images` (image fill URLs, expire in 14 days), `/v1/files/:key/meta` (`last_touched_at`, `version`). https://developers.figma.com/docs/rest-api/file-endpoints/
- Variables REST: `GET /v1/files/:key/variables/local`, `/published`, `POST /v1/files/:key/variables`; full members of **Enterprise** orgs only; up to 40 modes per collection. https://developers.figma.com/docs/rest-api/variables-endpoints/ . Plan table: modes per collection Pro 10, Org 20, Enterprise unlimited (Starter listed as none); Dev Mode not on Starter. https://help.figma.com/hc/en-us/articles/360040328273-Figma-plans-and-features
- Rate limits (leaky bucket, 429 + `Retry-After`): Tier 1 (GET file/nodes/images): View/Collab seats up to 20 per MONTH; Dev/Full 10/15/20 per minute by plan. Tier 2 (variables GET, comments, versions, webhooks, image fills): 5/min low seats, 25/50/100 high. Tier 3 (file meta, components/styles, POST variables): 10/min low, 50/100/150. The page lists three high-seat values for four plans, so the plan mapping is unclear. Limits track the file's plan, not the token owner's seat. https://developers.figma.com/docs/rest-api/rate-limits/
- Freshness: no documented propagation delay (UNVERIFIED). A forum answer reports stale style data fixed by `?version=latest`; `lastModified` complaints exist. https://forum.figma.com/ask-the-community-7/http-api-returned-not-updated-styles-data-38080 , https://forum.figma.com/ask-the-community-7/file-last-modified-not-updating-34019 . Polling tools use `GET /v1/files/:key?depth=1` and compare `lastModified` (https://kestra.io/plugins/plugin-figma/triggers/io.kestra.plugin.figma.triggers.fileupdated).
- Auth: PAT (acts as its creator, for scripts/local tools) or OAuth app (recommended, per user, per app limits); scopes like `file_content:read`, `file_variables:read`. https://developers.figma.com/docs/rest-api/authentication/ . PAT expiry and header name not on that page: UNVERIFIED.

### Webhooks V2
- Events: PING, FILE_UPDATE ("within 30 minutes of editing inactivity"), FILE_DELETE, FILE_VERSION_UPDATE (a *named* version created by a user), LIBRARY_PUBLISH (split per asset type), FILE_COMMENT, DEV_MODE_STATUS_UPDATE. https://developers.figma.com/docs/rest-api/webhooks-events/
- Limits: 3 per file, 5 per folder, 20 per team; file-context totals Pro 150 / Org 300 / Enterprise 600; API only (no UI); retries after 5 min, 30 min, 3 h; needs a public HTTPS endpoint. https://developers.figma.com/docs/rest-api/webhooks/
- Reliability: forum reports of FILE_UPDATE not firing, FILE_VERSION_UPDATE hours late, and a May 2026 report of POST /v2/webhooks timing out (504). https://forum.figma.com/ask-the-community-7/file-updated-webhook-doesn-t-trigger-on-file-edits-but-file-commented-works-47856 , https://forum.figma.com/report-a-problem-6/post-v2-webhooks-does-not-respond-timeout-54347 . Conclusion: webhooks are unfit for live preview.

### Figma MCP server (Dev Mode MCP)
- Remote `https://mcp.figma.com/mcp` (recommended, only one that writes to canvas, writing is free in beta then usage-based); desktop server needs a Dev or Full seat on Pro/Education/Org/Gov/Enterprise. https://developers.figma.com/docs/figma-mcp-server/
- Tools: `get_design_context` (code and context for a selection), `get_metadata` (XML outline), `get_variable_defs`, `get_screenshot`, `get_code_connect_map`, `add_code_connect_map`, `search_design_system`, `get_libraries`, `download_assets` (20 nodes/call), `get_motion_context`, `use_figma` (general read/write via JS), `generate_figma_design`, `html_to_figma`, `upload_assets`, prompt `create_design_system_rules`. https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- It is request/response on a selection for an agent. No subscription or push. Rate limits are on a separate page, not read: UNVERIFIED.

### Code Connect, Make, widgets
- Code Connect: maps design components to code snippets shown in Dev Mode and fed to MCP; Dev/Full seat on Pro/Org/Enterprise (Pro: one library, one framework); "template files" (`*.figma.ts`) work with any language/framework; legacy integrations for React/RN, HTML, SwiftUI, Compose. https://developers.figma.com/docs/code-connect/ . A Zinc template is plausible but paid-plan only.
- Figma Make: prompt-to-app (React + Tailwind per a forum thread, not official); no official facts on plan/export found: UNVERIFIED. https://forum.figma.com/ask-the-community-7/is-figma-make-instructed-to-give-output-in-react-and-tailwind-only-41837
- Widgets: canvas objects with multiplayer synced state, React-like; not a design-data export path, irrelevant here. https://developers.figma.com/docs/widgets

## 2. Existing tools and how they handle the file

| Tool | Auto layout | Variants / components | Tokens | Hygiene stance | Source |
|---|---|---|---|---|---|
| Figma Dev Mode codegen / Code Connect | CSS-ish snippets | Code Connect maps instance + props to your component | `get_variable_defs` | Good file => better MCP output; no score | sections above |
| Locofy | Flexbox, px or relative units | Components and props tagging | Design-tokens option | Docs: use auto layout, avoid fixed heights and overlaps, name layers `component/element`, identical structure for repeated cards, hide not delete optional parts; tagging by layer name is web-only, not RN | https://www.locofy.ai/docs/optimise-design/ , https://www.locofy.ai/docs/plugin/examples/tutorials/design-best-practices/ , https://www.locofy.ai/docs/classic/tagging/auto-tagging-by-layer-name |
| Anima | Auto layout => CSS flex; none => weak responsiveness | Variants and props => stateful React | n/a found | Layer names become component and class names, delete hidden layers, text auto-width/height, "Frame 427" is bad | https://support.animaapp.com/en/articles/6300035-figma-best-practices |
| Builder.io Visual Copilot | Auto layout "best way to import well" | Matches by component name, variant property names and values, structure to code components | recommended | Names must align with code; mark complex art as export image | https://builder.io/c/docs/figma-efficiency , https://builder.io/c/docs/builder-code-design-system-intelligence-best-practices |
| Framer (Figma paste plugin) | Maps to Stacks; wrap gap unconfirmed | n/a | n/a | Name layers, import small sections; official mapping rules not found: UNVERIFIED | https://www.framer.com/community/marketplace/plugins/549/ |
| Tokens Studio | n/a | n/a | Token sets and themes (themes = Pro); sync to GitHub/GitLab/Bitbucket/Azure/URL; imports and exports Figma variables and styles | Tokens live outside Figma, so they work on any plan | https://docs.tokens.studio/ |
| Style Dictionary | n/a | n/a | v4 first-class DTCG; 2025.10 format not fully supported until v5; custom formats/hooks | Build step from tokens JSON to any platform | https://styledictionary.com/info/dtcg/ |
| DTCG format | n/a | n/a | `$type`/`$value`, aliases `{a.b}`, `.tokens.json`; spec is a Community Group draft, not a W3C Standard; mode/resolver section not read | Open, vendor-neutral target | https://www.designtokens.org/tr/drafts/format/ |
| Penpot | Flex layout (third-party descriptions; grid claim unconfirmed) | Components; simpler variants | Native tokens | Open source, self-host, open API, plugin system, MCP (third-party listings) | https://www.techradar.com/pro/penpot-review (secondary) |
| Rive | n/a (own authoring) | State machines | Data binding replaces legacy inputs | Not a Figma importer (no Figma integration found) | https://rive.app/docs/runtimes/react-native/data-binding.md |
| Expo / RN Fast Refresh | n/a | n/a | n/a | Keeps `useState`/`useRef` for function components; effects always re-run; resets state if a module exports non-components or a class is involved; `// @refresh reset` | https://reactnative.dev/docs/fast-refresh |
| Expo Go / dev build | Dev server `npx expo start`; QR scan flow page not fetched | | | Model for the workflow | https://docs.expo.dev/get-started/set-up-your-environment/ |

Storybook: not researched (no source fetched); treat as an idea for a variants gallery, UNVERIFIED.

Pattern across the commercial tools: all say the same thing (auto layout, real names, components with variant properties, tokens) and none publishes a score. Quality shows up as worse output, or in Locofy/Builder, as advice in docs.

## 3. Mapping rules and heuristics (design proposal, built from the facts above)

Auto layout to Yoga/Zinc flexbox:
- `layoutMode` H/V => `flexDirection` row/column; `layoutWrap=WRAP` => `flexWrap`; `itemSpacing` => `gap` (main), `counterAxisSpacing` => cross gap (`rowGap`/`columnGap`); padding => padding.
- `primaryAxisAlignItems` MIN/CENTER/MAX/SPACE_BETWEEN => `justifyContent`; `counterAxisAlignItems` => `alignItems` (BASELINE exists on horizontal) (names from the Plugin API; not fetched this run, VERIFY).
- Sizing per axis: FIXED => width/height px; HUG => no size (content), `flexShrink` as needed; FILL on the main axis => `flex: 1` (flexGrow 1, basis 0), FILL on the cross axis => `alignSelf: stretch`. `layoutSizing*` is documented as a shorthand over `layoutGrow`/`layoutAlign`/sizing modes (source above), so read the shorthand.
- `layoutPositioning=ABSOLUTE` child => `position: absolute` with its constraints as insets. `minWidth/maxWidth/minHeight/maxHeight` map 1:1 (property names not confirmed from a page: VERIFY).
- Without auto layout: constraints (MIN/MAX/CENTER/STRETCH/SCALE) => anchored absolute layout (left/right/top/bottom/center/percent). SCALE has no flexbox equivalent: use percent.
- Text: `textAutoResize` WIDTH_AND_HEIGHT => hug; HEIGHT => fixed width, auto height; NONE/TRUNCATE => fixed box + `numberOfLines` (enum not confirmed: VERIFY). Text metrics differ between Figma and Zinc's shaper, so fixed-width text must be tested for wrapping parity.

Components:
- Component set => one Zinc component; VARIANT property => union-of-strings prop (`variant: 'primary' | 'secondary'`); BOOLEAN => `boolean` prop controlling visibility of a layer; TEXT => `string` prop bound to a text node; INSTANCE_SWAP => `children`/slot prop typed by component key. Instance overrides become props passed at the call site.
- Prototype `CHANGE_TO` and hover/pressed variants => component state mapping (`Pressable` states) when the variant property is named `State` with values Default/Hover/Pressed/Disabled/Focused (naming convention to adopt, not a Figma rule).

Variables and modes:
- Collection => token group; variable `/`-separated path => dotted token path; COLOR/FLOAT/STRING/BOOLEAN => color/number|dimension/string/boolean; aliases preserved as references; modes => themes (collection with modes Light/Dark => `theme` switch). `SET_VARIABLE_MODE` reaction => runtime theme switch. Emit DTCG then a small mapper to Zinc tokens/Tailwind-like classes.
- Bound variable on a node (`boundVariables`) => emit the token reference, never the literal. Literal (unbound) values => emit literal and count as a hygiene warning.
- Styles: paint/text/effect styles are the fallback for tokens on plans without enough modes (Pro 10 modes is enough for light/dark/brand variants; REST access to variables needs Enterprise, the plugin does not).

Naming: PascalCase components (strip `/`, spaces, symbols, leading digits; `Button/Primary` => `Button` + variant), camelCase props (property names have a `#id` suffix in `componentProperties`: strip it, VERIFY), token names from variable paths; collisions get a numeric suffix recorded in plugin data so ids stay stable.

Design-system vs ad hoc: treat a frame as a library component when it is a main component or instance of one with a published `key`; ad hoc frames become anonymous layout `View`s. Library presence via `get_libraries`/`teamLibrary` (names from sources above).

Hygiene lint (proposed rules, severity => score weight):
1. Default names (`Frame 123`, `Group 4`, `Rectangle 1`) on non-leaf nodes.
2. Frames with children but no auto layout (and no constraints set).
3. Detached instances: frame whose name equals a component's name but is not an instance (heuristic).
4. Hard-coded colours/numbers where a variable or style exists (unbound fills, text without style).
5. Magic numbers: spacing values not on the token scale or a 4/8 grid.
6. Variant property names outside a known vocabulary (`Property 1`), or components with a single unnamed variant.
7. Overlapping siblings in an auto layout parent; hidden layers; empty frames; fixed heights on text containers (all echoed by Locofy/Anima/Builder docs above).
8. Missing prototype interaction targets, unreachable frames.
Signal to the designer: a plugin panel with a score and clickable list (selecting the offending layer via `figma.currentPage.selection`), plus a diagnostic list in the Zinc app overlay. No existing tool does this (UNVERIFIED claim that none do; none found).

## 4. Round-trip and incremental update

- Stable ids: node `id` is stable inside a file for a node's life; a copy-paste or detach gives a new id. Components have a `key` stable across files; styles and variables have keys (published). Duplicating a file changes node ids: UNVERIFIED, test. Store our own durable id with `setSharedPluginData` (namespace `zinc`) so a renamed or moved layer keeps its identity; REST can read it with `plugin_data=shared`.
- Diff and patch: plugin keeps a last-sent snapshot per node (hash of serialised props); on `documentchange` it resolves the changed node ids, re-serialises only those subtrees (plus their parents for layout) and sends `{op: upsert|remove, id, parent, index, props}`. For changes the event misses (instance sublayers after a main-component edit, style-driven changes) re-serialise affected instances on `stylechange` or on a debounced rescan of the page. Zinc runtime keeps nodes keyed by id and patches props/children so component state (scroll, focus, inputs) survives, like Fast Refresh preserving hook state (source in table). Structural changes of a component's variants remount only that subtree.
- Images/vectors: send vector as SVG via `exportAsync` `SVG_STRING` (or `geometry=paths` in REST) keyed by a content hash; image fills have an `imageHash` and can be fetched once via `GET /v1/files/:key/images` (URLs expire in 14 days) or exported as PNG; cache by hash on disk. Flatten complex boolean/effect groups to an image when the node is marked for export (Builder does the same: https://builder.io/c/docs/figma-efficiency).
- Fonts: plugin sees `fontName` and `hasMissingFont`; family/style must exist in the Zinc app (bundled or from Google Fonts). Font licensing (Google Fonts are open licences, custom fonts are the customer's licence, do not redistribute): general knowledge, not fetched, UNVERIFIED here. The `fontName` doc page returned 404.
- Performance: without `documentAccess: "dynamic-page"` the full document loads (widget docs report 20-30 s on large files, https://developers.figma.com/docs/widgets/api/api-reference ... see search summary; plugin equivalent UNVERIFIED). Use dynamic-page plus `loadAllPagesAsync` only when needed; limit live scope to the selected frame or page; REST `depth` and `ids` limit payloads; the 32 MP export cap applies. Max file size: UNVERIFIED.

## 5. Security and licence

- Developer Terms: Figma owns the Developer Resources and derived service data; you keep your integration; license limited to what is necessary to develop, test and support an integration; Figma can add rate limits with 30 days' notice; a public integration that processes integration data needs user consent and a privacy policy naming you as responsible. https://www.figma.com/legal/developer-terms/ (page truncated: caching and ML-training clauses NOT seen, UNVERIFIED; read the full text before shipping a hosted service).
- The design is the customer's IP. A local-only link (plugin to localhost) sends nothing to a Zinc cloud, which avoids most obligations. Do not log file content, do not commit PATs, keep tokens in the OS keychain, do not put a token in the exported app. Prefer OAuth for any shared tool; PAT for the local dev case (acts as the user). Figma trains AI on content by default for Starter/Pro unless an admin opts out (secondary source: https://redact.dev/blog/figma-ai-training-opt-out) which matters to the customer, not to our link.
- Export: generated code and assets belong to the design owner; vendor Figma API JSON must not be redistributed inside the Zinc package: ship the converted app, not raw API responses (inference).

## Comparison

| Approach | Live latency | Paid plan needed | Fidelity | Effort |
|---|---|---|---|---|
| (a) Plugin + local WebSocket | Sub-second to a few seconds (documentchange is batched; unmeasured) | No (Starter works; Plugin API variables had no stated restriction) | Highest: full node tree, variables, styles, SVG | Medium; designer keeps plugin open; needs to cover documentchange blind spots |
| (b) REST polling | Tier 1 limit 10-20/min at best (Dev/Full) and 20/month on View seats; plus unknown freshness; poll depth=1 then fetch nodes | Dev/Full seat for useful rate; variables need Enterprise | High, but no variables on non-Enterprise, no local state | Low |
| (c) Webhooks | FILE_UPDATE up to 30 min after inactivity; reports of lateness | Pro+ (150 file webhooks), public endpoint | n/a (notification only) | Low, but unfit |
| (d) MCP server | On demand per selection; agent-driven | Dev/Full on paid plans for desktop server; remote needs account (rate limits unread) | Good context for codegen, no stream | Low as export aid |
| (e) Dev Mode codegen plugin | On selection change | Dev Mode: Pro+ | Per-selection snippet | Low-medium, good export UI |
| (f) Tokens Studio + git + DTCG | Minutes (commit or sync) | Pro for themes | Tokens only | Low |

## Recommended architecture

1. **Figma plugin "Zinc Link"** (editorType design, `documentAccess: dynamic-page`, `devAllowedDomains` for `ws://localhost:PORT`). Main thread reads the selected frame or page, serialises to a compact Zinc design JSON (layout, style refs, variables with modes, components with property definitions, reactions, assets by hash), subscribes to `documentchange`, `stylechange`, `selectionchange`, and sends patches via the UI iframe WebSocket. Runs the hygiene lint in the panel.
2. **Local link** inside `zinc dev` (already a watch + DevTools server): a WebSocket endpoint plus a pairing code, shown as a QR code/URL like Expo; device apps connect to the same dev server over LAN, so a phone or board shows the design live. Never expose beyond LAN by default.
3. **Zinc live preview**: a design runtime that builds the node tree from the JSON, maps to the real UI toolkit (View/Text/Image, Yoga), keyed patches preserving state, themes switched from variable modes, prototype reactions wired to a tiny navigation/overlay/animation state machine. Same JSON also feeds Zinc hot reload so hand-written components can replace design components by name.
4. **Export** (the same JSON, offline, no Figma needed afterwards): generate TSX with `className` classes (capitalised components, per the Zinc rules), a DTCG tokens file converted by a Style Dictionary-style step to the Zinc theme, `assets/` by hash, and a `figma-map.json` of stable ids. Optional Code Connect template and `.figma.ts` for Dev Mode snippets for paid teams.
5. **Fallback modes**: REST (`GET file` with PAT) for CI or when the plugin is not running; DTCG import from Tokens Studio or a Penpot file for teams without Enterprise variables REST.

## 8 riskiest unknowns to test first

1. Real `documentchange` latency and coalescing while dragging, typing, and in a large file (target under 500 ms).
2. Coverage gaps of `documentchange` (instance sublayers after main edits, style-driven changes) and whether `nodechange` fills them.
3. Does a plugin using `ws://localhost` pass in both Figma desktop and browser, and survive Community publishing review (`devAllowedDomains` vs `allowedDomains` + `reasoning`)? Also Safari/browser mixed-content blocks.
4. Stability of ids across copy/paste, duplicate file, detach, publish and library update; viability of shared plugin data as the durable id.
5. Exactness of auto layout to Yoga: HUG/FILL combos, min/max, wrap with counter-axis spacing, absolute children, text wrapping parity (Figma vs Zinc text shaper), strokes inside/outside, clip content, rounding of fractional sizes.
6. Variables and modes coverage: aliases, mode switching at runtime, variable-bound strokes/effects/text, extended collections (Enterprise), and what the Plugin API returns for remote library variables.
7. Prototype semantics: smart animate matching rules (by layer name), overlays, scroll-to, conditionals and variable actions; trigger/transition enums to confirm; how much to implement.
8. Assets and fonts at scale: SVG fidelity of complex vectors/effects (blur, shadows, blend modes), image-hash caching, missing custom fonts and their licences, and payload size of a 5,000-node file.

Not verified at all this run: Figma Make details, MCP rate limits, PAT expiry, Storybook, Penpot primary docs, Framer mapping rules, `nodechange` payload, developer-terms caching/AI clauses, font-licence rules.
