// Colours, sizes, ports and the block types: every literal used twice.

// ---- colours (Notion's light theme)
export const COLOR_PAGE: i32 = 0xffffff;
export const COLOR_SIDEBAR: i32 = 0xf7f7f5;
export const COLOR_TEXT: i32 = 0x37352f;
export const COLOR_TEXT_SECONDARY: i32 = 0x787774;
export const COLOR_TEXT_FAINT: i32 = 0xa4a29c;
export const COLOR_HOVER: i32 = 0xebebea;
export const COLOR_BORDER: i32 = 0xe9e9e7;
export const COLOR_ACCENT: i32 = 0x2383e2;
export const COLOR_CALLOUT: i32 = 0xf1f1ef;
export const COLOR_CODE: i32 = 0xf7f6f3;
export const COLOR_LIVE: i32 = 0x0f7b6c;
export const COLOR_OFFLINE: i32 = 0xd9730d;

// ---- sizes (px)
export const SIDEBAR_WIDTH: i32 = 240;
export const PAGE_MAX_WIDTH: i32 = 720;
export const HANDLE_WIDTH: i32 = 52;     // the + and the grip left of a block
export const INDENT_STEP: i32 = 26;      // one nesting level
export const MAX_INDENT: i32 = 4;
export const MENU_WIDTH: i32 = 300;
export const MENU_ROW_HEIGHT: i32 = 46;

// ---- collaboration: the first window serves, the others join (services/sync.ts)
export const SYNC_PORT: i32 = 7311;
export const RECONNECT_DELAY_MS: i32 = 1500;
export const PEER_COLORS: i32[] = [0xe03e3e, 0x0b6e99, 0x6940a5, 0xd9730d, 0x0f7b6c, 0xad1a72];
export const PEER_NAMES: string[] = ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Ken', 'Margaret', 'Linus'];

// ---- files
export const SAVE_DELAY_S: number = 0.8;     // a page is written this long after its last change
// page icons are Lucide names (zinc:icons), listed in zinc.json since they are chosen at run time
export const PAGE_ICONS: string[] = ['file-text', 'notebook-pen', 'lightbulb', 'rocket', 'leaf', 'book-open', 'target', 'flask-conical', 'folder', 'sparkles'];

// ---- block types
export const T_TEXT = 'p', T_H1 = 'h1', T_H2 = 'h2', T_H3 = 'h3', T_BULLET = 'bullet', T_NUMBER = 'number', T_TODO = 'todo';
export const T_QUOTE = 'quote', T_CALLOUT = 'callout', T_CODE = 'code', T_DIVIDER = 'divider';

/** One entry of the slash menu. */
export class BlockKind {
  type: string; label: string; hint: string; icon: string; keywords: string;
  constructor(type: string, label: string, hint: string, icon: string, keywords: string) {
    this.type = type; this.label = label; this.hint = hint; this.icon = icon; this.keywords = keywords;
  }
}
export const BLOCK_KINDS: BlockKind[] = [
  new BlockKind(T_TEXT, 'Text', 'Just start writing with plain text.', 'type', 'text paragraph plain'),
  new BlockKind(T_H1, 'Heading 1', 'Big section heading.', 'heading-1', 'heading h1 title #'),
  new BlockKind(T_H2, 'Heading 2', 'Medium section heading.', 'heading-2', 'heading h2 subtitle ##'),
  new BlockKind(T_H3, 'Heading 3', 'Small section heading.', 'heading-3', 'heading h3 ###'),
  new BlockKind(T_BULLET, 'Bulleted list', 'Create a simple bulleted list.', 'list', 'bullet list ul -'),
  new BlockKind(T_NUMBER, 'Numbered list', 'Create a list with numbering.', 'list-ordered', 'number numbered list ol 1.'),
  new BlockKind(T_TODO, 'To-do list', 'Track tasks with a to-do list.', 'square-check', 'todo task check checkbox []'),
  new BlockKind(T_QUOTE, 'Quote', 'Capture a quote.', 'quote', 'quote blockquote >'),
  new BlockKind(T_CALLOUT, 'Callout', 'Make writing stand out.', 'lightbulb', 'callout note tip info'),
  new BlockKind(T_CODE, 'Code', 'Capture a code snippet.', 'code', 'code snippet ```'),
  new BlockKind(T_DIVIDER, 'Divider', 'Visually divide blocks.', 'minus', 'divider line hr ---'),
];
