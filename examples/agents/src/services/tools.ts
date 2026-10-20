// How a tool call reads in the chat: its icon, a one-line summary of its input (the command, the file, the size of a
// diff) and the detail shown when its card is opened. The three CLIs name the same tools differently (Bash, shell,
// command_execution): one table covers them.
import { head } from './stream';
import { isAgentTool } from './agents';

/** The detail of an input shown in an open card, at most. */
export const DETAIL_CAP = 4096;
/** Lines of a diff or a written file shown in the detail. */
const DETAIL_LINES = 40;

/** The Lucide icon of a tool (each is listed in zinc.json "icons"). */
export function toolIcon(name: string): string {
  const n = name.toLowerCase();
  if (isAgentTool(name)) return 'bot';
  if (n === 'bash' || n === 'shell' || n === 'bashoutput' || n === 'killshell') return 'square-terminal';
  if (n === 'read' || n === 'notebookread') return 'file-text';
  if (n === 'edit' || n === 'write' || n === 'multiedit' || n === 'notebookedit' || n === 'patch' || n === 'apply_patch') return 'file-pen';
  if (n === 'grep' || n === 'glob' || n === 'list' || n === 'ls' || n === 'codesearch') return 'search';
  if (n === 'webfetch' || n === 'websearch' || n === 'web_search' || n === 'fetch') return 'globe';
  if (n === 'todowrite' || n === 'todoread') return 'list-checks';
  if (n.indexOf('.') > 0 || n.startsWith('mcp__')) return 'plug';
  return 'wrench';
}

function field(j: any, keys: string[]): string {
  for (const k of keys) {
    const v = j[k];
    if (v !== undefined && v !== null) return Array.isArray(v) ? (v as string[]).join(' ') : '' + v;
  }
  return '';
}

function lineCount(s: string): i32 { return s === '' ? 0 : s.split('\n').length; }

function firstLine(s: string): string { const nl = s.indexOf('\n'); return nl < 0 ? s : s.slice(0, nl); }

/** The tool's input as JSON, or null when it is not (yet) whole. */
function parsed(input: string): any {
  try { return JSON.parse(input); } catch (e) { return null; }
}

/** One line: what the call does. `input` is its JSON. */
export function summarize(name: string, input: string): string {
  const j = parsed(input);
  if (j === null || typeof j !== 'object') return '';
  const file = field(j, ['file_path', 'filePath', 'notebook_path', 'path']);
  const n = name.toLowerCase();
  if (isAgentTool(name)) return field(j, ['description', 'prompt']);
  if (n === 'edit' && j.old_string !== undefined) return `${file}  −${lineCount('' + j.old_string)} +${lineCount('' + j.new_string)}`;
  if (n === 'multiedit' && Array.isArray(j.edits)) return `${file}  ${j.edits.length} edits`;
  if (n === 'write' && j.content !== undefined) return `${file}  +${lineCount('' + j.content)} lines`;
  if (Array.isArray(j.changes)) {
    const parts: string[] = [];
    const k = j.changes.length as i32;
    for (let i = 0; i < k; i++) parts.push(`${'' + j.changes[i].kind} ${'' + j.changes[i].path}`);
    return parts.join(', ');
  }
  const cmd = field(j, ['command', 'cmd']);
  if (cmd !== '') return firstLine(cmd);
  const what = field(j, ['pattern', 'query', 'url']);
  if (file !== '' && what !== '') return `${what}  in ${file}`;
  if (file !== '' || what !== '') return file + what;
  const other = field(j, ['description', 'prompt', 'name']);
  return other !== '' ? firstLine(other) : head(JSON.stringify(j), 160);
}

function prefixed(s: string, mark: string): string[] {
  const lines = s.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length && i < DETAIL_LINES; i++) out.push(mark + lines[i]);
  if (lines.length > DETAIL_LINES) out.push(`${mark}… ${lines.length - DETAIL_LINES} more lines`);
  return out;
}

/** What an open card shows of the input: the command, the diff, the written text, or the JSON. */
export function detailOf(name: string, input: string): string {
  const j = parsed(input);
  if (j === null || typeof j !== 'object') return head(input, DETAIL_CAP);
  const n = name.toLowerCase();
  if (n === 'edit' && j.old_string !== undefined) {
    return head([...prefixed('' + j.old_string, '- '), ...prefixed('' + j.new_string, '+ ')].join('\n'), DETAIL_CAP);
  }
  if (n === 'write' && j.content !== undefined) return head(prefixed('' + j.content, '+ ').join('\n'), DETAIL_CAP);
  const cmd = field(j, ['command', 'cmd']);
  if (cmd !== '' && JSON.stringify(j).length < cmd.length + 160) return head('$ ' + cmd, DETAIL_CAP);   // a command and a short description
  if (isAgentTool(name) && j.prompt !== undefined) return head(`${field(j, ['subagent_type'])}\n\n${'' + j.prompt}`, DETAIL_CAP);
  return head(JSON.stringify(j), DETAIL_CAP);
}
