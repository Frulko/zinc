# editor: a code editor for Zinc apps (`zinc:editor`, `zinc:command-palette`, `zinc:editor-lsp`)

The code editor of Zinc Atelier, as three plugins any app can import. Atelier and `examples/zed-editor` are built on them; `examples/discord` shows its
code blocks with `CodeView`. All three are Zinc code on `zinc:ui`: they run on the interpreter, in a `zinc build` program, on QuickJS and in a web export.

| Plugin | What it holds |
|---|---|
| `zinc:editor` | the document model, the editing commands on several selections with undo and redo, syntax highlighting with a language registry, the theme tokens and four themes, the views `CodeEditor`, `Minimap` and `CodeView` |
| `zinc:command-palette` | fuzzy matching in the manner of Zed's finder, and the floating `<Palette>` with its query field |
| `zinc:editor-lsp` | a language server client (`zinc lsp`, or any server speaking LSP over stdio): completion, signature help, hover, definition, diagnostics, and the cards that show them |

## A snippet: `CodeView`

```tsx
import { CodeView } from 'zinc:editor';

<CodeView code={source} lang="ts" />                       // highlighted, selectable, as tall as its lines
<CodeView code={json} lang="json" lineNumbers className="text-[12px] leading-[18] px-2 py-1 rounded-lg" />
```

`lang` is a language name or a file extension (`ts`, `tsx`, `js`, `json`, `css`, `md`...); an unknown one is plain text. Colours follow `theme()`.

## An editor: `EditorState` and `CodeEditor`

```tsx
import { EditorState, CodeEditor, stepEditor, stepCursors, drawCursors, langOf } from 'zinc:editor';

const file = new EditorState('main.ts', text, langOf('main.ts'));
<View className="grow">
  <CodeEditor state={file} visible={() => true} onEscape={() => closeFind()} />
  <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawCursors(file, x, y, w, h)} />
</View>
// once a frame, with the active editor: follow the field, rebuild the decorations (search matches: their offsets, the query's length, the current one)
stepCursors(file);
stepEditor(file, [], 0, -1);
```

- **`EditorState`** holds the text (`text()`, a signal), its `Doc`, the selections (`sels`: flat `[anchor, head, ...]`, `main`), the undo `History` and the
  `diagnostics` drawn under the text. An app's own buffer extends it (a path, a saved text, a tab name). `edited(state, text)` replaces the text as an
  edit; `setOnEdited(f)` hears every edit the user makes.
- **`CodeEditor`** props: `state`, `visible`, `className` (size, line height and padding classes: `EDITOR_CLASSES` by default, 14 px mono on 21 px lines),
  `padLeft`, `padTop`, `fontPx` (what those classes give, for the other carets and the name under the pointer), `wrap`, `onKey` (the app's keys first:
  return true when taken), `onEscape`.
- **Keys** (cursors.ts): Tab and Shift+Tab indent, Enter keeps the indent, brackets and quotes close themselves, ⌘/ comments, ⌘D selects the next
  occurrence, ⌘⌥↑↓ add a cursor, ⌥↑↓ move lines, ⌘⇧D duplicates, ⌘⇧K deletes lines, ⌘Z / ⌘⇧Z undo and redo every cursor's edit at once, Alt+click adds a
  cursor. `editCommand(state, id)` runs one from a menu or a palette (`comment`, `indent`, `outdent`, `select-next`, `cursor-above`, `cursor-below`,
  `line-up`, `line-down`, `line-duplicate`, `line-delete`, `undo`, `redo`). On macOS, with a desktop menu that owns the shortcuts, `setMenuKeys(true)`
  leaves them to it, and `menuKey` / `stepMenuKeys` replay the Edit menu's standard items.
- **`Minimap`** (`editor`, `visible`): the coloured outline of the file, drag to scroll. **`caretInfo()`**: line, column, selected characters and cursors
  of the active editor, for a status line.
- **The edit functions** (edit.ts) are plain functions from `(text, selections)` to `(text, selections)`: `typeText`, `paste`, `erase`, `newline`,
  `indent`, `toggleComment`, `selectNext`, `addCursorV`, `move`, `moveLines`... They need no window; a test calls them directly.

## Languages

```ts
import { registerLanguage, pushRun, T_KEYWORD, T_STRING, T_COMMENT, S_NORMAL } from 'zinc:editor';

const INI = registerLanguage('INI', ['ini', 'cfg'], (line: string, state: i32, out: i32[]): i32 => {
  if (line.startsWith(';')) { pushRun(out, line.length, T_COMMENT); return S_NORMAL; }
  const eq = line.indexOf('=');
  if (eq < 0) { pushRun(out, line.length, T_KEYWORD); return S_NORMAL; }
  pushRun(out, eq + 1, T_KEYWORD); pushRun(out, line.length - eq - 1, T_STRING);
  return S_NORMAL;
});
```

A tokenizer turns one line into runs `[length, token, ...]` and returns the state the next line starts in (inside a block comment, a template string, a
fenced block), so constructs that span lines are coloured right. Built in: TypeScript / TSX / JavaScript, JSON, Markdown, CSS. `langOf(path)` and
`langNamed('ts')` find a language; `langLabel(path)` is its name for a status bar.

## Themes

`Theme` has one 0xRRGGBB colour per surface (`chrome`, `bg`, `surface`, `elevated`, borders, texts, `accent`...), per decoration of the editor (current
line, selection, caret, matches, brackets, minimap) and per token kind (`keyword`, `string`, `number`, `comment`, `fn`, `type`...), and the eight ANSI
colours of a console. Four come with the plugin: `LIGHT` and `DARK` (Atelier's, after macOS), `ONE_LIGHT` and `ONE_DARK` (Zed's). `theme()` is the signal every view
follows; `useThemes(light, dark, startDark)` sets the pair `toggleTheme()` switches between. `bg(c)`, `fg(c)`, `bd(c)` make classes of a colour, `mix`
blends two.

## The palette: `zinc:command-palette`

```tsx
import { Palette, PaletteItem, fuzzy, ranked } from 'zinc:command-palette';

function rows(q: string): PaletteItem[] {
  const out: PaletteItem[] = [];
  for (const c of COMMANDS) {
    const it = new PaletteItem(c.name, '', c.keys, '', c.run);
    const m = fuzzy(q, c.name, 0);
    if (q !== '' && m === null) continue;
    if (m !== null) { it.score = m.score; it.labelHits = m.hits; }
    out.push(it);
  }
  return ranked(out, q, 60);
}
<Palette mode={() => mode()} progress={() => openT.get()} items={rows} onClose={close} focus={(h: i32) => focusLater(h)}
  placeholder={() => 'Execute a command…'} empty={() => 'No matches'} />
```

`mode` is what the palette lists (-1: closed; a change resets the query); `progress` (0 to 1) fades and grows the panel in. Optional: `kbd` (the
shortcut chip), `icon` (draws a row's icon when it has a path), `onKey`, `dense` (Zed's 30 px rows). `fuzzy(query, text, nameFrom)` scores word starts,
runs and the file name (from `nameFrom`) higher; `hits` are the matched positions, `segments(text, hits)` cuts the text for drawing.

## The language server: `zinc:editor-lsp`

```ts
import { useLsp, LspConfig, stepLsp, stopLsp, Popup, Signature, Hover, stepAssist } from 'zinc:editor-lsp';

const lsp = new LspConfig();
lsp.buffers = () => openFiles();                  // EditorStates; their path names the document
lsp.active = () => activeFile();
lsp.root = () => projectDir();                    // '' : no server
lsp.spawn = (dir: string) => proc.spawn('zinc', ['lsp'], { cwd: dir });
lsp.go = (path: string, line: i32, col: i32) => openAt(path, line, col);
lsp.say = (what: string, name: string) => status(what);   // 'stopped', 'no-definition', 'outside'
useLsp(lsp);                                      // also plugs completion keys and hover into the editor
// once a frame: stepLsp(dt); stepAssist(activeFile()); and <Popup />, <Signature />, <Hover /> over the editors
```

The client opens every code editor in the server, sends the whole text when typing pauses or a request needs it, and never waits: an answer that comes
after a newer request of its kind is dropped. Completion opens on the start of a name, after a dot and in an import's quotes; Enter or Tab accept at
every cursor. The protocol itself (`frame`, `Reader`, `uriOf`, `itemsOf`, `filterItems`, `sigOf`, `hoverOf`, `problemsOf`, `placeOf`) is plain
functions. It needs `zinc:process`: desktop targets only.

## On the web

On a web build (`zinc export --target web`, `zinc dev --target web`) the editor is the same `<TextArea>` of zinc:ui, drawn by Zinc, in both render
modes. With the canvas render the whole page is drawn that way. With `--render dom`, a field with line numbers, highlighting or marks (`CodeEditor`,
`CodeView`) is not a browser `<textarea>`, which could only show plain text: the page draws it on a canvas of its box, and one hidden `<textarea>` placed
at the caret holds the focus. Keys, typed text, IME composition, dead keys and paste go through it to zinc:ui's own editing, and clicks, drags and the
wheel go to zinc:ui's pointer input, so selections, several cursors and undo work as on the desktop, without a browser focus ring. This is how Monaco
and Google Docs take text. Other text fields stay native elements.
