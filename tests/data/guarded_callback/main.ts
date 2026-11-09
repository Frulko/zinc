import { equal } from 'zinc:assert';
interface Props { onClick?: () => void; selected?: () => boolean; text?: () => string; count?: () => number }
let calls: i32 = 0;
function selected(props?: Props): string {
  return props?.onClick !== undefined && props.selected !== undefined ? String(props.selected()) : '';
}
function explicit(props?: Props): string {
  return props !== undefined && props.onClick !== undefined && props.selected !== undefined ? String(props.selected()) : '';
}
function text(props: Props): string { return props.text !== undefined ? String(props.text()) : ''; }
function count(props: Props): number { return props.count !== undefined ? Number(props.count()) : -1; }
function bool(props: Props): boolean { return props.selected !== undefined ? Boolean(props.selected()) : false; }
const state: Props = { onClick: () => {}, selected: () => { calls++; state.selected = undefined; return true; } };
equal(selected(), ''); equal(explicit(), ''); equal(selected({}), ''); equal(explicit({}), '');
equal(selected(state), 'true', 'guarded call is evaluated once'); equal(calls, 1); equal(selected(state), '');
state.selected = () => { calls++; state.selected = undefined; return false; };
equal(explicit(state), 'false', 'explicit guard'); equal(calls, 2); equal(explicit(state), '');
state.text = () => { calls++; state.text = undefined; return 'once'; };
equal(text(state), 'once', 'String identity conversion'); equal(calls, 3); equal(text(state), '');
state.count = () => { calls++; state.count = undefined; return 7; };
equal(count(state), 7, 'Number identity conversion'); equal(calls, 4); equal(count(state), -1);
state.selected = () => { calls++; state.selected = undefined; return true; };
equal(bool(state), true, 'Boolean identity conversion'); equal(calls, 5); equal(bool(state), false);
console.log('guarded callback: pass');
