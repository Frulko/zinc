// A code block of a message: its language, a copy button and its text highlighted by zinc:editor's read-only CodeView. Long blocks are
// folded by default (their first lines and a "Show code" row) and unfold with an eased height. The one place a code block is drawn.
import { useState } from 'zinc:ui/react';
import { Icon } from 'zinc:icons';
import { CodeView } from 'zinc:editor';
import { setClipboardText } from 'zinc:gfx';
import { BG_SIDE, BG_HOVER, TEXT_MAIN, TEXT_MUTED } from '../constants';
import { color, rounded } from '../theme';
import { syncCodeTheme } from './CodeInsert';

const COPIED_MS = 1500;
/** Blocks of more lines than FOLD_OVER are folded to FOLD_LINES; CodeView's text is 18 px lines with 8 px under them. */
export const FOLD_OVER = 6;
export const FOLD_LINES = 4;
const LINE = 18, PAD = 8;

/** The lines of a block's text (a last newline is not one). */
export const lineCount = (code: string): i32 => (code.endsWith('\n') ? code.slice(0, code.length - 1) : code).split('\n').length;

export function CodeBlock(p: { code: string; lang: string }) {
  const [copied, setCopied] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  syncCodeTheme();
  const n = lineCount(p.code), foldable = n > FOLD_OVER, folded = foldable && !open;
  const copy = (): void => { setClipboardText(p.code); setCopied(true); setTimeout(() => { setCopied(false); }, COPIED_MS); };
  return <View className={`my-1 max-w-full ${rounded()} border border-[var(--dc-border)] ${BG_SIDE} overflow-hidden`}>
    <View className="h-[28] pl-3 pr-1 flex-row items-center gap-1">
      <Text className={`grow basis-0 text-[11px] ${TEXT_MUTED}`} numberOfLines={1}>{p.lang === '' ? 'plain text' : p.lang}</Text>
      <View className={`h-[22] px-1.5 flex-row items-center gap-1 rounded ${BG_HOVER}`} aria-label="Copy code" onPress={copy}>
        <Icon name={copied ? 'check' : 'copy'} size={12} color={() => color('muted')} />
        <Text className={`text-[11px] ${TEXT_MUTED}`}>{copied ? 'Copied' : 'Copy'}</Text>
      </View>
    </View>
    <View className={`overflow-hidden transition-all duration-200 h-[${folded ? FOLD_LINES * LINE : n * LINE + PAD}]`}>
      <CodeView code={p.code} lang={p.lang} className={`px-3 pb-2 text-[13px] leading-[18] ${TEXT_MAIN}`} />
    </View>
    {foldable ? <View className={`h-[28] px-3 flex-row items-center gap-1 border-t border-[var(--dc-border)] ${BG_HOVER}`} aria-label={open ? 'Hide code' : 'Show code'} onPress={() => setOpen(!open)}>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={() => color('muted')} />
      <Text className={`text-xs ${TEXT_MUTED}`}>{open ? 'Hide code' : `Show code (${n - FOLD_LINES} more lines)`}</Text>
    </View> : null}
  </View>;
}
