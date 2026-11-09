---
id: ZN-1080
title: Accept dynamic JSX inputMode values
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 11:23'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1051
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks Inputs in examples/ui/kit-gallery (ZN-1078.06). Literal inputMode is supported, but a valid JSX expression is rejected with Z0005 unknown attribute because src/frontend/jsx.cpp only accepts lit && kInputModes.count. Preserve the component's idiomatic dynamic attribute; fix frontend lowering shared by interpreter, AOT and QuickJS, with a focused regression.

Minimal example: const mode = 'numeric'; const App = () => <Input inputMode={mode} />;

Existing native ui.fieldMode contract reported by worker: 0 text, 1 numeric, 2 decimal, 3 tel, 4 email, 5 url, 6 search. Preserve supported literal diagnostics; unknown dynamic values fall back to the native default. Handle an expression once per apply and reactive updates. Do not confuse input modality with content validation.

Research already delegated by coordinator before work: WHATWG https://html.spec.whatwg.org/multipage/interaction.html#attr-inputmode and https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#keywords-and-enumerated-attributes; React https://react.dev/reference/react-dom/components/common and https://react.dev/reference/react-dom/components/input. React documents inputMode as string; WHATWG defines enumerated keyboard hints and default handling. Useful pitfalls: expression must evaluate once, reactive change must update the hint, ordinary field type remains separate. No new dependency required.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dynamic inputMode for existing supported modes checks and runs correctly on interpreter, AOT and QuickJS without a component workaround
- [ ] #2 A narrow T0 checks initial numeric mode, reactive updates, single expression evaluation, default handling and unchanged invalid literal diagnostic
- [ ] #3 The original Inputs component with its dynamic inputMode passes zinc check and a short real gallery/component run
<!-- AC:END -->
