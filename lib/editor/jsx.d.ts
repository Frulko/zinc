// Editor-only JSX typings (referenced by the tsconfig.json that `zinc init` / `zinc tsconfig` write; the compiler
// lowers JSX itself and never reads this file). Host tags are components returning node handles; component
// attributes are checked against their props; the zinc-ts-plugin drops the children diagnostics that do not apply
// (Zinc passes children as one thunk).
type ZincHostProps = { [attr: string]: any };
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
  interface IntrinsicElements { [tag: string]: ZincHostProps }
  interface IntrinsicAttributes { key?: any; ref?: any }
  interface ElementChildrenAttribute { children: {} }
}
// control-flow tags the JSX compiler lowers itself (usable without an import)
declare function Show(props: { when: any; fallback?: any; children?: any }): i32;
declare function For(props: { each: any; children?: any }): i32;
declare function VirtualList(props: { count: any; itemHeight: number; children?: any }): i32;
