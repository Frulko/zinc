import { ts } from './frontend.ts';
import { CssError } from './css.ts';
import { numericStyleKeys, styleEntry } from './ui-style.ts';

/** Normalize CSS objects before the Zinc type checker: no CSS parser runs on the device. */
export function styleExpression(n: ts.Expression, sf: ts.SourceFile): string {
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) return styleExpression(n.expression, sf);
  if (ts.isObjectLiteralExpression(n)) {
    const keys: string[] = [], values: string[] = [], resources: string[] = [];
    for (const p of n.properties) {
      if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) throw new CssError('style objects use named properties; compose with style={[base, override]}');
      if (ts.isComputedPropertyName(p.name)) throw new CssError('computed style keys are unsupported');
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(sf);
      const expr = ts.isShorthandPropertyAssignment(p) ? p.name : p.initializer;
      const raw = expr.getText(sf);
      const literal = ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) ? expr.text : /^-?\d+(\.\d+)?$/.test(raw) || /^0x[\da-f]+$/i.test(raw) ? Number(raw) : undefined;
      try {
        if (literal !== undefined) {
          if (key === 'fontSize' || key === 'font-size') { const size = Math.round(styleEntry(key, literal)[0].value); resources.push(`font-size: ${size}px`); }
          for (const op of styleEntry(key, literal)) {
            const color = ['backgroundColor', 'color', 'borderColor'].includes(op.key);
            keys.push(color ? '@' + op.key + ':' + op.value.toString(16) : op.key); values.push(color ? '0' : String(op.value));
          }
        } else {
          for (const k of numericStyleKeys(key)) { keys.push(k); values.push(`(${raw})`); if (k === 'backgroundColor') { keys.push('backgroundAlpha'); values.push('255'); } }
        }
      } catch (e) { throw new CssError((e as Error).message); }
    }
    return `new __ZStyle(${JSON.stringify(keys)}, [${values.join(', ')}])${resources.length ? ' /* ' + resources.join('; ') + ' */' : ''}`;
  }
  if (ts.isConditionalExpression(n)) return `(${n.condition.getText(sf)} ? ${styleExpression(n.whenTrue, sf)} : ${styleExpression(n.whenFalse, sf)})`;
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
    return `(${n.left.getText(sf)} ? ${styleExpression(n.right, sf)} : new __ZStyle([], []))`;
  if (n.kind === ts.SyntaxKind.NullKeyword || n.kind === ts.SyntaxKind.FalseKeyword || n.getText(sf) === 'undefined') return 'new __ZStyle([], [])';
  return n.getText(sf);
}

export function styleLayers(n: ts.Expression, sf: ts.SourceFile): string {
  if (ts.isArrayLiteralExpression(n)) return `[${n.elements.map(e => {
    if (ts.isSpreadElement(e)) throw new CssError('spread style arrays are unsupported');
    if (ts.isArrayLiteralExpression(e)) throw new CssError('use a flat style array');
    return styleExpression(e, sf);
  }).join(', ')}]`;
  return `[${styleExpression(n, sf)}]`;
}

/** Works in .ts as well as .tsx, including shared/imported stylesheet modules. */
export function lowerStyleSheets(text: string, fileName: string): string {
  if (!text.includes('StyleSheet')) return text;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = new Set<string>();
  for (const s of sf.statements) if (ts.isImportDeclaration(s) && (s.moduleSpecifier as ts.StringLiteral).text === 'zinc:ui' && s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings))
    for (const e of s.importClause.namedBindings.elements) if ((e.propertyName ?? e.name).text === 'StyleSheet') names.add(e.name.text);
  for (const s of sf.statements) if (ts.isImportDeclaration(s) && (s.moduleSpecifier as ts.StringLiteral).text === 'zinc:ui' && s.importClause?.namedBindings && ts.isNamespaceImport(s.importClause.namedBindings)) names.add(s.importClause.namedBindings.name.text + '.StyleSheet');
  const edits: { start: number; end: number; code: string }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && names.has(n.expression.expression.getText(sf)) && n.expression.name.text === 'create') {
      const obj = n.arguments[0];
      if (n.arguments.length !== 1 || !obj || !ts.isObjectLiteralExpression(obj)) throw new CssError('StyleSheet.create expects an object of named style objects');
      const fields = obj.properties.map(p => {
        if (!ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name)) throw new CssError('StyleSheet.create expects named styles');
        const name = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '';
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new CssError('StyleSheet names must be identifiers');
        return `${name}: ${styleExpression(p.initializer, sf)}`;
      });
      const code = `({ ${fields.join(', ')} })`;
      edits.push({ start: n.getStart(sf), end: n.getEnd(), code: code + '\n'.repeat(Math.max(0, n.getText(sf).split('\n').length - code.split('\n').length)) });
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const e of edits.reverse()) text = text.slice(0, e.start) + e.code + text.slice(e.end);
  return edits.length ? "import { Style as __ZStyle } from 'zinc:ui'; " + text : text;
}
