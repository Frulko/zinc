// CMP-02 / CMP-21: the only module that imports the TypeScript API.
// Other modules use the re-exported `ts` namespace, so a swap to the TS 7.1 API touches this file only.
import ts from '@typescript/typescript6';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export { ts };

export const ZINC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LIB_FILES = [path.join(ZINC_ROOT, 'lib/zinc.d.ts'), path.join(ZINC_ROOT, 'lib/gfx.d.ts')];

export interface Diag { file: string; line: number; col: number; code: string; severity: 'error' | 'warning'; message: string }

export interface Frontend {
  program: ts.Program;
  checker: ts.TypeChecker;
  /** User source files in the program, entry last. */
  sources: ts.SourceFile[];
  entry: ts.SourceFile;
  tsDiagnostics: Diag[];
}

export const compilerOptions: ts.CompilerOptions = {
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
  const program = ts.createProgram([entryAbs, ...LIB_FILES], compilerOptions);
  const checker = program.getTypeChecker();
  const sources = program.getSourceFiles().filter(f => !f.isDeclarationFile && !f.fileName.includes('/node_modules/'));
  const entry = program.getSourceFile(entryAbs);
  if (!entry) throw new Error(`entry not found: ${entryPath}`);
  const tsDiagnostics = ts.getPreEmitDiagnostics(program).map(d => toDiag(d));
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
