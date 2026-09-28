// CMP-02 / CMP-21: the only module that imports the TypeScript API.
// Other modules use the re-exported `ts` namespace, so a swap to the TS 7.1 API touches this file only.
import ts from '@typescript/typescript6';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lowerJsx, JsxError } from './jsx.ts';
import { compileCss, CssError } from './css.ts';
import { modulePaths, projectDir } from './plugins.ts';

export { ts };

export const ZINC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LIB_FILES = ['zinc.d.ts', 'gfx.d.ts', 'modules.d.ts', 'ui.d.ts'].map(f => path.join(ZINC_ROOT, 'lib', f));

export interface Diag { file: string; line: number; col: number; code: string; severity: 'error' | 'warning'; message: string }

export interface Frontend {
  program: ts.Program;
  checker: ts.TypeChecker;
  /** User source files in the program, entry last. */
  sources: ts.SourceFile[];
  entry: ts.SourceFile;
  tsDiagnostics: Diag[];
}

/** Standard modules written in Zinc (RT-09), resolved like packages. */
export const STD_MODULES: Record<string, string> = {
  'zinc:ui': path.join(ZINC_ROOT, 'lib/std/ui.ts'),
  'zinc:ui/solid': path.join(ZINC_ROOT, 'lib/std/solid.ts'),
  'zinc:ui/react': path.join(ZINC_ROOT, 'lib/std/react.ts'),
  'zinc:ui/kit': path.join(ZINC_ROOT, 'lib/std/kit/index.ts'),
  // PocketJS apps compile unchanged against these (lib/compat/pocketjs)
  'solid-js': path.join(ZINC_ROOT, 'lib/std/solid.ts'),
  '@pocketjs/framework/solid/components': path.join(ZINC_ROOT, 'lib/compat/pocketjs/components.ts'),
  '@pocketjs/framework/solid/lifecycle': path.join(ZINC_ROOT, 'lib/compat/pocketjs/lifecycle.ts'),
  '@pocketjs/framework/animation': path.join(ZINC_ROOT, 'lib/compat/pocketjs/animation.ts'),
  '@pocketjs/framework/solid/std': path.join(ZINC_ROOT, 'lib/compat/pocketjs/std.ts'),
  '@pocketjs/framework/solid': path.join(ZINC_ROOT, 'lib/compat/pocketjs/mount.ts'),
  '@pocketjs/framework/clock': path.join(ZINC_ROOT, 'lib/compat/pocketjs/clock.ts'),
  // Inferno and React code run on the React engine
  'inferno': path.join(ZINC_ROOT, 'lib/compat/inferno.ts'),
  'react': path.join(ZINC_ROOT, 'lib/std/react.ts'),
};

export const compilerOptions: ts.CompilerOptions = {
  paths: Object.fromEntries(Object.entries(STD_MODULES).map(([k, v]) => [k, [v]])),
  jsx: ts.JsxEmit.React,
  strict: true,
  // LNG-15: only Error instances are throwable, so a caught value is an Error
  useUnknownInCatchVariables: false,
  noLib: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  checkJs: true,
  useDefineForClassFields: true,
  // `import X from './x.tsx'` (PocketJS style); emit-js rewrites specifiers itself
  rewriteRelativeImportExtensions: true,
  noEmitOnError: false,
  types: [],
};

/** `extra`: additional root modules compiled into the program (zinc dev adds plugins/devtools).
 *  `virtual`: in-memory sources by absolute path (zinc build app.js: the .ts written by `zinc infer`, DYN-14). */
export function loadProgram(entryPath: string, extra: string[] = [], virtual?: Map<string, string>): Frontend {
  const entryAbs = path.resolve(entryPath);
  // plugins (compiler/src/plugins.ts) resolve like the standard modules
  const options = { ...compilerOptions, paths: { ...compilerOptions.paths, ...modulePaths(projectDir(entryAbs)) } };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile;
  if (virtual) {
    const fileExists = host.fileExists, readFile = host.readFile;
    host.fileExists = f => virtual.has(f) || fileExists.call(host, f);
    host.readFile = f => virtual.get(f) ?? readFile.call(host, f);
  }
  const jsxErrors: Diag[] = [];
  // UI: .tsx files are lowered to plain calls before type checking (compiler/src/jsx.ts)
  host.getSourceFile = (f, lang, onError, create) => {
    const user = (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.d.ts');
    if (!user) return getSourceFile.call(host, f, lang, onError, create);
    let text = virtual?.get(f) ?? ts.sys.readFile(f) ?? '';
    const custom = new Set<string>();
    try {
      // `import './x.css'` -> defineClass calls, on the same line (diagnostics keep their positions)
      text = text.replace(/import\s+['"]([^'"]+\.css)['"];?/g, (_m, rel: string) => {
        const rules = compileCss(ts.sys.readFile(path.resolve(path.dirname(f), rel)) ?? '');
        const calls = [...rules].map(([k, v]) => { custom.add(k); return `__zcss(${JSON.stringify(k)}, ${JSON.stringify(v.join(' '))});`; }).join(' ');
        return `import { defineClass as __zcss } from 'zinc:ui'; ${calls}`;
      });
      if (!f.endsWith('.tsx')) return ts.createSourceFile(f, text, lang, true, ts.ScriptKind.TS);
      return ts.createSourceFile(f, lowerJsx(text, f, custom), lang, true, ts.ScriptKind.TSX);
    } catch (e) {
      if (!(e instanceof JsxError) && !(e instanceof CssError)) throw e;
      const pos = e instanceof JsxError ? e.pos : 0;
      const lc = ts.createSourceFile(f, text, lang, true).getLineAndCharacterOfPosition(pos);
      jsxErrors.push({ file: path.relative(process.cwd(), f), line: lc.line + 1, col: lc.character + 1, code: e instanceof CssError ? 'Z6002' : 'Z6001', severity: 'error', message: e.message });
      return ts.createSourceFile(f, '', lang, true);
    }
  };
  host.resolveModuleNameLiterals = (lits, containing, redirect, opts) =>
    lits.map(l => ({ resolvedModule: resolveModule(l.text, containing, opts, host, redirect) }));
  const program = ts.createProgram([...extra, entryAbs, ...LIB_FILES], options, host);  // extra modules initialize first
  const checker = program.getTypeChecker();
  const sources = program.getSourceFiles().filter(f => !f.isDeclarationFile && !f.fileName.includes('/node_modules/'));
  const entry = program.getSourceFile(entryAbs);
  if (!entry) throw new Error(`entry not found: ${entryPath}`);
  const tsDiagnostics = jsxErrors.length ? jsxErrors : ts.getPreEmitDiagnostics(program).filter(d => d.code !== 5056 && d.code !== 5055).map(d => toDiag(d))  // 5056: x.ts + x.tsx outputs, renamed by emit-js; 5055: .js inputs (never emitted in place);
  return { program, checker, sources, entry, tsDiagnostics };
}

function toDiag(d: ts.Diagnostic): Diag {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  if (!d.file || d.start === undefined) return { file: '', line: 0, col: 0, code: `TS${d.code}`, severity: 'error', message: msg };
  const lc = d.file.getLineAndCharacterOfPosition(d.start);
  return {
    file: path.relative(process.cwd(), d.file.fileName), line: lc.line + 1, col: lc.character + 1,
    code: `TS${d.code}`, severity: d.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error', message: msg,
  };
}

// like Node, a module reached through a symlink is the file it points to (one module, one set of globals)
export function resolveModule(spec: string, containing: string, opts: ts.CompilerOptions, host: ts.ModuleResolutionHost, redirect?: ts.ResolvedProjectReference) {
  const r = ts.resolveModuleName(spec, containing, opts, host, undefined, redirect).resolvedModule;
  if (r && !r.isExternalLibraryImport) try { r.resolvedFileName = fs.realpathSync(r.resolvedFileName); } catch { /* virtual file */ }
  return r;
}
