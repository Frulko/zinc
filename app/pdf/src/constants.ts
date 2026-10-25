// Paths, limits and the e-ink class vocabulary of the PDF reader (the hub's and Zinc Web's: black on white, large targets, no animation).
import * as sys from 'zinc:sys';

function envOr(name: string, fallback: string): string { const v = sys.env(name); return v !== '' ? v : fallback; }

/** The library: the PDFs of this folder. Each one's ink is in <name>.pdf.ink/p<page>.json beside it; Export writes <name>.annotated.pdf. */
export const DOCS_DIR = envOr('ZINC_PDF_DOCS', envOr('HOME', '.') + '/zinc-docs');
export const MAX_ZOOM: number = 4;
/** Pen width at full pressure and the eraser's radius, in PDF points (1/72 in; a page fitted to the tablet is about 2.7 px a point). */
export const PEN_WIDTH: number = 1.6;
export const ERASER_RADIUS: number = 6;

export const PAGE = 'flex-col h-full bg-white';
export const LABEL = 'text-[30px] text-black';
export const TITLE = 'text-[44px] font-bold text-black';
export const BUTTON = 'px-6 h-[88px] items-center justify-center rounded-lg bg-black focus:bg-black';
export const BUTTON_LABEL = 'text-[30px] font-bold text-white';
export const OUTLINE_BUTTON = 'px-6 h-[88px] items-center justify-center rounded-lg border-4 border-black bg-white focus:bg-white';
export const OUTLINE_LABEL = 'text-[30px] font-bold text-black';
export const ROW = 'flex-row gap-4 items-center py-5 px-2 border-b-2 border-black';
