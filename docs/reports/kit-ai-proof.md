# Assistant controls proof (ZN-1078.18)

Base: `6b102a3d21a0b3fb803281cdacc79f925e2580d7` (includes integrated Media). The AI family and its providers stayed frozen during each proof.
The size gate's library inputs are unchanged after that run; the final gallery adds named, checked local phase
transitions, without changing its initial presentation. No engine rebuild, new parser, dependency or backend.

## Provider choices

The pinned [CUI implementation](https://github.com/yappologistic/CUI/blob/f70a1d3d095cafd67814b23bdd82c2dfba28efe0/src/cui_ai.c)
and [header](https://github.com/yappologistic/CUI/blob/f70a1d3d095cafd67814b23bdd82c2dfba28efe0/include/cui/cui.h)
were inspected before implementation, alongside APG disclosure and listbox patterns.

| Need | Existing provider | Gap filled here |
| --- | --- | --- |
| Reasoning/tool phases and folding | Neutral host ownership, Spinner, CodeBlock, JsonViewer | Explicit automatic/open/closed model, sticky user choice, elapsed/status presentation, input-keyed payload detection |
| Plan and context | Progress, ProgressRing, HoverCard | Caller-owned steps/breakdown and 80%/95% thresholds |
| Sources/citations | HoverCard, ScrollView, Button | Numbered source cards, detail activation and original-source callbacks; shortened host is only display text |
| Suggestions/model choice | Button, Select | Caller descriptors, badges/details, disabled choices and responsive row grouping |
| Composer | Native auto-growing Textarea, Select | Only `maxRows` and merged `onKeyDown` added to Textarea; controlled Enter/Shift Enter/IME/Busy Stop/attachments |
| Conversation | Avatar, CopyButton, md4c MarkdownView | Grouped bubbles and direct link/task/retry callbacks, without a transcript service |

`examples/agents` supplied consumer context only. No app-global state, filesystem access, account, networking or
model SDK entered the kit. One family module plus one pure model leaf; imports use leaf providers. The kit owns no
request lifecycle. `ComposerState` is caller-owned and read live; local gallery phases change only through checked
transition functions. Disclosure's enum changes only through its transition. Existing providers own delayed hover,
spinner, copy and native field resources; the proof unmounts an open citation and remounts fresh controls.

## Reproduced feature proof

Readonly common engine built from `7774708ca`; SHA-256 `f561c4cc76172c731e4109cd9161b5a7092ffda9553260f25351a0a1e329fce1`.
All runs set `ZINC_ROOT` to this worktree. Adjacent native AOT libraries stayed in place. Commands were serialized
through the absolute repository `tools/work-run`, bounded, headless, with no app/server left running.

`ZINC_ROOT=$PWD ZINC=<common-engine> /Users/mowmow/Lab/zinc/tools/work-run 220 sh tests/t0/kit_ai.sh`

The exact T0 runs the pure model on all three engines, then independent Solid and React renderer entry points.
It covers automatic/sticky disclosure over completion/restart, JSON/plain tool data, plan/suggestion/attachment
callbacks, disabled actions, IME composition Enter, Shift Enter, same-turn duplicate-send protection, caret after
parent rerender, native auto-grow/scroll bounds, legacy Ctrl Enter/custom key merging, model keyboard selection
skipping disabled entries, real source/disclosure/send/stop pointer input, Markdown link/task callbacks, open-overlay
unmount cleanup and fresh remount state. After-paint waits belong only to the fixture's native-action observer.

```text
AI solid --interp: ok
AI solid --native: ok
AI solid --engine quickjs: ok
AI react --interp: ok
AI react --native: ok
AI react --engine quickjs: ok
```

Final `zinc check examples/ui/kit-gallery` passed, 42 files. Seven final QuickJS gallery captures, each five frames,
were generated at 1000 px and 360 px in Quiet light/dark. Their wide/narrow layouts were visually inspected.
The gallery uses fictitious models and local sample callbacks, with every displayed action connected.

## Unchanged size gate

`ZINC_ROOT=$PWD ZINC=<common-engine> /Users/mowmow/Lab/zinc/tools/work-run 300 sh tests/t0/kit_size.sh`

Exit 0; original script and all four budgets unchanged. Raw stdout:

```text
bundle: Button 235962 B, through the index 244342 B (+8380 for 38 unused families, budget 9728), ten 281058 B (+4079 per component)
aot: Button 5325320 B, through the index 5457488 B (+132168 for 38 unused families, budget 155648), ten 6009248 B (+61306 per component)
aot, Button through the index links the plugins: editor
```

The bundle ten-minus-one delta is 36,716 B against a strict 36,864 B total (148 B margin); the per-component gate
reports integer averages. Cold launch, CPU, RSS and energy were not measured. Gate app temporaries are removed by
the original script; the retained binary hash above identifies the engine used for all proofs.

## Source and capture provenance

SHA-256 of the ordered provider manifest (`lib/std/kit` plus UI/Solid/React/selectable Markdown):
`8aa55e153500c617260c15f006f5ec37b90b6ba1a6d43600a3203691a4b38bf7`. Full manifest and command stdout are retained in `.logs/ai-source-manifest.sha256`,
`.logs/kit-ai-final.log`, `.logs/kit-ai-size.log`, and `.logs/kit-ai-*.log` in this worktree.

| Source | SHA-256 |
| --- | --- |
| `lib/std/kit/ai.tsx` | `baf46a865561b9d68bc18d2b1cbb7ef25ec8a2b9e4de4a6c1a02f0b827f5c357` |
| `lib/std/kit/ai-model.ts` | `34efe682023d881ba65092e35c6f136b9ebbcd43391ac03de6c6c7c34de60c71` |
| `lib/std/kit/input.tsx` | `b0d1dc72e1b2259e2a368c4127a7c95b489b66014725b0d8f8186f310e7d4087` |
| `lib/std/kit/index.ts` | `302d8842476ec31cf9a7f1fe5bec99925bb842ca07f4e302bafb8b69f1a11b23` |
| `tests/data/kit_ai/body.tsx` | `9d6011c47e0d21a28f5151ac29710066bf81b02f2b2c59d0f41dff27c28b4c19` |
| `tests/data/kit_ai/model.ts` | `7e90c68b1b020b1889ada5daf3890b53b58ee607376f84b43802a4f106bb02c6` |
| `tests/t0/kit_ai.sh` | `5f2e1e7a001347fe46ad4e7e288ff30be7ecccedd01cde425fe38f37986db09e` |
| `tests/t0/kit_size.sh` | `d4516f5dbd449421d4cc872afdba00acc8f07c22c3f0476498b06cf4fbc032ed` |

| Capture | SHA-256 |
| --- | --- |
| `docs/img/kit-ai-composer-dark.png` | `533b9e28d7381f504b957092a4eb461b81a2264ac9687725ec51e4c8314296be` |
| `docs/img/kit-ai-composer-narrow.png` | `11a63b38789b4cfa6a3307151ebfaa698d9731281579e3b84f850953a2ed819e` |
| `docs/img/kit-ai-composer.png` | `50da979aa9172563981f2ac2c151b0fa0530a93eb6fcc91711039d00521024ba` |
| `docs/img/kit-ai-messages-dark.png` | `6bbed39ec4af2f6f7fc9787cbfe90fbf9df84d3e9bad9fb6ab12f7a92481b723` |
| `docs/img/kit-ai-messages-narrow.png` | `f536802caeb82348c2323ca8c9bac52436cf4beb0a56c2ba6a2681764bab24a0` |
| `docs/img/kit-ai-messages.png` | `f7a449e09493f17fb23240c45a9a07e426f5b3b0d8afbfe89a52db8e7508bdad` |
| `docs/img/kit-ai-research.png` | `7f19e14c2a00d933dd068f4438509476979392e3428e3bdecede3f2d70341b84` |

## Proposed tests

- Physical macOS IME and VoiceOver walkthrough: `GALLERY=ai GALLERY_AI=composer ZINC_BACKGROUND=1 timeout 180 <common-engine> run examples/ui/kit-gallery --engine quickjs`; compose/commit in Japanese or Chinese, switch model, attach/remove, send/stop and reach citations. About 3 minutes; memory unmeasured.
- At an owner-selected UI milestone, `ZINC_BACKGROUND=1 timeout 90 <common-engine> run examples/ui/kit-gallery --native` for real keyboard/focus traversal across the complete combined gallery. About 1 minute; memory unmeasured. No suite, benchmark, pixel comparison or device pass was run here.
