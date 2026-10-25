// A Notion page as Markdown, through the official API (https://developers.notion.com/reference): GET /pages/{id} for the title, then
// GET /blocks/{id}/children, every page of it (start_cursor, page_size 100), and the children of each block that has some (nested
// lists, toggles, columns, tables). Version 2026-03-11 (the Notion-Version header). The integration's token is a Bearer token.
import * as net from 'zinc:net';
import { NOTION_API, NOTION_VERSION, REQUEST_TIMEOUT_MS } from './constants';

const MAX_DEPTH: i32 = 8;

/** The page id of a Notion URL or id: its last 32 hex digits (dashes or not); '' when there are none. */
export function pageId(s: string): string {
  let t = s.trim().split('?')[0].split('#')[0].split('-').join('');
  const hex = (c: string): boolean => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
  let n: i32 = 0;
  for (let i: i32 = t.length - 1; i >= 0 && hex(t.charAt(i)); i--) n++;
  if (n < 32) return '';
  t = t.slice(t.length - 32).toLowerCase();
  return t.slice(0, 8) + '-' + t.slice(8, 12) + '-' + t.slice(12, 16) + '-' + t.slice(16, 20) + '-' + t.slice(20);
}

function sleep(ms: i32): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }

export class Notion {
  token: string;
  requests: i32 = 0;
  constructor(token: string) { this.token = token; }

  private async get(path: string): Promise<any> {
    for (let attempt: i32 = 0; ; attempt++) {
      const h = new net.Headers();
      h.set('Authorization', 'Bearer ' + this.token);
      h.set('Notion-Version', NOTION_VERSION);
      let r: net.Response;
      try { r = await net.fetch(NOTION_API + path, { headers: h, timeoutMs: REQUEST_TIMEOUT_MS }); }
      catch (e) { throw new Error('Cannot reach Notion (' + e.message + '): is the tablet on Wi-Fi with internet?'); }
      this.requests++;
      if (r.status === 429 && attempt < 3) {   // rate limited: wait as Retry-After says (seconds)
        const s = parseInt(r.headers.get('retry-after'));
        await sleep(((s > 0 && s < 30) ? s : 1) * 1000);
        continue;
      }
      if (r.status === 401) throw new Error('Notion refused the token: copy the integration\'s secret into Settings.');
      if (r.status === 404) throw new Error('Notion cannot find the page: share it with the integration (… menu, Connections).');
      if (!r.ok) throw new Error('Notion answered ' + r.status.toString() + ': ' + (await r.text()).slice(0, 200));
      return await r.json();
    }
  }

  /** Every child block of `id`, in order (all the pages of the list). */
  private async children(id: string): Promise<any[]> {
    const out: any[] = [];
    let cursor = '';
    while (true) {
      const j = await this.get('/blocks/' + id + '/children?page_size=100' + (cursor !== '' ? '&start_cursor=' + encodeURIComponent(cursor) : ''));
      for (let i: i32 = 0; i < j.results.length; i++) out.push(j.results[i]);
      if (j.has_more !== true || j.next_cursor === null) break;
      cursor = '' + j.next_cursor;
    }
    return out;
  }

  /** The page `id` as Markdown: '# title', then its blocks. */
  async page(id: string): Promise<string[]> {
    const p = await this.get('/pages/' + id);
    // the title property: "title" on a page, often "Name" on a database row
    // ponytail: no key iteration on a parsed JSON value yet, so the two usual names; another name gives 'Untitled'
    let title = '';
    const props = p.properties;
    if (props.title !== undefined && props.title.type === 'title') title = rich(props.title.title, false);
    else if (props.Name !== undefined && props.Name.type === 'title') title = rich(props.Name.title, false);
    const lines: string[] = ['# ' + (title !== '' ? title : 'Untitled'), ''];
    await this.blocks(id, '', 0, lines);
    return [title, lines.join('\n') + '\n'];
  }

  private async blocks(id: string, indent: string, depth: i32, out: string[]): Promise<void> {
    const list = await this.children(id);
    let num: i32 = 1;
    for (let i: i32 = 0; i < list.length; i++) {
      const b = list[i];
      const type: string = '' + b.type;
      if (type !== 'numbered_list_item') num = 1;
      const d = b[type];
      const text: string = d !== null && d !== undefined && d.rich_text !== undefined ? rich(d.rich_text, type === 'code') : '';
      const nested = b.has_children === true && depth < MAX_DEPTH && type !== 'child_page' && type !== 'child_database';
      let sub = indent;   // where the children go
      let blank = true;
      if (type === 'paragraph') out.push(indent + text);
      else if (type.startsWith('heading_')) out.push('#'.repeat(Math.min(6, parseInt(type.slice(8))) as i32) + ' ' + text);
      else if (type === 'bulleted_list_item' || type === 'toggle') { out.push(indent + '- ' + text); sub = indent + '  '; blank = false; }
      else if (type === 'numbered_list_item') { out.push(indent + num.toString() + '. ' + text); num++; sub = indent + '   '; blank = false; }
      else if (type === 'to_do') { out.push(indent + (d.checked === true ? '- [x] ' : '- [ ] ') + text); sub = indent + '  '; blank = false; }
      else if (type === 'quote' || type === 'callout') {
        const icon: string = type === 'callout' && d.icon !== null && d.icon !== undefined && d.icon.type === 'emoji' ? '' + d.icon.emoji + ' ' : '';
        for (const l of (icon + text).split('\n')) out.push(indent + '> ' + l);
        sub = indent + '> ';
      } else if (type === 'code') {
        const lang: string = d.language === 'plain text' ? '' : '' + d.language;
        out.push(indent + '```' + lang);
        for (const l of text.split('\n')) out.push(indent + l);
        out.push(indent + '```');
      } else if (type === 'divider') out.push(indent + '---');
      else if (type === 'equation') out.push(indent + '`' + d.expression + '`');
      else if (type === 'image') {
        const url: string = d.type === 'external' ? '' + d.external.url : '' + d.file.url;
        out.push(indent + '![' + rich(d.caption, false) + '](' + url + ')');
      } else if (type === 'bookmark' || type === 'embed' || type === 'link_preview') out.push(indent + '<' + d.url + '>');
      else if (type === 'child_page') out.push(indent + '**' + d.title + '** (a Notion sub-page)');
      else if (type === 'table') {
        if (nested) await this.table(b.id, indent, out);
        out.push('');
        continue;
      } else if (type !== 'column_list' && type !== 'column' && type !== 'synced_block') continue;   // unsupported: skipped
      if (blank && type !== 'column_list' && type !== 'column' && type !== 'synced_block') out.push('');
      if (nested) await this.blocks(b.id, sub, depth + 1, out);
      if (!blank && (i + 1 >= list.length || list[i + 1].type !== type)) out.push('');
    }
  }

  private async table(id: string, indent: string, out: string[]): Promise<void> {
    const rows = await this.children(id);
    for (let r: i32 = 0; r < rows.length; r++) {
      const cells = rows[r].table_row.cells;
      const cs: string[] = [];
      for (let c: i32 = 0; c < cells.length; c++) cs.push(rich(cells[c], false).split('|').join('\\|').split('\n').join(' '));
      out.push(indent + '| ' + cs.join(' | ') + ' |');
      if (r === 0) out.push(indent + '|' + cs.map((s: string) => '---').join('|') + '|');
    }
  }
}

/** Notion rich text as Markdown: bold, italic, strikethrough, code and links; `verbatim` (a code block) keeps the plain text. */
export function rich(items: any, verbatim: boolean): string {
  if (items === null || items === undefined) return '';
  let s = '';
  for (let i: i32 = 0; i < items.length; i++) {
    const t = items[i];
    let v: string = '' + t.plain_text;
    if (verbatim) { s += v; continue; }
    const a = t.annotations;
    if (a !== null && a !== undefined && a.code === true) v = '`' + v + '`';
    else {
      v = escape(v);
      if (a !== null && a !== undefined) {
        if (a.bold === true) v = '**' + v + '**';
        if (a.italic === true) v = '*' + v + '*';
        if (a.strikethrough === true) v = '~~' + v + '~~';
      }
    }
    if (t.href !== null && t.href !== undefined && ('' + t.href) !== '') v = '[' + v + '](' + t.href + ')';
    s += v;
  }
  return s;
}
function escape(s: string): string {
  let o = '';
  for (const c of s.split('')) o += c === '\\' || c === '*' || c === '_' || c === '`' || c === '[' || c === ']' || c === '<' ? '\\' + c : c;
  return o;
}
