# zinc:markdown

Markdown parsed by [md4c](https://github.com/mity/md4c) 0.6.0 (MIT, vendored in `plugins/markdown/vendor/md4c` with its `PIN`):
CommonMark, with GitHub's tables, task lists, strikethrough and autolinks by default. The result is a tree that mirrors md4c's
callbacks; a program lays it out as it likes (`app/markdown` pages it for e-paper).

```ts
import * as md from 'zinc:markdown';

const doc = md.parse(fs.readText('notes.md'));          // a DOC node; md.parse(src, md.GITHUB | md.FLAG_WIKILINKS) for another dialect
for (const b of doc.children) {
  if (b.kind === md.H) console.log('#'.repeat(b.level) + ' ' + md.textOf(b));
  if (b.kind === md.UL) for (const li of b.children) if (li.task >= 0) console.log(li.task === 1 ? 'done' : 'open', md.textOf(li));
}
const ticked = md.setTask(src, li.taskOffset, true);    // the source with that item's '[ ]' made '[x]', nothing else changed
```

- **Blocks** (`n.isBlock()`): `DOC`, `P`, `H` (`level` 1..6), `UL`, `OL` (`level` = the first number), `LI` (`task` -1, 0 or 1 and
  `taskOffset`), `QUOTE`, `CODE` (`lang`; its text is a `T_CODE` child), `HR`, `HTML`, `TABLE` > `THEAD`/`TBODY` > `TR` > `TH`/`TD` (`align`
  0 default, 1 left, 2 centre, 3 right). A tight list item holds its inline content directly, a loose one paragraphs.
- **Spans** (`n.isSpan()`): `EM`, `STRONG`, `LINK` (`href`, `title`), `IMG` (`href` = the source, its alt text as children), `CODE_SPAN`,
  `DEL`, `WIKILINK`, `UNDERLINE` (with their flags).
- **Texts** (`n.isText()`, `n.text`): `T_NORMAL` (entities decoded, soft breaks as spaces), `T_BR` (a hard break, `'\n'`), `T_CODE`, `T_HTML`.
- `textOf(n)`: the text under a node. `version()`: md4c's.

Native code: `native/markdown.host.cpp` writes md4c's events as one string that `index.ts` reads back (one boundary crossing per
document). Targets: macOS, Linux (and the reMarkable's prebuilt), Windows, `rmpp`. No web or ESP32 build yet.
