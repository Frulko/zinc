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
export const COLOR_LINK_MISSING: i32 = 0x8fb8e6;   // a link to a note that does not exist (yet)
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

// ---- collaboration: the first window serves the relay, the others join it (services/sync.ts)
export const SYNC_PORT: i32 = 7311;
export const RECONNECT_DELAY_MS: i32 = 1500;
export const PRESENCE_REFRESH_S: number = 10; // where I am is said again this often, before it expires for the others
export const PEER_COLORS: i32[] = [0xe03e3e, 0x0b6e99, 0x6940a5, 0xd9730d, 0x0f7b6c, 0xad1a72];
export const PEER_NAMES: string[] = ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Ken', 'Margaret', 'Linus'];

// ---- files
export const SAVE_DELAY_S: number = 0.8;     // a note is written this long after its last change
export const WATCH_S: number = 1;            // the vault is looked at this often for changes made by other programs
export const UNTITLED = 'Untitled';          // a new note's name, as Obsidian names one
export const CONFIG_DIR = '.carnet';         // the vault's own files (Obsidian's .obsidian/): the open note, the search index
export const TRASH_DIR = '.trash';           // where a deleted note goes (Obsidian's "Move to Obsidian trash")
// page icons are Lucide names (zinc:icons), listed in zinc.json since they are chosen at run time
export const PAGE_ICONS: string[] = ['file-text', 'notebook-pen', 'lightbulb', 'rocket', 'leaf', 'book-open', 'target', 'flask-conical', 'folder', 'sparkles'];

// ---- the view's block kinds (state.ts maps Carnet's types to them)
export const T_TEXT = 'p', T_H1 = 'h1', T_H2 = 'h2', T_H3 = 'h3', T_BULLET = 'bullet', T_NUMBER = 'number', T_TODO = 'todo';
export const T_QUOTE = 'quote', T_CALLOUT = 'callout', T_CODE = 'code', T_DIVIDER = 'divider', T_TOGGLE = 'toggle';
export const T_LINK = 'link';     // a line that is only a [[wikilink]]: Carnet's link_to_page
export const T_OTHER = 'other';   // a block this view does not draw yet (image, table, database...): its text, kept as it is
