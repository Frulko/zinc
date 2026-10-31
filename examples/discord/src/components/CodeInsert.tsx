// The composer's code tab: the code button opens a real editor (zinc:editor's CodeEditor, the one of Atelier and zed-editor) above the
// message field, with a language choice, highlighting, selection, undo, copy and paste. Sending joins the message and the code as Discord
// Markdown: the text, then a fenced block with its language.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { clipboardText, setClipboardText } from 'zinc:gfx';
import { EditorState, CodeEditor, stepEditor, stepCursors, drawCursors, setText, langNamed, setTheme, theme, ONE_DARK, ONE_LIGHT } from 'zinc:editor';
import { store } from '../state';
import { BG_SIDE, BG_HOVER, BG_INPUT, TEXT_MAIN, TEXT_MUTED } from '../constants';
import { color, rounded, currentTheme } from '../theme';

/** The languages offered ('' a block without one): those Discord's highlighter knows that people paste most. */
export const LANGS: string[] = ['', 'ts', 'js', 'py', 'rust', 'c', 'cpp', 'cs', 'java', 'go', 'json', 'sh', 'sql', 'html', 'css', 'diff'];
const EDITOR_H = 160;

/** The editor wears the app's theme: Atelier's One Dark on a dark scheme, One Light on a light one (code blocks of messages too). */
export function syncCodeTheme(): void {
  const want = currentTheme().scheme === 'light' ? ONE_LIGHT : ONE_DARK;
  if (theme() !== want) setTheme(want);
}

/** The Discord Markdown of a code block: ```lang, the code, ```. */
export function fence(code: string, lang: string): string { return `\`\`\`${lang}\n${code.replace(/\n+$/, '')}\n\`\`\``; }

/** The draft with a fenced block of `lang` added at its end. */
export function withCodeBlock(draft: string, code: string, lang: string): string {
  const before = draft.trim() === '' ? '' : `${draft.trimEnd()}\n`;
  return before + fence(code, lang);
}

// the tab's state: open or not, the language and the editor (a new one when the language changes: its Doc is made for one language)
let isOpen = false, lang = '', ed: EditorState | null = null, picking = false;
const editor = (): EditorState => {
  if (ed === null) ed = new EditorState('', '', langNamed(lang));
  return ed as EditorState;
};
/** The code typed in the tab. */
export function codeText(): string { return ed === null ? '' : (ed as EditorState).doc.text; }
export function codeOpen(): boolean { return isOpen; }
/** Code and language set from outside (a test, "edit as code"). */
export function setCode(code: string, l: string): void { lang = l; ed = new EditorState('', code, langNamed(l)); isOpen = true; store.changed(); }

/** Sends the composer, with the tab's code as a fenced block after the message; the tab empties and closes when it went. */
export function sendWithCode(): void {
  const code = codeText();
  if (isOpen && code.trim() !== '') {
    store.typed(withCodeBlock(store.draft, code, lang));
    ed = null; isOpen = false; picking = false;
  }
  store.send();
}

/** Once per frame (main.tsx): the editor's own follow-up while the tab is open. */
export function stepCode(): void {
  if (!isOpen || ed === null) return;
  stepCursors(ed);
  stepEditor(ed, [], 0, -1);
}

function toggle(): void {
  isOpen = !isOpen; picking = false;
  store.changed();
  if (isOpen) setTimeout(() => { ui.focusNode(editor().node()); }, 0);
}
function choose(l: string): void {
  const text = codeText();
  lang = l; picking = false; ed = new EditorState('', text, langNamed(l));
  store.changed();
  setTimeout(() => { ui.focusNode(editor().node()); }, 0);
}
function paste(): void {
  const b = editor(), clip = clipboardText();
  if (clip === '') return;
  const at = ui.caretOf(b.node()), t = codeText(), c = at < 0 ? t.length : at;
  setText(b, t.slice(0, c) + clip + t.slice(c));
  ui.focusNode(b.node());
}

/** The code button of the composer. */
export function CodeInsert() {
  return <View className={`px-2 py-[12] ${isOpen ? 'opacity-100' : ''}`} aria-label={isOpen ? 'Close the code editor' : 'Write code'} onPress={toggle}>
    <Icon name="code" size={20} color={() => isOpen ? color('strong') : color('icon')} />
  </View>;
}

/** The editor above the message field: language, copy, paste and send, and the code itself. */
export function CodePanel() {
  if (!isOpen) return null;
  syncCodeTheme();
  const b = editor(), t = theme();
  const btn = `h-[28] px-2 flex-row items-center gap-1 rounded ${BG_HOVER}`;
  return <View className={`mb-2 ${rounded()} border border-[var(--dc-border)] ${BG_SIDE} overflow-hidden`}>
    <View className="h-[36] pl-3 pr-1 flex-row items-center gap-1">
      <View className={btn} aria-label="Code language" onPress={() => { picking = !picking; store.changed(); }}>
        <Text className={`text-sm font-mono ${TEXT_MAIN}`} numberOfLines={1}>{lang === '' ? 'plain' : lang}</Text>
        <Icon name="chevron-down" size={14} color={() => color('muted')} />
      </View>
      <View className="grow basis-0" />
      <View className={btn} aria-label="Paste into the code" onPress={paste}><Icon name="clipboard" size={14} color={() => color('muted')} /></View>
      <View className={btn} aria-label="Copy the code" onPress={() => setClipboardText(codeText())}><Icon name="copy" size={14} color={() => color('muted')} /></View>
      <View className={`h-[28] px-2 flex-row items-center gap-1 rounded bg-[var(--dc-accent)]`} aria-label="Send with the code" onPress={() => sendWithCode()}>
        <Icon name="arrow-right" size={14} color={() => 0xffffff} /><Text className="text-sm font-semibold text-white">Send</Text>
      </View>
      <View className={btn} aria-label="Close the code editor" onPress={toggle}><Icon name="x" size={14} color={() => color('muted')} /></View>
    </View>
    <View className={`relative h-[${EDITOR_H}] overflow-hidden`}>
      <CodeEditor state={b} visible={() => true}
        onKey={(e: ui.KeyEvent): boolean => { if (e.key === 'Enter' && e.primary) { sendWithCode(); return true; } return false; }}
        onEscape={toggle} />
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawCursors(b, x, y, w, h)} />
    </View>
    {picking ? <View className={`absolute left-2 right-2 top-[38] p-2 flex-row flex-wrap gap-1 ${rounded()} border border-[var(--dc-border)] ${BG_INPUT}`}>
      {LANGS.map((l: string) => <View key={l} className={`px-2 py-1 rounded ${l === lang ? 'bg-[var(--dc-selected)]' : BG_HOVER}`} aria-label={`Code language ${l === '' ? 'plain' : l}`} onPress={() => choose(l)}>
        <Text className={`text-sm font-mono ${TEXT_MAIN}`}>{l === '' ? 'plain' : l}</Text>
      </View>)}
    </View> : null}
  </View>;
}
