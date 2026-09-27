// CMP-02 / CMP-21: the only module that imports the TypeScript API.
// Other modules use the re-exported `ts` namespace, so a swap to the TS 7.1 API touches this file only.
import ts from '@typescript/typescript6';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lowerJsx, JsxError } from './jsx.ts';

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
  noEmitOnError: false,
  types: [],
};

export function loadProgram(entryPath: string): Frontend {
  const entryAbs = path.resolve(entryPath);
  const host = ts.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile;
  const jsxErrors: Diag[] = [];
  // UI: .tsx files are lowered to plain calls before type checking (compiler/src/jsx.ts)
  host.getSourceFile = (f, lang, onError, create) => {
    if (!f.endsWith('.tsx')) return getSourceFile.call(host, f, lang, onError, create);
    const text = ts.sys.readFile(f) ?? '';
    try {
      return ts.createSourceFile(f, lowerJsx(text, f), lang, true, ts.ScriptKind.TSX);
    } catch (e) {
      if (!(e instanceof JsxError)) throw e;
      const lc = ts.createSourceFile(f, text, lang, true).getLineAndCharacterOfPosition(e.pos);
      jsxErrors.push({ file: path.relative(process.cwd(), f), line: lc.line + 1, col: lc.character + 1, code: 'Z6001', severity: 'error', message: e.message });
      return ts.createSourceFile(f, '', lang, true);
    }
  };
  const program = ts.createProgram([entryAbs, ...LIB_FILES], compilerOptions, host);
  const checker = program.getTypeChecker();
  const sources = program.getSourceFiles().filter(f => !f.isDeclarationFile && !f.fileName.includes('/node_modules/'));
  const entry = program.getSourceFile(entryAbs);
  if (!entry) throw new Error(`entry not found: ${entryPath}`);
  const tsDiagnostics = jsxErrors.length ? jsxErrors : ts.getPreEmitDiagnostics(program).map(d => toDiag(d));
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
