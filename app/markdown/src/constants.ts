// Paths, limits and the e-ink class vocabulary of the reader (the hub's and the web reader's: black on white, large targets, no animation).
import * as sys from 'zinc:sys';

function envOr(name: string, fallback: string): string { const v = sys.env(name); return v !== '' ? v : fallback; }

/** The library: every .md under it (one level of folders); Notion pages are saved in its notion/ folder. */
export const DOCS_DIR = envOr('ZINC_DOCS_DIR', envOr('HOME', '.') + '/zinc-docs');
/** read.conf (the Notion token and page, mode 600) and ink/<hash>.json, the pen notes per document and font size. */
export const DATA_DIR = envOr('ZINC_READ_DIR', envOr('HOME', '.') + '/.zinc/markdown');
/** The Notion API (the test points it at its fake server). */
export const NOTION_API = envOr('ZINC_NOTION_API', 'https://api.notion.com/v1');
export const NOTION_VERSION = '2026-03-11';
export const REQUEST_TIMEOUT_MS: i32 = 30000;

export const FONT_SIZES: i32[] = [26, 30, 34, 40, 46, 54];
export const DEFAULT_FONT: i32 = 2;
export const MARGIN: number = 64;

export const PAGE = 'flex-col h-full bg-white';
export const LABEL = 'text-[30px] text-black';
export const SMALL = 'text-[26px] text-black';
export const TITLE = 'text-[44px] font-bold text-black';
export const FIELD = 'h-[88px] px-5 text-[32px] text-black bg-white border-4 border-black rounded-lg focus:border-black';
export const BUTTON = 'px-6 h-[88px] items-center justify-center rounded-lg bg-black focus:bg-black';
export const BUTTON_LABEL = 'text-[30px] font-bold text-white';
export const OUTLINE_BUTTON = 'px-6 h-[88px] items-center justify-center rounded-lg border-4 border-black bg-white focus:bg-white';
export const OUTLINE_LABEL = 'text-[30px] font-bold text-black';
export const ROW = 'flex-row gap-4 items-center py-4 border-b-2 border-black';
export const KEY = 'bg-white text-black border-2 border-black active:bg-white';
