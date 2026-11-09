// Shared by Inspector and the kit. Paths are RFC 6901 JSON Pointers, including empty keys.
export enum JsonStatus { Parsed, Invalid }
export class JsonDocument {
  value: any; error: string; status: JsonStatus;
  constructor(value: any, error: string, status: JsonStatus) { this.value = value; this.error = error; this.status = status; }
}
export function parseJsonDocument(source: string): JsonDocument {
  try { return new JsonDocument(JSON.parse(source), '', JsonStatus.Parsed); }
  catch (e) { return new JsonDocument(null, e.message, JsonStatus.Invalid); }
}
export class JsonLine {
  depth: i32 = 0; path: string = ''; key: string = ''; text: string = '';
  position: i32 = 1; size: i32 = 1;
  kind: string = 'string'; fold: i32 = 0; count: i32 = 0;
}
export function jsonPath(parent: string, key: string): string { return parent + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'); }
export function jsonValueLines(value: any, toggled: string[], expandDepth: i32 = 2): JsonLine[] {
  const out: JsonLine[] = [];
  const walk = (v: any, key: string, path: string, depth: i32, position: i32, size: i32): void => {
    const row = new JsonLine();
    row.key = key; row.path = path; row.depth = depth; row.position = position; row.size = size;
    out.push(row);
    if (v === null || typeof v !== 'object') {
      row.kind = v === null ? 'null' : typeof v;
      row.text = JSON.stringify(v);
      return;
    }
    const array = Array.isArray(v), keys = Object.keys(v);
    row.count = keys.length; row.kind = array ? 'array' : 'object';
    row.text = array ? '[' + row.count + ' items]' : '{' + row.count + ' keys}';
    const open = depth < expandDepth !== (toggled.indexOf(path) >= 0);
    row.fold = keys.length === 0 ? 0 : open ? 1 : 2;
    if (!open) return;
    for (let i: i32 = 0; i < keys.length; i++) { const k = keys[i]; walk(v[k], k, jsonPath(path, k), depth + 1, i + 1, keys.length); }
  };
  walk(value, '', '', 0, 1, 1);
  return out;
}
