// Bundle the same validator/generator as the CLI, using the compiler already installed by Zinc.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
const dir = path.dirname(fileURLToPath(import.meta.url));
const modules = ['ui-style', 'ui-document', 'ui-package'];
const bundle = 'const zincModules = {\n' + modules.map(name => {
  const source = fs.readFileSync(path.join(dir, '../../compiler/src', name + '.ts'), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
  const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: s => s, getCurrentDirectory: () => dir, getNewLine: () => '\n' }));
  return `${JSON.stringify('./' + name + '.ts')}: function(exports, require) {\n${result.outputText}\n}`;
}).join(',\n') + '\n};\nconst zincCache = {}; function zincRequire(id) { if (!zincCache[id]) { const exports = {}; zincCache[id] = exports; zincModules[id](exports, zincRequire); } return zincCache[id]; }';
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.copyFileSync(path.join(dir, 'code.js'), path.join(dir, 'dist/code.js'));
fs.writeFileSync(path.join(dir, 'dist/ui.html'), fs.readFileSync(path.join(dir, 'ui.html'), 'utf8').replace('/*__ZINC_BUNDLE__*/', () => bundle.replace(/<\/script/gi, '<\\/script')));
console.log('Built integrations/figma/dist. Import integrations/figma/manifest.json in Figma Desktop.');
