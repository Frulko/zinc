// Editor-only JSX typings (listed in the tsconfig.json that `zinc new` / `zinc tsconfig` write; the compiler
// lowers JSX itself and never reads this file). Host tags are components returning node handles; component
// attributes are checked against their props; the zinc-ts-plugin drops the children diagnostics that do not apply
// (Zinc passes children as one thunk).
type ZincPointerHandler = (e: import('zinc:ui').PointerEvent) => void;
// className, never class (Z0006); the events with their argument (lib/ui.d.ts); any other attribute is checked by `zinc check`
type ZincHostProps = {
  [attr: string]: any; class?: never; className?: string; key?: any;
  id?: string | null;
  onClick?: () => void; onPress?: () => void; onSubmit?: () => void;
  onInput?: (value: string) => void; onChange?: (value: string) => void; onKeyDown?: (e: import('zinc:ui').KeyEvent) => void; onKeyUp?: (e: import('zinc:ui').KeyEvent) => void;
  onPointerDown?: ZincPointerHandler; onPointerMove?: ZincPointerHandler; onPointerUp?: ZincPointerHandler; onPointerCancel?: ZincPointerHandler;
  onPointerEnter?: ZincPointerHandler; onPointerLeave?: ZincPointerHandler; onDoubleClick?: ZincPointerHandler; onContextMenu?: ZincPointerHandler;
  onWheel?: ZincPointerHandler; onTap?: ZincPointerHandler; onLongPress?: ZincPointerHandler; onDrag?: ZincPointerHandler; onPinch?: ZincPointerHandler;
};
declare function View(props: ZincHostProps): i32;
declare function Text(props: ZincHostProps): i32;
declare function Button(props: ZincHostProps): i32;
declare function Image(props: ZincHostProps): i32;
declare function ScrollView(props: ZincHostProps): i32;
declare function Canvas(props: ZincHostProps): i32;
declare function Input(props: ZincHostProps): i32;
declare function TextArea(props: ZincHostProps): i32;
declare namespace JSX {
  type Element = any;   // a node handle, or a thunk when passed as children
  interface IntrinsicElements { }   // no lowercase tag: components start with a capital letter (Z0007)
  interface IntrinsicAttributes { key?: any; ref?: any; class?: never }
  interface ElementChildrenAttribute { children: {} }
}
// control-flow tags the JSX compiler lowers itself (usable without an import)
declare function Show(props: { when: any; fallback?: any; children?: any }): i32;
declare function For(props: { each: any; children?: any }): i32;
declare function VirtualList(props: { count: any; itemHeight: number; id?: string | null; children?: any }): i32;
