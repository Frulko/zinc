// zinc:ui/dom on the web target: with `--render dom` the page installed the DOM host (targets/web/dom.js, globalThis.__zincDom) before the program started, and every
// frame that changed the tree is patched into real elements by it. It reads the tree through zinc:ui's own exports (the import below is circular on purpose: it is only used
// when a frame is committed). Canvas mode has no host, so DOM is false and zinc:ui paints with zinc:gfx.
import * as ui from 'zinc:ui';
const g: any = globalThis;
export const DOM: boolean = g.__zincDom !== undefined;
export function commit(): void { g.__zincDom.commit(ui); }
