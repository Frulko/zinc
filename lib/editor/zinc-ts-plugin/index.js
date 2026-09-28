// tsserver plugin for Zinc projects (VS Code and any tsserver-based editor), installed by `zinc tsconfig`.
// Zinc passes JSX children to components as one thunk (`children: () => i32`, several children become one
// fragment), which TypeScript's React-shaped JSX checking cannot express: this drops only those children
// diagnostics. Everything else is TypeScript's own checking against Zinc's lib (tsconfig.json).
'use strict';
const CHILDREN_CODES = new Set([2746, 2745, 2747]);   // single child expected / children not accepted
function texts(m, out) {
  if (!m) return out;
  if (typeof m === 'string') { out.push(m); return out; }
  out.push(m.messageText);
  for (const n of m.next || []) texts(n, out);
  return out;
}
/** Only drop an error whose sole complaint is the `children` prop (a thunk, or several children as one). */
function isChildrenNoise(d) {
  if (CHILDREN_CODES.has(d.code)) return true;
  if (d.code !== 2741 && d.code !== 2322) return false;
  const all = texts(d.messageText, []);
  const props = [];
  for (const t of all) for (const m of t.matchAll(/Property '([^']+)' (?:is missing|does not exist)|Types of property '([^']+)' are incompatible/g)) props.push(m[1] || m[2]);
  if (props.length) return props.every(p => p === 'children');
  // several children arrive as an array where the props declare one thunk
  return all.some(t => /any\[\]' is not assignable to type '\(\) =>/.test(t));
}
module.exports = function init() {
  return {
    create(info) {
      const ls = info.languageService;
      const proxy = Object.create(null);
      for (const k of Object.keys(ls)) proxy[k] = (...args) => ls[k].apply(ls, args);
      proxy.getSemanticDiagnostics = (file) => ls.getSemanticDiagnostics(file).filter(d => !isChildrenNoise(d));
      return proxy;
    },
  };
};
