---
id: ZN-905
title: 'examples/discord: JSON themes (Slack and Teams included) and code blocks'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 23:05'
updated_date: '2026-10-30 23:25'
labels:
  - ui
  - size-M
milestone: m-28
dependencies: []
ordinal: 599460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: themes as plain JSON files (colours, radii, fonts, density) loaded from a folder and chosen in Settings, documented so anyone can write one; ship Discord dark/light plus a Slack theme and a Teams theme for fun. Code: syntax-highlighted code blocks in messages (a proven highlighter), copy button, and a way to insert a code block from the composer with a language.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. Themes: JSON files in examples/discord/assets/themes (discord-dark, discord-light, slack, teams; theme.schema.json documents them) plus the user's <data dir>/themes (same name replaces a shipped one), chosen in Settings > Appearance (Reload button, parse errors shown), kept in zinc:storage. Tokens: 25 colours as scheme variables --dc-* (constants.ts classes and the components' former hex literals point at them; CallView and status colours left as they were), radius, font, textSize, density (compact rows). Engine gap fixed: lib/std/ui.ts defineScheme on the scheme shown now restyles at once (needed to switch between two themes of the same base); regression check in tests/golden/ui-runs (restyled 1). Code blocks (owner change 2026-10-31): no highlighter here; components/CodeBlock.tsx is the one place a code block is drawn (language + Copy), where zinc:editor's read-only highlighted view plugs in when the editor extraction lands. Composer: the <> button (CodeInsert.tsx) inserts a fenced block with a chosen language, caret on its empty line. Proof: tests/t1/discord.sh logs the themes found, its last frame is the Appearance pane, the showcase frame shows a ts code block with Copy; Slack and Teams frames checked by hand. Not proven: live switching on the main tree binary until ui.ts is integrated (it reads lib/std of its own tree).
<!-- SECTION:NOTES:END -->
