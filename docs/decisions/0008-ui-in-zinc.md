# 0008 — UI engine and component models written in Zinc; JSX lowered before type checking

**Choice.** The host ABI (node handles, flexbox, Tailwind-like classes, text wrap, painting through `zinc:gfx`,
pointer and focus input) is `lib/std/ui.ts`; Solid reactivity is `lib/std/solid.ts`, the React model
`lib/std/react.ts`. They are compiled with the application, to C++ and to sim alike. `.tsx` files are rewritten
(`compiler/src/jsx.ts`) into calls to these helpers before type checking; unknown classes are build errors.

**Consequences.** One implementation, identical layouts everywhere (golden tests compare `ui.dump()` text instead of
PNGs). The React model re-renders a component's whole subtree (no reconciliation); Solid lists re-render unkeyed.
