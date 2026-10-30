// The composer's code button: a language chosen in its menu inserts a fenced code block (```lang) at the end of the message, the caret
// on its empty line, ready to paste or type.
import { useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { store } from '../state';
import { BG_SIDE, BG_HOVER, TEXT_MAIN } from '../constants';
import { color, rounded } from '../theme';

/** The languages offered ('' a block without one): those Discord's highlighter knows that people paste most. */
export const LANGS: string[] = ['', 'ts', 'js', 'py', 'rust', 'c', 'cpp', 'cs', 'java', 'go', 'json', 'sh', 'sql', 'html', 'css', 'diff'];

/** The draft with a fenced block of `lang` added, and where the caret goes (its empty line). */
export function withCodeBlock(draft: string, lang: string): string[] {
  const before = draft === '' || draft.endsWith('\n') ? draft : `${draft}\n`;
  const text = `${before}\`\`\`${lang}\n\n\`\`\``;
  return [text, `${before.length + 4 + lang.length}`];
}

export function CodeInsert(p: { field: () => i32 }) {
  const [open, setOpen] = useState<boolean>(false);
  const insert = (lang: string): void => {
    const r = withCodeBlock(store.draft, lang), at = parseInt(r[1]);
    setOpen(false);
    store.typed(r[0]);
    store.changed();
    const f = p.field();
    if (f >= 0) setTimeout(() => { ui.focusNode(f); ui.domSelect(f, at, at); }, 0);   // after the field shows the new text
  };
  return <View>
    <View className="px-2 py-[12]" aria-label="Insert a code block" onPress={() => setOpen(!open)}>
      <Icon name="code" size={20} color={() => open ? color('strong') : color('icon')} />
    </View>
    {open ? <View className={`absolute bottom-[46] left-0 w-[260] p-2 flex-row flex-wrap gap-1 ${rounded()} border border-[var(--dc-border)] ${BG_SIDE}`}>
      {LANGS.map((l: string) => <View key={l} className={`px-2 py-1 rounded ${BG_HOVER}`} aria-label={`Code block ${l === '' ? 'plain' : l}`} onPress={() => insert(l)}>
        <Text className={`text-sm font-mono ${TEXT_MAIN}`}>{l === '' ? 'plain' : l}</Text>
      </View>)}
    </View> : null}
  </View>;
}
