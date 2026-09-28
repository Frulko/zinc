// Syntax highlighting for TypeScript / TSX / JavaScript, JSON, Markdown and CSS.
// A tokenizer turns one line into runs [length, token, length, token...] and returns the state the next line starts
// in (inside a block comment, a template string, a fenced code block, a CSS rule), so constructs that span lines
// are coloured correctly. Buffers keep the state at the start of each line (see highlight.ts).

export const L_PLAIN: i32 = 0, L_TS: i32 = 1, L_JSON: i32 = 2, L_MD: i32 = 3, L_CSS: i32 = 4;
export const LANG_NAMES: string[] = ['Plain Text', 'TypeScript', 'JSON', 'Markdown', 'CSS'];

/** Token kinds; theme.ts maps them to colours (tokenColor in highlight.ts). */
export const T_TEXT: i32 = 0, T_KEYWORD: i32 = 1, T_STRING: i32 = 2, T_NUMBER: i32 = 3, T_COMMENT: i32 = 4, T_FN: i32 = 5,
  T_TYPE: i32 = 6, T_PROPERTY: i32 = 7, T_CONSTANT: i32 = 8, T_PUNCT: i32 = 9, T_TAG: i32 = 10, T_ATTR: i32 = 11,
  T_HEADING: i32 = 12, T_LINK: i32 = 13;

/** Line states. CSS combines S_CSS_RULE with S_COMMENT. */
export const S_NORMAL: i32 = 0, S_COMMENT: i32 = 1, S_TEMPLATE: i32 = 2, S_FENCE: i32 = 4, S_CSS_RULE: i32 = 8;

export function langOf(path: string): i32 {
  const dot = path.lastIndexOf('.');
  const ext = dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return L_TS;
  if (ext === 'json') return L_JSON;
  if (ext === 'md' || ext === 'markdown') return L_MD;
  if (ext === 'css') return L_CSS;
  return L_PLAIN;
}
/** Language shown in the status bar ('TSX' for .tsx files). */
export function langLabel(path: string): string {
  const l = langOf(path);
  if (l === L_TS) return path.endsWith('.tsx') ? 'TSX' : path.endsWith('.ts') ? 'TypeScript' : 'JavaScript';
  return LANG_NAMES[l];
}

const KEYWORDS: string[] = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'of', 'in', 'new',
  'class', 'extends', 'implements', 'import', 'export', 'from', 'type', 'interface', 'enum', 'this', 'super', 'async',
  'await', 'yield', 'break', 'continue', 'switch', 'case', 'default', 'throw', 'try', 'catch', 'finally', 'as', 'void',
  'static', 'readonly', 'private', 'public', 'protected', 'abstract', 'get', 'set', 'typeof', 'instanceof', 'using',
  'declare', 'namespace', 'keyof', 'delete'];
const CONSTANTS: string[] = ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'];

/** Appends a run, merging it with the previous one when the token is the same. */
function push(out: i32[], len: i32, tok: i32): void {
  if (len <= 0) return;
  if (out.length >= 2 && out[out.length - 1] === tok) out[out.length - 2] += len;
  else { out.push(len); out.push(tok); }
}
function isDigit(c: i32): boolean { return c >= 48 && c <= 57; }
function isIdStart(c: i32): boolean { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128; }
function isId(c: i32): boolean { return isIdStart(c) || isDigit(c); }
function isUpper(c: i32): boolean { return c >= 65 && c <= 90; }
/** First non-space character code at or after i (-1 at the end). */
function nextChar(s: string, i: i32): i32 {
  while (i < s.length && s.charCodeAt(i) === 32) i++;
  return i < s.length ? s.charCodeAt(i) : -1;
}
/** End of a quoted string starting at i (the quote), honouring backslash escapes; the line end if unterminated. */
function stringEnd(s: string, i: i32, q: i32): i32 {
  let j = i + 1;
  while (j < s.length && s.charCodeAt(j) !== q) j += s.charCodeAt(j) === 92 ? 2 : 1;
  return j < s.length ? j + 1 : s.length;
}

/** Tokenizes `line` of language `lang` starting in `state`; appends runs to `out`, returns the next line's state. */
export function tokenize(lang: i32, line: string, state: i32, out: i32[]): i32 {
  if (lang === L_TS) return tsLine(line, state, out);
  if (lang === L_JSON) { jsonLine(line, out); return S_NORMAL; }
  if (lang === L_MD) return mdLine(line, state, out);
  if (lang === L_CSS) return cssLine(line, state, out);
  push(out, line.length, T_TEXT);
  return S_NORMAL;
}

// ---- TypeScript / TSX
function tsLine(s: string, state: i32, out: i32[]): i32 {
  const n = s.length;
  let i: i32 = 0;
  if (state === S_COMMENT) {
    const e = s.indexOf('*/');
    if (e < 0) { push(out, n, T_COMMENT); return S_COMMENT; }
    push(out, e + 2, T_COMMENT); i = e + 2;
  } else if (state === S_TEMPLATE) {
    const e = templateEnd(s, 0);
    push(out, e, T_STRING); i = e;
    if (e >= n && !closesTemplate(s)) return S_TEMPLATE;
  }
  let inTag = false;       // between '<Tag' and '>' in TSX: identifiers before '=' are attributes
  let prev: i32 = 0;       // previous significant character (tells a JSX '<' from a comparison or generic)
  while (i < n) {
    const c = s.charCodeAt(i), d = i + 1 < n ? s.charCodeAt(i + 1) : 0;
    let j: i32 = i + 1, tok: i32 = T_TEXT;
    if (c === 32 || c === 9) { while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9)) j++; push(out, j - i, T_TEXT); i = j; continue; }
    if (c === 47 && d === 47) { push(out, n - i, T_COMMENT); return S_NORMAL; }
    if (c === 47 && d === 42) {
      const e = s.indexOf('*/', i + 2);
      if (e < 0) { push(out, n - i, T_COMMENT); return S_COMMENT; }
      j = e + 2; tok = T_COMMENT;
    } else if (c === 34 || c === 39) { j = stringEnd(s, i, c); tok = T_STRING; }
    else if (c === 96) {
      j = templateEnd(s, i + 1);
      push(out, j - i, T_STRING);
      if (j >= n && !(j - i >= 2 && s.charCodeAt(n - 1) === 96 && !escaped(s, n - 1))) return S_TEMPLATE;
      i = j; prev = 96; continue;
    } else if (isDigit(c) || (c === 46 && isDigit(d))) {
      while (j < n && (isId(s.charCodeAt(j)) || s.charCodeAt(j) === 46)) j++;
      tok = T_NUMBER;
    } else if (isIdStart(c)) {
      while (j < n && isId(s.charCodeAt(j))) j++;
      const w = s.slice(i, j), after = nextChar(s, j);
      if (inTag && (after === 61 || prev === 60 || prev === 47)) tok = prev === 60 || prev === 47 ? T_TAG : T_ATTR;
      else if (KEYWORDS.indexOf(w) >= 0) tok = T_KEYWORD;
      else if (CONSTANTS.indexOf(w) >= 0) tok = T_CONSTANT;
      else if (after === 40) tok = T_FN;
      else if (prev === 46) tok = T_PROPERTY;
      else if (isUpper(c)) tok = allCaps(w) ? T_CONSTANT : T_TYPE;
    } else if (c === 60 && (isIdStart(d) || d === 47 || d === 62) && !(isId(prev) || prev === 41 || prev === 93)) {
      // a JSX tag opens: '<Tag', '</Tag', '<>'
      inTag = true; tok = T_PUNCT;
      if (d === 47) j = i + 2;
    } else if (c === 62 && inTag) { inTag = false; tok = T_PUNCT; }
    else tok = T_PUNCT;
    push(out, j - i, tok);
    prev = s.charCodeAt(j - 1);
    if (tok === T_TAG || tok === T_TYPE || tok === T_FN || tok === T_TEXT || tok === T_CONSTANT || tok === T_PROPERTY) prev = 97;   // an identifier
    else if (tok === T_KEYWORD) prev = 32;   // `return <View>`: JSX may follow a keyword
    i = j;
  }
  return S_NORMAL;
}
function allCaps(w: string): boolean {
  if (w.length < 2) return false;
  for (let i = 0; i < w.length; i++) { const c = w.charCodeAt(i); if (!(isUpper(c) || isDigit(c) || c === 95)) return false; }
  return true;
}
function escaped(s: string, i: i32): boolean { let k: i32 = 0; while (i - 1 - k >= 0 && s.charCodeAt(i - 1 - k) === 92) k++; return k % 2 === 1; }
/** End (after the closing backquote) of a template string whose content starts at i; the line end if open. */
function templateEnd(s: string, i: i32): i32 {
  let j = i;
  while (j < s.length && s.charCodeAt(j) !== 96) j += s.charCodeAt(j) === 92 ? 2 : 1;
  return j < s.length ? j + 1 : s.length;
}
function closesTemplate(s: string): boolean {
  for (let j = 0; j < s.length; j++) { const c = s.charCodeAt(j); if (c === 92) j++; else if (c === 96) return true; }
  return false;
}

// ---- JSON
function jsonLine(s: string, out: i32[]): void {
  const n = s.length;
  let i: i32 = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    let j: i32 = i + 1, tok: i32 = T_PUNCT;
    if (c === 32 || c === 9) { while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9)) j++; tok = T_TEXT; }
    else if (c === 34) { j = stringEnd(s, i, c); tok = nextChar(s, j) === 58 ? T_PROPERTY : T_STRING; }
    else if (isDigit(c) || c === 45) { while (j < n && (isId(s.charCodeAt(j)) || s.charCodeAt(j) === 46 || s.charCodeAt(j) === 45 || s.charCodeAt(j) === 43)) j++; tok = T_NUMBER; }
    else if (isIdStart(c)) { while (j < n && isId(s.charCodeAt(j))) j++; tok = T_CONSTANT; }
    push(out, j - i, tok);
    i = j;
  }
}

// ---- Markdown
function mdLine(s: string, state: i32, out: i32[]): i32 {
  let lead: i32 = 0;
  while (lead < s.length && s.charCodeAt(lead) === 32) lead++;
  const t = s.slice(lead);
  if (t.startsWith('```')) { push(out, s.length, T_COMMENT); return state === S_FENCE ? S_NORMAL : S_FENCE; }
  if (state === S_FENCE) { push(out, s.length, T_STRING); return S_FENCE; }
  if (t.startsWith('#')) { push(out, s.length, T_HEADING); return S_NORMAL; }
  if (t.startsWith('>')) { push(out, s.length, T_COMMENT); return S_NORMAL; }
  let i: i32 = lead;
  push(out, i, T_TEXT);
  // list markers and task boxes
  if (t.startsWith('- ') || t.startsWith('* ') || t.startsWith('+ ')) { push(out, 2, T_KEYWORD); i += 2; }
  else {
    let k: i32 = 0;
    while (k < t.length && isDigit(t.charCodeAt(k))) k++;
    if (k > 0 && t.slice(k, k + 2) === '. ') { push(out, k + 2, T_KEYWORD); i += k + 2; }
  }
  if (s.slice(i, i + 4) === '[ ] ' || s.slice(i, i + 4) === '[x] ') { push(out, 3, T_CONSTANT); i += 3; }
  const n = s.length;
  while (i < n) {
    const c = s.charCodeAt(i);
    let j: i32 = i + 1, tok: i32 = T_TEXT;
    if (c === 96) { const e = s.indexOf('`', i + 1); j = e < 0 ? n : e + 1; tok = T_STRING; }
    else if (c === 42 || c === 95) {
      // *emphasis* and **strong**
      const mark = s.charCodeAt(i + 1) === c ? s.slice(i, i + 2) : s.slice(i, i + 1);
      const e = s.indexOf(mark, i + mark.length);
      if (e > i + mark.length) { j = e + mark.length; tok = mark.length === 2 ? T_CONSTANT : T_KEYWORD; }
    } else if (c === 91) {
      // [text](url)
      const close = s.indexOf('](', i);
      const end = close < 0 ? -1 : s.indexOf(')', close);
      if (close > i && end > close) { push(out, close + 1 - i, T_LINK); push(out, end + 1 - close - 1, T_COMMENT); i = end + 1; continue; }
    } else if (c === 124) tok = T_PUNCT;
    else { while (j < n && !isMdSpecial(s.charCodeAt(j))) j++; }
    push(out, j - i, tok);
    i = j;
  }
  return S_NORMAL;
}
function isMdSpecial(c: i32): boolean { return c === 96 || c === 42 || c === 95 || c === 91 || c === 124; }

// ---- CSS
function cssLine(s: string, state: i32, out: i32[]): i32 {
  const n = s.length;
  let rule = (state & S_CSS_RULE) !== 0, comment = (state & S_COMMENT) !== 0;
  let i: i32 = 0, value = false;
  while (i < n) {
    const c = s.charCodeAt(i), d = i + 1 < n ? s.charCodeAt(i + 1) : 0;
    let j: i32 = i + 1, tok: i32 = T_PUNCT;
    if (comment) {
      const e = s.indexOf('*/', i);
      j = e < 0 ? n : e + 2; tok = T_COMMENT;
      if (e >= 0) comment = false;
    } else if (c === 47 && d === 42) { comment = true; push(out, 2, T_COMMENT); i += 2; continue; }
    else if (c === 32 || c === 9) { while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9)) j++; tok = T_TEXT; }
    else if (c === 123) { rule = true; value = false; }
    else if (c === 125) { rule = false; value = false; }
    else if (c === 58 && rule) value = true;
    else if (c === 59) value = false;
    else if (c === 34 || c === 39) { j = stringEnd(s, i, c); tok = T_STRING; }
    else if (c === 35 && value) { while (j < n && isId(s.charCodeAt(j))) j++; tok = T_CONSTANT; }
    else if (isDigit(c) || (c === 46 && isDigit(d)) || (c === 45 && isDigit(d))) { while (j < n && (isId(s.charCodeAt(j)) || s.charCodeAt(j) === 46 || s.charCodeAt(j) === 37)) j++; tok = T_NUMBER; }
    else if (isId(c) || c === 45 || c === 46 || c === 35) {
      while (j < n && (isId(s.charCodeAt(j)) || s.charCodeAt(j) === 45)) j++;
      tok = !rule ? (c === 46 || c === 35 ? T_TYPE : T_TAG) : value ? T_TEXT : T_PROPERTY;
      if (rule && value && nextChar(s, j) === 40) tok = T_FN;
    }
    push(out, j - i, tok);
    i = j;
  }
  return (rule ? S_CSS_RULE : 0) | (comment ? S_COMMENT : 0);
}
