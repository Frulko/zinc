---
id: ZN-766
title: 'Agents example: markdown answers, selection and copy, dropped files as references'
status: Done
assignee: []
created_date: '2026-10-20 08:39'
updated_date: '2026-10-20 08:39'
labels:
  - examples
  - desktop
  - ui
  - size-M
milestone: m-16
dependencies:
  - ZN-765
ordinal: 500420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-20): in examples/agents, draw the agents' answers as markdown, let any part of an answer be selected and copied, put a copy button on each answer, and take files, images and folders dropped on the window as references the way Claude Code and Codex write them, passed to each CLI the way it really expects them. Markdown inside one selectable text needs style runs in a zinc:ui text node, which it did not have.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc:ui setTextRuns(h, runs) styles parts of one text node (bold, italic, mono, underline, a colour or a scheme variable through schemeColor): the lines wrap with each run in its face and the text still selects and copies as one; tests/golden/ui-runs and tests/t1/ui_runs.sh; docs/ui.md
- [x] #2 A finished paragraph is drawn as markdown (headings, nested and numbered lists, bold, italic, inline code, links, quotes, rules, fenced code under its language, tables) from its 16 KB head; examples/agents/tests/markdown.test.ts
- [x] #3 Messages, paragraphs, code blocks, tool inputs and outputs are select-text; a selection copies with Cmd+C
- [x] #4 A copy icon on each answer's header copies its markdown source, read back from disk when it was spilled, with a Copy / Copied tooltip; a code block's icon copies its code
- [x] #5 A drop (zinc:system 'drop') adds a chip with a remove button and a reference to the draft: [Image #N], @relative or @absolute path, @folder/; typing @ lists the folder's matching files (arrows, Enter or Tab, click)
- [x] #6 Claude gets @path in its prompt (images too), Codex -i per image then -- and the prompt, opencode -f per file or image; checked on the real CLIs read-only; examples/agents/tests/attach.test.ts covers references and arguments
- [x] #7 next/tests/t1/agents_markdown.sh: drops, chips and their removal, the markdown drawn, copy of an answer and of a code block, a selection copied, the @ list, Claude's arguments; agents_chat and agents_memory still pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Drops needed no engine work: zinc:system already delivers a window drop as an event with the path (a text drop adds 'text'), and ZINC_SYSTEM_SCRIPT scripts it headless. Found on the way, not fixed: a runtime error inside a zinc:system event handler (an index out of bounds) ends the program silently with exit code 0 in the interpreter, where the same error in a frame callback prints "runtime error" and exits 1.

Checked on the real CLIs on 2026-10-20, read-only, in a temporary folder: Claude Code 2.1.304 resolves @file, @image, @folder/ and @"a b/c.ts" in a -p prompt; codex-cli 0.162.1 reads -i image on exec and on exec resume, and reads @file / lists @folder/ with its shell tools; opencode 2.0.32 attaches -f image and -f file and lists @folder/ with its read tool. Not tried: an absolute @path outside the folder in read-only mode, several images in one turn.
<!-- SECTION:NOTES:END -->
