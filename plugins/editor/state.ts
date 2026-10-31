// What one code editor holds: the text (a signal) and its Doc (lines, highlight tokens), the selections (several: edit.ts)
// and the undo history, the diagnostics drawn under the text, and the node of its text field. An app's own buffer (a file
// with a path, a saved text) extends it. The editor's controller (cursors.ts) and view (view.tsx) take one of these.
import { createSignal, NodeRef } from 'zinc:ui/solid';
import { Doc } from './document';
import { History } from './edit';

export class Diagnostic {
  line: i32; col: i32; severity: i32; message: string;   // 0-based line / column; severity 1 error, 2 warning
  constructor(line: i32, col: i32, severity: i32, message: string) { this.line = line; this.col = col; this.severity = severity; this.message = message; }
}

export class EditorState {
  /** The file it shows ('' for none): the language server finds the document by it. */
  path: string;
  doc: Doc;
  text: () => string; setText: (v: string) => void;
  diagnostics: () => Diagnostic[]; setDiagnostics: (v: Diagnostic[]) => void;
  ref: NodeRef = new NodeRef();   // the text field (each editor keeps its own: caret, scroll)
  // the selections (flat [anchor, head...], see edit.ts) and the undo history; the text field shows the main one
  sels: i32[] = [0, 0]; main: i32 = 0;
  hist: History = new History();
  goal: i32[] = [];   // the columns the cursors aim at while they move up and down (edit.ts move)
  addNext: boolean = false; dragAdd: boolean = false; collapse: boolean = false;   // what the next pointer-made selection does
  // where the text starts in the field and the font size (view.tsx sets them from its props): the other carets, the name under the pointer
  padLeft: number = 14; padTop: number = 10; fontPx: () => number = (): number => 14;
  constructor(path: string, text: string, lang: i32) {
    this.path = path;
    this.doc = new Doc(lang);
    this.doc.setText(text);
    const [a, sa] = createSignal<string>(text); this.text = a; this.setText = sa;
    const [d, sd] = createSignal<Diagnostic[]>([]); this.diagnostics = d; this.setDiagnostics = sd;
  }
  node(): i32 { return this.ref.node; }
  /** The offset of the main caret. */
  caret(): i32 { return this.sels[2 * this.main + 1]; }
}

let onEdited: (s: EditorState) => void = (s: EditorState) => {};
/** `f` runs after every edit the user makes (the text is already set): mark a tab modified, keep a preview tab. */
export function setOnEdited(f: (s: EditorState) => void): void { onEdited = f; }
/** The text of an editor changed (typed, pasted, a command): its Doc and its signal follow. */
export function edited(s: EditorState, v: string): void { s.doc.setText(v); s.setText(v); onEdited(s); }
