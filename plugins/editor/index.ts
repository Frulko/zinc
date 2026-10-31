// zinc:editor: a code editor for Zinc apps, taken out of Atelier. The document model (Doc: lines, highlight tokens, brackets),
// the editing commands on several selections with undo (edit.ts), syntax highlighting with a language registry (syntax.ts),
// the theme tokens and four themes (theme.ts), the editor's state and controller (state.ts, cursors.ts) and its views:
// CodeEditor, Minimap, and CodeView, a read-only highlighted snippet (view.tsx). docs/plugins/editor.md.
export * from './syntax';
export * from './theme';
export * from './document';
export * from './edit';
export * from './state';
export * from './cursors';
export * from './view';
