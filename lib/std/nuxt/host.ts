// zinc:ui/nuxt's JSX helpers: zinc:ui/kit's (both UI models), with a _str that also sets roles, labels and aria-* / data-* attributes (kit/host.ts's sets
// a value or a placeholder only).
import * as ui from 'zinc:ui';
import * as solid from 'zinc:ui/solid';
import * as react from 'zinc:ui/react';
export { _el, _text, _textOf, _append, _class, _on, _draw, _styles, _dynStyles, _num, _img, _focusable, _ref, _dynTextOf, _dynText, _dynClass, _dynNum, _dynImg,
  _show, _for, _virtual, renderSlot, _ptr, _key, _ctx, _onText, _hl } from '../kit/host';

export function _str(n: i32, key: string, s: string): void {
  if (key === 'value') ui.setValue(n, s); else if (key === 'role') ui.setRole(n, s); else if (key === 'label') ui.setLabel(n, s);
  else if (key.startsWith('attr:')) ui.setAttr(n, key.slice(5), s); else ui.setPlaceholder(n, s);
}
export function _dynStr(n: i32, key: string, get: () => string): void { if (!react._active()) solid.createEffect((): void => { _str(n, key, get()); }); else _str(n, key, get()); }
