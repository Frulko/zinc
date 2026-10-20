---
id: ZN-768
title: 'Agents example: model picker search, OpenCode Go models and usage'
status: Done
assignee: []
created_date: '2026-10-20 12:00'
updated_date: '2026-10-20 12:00'
labels:
  - examples
  - desktop
  - ui
  - size-M
milestone: m-16
dependencies:
  - ZN-767
ordinal: 500440
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-20): in examples/agents, support OpenCode Go (opencode's subscription) and its usage, as far as the opencode CLI exposes it without a credential file, a keychain item, a token or a provider API call; and turn the model menu into a searchable select (combobox) for the three CLIs: a field that filters as you type (case and accents aside, anywhere in the id and label), the list below with ↑/↓, Enter, Esc, Tab and the mouse, the current choice shown when closed, "Default" kept, grouped by provider when the CLI has several, with context window or price hints.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 opencode's models come from its local server (`opencode api GET /api/model` and `/api/provider`), grouped under the providers' names, with their context window, price per million in and out or "free", their variants as the effort (`--model provider/model#variant`); `opencode models` stays the fallback
- [x] #2 An opencode turn's tokens and cost, by model, come from its session's messages once it ends (`opencode api GET /api/session/<id>/message`, a local read), as the stream has no step_finish for the last step
- [x] #3 OpenCode Go's plan limits are "unknown" with a link to opencode.ai/console (Agents panel; the status bar's hover names it): no command or route of opencode 2.0.32 gives them
- [x] #4 A provider's refusal (`{"type":"error","error":{"type":…,"message":…}}`) shows its message
- [x] #5 The model menu is a combobox for the three CLIs: filters as typed (case and accents aside, every word, in id, label or provider), ↑/↓ wrap and skip headings, Enter or Tab picks, Esc closes, a click picks, "Default" first, headings only with several providers, the highlighted row kept in view
- [x] #6 Every CLI runs with PWD set to its folder: opencode takes its project folder from PWD and ran where the app was started
- [x] #7 Unit tests (examples/agents/tests/pick.test.ts, usage.test.ts on fixtures of the real opencode 2.0.32); agents_chat types in the picker, picks by keys, checks the model and variant reach --model, the turn's cost, the console link and PWD; agents_usage, agents_markdown, agents_memory and host pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checked on the real opencode 2.0.32 on 2026-10-20, read-only, in a temporary folder: 77 models (44 `opencode`, 29 `opencode-go`, 4 `lmstudio`); the server's OpenAPI document has no usage, quota, plan or billing route; opencode.ai/docs/go says Go's limits are dollar amounts over 5 hours (20 %), a week (50 %) and a month (100 % of a monthly limit) and that usage shows in the console only (asked for in anomalyco/opencode#31084, closed as a duplicate). A Go turn: step_start and text but no step_finish; the session's messages give its cost and tokens. One Go model failed with "This Go model requires Global regions" (workspace privacy settings).

Ceilings (ponytail notes): the session's messages are read from their first page only (newest first); the picker folds the accents of Latin letters only (String.normalize('NFD') when the engine has it).

Suggestion, not done: the picker (services/pick.ts and ModelPicker in SettingsBar.tsx) could become a Combobox in lib/std (kit), themed by the kit's variables; nuxt's Select has no search.
<!-- SECTION:NOTES:END -->
