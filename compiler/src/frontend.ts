// CMP-02 / CMP-21: the only module that imports the TypeScript API.
// Other modules use the re-exported `ts` namespace, so a swap to the TS 7.1 API touches this file only.
import tsMod from '@typescript/typescript6';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ts = tsMod;
export type TS = typeof tsMod;

export const ZINC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LIB_FILES = [path.join(ZINC_ROOT, 'lib/zinc.d.ts'), path.join(ZINC_ROOT, 'lib/gfx.d.ts')];

export interface Diag { file: string; line: number; col: number; code: string; severity: 'error' | 'warning'; message: string }

export interface Frontend {
  program: tsMod.Program;
  checker: tsMod.TypeChecker;
  /** User source files in the program, entry last. */
  sources: tsMod.SourceFile[];
  entry: tsMod.SourceFile;
  tsDiagnostics: Diag[];
}

export const compilerOptions: tsMod.CompilerOptions = {
  strict: true,
  noLib: true,
  target: tsMod.ScriptTarget.ES2022,
  module: tsMod.ModuleKind.ESNext,
  moduleResolution: tsMod.ModuleResolutionKind.Bundler,
  allowJs: true,
  checkJs: true,
  useDefineForClassFields: true,
  noEmitOnError: false,
  types: [],
};

export function loadProgram(entryPath: string): Frontend {
  const entryAbs = path.resolve(entryPath);
  const program = tsMod.createProgram([entryAbs, ...LIB_FILES], compilerOptions);
  const checker = program.getTypeChecker();
  const sources = program.getSourceFiles().filter(f => !f.isDeclarationFile && !f.fileName.includes('/node_modules/'));
  const entry = program.getSourceFile(entryAbs);
  if (!entry) throw new Error(`entry not found: ${entryPath}`);
  const tsDiagnostics = tsMod.getPreEmitDiagnostics(program).map(d => toDiag(d));
  return { program, checker, sources, entry, tsDiagnostics };
}

function toDiag(d: tsMod.Diagnostic): Diag {
  const msg = tsMod.flattenDiagnosticMessageText(d.messageText, '\n');
  if (!d.file || d.start === undefined) return { file: '', line: 0, col: 0, code: `TS${d.code}`, severity: 'error', message: msg };
  const lc = d.file.getLineAndCharacterOfPosition(d.start);
  return {
    file: path.relative(process.cwd(), d.file.fileName), line: lc.line + 1, col: lc.character + 1,
    code: `TS${d.code}`, severity: d.category === tsMod.DiagnosticCategory.Warning ? 'warning' : 'error', message: msg,
  };
}
