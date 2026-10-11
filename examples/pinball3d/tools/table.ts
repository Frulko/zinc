// The table tool: what someone who edits a table file by hand needs.
//   zinc run examples/pinball3d/tools/table.ts -- check <table>     every fault of the file, with the path of each value
//   zinc run examples/pinball3d/tools/table.ts -- format <table>    rewrites table.json in the canonical form (what the game and the editor write)
//   zinc run examples/pinball3d/tools/table.ts -- print <table>     the canonical form on the output, the file untouched
//   zinc run examples/pinball3d/tools/table.ts -- pack <table> <file.zpinball>   the table and its files as one package to share
//   zinc run examples/pinball3d/tools/table.ts -- doc <table>       docs/pinball-table-format.md, its examples taken from that table
// <table> is a table folder, the table.json in it, or a package.
import * as fs from 'zinc:fs';
import { args, exit } from 'zinc:sys';
import { Schema, Field, Kind, write } from '../src/format/schema';
import { FORMAT, VERSION, ROLES } from '../src/format/table-schema';
import { Table, TableError, TABLE_FILE, loadTable, saveTable, formatSchema, filesOf } from '../src/format/table';
import { openTable, packTable, PACKAGE_EXT, PACKAGE_FORMAT } from '../src/format/source';

/** The type of a field as the reference shows it, with its unit and its role. */
function typeOf(f: Field): string {
  const t = kindOf(f);
  return `${t}${f.unit === '' ? '' : `, ${f.unit}`}${f.role === '' ? '' : ` (*${f.role}*)`}`;
}
function kindOf(f: Field): string {
  if (f.kind === Kind.Num) return 'number';
  if (f.kind === Kind.Int) return 'whole number';
  if (f.kind === Kind.Bool) return 'true / false';
  if (f.kind === Kind.Text) return 'text';
  if (f.kind === Kind.Color) return 'colour';
  if (f.kind === Kind.Choice) return f.choices.map((c: string) => `\`"${c}"\``).join(' ');
  if (f.kind === Kind.Ref) return `name of ${f.to.split('|').join(' / ')}`;
  if (f.kind === Kind.Asset) return `${f.to} file`;
  if (f.kind === Kind.Tuple) return `${f.cols} numbers`;
  if (f.kind === Kind.Rows) return f.cols === f.maxCols ? `rows of ${f.cols} numbers` : `rows of ${f.cols} or ${f.maxCols} numbers`;
  if (f.kind === Kind.Texts) return 'list of texts';
  const of = f.of as Schema;
  return f.kind === Kind.List ? `list of [${of.name}](#${anchor(of.name)})` : `[${of.name}](#${anchor(of.name)})`;
}
function anchor(name: string): string { return name.split(' ').join('-'); }
function defaultOf(f: Field): string {
  if (f.required) return 'required';
  if (f.kind === Kind.List || f.kind === Kind.Obj || f.kind === Kind.Rows || f.kind === Kind.Texts) return '';
  if (f.kind === Kind.Ref || f.kind === Kind.Asset) return 'none';
  let d = JSON.stringify(f.def);
  if (f.kind === Kind.Tuple) d = d.split(',').join(', ');
  let lim = '';
  if (f.kind === Kind.Num || f.kind === Kind.Int) {
    if (f.min > -1e300 && f.max < 1e300) lim = ` (${f.min} to ${f.max})`;
    else if (f.min > -1e300) lim = ` (${f.min} or more)`;
  }
  return `\`${d}\`${lim}`;
}

/** The first value of this schema found in the table, as the file would hold it; '' when the table has none. */
function example(root: Schema, data: any, want: Schema): string {
  for (const f of root.fields) {
    const x: any = data[f.name];
    if (f.of === null || x === undefined) continue;
    const of = f.of as Schema;
    if (f.kind === Kind.Obj) {
      if (of === want) { const t = write(of, x, ''); return t === '{}' ? '' : `"${f.name}": ${t}`; }
      const inner = example(of, x, want);
      if (inner !== '') return inner;
    } else if (f.kind === Kind.List) {
      for (let i = 0; i < x.length; i++) {
        if (of === want) return write(of, x[i], '');
        const inner = example(of, x[i], want);
        if (inner !== '') return inner;
      }
    }
  }
  return '';
}

function sections(s: Schema, seen: Schema[]): void {
  if (seen.indexOf(s) >= 0) return;
  seen.push(s);
  for (const f of s.fields) if (f.of !== null) sections(f.of as Schema, seen);
}

function doc(t: Table): string {
  const root = formatSchema();
  const all: Schema[] = [];
  sections(root, all);
  const out: string[] = [];
  out.push('# The pinball table format');
  out.push('');
  out.push(`A table of \`examples/pinball3d\` is one JSON file, \`${TABLE_FILE}\`, with the files it names beside it (models, images, sounds). Nothing about a table is in the`);
  out.push('game\'s code: the game, and the editor, read this file. This page is the reference of every field. It is printed from the format\'s own');
  out.push('definition (`examples/pinball3d/src/format/table-schema.ts`) by `zinc run examples/pinball3d/tools/table.ts -- doc <table>`, with its examples');
  out.push(`taken from the table "${t.def.name}"; a test keeps it current. Format \`"${FORMAT}"\`, version ${VERSION}.`);
  out.push('');
  out.push('## The file');
  out.push('');
  out.push('- **A folder or a package.** While one works on a table it is a folder: `table.json` and its files. To share it,');
  out.push(`  \`tools/table.ts -- pack\`, or Export in the editor, writes one package file (\`${PACKAGE_EXT}\`). The game opens both.`);
  out.push(`- **The package.** A \`${PACKAGE_EXT}\` file is JSON: \`{ "format": "${PACKAGE_FORMAT}", "version": 1, "files": [...] }\`. \`files\` holds`);
  out.push(`  \`${TABLE_FILE}\` first, then every file the table names (the sounds, the images, the models), each as \`{ "name": "sounds/example.wav", "base64": "..." }\`,`);
  out.push('  or `{ "name": "models/example.obj", "text": "..." }` for a file that is text (.json, .obj, .txt, .svg). A name is the path the table gives the file, from the');
  out.push('  table folder. Making a package fails, naming the file, when the table names a file its folder does not have.');
  out.push('- **Checked.** A file is checked when it is loaded, and every fault is reported at once with the path of the value:');
  out.push('  `flippers[1].length: must be a number from 2 to 30, not "long"`, `bumpers[0].surfce: unknown field (did you mean "surface"?)`,');
  out.push('  `rules.when[3].do[0].target: "lanez" is not one of the lights or light groups (lane1, lane2, lane3, lanes)`. `tools/table.ts -- check` prints them.');
  out.push('- **One canonical text.** The game and the editor write a table in one form: the fields in the order of this page, a field that');
  out.push('  holds its default left out, a row of numbers on one line. Loading that text and saving it again gives the same bytes, so a table');
  out.push('  edited by hand, formatted (`tools/table.ts -- format`) and edited in the editor keeps a readable history. A field that is absent');
  out.push('  has its default; a field this page does not list is a fault (a typo is never silently ignored).');
  out.push(`- **Versioned.** \`version\` is ${VERSION}. A game refuses a file of a later version and says so.`);
  out.push('');
  out.push('## Conventions');
  out.push('');
  out.push('- **Lengths** are centimetres, **speeds** cm/s, **angles** degrees.');
  out.push('- **The top view.** x goes to the right and y down the table, towards the player; (0, 0) is the top left corner of the playfield.');
  out.push('  An angle of 0 points right, 90 points down the table, -90 up the table.');
  out.push('- **Heights.** z is the height above the playfield. Every element has a `z`, the level it stands on: 0 on the playfield, 5 on');
  out.push('  a floor whose `z` is 5. The physics is in three dimensions: a ball can climb, ride a rail above the playfield, fall, jump over a wall.');
  out.push('- **Paths.** A wall, a ramp or a floor follows a path drawn in the top view: a row `[x, y]` per point. A row `[x, y, bulge]` makes the');
  out.push('  stretch from that point to the next an arc: the bulge is the height of the arc over half its chord (0.4142 a quarter circle,');
  out.push('  1 a half circle), positive when the arc is to the left of the direction of travel as the top view shows it. A ramp adds a **profile**: its');
  out.push('  height along the path, as rows `[fraction of the length, height]`. An editor shows a path as a line with handles and a profile as a curve.');
  out.push('- **Names.** Elements, lights, surfaces, looks, sounds and missions have an `id`; other fields refer to them by it, and the name must exist.');
  out.push('  A `group` is a name several elements share. `"game"` stands for the game itself in rules.');
  out.push('- **Colours** are `"#rrggbb"`.');
  out.push('- **Roles.** The type of some fields ends with a role in brackets: what its numbers stand for in space. An editor draws, moves and turns');
  out.push('  any element by the roles of its fields, without knowing their names.');
  for (const r of ROLES) out.push(`  *${r[0]}*: ${r[1]}.`);
  out.push('');
  for (const s of all) {
    out.push(`## ${s.name}`);
    out.push('');
    out.push(s.doc);
    out.push('');
    out.push('| field | type | default | |');
    out.push('|---|---|---|---|');
    for (const f of s.fields) out.push(`| \`${f.name}\` | ${typeOf(f)} | ${defaultOf(f)} | ${f.doc} |`);
    out.push('');
    const vs = s.variants;
    if (vs !== null) {
      // what each kind reads: the loader checks by these lines, and the editor builds a ${s.name} from them
      out.push(`What each \`${vs.kind}\` reads; the other fields are ignored for it:`);
      out.push('');
      out.push(`| \`${vs.kind}\` | \`${vs.target}\` | \`${vs.way}\` | numbers |`);
      out.push('|---|---|---|---|');
      for (const v of vs.all) {
        const aim: string[] = [];
        if (v.names !== '') aim.push(`one of the ${v.names.split('|').join(' or ')}${v.among === '' ? '' : ` (of \`${v.among}\`)`}`);
        for (const w of v.words) aim.push(`"${w}"`);
        if (v.text) aim.push('a text');
        out.push(`| \`${v.word}\` | ${aim.join(', ')} | ${v.ways.map((w: string) => w === '' ? '(none)' : w).join(', ')} | ${v.numbers.map((n: string) => n.indexOf(':') < 0 ? `\`${n}\`${v.nonZero ? ', not 0' : ''}` : `\`${n.slice(0, n.indexOf(':'))}\` with ${n.slice(n.indexOf(':') + 1)}`).join(', ')} |`);
      }
      out.push('');
    }
    if (s === root) { out.push(`A whole file: the \`${TABLE_FILE}\` of "${t.def.name}", in \`examples/pinball3d/assets/tables/\`.`); out.push(''); }
    let ex = s === root ? '' : example(root, t.data, s);
    if (ex === '') ex = s.sample;
    if (ex !== '') { out.push('```json'); out.push(ex); out.push('```'); out.push(''); }
  }
  return out.join('\n');
}

function main(): i32 {
  const a = args();
  if (a.length < 2) { console.log('usage: table.ts -- check | format | print | doc <table>, or pack <table> <file.zpinball>'); return 2; }
  let t: Table;
  try { t = loadTable(openTable(a[1])); } catch (e) {
    console.log((e as Error).message);
    return 1;
  }
  if (a[0] === 'check') console.log(`${a[1]}: "${t.def.name}" is a valid table (version ${t.def.version})`);
  else if (a[0] === 'print') console.log(saveTable(t).trimEnd());
  else if (a[0] === 'format') {
    if (a[1].endsWith(PACKAGE_EXT)) { console.log('format: a package is not rewritten; unpack it into a folder first'); return 2; }
    const file = a[1].endsWith('.json') ? a[1] : `${a[1]}/${TABLE_FILE}`;
    const text = saveTable(t);
    if (fs.readText(file) === text) console.log(`${file}: already in the canonical form`);
    else { fs.writeText(file, text); console.log(`${file}: rewritten in the canonical form`); }
  } else if (a[0] === 'pack') {
    if (a.length < 3) { console.log('pack: the package file to write is missing'); return 2; }
    const src = openTable(a[1]);
    const files: string[] = [TABLE_FILE];
    for (const f of filesOf(t.def)) files.push(f);
    fs.writeText(a[2], packTable(src, files));
    console.log(`${a[2]}: "${t.def.name}" with ${files.length - 1} file(s)`);
  } else if (a[0] === 'doc') console.log(doc(t));
  else { console.log(`unknown command "${a[0]}"`); return 2; }
  return 0;
}
exit(main());
