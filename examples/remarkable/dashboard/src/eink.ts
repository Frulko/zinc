// E-ink styling: pure black and white with thick borders and large type. Soft greys, shadows and transitions
// ghost on e-paper, so this dashboard does not use the kit's light theme; it keeps the same layout ideas.

export const PAGE = 'flex-col h-full gap-8 p-10 bg-white';
export const PANEL = 'flex-col gap-4 p-8 rounded-xl border-2 border-black bg-white';
export const PANEL_TITLE = 'text-[44px] font-bold text-black';
export const LABEL = 'text-[36px] text-black';
/** Buttons keep their colour when focused: no highlight flash on the panel. */
export const PRIMARY_BUTTON = 'px-8 py-4 rounded-lg bg-black focus:bg-black';
export const PRIMARY_LABEL = 'text-[36px] font-bold text-white';
