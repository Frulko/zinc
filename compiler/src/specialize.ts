// Instantiate typed HIR before assigning fixed VM register and object layouts.
import { ts } from './frontend.ts';
import { type Sema, type ZT, zeq } from './sema.ts';
import type { HClass, HExpr, HFunc, HModule } from './hir.ts';

export function specialize(module: HModule, roots: Set<string>, sema: Sema) {
  const templates = new Map([...module.fns, ...module.classes.flatMap(c => c.methods)].map(f => [f.name, f]));
  const classes = new Map(module.classes.map(c => [c.decl, c]));
  const instances = new Map<string, HClass>();
  const functions = new Map<string, HFunc>();
  const declarations = new Map<ts.Node, number>();
  const id = (d: ts.Node) => { if (!declarations.has(d)) declarations.set(d, declarations.size); return declarations.get(d)!; };
  const typeKey = (t: ZT): string => {
    switch (t.k) {
      case 'num': return t.m;
      case 'tp': return '$' + t.name;
      case 'obj': return `o${id(t.decl)}<${t.args.map(typeKey)}>`;
      case 'arr': case 'set': case 'gen': case 'promise': return `${t.k}<${typeKey(t.el)}>`;
      case 'map': return `map<${typeKey(t.key)},${typeKey(t.val)}>`;
      case 'fn': return `fn(${t.params.map(typeKey)}):${typeKey(t.ret)}`;
      case 'tup': return `[${t.els.map(typeKey)}]`;
      default: return t.k;
    }
  };
  const hasParameter = (t: ZT): boolean => typeKey(t).includes('$');
  const substitute = (t: ZT, bindings: Map<string, ZT>): ZT => {
    switch (t.k) {
      case 'tp': return bindings.get(t.name) ?? t;
      case 'arr': case 'set': case 'gen': case 'promise': return { ...t, el: substitute(t.el, bindings) };
      case 'map': return { ...t, key: substitute(t.key, bindings), val: substitute(t.val, bindings) };
      case 'obj': return { ...t, args: t.args.map(a => substitute(a, bindings)) };
      case 'fn': return { ...t, params: t.params.map(a => substitute(a, bindings)), ret: substitute(t.ret, bindings) };
      case 'tup': return { ...t, els: t.els.map(a => substitute(a, bindings)) };
      default: return t;
    }
  };
  const bind = (pattern: ZT, value: ZT, bindings: Map<string, ZT>): void => {
    if (pattern.k === 'tp') {
      if (hasParameter(value)) throw new Error(`zinc-vm: unresolved generic argument ${pattern.name}`);
      const previous = bindings.get(pattern.name);
      if (previous && !zeq(previous, value)) throw new Error(`zinc-vm: conflicting generic argument ${pattern.name}`);
      bindings.set(pattern.name, value);return;
    }
    if (pattern.k !== value.k) return;
    if ('el' in pattern && 'el' in value) bind(pattern.el, value.el, bindings);
    else if (pattern.k === 'map' && value.k === 'map') {bind(pattern.key, value.key, bindings);bind(pattern.val, value.val, bindings);}
    else if (pattern.k === 'obj' && value.k === 'obj') pattern.args.forEach((p,i) => {if(value.args[i])bind(p,value.args[i],bindings);});
    else if (pattern.k === 'fn' && value.k === 'fn') {pattern.params.forEach((p,i) => {if(value.params[i])bind(p,value.params[i],bindings);});bind(pattern.ret,value.ret,bindings);}
    else if (pattern.k === 'tup' && value.k === 'tup') pattern.els.forEach((p,i) => {if(value.els[i])bind(p,value.els[i],bindings);});
  };
  // HIR contains declaration identities in types; never clone or traverse TS ASTs.
  const clone = <T>(node: T, bindings: Map<string, ZT>): T => {
    if (Array.isArray(node)) return node.map(n => clone(n,bindings)) as T;
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key,value] of Object.entries(node)) out[key] = key === 'decl' ? value : ['t','ret','errorType'].includes(key) ? substitute(value as ZT,bindings) : clone(value,bindings);
    return out as T;
  };
  const generic = (f: HFunc) => f.params.some(p => hasParameter(p.t)) || hasParameter(f.ret);
  const instantiate = (template: HFunc, bindings: Map<string, ZT>, name?: string): HFunc => {
    const key = name ?? (bindings.size ? `${template.name}<${[...bindings].sort(([a],[b]) => a.localeCompare(b)).map(([n,t]) => `${n}=${typeKey(t)}`)}>` : template.name);
    const existing = functions.get(key);if(existing)return existing;
    if (functions.size >= 4096) throw new Error('zinc-vm: generic specialization limit exceeded');
    const fn=clone(template,bindings);fn.name=key;
    if(generic(fn))throw new Error(`zinc-vm: unresolved generic signature ${template.name}`);
    functions.set(key,fn);visit(fn);return fn;
  };
  const classFor = (type: Extract<ZT,{k:'obj'}>): HClass | undefined => {
    const template=classes.get(type.decl as ts.ClassDeclaration);if(!template)return;
    if(hasParameter(type))throw new Error(`zinc-vm: unresolved generic class ${template.name}`);
    const key=typeKey(type), existing=instances.get(key);if(existing)return existing;
    const parameters=template.decl.typeParameters ?? [];
    if(parameters.length!==type.args.length)throw new Error(`zinc-vm: missing type arguments for ${template.name}`);
    const bindings=new Map(parameters.map((p,i) => [p.name.text,type.args[i]]));
    const instance=clone(template,bindings);instance.name=parameters.length?`${template.name}<${type.args.map(typeKey)}>`:template.name;
    instances.set(key,instance);
    const base = sema.baseClass(template.decl);
    if (base) {
      const heritage = template.decl.heritageClauses?.find(c => c.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
      classFor({ k: 'obj', decl: base, args: (heritage?.typeArguments ?? []).map(t => sema.fromTypeNode(t, bindings)) });
    }
    // Register all methods before visiting bodies: mutually recursive methods
    // and constructors can refer back to the class currently being instantiated.
    instance.methods=template.methods.map(f => {
      const fn=clone(f,bindings);fn.name=instance.name+f.name.slice(template.name.length);functions.set(fn.name,fn);return fn;
    });
    instance.methods.forEach(f => {if(generic(f))throw new Error(`zinc-vm: generic method requires specialization: ${f.name}`);visit(f);});
    return instance;
  };
  const visitType = (t: ZT): void => {
    if(t.k==='obj') {if(!hasParameter(t))classFor(t);t.args.forEach(visitType);}
    else if('el' in t)visitType(t.el);
    else if(t.k==='map'){visitType(t.key);visitType(t.val);}
    else if(t.k==='tup')t.els.forEach(visitType);
    else if(t.k==='fn'){t.params.forEach(visitType);visitType(t.ret);}
  };
  const seen=new WeakSet<object>();
  function visit(node: unknown): void {
    if(!node || typeof node!=='object' || seen.has(node))return;
    seen.add(node);
    if(Array.isArray(node)){node.forEach(visit);return;}
    const e=node as HExpr;
    // Instantiate callees using concrete argument and result types. Recursive
    // calls reuse the cache entry installed before their body is visited.
    if(e.k==='call' && e.how==='static' && templates.has(e.fn)) {
      const template=templates.get(e.fn)!, bindings=new Map<string,ZT>();
      if(generic(template)) {template.params.forEach((p,i) => {if(e.args[i])bind(p.t,e.args[i].t,bindings);});bind(template.ret,e.t,bindings);}
      e.fn=instantiate(template,bindings).name;
    } else if(e.k==='var' && e.global && templates.has(e.name)) {
      const template=templates.get(e.name)!, bindings=new Map<string,ZT>();
      if(generic(template))bind({k:'fn',params:template.params.map(p=>p.t),ret:template.ret},e.t,bindings);
      e.name=instantiate(template,bindings).name;
    }
    for(const [key,value] of Object.entries(node)) {
      if(key==='decl')continue;
      if(['t','ret','errorType'].includes(key))visitType(value as ZT);else visit(value);
    }
  }
  for(const name of roots){const f=templates.get(name);if(f && !generic(f))instantiate(f,new Map());}
  visit(module.globals);visit(module.ordered);
  module.fns=[...functions.values()];
  module.classes=[];
  return {classFor, substitute};
}
