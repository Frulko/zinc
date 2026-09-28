// zinc:ui/kit — virtual keyboard layouts (i18n). A layout is plain data, so an app adds its own with
// `registerLayout(new KeyboardLayout(...))`.
//
// Rows are strings of keys separated by spaces. Special keys are written in braces, with an optional width in
// key units: {shift:1.5}. Special keys:
//   {shift}  one-shot capitals; a double tap locks them        {bksp}  backspace (repeats while held)
//   {enter}  Enter (commits a field, new line in a textarea)   {space} space bar (shows the layout name)
//   {sym} {sym2} {abc}  symbol pages and back to letters       {lang}  next layout
//   {hide}   closes the keyboard (blurs the field)             {left} {right} {tab}  caret keys
// The shifted page is the letters page upper-cased unless `shiftRows` is given. `accents` lists the variants a long
// press on a key offers (the first variant is where the finger lands).

export class KeyboardLayout {
  id: string;            // 'fr'
  name: string;          // shown on the space bar: 'Français'
  rows: string[];        // letters page
  shiftRows: string[];   // [] = rows upper-cased
  accents: Map<string, string>;
  enter: string;         // localized key captions
  search: string;
  done: string;
  constructor(id: string, name: string, rows: string[], accents: string, enter: string, search: string, done: string, shiftRows: string[] = []) {
    this.id = id; this.name = name; this.rows = rows; this.shiftRows = shiftRows;
    this.enter = enter; this.search = search; this.done = done;
    // accents: "e:éèêëē a:àâæáä" -> key -> variants
    this.accents = new Map<string, string>();
    for (const part of accents.split(' ')) {
      const c = part.indexOf(':');
      if (c > 0) this.accents.set(part.slice(0, c), part.slice(c + 1));
    }
  }
}

const BOTTOM = '{sym:1.5} {lang} {space:5} {enter:2}';
const BOTTOM_EMAIL = '{sym:1.5} {lang} @ {space:3} . {enter:2}';
const BOTTOM_URL = '{sym:1.5} {lang} / {space:3} . {enter:2}';

/** Symbol pages, shared by the letter layouts. */
export const SYMBOLS: string[] = [
  '1 2 3 4 5 6 7 8 9 0',
  '- / : ; ( ) € $ & @',
  '{sym2:1.5} . , ? ! \' " % {bksp:1.5}',
  '{abc:1.5} {lang} {space:5} {enter:2}',
];
export const SYMBOLS2: string[] = [
  '[ ] { } # ^ * + = _',
  '\\ | ~ < > £ ¥ • ° §',
  '{sym:1.5} . , ? ! \' ` … {bksp:1.5}',
  '{abc:1.5} {lang} {space:5} {enter:2}',
];
/** Digit pads for inputMode numeric / decimal / tel. */
export const NUMERIC: string[] = ['1 2 3', '4 5 6', '7 8 9', '{hide} 0 {bksp}'];
export const DECIMAL: string[] = ['1 2 3', '4 5 6', '7 8 9', ', 0 . {bksp}'];
export const PHONE: string[] = ['1 2 3', '4 5 6', '7 8 9', '* 0 # {bksp}', '+ {space:2} {enter}'];

const LATIN_ACCENTS = 'a:àáâäæãåā c:çćč e:éèêëēėę i:îïíīįì n:ñń o:ôöòóœøōõ s:ßśš u:ûüùúū y:ÿ z:žźż';

// built on first use: programs that import the kit without a keyboard pay nothing (small heaps: ESP32, PS1)
let LAYOUTS: KeyboardLayout[] = [];
function layouts(): KeyboardLayout[] {
  if (LAYOUTS.length === 0) LAYOUTS = builtIn();
  return LAYOUTS;
}
function builtIn(): KeyboardLayout[] { return [
  new KeyboardLayout('en', 'English', ['q w e r t y u i o p', 'a s d f g h j k l', '{shift:1.5} z x c v b n m {bksp:1.5}', BOTTOM],
    LATIN_ACCENTS, 'return', 'search', 'done'),
  new KeyboardLayout('fr', 'Français', ['a z e r t y u i o p', 'q s d f g h j k l m', '{shift:1.5} w x c v b n \' {bksp:1.5}', BOTTOM],
    'e:éèêëē a:àâæáä u:ùûüú i:îïí o:ôœöó c:çćč y:ÿ n:ñ', 'entrée', 'rechercher', 'OK'),
  new KeyboardLayout('de', 'Deutsch', ['q w e r t z u i o p ü', 'a s d f g h j k l ö ä', '{shift:1.5} y x c v b n m ß {bksp:1.5}', BOTTOM],
    'a:äàáâ o:öóòô u:üúùû s:ßś e:éèêë', 'Eingabe', 'Suchen', 'Fertig'),
  new KeyboardLayout('es', 'Español', ['q w e r t y u i o p', 'a s d f g h j k l ñ', '{shift:1.5} z x c v b n m {bksp:1.5}', BOTTOM],
    'a:áàäâ e:éèëê i:íìïî o:óòöô u:úüùû n:ñ ?:¿ !:¡ c:ç', 'intro', 'buscar', 'listo'),
  new KeyboardLayout('it', 'Italiano', ['q w e r t y u i o p', 'a s d f g h j k l', '{shift:1.5} z x c v b n m {bksp:1.5}', BOTTOM],
    'a:àáâä e:èéêë i:ìíîï o:òóôö u:ùúûü', 'invio', 'cerca', 'fine'),
  new KeyboardLayout('pt', 'Português', ['q w e r t y u i o p', 'a s d f g h j k l ç', '{shift:1.5} z x c v b n m {bksp:1.5}', BOTTOM],
    'a:ãáàâä e:éêèë i:íìî o:õóôòö u:úüù c:ç', 'enter', 'pesquisar', 'ok'),
  new KeyboardLayout('sv', 'Svenska', ['q w e r t y u i o p å', 'a s d f g h j k l ö ä', '{shift:1.5} z x c v b n m {bksp:1.5}', BOTTOM],
    'a:äåàá o:öøó e:éè u:ü', 'retur', 'sök', 'klar'),
  new KeyboardLayout('ru', 'Русский', ['й ц у к е н г ш щ з х', 'ф ы в а п р о л д ж э', '{shift:1.5} я ч с м и т ь б ю {bksp:1.5}', BOTTOM],
    'е:ё ь:ъ', 'ввод', 'поиск', 'готово'),
  new KeyboardLayout('el', 'Ελληνικά', ['; ς ε ρ τ υ θ ι ο π', 'α σ δ φ γ η ξ κ λ', '{shift:1.5} ζ χ ψ ω β ν μ {bksp:1.5}', BOTTOM],
    'α:ά ε:έ η:ή ι:ίϊΐ ο:ό υ:ύϋΰ ω:ώ', 'εισαγωγή', 'αναζήτηση', 'τέλος'),
]; }

/** Adds (or replaces) a layout. */
export function registerLayout(l: KeyboardLayout): void {
  const all = layouts();
  const i = all.findIndex((x: KeyboardLayout) => x.id === l.id);
  if (i >= 0) all[i] = l; else all.push(l);
}
/** The layout with this id ('en' when unknown). */
export function layoutOf(id: string): KeyboardLayout {
  const all = layouts();
  for (const l of all) if (l.id === id) return l;
  return all[0];
}
export function layoutIds(): string[] { return layouts().map((l: KeyboardLayout) => l.id); }

/** Letters page for an email / URL field: `@`, `/` and `.` next to a shorter space bar. */
export function withBottom(rows: string[], mode: i32): string[] {
  if (mode !== 4 && mode !== 5) return rows;
  const out = rows.slice(0, rows.length - 1);
  out.push(mode === 4 ? BOTTOM_EMAIL : BOTTOM_URL);
  return out;
}
