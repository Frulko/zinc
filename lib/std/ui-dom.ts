// zinc:ui/dom — the hook where zinc:ui hands a frame to the page's DOM (web target, `--render dom`). Everywhere else the tree is painted with zinc:gfx and this is off.
// The web export selects ui-dom.browser.ts instead (src/frontend/modules.cpp stdModuleFile).
export const DOM: boolean = false;
export function commit(): void {}
